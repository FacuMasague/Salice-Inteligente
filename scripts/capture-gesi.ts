import 'dotenv/config';
import { once } from 'node:events';
import { createReadStream, createWriteStream, type WriteStream } from 'node:fs';
import { access, mkdir, readFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/pick.js';
import { streamArray } from 'stream-json/streamers/stream-array.js';
import { streamValues } from 'stream-json/streamers/stream-values.js';
import { GesiClient } from '../server/gesi/client.js';
import type { GesiRawCapture, GesiRow } from '../server/gesi/types.js';

const required = ['GESI_BASE_URL', 'GESI_USERNAME', 'GESI_PASSWORD', 'GESI_EMPRESA_ID', 'GESI_SUCURSAL_ID'] as const;
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Faltan variables GESI: ${missing.join(', ')}`);

const rawDirectory = resolve(process.cwd(), 'data/raw');
const target = resolve(rawDirectory, 'gesi-salice-latest.json');
const reuseCatalog = process.argv.includes('--reuse-catalog');
const shouldReadExistingCapture = reuseCatalog || !process.env.GESI_SPT_HISTORY_FROM;
const hasExistingCapture = await access(target).then(() => true).catch(() => false);

async function readExistingCaptureValue<T>(key: string): Promise<T | null> {
  const output = createReadStream(target)
    .pipe(parser.asStream())
    .pipe(pick.asStream({ filter: key }))
    .pipe(streamValues.asStream());
  let result: T | null = null;
  for await (const item of output as AsyncIterable<{ value: T }>) result = item.value;
  return result;
}

async function forEachExistingCaptureRow(key: string, handler: (row: GesiRow) => void | Promise<void>) {
  const output = createReadStream(target)
    .pipe(parser.asStream())
    .pipe(pick.asStream({ filter: key }))
    .pipe(streamArray.asStream());
  for await (const item of output as AsyncIterable<{ value: GesiRow }>) await handler(item.value);
}

const existingCaptureMeta = shouldReadExistingCapture && hasExistingCapture
  ? await readExistingCaptureValue<GesiRawCapture['captureMeta']>('captureMeta').catch(() => null)
  : null;
const previousCapture = reuseCatalog && hasExistingCapture
  ? await readFile(target, 'utf8').then((contents) => JSON.parse(contents) as GesiRawCapture).catch(() => null)
  : null;

const empresaID = Number(process.env.GESI_EMPRESA_ID);
const sucursalID = Number(process.env.GESI_SUCURSAL_ID);
const almacenPrincipalID = 2;
if (empresaID !== 3 || sucursalID !== 3) {
  throw new Error('Esta v0.2.1 es exclusiva de Salice: requiere empresaID=3 y sucursalID=3.');
}

const client = new GesiClient({
  baseUrl: process.env.GESI_BASE_URL!,
  username: process.env.GESI_USERNAME!,
  password: process.env.GESI_PASSWORD!,
  empresaId: String(empresaID),
  sucursalId: String(sucursalID),
});

const capturedAt = new Date();
const isoDaysAgo = (days: number) => {
  const value = new Date(capturedAt);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString();
};
const historyFrom = process.env.GESI_HISTORY_FROM ?? isoDaysAgo(365);
const salesHistoryFrom = process.env.GESI_SPT_HISTORY_FROM ?? historyFrom;
const salesDetailFrom = process.env.GESI_SALES_DETAIL_FROM ?? isoDaysAgo(180);
const sptSalesDetailFrom = process.env.GESI_SPT_DETAIL_FROM ?? salesHistoryFrom;
const logisticsFrom = process.env.GESI_LOGISTICS_FROM ?? isoDaysAgo(45);
const historyUntil = capturedAt.toISOString();

const listBody = (from: string) => ({
  datosOperacion: {
    fechaDesde: from,
    fechaHasta: historyUntil,
    sucursalID,
    estadoAnulado: 'N',
  },
  datosCliente: {},
});

const documentKey = (row: GesiRow) => ({
  empresaID: Number(row.empresaID),
  comprobanteID: Number(row.comprobanteID),
  serie: String(row.serie ?? ''),
  puntoDeVentaID: Number(row.puntoDeVentaID),
  numero: Number(row.numero),
});
const documentIdentity = (row: GesiRow) => [
  Number(row.empresaID),
  Number(row.comprobanteID),
  String(row.serie ?? ''),
  Number(row.puntoDeVentaID),
  Number(row.numero),
].join(':');
const optionalEndpointWarnings: string[] = [];

function uniqueInventoryRows(rows: GesiRow[]) {
  const byProduct = new Map<string, GesiRow>();
  let duplicateRows = 0;
  let invalidRows = 0;
  for (const row of rows) {
    const id = String(row.productoID ?? '').trim();
    if (!id) { invalidRows += 1; continue; }
    if (byProduct.has(id)) duplicateRows += 1;
    else byProduct.set(id, row);
  }
  return { rows: [...byProduct.values()], duplicateRows, invalidRows };
}

const chunks = <T>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};

async function fetchDocumentDetails(
  label: string,
  path: string,
  rows: GesiRow[],
  shouldInclude: (row: GesiRow) => boolean,
  batchSize = 1000,
  concurrency = 1,
  interBatchDelayMs = 2_000,
  renewSessionBetweenBatches = true,
) {
  const selected = [...new Map(rows.filter(shouldInclude).map((row) => [documentIdentity(row), row])).values()];
  const batches = chunks(selected, batchSize);
  const detailed: GesiRow[] = [];
  const omittedForRecovery: GesiRow[] = [];
  let skipped = 0;

  const fetchBatch = async (batch: GesiRow[], recoverOmissions = false): Promise<GesiRow[]> => {
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
      if (!recoverOmissions) {
        omittedForRecovery.push(...omitted);
        return returned;
      }
      if (omitted.length < batch.length) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        return [...returned, ...await fetchBatch(omitted, true)];
      }
      if (batch.length === 1) {
        skipped += 1;
        return [];
      }
      const middle = Math.ceil(batch.length / 2);
      return [...await fetchBatch(batch.slice(0, middle), true), ...await fetchBatch(batch.slice(middle), true)];
    } catch (error) {
      if (error instanceof Error && /HTTP 429/.test(error.message)) {
        await new Promise((resolve) => setTimeout(resolve, 60_000));
        return fetchBatch(batch, recoverOmissions);
      }
      if (batch.length === 1) {
        skipped += 1;
        return [];
      }
      const middle = Math.ceil(batch.length / 2);
      const left = await fetchBatch(batch.slice(0, middle), recoverOmissions);
      const right = await fetchBatch(batch.slice(middle), recoverOmissions);
      return [...left, ...right];
    }
  };

  let nextBatch = 0;
  let completedBatches = 0;
  const worker = async () => {
    while (nextBatch < batches.length) {
      const index = nextBatch;
      nextBatch += 1;
      const items = await fetchBatch(batches[index]);
      detailed.push(...items);
      completedBatches += 1;
      console.log(`${label}: ${completedBatches}/${batches.length} lotes (${detailed.length}/${selected.length})`);
      if (nextBatch < batches.length) {
        if (renewSessionBetweenBatches) await client.login();
        if (interBatchDelayMs) await new Promise((resolve) => setTimeout(resolve, interBatchDelayMs));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));
  const recoveryRows = [...new Map(omittedForRecovery.map((row) => [documentIdentity(row), row])).values()];
  if (recoveryRows.length) {
    console.log(`${label}: recuperando ${recoveryRows.length} comprobante(s) omitido(s) por la respuesta paginada`);
    const recoveryBatches = chunks(recoveryRows, batchSize);
    for (let index = 0; index < recoveryBatches.length; index += 1) {
      detailed.push(...await fetchBatch(recoveryBatches[index], true));
      console.log(`${label}: recuperación ${index + 1}/${recoveryBatches.length} (${detailed.length}/${selected.length})`);
      if (index + 1 < recoveryBatches.length) {
        if (renewSessionBetweenBatches) await client.login();
        await new Promise((resolve) => setTimeout(resolve, interBatchDelayMs));
      }
    }
  }
  if (skipped) optionalEndpointWarnings.push(`${label}: GESI rechazó ${skipped} comprobante(s) individual(es).`);
  return detailed;
}

async function fetchPrices(productIDs: string[]) {
  const batches = chunks(productIDs, 100);
  const prices: GesiRow[] = [];
  for (let index = 0; index < batches.length; index += 1) {
    const codes = encodeURIComponent(batches[index].join(','));
    const rows = await client.getAll<GesiRow>(`/api/Maestros/Productos/GetPrecios?codigos=${codes}`, 'precios', 1000);
    prices.push(...rows);
    console.log(`Precios: lote ${index + 1}/${batches.length} (${prices.length} definiciones)`);
  }
  return prices;
}

console.log('GESI Salice: autenticando…');
await client.login();

console.log('GESI Salice: descargando maestros y movimientos…');
const safeMaster = async (path: string, key: string, warning: string) => {
  try {
    return await client.getAll<GesiRow>(path, key);
  } catch (error) {
    optionalEndpointWarnings.push(`${warning}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
};
const tracked = async (label: string, promise: Promise<GesiRow[]>) => {
  const rows = await promise;
  console.log(`${label}: ${rows.length}`);
  return rows;
};
const pendingPath = `/api/Ventas/Comprobantes/GetComprobantesPendientes?fechaHasta=${encodeURIComponent(historyUntil)}&sucursalID=${sucursalID}`;
const fetchPendingDocuments = async () => {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const rows = await client.getAll<GesiRow>(pendingPath, 'comprobantes', 1000);
    if (rows.length) return rows;
    console.warn(`Comprobantes pendientes: respuesta vacía inesperada (${attempt}/3); se reintentará con una sesión nueva.`);
    if (attempt < 3) {
      await client.login();
      await new Promise((resolve) => setTimeout(resolve, 15_000));
    }
  }
  throw new Error('GESI devolvió tres veces una cartera pendiente vacía. Se conserva la captura anterior y no se permite activar datos incompletos.');
};

