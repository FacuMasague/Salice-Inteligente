import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { recommendProducts } from '../shared/algorithms.js';
import type { DashboardData } from '../shared/models.js';
import { analyzeProductVectors } from '../shared/product-vector-audit.js';
import { resolveActiveDataPaths } from '../server/data-bundle.js';

const snapshotPath = resolve(process.env.SALICE_SNAPSHOT_PATH ?? resolveActiveDataPaths().snapshot);
const previousPath = process.env.SALICE_PREVIOUS_SNAPSHOT_PATH ? resolve(process.env.SALICE_PREVIOUS_SNAPSHOT_PATH) : null;
const outputPath = resolve(process.env.SALICE_VECTOR_AUDIT_OUTPUT_PATH ?? resolveActiveDataPaths().vectorAudit);
const current = JSON.parse(await readFile(snapshotPath, 'utf8')) as DashboardData;
const previous = previousPath && previousPath !== snapshotPath
  ? await readFile(previousPath, 'utf8').then((value) => JSON.parse(value) as DashboardData).catch(() => null)
  : null;
const audit = analyzeProductVectors(current, previous);

// The deterministic bounded sample reports which products reach a
// low-confidence recommendation without turning the audit into an O(n³) process.
const sampledClients = current.clients.filter((client) => client.active).sort((a, b) => a.id - b.id).slice(0, 100);
const insufficient = new Map<string, { productId: string; name: string; clients: number }>();
for (const client of sampledClients) {
  for (const recommendation of recommendProducts(client, current.clients, current.products)) {
    if (recommendation.confidence !== 'insufficient') continue;
    const existing = insufficient.get(recommendation.product.id) ?? { productId: recommendation.product.id, name: recommendation.product.name, clients: 0 };
    existing.clients += 1;
    insufficient.set(recommendation.product.id, existing);
  }
}
const result = {
  ...audit,
  recommendationReview: {
    sampledActiveClients: sampledClients.length,
    productsRecommendedWithInsufficientConfidence: [...insufficient.values()].sort((a, b) => b.clients - a.clients || a.name.localeCompare(b.name)).slice(0, 200),
  },
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
