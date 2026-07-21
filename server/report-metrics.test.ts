import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { buildCommercialSalesReport, getCommercialSalesReportMeta } from './commercial-sales-report';
import { metricRatio, metricShare, metricVariation, readMovementMetrics } from './report-metrics';
import { compileMovementUniverse, EXECUTABLE_UNIVERSES } from './report-universes';
import { resolveActiveDataPaths } from './data-bundle';

const databasePath = resolveActiveDataPaths().commercial;
const describeWithDatabase = existsSync(databasePath) ? describe : describe.skip;

describe('métricas derivadas canónicas', () => {
  it('mantiene una sola semántica para cociente, variación y participación', () => {
    expect(metricRatio(75, 100)).toBe(75);
    expect(metricVariation(75, 100)).toBe(-25);
    expect(metricShare(25, 100)).toBe(25);
    expect(metricRatio(10, 0)).toBeNull();
    expect(metricVariation(10, 0)).toBeNull();
    expect(metricShare(10, 0)).toBe(0);
  });
});

describeWithDatabase('reconciliación ejecutable de métricas', () => {
  it('iguala el KPI de Ventas Comercial con la consulta canónica bajo el mismo universo y corte', () => {
    const meta = getCommercialSalesReportMeta();
    const report = buildCommercialSalesReport({ frequency: 'month', period: meta.latestMonth });
    expect(report).not.toBeNull();
    const database = new DatabaseSync(databasePath, { readOnly: true });
    const universe = compileMovementUniverse(EXECUTABLE_UNIVERSES.commercialSales);
    const start = `${meta.latestMonth}-01`;
    const canonical = readMovementMetrics(database, `${universe.sql} AND sale_date >= ? AND sale_date <= ?`, [...universe.parameters, start, meta.maxDate]);
    database.close();
    expect(report?.current).toEqual(canonical);
  });
});
