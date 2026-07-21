import { resolve } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type {
  SalesExplorerClientRow,
  SalesExplorerDocumentDetail,
  SalesExplorerDocumentRow,
  SalesExplorerFilters,
  SalesExplorerMeta,
  SalesExplorerMetrics,
  SalesExplorerPayload,
  SalesExplorerPeriodRow,
  SalesExplorerProductRow,
} from '../shared/models.js';
import { decodeMultiFilter, normalizeMultiFilter } from '../shared/multi-filter.js';
import { resolveActiveDataPaths } from './data-bundle.js';
import { metricShare, readMovementMetrics, type SqlValue } from './report-metrics.js';
import { compileMovementUniverse, EXECUTABLE_UNIVERSES } from './report-universes.js';
import { ReloadableReadonlyDatabase } from './reloadable-database.js';

const reportPath = () => process.env.SALICE_SPT_DB_PATH
  ? resolve(process.env.SALICE_SPT_DB_PATH)
  : resolveActiveDataPaths().commercial;

const UNIVERSE = EXECUTABLE_UNIVERSES.commercialSales;
// The limit protects the API while keeping the complete synthetic demo universe.
const DIMENSION_LIMIT = 2_000;
const MAX_PAGE_SIZE = 100;

let cachedMeta: SalesExplorerMeta | null = null;
const reportDatabase = new ReloadableReadonlyDatabase(reportPath);

function db() {
  const current = reportDatabase.get();
  if (current?.changed) cachedMeta = null;
  return current?.database ?? null;
}

function rows<T>(statement: StatementSync, parameters: SqlValue[] = []) {
  return statement.all(...parameters) as T[];
}

function placeholders(values: readonly unknown[]) {
  return values.map(() => '?').join(', ');
}

function metadata(database: DatabaseSync) {
  return new Map(rows<{ key: string; value: string }>(database.prepare('SELECT key, value FROM report_meta')).map((row) => [row.key, row.value]));
}

function baseUniverse() {
  return compileMovementUniverse(UNIVERSE);
}

function validDate(value: unknown) {
  const text = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

function shiftDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function inclusiveDays(from: string, to: string) {
  return Math.max(1, Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000) + 1);
}

export function getSalesExplorerPath() {
  return reportPath();
}

export function getSalesExplorerMeta(): SalesExplorerMeta {
  const database = db();
  if (cachedMeta) return cachedMeta;
  const unavailable: SalesExplorerMeta = {
    available: false,
    sourceSystem: 'Synthetic local commercial database',
    capturedAt: '',
    minDate: '',
    maxDate: '',
    rowCount: 0,
    sourceDocumentCount: 0,
    unavailableDocumentCount: 0,
    options: { sellers: [], clients: [], products: [], brands: [], categories: [], channels: [], zones: [] },
    universe: {
      id: UNIVERSE.id,
      companies: [...UNIVERSE.companies],
      branches: [...UNIVERSE.branches],
      allowedIssuers: [...UNIVERSE.allowedIssuers],
      excludedClients: [...UNIVERSE.excludedClients],
    },
  };
  if (!database) return unavailable;
  const universe = baseUniverse();
  const profile = database.prepare(`
    SELECT MIN(sale_date) AS minDate, MAX(sale_date) AS maxDate, COUNT(*) AS rowCount,
      COUNT(DISTINCT source_document_key) AS sourceDocumentCount
    FROM movements WHERE ${universe.sql}
  `).get(...universe.parameters) as { minDate: string | null; maxDate: string | null; rowCount: number; sourceDocumentCount: number };
  if (!profile.minDate || !profile.maxDate) return unavailable;
  const distinct = (column: string) => rows<{ value: string }>(database.prepare(`
    SELECT DISTINCT TRIM(${column}) AS value FROM movements
    WHERE ${universe.sql} AND TRIM(${column}) <> '' ORDER BY value COLLATE NOCASE
  `), universe.parameters).map((row) => row.value);
  const clients = rows<{ value: string; label: string }>(database.prepare(`
    SELECT CAST(client_id AS TEXT) AS value,
      CAST(client_id AS TEXT) || ' · ' || COALESCE(MAX(NULLIF(TRIM(client_name), '')), 'Unnamed customer') AS label
    FROM movements WHERE ${universe.sql}
    GROUP BY client_id ORDER BY MAX(client_name) COLLATE NOCASE
  `), universe.parameters);
  const products = rows<{ value: string; label: string }>(database.prepare(`
    SELECT product_id AS value, product_id || ' · ' || COALESCE(MAX(NULLIF(TRIM(product_name), '')), 'Unnamed product') AS label
    FROM movements WHERE ${universe.sql}
    GROUP BY product_id ORDER BY MAX(product_name) COLLATE NOCASE
  `), universe.parameters);
  const meta = metadata(database);
  cachedMeta = {
    ...unavailable,
    available: true,
    sourceSystem: meta.get('source_system') ?? unavailable.sourceSystem,
    capturedAt: meta.get('captured_at') ?? '',
    minDate: profile.minDate,
    maxDate: profile.maxDate,
    rowCount: Number(profile.rowCount),
    sourceDocumentCount: Number(meta.get('source_document_count') ?? profile.sourceDocumentCount),
    unavailableDocumentCount: Number(meta.get('unavailable_document_count') ?? 0),
    options: {
      sellers: distinct('seller'),
      clients,
      products,
      brands: distinct('brand'),
      categories: distinct('category'),
      channels: distinct('channel'),
      zones: distinct('zone'),
    },
  };
  return cachedMeta;
}

