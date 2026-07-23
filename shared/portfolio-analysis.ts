import { isCommercialOpportunityEligible } from './commercial-opportunities.js';
import type { Client } from './models.js';

export const PORTFOLIO_SIGNAL_THRESHOLD = 55;

export type PortfolioLens =
  | 'all'
  | 'high_risk'
  | 'high_opportunity'
  | 'high_priority';

export interface PortfolioClientRow {
  client: Client;
}

export interface PortfolioLocalitySummary {
  name: string;
  clients: number;
  sales90d: number;
  highRisk: number;
  highOpportunity: number;
  highPriority: number;
  averagePriority: number;
}

export interface SellerPortfolioProfile {
  name: string;
  clientRows: PortfolioClientRow[];
  activeClients: number;
  confirmedClients: number;
  reviewClients: number;
  mappedClients: number;
  sales90d: number;
  balance: number;
  overdue: number;
  criticalClients: number;
  attentionClients: number;
  healthyClients: number;
  opportunityClients: number;
  prioritySignalClients: number;
  averageRisk: number;
  averageOpportunity: number;
  averagePriority: number;
  paymentSamples: number;
  averagePaymentDays: number | null;
  averagePaymentDelayDays: number | null;
  onTimeRate: number | null;
  salesTrend: number[];
  localities: PortfolioLocalitySummary[];
  lastPurchaseAt: string;
}

function localityKey(value: string) {
  return (value || 'Sin localidad').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

export function matchesPortfolioLens(row: PortfolioClientRow, lens: PortfolioLens) {
  if (lens === 'high_risk') return row.client.collectionRisk >= PORTFOLIO_SIGNAL_THRESHOLD;
  if (lens === 'high_opportunity') {
    return isCommercialOpportunityEligible(row.client)
      && row.client.commercialOpportunity >= PORTFOLIO_SIGNAL_THRESHOLD;
  }
  if (lens === 'high_priority') return row.client.visitPriority >= PORTFOLIO_SIGNAL_THRESHOLD;
  return true;
}

export function buildSellerPortfolioProfiles(
  clients: Client[],
): SellerPortfolioProfile[] {
  const groups = new Map<string, Client[]>();
  clients
    .filter((client) => client.active)
    .forEach((client) => {
      const seller = client.seller.trim() || 'Sin vendedor';
      groups.set(seller, [...(groups.get(seller) ?? []), client]);
    });

  return [...groups.entries()].map(([name, sellerClients]) => {
    const clientRows = sellerClients.map((client): PortfolioClientRow => ({ client })).sort((left, right) => (
      right.client.visitPriority - left.client.visitPriority
      || right.client.collectionRisk - left.client.collectionRisk
      || left.client.name.localeCompare(right.client.name, 'es')
    ));
    const opportunityEligibleClients = sellerClients.filter(isCommercialOpportunityEligible);
    const paymentSamples = sellerClients.reduce((sum, client) => sum + client.paymentSampleSize, 0);
    const weighted = (value: (client: Client) => number) => paymentSamples
      ? sellerClients.reduce((sum, client) => sum + value(client) * client.paymentSampleSize, 0) / paymentSamples
      : null;
    const localityMap = new Map<string, { label: string; rows: PortfolioClientRow[] }>();
    clientRows.forEach((row) => {
      const locality = (row.client.locality || 'Sin localidad').trim().replace(/\s+/g, ' ');
      const key = localityKey(locality);
      const current = localityMap.get(key) ?? { label: locality, rows: [] };
      current.rows.push(row);
      localityMap.set(key, current);
    });
    const localities = [...localityMap.values()].map(({ label, rows }): PortfolioLocalitySummary => ({
      name: label,
      clients: rows.length,
      sales90d: rows.reduce((sum, row) => sum + row.client.sales90d, 0),
      highRisk: rows.filter((row) => row.client.collectionRisk >= PORTFOLIO_SIGNAL_THRESHOLD).length,
      highOpportunity: rows.filter((row) => matchesPortfolioLens(row, 'high_opportunity')).length,
      highPriority: rows.filter((row) => row.client.visitPriority >= PORTFOLIO_SIGNAL_THRESHOLD).length,
      averagePriority: rows.reduce((sum, row) => sum + row.client.visitPriority, 0) / rows.length,
    })).sort((left, right) => right.sales90d - left.sales90d || left.name.localeCompare(right.name, 'es'));

    return {
      name,
      clientRows,
      activeClients: sellerClients.length,
      confirmedClients: sellerClients.filter((client) => client.portfolioStatus === 'confirmed').length,
      reviewClients: sellerClients.filter((client) => client.portfolioStatus === 'review').length,
      mappedClients: sellerClients.filter((client) => client.coordinates !== null).length,
      sales90d: sellerClients.reduce((sum, client) => sum + client.sales90d, 0),
      balance: sellerClients.reduce((sum, client) => sum + Math.max(0, client.balance), 0),
      overdue: sellerClients.reduce((sum, client) => sum + client.overdueOutstanding, 0),
      criticalClients: sellerClients.filter((client) => client.health === 'critical').length,
      attentionClients: sellerClients.filter((client) => client.health === 'attention').length,
      healthyClients: sellerClients.filter((client) => client.health === 'healthy').length,
      opportunityClients: opportunityEligibleClients
        .filter((client) => client.commercialOpportunity >= PORTFOLIO_SIGNAL_THRESHOLD).length,
      prioritySignalClients: sellerClients
        .filter((client) => client.visitPriority >= PORTFOLIO_SIGNAL_THRESHOLD).length,
      averageRisk: sellerClients.reduce((sum, client) => sum + client.collectionRisk, 0) / sellerClients.length,
      averageOpportunity: opportunityEligibleClients.length
        ? opportunityEligibleClients.reduce((sum, client) => sum + client.commercialOpportunity, 0) / opportunityEligibleClients.length
        : 0,
      averagePriority: sellerClients.reduce((sum, client) => sum + client.visitPriority, 0) / sellerClients.length,
      paymentSamples,
      averagePaymentDays: weighted((client) => client.avgPaymentDays),
      averagePaymentDelayDays: weighted((client) => client.avgPaymentDelayDays),
      onTimeRate: weighted((client) => client.onTimePaymentRate),
      salesTrend: Array.from({ length: 6 }, (_, index) => (
        sellerClients.reduce((sum, client) => sum + (client.salesTrend[index] ?? 0), 0)
      )),
      localities,
      lastPurchaseAt: sellerClients.reduce(
        (latest, client) => client.lastPurchaseAt > latest ? client.lastPurchaseAt : latest,
        '',
      ),
    };
  }).sort((left, right) => right.sales90d - left.sales90d || left.name.localeCompare(right.name, 'es'));
}
