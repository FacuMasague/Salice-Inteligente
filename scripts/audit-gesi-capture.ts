import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import chain from 'stream-chain';
import { parser } from 'stream-json';
import { ignore } from 'stream-json/filters/ignore.js';
import { streamObject } from 'stream-json/streamers/stream-object.js';
import type { GesiRawCapture, GesiRow } from '../server/gesi/types.js';
import { invoiceCreditTermDays } from '../shared/credit-terms.js';

const capturePath = resolve(process.cwd(), 'data/raw/gesi-salice-latest.json');
const output = chain([
  createReadStream(capturePath),
  parser(),
  ignore({
    filter: /^(sptInvoices|sptCreditNotes)$/,
    streamKeys: false,
    packKeys: true,
  }),
  streamObject(),
]);
const partialCapture: Partial<GesiRawCapture> = {};
for await (const item of output as AsyncIterable<{ key: string; value: unknown }>) {
  (partialCapture as Record<string, unknown>)[item.key] = item.value;
}
partialCapture.sptInvoices = [];
partialCapture.sptCreditNotes = [];
const capture = partialCapture as GesiRawCapture;

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
const soldProductIDs = uniqueStrings(allItems.filter((row) => text(row.tipoDeItem) === 'P'), 'codigoDeItem');
const activeMasterProductIDs = new Set(capture.products.filter((row) => text(row.estado) === 'A').map((row) => text(row.productoID)).filter(Boolean));
const nonzeroInventoryProductIDs = new Set(capture.stocks
  .filter((row) => number(row.unidad1Disponible) !== 0 || number(row.unidad2Disponible) !== 0)
  .map((row) => text(row.productoID)).filter(Boolean));
const catalogProductIDs = new Set([...activeMasterProductIDs, ...nonzeroInventoryProductIDs, ...soldProductIDs]);
const stockRowIDs = capture.stocks.map((row) => text(row.productoID)).filter(Boolean);

const invoiceKeys = capture.invoices.map(documentKey);
const invoiceCreditTerms = capture.invoices.map((row) => invoiceCreditTermDays(date(row.fechaDeEmision), date(row.fechaDePrimerVencimiento)));
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
const deliverySheets = capture.deliverySheets ?? [];
const assignedDeliveryDocuments = deliverySheets.flatMap((row) => Array.isArray(row.listaDeComprobantesAsignados) ? row.listaDeComprobantesAsignados as GesiRow[] : []);
const assignedInvoiceIDs = new Set(assignedDeliveryDocuments.map(documentKey).filter((id) => invoiceIDs.has(id)));
const unassignedDeliveryInvoiceIDs = new Set((capture.unassignedDeliveryDocuments ?? []).map(documentKey).filter((id) => invoiceIDs.has(id)));

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
    inventoryIncludesZeroStock: capture.captureMeta.inventoryIncludesZeroStock === true,
    inventoryCompanyID: capture.captureMeta.empresaID,
    inventoryBranchID: capture.captureMeta.sucursalID,
    inventoryWarehouseID: capture.captureMeta.almacenPrincipalID,
    inventoryWarehouse: capture.captureMeta.almacenPrincipal ?? text(capture.stocks[0]?.almacen),
    inventoryRows: capture.stocks.length,
    uniqueInventoryProducts: stockProductIDs.size,
    duplicateInventoryRows: capture.captureMeta.inventoryDuplicateRows ?? stockRowIDs.length - distinct(stockRowIDs),
    invalidInventoryRows: capture.captureMeta.inventoryInvalidRows ?? capture.stocks.filter((row) => !text(row.productoID)).length,
    positiveUnit1Products: capture.stocks.filter((row) => number(row.unidad1Disponible) > 0).length,
    zeroUnit1Products: capture.stocks.filter((row) => number(row.unidad1Disponible) === 0).length,
    negativeUnit1Products: capture.stocks.filter((row) => number(row.unidad1Disponible) < 0).length,
    missingInventoryProducts: [...productIDs].filter((id) => !stockProductIDs.has(id)).length,
    activeMasterProducts: activeMasterProductIDs.size,
    inactiveMasterProducts: capture.products.filter((row) => text(row.estado) === 'I').length,
    unknownMasterProducts: capture.products.filter((row) => !['A', 'I'].includes(text(row.estado))).length,
    primaryUnits: countBy(capture.products, 'unidad1'),
    secondaryUnits: countBy(capture.products, 'unidad2'),
    missingPrimaryUnit: capture.products.filter((row) => !text(row.unidad1)).length,
    invalidUnit2Ratio: capture.products.filter((row) => text(row.unidad2) && number(row.unidad2XUnidad1) <= 0).length,
    priceRows: capture.prices.length,
    pricedProducts: priceProductIDs.size,
    priceRowsForBranch3: capture.prices.filter((row) => number(row.sucursalID) === 3).length,
    positivePriceRowsForBranch3: capture.prices.filter((row) => number(row.sucursalID) === 3 && number(row.precio) > 0).length,
    priceBranchIDs: countBy(capture.prices, 'sucursalID'),
    priceChannelIDs: countBy(capture.prices, 'canalDeVentaID'),
    soldProducts180d: soldProductIDs.size,
    catalogActiveOrNonzeroInventoryOrSales: catalogProductIDs.size,
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
    creditTermsValid: invoiceCreditTerms.filter((value) => value != null).length,
    creditTermsInvalid: invoiceCreditTerms.filter((value) => value == null).length,
    creditTermDays: quantiles(invoiceCreditTerms.filter((value): value is number => value != null)),
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
  logistics: {
    coverageFrom: capture.captureMeta.logisticsFrom ?? '',
    sheets: deliverySheets.length,
    openSheets: deliverySheets.filter((row) => ['1', 'A'].includes(text(row.estado).toUpperCase()) && !date(row.fechaCerrada)).length,
    closedSheets: deliverySheets.filter((row) => ['2', 'C'].includes(text(row.estado).toUpperCase()) || Boolean(date(row.fechaCerrada))).length,
    sheetsWithDriver: deliverySheets.filter((row) => number(row.repartidorID) > 0).length,
    sheetsWithAssignedDocuments: deliverySheets.filter((row) => Array.isArray(row.listaDeComprobantesAsignados) && row.listaDeComprobantesAsignados.length > 0).length,
    assignedDocuments: assignedDeliveryDocuments.length,
    assignedInvoicesInCapture: assignedInvoiceIDs.size,
    explicitlyUnassignedInvoicesInCapture: unassignedDeliveryInvoiceIDs.size,
    invoiceAssignmentsDuplicated: assignedDeliveryDocuments.map(documentKey).filter((id, index, rows) => invoiceIDs.has(id) && rows.indexOf(id) !== index).length,
  },
  sourceWarnings: capture.captureMeta.optionalEndpointWarnings,
};

