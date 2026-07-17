import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GesiClient } from '../server/gesi/client.js';
import type { GesiRawCapture, GesiRow } from '../server/gesi/types.js';

const capture = JSON.parse(await readFile(resolve(process.cwd(), 'data/raw/gesi-salice-latest.json'), 'utf8')) as GesiRawCapture;
const asOf = new Date(capture.captureMeta.capturedAt);
const daysAgo = (days: number) => {
  const value = new Date(asOf);
  value.setUTCDate(value.getUTCDate() - days);
  return value;
};
const state = (row: GesiRow) => Number(row.estadoID);
const clientID = (row: GesiRow) => Number(row.clienteID);
const updatedAt = (row: GesiRow) => new Date(String(row.ultimaActualizacion ?? ''));
const stateCounts = (rows: GesiRow[]) => Object.fromEntries(
  [...new Set(rows.map(state))].sort().map((value) => [value, rows.filter((row) => state(row) === value).length]),
);

const lastInvoiceByClient = new Map<number, Date>();
for (const invoice of capture.invoices) {
  const id = clientID(invoice);
  const issuedAt = new Date(String(invoice.fechaDeEmision));
  const current = lastInvoiceByClient.get(id);
  if (!current || issuedAt > current) lastInvoiceByClient.set(id, issuedAt);
}

const profile = (status: number) => {
  const clients = capture.clients.filter((row) => state(row) === status);
  const withInvoiceSince = (days: number) => clients.filter((row) => {
    const lastInvoice = lastInvoiceByClient.get(clientID(row));
    return lastInvoice && lastInvoice >= daysAgo(days);
  }).length;
  return {
    clients: clients.length,
    invoices30d: withInvoiceSince(30),
    invoices90d: withInvoiceSince(90),
    invoices365d: withInvoiceSince(365),
    updated30d: clients.filter((row) => updatedAt(row) >= daysAgo(30)).length,
    updated90d: clients.filter((row) => updatedAt(row) >= daysAgo(90)).length,
    invoiceAfterLastMasterUpdate: clients.filter((row) => {
      const lastInvoice = lastInvoiceByClient.get(clientID(row));
      return lastInvoice && lastInvoice > updatedAt(row);
    }).length,
  };
};

const unknownStates = capture.clients.filter((row) => ![1, 2, 3].includes(state(row))).length;
const missingUpdateTimestamps = capture.clients.filter((row) => !String(row.ultimaActualizacion ?? '')).length;
const inactiveRows = capture.clients.filter((row) => state(row) !== 1);
const inactiveInvoiceAfterUpdate = inactiveRows.filter((row) => {
  const lastInvoice = lastInvoiceByClient.get(clientID(row));
  return lastInvoice && lastInvoice > updatedAt(row);
}).length;

let liveComparison: Record<string, unknown> | undefined;
if (process.argv.includes('--live')) {
  const required = ['GESI_BASE_URL', 'GESI_USERNAME', 'GESI_PASSWORD', 'GESI_EMPRESA_ID', 'GESI_SUCURSAL_ID'] as const;
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Faltan variables GESI: ${missing.join(', ')}`);
  const api = new GesiClient({
    baseUrl: process.env.GESI_BASE_URL!,
    username: process.env.GESI_USERNAME!,
    password: process.env.GESI_PASSWORD!,
    empresaId: process.env.GESI_EMPRESA_ID,
    sucursalId: process.env.GESI_SUCURSAL_ID,
  });
  await api.login();
  const live = await api.getAll<GesiRow>('/api/Maestros/Clientes/GetList?sucursales=S&contactos=N&definicionesSucursal=S', 'clientes');
  const capturedByID = new Map(capture.clients.map((row) => [clientID(row), row]));
  const liveIDs = new Set(live.map(clientID));
  const shared = live.filter((row) => capturedByID.has(clientID(row)));
  liveComparison = {
    rows: live.length,
    states: stateCounts(live),
    newClients: live.filter((row) => !capturedByID.has(clientID(row))).length,
    missingClients: capture.clients.filter((row) => !liveIDs.has(clientID(row))).length,
    stateChanges: shared.filter((row) => state(row) !== state(capturedByID.get(clientID(row))!)).length,
    timestampChanges: shared.filter((row) => String(row.ultimaActualizacion ?? '') !== String(capturedByID.get(clientID(row))!.ultimaActualizacion ?? '')).length,
    updatedAfterCapture: live.filter((row) => updatedAt(row) > asOf).length,
  };
}

const issues: string[] = [];
if (unknownStates) issues.push(`${unknownStates} clientes tienen un estado fuera de 1/2/3`);
if (missingUpdateTimestamps) issues.push(`${missingUpdateTimestamps} clientes no tienen ultimaActualizacion`);
if (inactiveInvoiceAfterUpdate) issues.push(`${inactiveInvoiceAfterUpdate} inactivos facturaron después de su última actualización de maestro`);

console.log(JSON.stringify({
  capturedAt: capture.captureMeta.capturedAt,
  grain: 'un registro por clienteID',
  interpretation: { active: 'estadoID = 1', inactive: 'estadoID = 2 o 3' },
  capturedStates: stateCounts(capture.clients),
  profile: { active: profile(1), inactiveState2: profile(2), inactiveState3: profile(3) },
  liveComparison,
  decision: {
    reliableForOperationalVisibility: issues.length === 0,
    evidence: 'El estado tiene dominio estable, fecha de actualización completa y no hay ventas posteriores a la actualización de un cliente inactivo.',
  },
  issues,
}, null, 2));

if (issues.length) process.exitCode = 1;
