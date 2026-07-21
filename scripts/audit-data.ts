import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateNormalizedSnapshot } from '../server/gesi/normalize.js';
import { optimizeRoute, recommendProducts } from '../shared/algorithms.js';
import { SNAPSHOT_REVISION, VECTOR_LABELS, type DashboardData } from '../shared/models.js';
import { resolveActiveDataPaths } from '../server/data-bundle.js';

const snapshotPath = resolve(process.env.SALICE_SNAPSHOT_PATH ?? resolveActiveDataPaths().snapshot);
const data = JSON.parse(await readFile(snapshotPath, 'utf8')) as DashboardData;
const issues = data.meta.source === 'gesi' ? validateNormalizedSnapshot(data) : [];
const productIDs = new Set(data.products.map((product) => product.id));
const snapshotDate = data.meta.generatedAt.slice(0, 10);
const vectorDimensions = Object.keys(VECTOR_LABELS).length;
const recommendationAuditIDs = new Set(data.clients.filter((client) => client.active).slice(0, 20).map((client) => client.id));

const check = (condition: boolean, message: string) => { if (!condition) issues.push(message); };
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

check(data.meta.revision === SNAPSHOT_REVISION, `Revisión ${data.meta.revision} != ${SNAPSHOT_REVISION}`);
check(new Set(data.products.map((product) => product.id)).size === data.products.length, 'Hay IDs de producto duplicados');
check(new Set(data.clients.map((client) => client.id)).size === data.clients.length, 'Hay IDs de cliente duplicados');

for (const product of data.products) {
  const values = Object.values(product.vector);
  check(values.length === vectorDimensions, `${product.id}: el vector no tiene ${vectorDimensions} dimensiones`);
  check(values.every((value) => value >= 0 && value <= 100), `${product.id}: vector fuera de 0–100`);
  check(product.price >= 0 && product.stock >= 0 && product.monthlyUnits >= 0, `${product.id}: precio, stock o rotación inválidos`);
}

for (const client of data.clients) {
  const prefix = `Cliente ${client.id}`;
  check(client.active === (client.gesiStateId === 1), `${prefix}: estado activo incoherente`);
  check(Boolean(client.statusUpdatedAt), `${prefix}: falta fecha de actualización de estado`);
  check(client.portfolioStatus === 'confirmed' || client.portfolioStatus === 'review', `${prefix}: pertenencia Salice inválida`);
  check([client.collectionRisk, client.commercialOpportunity, client.visitPriority, client.onTimePaymentRate].every((value) => value >= 0 && value <= 100), `${prefix}: puntajes fuera de 0–100`);
  check(client.paymentDelayTrend.length <= client.paymentSampleSize, `${prefix}: tendencia contra vencimiento sin muestra suficiente`);
  check(client.overdueOutstanding >= 0 && client.oldestOverdueDays >= 0, `${prefix}: deuda vencida inválida`);
  const purchaseTotal = roundMoney(client.purchases.reduce((sum, purchase) => sum + purchase.total, 0));
  check(client.purchases.every((purchase) => productIDs.has(purchase.productId)), `${prefix}: compra con producto inexistente`);
  check(Math.abs(roundMoney(purchaseTotal + client.unmappedSales90d - client.sales90d)) <= .02, `${prefix}: facturación 90d no reconciliada`);
  check(client.paymentSampleSize >= client.paymentTrend.length, `${prefix}: muestra de pago incoherente`);
  check(client.creditTermOptions.reduce((sum, option) => sum + option.invoiceCount, 0) === client.creditTermSampleSize, `${prefix}: resumen de plazos no reconcilia`);
  check(client.creditTermStatus !== 'mixed' || client.creditTermOptions.length > 1, `${prefix}: condición mixta sin alternativas`);
  check(client.nextVisitAt >= snapshotDate, `${prefix}: próxima visita anterior al snapshot`);

  for (const invoice of client.invoices) {
    if (invoice.status === 'paid') check(Boolean(invoice.paidAt) && invoice.outstanding === 0, `${prefix}/${invoice.id}: pagada incoherente`);
    if (invoice.status === 'overdue') check(invoice.dueAt < snapshotDate && invoice.outstanding > 0, `${prefix}/${invoice.id}: vencida incoherente`);
    if (invoice.status === 'due_soon') check(invoice.dueAt >= snapshotDate && invoice.dueAt <= addDays(snapshotDate, 7) && invoice.outstanding > 0, `${prefix}/${invoice.id}: próximo vencimiento incoherente`);
    if (invoice.status === 'open') check(invoice.dueAt > addDays(snapshotDate, 7) && invoice.outstanding > 0, `${prefix}/${invoice.id}: comprobante abierto incoherente`);
  }

  if (recommendationAuditIDs.has(client.id)) {
    const owned = new Set(client.purchases.map((purchase) => purchase.productId));
    const recommendations = recommendProducts(client, data.clients, data.products);
    check(recommendations.every((item) => !owned.has(item.product.id)), `${prefix}: se recomienda un producto ya comprado`);
    check(recommendations.every((item, index) => index === 0 || recommendations[index - 1].score >= item.score), `${prefix}: recomendaciones desordenadas`);
    check(recommendations.every((item) => ['reliable', 'exploratory', 'insufficient'].includes(item.confidence) && item.peerSampleSize >= 0), `${prefix}: confianza de recomendación inválida`);
  }
}

