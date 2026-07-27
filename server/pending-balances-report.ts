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
import {
  EXCLUDED_RECEIVABLE_CLIENT_NAMES,
  MIN_RECEIVABLE_DOCUMENT_AMOUNT,
  isActionableReceivableAmount,
  isExcludedReceivableClient,
} from '../shared/receivables-policy.js';
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
type RawDocumentRow = {
  document_id: string;
  client_id: number;
  document_number: string;
  issued_at: string;
  due_at: string;
  outstanding: number;
  credit_term_days: number | null;
  payment_method: string;
  status: string;
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

function where(filters: PendingBalanceFilters, alias = '', includeStatus = true) {
  const prefix = alias ? `${alias}.` : '';
  const clauses = ['1 = 1'];
  const parameters: SqlValue[] = [];
  const sellers = decodeMultiFilter(filters.seller);
  const paymentMethods = decodeMultiFilter(filters.paymentMethod);
  const statuses = decodeMultiFilter(filters.status);
  if (sellers.length) { clauses.push(`${prefix}seller IN (${sellers.map(() => '?').join(', ')})`); parameters.push(...sellers); }
  if (paymentMethods.length) { clauses.push(`${prefix}payment_method IN (${paymentMethods.map(() => '?').join(', ')})`); parameters.push(...paymentMethods); }
  if (includeStatus && statuses.length === 1 && statuses[0] === 'overdue') clauses.push(`${prefix}overdue_balance > 0.01`);
  if (includeStatus && statuses.length === 1 && statuses[0] === 'not_due') clauses.push(`${prefix}overdue_balance <= 0.01`);
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
      balanceRule: 'Facturas y notas de débito abiertas con vencimiento válido y saldo pendiente desde $1.000',
      minimumDocumentOutstanding: MIN_RECEIVABLE_DOCUMENT_AMOUNT,
      excludedClients: [...EXCLUDED_RECEIVABLE_CLIENT_NAMES],
    },
  };
  if (!value) return unavailable;
  const meta = metadata(value);
  const policyClientIds = new Set(rows<{ client_id: number; client_name: string; trade_name: string }>(
    value.prepare('SELECT client_id, client_name, trade_name FROM clients'),
  ).filter((row) => !isExcludedReceivableClient(row.client_name, row.trade_name)).map((row) => Number(row.client_id)));
  const policyDocuments = rows<{ client_id: number; outstanding: number }>(
    value.prepare('SELECT client_id, outstanding FROM documents'),
  ).filter((row) => policyClientIds.has(Number(row.client_id)) && isActionableReceivableAmount(row.outstanding));
  const clientsWithDocuments = new Set(policyDocuments.map((row) => Number(row.client_id)));
  cachedMeta = {
    ...unavailable,
    available: true,
    sourceSystem: meta.get('source_system') ?? unavailable.sourceSystem,
    capturedAt: meta.get('captured_at') ?? '',
    asOfDate: meta.get('as_of_date') ?? '',
    salesFrom: meta.get('sales_from') ?? '',
    clientCount: clientsWithDocuments.size,
    documentCount: policyDocuments.length,
    options: {
      sellers: JSON.parse(meta.get('sellers') ?? JSON.stringify(PENDING_BALANCE_SELLERS)) as string[],
      paymentMethods: rows<{ payment_method: string }>(value.prepare('SELECT DISTINCT payment_method FROM clients ORDER BY payment_method COLLATE NOCASE')).map((row) => row.payment_method),
    },
    universe: {
      ...unavailable.universe,
      minimumDocumentOutstanding: Number(meta.get('minimum_document_outstanding') ?? MIN_RECEIVABLE_DOCUMENT_AMOUNT),
      excludedClients: JSON.parse(meta.get('excluded_clients') ?? JSON.stringify(EXCLUDED_RECEIVABLE_CLIENT_NAMES)) as string[],
    },
  };
  return cachedMeta;
}

function rawDocumentRows(value: DatabaseSync, clientIds?: number[]): RawDocumentRow[] {
  const validIds = [...new Set((clientIds ?? []).filter(Number.isFinite))];
  if (clientIds && !validIds.length) return [];
  const filter = validIds.length ? `WHERE d.client_id IN (${validIds.map(() => '?').join(', ')})` : '';
  const hasDocumentPaymentMethod = rows<{ name: string }>(value.prepare('PRAGMA table_info(documents)')).some((column) => column.name === 'payment_method');
  return rows<RawDocumentRow>(value.prepare(`SELECT d.*, ${hasDocumentPaymentMethod ? 'd.payment_method' : 'c.payment_method'} AS payment_method
    FROM documents d JOIN clients c ON c.client_id = d.client_id ${filter}
    ORDER BY d.due_at, d.document_number`), validIds)
    .filter((row) => isActionableReceivableAmount(row.outstanding));
}

