import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveActiveDataPaths } from './data-bundle';
import { buildExecutiveSummary, loadExecutiveSummary } from './executive-summary';
import { loadSnapshot } from './store';

const paths = resolveActiveDataPaths();
const describeWithSources = existsSync(paths.commercial) && existsSync(paths.pendingBalances) ? describe : describe.skip;

describeWithSources('Resumen inicial ¿Cómo estamos?', () => {
  it('compone fuentes aceptadas sin sumar universos incompatibles', async () => {
    const data = await loadSnapshot();
    const summary = buildExecutiveSummary(data);
    expect(summary).not.toBeNull();
    expect(summary?.sales.netAmount).toBeGreaterThan(0);
    expect(summary?.sales.kilos).toBeGreaterThan(0);
    expect(summary?.sales.buyers).toBeGreaterThan(0);
    expect(summary?.goals.target).toBeGreaterThanOrEqual(0);
    if (summary!.goals.target > 0) {
      expect(summary?.goals.completion).toBeCloseTo((summary!.goals.actual / summary!.goals.target) * 100, 6);
    } else {
      expect(summary?.goals.completion).toBeNull();
    }
    expect(summary?.nonBuyers.accounts).toBeGreaterThanOrEqual(0);
    expect(summary?.balances.pending).toBeGreaterThanOrEqual(summary?.balances.overdue ?? 0);
    expect(summary?.sellerVariations.rows.length).toBeGreaterThan(0);
  }, 30_000);

  it('conserva contexto y navegación propios para cada bloque', async () => {
    const summary = buildExecutiveSummary(await loadSnapshot());
    const contexts = summary && [
      summary.sales.context,
      summary.goals.context,
      summary.nonBuyers.context,
      summary.balances.context,
      summary.sellerVariations.context,
      summary.logistics.context,
    ];
    expect(contexts).toHaveLength(6);
    contexts?.forEach((value) => {
      expect(value.definition.length).toBeGreaterThan(20);
      expect(value.period.length).toBeGreaterThan(5);
      expect(value.source.length).toBeGreaterThan(5);
      expect(value.universe.length).toBeGreaterThan(10);
      expect(value.destination.length).toBeGreaterThan(2);
    });
    expect(summary?.sales.context.universe).not.toBe(summary?.goals.context.universe);
    expect(summary?.logistics.context.warning).toContain('no confirma');
  }, 30_000);

  it('reconcilia los estados documentales con las facturas logísticas del snapshot', async () => {
    const data = await loadSnapshot();
    const summary = buildExecutiveSummary(data);
    expect(summary?.logistics.invoices).toBe(data.logistics.invoices.length);
    expect((summary?.logistics.unassigned ?? 0)
      + (summary?.logistics.openSheet ?? 0)
      + (summary?.logistics.closedSheet ?? 0)
      + (summary?.logistics.unknown ?? 0)).toBe(data.logistics.invoices.length);
  }, 30_000);

  it('carga el resumen persistido del mismo corte cuando el paquete lo incluye', async () => {
    const data = await loadSnapshot();
    const summary = await loadExecutiveSummary(data);
    expect(summary?.snapshotAt).toBe(data.meta.generatedAt);
  }, 30_000);
});
