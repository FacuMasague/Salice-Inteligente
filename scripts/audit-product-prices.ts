import { DatabaseSync } from 'node:sqlite';
import { initializeProductPriceHistory } from '../server/product-price-history.js';
import { getOperationalDatabasePath, listProductPriceSnapshots, productPriceHistoryStats } from '../server/operational-store.js';
import { loadSnapshot } from '../server/store.js';

const snapshot = await loadSnapshot();
await initializeProductPriceHistory(snapshot);
const stats = productPriceHistoryStats();
const history = listProductPriceSnapshots();
const current = history.filter((point) => point.snapshotAt === snapshot.meta.generatedAt);
const byProduct = new Map(current.map((point) => [point.productId, point]));
const mismatches = snapshot.products.filter((product) => {
  const point = byProduct.get(product.id);
  const expected = product.price > 0 ? product.price : null;
  return !point || point.referencePrice !== expected;
});
const database = new DatabaseSync(getOperationalDatabasePath(), { readOnly: true });
const triggerNames = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all() as { name: string }[]).map((row) => row.name));
const integrity = String(database.prepare('PRAGMA integrity_check').get()?.integrity_check ?? '');
database.close();

const required = {
  integrity: integrity === 'ok',
  activeSnapshotCoverage: current.length === snapshot.products.length,
  activeSnapshotMatches: mismatches.length === 0,
  appendOnlyUpdate: triggerNames.has('prevent_product_price_snapshot_update'),
  appendOnlyDelete: triggerNames.has('prevent_product_price_snapshot_delete'),
};
const warnings = {
  comparableSnapshotsAvailable: stats.snapshots >= 2,
};
const failed = Object.entries(required).filter(([, passed]) => !passed).map(([id]) => id);
const result = {
  generatedAt: new Date().toISOString(),
  status: failed.length ? 'failed' : warnings.comparableSnapshotsAvailable ? 'passed' : 'passed_with_warnings',
  sourceSnapshotAt: snapshot.meta.generatedAt,
  stats,
  required,
  warnings,
  failures: failed,
  mismatchSample: mismatches.slice(0, 20).map((product) => product.id),
};
console.log(JSON.stringify(result, null, 2));
if (failed.length) process.exitCode = 1;
