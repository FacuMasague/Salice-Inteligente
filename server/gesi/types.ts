export type GesiRow = Record<string, unknown>;

export interface GesiRawCapture {
  captureMeta: {
    capturedAt: string;
    empresaID: number;
    sucursalID: number;
    almacenPrincipalID: number;
    historyFrom: string;
    salesHistoryFrom: string;
    sptFetchFrom: string;
    salesDetailFrom: string;
    sptSalesDetailFrom: string;
    historyUntil: string;
    optionalEndpointWarnings: string[];
  };
  clients: GesiRow[];
  products: GesiRow[];
  prices: GesiRow[];
  stocks: GesiRow[];
  balances: GesiRow[];
  invoices: GesiRow[];
  creditNotes: GesiRow[];
  sptInvoices: GesiRow[];
  sptCreditNotes: GesiRow[];
  collections: GesiRow[];
  pendingDocuments: GesiRow[];
  masters: {
    channels: GesiRow[];
    paymentMethods: GesiRow[];
    sellers: GesiRow[];
    rubros: GesiRow[];
    subRubros: GesiRow[];
    productBrands: GesiRow[];
    productLines: GesiRow[];
    productFamilies: GesiRow[];
    productGroups: GesiRow[];
    clientTypes: GesiRow[];
    zones: GesiRow[];
  };
}
