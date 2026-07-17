import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { GesiRawCapture, GesiRow } from '../server/gesi/types.js';

const capturePath = resolve(process.cwd(), 'data/raw/gesi-salice-latest.json');
const capture = JSON.parse(await readFile(capturePath, 'utf8')) as GesiRawCapture;

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = (value: unknown) => value == null ? '' : String(value).trim();
const date = (value: unknown) => text(value).slice(0, 10);
const distinct = <T>(values: T[]) => new Set(values).size;
const uniqueStrings = (rows: GesiRow[], field: string) => new Set(rows.map((row) => text(row[field])).filter(Boolean));
const countBy = (rows: GesiRow[], field: string) => Object.fromEntries(
  [...rows.reduce((map, row) => map.set(text(row[field]) || '(vacío)', (map.get(text(row[field]) || '(vacío)') ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]).slice(0, 12),
);

const quantiles = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = (q: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))] : 0;
  return { min: at(0), p50: at(.5), p90: at(.9), p99: at(.99), max: at(1) };
};

const daysBetween = (from: string, to: string) => Math.round(
  (new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000,
);

const parseCoordinates = (value: unknown): [number, number] | null => {
  const matches = text(value).replace(';', ',').match(/-?\d+(?:[.,]\d+)?/g);
  if (!matches || matches.length < 2) return null;
  const values = matches.slice(0, 2).map((item) => Number(item.replace(',', '.')));
  if (!Number.isFinite(values[0]) || !Number.isFinite(values[1])) return null;
  let [lat, lng] = values;
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) [lat, lng] = [lng, lat];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
};

const snapshotDate = date(capture.captureMeta.capturedAt);
const current90FromDate = new Date(`${snapshotDate}T12:00:00Z`);
current90FromDate.setUTCDate(current90FromDate.getUTCDate() - 90);
const current90From = current90FromDate.toISOString().slice(0, 10);
const previous90FromDate = new Date(current90FromDate);
previous90FromDate.setUTCDate(previous90FromDate.getUTCDate() - 90);
const previous90From = previous90FromDate.toISOString().slice(0, 10);

const clientIDs = new Set(capture.clients.map((row) => number(row.clienteID)));
const productIDs = uniqueStrings(capture.products, 'productoID');
const stockProductIDs = uniqueStrings(capture.stocks, 'productoID');
const priceProductIDs = uniqueStrings(capture.prices, 'productoID');
const documentKey = (row: GesiRow) => [
  number(row.empresaID),
  number(row.comprobanteID),
  text(row.serie),
  number(row.puntoDeVentaID),
  number(row.numero),
].join(':');
const applicationInvoiceKey = (row: GesiRow) => [
  number(row.empresaID),
  number(row.vto_ComprobanteID),
  text(row.vto_Serie),
  number(row.vto_PuntoDeVentaID),
  number(row.vto_Numero),
].join(':');
const invoiceIDs = new Set(capture.invoices.map(documentKey));

const invoiceWithDetail = capture.invoices.filter((row) => Array.isArray(row.detalleItems));
const current90Invoices = invoiceWithDetail.filter((row) => date(row.fechaDeEmision) >= current90From);
const previous90Invoices = invoiceWithDetail.filter((row) => date(row.fechaDeEmision) >= previous90From && date(row.fechaDeEmision) < current90From);
const allItems = invoiceWithDetail.flatMap((row) => row.detalleItems as GesiRow[]);
const soldProductIDs = uniqueStrings(allItems, 'codigoDeItem');
const catalogProductIDs = new Set([...stockProductIDs, ...soldProductIDs]);

const invoiceKeys = capture.invoices.map(documentKey);
const collectionKeys = capture.collections.map(documentKey);
const pendingKeys = capture.pendingDocuments.map(documentKey);

const detailDifferences = invoiceWithDetail.map((invoice) => {
  const itemTotal = (invoice.detalleItems as GesiRow[]).reduce((sum, item) => sum + number(item.importeTotalFinal), 0);
  return Math.abs(number(invoice.importeTotal) - itemTotal);
});

