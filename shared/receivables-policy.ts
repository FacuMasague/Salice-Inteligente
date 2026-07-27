import type { Client, Health, Invoice } from './models.js';

export const MIN_RECEIVABLE_DOCUMENT_AMOUNT = 1_000;

export const EXCLUDED_RECEIVABLE_CLIENT_NAMES = [
  'GBA M6 S.A.',
  'Consumidor Final',
  'Salice Distribuciones S.A.',
] as const;

const identity = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLocaleLowerCase('es')
  .replace(/[^a-z0-9]+/g, '');

const excludedIdentities = new Set(EXCLUDED_RECEIVABLE_CLIENT_NAMES.map(identity));

export function isExcludedReceivableClient(...names: unknown[]) {
  return names.some((name) => excludedIdentities.has(identity(name)));
}

export function isActionableReceivableAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= MIN_RECEIVABLE_DOCUMENT_AMOUNT;
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const daysBetween = (from: string, through: string) => Math.round(
  (new Date(`${through}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000,
);
const addDays = (value: string, days: number) => {
  const result = new Date(`${value}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
};

export function applyReceivablesPolicyToClient(client: Client, snapshotDate: string): Client | null {
  if (isExcludedReceivableClient(client.name, client.tradeName)) return null;

  const invoices = client.invoices.filter((invoice) => (
    invoice.outstanding <= 0 || isActionableReceivableAmount(invoice.outstanding)
  ));
  const openInvoices = invoices.filter((invoice): invoice is Invoice => invoice.outstanding > 0);
  const overdue = openInvoices.filter((invoice) => invoice.status === 'overdue');
  const overdueOutstanding = roundMoney(overdue.reduce((sum, invoice) => sum + invoice.outstanding, 0));
  const oldestOverdueDays = overdue.length
    ? Math.max(...overdue.map((invoice) => Math.max(0, daysBetween(invoice.dueAt, snapshotDate))))
    : 0;
  const dueSoon = openInvoices.some((invoice) => invoice.status === 'due_soon');
  const overduePressureBase = Math.max(client.sales90d / 3, 500_000);
  const collectionRisk = client.active ? Math.round(clamp(
    (overdue.length ? 18 : 0)
    + Math.min(27, oldestOverdueDays / 4)
    + Math.min(20, overdueOutstanding / overduePressureBase * 20)
    + Math.min(15, Math.max(0, client.avgPaymentDelayDays) / 2)
    + (dueSoon ? 6 : 0)
    + (client.salesBlocked ? 8 : 0)
    + (!client.accountEnabled ? 6 : 0),
  )) : 0;
  const visitPriority = client.active
    ? Math.round(clamp(collectionRisk * .58 + client.commercialOpportunity * .42))
    : 0;
  const health: Health = collectionRisk >= 55 ? 'critical' : collectionRisk >= 25 ? 'attention' : 'healthy';

  return {
    ...client,
    invoices,
    overdueOutstanding,
    oldestOverdueDays,
    collectionRisk,
    visitPriority,
    health,
    nextVisitAt: addDays(snapshotDate, visitPriority >= 80 ? 1 : visitPriority >= 60 ? 3 : 7),
  };
}

export function applyReceivablesPolicyToClients(clients: Client[], snapshotDate: string) {
  return clients
    .map((client) => applyReceivablesPolicyToClient(client, snapshotDate))
    .filter((client): client is Client => client !== null);
}
