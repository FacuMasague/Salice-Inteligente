import { resolve } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type {
  PendingBalanceAgingRow,
  PendingBalanceClientRow,
  PendingBalanceFilters,
  PendingBalanceDocumentRow,
  PendingBalanceReportMeta,
  PendingBalanceReportPayload,
  PendingBalanceSellerRow,
} from '../shared/models.js';
import { decodeMultiFilter, normalizeMultiFilter } from '../shared/multi-filter.js';
import { PENDING_BALANCE_SELLERS } from './pending-balances-build.js';
import { resolveActiveDataPaths } from './data-bundle.js';
import { metricRatio as ratio } from './report-metrics.js';
import { ReloadableReadonlyDatabase } from './reloadable-database.js';

const reportPath = () => process.env.SALICE_PENDING_BALANCES_DB_PATH
  ? resolve(process.env.SALICE_PENDING_BALANCES_DB_PATH)
  : resolveActiveDataPaths().pendingBalances;

type SqlValue = string | number;
type RawClientRow = {
  client_id: number;
  client_name: string;
  trade_name: string;
  seller: string;
  payment_method: string;
  active: number;
  pending_balance: number;
  overdue_balance: number;
  earliest_due: string | null;
  oldest_overdue_days: number;
  open_documents: number;
  overdue_documents: number;
  term_total_days: number;
  term_average_days: number | null;
  sales_30: number;
};

let cachedMeta: PendingBalanceReportMeta | null = null;
const reportDatabase = new ReloadableReadonlyDatabase(reportPath);

function db() {
  const current = reportDatabase.get();
  if (current?.changed) cachedMeta = null;
  return current?.database ?? null;
}

function rows<T>(statement: StatementSync, parameters: SqlValue[] = []) {
  return statement.all(...parameters) as T[];
}

function metadata(value: DatabaseSync) {
  return new Map(rows<{ key: string; value: string }>(value.prepare('SELECT key, value FROM report_meta')).map((row) => [row.key, row.value]));
}

function normalizeFilters(input: Partial<Record<string, unknown>>, meta: PendingBalanceReportMeta): PendingBalanceFilters {
  return {
    seller: normalizeMultiFilter(input.seller, meta.options.sellers),
    paymentMethod: normalizeMultiFilter(input.paymentMethod, meta.options.paymentMethods),
    status: normalizeMultiFilter(input.status, ['overdue', 'not_due']),
  };
}

function where(filters: PendingBalanceFilters, alias = '') {
  const prefix = alias ? `${alias}.` : '';
  const clauses = ['1 = 1'];
  const parameters: SqlValue[] = [];
  const sellers = decodeMultiFilter(filters.seller);
  const paymentMethods = decodeMultiFilter(filters.paymentMethod);
  const statuses = decodeMultiFilter(filters.status);
  if (sellers.length) { clauses.push(`${prefix}seller IN (${sellers.map(() => '?').join(', ')})`); parameters.push(...sellers); }
  if (paymentMethods.length) { clauses.push(`${prefix}payment_method IN (${paymentMethods.map(() => '?').join(', ')})`); parameters.push(...paymentMethods); }
  if (statuses.length === 1 && statuses[0] === 'overdue') clauses.push(`${prefix}overdue_balance > 0.01`);
  if (statuses.length === 1 && statuses[0] === 'not_due') clauses.push(`${prefix}overdue_balance <= 0.01`);
  return { sql: clauses.join(' AND '), parameters };
}

export function getPendingBalancesReportPath() {
  return reportPath();
}

