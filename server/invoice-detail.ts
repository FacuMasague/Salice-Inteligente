import type { DashboardData, InvoiceDetailPayload } from '../shared/models.js';
import { listPendingBalanceDocuments } from './pending-balances-report.js';
import { getSalesExplorerDocument } from './sales-explorer.js';

export function buildInvoiceDetail(data: DashboardData, id: string): InvoiceDetailPayload | null {
  const key = id.trim();
  if (!key) return null;
  const sales = getSalesExplorerDocument(key);
  let owner = sales ? data.clients.find((client) => client.id === sales.clientId) : undefined;
  let invoice = owner?.invoices.find((item) => item.id === key);

  if (!invoice) {
    for (const client of data.clients) {
      const match = client.invoices.find((item) => item.id === key);
      if (!match) continue;
      owner = client;
      invoice = match;
      break;
    }
  }

  const pending = owner ? listPendingBalanceDocuments([owner.id]).find((item) => item.documentId === key) : undefined;
  if (!invoice && !sales && !pending) return null;

  const issuedAt = invoice?.issuedAt || sales?.date || pending?.issuedAt || '';
  const amount = invoice?.amount ?? Math.abs(sales?.netAmount ?? pending?.outstanding ?? 0);
  const outstanding = invoice?.outstanding ?? pending?.outstanding ?? 0;
  const fallbackName = sales?.client || `Cliente ${owner?.id ?? pending?.clientId ?? ''}`.trim();

  return {
    id: key,
    number: invoice?.number || sales?.documentNumber || pending?.documentNumber || key,
    kind: sales?.kind ?? 'invoice',
    issuedAt,
    dueAt: invoice?.dueAt || pending?.dueAt || '',
    paidAt: invoice?.paidAt ?? null,
    amount,
    netAmount: sales?.netAmount ?? null,
    outstanding,
    status: invoice?.status ?? pending?.status ?? (outstanding > 0 ? 'open' : 'paid'),
    creditTermDays: invoice?.creditTermDays ?? pending?.creditTermDays ?? null,
    paymentMethod: invoice?.paymentMethod || pending?.paymentMethod || 'Sin forma de pago informada',
    client: {
      id: owner?.id ?? sales?.clientId ?? pending?.clientId ?? 0,
      name: owner?.name || fallbackName,
      tradeName: owner?.tradeName || '',
      seller: owner?.seller || sales?.seller || 'Sin vendedor',
      address: owner?.address || sales?.address || '',
      locality: owner?.locality || sales?.locality || '',
    },
    issuer: sales?.issuer || '',
    branch: sales?.branch || '',
    sourceMaxDate: data.meta.generatedAt.slice(0, 10),
    detailAvailable: Boolean(sales?.lineItems.length),
    lineItems: sales?.lineItems ?? [],
  };
}
