import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveActiveDataPaths } from './data-bundle';
import { buildInvoiceDetail } from './invoice-detail';
import { buildSalesExplorer, getSalesExplorerMeta } from './sales-explorer';
import { loadSnapshot } from './store';

const describeWithDatabase = existsSync(resolveActiveDataPaths().commercial) ? describe : describe.skip;

describeWithDatabase('unified document detail', () => {
  it('combines the operational header with commercial rows without inventing missing detail', async () => {
    const meta = getSalesExplorerMeta();
    const report = buildSalesExplorer({ from: meta.maxDate, to: meta.maxDate, pageSize: 10 });
    const row = report?.documents[0];
    expect(row).toBeDefined();
    const detail = buildInvoiceDetail(await loadSnapshot(), row!.key);
    expect(detail).not.toBeNull();
    expect(detail).toMatchObject({
      id: row!.key,
      number: row!.documentNumber,
      kind: row!.kind,
      detailAvailable: true,
    });
    expect(detail?.lineItems.length).toBe(row!.items);
    expect(detail?.lineItems.reduce((sum, item) => sum + item.netAmount, 0)).toBeCloseTo(detail!.netAmount!, 6);
    expect(detail?.sourceMaxDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
