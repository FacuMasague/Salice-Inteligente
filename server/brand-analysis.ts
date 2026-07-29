import type { DatabaseSync } from 'node:sqlite';
import type { BrandAnalysisPayload, BrandProductAnalysis } from '../shared/brand-analysis.js';
import type { Product } from '../shared/models.js';
import { resolveActiveDataPaths } from './data-bundle.js';
import { ReloadableReadonlyDatabase } from './reloadable-database.js';
import { compileMovementUniverse, EXECUTABLE_UNIVERSES } from './report-universes.js';

const source = new ReloadableReadonlyDatabase(() => resolveActiveDataPaths().commercial);
const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));
const brandExpression = "COALESCE(NULLIF(TRIM(brand), ''), 'Sin marca informada')";

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function kiloConversionCase(products: Pick<Product, 'id' | 'contentKg'>[]) {
  const withConversion = products.filter((product) => Number(product.contentKg) > 0);
  return {
    sql: withConversion.length
      ? `CASE product_id ${withConversion.map(() => 'WHEN ? THEN ?').join(' ')} ELSE NULL END`
      : 'NULL',
    parameters: withConversion.flatMap((product) => [product.id, Number(product.contentKg)]),
  };
}

export function buildBrandAnalysisFromDatabase(database: DatabaseSync, catalog: Pick<Product, 'id' | 'contentKg'>[] = []): BrandAnalysisPayload {
  const meta = new Map((database.prepare('SELECT key, value FROM report_meta').all() as { key: string; value: string }[]).map((row) => [row.key, row.value]));
  const through = meta.get('max_date') ?? '';
  if (!through) throw new Error('La base comercial no declara una fecha máxima.');
  const from = shiftDate(through, -89);
  const commercialUniverse = compileMovementUniverse(EXECUTABLE_UNIVERSES.commercialSales);
  const commonWhere = `${commercialUniverse.sql} AND source_kind IN ('invoice', 'credit_note') AND sale_date BETWEEN ? AND ?`;
  const parameters = [...commercialUniverse.parameters, from, through];
  const conversion = kiloConversionCase(catalog);
  const weightedParameters = [...conversion.parameters, ...parameters];
  const totalsRow = database.prepare(`
    WITH weighted AS (SELECT *, ${conversion.sql} AS kg_per_unit FROM movements)
    SELECT COALESCE(SUM(net_amount), 0) netAmount,
      COALESCE(SUM(CASE WHEN kg_per_unit > 0 THEN units * kg_per_unit ELSE 0 END), 0) kilos,
      COALESCE(SUM(units), 0) units, COUNT(DISTINCT client_id) buyers
    FROM weighted WHERE ${commonWhere}
  `).get(...weightedParameters) as { netAmount: number; kilos: number; units: number; buyers: number };
  const totals = {
    netAmount: round(Number(totalsRow.netAmount ?? 0)),
    kilos: round(Number(totalsRow.kilos ?? 0)),
    units: round(Number(totalsRow.units ?? 0)),
    buyers: Number(totalsRow.buyers ?? 0),
  };
  const products = database.prepare(`
    WITH weighted AS (SELECT *, ${conversion.sql} AS kg_per_unit FROM movements)
    SELECT ${brandExpression} brandName, product_id productId,
      MAX(product_name) productName, COALESCE(SUM(net_amount), 0) netAmount,
      COALESCE(SUM(CASE WHEN kg_per_unit > 0 THEN units * kg_per_unit ELSE 0 END), 0) kilos,
      COALESCE(SUM(units), 0) units,
      COUNT(DISTINCT client_id) buyers
    FROM weighted WHERE ${commonWhere}
    GROUP BY ${brandExpression}, product_id
  `).all(...weightedParameters) as unknown as Array<BrandProductAnalysis & { brandName: string }>;
  const productsByBrand = new Map<string, BrandProductAnalysis[]>();
  for (const product of products) {
    const { brandName, ...values } = product;
    productsByBrand.set(brandName, [...(productsByBrand.get(brandName) ?? []), {
      ...values,
      netAmount: round(Number(values.netAmount)),
      kilos: round(Number(values.kilos)),
      units: round(Number(values.units)),
      buyers: Number(values.buyers),
    }]);
  }
  const brandRows = database.prepare(`
    WITH weighted AS (SELECT *, ${conversion.sql} AS kg_per_unit FROM movements)
    SELECT ${brandExpression} name, COALESCE(SUM(net_amount), 0) netAmount,
      COALESCE(SUM(CASE WHEN kg_per_unit > 0 THEN units * kg_per_unit ELSE 0 END), 0) kilos,
      COALESCE(SUM(units), 0) units,
      COUNT(DISTINCT client_id) buyers
    FROM weighted WHERE ${commonWhere}
    GROUP BY ${brandExpression}
  `).all(...weightedParameters) as Array<{ name: string; netAmount: number; kilos: number; units: number; buyers: number }>;
  const soldProductIds = new Set((database.prepare(`
    SELECT DISTINCT product_id FROM movements WHERE ${commonWhere} AND units != 0
  `).all(...parameters) as { product_id: string }[]).map((row) => row.product_id));
  const convertibleProductIds = new Set(catalog.filter((product) => Number(product.contentKg) > 0).map((product) => product.id));
  return {
    generatedAt: new Date().toISOString(),
    sourceSystem: meta.get('source_system') ?? 'GESI API · base comercial',
    sourceMaxDate: through,
    coverageFrom: meta.get('coverage_from') || meta.get('min_date') || '',
    unavailableDocumentCount: Number(meta.get('unavailable_document_count') ?? 0),
    productsWithoutKiloConversion: [...soldProductIds].filter((id) => !convertibleProductIds.has(id)).length,
    windowDays: 90,
    range: { from, through },
    totals,
    brands: brandRows.map((row) => ({
      name: row.name,
      netAmount: round(Number(row.netAmount)),
      kilos: round(Number(row.kilos)),
      units: round(Number(row.units)),
      buyers: Number(row.buyers),
      salesSharePercent: totals.netAmount ? round(Number(row.netAmount) / totals.netAmount * 100, 2) : 0,
      kiloSharePercent: totals.kilos ? round(Number(row.kilos) / totals.kilos * 100, 2) : 0,
      products: (productsByBrand.get(row.name) ?? []).sort((a, b) => b.netAmount - a.netAmount),
    })).sort((a, b) => b.netAmount - a.netAmount || a.name.localeCompare(b.name, 'es')),
    rules: {
      documents: 'Facturas y notas de crédito del universo central de Ventas Comercial, dentro de los 90 días terminados en la fecha de corte.',
      missingBrand: 'Los renglones sin marca se incluyen como “Sin marca informada” en los denominadores de dinero y kilos.',
      coverage: 'Los comprobantes sin detalle no pueden atribuirse a una marca ni a sus kilos.',
      kilos: 'Los kilos se estiman como unidades netas × contenido neto por U1. Los productos sin una presentación convertible no aportan kilos al denominador.',
    },
  };
}

export function buildBrandAnalysis(products: Pick<Product, 'id' | 'contentKg'>[] = []) {
  const opened = source.get();
  return opened ? buildBrandAnalysisFromDatabase(opened.database, products) : null;
}

export function getBrandAnalysisPath() {
  return source.path();
}