const applications = capture.collections.flatMap((row) => Array.isArray(row.aplicacionesADebitos) ? row.aplicacionesADebitos as GesiRow[] : []);
const applicationsByInvoice = new Map<string, GesiRow[]>();
for (const application of applications) {
  const id = applicationInvoiceKey(application);
  const current = applicationsByInvoice.get(id) ?? [];
  current.push(application);
  applicationsByInvoice.set(id, current);
}

const paymentDays: number[] = [];
for (const invoice of capture.invoices) {
  if (Math.abs(number(invoice.saldoPendiente)) > .01) continue;
  const linked = applicationsByInvoice.get(documentKey(invoice)) ?? [];
  const paidAt = linked.map((row) => date(row.fecha)).filter(Boolean).sort().at(-1);
  if (paidAt) paymentDays.push(daysBetween(date(invoice.fechaDeEmision), paidAt));
}

const pendingByClient = new Map<number, number>();
for (const document of capture.pendingDocuments) {
  const id = number(document.clienteID);
  pendingByClient.set(id, (pendingByClient.get(id) ?? 0) + number(document.saldoPendiente));
}
const balanceByClient = new Map(capture.balances.map((row) => [number(row.clienteID), number(row.saldoCliente)]));
const reconciliationDifferences = [...balanceByClient].map(([id, balance]) => Math.abs(balance - (pendingByClient.get(id) ?? 0)));

const invoiceClientIDs = new Set(capture.invoices.map((row) => number(row.clienteID)));
const pendingClientIDs = new Set(capture.pendingDocuments.map((row) => number(row.clienteID)));
const nonZeroBalanceIDs = new Set(capture.balances.filter((row) => Math.abs(number(row.saldoCliente)) > .01).map((row) => number(row.clienteID)));
const relevantClientIDs = new Set([...invoiceClientIDs, ...pendingClientIDs, ...nonZeroBalanceIDs]);

const clientCoordinates = capture.clients.map((row) => ({ id: number(row.clienteID), point: parseCoordinates(row.geoCoordenadas) }));
const regionalCoordinates = clientCoordinates.filter(({ point }) => point && point[0] >= -42 && point[0] <= -34 && point[1] >= -61 && point[1] <= -55);
const branchDefinitions = capture.clients.flatMap((row) => Array.isArray(row.lstDefinicionClienteSucursal) ? row.lstDefinicionClienteSucursal as GesiRow[] : []);

