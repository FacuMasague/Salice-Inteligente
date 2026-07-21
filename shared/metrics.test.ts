import { describe, expect, it } from 'vitest';
import { METRIC_CATALOG, REPORT_UNIVERSES, metricCatalogSummary } from './metrics';
import { REPORT_ENDPOINT_METRICS } from './metric-links';

describe('central metrics and universes catalog', () => {
  it('keeps unique identifiers and auditable definitions', () => {
    expect(new Set(METRIC_CATALOG.map((metric) => metric.id)).size).toBe(METRIC_CATALOG.length);
    expect(METRIC_CATALOG.every((metric) => metric.formula && metric.source && metric.dateBasis && metric.consumers.length)).toBe(true);
  });

  it('documents every implemented report', () => {
    expect(REPORT_UNIVERSES.map((universe) => universe.id)).toEqual(expect.arrayContaining([
      'salice-operational', 'spt-main', 'commercial-sales', 'mars', 'nutripet',
      'baires', 'non-buyers', 'general-status', 'pending-balances',
    ]));
  });

  it('versions the contract exposed by the API', () => {
    expect(metricCatalogSummary().version).toBe('2.0.0');
  });

  it('links every endpoint to existing canonical identifiers', () => {
    const known = new Set(METRIC_CATALOG.map((metric) => metric.id));
    expect(Object.values(REPORT_ENDPOINT_METRICS).flat().every((id) => known.has(id))).toBe(true);
  });
});
