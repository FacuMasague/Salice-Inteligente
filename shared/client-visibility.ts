import type { Client } from './models.js';
import { isActionableReceivableAmount } from './receivables-policy.js';

export type ClientScopeMode = 'recent3' | 'recent6' | 'active' | 'all';

export const CLIENT_SCOPE_OPTIONS: { value: ClientScopeMode; label: string }[] = [
  { value: 'recent3', label: 'Compraron en 3 meses o deben' },
  { value: 'recent6', label: 'Compraron en 6 meses o deben' },
  { value: 'active', label: 'Todos los activos' },
  { value: 'all', label: 'Todos los clientes' },
];

function monthCutoff(snapshotDate: string, months: number) {
  const date = new Date(`${snapshotDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

export function clientHasActionableDebt(client: Client) {
  return isActionableReceivableAmount(client.balance)
    || client.invoices.some((invoice) => (
      invoice.outstanding > 0 && isActionableReceivableAmount(invoice.outstanding)
    ));
}

export function isClientVisibleInScope(client: Client, mode: ClientScopeMode, snapshotDate: string) {
  if (mode === 'all') return true;
  if (mode === 'active') return client.active;
  const cutoff = monthCutoff(snapshotDate, mode === 'recent6' ? 6 : 3);
  return clientHasActionableDebt(client)
    || Boolean(cutoff && client.lastPurchaseAt && client.lastPurchaseAt >= cutoff);
}

export function filterClientsByScope(clients: Client[], mode: ClientScopeMode, snapshotDate: string) {
  return clients.filter((client) => isClientVisibleInScope(client, mode, snapshotDate));
}
