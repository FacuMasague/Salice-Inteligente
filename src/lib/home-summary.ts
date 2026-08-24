import { classifyInventoryProduct } from '../../shared/inventory-decisions';
import { isCommercialOpportunityEligible } from '../../shared/commercial-opportunities';
import { applyReceivablesPolicyToClients } from '../../shared/receivables-policy';
import type { DashboardData, NotificationItem } from '../../shared/models';

export function buildHomeSummary(data: DashboardData, notifications: NotificationItem[]) {
  const promiseItems = notifications.filter((item) => item.type.startsWith('promise'));
  const collectionItems = notifications.filter((item) => item.type === 'collection_risk');
  const receivableClients = applyReceivablesPolicyToClients(data.clients, data.meta.generatedAt.slice(0, 10))
    .filter((client) => client.active);
  const openInvoices = receivableClients.flatMap((client) => client.invoices.filter((invoice) => invoice.outstanding > 0));
  const overdueInvoices = openInvoices.filter((invoice) => invoice.status === 'overdue');
  const overdueAmount = overdueInvoices.reduce((sum, invoice) => sum + invoice.outstanding, 0);
  const opportunities = data.clients
    .filter((client) => client.active && isCommercialOpportunityEligible(client) && client.commercialOpportunity >= 70)
    .sort((left, right) => right.commercialOpportunity - left.commercialOpportunity || right.visitPriority - left.visitPriority);
  const inventoryAlerts = data.products.filter((product) => {
    const status = classifyInventoryProduct(product).status;
    return status === 'no_stock_with_demand' || status === 'critical_coverage' || status === 'stock_without_movement';
  });

  return {
    promiseItems,
    collectionItems,
    overdueInvoices,
    overdueAmount,
    opportunities,
    inventoryAlerts,
    priorityItems: notifications.slice(0, 6),
  };
}