console.log(JSON.stringify(report, null, 2));

const requiredIssues: string[] = [];
const qualityWarnings: string[] = [];
const require = (condition: boolean, message: string) => { if (!condition) requiredIssues.push(message); };
require(capture.captureMeta.empresaID === 3, `Empresa de inventario ${capture.captureMeta.empresaID}; esperada 3.`);
require(capture.captureMeta.sucursalID === 3, `Sucursal de inventario ${capture.captureMeta.sucursalID}; esperada 3.`);
require(capture.captureMeta.almacenPrincipalID === 2, `Depósito de inventario ${capture.captureMeta.almacenPrincipalID}; esperado 2.`);
require(capture.captureMeta.inventoryIncludesZeroStock === true, 'La captura no certifica incluir productos sin existencias.');
require(capture.products.length === productIDs.size, 'El maestro contiene productoID duplicados.');
require(capture.stocks.length === stockProductIDs.size, 'Las existencias normalizadas contienen productoID duplicados.');
require([...productIDs].every((id) => stockProductIDs.has(id)), 'Hay maestros sin fila de existencias en la captura completa.');
require([...stockProductIDs].every((id) => productIDs.has(id)), 'Hay existencias cuyo productoID no existe en el maestro.');
require(capture.stocks.every((row) => number(row.empresaID) === 3 && number(row.sucursalID) === 3 && number(row.almacenID) === 2), 'Hay filas de existencias fuera de empresa 3 / sucursal 3 / depósito 2.');
require(capture.stocks.every((row) => Number.isFinite(Number(row.unidad1Disponible)) && Number.isFinite(Number(row.unidad2Disponible))), 'Hay existencias con unidades disponibles no numéricas.');
if ((capture.captureMeta.inventoryDuplicateRows ?? 0) > 0) qualityWarnings.push(`${capture.captureMeta.inventoryDuplicateRows} fila(s) de existencias duplicada(s) fueron deduplicadas.`);
if ((capture.captureMeta.inventoryInvalidRows ?? 0) > 0) qualityWarnings.push(`${capture.captureMeta.inventoryInvalidRows} fila(s) de existencias sin productoID fueron excluidas.`);
if (capture.products.some((row) => !text(row.unidad1))) qualityWarnings.push(`${capture.products.filter((row) => !text(row.unidad1)).length} maestro(s) no informan unidad primaria.`);
if (capture.products.some((row) => text(row.unidad2) && number(row.unidad2XUnidad1) <= 0)) qualityWarnings.push(`${capture.products.filter((row) => text(row.unidad2) && number(row.unidad2XUnidad1) <= 0).length} maestro(s) informan U2 sin una relación positiva U2/U1.`);

if (requiredIssues.length) {
  console.error(`Auditoría de captura fallida: ${requiredIssues.length} requisito(s).`);
  requiredIssues.forEach((issue) => console.error(`- ${issue}`));
  process.exitCode = 1;
} else {
  console.log(`Auditoría de captura consistente: 0 fallas requeridas; ${qualityWarnings.length} salvedad(es).`);
  qualityWarnings.forEach((warning) => console.warn(`- ${warning}`));
}