const routable = data.clients.filter((client) => client.active && client.coordinates !== null);
const priorityIDs = [...routable].sort((a, b) => b.visitPriority - a.visitPriority).slice(0, 5).map((client) => client.id);
const route = optimizeRoute(priorityIDs, data.clients);
check(route.stops.length === priorityIDs.length, 'La ruta no contiene todas las paradas geolocalizadas');
check(new Set(route.stops.map((stop) => stop.clientId)).size === priorityIDs.length, 'La ruta repite clientes');
if (priorityIDs.length) check(route.totalKm > 0 && route.totalMinutes > 0, 'La ruta no tiene distancia o duración');
check(route.assumptions.visitMinutes > 0 && route.assumptions.maxWorkMinutes > 0, 'La ruta no informa sus supuestos');
check(route.feasible === (route.warnings.length === 0), 'La factibilidad de ruta no coincide con sus alertas');

const totals = {
  source: data.meta.source,
  clients: data.clients.length,
  activeClients: data.clients.filter((client) => client.active).length,
  inactiveClients: data.clients.filter((client) => !client.active).length,
  geocodedClients: data.clients.filter((client) => client.coordinates !== null).length,
  activeGeocodedClients: routable.length,
  products: data.products.length,
  pricedProducts: data.products.filter((product) => product.price > 0).length,
  sales90d: roundMoney(data.clients.reduce((sum, client) => sum + client.sales90d, 0)),
  activeSales90d: roundMoney(data.clients.filter((client) => client.active).reduce((sum, client) => sum + client.sales90d, 0)),
  netBalance: roundMoney(data.clients.reduce((sum, client) => sum + client.balance, 0)),
  openDocuments: data.clients.flatMap((client) => client.invoices).filter((invoice) => invoice.outstanding > 0).length,
  paymentSamples: data.clients.reduce((sum, client) => sum + client.paymentSampleSize, 0),
  creditTermInvoices: data.clients.reduce((sum, client) => sum + client.creditTermSampleSize, 0),
  clientsWithObservedCreditTerms: data.clients.filter((client) => client.creditTermSampleSize > 0).length,
  clientsWithMixedCreditTerms: data.clients.filter((client) => client.creditTermStatus === 'mixed').length,
};

if (issues.length) {
  console.error(`Auditoría fallida: ${issues.length} problema(s)`);
  issues.slice(0, 100).forEach((issue) => console.error(`- ${issue}`));
  process.exitCode = 1;
} else {
  console.log('Auditoría consistente: 0 problemas');
  console.log(JSON.stringify(totals, null, 2));
}