export function normalizeSalesExplorerFilters(input: Partial<Record<string, unknown>>, meta = getSalesExplorerMeta()): SalesExplorerFilters {
  const defaultFrom = shiftDays(meta.maxDate, -89) < meta.minDate ? meta.minDate : shiftDays(meta.maxDate, -89);
  let from = validDate(input.from) ?? defaultFrom;
  let to = validDate(input.to) ?? meta.maxDate;
  if (from < meta.minDate) from = meta.minDate;
  if (to > meta.maxDate) to = meta.maxDate;
  if (from > to) [from, to] = [to, from];
  const clientOptions = meta.options.clients.map((option) => option.value);
  const productOptions = meta.options.products.map((option) => option.value);
  return {
    from,
    to,
    seller: normalizeMultiFilter(input.seller, meta.options.sellers),
    client: normalizeMultiFilter(input.client, clientOptions),
    product: normalizeMultiFilter(input.product, productOptions),
    brand: normalizeMultiFilter(input.brand, meta.options.brands),
    category: normalizeMultiFilter(input.category, meta.options.categories),
    channel: normalizeMultiFilter(input.channel, meta.options.channels),
    zone: normalizeMultiFilter(input.zone, meta.options.zones),
  };
}

export function buildSalesExplorerWhere(filters: SalesExplorerFilters) {
  const universe = baseUniverse();
  const clauses = [universe.sql, 'sale_date >= ?', 'sale_date <= ?'];
  const parameters: SqlValue[] = [...universe.parameters, filters.from, filters.to];
  const textDimensions: Array<[keyof SalesExplorerFilters, string]> = [
    ['seller', 'seller'], ['product', 'product_id'], ['brand', 'brand'], ['category', 'category'], ['channel', 'channel'], ['zone', 'zone'],
  ];
  for (const [key, column] of textDimensions) {
    const selected = decodeMultiFilter(filters[key]);
    if (selected.length) {
      clauses.push(`${column} IN (${placeholders(selected)})`);
      parameters.push(...selected);
    }
  }
  const clients = decodeMultiFilter(filters.client).map(Number).filter(Number.isFinite);
  if (clients.length) {
    clauses.push(`client_id IN (${placeholders(clients)})`);
    parameters.push(...clients);
  }
  return { sql: clauses.join(' AND '), parameters };
}

