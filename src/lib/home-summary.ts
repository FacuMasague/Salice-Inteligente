import { classifyInventoryProduct } from '../../shared/inventory-decisions';
import { isCommercialOpportunityEligible } from '../../shared/commercial-opportunities';
import { applyReceivablesPolicyToClients } from '../../shared/receivables-policy';
import type { DashboardData, NotificationItem } from '../../shared/models';
import { clientKilos90d, productContentById } from './commercial-metrics';

export const HOME_NAVIGATION_VIEWS = [
  'agenda',
  'finance',
  'receivables',
  'clients',
  'sellers',
  'sales-explorer',
  'products',
  'brands',
  'map',
  'routes',
  'report-center',
  'reports',
  'spt',
  'commercial-sales',
  'mars',
  'nutripet',
  'baires',
  'non-buyers',
  'pending-balances',
  'help',
  'settings',
  'users',
  'user-activity',
] as const;

export type HomeNavigationView = typeof HOME_NAVIGATION_VIEWS[number];

const HOME_NAVIGATION_VIEW_SET = new Set<string>(HOME_NAVIGATION_VIEWS);

export function parseRecentHomeViews(raw: string | null): HomeNavigationView[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((value): value is HomeNavigationView => (
      typeof value === 'string' && HOME_NAVIGATION_VIEW_SET.has(value)
    )))].slice(0, 4);
  } catch {
    return [];
  }
}

export function rememberRecentHomeView(current: HomeNavigationView[], next: string): HomeNavigationView[] {
  if (!HOME_NAVIGATION_VIEW_SET.has(next)) return current;
  const typedNext = next as HomeNavigationView;
  if (current[0] === typedNext) return current;
  return [typedNext, ...current.filter((view) => view !== typedNext)].slice(0, 4);
}

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
  const activeClients = data.clients.filter((client) => client.active);
  const portfolio90d = activeClients.reduce((sum, client) => sum + client.sales90d, 0);
  const contentByProduct = productContentById(data.products);
  const portfolioKiloMetric = activeClients.reduce((total, client) => {
    const metric = clientKilos90d(client, contentByProduct);
    return { kilos: total.kilos + metric.kilos, complete: total.complete && metric.complete };
  }, { kilos: 0, complete: true });
  const accountBalance = activeClients.reduce((sum, client) => sum + client.balance, 0);
  const highRiskClients = activeClients.filter((client) => client.health === 'critical');
  const trend = activeClients.reduce(
    (totals, client) => totals.map((total, index) => total + (client.salesTrend[index] || 0)),
    [0, 0, 0, 0, 0, 0],
  );
  const previousQuarter = trend.slice(0, 3).reduce((sum, value) => sum + value, 0);
  const currentQuarter = trend.slice(3).reduce((sum, value) => sum + value, 0);
  const portfolioDelta = previousQuarter ? Math.round((currentQuarter - previousQuarter) / previousQuarter * 100) : 0;

  return {
    promiseItems,
    collectionItems,
    overdueInvoices,
    overdueAmount,
    opportunities,
    inventoryAlerts,
    priorityItems: notifications.slice(0, 6),
    activeClients,
    confirmedActiveClients: activeClients.filter((client) => client.portfolioStatus === 'confirmed').length,
    reviewActiveClients: activeClients.filter((client) => client.portfolioStatus === 'review').length,
    portfolio90d,
    portfolioKilos90d: portfolioKiloMetric.kilos,
    portfolioKilosComplete: portfolioKiloMetric.complete,
    portfolioDelta,
    accountBalance,
    clientsWithDebitBalance: activeClients.filter((client) => client.balance > 0).length,
    highRiskClients,
  };
}