const report = {
  capture: capture.captureMeta,
  windows: { snapshotDate, previous90From, current90From },
  clients: {
    rows: capture.clients.length,
    uniqueIDs: distinct(capture.clients.map((row) => number(row.clienteID))),
    duplicateIDs: capture.clients.length - distinct(capture.clients.map((row) => number(row.clienteID))),
    relevant365dOrBalance: relevantClientIDs.size,
    invoiceClients365d: invoiceClientIDs.size,
    pendingClients: pendingClientIDs.size,
    nonZeroBalanceClients: nonZeroBalanceIDs.size,
    orphanInvoiceClients: [...invoiceClientIDs].filter((id) => !clientIDs.has(id)).length,
    coordinatesNonEmpty: capture.clients.filter((row) => text(row.geoCoordenadas)).length,
    coordinatesParsed: clientCoordinates.filter((row) => row.point).length,
    coordinatesInOperatingRegion: regionalCoordinates.length,
    relevantWithRegionalCoordinates: regionalCoordinates.filter(({ id }) => relevantClientIDs.has(id)).length,
    branchDefinitions: branchDefinitions.length,
    branchDefinitionKeys: Object.keys(branchDefinitions[0] ?? {}).sort(),
    clientStateIDs: countBy(capture.clients, 'estadoID'),
  },
  products: {
    masterRows: capture.products.length,
    uniqueMasterIDs: productIDs.size,
    duplicateMasterIDs: capture.products.length - productIDs.size,
    positiveStockRows: capture.stocks.length,
    positiveStockProducts: stockProductIDs.size,
    priceRows: capture.prices.length,
    pricedProducts: priceProductIDs.size,
    priceRowsForBranch3: capture.prices.filter((row) => number(row.sucursalID) === 3).length,
    positivePriceRowsForBranch3: capture.prices.filter((row) => number(row.sucursalID) === 3 && number(row.precio) > 0).length,
    priceBranchIDs: countBy(capture.prices, 'sucursalID'),
    priceChannelIDs: countBy(capture.prices, 'canalDeVentaID'),
    soldProducts180d: soldProductIDs.size,
    catalogStockOrSales: catalogProductIDs.size,
    soldMissingFromMaster: [...soldProductIDs].filter((id) => !productIDs.has(id)).length,
    catalogMissingPriceDefinition: [...catalogProductIDs].filter((id) => !priceProductIDs.has(id)).length,
    stockValues: quantiles(capture.stocks.map((row) => number(row.unidad1Disponible))),
  },
  invoices: {
    rows365d: capture.invoices.length,
    uniqueKeys: distinct(invoiceKeys),
    duplicateKeys: invoiceKeys.length - distinct(invoiceKeys),
    withDetail180d: invoiceWithDetail.length,
    current90Rows: current90Invoices.length,
    previous90Rows: previous90Invoices.length,
    current90Gross: current90Invoices.reduce((sum, row) => sum + number(row.importeTotal), 0),
    previous90Gross: previous90Invoices.reduce((sum, row) => sum + number(row.importeTotal), 0),
    dateMin: capture.invoices.map((row) => date(row.fechaDeEmision)).filter(Boolean).sort().at(0),
    dateMax: capture.invoices.map((row) => date(row.fechaDeEmision)).filter(Boolean).sort().at(-1),
    annulled: capture.invoices.filter((row) => row.anulado === true).length,
    nonPositiveAmounts: capture.invoices.filter((row) => number(row.importeTotal) <= 0).length,
    itemRows180d: allItems.length,
    itemTypes: countBy(allItems, 'tipoDeItem'),
    negativeItemQuantity: allItems.filter((row) => number(row.cantidadU1) < 0).length,
    negativeItemAmount: allItems.filter((row) => number(row.importeTotalFinal) < 0).length,
    detailDifference: quantiles(detailDifferences),
    invoicesDetailDifferenceOverOnePeso: detailDifferences.filter((value) => value > 1).length,
  },
  collections: {
    rows365d: capture.collections.length,
    uniqueKeys: distinct(collectionKeys),
    duplicateKeys: collectionKeys.length - distinct(collectionKeys),
    withApplications: capture.collections.filter((row) => Array.isArray(row.aplicacionesADebitos)).length,
    applicationRows: applications.length,
    applicationsMatchedToInvoice365d: applications.filter((row) => invoiceIDs.has(applicationInvoiceKey(row))).length,
    inferredFullyPaidInvoices: paymentDays.length,
    paymentDays: quantiles(paymentDays),
    negativePaymentDays: paymentDays.filter((value) => value < 0).length,
  },
  pendingAndBalances: {
    pendingRows: capture.pendingDocuments.length,
    uniquePendingKeys: distinct(pendingKeys),
    duplicatePendingKeys: pendingKeys.length - distinct(pendingKeys),
    orphanPendingClients: [...pendingClientIDs].filter((id) => !clientIDs.has(id)).length,
    outstandingTotal: capture.pendingDocuments.reduce((sum, row) => sum + number(row.saldoPendiente), 0),
    balanceTotal: capture.balances.reduce((sum, row) => sum + number(row.saldoCliente), 0),
    positiveBalanceClients: capture.balances.filter((row) => number(row.saldoCliente) > .01).length,
    negativeBalanceClients: capture.balances.filter((row) => number(row.saldoCliente) < -.01).length,
    dueDatePopulated: capture.pendingDocuments.filter((row) => date(row.fechaDePrimerVencimiento)).length,
    overdueAsOfSnapshot: capture.pendingDocuments.filter((row) => date(row.fechaDePrimerVencimiento) && date(row.fechaDePrimerVencimiento) < snapshotDate && number(row.saldoPendiente) > .01).length,
    documentSubtypes: countBy(capture.pendingDocuments, 'subtipo'),
    absoluteClientReconciliationDifference: quantiles(reconciliationDifferences),
    clientsReconciledWithinOnePeso: reconciliationDifferences.filter((value) => value <= 1).length,
  },
  sourceWarnings: capture.captureMeta.optionalEndpointWarnings,
};

console.log(JSON.stringify(report, null, 2));