// Standard prioriza un pico de memoria predecible. Los recursos se descargan
// uno por vez: tarda más que Promise.all, pero evita acumular varias respuestas
// paginadas y sus buffers de red al mismo tiempo.
const clients = await tracked('Clientes', client.getAll<GesiRow>('/api/Maestros/Clientes/GetList?sucursales=S&contactos=N&definicionesSucursal=S', 'clientes'));
const products = await tracked('Productos', previousCapture ? Promise.resolve(previousCapture.products) : client.getAll<GesiRow>('/api/Maestros/Productos/GetList?precios=N&stock=N&imagenes=N&costos=N&incluirSucursalesHabilitadas=S', 'productos'));
const stocks = await tracked('Existencias completas (incluye cero)', previousCapture?.captureMeta.inventoryIncludesZeroStock
  ? Promise.resolve(previousCapture.stocks)
  : client.getAll<GesiRow>(`/api/Maestros/Productos/GetExistencias?sucursales=${sucursalID}&almacenes=${almacenPrincipalID}&incluirProductosSinExistencias=S`, 'existencias', 1000));
const balances = await tracked('Saldos', client.getAll<GesiRow>('/api/Maestros/Clientes/GetSaldos?incluirComprobanteMasAntiguo=S', 'saldos'));
const allInvoiceHeaders = await tracked('Facturas del período SPT', client.postAll<GesiRow>('/api/Ventas/Comprobantes/Facturas/GetList', 'comprobantes', listBody(salesHistoryFrom), 1000));
const allCreditNoteHeaders = await tracked('Notas de crédito del período SPT', client.postAll<GesiRow>('/api/Ventas/Comprobantes/NotasDeCredito/GetList', 'comprobantes', listBody(salesHistoryFrom), 1000));
const collectionHeaders = await tracked('Cobros 365d', client.postAll<GesiRow>('/api/Ventas/Comprobantes/Cobros/GetList', 'comprobantes', listBody(historyFrom), 1000));
const pendingDocuments = await tracked('Comprobantes pendientes', fetchPendingDocuments());
const channels = await tracked('Canales', client.getAll<GesiRow>('/api/Maestros/CanalesDeVenta/GetList', 'canalesDeVenta'));
const paymentMethods = await tracked('Formas de pago', client.getAll<GesiRow>('/api/Maestros/FormasDePago/GetList', 'formasDePago'));
const sellers = await tracked('Vendedores', client.getAll<GesiRow>('/api/Maestros/Vendedores/GetList', 'vendedores'));
const rubros = await tracked('Rubros', client.getAll<GesiRow>('/api/Maestros/Rubros/GetList', 'rubros'));
const subRubros = await tracked('Subrubros', client.getAll<GesiRow>('/api/Maestros/SubRubros/GetList', 'subRubros'));
const productBrands = await tracked('Marcas de producto', client.getAll<GesiRow>('/api/Maestros/FiltroArticulos1/GetList', 'filtroarticulos1'));
const productLines = await tracked('Líneas de producto', client.getAll<GesiRow>('/api/Maestros/FiltroArticulos2/GetList', 'filtroarticulos2'));
const productFamilies = await tracked('Familias de producto', client.getAll<GesiRow>('/api/Maestros/FiltroArticulos3/GetList', 'filtroarticulos3'));
const productGroups = await tracked('Grupos de producto', client.getAll<GesiRow>('/api/Maestros/GruposDeProductos/GetList', 'grupoArticulos'));
const clientTypes = await tracked('Tipos de cliente', safeMaster('/api/Maestros/TiposDeCliente/GetList', 'tiposDeCliente', 'Tipos de cliente no disponibles'));
const zones = await tracked('Zonas', safeMaster('/api/Maestros/Zonas/GetList', 'zonas', 'Zonas no disponibles'));

