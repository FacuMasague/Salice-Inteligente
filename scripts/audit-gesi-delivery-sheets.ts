import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { logisticsQueryFrom } from '../server/gesi/capture-window.js';
import { GesiClient } from '../server/gesi/client.js';
import { deliverySheetEndsAt, deliverySheetStartsAt } from '../server/gesi/delivery-sheet-capture.js';
import type { GesiRow } from '../server/gesi/types.js';

const required = ['GESI_BASE_URL', 'GESI_USERNAME', 'GESI_PASSWORD', 'GESI_EMPRESA_ID', 'GESI_SUCURSAL_ID'] as const;
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Faltan variables de acceso requeridas: ${missing.join(', ')}`);
if (Number(process.env.GESI_EMPRESA_ID) !== 3 || Number(process.env.GESI_SUCURSAL_ID) !== 3) {
  throw new Error('La auditoría de fojas sólo admite empresa 3 / sucursal 3.');
}

const yearAgo = new Date();
yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
const from = process.argv.find((argument) => /^\d{4}-\d{2}-\d{2}$/.test(argument)) ?? yearAgo.toISOString().slice(0, 10);
const queryFrom = logisticsQueryFrom(`${from}T00:00:00.000Z`).slice(0, 10);
const client = new GesiClient({
  baseUrl: process.env.GESI_BASE_URL!,
  username: process.env.GESI_USERNAME!,
  password: process.env.GESI_PASSWORD!,
  empresaId: process.env.GESI_EMPRESA_ID,
  sucursalId: process.env.GESI_SUCURSAL_ID,
});

const normalizeDate = (row: GesiRow) => String(row.desde ?? row.fecha ?? '').slice(0, 10);
const monthCounts = (rows: GesiRow[]) => rows.reduce<Record<string, number>>((result, row) => {
  const month = normalizeDate(row).slice(0, 7) || 'sin-fecha';
  result[month] = (result[month] ?? 0) + 1;
  return result;
}, {});

async function activeSnapshotLogistics() {
  const root = process.cwd();
  const active = JSON.parse(await readFile(resolve(root, 'data/active-bundle.json'), 'utf8')) as {
    artifacts?: { snapshot?: { path?: string } };
  };
  const snapshotPath = active.artifacts?.snapshot?.path;
  if (!snapshotPath) return null;
  const snapshot = JSON.parse(await readFile(resolve(root, snapshotPath), 'utf8')) as {
    logistics?: { coverageFrom?: string; sheets?: Array<{ id: number }> };
  };
  return snapshot.logistics ?? null;
}

async function main() {
  await client.login();
  const fetchedRows = await client.getStrictAll<GesiRow>(
    `/api/Ventas/Repartos/GetList?fechaDesde=${encodeURIComponent(queryFrom)}`,
    'fojasReparto',
    1000,
  );
  const rows = fetchedRows.filter((row) => deliverySheetEndsAt(row) >= from);
  const activeLogistics = await activeSnapshotLogistics();
  if (!activeLogistics) throw new Error('El paquete activo no contiene un snapshot logístico auditable.');
  const activeIds = new Set((activeLogistics?.sheets ?? []).map((sheet) => sheet.id));
  const allFetchedIds = fetchedRows.map((row) => Number(row.fojaID));
  const allSourceIds = rows.map((row) => Number(row.fojaID));
  const sourceIds = allSourceIds.filter((id) => Number.isInteger(id) && id > 0);
  const sourceIdSet = new Set(sourceIds);
  const validFetchedIds = allFetchedIds.filter((id) => Number.isInteger(id) && id > 0);
  const duplicateSourceIds = [...new Set(validFetchedIds.filter((id, index) => validFetchedIds.indexOf(id) !== index))].sort((a, b) => b - a);
  const invalidSourceIds = allFetchedIds.filter((id) => !Number.isInteger(id) || id <= 0);
  const foreignSourceIds = fetchedRows.filter((row) => Number(row.empresaID) !== 3).map((row) => Number(row.fojaID));
  const dates = rows.map(normalizeDate).filter(Boolean).sort();
  const missingFromActive = [...sourceIdSet].filter((id) => !activeIds.has(id)).sort((a, b) => b - a);
  const unexpectedInActive = [...activeIds].filter((id) => !sourceIdSet.has(id)).sort((a, b) => b - a);
  const coverageFrom = activeLogistics?.coverageFrom?.slice(0, 10) ?? null;
  const sourceWithinActiveCoverage = coverageFrom
    ? rows.filter((row) => deliverySheetEndsAt(row) >= coverageFrom)
    : [];
  const missingWithinActiveCoverage = sourceWithinActiveCoverage
    .map((row) => Number(row.fojaID))
    .filter((id) => Number.isFinite(id) && id > 0 && !activeIds.has(id))
    .sort((a, b) => b - a);

  console.log(JSON.stringify({
    requestedFrom: from,
    queriedFrom: queryFrom,
    source: {
      fetchedHeaders: fetchedRows.length,
      sheets: rows.length,
      uniqueSheets: sourceIdSet.size,
      duplicateIds: duplicateSourceIds,
      invalidIdCount: invalidSourceIds.length,
      foreignCompanyIds: foreignSourceIds,
      firstDate: dates[0] ?? null,
      lastDate: dates.at(-1) ?? null,
      crossingCutCount: rows.filter((row) => deliverySheetStartsAt(row) < from).length,
      oldestCrossingStart: rows.filter((row) => deliverySheetStartsAt(row) < from).map(deliverySheetStartsAt).filter(Boolean).sort()[0] ?? null,
      byMonth: monthCounts(rows),
    },
    activeSnapshot: {
      sheets: activeIds.size,
      missingFromActiveCount: missingFromActive.length,
      missingFromActiveIdsSample: missingFromActive.slice(0, 20),
      unexpectedInActiveCount: unexpectedInActive.length,
      unexpectedInActiveIdsSample: unexpectedInActive.slice(0, 20),
      coverageFrom,
      sourceSheetsWithinCoverage: sourceWithinActiveCoverage.length,
      missingWithinCoverageCount: missingWithinActiveCoverage.length,
      missingWithinCoverageIdsSample: missingWithinActiveCoverage.slice(0, 20),
    },
  }, null, 2));
  if (duplicateSourceIds.length || invalidSourceIds.length || foreignSourceIds.length) {
    process.exitCode = 1;
  }
}

void main();
