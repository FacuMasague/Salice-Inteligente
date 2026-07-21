import { readFileSync } from 'node:fs';
import { optimizeRoute, recommendProducts } from '../shared/algorithms.js';
import { SNAPSHOT_REVISION, VECTOR_LABELS, type DashboardData } from '../shared/models.js';
import { resolveActiveDataPaths } from '../server/data-bundle.js';
import { ensureLocalDemoData } from '../server/local-demo-data.js';

ensureLocalDemoData();
const data = JSON.parse(readFileSync(resolveActiveDataPaths().snapshot, 'utf8')) as DashboardData;
const issues: string[] = [];
const check = (condition: boolean, message: string) => { if (!condition) issues.push(message); };
const productIds = new Set(data.products.map((product) => product.id));
const snapshotDate = data.meta.generatedAt.slice(0, 10);

check(data.meta.source === 'demo', 'Snapshot source must be synthetic demo data.');
check(data.meta.sourceLabel === 'Synthetic local demo dataset', 'Snapshot source label is unexpected.');
check(data.meta.revision === SNAPSHOT_REVISION, `Snapshot revision ${data.meta.revision} does not match ${SNAPSHOT_REVISION}.`);
check(data.clients.length >= 12 && data.products.length >= 12, 'The demo catalog is too small for the advertised workflows.');
check(new Set(data.clients.map((client) => client.id)).size === data.clients.length, 'Duplicate customer IDs.');
check(productIds.size === data.products.length, 'Duplicate product IDs.');
check(data.meta.disclaimer?.includes('fictional') === true, 'Synthetic-data disclaimer is missing.');

for (const product of data.products) {
  const values = Object.values(product.vector);
  check(values.length === Object.keys(VECTOR_LABELS).length, `${product.id}: incomplete product vector.`);
  check(values.every((value) => value >= 0 && value <= 100), `${product.id}: vector value outside 0–100.`);
  check(product.price >= 0 && product.stock >= 0, `${product.id}: invalid price or stock.`);
}

for (const client of data.clients) {
  check(client.purchases.every((purchase) => productIds.has(purchase.productId)), `${client.id}: purchase references an unknown product.`);
  const purchaseTotal = client.purchases.reduce((sum, purchase) => sum + purchase.total, 0);
  check(Math.abs(purchaseTotal + client.unmappedSales90d - client.sales90d) < .02, `${client.id}: 90-day sales do not reconcile.`);
  check([client.collectionRisk, client.commercialOpportunity, client.visitPriority].every((value) => value >= 0 && value <= 100), `${client.id}: score outside 0–100.`);
  check(client.nextVisitAt >= snapshotDate, `${client.id}: suggested visit predates the snapshot.`);
  const owned = new Set(client.purchases.map((purchase) => purchase.productId));
  check(recommendProducts(client, data.clients, data.products).every((item) => !owned.has(item.product.id)), `${client.id}: recommendation repeats a purchased product.`);
}

const routeIds = [...data.clients].sort((a, b) => b.visitPriority - a.visitPriority).slice(0, 5).map((client) => client.id);
const route = optimizeRoute(routeIds, data.clients);
check(route.stops.length === routeIds.length, 'Route optimizer omitted a selected stop.');
check(new Set(route.stops.map((stop) => stop.clientId)).size === routeIds.length, 'Route optimizer repeated a stop.');

const result = {
  status: issues.length ? 'failed' : 'passed',
  source: data.meta.sourceLabel,
  clients: data.clients.length,
  products: data.products.length,
  openDocuments: data.clients.flatMap((client) => client.invoices).filter((invoice) => invoice.outstanding > 0).length,
  issues,
};
console.log(JSON.stringify(result, null, 2));
if (issues.length) process.exitCode = 1;
