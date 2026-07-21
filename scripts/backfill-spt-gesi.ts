import 'dotenv/config';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GesiClient } from '../server/gesi/client.js';
import type { GesiRawCapture, GesiRow } from '../server/gesi/types.js';

const required = ['GESI_BASE_URL', 'GESI_USERNAME', 'GESI_PASSWORD', 'GESI_EMPRESA_ID', 'GESI_SUCURSAL_ID'] as const;
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Faltan variables GESI: ${missing.join(', ')}`);

const empresaID = Number(process.env.GESI_EMPRESA_ID);
const sucursalID = Number(process.env.GESI_SUCURSAL_ID);
if (empresaID !== 3 || sucursalID !== 3) {
  throw new Error('El backfill SPT sólo admite Salice empresa 3 / sucursal 3.');
}

const from = process.env.GESI_SPT_BACKFILL_FROM ?? '2025-01-01';
const until = process.env.GESI_SPT_BACKFILL_UNTIL ?? '2025-12-31';
const rawPath = resolve(process.cwd(), 'data/raw/gesi-salice-latest.json');
const checkpointPath = resolve(process.cwd(), `data/raw/spt-backfill-${from}-${until}.json`);

type BackfillCheckpoint = {
  from: string;
  until: string;
  completedMonths: string[];
  invoices: GesiRow[];
  creditNotes: GesiRow[];
  skippedDocuments: string[];
};

const client = new GesiClient({
  baseUrl: process.env.GESI_BASE_URL!,
  username: process.env.GESI_USERNAME!,
  password: process.env.GESI_PASSWORD!,
  empresaId: String(empresaID),
  sucursalId: String(sucursalID),
});

const documentKey = (row: GesiRow) => ({
  empresaID: Number(row.empresaID),
  comprobanteID: Number(row.comprobanteID),
  serie: String(row.serie ?? ''),
  puntoDeVentaID: Number(row.puntoDeVentaID),
  numero: Number(row.numero),
});
const documentIdentity = (row: GesiRow) => [
  Number(row.empresaID), Number(row.comprobanteID), String(row.serie ?? ''),
  Number(row.puntoDeVentaID), Number(row.numero),
].join(':');
const itemCount = (row: GesiRow) => Array.isArray(row.detalleItems) ? row.detalleItems.length : 0;
const mergeDocuments = (...collections: GesiRow[][]) => {
  const merged = new Map<string, GesiRow>();
  for (const row of collections.flat()) {
    const key = documentIdentity(row);
    const current = merged.get(key);
    if (!current || itemCount(row) > itemCount(current)) merged.set(key, row);
  }
  return [...merged.values()].sort((left, right) =>
    String(left.fechaDeEmision ?? '').localeCompare(String(right.fechaDeEmision ?? ''))
    || documentIdentity(left).localeCompare(documentIdentity(right)));
};
const chunks = <T>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const monthWindows = (start: string, end: string) => {
  const windows: { key: string; from: string; until: string }[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const limit = new Date(`${end}T23:59:59.999Z`);
  while (cursor <= limit) {
    const monthStart = new Date(cursor);
    const nextMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
    const monthEnd = new Date(Math.min(limit.getTime(), nextMonth.getTime() - 1));
    windows.push({
      key: monthStart.toISOString().slice(0, 7),
      from: monthStart.toISOString(),
      until: monthEnd.toISOString(),
    });
    cursor.setTime(nextMonth.getTime());
  }
  return windows;
};

const checkpoint = await readFile(checkpointPath, 'utf8')
  .then((contents) => JSON.parse(contents) as BackfillCheckpoint)
  .catch((): BackfillCheckpoint => ({
    from, until, completedMonths: [], invoices: [], creditNotes: [], skippedDocuments: [],
  }));
if (checkpoint.from !== from || checkpoint.until !== until) {
  throw new Error(`El checkpoint existente corresponde a ${checkpoint.from}–${checkpoint.until}.`);
}

const saveCheckpoint = async () => {
  await mkdir(resolve(process.cwd(), 'data/raw'), { recursive: true });
  const temporary = `${checkpointPath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(checkpoint)}\n`, 'utf8');
  await rename(temporary, checkpointPath);
};

async function fetchDetails(label: string, path: string, headers: GesiRow[]) {
  const selected = [...new Map(headers.map((row) => [documentIdentity(row), row])).values()];
  const detailed: GesiRow[] = [];
  let completed = 0;

  const fetchBatch = async (batch: GesiRow[], rateLimitRetries = 0): Promise<GesiRow[]> => {
    try {
      const payload = await client.request<GesiRow>(`${path}&pageNumber=1&pageSize=${batch.length}`, {
        method: 'POST',
        headers: { Connection: 'close' },
        body: JSON.stringify(batch.map(documentKey)),
      });
      const returned = Array.isArray(payload.comprobantes) ? payload.comprobantes as GesiRow[] : [];
      const returnedKeys = new Set(returned.map(documentIdentity));
      const omitted = batch.filter((row) => !returnedKeys.has(documentIdentity(row)));
      if (!omitted.length) return returned;
      if (omitted.length < batch.length) return [...returned, ...await fetchBatch(omitted)];
      if (batch.length === 1) {
        checkpoint.skippedDocuments.push(`${label}:${documentIdentity(batch[0])}`);
        return [];
      }
      const middle = Math.ceil(batch.length / 2);
      return [...await fetchBatch(batch.slice(0, middle)), ...await fetchBatch(batch.slice(middle))];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/HTTP 429|TimeoutError|timeout/i.test(message) && rateLimitRetries < 8) {
        const delay = Math.min(60_000, 5_000 * (rateLimitRetries + 1));
        console.warn(`${label}: GESI ocupado; reintento en ${Math.round(delay / 1000)} s`);
        await wait(delay);
        await client.login();
        return fetchBatch(batch, rateLimitRetries + 1);
      }
      if (batch.length === 1) {
        checkpoint.skippedDocuments.push(`${label}:${documentIdentity(batch[0])}`);
        return [];
      }
      const middle = Math.ceil(batch.length / 2);
      return [...await fetchBatch(batch.slice(0, middle)), ...await fetchBatch(batch.slice(middle))];
    }
  };

  const batches = chunks(selected, 200);
  for (const batch of batches) {
    detailed.push(...await fetchBatch(batch));
    completed += batch.length;
    console.log(`${label}: ${Math.min(completed, selected.length)}/${selected.length} comprobantes`);
    await client.login();
    await wait(750);
  }
  return mergeDocuments(detailed);
}

console.log(`Backfill SPT Salice ${from}–${until}: autenticando…`);
await client.login();

for (const window of monthWindows(from, until)) {
  if (checkpoint.completedMonths.includes(window.key)) {
    console.log(`${window.key}: ya completado, se reutiliza el checkpoint`);
    continue;
  }
  console.log(`${window.key}: descargando cabeceras…`);
  const body = {
    datosOperacion: {
      fechaDesde: window.from,
      fechaHasta: window.until,
      sucursalID,
      estadoAnulado: 'N',
    },
    datosCliente: {},
  };
  const invoiceHeaders = await client.postAll<GesiRow>(
    '/api/Ventas/Comprobantes/Facturas/GetList', 'comprobantes', body, 1000,
  );
  const creditNoteHeaders = await client.postAll<GesiRow>(
    '/api/Ventas/Comprobantes/NotasDeCredito/GetList', 'comprobantes', body, 1000,
  );
  console.log(`${window.key}: ${invoiceHeaders.length} facturas y ${creditNoteHeaders.length} notas de crédito`);

  await client.login();
  const invoices = await fetchDetails(
    `${window.key} facturas`,
    '/api/Ventas/Comprobantes/Facturas/GetItem?incluirDetalleDeVenta=S',
    invoiceHeaders,
  );
  await client.login();
  const creditNotes = await fetchDetails(
    `${window.key} notas de crédito`,
    '/api/Ventas/Comprobantes/NotasDeCredito/GetItem?incluirDetalleDeVenta=S',
    creditNoteHeaders,
  );

  checkpoint.invoices = mergeDocuments(checkpoint.invoices, invoices);
  checkpoint.creditNotes = mergeDocuments(checkpoint.creditNotes, creditNotes);
  checkpoint.completedMonths.push(window.key);
  checkpoint.completedMonths.sort();
  checkpoint.skippedDocuments = [...new Set(checkpoint.skippedDocuments)].sort();
  await saveCheckpoint();
  console.log(`${window.key}: checkpoint guardado`);
}

const raw = JSON.parse(await readFile(rawPath, 'utf8')) as GesiRawCapture;
raw.sptInvoices = mergeDocuments(raw.sptInvoices ?? raw.invoices ?? [], checkpoint.invoices);
raw.sptCreditNotes = mergeDocuments(raw.sptCreditNotes ?? raw.creditNotes ?? [], checkpoint.creditNotes);
raw.captureMeta.salesHistoryFrom = [raw.captureMeta.salesHistoryFrom, from].filter(Boolean).sort()[0];
raw.captureMeta.sptSalesDetailFrom = [raw.captureMeta.sptSalesDetailFrom, from].filter(Boolean).sort()[0];
if (checkpoint.skippedDocuments.length) {
  raw.captureMeta.optionalEndpointWarnings = [
    ...raw.captureMeta.optionalEndpointWarnings.filter((warning) => !warning.startsWith('Backfill SPT:')),
    `Backfill SPT: GESI rechazó ${checkpoint.skippedDocuments.length} comprobante(s) individual(es).`,
  ];
}

const rawTemporary = `${rawPath}.tmp`;
await writeFile(rawTemporary, `${JSON.stringify(raw)}\n`, 'utf8');
await rename(rawTemporary, rawPath);

console.log('Backfill SPT consolidado en la captura operativa.');
console.log(JSON.stringify({
  from,
  until,
  completedMonths: checkpoint.completedMonths.length,
  detailedInvoices: checkpoint.invoices.length,
  detailedCreditNotes: checkpoint.creditNotes.length,
  skippedDocuments: checkpoint.skippedDocuments.length,
  totalSptInvoices: raw.sptInvoices.length,
  totalSptCreditNotes: raw.sptCreditNotes.length,
}, null, 2));
