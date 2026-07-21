import { REPORT_ENDPOINT_METRICS } from './metric-links.js';

export type MetricUnit = 'ars' | 'kg' | 'units' | 'clients' | 'documents' | 'days' | 'percent' | 'score';

export interface MetricDefinition {
  id: string;
  label: string;
  description: string;
  unit: MetricUnit;
  formula: string;
  source: string;
  grain: string;
  dateBasis: string;
  consumers: string[];
  caveats: string[];
}

export interface ReportUniverseDefinition {
  id: string;
  label: string;
  companies: number[];
  branches: number[];
  allowedIssuers: string[];
  included: string[];
  excluded: string[];
  sellerRule: string;
  dateRule: string;
  source: string;
}

const movementSource = 'Deterministic synthetic commercial movements generated locally';
const financeSource = 'Deterministic synthetic balances and documents generated locally';
const consumers = ['Dashboard', 'Sales Explorer', 'Reports', 'Customer Profiles'];

const metric = (
  id: string,
  label: string,
  unit: MetricUnit,
  formula: string,
  source: string,
  description: string,
  caveats: string[] = [],
): MetricDefinition => ({
  id, label, description, unit, formula, source,
  grain: 'Explicit report universe and selected period',
  dateBasis: 'Document issue date or local snapshot cutoff, as stated by the metric',
  consumers,
  caveats,
});

export const METRIC_CATALOG: MetricDefinition[] = [
  metric('sales.net', 'Net sales', 'ars', 'SUM(movements.net_amount)', movementSource, 'Invoice item value less credit-note item value.'),
  metric('volume.kilos', 'Net kilograms', 'kg', 'SUM(movements.kilos)', movementSource, 'Signed product volume from synthetic document items.'),
  metric('sales.units', 'Net units', 'units', 'SUM(movements.units)', movementSource, 'Signed commercial units from synthetic document items.'),
  metric('clients.buyers', 'Buying customers', 'clients', 'COUNT(DISTINCT movements.client_id)', movementSource, 'Distinct customers with eligible movements.'),
  metric('sales.documents', 'Commercial documents', 'documents', 'COUNT(DISTINCT movements.source_document_key)', movementSource, 'Distinct invoices and credit notes.'),
  metric('sales.average_ticket', 'Average ticket', 'ars', 'sales.net / sales.documents', movementSource, 'Net sales divided by distinct commercial documents.', ['Undefined when there are no documents.']),
  metric('sales.average_price_kg', 'Net sales per kilogram', 'ars', 'sales.net / volume.kilos', movementSource, 'Net sales divided by net kilograms.', ['Undefined when net volume is zero.']),
  metric('balance.net', 'Net account balance', 'ars', 'SUM(client.balance)', financeSource, 'Synthetic customer-account balance at the local cutoff.'),
  metric('balance.pending', 'Pending document balance', 'ars', 'SUM(open_debit_documents.outstanding)', financeSource, 'Positive outstanding invoice value.'),
  metric('balance.overdue', 'Overdue balance', 'ars', 'SUM(outstanding WHERE due_date < snapshot_date)', financeSource, 'Outstanding value past its exact due date.'),
  metric('credit.term.invoice_days', 'Observed invoice term', 'days', 'due_date - issue_date', financeSource, 'Days between issue and first due date.'),
  metric('payment.days_vs_due', 'Payment timing vs due date', 'days', 'payment_date - due_date', financeSource, 'Negative values mean early payment.'),
  metric('comparison.ratio', 'Period attainment', 'percent', 'current / comparable * 100', movementSource, 'Current value as a percentage of the comparable period.', ['100% means equal performance.']),
  metric('comparison.variation', 'Percentage variation', 'percent', '(current - comparable) / comparable * 100', movementSource, 'Change relative to the comparable base.', ['Undefined when the base is zero.']),
  metric('target.monthly', 'Monthly target', 'kg', 'SUM(versioned_targets.target)', 'Synthetic versioned commercial plan', 'Planning target stored separately from actual results.'),
  metric('target.linear_projection', 'Linear projection', 'kg', 'actual / elapsed_days * days_in_month', movementSource, 'Current daily pace extended to month end.', ['Pace reference, not a forecast.']),
  metric('recovery.non_buyer_30', 'No purchase in 30 days', 'clients', 'net_180d > 0 AND net_30d <= 0', movementSource, 'Customer with historical purchases but no positive net sale in the latest 30 days.'),
  metric('score.collection_risk', 'C · Collection risk', 'score', 'Explainable overdue, age, amount, and payment-behavior rules', financeSource, 'Collection-pressure score from 0 to 100.', ['Not a credit prediction.']),
  metric('score.commercial_opportunity', 'O · Commercial opportunity', 'score', 'Explainable recency, decline, and assortment rules', movementSource, 'Commercial opportunity score from 0 to 100.', ['Kept separate from collection risk.']),
  metric('score.visit_priority', 'P · Visit priority', 'score', '0.58 * C + 0.42 * O', 'Derived explainable score', 'Combined action-ordering score from 0 to 100.', ['C, O, and P remain separate scores.']),
];

const issuer = ['SMART Salice Demo Company'];
const universe = (
  id: string,
  label: string,
  included: string[],
  excluded: string[] = [],
  allowedIssuers = issuer,
): ReportUniverseDefinition => ({
  id, label, companies: [3], branches: [3], allowedIssuers, included, excluded,
  sellerRule: 'Synthetic seller portfolio; filters are explicit and reproducible.',
  dateRule: 'Calendar periods use equivalent day cutoffs when the latest month is incomplete.',
  source: 'Synthetic local demo dataset',
});

export const REPORT_UNIVERSES: ReportUniverseDefinition[] = [
  universe('salice-operational', 'SMART Salice operations', ['All active synthetic customers']),
  universe('spt-main', 'Sales performance tracker', ['Synthetic sellers, channels, and product groups'], ['Promotional category'], []),
  universe('commercial-sales', 'Commercial sales', ['All eligible synthetic movements']),
  universe('mars', 'Orbit Nutrition portfolio view', ['Orbit Nutrition product group']),
  universe('nutripet', 'Nova Pet portfolio view', ['Nova Pet product group'], ['Promotional category']),
  universe('baires', 'Harbor portfolio view', ['Harbor SPT and Harbor Retail product groups'], ['Promotional category']),
  universe('non-buyers', 'Dormant accounts', ['Active customers with positive sales in 180 days'], ['Promotional category']),
  universe('general-status', 'Commercial plan status', ['Synthetic sellers, brands, and categories in the versioned plan']),
  universe('pending-balances', 'Pending balances', ['Open synthetic invoices with valid due dates']),
];

export function metricCatalogSummary() {
  return {
    version: '2.0.0',
    metrics: METRIC_CATALOG,
    universes: REPORT_UNIVERSES,
    endpoints: REPORT_ENDPOINT_METRICS,
    principles: [
      'Every demo record is fictional and generated locally.',
      'Actuals, targets, and human-entered follow-ups remain separate data layers.',
      'Each comparison declares its universe and time cutoff.',
      'Missing values remain visible; the application does not invent unexplained mappings.',
    ],
  };
}