export function getPendingBalancesReportMeta(): PendingBalanceReportMeta {
  const value = db();
  if (cachedMeta) return cachedMeta;
  const unavailable: PendingBalanceReportMeta = {
    available: false,
    sourceSystem: 'GESI API · saldos, comprobantes pendientes y ventas Salice',
    capturedAt: '',
    asOfDate: '',
    salesFrom: '',
    clientCount: 0,
    documentCount: 0,
    options: { sellers: PENDING_BALANCE_SELLERS, paymentMethods: [] },
    universe: {
      companies: [3],
      branches: [3],
      excludedSellerGroup: 'MM',
      visibleSellers: PENDING_BALANCE_SELLERS,
      balanceRule: 'Clientes con comprobantes débito abiertos y vencimiento válido',
    },
  };
  if (!value) return unavailable;
  const meta = metadata(value);
  const profile = value.prepare('SELECT COUNT(*) AS clients FROM clients').get() as { clients: number };
  cachedMeta = {
    ...unavailable,
    available: true,
    sourceSystem: meta.get('source_system') ?? unavailable.sourceSystem,
    capturedAt: meta.get('captured_at') ?? '',
    asOfDate: meta.get('as_of_date') ?? '',
    salesFrom: meta.get('sales_from') ?? '',
    clientCount: Number(meta.get('client_count') ?? profile.clients),
    documentCount: Number(meta.get('document_count') ?? 0),
    options: {
      sellers: JSON.parse(meta.get('sellers') ?? JSON.stringify(PENDING_BALANCE_SELLERS)) as string[],
      paymentMethods: rows<{ payment_method: string }>(value.prepare('SELECT DISTINCT payment_method FROM clients ORDER BY payment_method COLLATE NOCASE')).map((row) => row.payment_method),
    },
  };
  return cachedMeta;
}

function clientRows(value: DatabaseSync, filters: PendingBalanceFilters): PendingBalanceClientRow[] {
  const filter = where(filters);
  return rows<RawClientRow>(value.prepare(`SELECT * FROM clients WHERE ${filter.sql}
    ORDER BY CASE WHEN sales_30 <= 0 AND overdue_balance > 0 THEN 1 ELSE 0 END DESC,
             CASE WHEN sales_30 > 0 THEN overdue_balance / sales_30 ELSE 0 END DESC,
             client_name COLLATE NOCASE`), filter.parameters).map((row) => ({
    clientId: Number(row.client_id),
    name: row.client_name,
    tradeName: row.trade_name,
    seller: row.seller,
    paymentMethod: row.payment_method,
    active: Boolean(row.active),
    pendingBalance: Number(row.pending_balance),
    overdueBalance: Number(row.overdue_balance),
    overdueShare: ratio(Number(row.overdue_balance), Number(row.pending_balance)) ?? 0,
    earliestDue: row.earliest_due,
    oldestOverdueDays: Number(row.oldest_overdue_days),
    openDocuments: Number(row.open_documents),
    overdueDocuments: Number(row.overdue_documents),
    creditTermTotalDays: Number(row.term_total_days),
    creditTermAverageDays: row.term_average_days == null ? null : Number(row.term_average_days),
    sales30: Number(row.sales_30),
    overdueToSales30: ratio(Number(row.overdue_balance), Number(row.sales_30)),
  }));
}

function sellerRows(clients: PendingBalanceClientRow[]): PendingBalanceSellerRow[] {
  const grouped = new Map<string, PendingBalanceSellerRow>();
  for (const client of clients) {
    const row = grouped.get(client.seller) ?? { seller: client.seller, clients: 0, overdueClients: 0, pendingBalance: 0, overdueBalance: 0, overdueShare: 0, sales30: 0, overdueToSales30: null };
    row.clients += 1;
    row.overdueClients += Number(client.overdueBalance > .01);
    row.pendingBalance += client.pendingBalance;
    row.overdueBalance += client.overdueBalance;
    row.sales30 += client.sales30;
    grouped.set(client.seller, row);
  }
  return [...grouped.values()].map((row) => ({
    ...row,
    overdueShare: ratio(row.overdueBalance, row.pendingBalance) ?? 0,
    overdueToSales30: ratio(row.overdueBalance, row.sales30),
  })).sort((left, right) => right.overdueBalance - left.overdueBalance);
}