function completeMetrics(database: DatabaseSync, where: ReturnType<typeof buildSalesExplorerWhere>): SalesExplorerMetrics {
  const metrics = readMovementMetrics(database, where.sql, where.parameters);
  const documents = Number(database.prepare(`SELECT COUNT(DISTINCT source_document_key) AS total FROM movements WHERE ${where.sql}`).get(...where.parameters)?.total ?? 0);
  return {
    ...metrics,
    documents,
    averageTicket: documents ? metrics.netAmount / documents : null,
    averagePricePerKilo: metrics.kilos ? metrics.netAmount / metrics.kilos : null,
  };
}

function mapGroupedMetrics(row: Record<string, unknown>): SalesExplorerMetrics {
  const netAmount = Number(row.netAmount ?? 0);
  const kilos = Number(row.kilos ?? 0);
  const documents = Number(row.documents ?? 0);
  return {
    netAmount,
    kilos,
    units: Number(row.units ?? 0),
    clients: Number(row.clients ?? 0),
    documents,
    averageTicket: documents ? netAmount / documents : null,
    averagePricePerKilo: kilos ? netAmount / kilos : null,
  };
}

function timeline(database: DatabaseSync, where: ReturnType<typeof buildSalesExplorerWhere>, filters: SalesExplorerFilters) {
  const grain: SalesExplorerPayload['timelineGrain'] = inclusiveDays(filters.from, filters.to) <= 62 ? 'day' : 'month';
  const expression = grain === 'day' ? 'sale_date' : "substr(sale_date, 1, 7)";
  const raw = rows<Record<string, unknown>>(database.prepare(`
    SELECT ${expression} AS period,
      COALESCE(SUM(net_amount), 0) AS netAmount,
      COALESCE(SUM(kilos), 0) AS kilos,
      COALESCE(SUM(units), 0) AS units,
      COUNT(DISTINCT client_id) AS clients,
      COUNT(DISTINCT source_document_key) AS documents
    FROM movements WHERE ${where.sql}
    GROUP BY ${expression} ORDER BY period
  `), where.parameters);
  const values: SalesExplorerPeriodRow[] = raw.map((row) => {
    const key = String(row.period);
    const from = grain === 'day' ? key : `${key}-01`;
    const naturalTo = grain === 'day' ? key : new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0, 12)).toISOString().slice(0, 10);
    return {
      key,
      label: key,
      from: from < filters.from ? filters.from : from,
      to: naturalTo > filters.to ? filters.to : naturalTo,
      ...mapGroupedMetrics(row),
    };
  });
  return { grain, values };
}

function clientRows(database: DatabaseSync, where: ReturnType<typeof buildSalesExplorerWhere>, total: number): SalesExplorerClientRow[] {
  return rows<Record<string, unknown>>(database.prepare(`
    SELECT client_id AS clientId, MAX(client_name) AS name, MAX(seller) AS seller, MAX(zone) AS zone,
      COALESCE(SUM(net_amount), 0) AS netAmount, COALESCE(SUM(kilos), 0) AS kilos,
      COALESCE(SUM(units), 0) AS units, 1 AS clients,
      COUNT(DISTINCT source_document_key) AS documents,
      COUNT(DISTINCT product_id) AS products, MAX(sale_date) AS lastSaleAt
    FROM movements WHERE ${where.sql}
    GROUP BY client_id ORDER BY netAmount DESC LIMIT ${DIMENSION_LIMIT}
  `), where.parameters).map((row) => ({
    clientId: Number(row.clientId),
    name: String(row.name || `Customer ${row.clientId}`),
    seller: String(row.seller || 'No seller'),
    zone: String(row.zone || 'No zone'),
    products: Number(row.products ?? 0),
    lastSaleAt: String(row.lastSaleAt || ''),
    share: metricShare(Number(row.netAmount ?? 0), total),
    ...mapGroupedMetrics(row),
  }));
}

