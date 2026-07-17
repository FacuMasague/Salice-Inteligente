export type GesiRow = Record<string, unknown>;

export interface GesiRawCapture {
  captureMeta: {
    capturedAt: string;
    empresaID: number;
    sucursalID: number;
    almacenPrincipalID: number;
    historyFrom: string;
    salesDetailFrom: string;
    historyUntil: string;
    optionalEndpointWarnings: string[];
  };
  clients: GesiRow[];
  products: GesiRow[];
  prices: GesiRow[];
  stocks: GesiRow[];
  balances: GesiRow[];
  invoices: GesiRow[];
  collections: GesiRow[];
  pendingDocuments: GesiRow[];
  masters: {
    channels: GesiRow[];
    paymentMethods: GesiRow[];
    sellers: GesiRow[];
    rubros: GesiRow[];
    subRubros: GesiRow[];
    clientTypes: GesiRow[];
    zones: GesiRow[];
  };
}
