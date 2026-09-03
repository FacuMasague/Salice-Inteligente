import 'dotenv/config';
import { once } from 'node:events';
import { createReadStream, createWriteStream, type WriteStream } from 'node:fs';
import { access, mkdir, readFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/pick.js';
import { streamArray } from 'stream-json/streamers/stream-array.js';
import { streamValues } from 'stream-json/streamers/stream-values.js';
import {
  captureCacheMatchesActiveBundle,
  logisticsQueryFrom,
  resolveLogisticsInvoiceValidationFrom,
  resolveLogisticsFetchFrom,
  resolveSptFetchFrom,
} from '../server/gesi/capture-window.js';
import { GesiClient } from '../server/gesi/client.js';
import {
  assertDeliverySheetDetail,
  assertDeliverySheetContinuity,
  assertDeliverySheetHeaders,
  deliverySheetContinuityGaps,
  deliverySheetId,
  deliverySheetIsClosed,
  deliverySheetOverlapsCoverage,
  deliverySheetStartsAt,
  normalizeNullDeliverySheetAssignments,
  scopeDeliverySheetAssignments,
} from '../server/gesi/delivery-sheet-capture.js';
import { normalizeInventoryRows } from '../server/gesi/inventory-capture.js';
import { priceProductIdBatches } from '../server/gesi/price-query.js';
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
const activeBundleCapturedAt = await readFile(resolve(process.cwd(), 'data/active-bundle.json'), 'utf8')
  .then((contents) => String((JSON.parse(contents) as { capturedAt?: string }).capturedAt ?? ''))
  .catch(() => '');
const existingCaptureIsApproved = captureCacheMatchesActiveBundle(
  existingCaptureMeta?.capturedAt,
  activeBundleCapturedAt,
);
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
const salesHistoryFrom = resolveSptFetchFrom({
  hasExistingCapture,
  historyFrom,
  explicitHistoryFrom: process.env.GESI_SPT_HISTORY_FROM,
  bootstrapHistoryFrom: process.env.GESI_SPT_BOOTSTRAP_HISTORY_FROM,
});
const salesDetailFrom = process.env.GESI_SALES_DETAIL_FROM ?? isoDaysAgo(180);
const sptSalesDetailFrom = process.env.GESI_SPT_DETAIL_FROM ?? salesHistoryFrom;
const rollingLogisticsFrom = isoDaysAgo(45);
const logisticsFrom = process.env.GESI_LOGISTICS_FROM?.trim() || historyFrom;
const historyUntil = capturedAt.toISOString();

const listBody = (from: string, until = historyUntil) => ({
  datosOperacion: {
    fechaDesde: from,
    fechaHasta: until,
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
const emittedOn = (row: GesiRow) => String(row.fechaDeEmision ?? '').slice(0, 10);
const onOrAfter = (row: GesiRow, from: string) => emittedOn(row) >= from.slice(0, 10);
const optionalEndpointWarnings: string[] = [];

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
  const batches = priceProductIdBatches(productIDs);
  const prices: GesiRow[] = [];
  for (let index = 0; index < batches.length; index += 1) {
    const codes = encodeURIComponent(batches[index].join(','));
    // GetPrecios anuncia en totalElementos la cantidad de códigos consultados,
    // aunque omite de `precios` los productos que no tienen una definición.
    // No debe tratarse como una página truncada: la auditoría posterior informa
    // explícitamente qué productos del catálogo quedaron sin precio.
    const rows = await client.getSparseAll<GesiRow>(`/api/Maestros/Productos/GetPrecios?codigos=${codes}`, 'precios', 1000);
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
// Se conserva sólo la relación del almacén solicitado, nunca stock de otros depósitos.
const inventoryWarehouses = (await tracked('Maestro de almacenes para verificar sucursal',
  client.getStrictAll<GesiRow>('/api/Maestros/Almacenes/GetList', 'almacenes', 100)))
  .filter((row) => Number(row.almacenID) === almacenPrincipalID)
  .map((row) => ({ almacenID: row.almacenID, sucursalID: row.sucursalID, descripcion: row.descripcion,
    ...(row.empresaID != null ? { empresaID: row.empresaID } : {}) }));
// Fallar antes de descargar el histórico si las existencias no son verificables.
const inventory = normalizeInventoryRows(stocks, { empresaID, sucursalID, almacenID: almacenPrincipalID }, inventoryWarehouses);
const balances = await tracked('Saldos', client.getAll<GesiRow>('/api/Maestros/Clientes/GetSaldos?incluirComprobanteMasAntiguo=S', 'saldos'));
// Las cabeceras de venta conservan la consulta anual original. Se comienza con
// páginas de 500 y GesiClient reinicia la colección con 250 si GESI agota el
// tiempo de espera, sin cambiar el universo ni aprobar una captura parcial.
const allInvoiceHeaders = await tracked('Facturas del período SPT', client.postAll<GesiRow>('/api/Ventas/Comprobantes/Facturas/GetList', 'comprobantes', listBody(salesHistoryFrom), 500));
const allCreditNoteHeaders = await tracked('Notas de crédito del período SPT', client.postAll<GesiRow>('/api/Ventas/Comprobantes/NotasDeCredito/GetList', 'comprobantes', listBody(salesHistoryFrom), 500));
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

if (inventory.duplicateRows) optionalEndpointWarnings.push(`Existencias: GESI devolvió ${inventory.duplicateRows} fila(s) duplicada(s) para el mismo producto y almacén; se conservó una por producto.`);
if (inventory.invalidRows) optionalEndpointWarnings.push(`Existencias: GESI devolvió ${inventory.invalidRows} fila(s) sin productoID; se excluyeron del universo de productos y quedaron contabilizadas.`);
if (inventory.repairedScopeRows) optionalEndpointWarnings.push(`Existencias: ${inventory.repairedScopeRows} fila(s) sin alcance específico o con el marcador global 65535 y stock cero se asociaron al alcance solicitado explícitamente al endpoint (empresa 3, sucursal 3, almacén 2).`);
if (inventory.branchResolvedRows) optionalEndpointWarnings.push(`Existencias: ${inventory.branchResolvedRows} fila(s) con sucursal 0 se resolvieron contra el maestro del almacén 2, sucursal 3. Se conservaron las cantidades originales y la sucursal recibida.`);
const normalizedStocks = inventory.rows;
const inventoryNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const committedStockRows = normalizedStocks.filter((row) => inventoryNumber(row.unidad1NPEPendientes) > 0 || inventoryNumber(row.unidad2NPEPendientes) > 0).length;
const stockReconciliationWarnings = normalizedStocks.filter((row) => (
  Math.abs(inventoryNumber(row.unidad1) - inventoryNumber(row.unidad1Disponible) - inventoryNumber(row.unidad1NPEPendientes)) > .01
  || Math.abs(inventoryNumber(row.unidad2) - inventoryNumber(row.unidad2Disponible) - inventoryNumber(row.unidad2NPEPendientes)) > .01
)).length;
if (stockReconciliationWarnings) optionalEndpointWarnings.push(`Existencias: ${stockReconciliationWarnings} producto(s) no reconcilian existencia física menos pedidos pendientes con disponibilidad.`);

const previousDeliverySheetById = new Map<number, GesiRow>();
let previousDeliverySheetCacheUsable = existingCaptureIsApproved;
if (previousDeliverySheetCacheUsable) {
  try {
    const previousRows: GesiRow[] = [];
    await forEachExistingCaptureRow('deliverySheets', (row) => { previousRows.push(row); });
    assertDeliverySheetHeaders(previousRows, 'Histórico logístico aprobado', empresaID);
    previousRows.forEach((row) => previousDeliverySheetById.set(deliverySheetId(row), row));
    // Un array ausente o vacío no demuestra que exista un histórico completo.
    // Es más seguro reconstruir el año que publicar sólo la ventana reciente.
    previousDeliverySheetCacheUsable = previousRows.length > 0;
  } catch (error) {
    previousDeliverySheetById.clear();
    previousDeliverySheetCacheUsable = false;
    optionalEndpointWarnings.push(`Fojas: no se pudo reutilizar el histórico aprobado y se reconstruyó la cobertura completa. ${error instanceof Error ? error.message : String(error)}`);
  }
}
const requestedLogisticsRefreshFrom = resolveLogisticsFetchFrom({
  hasExistingCapture: previousDeliverySheetCacheUsable,
  historyFrom,
  rollingFrom: rollingLogisticsFrom,
  existingCoverageFrom: previousDeliverySheetCacheUsable ? existingCaptureMeta?.logisticsFrom : undefined,
  explicitFrom: process.env.GESI_LOGISTICS_FROM,
});
const oldestOpenSheetDate = [...previousDeliverySheetById.values()]
  .filter((row) => !deliverySheetIsClosed(row))
  .map(deliverySheetStartsAt)
  .filter(Boolean)
  .sort()[0];
const logisticsFetchFrom = [logisticsQueryFrom(requestedLogisticsRefreshFrom), oldestOpenSheetDate]
  .filter(Boolean)
  .sort()[0] ?? logisticsQueryFrom(requestedLogisticsRefreshFrom);
const preservedDeliverySheets = [...previousDeliverySheetById.values()]
  .filter((row) => deliverySheetOverlapsCoverage(row, logisticsFrom))
  .filter((row) => deliverySheetStartsAt(row) < logisticsFetchFrom.slice(0, 10))
  .filter(deliverySheetIsClosed);
assertDeliverySheetHeaders(preservedDeliverySheets, 'Histórico logístico conservado', empresaID);
preservedDeliverySheets.forEach(assertDeliverySheetDetail);

const logisticsInvoiceValidationFrom = resolveLogisticsInvoiceValidationFrom({
  sheetFetchFrom: logisticsFetchFrom,
  salesFetchFrom: salesHistoryFrom,
  previousCoverageFrom: previousDeliverySheetCacheUsable ? existingCaptureMeta?.logisticsFrom : undefined,
});
let logisticsInvoiceHeaders = allInvoiceHeaders;
if (salesHistoryFrom.slice(0, 10) > logisticsInvoiceValidationFrom.slice(0, 10)) {
  await client.login();
  const overlapInvoiceHeaders = await tracked(
    'Facturas para validar el solapamiento logístico',
    client.postAll<GesiRow>(
      '/api/Ventas/Comprobantes/Facturas/GetList',
      'comprobantes',
      listBody(logisticsInvoiceValidationFrom, salesHistoryFrom),
      500,
    ),
  );
  logisticsInvoiceHeaders = [...new Map(
    [...overlapInvoiceHeaders, ...allInvoiceHeaders].map((row) => [documentIdentity(row), row]),
  ).values()];
}

await client.login();
const fetchedDeliverySheetHeaders = await tracked(
  'Fojas de reparto',
  client.getStrictAll<GesiRow>(`/api/Ventas/Repartos/GetList?fechaDesde=${encodeURIComponent(logisticsFetchFrom.slice(0, 10))}`, 'fojasReparto', 1000),
);
assertDeliverySheetHeaders(fetchedDeliverySheetHeaders, 'Cabeceras logísticas recibidas', empresaID);
const unavailableClosedDeliverySheetIDs = new Set<number>();
const continuityGaps = deliverySheetContinuityGaps(
  [...previousDeliverySheetById.values()],
  fetchedDeliverySheetHeaders,
  logisticsFrom,
  logisticsFetchFrom,
);
for (const previous of continuityGaps) {
  const id = deliverySheetId(previous);
  const detailPath = `/api/Ventas/Repartos/GetItem?empresaID=${Number(previous.empresaID)}&fojaID=${id}`;
  try {
    const payload = await client.request<GesiRow>(detailPath);
    const detail = (payload.fojaReparto ?? payload.fojaDeReparto) as GesiRow | undefined;
    if (!detail) throw new Error('la respuesta individual no contiene el detalle de la foja');
    const recovered = { ...previous, ...detail };
    assertDeliverySheetHeaders([recovered], `Foja ${id} recuperada fuera del listado`, empresaID);
    fetchedDeliverySheetHeaders.push(recovered);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const confirmedUnavailable = /\/api\/Ventas\/Repartos\/GetItem\?.*respondió HTTP (?:400|404)/.test(message);
    if (!confirmedUnavailable || !deliverySheetIsClosed(previous)) {
      throw new Error(`GESI omitió la foja ${id} del listado y no fue posible confirmar una baja cerrada: ${message}`);
    }
    assertDeliverySheetDetail(previous);
    unavailableClosedDeliverySheetIDs.add(id);
    fetchedDeliverySheetHeaders.push(previous);
  }
}
if (unavailableClosedDeliverySheetIDs.size) {
  const sample = [...unavailableClosedDeliverySheetIDs].slice(0, 10).join(', ');
  optionalEndpointWarnings.push(`Fojas: GESI retiró ${unavailableClosedDeliverySheetIDs.size} foja(s) cerrada(s) del listado y GetItem confirmó que ya no están disponibles; se conservó el último detalle aprobado (IDs ${sample}${unavailableClosedDeliverySheetIDs.size > 10 ? ', …' : ''}).`);
}
assertDeliverySheetContinuity(
  [...previousDeliverySheetById.values()],
  fetchedDeliverySheetHeaders,
  logisticsFrom,
  logisticsFetchFrom,
);
const deliverySheetHeaders = fetchedDeliverySheetHeaders
  .filter((row) => deliverySheetOverlapsCoverage(row, logisticsFrom));
const currentDeliverySheets: GesiRow[] = [];
let fetchedDeliverySheetDetails = 0;
const normalizedEmptyDeliverySheetIDs: number[] = [];
const normalizedOpenEmptyDeliverySheetIDs: number[] = [];
for (let index = 0; index < deliverySheetHeaders.length; index += 1) {
  const row = deliverySheetHeaders[index];
  try {
    if (unavailableClosedDeliverySheetIDs.has(deliverySheetId(row))) {
      assertDeliverySheetDetail(row);
      currentDeliverySheets.push(row);
      continue;
    }
    // Toda cabecera de la ventana reciente se vuelve a consultar, incluso si
    // ya estaba cerrada: GESI puede corregir asignaciones después del cierre.
    const detailPath = `/api/Ventas/Repartos/GetItem?empresaID=${Number(row.empresaID)}&fojaID=${deliverySheetId(row)}`;
    let detail: GesiRow | undefined;
    let consecutiveNullResponses = 0;
    for (let detailAttempt = 1; detailAttempt <= 3; detailAttempt += 1) {
      const payload = await client.request<GesiRow>(detailPath);
      detail = (payload.fojaReparto ?? payload.fojaDeReparto) as GesiRow | undefined;
      if (!detail) throw new Error(`${detailAttempt === 1 ? 'la respuesta' : 'la reconsulta'} no contiene el detalle de la foja`);
      if (detail.listaDeComprobantesAsignados !== null) break;
      consecutiveNullResponses += 1;
      if (detailAttempt < 3) {
        await client.login();
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
    }
    const received = { ...row, ...detail };
    if (received.listaDeComprobantesAsignados === null && consecutiveNullResponses !== 3) {
      throw new Error('la lista null no fue confirmada en tres lecturas consecutivas');
    }
    const complete = normalizeNullDeliverySheetAssignments(
      received,
      previousDeliverySheetById.get(deliverySheetId(row)),
    );
    if (received.listaDeComprobantesAsignados === null) {
      normalizedEmptyDeliverySheetIDs.push(deliverySheetId(row));
      if (!deliverySheetIsClosed(received)) normalizedOpenEmptyDeliverySheetIDs.push(deliverySheetId(row));
    }
    assertDeliverySheetHeaders([complete], `Detalle de foja ${deliverySheetId(row)}`, empresaID);
    assertDeliverySheetDetail(complete);
    currentDeliverySheets.push(complete);
    fetchedDeliverySheetDetails += 1;
  } catch (error) {
    throw new Error(`No se pudo leer la foja ${deliverySheetId(row)}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (fetchedDeliverySheetDetails % 50 === 0) {
    console.log(`Detalle de fojas: ${index + 1}/${deliverySheetHeaders.length}`);
    await client.login();
  }
  if (index + 1 < deliverySheetHeaders.length) await new Promise((resolve) => setTimeout(resolve, 750));
}
if (normalizedEmptyDeliverySheetIDs.length) {
  const sample = normalizedEmptyDeliverySheetIDs.slice(0, 10).join(', ');
  optionalEndpointWarnings.push(`Fojas: GESI devolvió null tres veces para ${normalizedEmptyDeliverySheetIDs.length} foja(s) sin detalle aprobado contradictorio; se conservaron como listas vacías (${normalizedOpenEmptyDeliverySheetIDs.length} abiertas; IDs ${sample}${normalizedEmptyDeliverySheetIDs.length > 10 ? ', …' : ''}).`);
}
assertDeliverySheetHeaders(currentDeliverySheets, 'Detalles logísticos recibidos', empresaID);
const deliverySheetById = new Map(preservedDeliverySheets.map((row) => [deliverySheetId(row), row]));
currentDeliverySheets.forEach((row) => deliverySheetById.set(deliverySheetId(row), row));
const integratedDeliverySheets = [...deliverySheetById.values()];
assertDeliverySheetHeaders(integratedDeliverySheets, 'Captura logística integrada', empresaID);

// GetList se consulta para el universo 3/3 no anulado, pero GESI puede conservar
// dentro de una foja facturas anuladas, operaciones de otra sucursal o una fila
// de borde que no integra la captura comercial publicable. Resolver las ausencias
// por GetItem permite clasificarlas con empresa, sucursal y estado verificables;
// una identidad irresoluble o de alcance indeterminado sigue bloqueando.
const assignedDeliveryDocuments = integratedDeliverySheets.flatMap((sheet) => (
  Array.isArray(sheet.listaDeComprobantesAsignados)
    ? sheet.listaDeComprobantesAsignados as GesiRow[]
    : []
));
const listedLogisticsInvoiceIDs = new Set(logisticsInvoiceHeaders.map(documentIdentity));
const unlistedAssignedDocuments = [...new Map(
  assignedDeliveryDocuments
    .filter((row) => !listedLogisticsInvoiceIDs.has(documentIdentity(row)))
    .map((row) => [documentIdentity(row), row]),
).values()];
let verifiedLogisticsInvoiceHeaders = logisticsInvoiceHeaders;
const canceledDeliveryInvoiceIDs = new Set<string>();
const foreignBranchDeliveryInvoiceIDs = new Set<string>();
if (unlistedAssignedDocuments.length) {
  await client.login();
  const recovered = await fetchDocumentDetails(
    'Comprobantes de fojas ausentes del listado comercial',
    '/api/Ventas/Comprobantes/Facturas/GetItem?incluirDetalleDeVenta=N',
    unlistedAssignedDocuments,
    () => true,
    500,
    1,
    1_000,
  );
  const recoveredByIdentity = new Map(recovered.map((row) => [documentIdentity(row), row]));
  const missingDetails = unlistedAssignedDocuments.filter((row) => !recoveredByIdentity.has(documentIdentity(row)));
  if (missingDetails.length) {
    const sample = missingDetails.slice(0, 10).map(documentIdentity).join(', ');
    throw new Error(`Las fojas contienen ${missingDetails.length} comprobante(s) que no pudieron resolverse por GetItem: ${sample}${missingDetails.length > 10 ? ', …' : ''}.`);
  }
  for (const row of recovered) {
    const identity = documentIdentity(row);
    const sourceCompanyID = Number(row.empresaID);
    const sourceBranchID = Number(row.sucursalID);
    if (sourceCompanyID !== empresaID || !Number.isInteger(sourceBranchID) || sourceBranchID <= 0) {
      throw new Error(`El comprobante ${identity} asignado a una foja no tiene un alcance de empresa/sucursal verificable.`);
    }
    if (sourceBranchID !== sucursalID) foreignBranchDeliveryInvoiceIDs.add(identity);
    else if (row.anulado === true) canceledDeliveryInvoiceIDs.add(identity);
  }
  verifiedLogisticsInvoiceHeaders = [...new Map(
    [...logisticsInvoiceHeaders, ...recovered].map((row) => [documentIdentity(row), row]),
  ).values()];
  if (canceledDeliveryInvoiceIDs.size) optionalEndpointWarnings.push(`Fojas: se verificaron y excluyeron ${canceledDeliveryInvoiceIDs.size} factura(s) anulada(s) que GESI conservaba asignadas.`);
  if (foreignBranchDeliveryInvoiceIDs.size) optionalEndpointWarnings.push(`Fojas: se verificaron y excluyeron ${foreignBranchDeliveryInvoiceIDs.size} comprobante(s) de otras sucursales que GESI conservaba dentro de fojas de empresa 3.`);
}
const verifiedLogisticsInvoiceByID = new Map(
  verifiedLogisticsInvoiceHeaders.map((row) => [documentIdentity(row), row]),
);
const publishedInvoiceIDs = new Set(allInvoiceHeaders.map(documentIdentity));
const outsidePublishedInvoiceIDs = new Set(
  assignedDeliveryDocuments
    .filter((row) => {
      const identity = documentIdentity(row);
      const source = verifiedLogisticsInvoiceByID.get(identity);
      if (!source) return false;
      const emittedAt = String(source.fechaDeEmision ?? row.fechaDeEmision ?? '').slice(0, 10);
      return emittedAt >= logisticsFrom.slice(0, 10) && !publishedInvoiceIDs.has(identity);
    })
    .map(documentIdentity),
);
if (outsidePublishedInvoiceIDs.size) {
  optionalEndpointWarnings.push(`Fojas: se excluyeron ${outsidePublishedInvoiceIDs.size} asignación(es) cuya factura fuente fue verificable pero no integra la captura comercial aprobable; logística y ventas conservan el mismo universo documental.`);
}
const excludedDeliveryInvoiceIDs = new Set([
  ...canceledDeliveryInvoiceIDs,
  ...foreignBranchDeliveryInvoiceIDs,
  ...outsidePublishedInvoiceIDs,
]);
const deliverySheets = scopeDeliverySheetAssignments(
  integratedDeliverySheets,
  verifiedLogisticsInvoiceHeaders,
  logisticsFrom,
  documentIdentity,
  empresaID,
  sucursalID,
  excludedDeliveryInvoiceIDs,
);
console.log(`Detalle de fojas: ${currentDeliverySheets.length}/${deliverySheetHeaders.length} (${fetchedDeliverySheetDetails} consultados; ${preservedDeliverySheets.length} históricos aprobados conservados)`);
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
  (row) => onOrAfter(row, sptSalesDetailFrom),
);
await client.login();
const creditNoteDetails = await fetchDocumentDetails(
  'Detalle de notas de crédito',
  '/api/Ventas/Comprobantes/NotasDeCredito/GetItem?incluirDetalleDeVenta=S',
  allCreditNoteHeaders,
  (row) => onOrAfter(row, sptSalesDetailFrom),
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
  ...normalizedStocks.filter((row) => (
    Number(row.unidad1) !== 0
    || Number(row.unidad2) !== 0
    || Number(row.unidad1Disponible) !== 0
    || Number(row.unidad2Disponible) !== 0
  ))
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
  .filter((row) => onOrAfter(row, historyFrom))
  .map((row) => onOrAfter(row, salesDetailFrom) ? invoiceDetailByKey.get(documentIdentity(row)) ?? row : row);
const creditNoteDetailByKey = new Map(creditNoteDetails.map((row) => [documentIdentity(row), row]));
const preserveHistoricalSpt = !process.env.GESI_SPT_HISTORY_FROM && Boolean(existingCaptureMeta);
const currentSptInvoices = allInvoiceHeaders.map((row) => invoiceDetailByKey.get(documentIdentity(row)) ?? row);
const currentSptCreditNotes = allCreditNoteHeaders.map((row) => creditNoteDetailByKey.get(documentIdentity(row)) ?? row);
const sptCoverageFrom = preserveHistoricalSpt
  ? existingCaptureMeta?.salesHistoryFrom ?? salesHistoryFrom
  : salesHistoryFrom;
const creditNotes = allCreditNoteHeaders
  .filter((row) => onOrAfter(row, historyFrom))
  .map((row) => onOrAfter(row, salesDetailFrom) ? creditNoteDetailByKey.get(documentIdentity(row)) ?? row : row);
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
  almacenPrincipal: String(normalizedStocks.find((row) => row.almacen)?.almacen ?? `Almacén ${almacenPrincipalID}`),
  inventoryIncludesZeroStock: true,
  inventoryDuplicateRows: inventory.duplicateRows,
  inventoryInvalidRows: inventory.invalidRows,
  inventoryScopeRepairedRows: inventory.repairedScopeRows,
  inventoryBranchResolvedRows: inventory.branchResolvedRows,
  inventoryCommittedRows: committedStockRows,
  inventoryStockReconciliationWarnings: stockReconciliationWarnings,
  historyFrom,
  salesHistoryFrom: sptCoverageFrom,
  sptFetchFrom: salesHistoryFrom,
  salesDetailFrom,
  sptSalesDetailFrom: sptDetailCoverageFrom,
  logisticsFrom,
  logisticsFetchFrom,
  historyUntil,
  optionalEndpointWarnings,
};
const masters: GesiRawCapture['masters'] = {
  inventoryWarehouses,
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
      if (onOrAfter(row, salesHistoryFrom)) return;
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
  positivePhysicalUnit1Stocks: normalizedStocks.filter((row) => Number(row.unidad1) > 0).length,
  zeroPhysicalUnit1Stocks: normalizedStocks.filter((row) => Number(row.unidad1) === 0).length,
  negativePhysicalUnit1Stocks: normalizedStocks.filter((row) => Number(row.unidad1) < 0).length,
  positiveAvailableUnit1Stocks: normalizedStocks.filter((row) => Number(row.unidad1Disponible) > 0).length,
  zeroAvailableUnit1Stocks: normalizedStocks.filter((row) => Number(row.unidad1Disponible) === 0).length,
  negativeAvailableUnit1Stocks: normalizedStocks.filter((row) => Number(row.unidad1Disponible) < 0).length,
  committedStockRows,
  stockReconciliationWarnings,
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
  fetchedDeliverySheetDetails,
  preservedDeliverySheets: preservedDeliverySheets.length,
  unassignedDeliveryDocuments: unassignedDeliveryDocuments.length,
  warnings: optionalEndpointWarnings,
}, null, 2));
