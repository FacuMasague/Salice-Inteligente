export type GesiRow = Record<string, unknown>;

export interface GesiRawCapture {
  captureMeta: {
    capturedAt: string;
    empresaID: number;
    sucursalID: number;
    almacenPrincipalID: number;
    almacenPrincipal?: string;
    inventoryIncludesZeroStock?: boolean;
    inventoryDuplicateRows?: number;
    inventoryInvalidRows?: number;
    inventoryScopeRepairedRows?: number;
    inventoryBranchResolvedRows?: number;
    inventoryCommittedRows?: number;
    inventoryStockReconciliationWarnings?: number;
    historyFrom: string;
    salesHistoryFrom: string;
    sptFetchFrom: string;
    salesDetailFrom: string;
    sptSalesDetailFrom: string;
    logisticsFrom?: string;
    logisticsFetchFrom?: string;
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
  deliverySheets?: GesiRow[];
  unassignedDeliveryDocuments?: GesiRow[];
  masters: {
    inventoryWarehouses?: GesiRow[];
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
