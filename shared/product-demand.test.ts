import { describe, expect, it } from 'vitest';
import { classifyDemandStability, classifyDemandTrend, demandHistoryStatus, demandPeriodRanges } from './product-demand';

describe('demanda y rotación de productos', () => {
  it('crea ventanas inclusivas y períodos anteriores equivalentes', () => {
    expect(demandPeriodRanges('2026-07-22', 30)).toEqual({
      current: { from: '2026-06-23', through: '2026-07-22' },
      previous: { from: '2026-05-24', through: '2026-06-22' },
    });
    expect(demandPeriodRanges('2026-07-22', 180).previous).toEqual({ from: '2025-07-28', through: '2026-01-23' });
  });

  it('diferencia historia incompleta de ausencia de demanda', () => {
    const ranges = demandPeriodRanges('2026-07-22', 180);
    expect(demandHistoryStatus('2025-12-01', ranges)).toBe('partial_comparison');
    expect(classifyDemandTrend({ currentUnits: 0, previousUnits: 0, firstSaleAt: '', currentFrom: ranges.current.from, historyStatus: 'partial_comparison' })).toBe('insufficient_history');
    expect(classifyDemandTrend({ currentUnits: 0, previousUnits: 4, firstSaleAt: '2025-09-01', currentFrom: ranges.current.from, historyStatus: 'complete' })).toBe('no_demand');
  });

  it('identifica aceleración, caída y primera venta observable sin opacidad', () => {
    const base = { firstSaleAt: '2025-01-01', currentFrom: '2026-04-24', historyStatus: 'complete' as const };
    expect(classifyDemandTrend({ ...base, currentUnits: 125, previousUnits: 100 })).toBe('accelerating');
    expect(classifyDemandTrend({ ...base, currentUnits: 75, previousUnits: 100 })).toBe('declining');
    expect(classifyDemandTrend({ ...base, firstSaleAt: '2026-06-01', currentUnits: 8, previousUnits: 0 })).toBe('new_observed');
  });

  it('mide estabilidad sobre tres subperíodos iguales', () => {
    expect(classifyDemandStability([30, 32, 28]).status).toBe('stable');
    expect(classifyDemandStability([10, 30, 20]).status).toBe('variable');
    expect(classifyDemandStability([0, 0, 40]).status).toBe('intermittent');
    expect(classifyDemandStability([0, 0, 0]).status).toBe('insufficient');
  });
});
