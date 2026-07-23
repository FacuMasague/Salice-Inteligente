import { describe, expect, it } from 'vitest';
import { METRIC_CATALOG, REPORT_UNIVERSES, metricCatalogSummary } from './metrics';
import { REPORT_ENDPOINT_METRICS } from './metric-links';

describe('catálogo central de métricas y universos', () => {
  it('mantiene identificadores únicos y definiciones auditables', () => {
    expect(new Set(METRIC_CATALOG.map((metric) => metric.id)).size).toBe(METRIC_CATALOG.length);
    expect(METRIC_CATALOG.every((metric) => metric.formula && metric.source && metric.dateBasis && metric.consumers.length)).toBe(true);
  });

  it('documenta todos los reportes migrados', () => {
    expect(REPORT_UNIVERSES.map((universe) => universe.id)).toEqual(expect.arrayContaining([
      'salice-operational', 'spt-main', 'commercial-sales', 'mars', 'nutripet',
      'baires', 'non-buyers', 'general-status', 'pending-balances',
    ]));
  });

  it('versiona el contrato expuesto por la API', () => {
    expect(metricCatalogSummary().version).toBe('1.6.0');
  });

  it('vincula cada endpoint con identificadores canónicos existentes', () => {
    const known = new Set(METRIC_CATALOG.map((metric) => metric.id));
    expect(Object.values(REPORT_ENDPOINT_METRICS).flat().every((id) => known.has(id))).toBe(true);
  });
});