function productRows(database: DatabaseSync, where: ReturnType<typeof buildSalesExplorerWhere>, total: number): SalesExplorerProductRow[] {
  return rows<Record<string, unknown>>(database.prepare(`
    SELECT product_id AS productId, MAX(product_name) AS name, MAX(brand) AS brand, MAX(category) AS category,
      COALESCE(SUM(net_amount), 0) AS netAmount, COALESCE(SUM(kilos), 0) AS kilos,
      COALESCE(SUM(units), 0) AS units, COUNT(DISTINCT client_id) AS clients,
      COUNT(DISTINCT source_document_key) AS documents, MAX(sale_date) AS lastSaleAt
    FROM movements WHERE ${where.sql}
    GROUP BY product_id ORDER BY netAmount DESC LIMIT ${DIMENSION_LIMIT}
  `), where.parameters).map((row) => ({
    productId: String(row.productId),
    name: String(row.name || row.productId),
    brand: String(row.brand || 'Unbranded'),
    category: String(row.category || 'No category'),
    lastSaleAt: String(row.lastSaleAt || ''),
    share: metricShare(Number(row.netAmount ?? 0), total),
    ...mapGroupedMetrics(row),
  }));
}

const documentNumberExpression = `CASE
  WHEN TRIM(series) <> '' THEN TRIM(series) || '-' || printf('%04d', point_of_sale_id) || '-' || printf('%08d', invoice_number)
  ELSE printf('%04d', point_of_sale_id) || '-' || printf('%08d', invoice_number) END`;

function documentRows(database: DatabaseSync, where: ReturnType<typeof buildSalesExplorerWhere>, page: number, pageSize: number) {
  const total = Number(database.prepare(`
    SELECT COUNT(*) AS total FROM (SELECT source_document_key FROM movements WHERE ${where.sql} GROUP BY source_document_key)
  `).get(...where.parameters)?.total ?? 0);
  const values: SalesExplorerDocumentRow[] = rows<Record<string, unknown>>(database.prepare(`
    SELECT source_document_key AS key, ${documentNumberExpression} AS documentNumber,
      MAX(sale_date) AS date, MAX(source_kind) AS kind, MAX(client_id) AS clientId,
      MAX(client_name) AS client, MAX(seller) AS seller,
      COALESCE(SUM(net_amount), 0) AS netAmount, COALESCE(SUM(kilos), 0) AS kilos,
      COALESCE(SUM(units), 0) AS units, COUNT(*) AS items
    FROM movements WHERE ${where.sql}
    GROUP BY source_document_key
    ORDER BY date DESC, source_document_key DESC LIMIT ? OFFSET ?
  `), [...where.parameters, pageSize, (page - 1) * pageSize]).map((row) => ({
    key: String(row.key),
    documentNumber: String(row.documentNumber),
    date: String(row.date),
    kind: String(row.kind) === 'credit_note' ? 'credit_note' : 'invoice',
    clientId: Number(row.clientId),
    client: String(row.client || `Customer ${row.clientId}`),
    seller: String(row.seller || 'No seller'),
    netAmount: Number(row.netAmount ?? 0),
    kilos: Number(row.kilos ?? 0),
    units: Number(row.units ?? 0),
    items: Number(row.items ?? 0),
  }));
  return { values, total };
}

export function buildSalesExplorer(input: Partial<Record<string, unknown>>): SalesExplorerPayload | null {
  const database = db();
  const meta = getSalesExplorerMeta();
  if (!database || !meta.available) return null;
  const filters = normalizeSalesExplorerFilters(input, meta);
  const where = buildSalesExplorerWhere(filters);
  const summary = completeMetrics(database, where);
  const periods = timeline(database, where, filters);
  const page = Math.max(1, Number.parseInt(String(input.page ?? '1'), 10) || 1);
  const pageSize = Math.max(10, Math.min(MAX_PAGE_SIZE, Number.parseInt(String(input.pageSize ?? '40'), 10) || 40));
  const documents = documentRows(database, where, page, pageSize);
  return {
    generatedAt: new Date().toISOString(),
    sourceMaxDate: meta.maxDate,
    filters,
    summary,
    timelineGrain: periods.grain,
    timeline: periods.values,
    clients: clientRows(database, where, summary.netAmount),
    products: productRows(database, where, summary.netAmount),
    documents: documents.values,
    documentPagination: { page, pageSize, total: documents.total, pages: Math.max(1, Math.ceil(documents.total / pageSize)) },
    resultLimits: { clients: DIMENSION_LIMIT, products: DIMENSION_LIMIT },
  };
}

