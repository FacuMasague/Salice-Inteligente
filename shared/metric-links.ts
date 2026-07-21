export const REPORT_ENDPOINT_METRICS = {
  '/api/reports/spt': ['volume.kilos', 'sales.units', 'sales.net', 'clients.buyers', 'comparison.ratio'],
  '/api/reports/commercial-sales': ['sales.net', 'volume.kilos', 'sales.units', 'clients.buyers', 'comparison.variation'],
  '/api/reports/general': ['volume.kilos', 'sales.net', 'clients.buyers', 'target.monthly', 'target.linear_projection', 'comparison.variation'],
  '/api/reports/mars': ['volume.kilos', 'clients.buyers', 'comparison.ratio'],
  '/api/reports/nutripet': ['volume.kilos', 'sales.net', 'sales.units', 'clients.buyers', 'comparison.ratio'],
  '/api/reports/baires': ['volume.kilos', 'sales.net', 'sales.units', 'clients.buyers', 'comparison.ratio'],
  '/api/reports/non-buyers': ['sales.net', 'volume.kilos', 'recovery.non_buyer_30'],
  '/api/reports/pending-balances': ['balance.pending', 'balance.overdue', 'credit.term.invoice_days'],
  '/api/admin/sales': ['sales.net', 'volume.kilos', 'sales.units', 'clients.buyers', 'sales.documents', 'sales.average_ticket', 'sales.average_price_kg'],
  '/api/admin/receivables': ['balance.pending', 'balance.overdue', 'credit.term.invoice_days'],
  '/api/admin/goals': ['target.monthly', 'volume.kilos', 'sales.net'],
} as const;