const inventory = uniqueInventoryRows(stocks);
if (inventory.duplicateRows) optionalEndpointWarnings.push(`Existencias: GESI devolvió ${inventory.duplicateRows} fila(s) duplicada(s) para el mismo producto y depósito; se conservó una por producto.`);
if (inventory.invalidRows) optionalEndpointWarnings.push(`Existencias: GESI devolvió ${inventory.invalidRows} fila(s) sin productoID; se excluyeron del universo de productos y quedaron contabilizadas.`);
const normalizedStocks = inventory.rows;

await client.login();
const deliverySheetHeaders = await tracked(
  'Fojas de reparto',
  client.getAll<GesiRow>(`/api/Ventas/Repartos/GetList?fechaDesde=${encodeURIComponent(logisticsFrom.slice(0, 10))}`, 'fojasReparto', 1000),
);
const deliverySheets: GesiRow[] = [];
for (let index = 0; index < deliverySheetHeaders.length; index += 1) {
  const row = deliverySheetHeaders[index];
  try {
    const payload = await client.request<GesiRow>(`/api/Ventas/Repartos/GetItem?empresaID=${Number(row.empresaID)}&fojaID=${Number(row.fojaID)}`);
    const detail = (payload.fojaReparto ?? payload.fojaDeReparto) as GesiRow | undefined;
    deliverySheets.push(detail ? { ...row, ...detail } : row);
  } catch (error) {
    throw new Error(`No se pudo leer la foja ${Number(row.fojaID)}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if ((index + 1) % 50 === 0) {
    console.log(`Detalle de fojas: ${index + 1}/${deliverySheetHeaders.length}`);
    await client.login();
  }
  if (index + 1 < deliverySheetHeaders.length) await new Promise((resolve) => setTimeout(resolve, 750));
}
console.log(`Detalle de fojas: ${deliverySheets.length}/${deliverySheetHeaders.length}`);
await client.login();
let unassignedDeliveryDocuments: GesiRow[] = [];
try {
  unassignedDeliveryDocuments = await tracked(
    'Comprobantes sin foja',
    client.getAll<GesiRow>(
      `/api/Ventas/Repartos/GetComprobantesNoAsignados?fechadesde=${encodeURIComponent(logisticsFrom.slice(0, 10))}&fechahasta=${encodeURIComponent(historyUntil.slice(0, 10))}`,
      'comprobantes',
      1000,
    ),
  );
} catch (error) {
  const assignedKeys = new Set(deliverySheets.flatMap((sheet) => (
    Array.isArray(sheet.listaDeComprobantesAsignados) ? sheet.listaDeComprobantesAsignados as GesiRow[] : []
  )).map(documentIdentity));
  unassignedDeliveryDocuments = allInvoiceHeaders
    .filter((row) => String(row.fechaDeEmision ?? '').slice(0, 10) >= logisticsFrom.slice(0, 10))
    .filter((row) => !assignedKeys.has(documentIdentity(row)));
  optionalEndpointWarnings.push(
    `Comprobantes sin foja: el endpoint específico fue rechazado; se derivaron ${unassignedDeliveryDocuments.length} factura(s) recientes como diferencia entre Facturas/GetList y todas las fojas leídas. ${error instanceof Error ? error.message : String(error)}`,
  );
  console.warn(`Comprobantes sin foja derivados por diferencia: ${unassignedDeliveryDocuments.length}`);
}

await client.login();
const invoiceDetails = await fetchDocumentDetails(
  'Detalle de facturas',
  '/api/Ventas/Comprobantes/Facturas/GetItem?incluirDetalleDeVenta=S',
  allInvoiceHeaders,
  (row) => String(row.fechaDeEmision ?? '') >= sptSalesDetailFrom,
);
await client.login();
const creditNoteDetails = await fetchDocumentDetails(
  'Detalle de notas de crédito',
  '/api/Ventas/Comprobantes/NotasDeCredito/GetItem?incluirDetalleDeVenta=S',
  allCreditNoteHeaders,
  (row) => String(row.fechaDeEmision ?? '') >= sptSalesDetailFrom,
);
await client.login();
const collectionDetails = await fetchDocumentDetails(
  'Aplicaciones de cobros',
  '/api/Ventas/Comprobantes/Cobros/GetItem?incluirDetalleDeAplicacion=S',
  collectionHeaders,
  () => true,
  500,
  1,
  0,
  false,
);

const catalogProductIDs = [...new Set([
  ...normalizedStocks.filter((row) => Number(row.unidad1Disponible) !== 0 || Number(row.unidad2Disponible) !== 0)
    .map((row) => String(row.productoID ?? '')).filter(Boolean),
  ...products.filter((row) => String(row.estado ?? '').trim() === 'A')
    .map((row) => String(row.productoID ?? '')).filter(Boolean),
  ...invoiceDetails.flatMap((invoice) => Array.isArray(invoice.detalleItems) ? invoice.detalleItems as GesiRow[] : [])
    .filter((item) => String(item.tipoDeItem ?? '').trim() === 'P')
    .map((item) => String(item.codigoDeItem ?? '')).filter(Boolean),
])].sort();
const prices = previousCapture?.prices ?? await fetchPrices(catalogProductIDs);

const invoiceDetailByKey = new Map(invoiceDetails.map((row) => [documentIdentity(row), row]));
const invoices = allInvoiceHeaders
  .filter((row) => String(row.fechaDeEmision ?? '') >= historyFrom)
  .map((row) => String(row.fechaDeEmision ?? '') >= salesDetailFrom ? invoiceDetailByKey.get(documentIdentity(row)) ?? row : row);
const creditNoteDetailByKey = new Map(creditNoteDetails.map((row) => [documentIdentity(row), row]));
const preserveHistoricalSpt = !process.env.GESI_SPT_HISTORY_FROM && Boolean(existingCaptureMeta);
const currentSptInvoices = allInvoiceHeaders.map((row) => invoiceDetailByKey.get(documentIdentity(row)) ?? row);
const currentSptCreditNotes = allCreditNoteHeaders.map((row) => creditNoteDetailByKey.get(documentIdentity(row)) ?? row);
const sptCoverageFrom = preserveHistoricalSpt
  ? existingCaptureMeta?.salesHistoryFrom ?? salesHistoryFrom
  : salesHistoryFrom;
const creditNotes = allCreditNoteHeaders
  .filter((row) => String(row.fechaDeEmision ?? '') >= historyFrom)
  .map((row) => String(row.fechaDeEmision ?? '') >= salesDetailFrom ? creditNoteDetailByKey.get(documentIdentity(row)) ?? row : row);
const collectionDetailByKey = new Map(collectionDetails.map((row) => [documentIdentity(row), row]));
const collections = collectionHeaders.map((row) => collectionDetailByKey.get(documentIdentity(row)) ?? row);
const currentSptDetailCoverageFrom = [...currentSptInvoices, ...currentSptCreditNotes]
  .filter((row) => Array.isArray(row.detalleItems) && row.detalleItems.length > 0)
  .map((row) => String(row.fechaDeEmision ?? '').slice(0, 10))
  .filter(Boolean)
  .sort()[0] ?? sptSalesDetailFrom;
const sptDetailCoverageFrom = [
  preserveHistoricalSpt ? existingCaptureMeta?.sptSalesDetailFrom : '',
  currentSptDetailCoverageFrom,
].filter(Boolean).sort()[0] ?? sptSalesDetailFrom;

const captureMeta: GesiRawCapture['captureMeta'] = {
  capturedAt: historyUntil,
  empresaID,
  sucursalID,
  almacenPrincipalID,
  almacenPrincipal: String(normalizedStocks.find((row) => row.almacen)?.almacen ?? `Depósito ${almacenPrincipalID}`),
  inventoryIncludesZeroStock: true,
  inventoryDuplicateRows: inventory.duplicateRows,
  inventoryInvalidRows: inventory.invalidRows,
  historyFrom,
  salesHistoryFrom: sptCoverageFrom,
  sptFetchFrom: salesHistoryFrom,
  salesDetailFrom,
  sptSalesDetailFrom: sptDetailCoverageFrom,
  logisticsFrom,
  historyUntil,
  optionalEndpointWarnings,
};
const masters: GesiRawCapture['masters'] = {
  channels, paymentMethods, sellers, rubros, subRubros,
  productBrands, productLines, productFamilies, productGroups,
  clientTypes, zones,
};
await mkdir(rawDirectory, { recursive: true });
const temporary = `${target}.tmp`;
console.log('Captura GESI: escribiendo el archivo progresivamente…');
const output = createWriteStream(temporary, { encoding: 'utf8' });
let firstProperty = true;
let preservedSptInvoiceCount = 0;
let preservedSptCreditNoteCount = 0;

async function writeChunk(stream: WriteStream, value: string) {
  if (!stream.write(value)) await once(stream, 'drain');
}

async function writePropertyPrefix(name: string) {
  await writeChunk(output, `${firstProperty ? '' : ','}${JSON.stringify(name)}:`);
  firstProperty = false;
}

async function writeValueProperty(name: string, value: unknown) {
  await writePropertyPrefix(name);
  await writeChunk(output, JSON.stringify(value));
}

async function writeArrayProperty(name: string, rows: GesiRow[]) {
  await writePropertyPrefix(name);
  await writeChunk(output, '[');
  for (let index = 0; index < rows.length; index += 1) {
    await writeChunk(output, `${index ? ',' : ''}${JSON.stringify(rows[index])}`);
  }
  await writeChunk(output, ']');
}

async function writeSptProperty(
  name: 'sptInvoices' | 'sptCreditNotes',
  currentRows: GesiRow[],
) {
  await writePropertyPrefix(name);
  await writeChunk(output, '[');
  let written = 0;
  if (preserveHistoricalSpt) {
    await forEachExistingCaptureRow(name, async (row) => {
      if (String(row.fechaDeEmision ?? '') >= salesHistoryFrom) return;
      await writeChunk(output, `${written ? ',' : ''}${JSON.stringify(row)}`);
      written += 1;
    });
  }
  if (name === 'sptInvoices') preservedSptInvoiceCount = written;
  else preservedSptCreditNoteCount = written;
  for (const row of currentRows) {
    await writeChunk(output, `${written ? ',' : ''}${JSON.stringify(row)}`);
    written += 1;
  }
  await writeChunk(output, ']');
}

await writeChunk(output, '{');
await writeValueProperty('captureMeta', captureMeta);
await writeArrayProperty('clients', clients);
await writeArrayProperty('products', products);
await writeArrayProperty('prices', prices);
await writeArrayProperty('stocks', normalizedStocks);
await writeArrayProperty('balances', balances);
await writeArrayProperty('invoices', invoices);
await writeArrayProperty('creditNotes', creditNotes);
await writeSptProperty('sptInvoices', currentSptInvoices);
await writeSptProperty('sptCreditNotes', currentSptCreditNotes);
await writeArrayProperty('collections', collections);
await writeArrayProperty('pendingDocuments', pendingDocuments);
await writeArrayProperty('deliverySheets', deliverySheets);
await writeArrayProperty('unassignedDeliveryDocuments', unassignedDeliveryDocuments);
await writeValueProperty('masters', masters);
await writeChunk(output, '}');
output.end();
await once(output, 'finish');
await rename(temporary, target);

console.log('Captura GESI Salice completada.');
console.log(JSON.stringify({
  clients: clients.length,
  products: products.length,
  catalogProductsWithStockOrSales: catalogProductIDs.length,
  priceDefinitions: prices.length,
  inventoryRows: normalizedStocks.length,
  positiveUnit1Stocks: normalizedStocks.filter((row) => Number(row.unidad1Disponible) > 0).length,
  zeroUnit1Stocks: normalizedStocks.filter((row) => Number(row.unidad1Disponible) === 0).length,
  negativeUnit1Stocks: normalizedStocks.filter((row) => Number(row.unidad1Disponible) < 0).length,
  inventoryDuplicateRows: inventory.duplicateRows,
  inventoryInvalidRows: inventory.invalidRows,
  balances: balances.length,
  salesHistoryFrom: sptCoverageFrom,
  sptFetchFrom: salesHistoryFrom,
  salesDetailFrom,
  sptSalesDetailFrom,
  invoices: invoices.length,
  invoicesWithDetail: invoices.filter((row) => Array.isArray(row.detalleItems)).length,
  sptInvoices: preservedSptInvoiceCount + currentSptInvoices.length,
  sptInvoicesWithDetail: invoiceDetails.length,
  creditNotes: creditNotes.length,
  creditNotesWithDetail: creditNotes.filter((row) => Array.isArray(row.detalleItems)).length,
  sptCreditNotes: preservedSptCreditNoteCount + currentSptCreditNotes.length,
  sptCreditNotesWithDetail: creditNoteDetails.length,
  collections365d: collections.length,
  pendingDocuments: pendingDocuments.length,
  deliverySheets: deliverySheets.length,
  unassignedDeliveryDocuments: unassignedDeliveryDocuments.length,
  warnings: optionalEndpointWarnings,
}, null, 2));