function clientRows(value: DatabaseSync, filters: PendingBalanceFilters, asOfDate: string): PendingBalanceClientRow[] {
  const filter = where(filters, '', false);
  const rawClients = rows<RawClientRow>(value.prepare(`SELECT * FROM clients WHERE ${filter.sql}`), filter.parameters)
    .filter((row) => !isExcludedReceivableClient(row.client_name, row.trade_name));
  const documentsByClient = new Map<number, RawDocumentRow[]>();
  for (const document of rawDocumentRows(value, rawClients.map((row) => Number(row.client_id)))) {
    const current = documentsByClient.get(Number(document.client_id)) ?? [];
    current.push(document);
    documentsByClient.set(Number(document.client_id), current);
  }
  const statuses = decodeMultiFilter(filters.status);
  return rawClients.map((row): PendingBalanceClientRow | null => {
    const documents = documentsByClient.get(Number(row.client_id)) ?? [];
    if (!documents.length) return null;
    const overdue = documents.filter((document) => document.due_at < asOfDate);
    const pendingBalance = documents.reduce((sum, document) => sum + Number(document.outstanding), 0);
    const overdueBalance = overdue.reduce((sum, document) => sum + Number(document.outstanding), 0);
    if (statuses.length === 1 && statuses[0] === 'overdue' && overdueBalance <= .01) return null;
    if (statuses.length === 1 && statuses[0] === 'not_due' && overdueBalance > .01) return null;
    const termDays = documents.map((document) => document.credit_term_days).filter((days): days is number => days != null);
    const termTotal = termDays.reduce((sum, days) => sum + Number(days), 0);
    const sales30 = Number(row.sales_30);
    return {
      clientId: Number(row.client_id),
      name: row.client_name,
      tradeName: row.trade_name,
      seller: row.seller,
      paymentMethod: row.payment_method,
      active: Boolean(row.active),
      pendingBalance,
      overdueBalance,
      overdueShare: ratio(overdueBalance, pendingBalance) ?? 0,
      earliestDue: documents.map((document) => document.due_at).sort()[0] ?? null,
      oldestOverdueDays: overdue.length
        ? Math.max(...overdue.map((document) => Math.max(0, Math.round((new Date(`${asOfDate}T12:00:00Z`).getTime() - new Date(`${document.due_at}T12:00:00Z`).getTime()) / 86_400_000))))
        : 0,
      openDocuments: documents.length,
      overdueDocuments: overdue.length,
      creditTermTotalDays: termTotal,
      creditTermAverageDays: termDays.length ? termTotal / termDays.length : null,
      sales30,
      overdueToSales30: ratio(overdueBalance, sales30),
    };
  }).filter((row): row is PendingBalanceClientRow => row !== null)
    .sort((left, right) => (
      Number(right.sales30 <= 0 && right.overdueBalance > 0) - Number(left.sales30 <= 0 && left.overdueBalance > 0)
      || (right.sales30 > 0 ? right.overdueBalance / right.sales30 : 0) - (left.sales30 > 0 ? left.overdueBalance / left.sales30 : 0)
      || left.name.localeCompare(right.name, 'es')
    ));
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

function agingRows(documents: PendingBalanceDocumentRow[]): PendingBalanceAgingRow[] {
  const grouped = new Map<PendingBalanceAgingRow['key'], { amount: number; documents: number }>();
  for (const document of documents) {
    const key: PendingBalanceAgingRow['key'] = document.status !== 'overdue' ? 'not_due'
      : document.overdueDays > 90 ? 'overdue_90'
        : document.overdueDays > 60 ? 'overdue_61_90'
          : document.overdueDays > 30 ? 'overdue_31_60'
            : 'overdue_1_30';
    const current = grouped.get(key) ?? { amount: 0, documents: 0 };
    current.amount += document.outstanding;
    current.documents += 1;
    grouped.set(key, current);
  }
  const definitions: { key: PendingBalanceAgingRow['key']; label: string }[] = [
    { key: 'overdue_90', label: 'Más de 90 días' },
    { key: 'overdue_61_90', label: '61–90 días' },
    { key: 'overdue_31_60', label: '31–60 días' },
    { key: 'overdue_1_30', label: '1–30 días' },
    { key: 'not_due', label: 'A vencer' },
  ];
  const total = documents.reduce((sum, row) => sum + row.outstanding, 0);
  return definitions.map((definition) => {
    const row = grouped.get(definition.key);
    const amount = Number(row?.amount ?? 0);
    return { ...definition, amount, documents: Number(row?.documents ?? 0), share: ratio(amount, total) ?? 0 };
  });
}

export function buildPendingBalancesReport(input: Partial<Record<string, unknown>>): PendingBalanceReportPayload | null {
  const value = db();
  const meta = getPendingBalancesReportMeta();
  if (!value || !meta.available) return null;
  const filters = normalizeFilters(input, meta);
  const clients = clientRows(value, filters, meta.asOfDate);
  const documents = listPendingBalanceDocuments(clients.map((client) => client.clientId));
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
    aging: agingRows(documents),
  };
}

export function listPendingBalanceDocuments(clientIds?: number[]): PendingBalanceDocumentRow[] {
  const value = db();
  const meta = getPendingBalancesReportMeta();
  if (!value || !meta.available) return [];
  const allowedClientIds = new Set(rows<{ client_id: number; client_name: string; trade_name: string }>(
    value.prepare('SELECT client_id, client_name, trade_name FROM clients'),
  ).filter((client) => !isExcludedReceivableClient(client.client_name, client.trade_name)).map((client) => Number(client.client_id)));
  return rawDocumentRows(value, clientIds)
    .filter((row) => allowedClientIds.has(Number(row.client_id)))
    .map((row) => ({
    documentId: row.document_id,
    clientId: Number(row.client_id),
    documentNumber: row.document_number,
    issuedAt: row.issued_at,
    dueAt: row.due_at,
    outstanding: Number(row.outstanding),
    creditTermDays: row.credit_term_days == null ? null : Number(row.credit_term_days),
    paymentMethod: row.payment_method || 'Sin condición informada',
    status: row.status === 'overdue' ? 'overdue' : 'not_due',
    overdueDays: row.due_at < meta.asOfDate
      ? Math.max(0, Math.round((new Date(`${meta.asOfDate}T12:00:00Z`).getTime() - new Date(`${row.due_at}T12:00:00Z`).getTime()) / 86_400_000))
      : 0,
  }));
}