export function getSalesExplorerDocument(key: string): SalesExplorerDocumentDetail | null {
  const database = db();
  if (!database) return null;
  const universe = baseUniverse();
  const raw = rows<Record<string, unknown>>(database.prepare(`
    SELECT source_document_key AS key, ${documentNumberExpression} AS documentNumber,
      sale_date AS date, source_kind AS kind, client_id AS clientId, client_name AS client,
      seller, issuer_name AS issuer, branch_name AS branch, address, locality,
      product_id AS productId, product_name AS product, brand, category, units, kilos, net_amount AS netAmount
    FROM movements WHERE ${universe.sql} AND source_document_key = ?
    ORDER BY source_item_id
  `), [...universe.parameters, key]);
  if (!raw.length) return null;
  const first = raw[0];
  return {
    key: String(first.key),
    documentNumber: String(first.documentNumber),
    date: String(first.date),
    kind: String(first.kind) === 'credit_note' ? 'credit_note' : 'invoice',
    clientId: Number(first.clientId),
    client: String(first.client),
    seller: String(first.seller || 'No seller'),
    issuer: String(first.issuer || ''),
    branch: String(first.branch || ''),
    address: String(first.address || ''),
    locality: String(first.locality || ''),
    netAmount: raw.reduce((sum, row) => sum + Number(row.netAmount ?? 0), 0),
    kilos: raw.reduce((sum, row) => sum + Number(row.kilos ?? 0), 0),
    units: raw.reduce((sum, row) => sum + Number(row.units ?? 0), 0),
    items: raw.length,
    lineItems: raw.map((row) => ({
      productId: String(row.productId),
      product: String(row.product),
      brand: String(row.brand || 'Unbranded'),
      category: String(row.category || 'No category'),
      units: Number(row.units ?? 0),
      kilos: Number(row.kilos ?? 0),
      netAmount: Number(row.netAmount ?? 0),
    })),
  };
}

export interface SalesExportRow {
  date: string;
  document: string;
  documentType: string;
  seller: string;
  clientId: number;
  client: string;
  productId: string;
  product: string;
  brand: string;
  category: string;
  channel: string;
  zone: string;
  kilos: number;
  units: number;
  netAmount: number;
}

export function forEachSalesExportRow(input: Partial<Record<string, unknown>>, consume: (row: SalesExportRow) => void) {
  const database = db();
  const meta = getSalesExplorerMeta();
  if (!database || !meta.available) return { filters: null, rows: 0 };
  const filters = normalizeSalesExplorerFilters(input, meta);
  const where = buildSalesExplorerWhere(filters);
  const statement = database.prepare(`
    SELECT sale_date AS date, ${documentNumberExpression} AS document, source_kind AS documentType,
      seller, client_id AS clientId, client_name AS client, product_id AS productId,
      product_name AS product, brand, category, channel, zone, kilos, units, net_amount AS netAmount
    FROM movements WHERE ${where.sql}
    ORDER BY sale_date, source_document_key, source_item_id
  `);
  let count = 0;
  for (const raw of statement.iterate(...where.parameters) as Iterable<Record<string, unknown>>) {
    consume({
      date: String(raw.date), document: String(raw.document), documentType: String(raw.documentType),
      seller: String(raw.seller || 'No seller'), clientId: Number(raw.clientId), client: String(raw.client),
      productId: String(raw.productId), product: String(raw.product), brand: String(raw.brand || 'Unbranded'),
      category: String(raw.category || 'No category'), channel: String(raw.channel || 'No channel'), zone: String(raw.zone || 'No zone'),
      kilos: Number(raw.kilos ?? 0), units: Number(raw.units ?? 0), netAmount: Number(raw.netAmount ?? 0),
    });
    count += 1;
  }
  return { filters, rows: count };
}