function agingRows(value: DatabaseSync, filters: PendingBalanceFilters, asOfDate: string): PendingBalanceAgingRow[] {
  const filter = where(filters, 'c');
  const raw = rows<{ key: PendingBalanceAgingRow['key']; amount: number; documents: number }>(value.prepare(`
    SELECT CASE
      WHEN d.due_at >= ? THEN 'not_due'
      WHEN CAST(julianday(?) - julianday(d.due_at) AS INTEGER) > 90 THEN 'overdue_90'
      WHEN CAST(julianday(?) - julianday(d.due_at) AS INTEGER) > 60 THEN 'overdue_61_90'
      WHEN CAST(julianday(?) - julianday(d.due_at) AS INTEGER) > 30 THEN 'overdue_31_60'
      ELSE 'overdue_1_30' END AS key,
      COALESCE(SUM(d.outstanding), 0) AS amount, COUNT(*) AS documents
    FROM documents d JOIN clients c ON c.client_id = d.client_id
    WHERE ${filter.sql} GROUP BY key
  `), [asOfDate, asOfDate, asOfDate, asOfDate, ...filter.parameters]);
  const map = new Map(raw.map((row) => [row.key, row]));
  const definitions: { key: PendingBalanceAgingRow['key']; label: string }[] = [
    { key: 'overdue_90', label: 'Más de 90 días' },
    { key: 'overdue_61_90', label: '61–90 días' },
    { key: 'overdue_31_60', label: '31–60 días' },
    { key: 'overdue_1_30', label: '1–30 días' },
    { key: 'not_due', label: 'A vencer' },
  ];
  const total = raw.reduce((sum, row) => sum + Number(row.amount), 0);
  return definitions.map((definition) => {
    const row = map.get(definition.key);
    const amount = Number(row?.amount ?? 0);
    return { ...definition, amount, documents: Number(row?.documents ?? 0), share: ratio(amount, total) ?? 0 };
  });
}

export function buildPendingBalancesReport(input: Partial<Record<string, unknown>>): PendingBalanceReportPayload | null {
  const value = db();
  const meta = getPendingBalancesReportMeta();
  if (!value || !meta.available) return null;
  const filters = normalizeFilters(input, meta);
  const clients = clientRows(value, filters);
  const pendingBalance = clients.reduce((sum, row) => sum + row.pendingBalance, 0);
  const overdueBalance = clients.reduce((sum, row) => sum + row.overdueBalance, 0);
  const sales30 = clients.reduce((sum, row) => sum + row.sales30, 0);
  return {
    generatedAt: new Date().toISOString(),
    sourceMaxDate: meta.asOfDate,
    salesWindowFrom: meta.salesFrom,
    filters,
    pendingBalance,
    overdueBalance,
    overdueShare: ratio(overdueBalance, pendingBalance) ?? 0,
    sales30,
    overdueToSales30: ratio(overdueBalance, sales30),
    clientsWithBalance: clients.length,
    overdueClients: clients.filter((row) => row.overdueBalance > .01).length,
    openDocuments: clients.reduce((sum, row) => sum + row.openDocuments, 0),
    overdueDocuments: clients.reduce((sum, row) => sum + row.overdueDocuments, 0),
    sellers: sellerRows(clients),
    clients,
    aging: agingRows(value, filters, meta.asOfDate),
  };
}

export function listPendingBalanceDocuments(clientIds?: number[]): PendingBalanceDocumentRow[] {
  const value = db();
  const meta = getPendingBalancesReportMeta();
  if (!value || !meta.available) return [];
  const validIds = [...new Set((clientIds ?? []).filter(Number.isFinite))];
  const filter = validIds.length ? `WHERE client_id IN (${validIds.map(() => '?').join(', ')})` : '';
  return rows<{
    document_id: string;
    client_id: number;
    document_number: string;
    issued_at: string;
    due_at: string;
    outstanding: number;
    credit_term_days: number | null;
    status: string;
  }>(value.prepare(`SELECT * FROM documents ${filter} ORDER BY due_at, document_number`), validIds).map((row) => ({
    documentId: row.document_id,
    clientId: Number(row.client_id),
    documentNumber: row.document_number,
    issuedAt: row.issued_at,
    dueAt: row.due_at,
    outstanding: Number(row.outstanding),
    creditTermDays: row.credit_term_days == null ? null : Number(row.credit_term_days),
    status: row.status === 'overdue' ? 'overdue' : 'not_due',
    overdueDays: row.due_at < meta.asOfDate
      ? Math.max(0, Math.round((new Date(`${meta.asOfDate}T12:00:00Z`).getTime() - new Date(`${row.due_at}T12:00:00Z`).getTime()) / 86_400_000))
      : 0,
  }));
}
