import type {
  PendingBalanceAgingRow,
  PendingBalanceDocumentRow,
  ReceivableCaseDetail,
  ReceivableCaseStatus,
  ReceivableDashboardFilters,
  ReceivableDashboardPayload,
  ReceivableDashboardRow,
} from '../shared/models.js';
import { decodeMultiFilter, normalizeMultiFilter } from '../shared/multi-filter.js';
import { metricRatio } from './report-metrics.js';
import { buildPendingBalancesReport, getPendingBalancesReportMeta, listPendingBalanceDocuments } from './pending-balances-report.js';
import {
  emptyReceivableCase,
  getReceivableCase,
  listReceivableCaseEvents,
  listReceivableCases,
} from './operational-store.js';

export const RECEIVABLE_STATUSES: ReceivableCaseStatus[] = ['unmanaged', 'to_contact', 'in_progress', 'promise', 'disputed', 'resolved'];
export const RECEIVABLE_AGING = ['overdue_90', 'overdue_61_90', 'overdue_31_60', 'overdue_1_30', 'not_due'] as const;

function localDate(value = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(value);
}

function documentBand(document: PendingBalanceDocumentRow): typeof RECEIVABLE_AGING[number] {
  if (document.status === 'not_due') return 'not_due';
  if (document.overdueDays > 90) return 'overdue_90';
  if (document.overdueDays > 60) return 'overdue_61_90';
  if (document.overdueDays > 30) return 'overdue_31_60';
  return 'overdue_1_30';
}

function agingRows(documents: PendingBalanceDocumentRow[]): PendingBalanceAgingRow[] {
  const definitions: Array<{ key: PendingBalanceAgingRow['key']; label: string }> = [
    { key: 'overdue_90', label: 'Más de 90 días' },
    { key: 'overdue_61_90', label: '61–90 días' },
    { key: 'overdue_31_60', label: '31–60 días' },
    { key: 'overdue_1_30', label: '1–30 días' },
    { key: 'not_due', label: 'A vencer' },
  ];
  const total = documents.reduce((sum, document) => sum + document.outstanding, 0);
  return definitions.map((definition) => {
    const values = documents.filter((document) => documentBand(document) === definition.key);
    const amount = values.reduce((sum, document) => sum + document.outstanding, 0);
    return {
      ...definition,
      amount,
      documents: values.length,
      share: metricRatio(amount, total) ?? 0,
    };
  });
}

function normalizeWorkflowFilters(input: Partial<Record<string, unknown>>, responsibles: string[]): Pick<ReceivableDashboardFilters, 'responsible' | 'internalStatus' | 'aging' | 'query'> {
  return {
    responsible: normalizeMultiFilter(input.responsible, responsibles),
    internalStatus: normalizeMultiFilter(input.internalStatus, RECEIVABLE_STATUSES),
    aging: normalizeMultiFilter(input.aging, RECEIVABLE_AGING),
    query: String(input.query ?? '').trim().slice(0, 200),
  };
}

export function buildReceivablesDashboard(input: Partial<Record<string, unknown>>): ReceivableDashboardPayload | null {
  const base = buildPendingBalancesReport(input);
  if (!base) return null;
  const meta = getPendingBalancesReportMeta();
  const caseMap = new Map(listReceivableCases().map((item) => [item.clientId, item]));
  const responsibles = [...new Set([
    'Administración',
    ...meta.options.sellers,
    ...[...caseMap.values()].map((item) => item.responsible).filter(Boolean),
  ])].sort((left, right) => left.localeCompare(right, 'es'));
  const workflowFilters = normalizeWorkflowFilters(input, responsibles);
  const selectedResponsibles = decodeMultiFilter(workflowFilters.responsible);
  const selectedStatuses = decodeMultiFilter(workflowFilters.internalStatus);
  const selectedAging = decodeMultiFilter(workflowFilters.aging);
  const query = workflowFilters.query.toLocaleLowerCase('es');
  const allDocuments = listPendingBalanceDocuments(base.clients.map((client) => client.clientId));
  const documentsByClient = new Map<number, PendingBalanceDocumentRow[]>();
  for (const document of allDocuments) {
    const values = documentsByClient.get(document.clientId) ?? [];
    values.push(document);
    documentsByClient.set(document.clientId, values);
  }
  const commonRows: ReceivableDashboardRow[] = base.clients.map((client) => ({
    ...client,
    workflow: caseMap.get(client.clientId) ?? emptyReceivableCase(client.clientId),
  })).filter((client) => {
    if (selectedResponsibles.length && !selectedResponsibles.includes(client.workflow.responsible)) return false;
    if (selectedAging.length && !(documentsByClient.get(client.clientId) ?? []).some((document) => selectedAging.includes(documentBand(document)))) return false;
    if (query && !`${client.clientId} ${client.name} ${client.tradeName} ${client.seller} ${client.workflow.responsible} ${client.workflow.lastComment}`.toLocaleLowerCase('es').includes(query)) return false;
    return true;
  });
  const rows = commonRows.filter((client) => !selectedStatuses.length || selectedStatuses.includes(client.workflow.status)).sort((left, right) => (
    Number(Boolean(right.workflow.nextFollowUpAt && right.workflow.nextFollowUpAt <= localDate() && right.workflow.status !== 'resolved'))
      - Number(Boolean(left.workflow.nextFollowUpAt && left.workflow.nextFollowUpAt <= localDate() && left.workflow.status !== 'resolved'))
    || right.overdueBalance - left.overdueBalance
    || left.name.localeCompare(right.name, 'es')
  ));
  const clientIds = new Set(rows.map((row) => row.clientId));
  const documents = allDocuments.filter((document) => clientIds.has(document.clientId));
  const pendingBalance = rows.reduce((sum, row) => sum + row.pendingBalance, 0);
  const overdueBalance = rows.reduce((sum, row) => sum + row.overdueBalance, 0);
  const today = localDate();
  return {
    generatedAt: new Date().toISOString(),
    sourceMaxDate: base.sourceMaxDate,
    filters: { ...base.filters, ...workflowFilters },
    pendingBalance,
    overdueBalance,
    overdueShare: metricRatio(overdueBalance, pendingBalance) ?? 0,
    clientsWithBalance: rows.length,
    overdueClients: rows.filter((row) => row.overdueBalance > .01).length,
    openDocuments: documents.length,
    overdueDocuments: documents.filter((document) => document.status === 'overdue').length,
    dueFollowUps: rows.filter((row) => row.workflow.nextFollowUpAt && row.workflow.nextFollowUpAt <= today && row.workflow.status !== 'resolved').length,
    unmanagedClients: rows.filter((row) => row.workflow.status === 'unmanaged').length,
    aging: agingRows(documents),
    statusBreakdown: RECEIVABLE_STATUSES.map((status) => {
      const values = commonRows.filter((row) => row.workflow.status === status);
      return { status, clients: values.length, amount: values.reduce((sum, row) => sum + row.pendingBalance, 0) };
    }),
    rows,
    options: { sellers: meta.options.sellers, paymentMethods: meta.options.paymentMethods, responsibles },
  };
}

export function getReceivableCaseDetail(clientId: number): ReceivableCaseDetail {
  return {
    workflow: getReceivableCase(clientId) ?? emptyReceivableCase(clientId),
    events: listReceivableCaseEvents(clientId, 200),
    documents: listPendingBalanceDocuments([clientId]),
  };
}
