export type Health = 'healthy' | 'attention' | 'critical';
export type InvoiceStatus = 'paid' | 'open' | 'due_soon' | 'overdue';
export type PortfolioStatus = 'confirmed' | 'review';
export type RecommendationConfidence = 'reliable' | 'exploratory' | 'insufficient';
export type CommercialActivityType = 'visit' | 'call' | 'collection' | 'offer';
export type CommercialActivityOutcome = 'completed' | 'sale' | 'promise' | 'no_contact' | 'rescheduled' | 'no_interest';
export type PaymentPromiseStatus = 'pending' | 'kept' | 'broken' | 'cancelled';
export type AgendaSource = 'algorithm' | 'manual' | 'promise';
export type AgendaStatus = 'pending' | 'completed' | 'cancelled';
export type CreditTermStatus = 'unavailable' | 'single' | 'consistent' | 'predominant' | 'mixed';

export const APP_VERSION = '1.0.0';

export const SALICE_DEPOT: {
  name: string;
  address: string;
  locality: string;
  coordinates: [number, number];
} = {
  name: 'SMART Salice Demo Distribution Center',
  address: '1 Demo Logistics Park',
  locality: 'Harbor City',
  coordinates: [-37.9457069, -57.5823923],
};

export type VectorKey =
  | 'perros'
  | 'gatos'
  | 'otras_especies'
  | 'cachorros'
  | 'adultos'
  | 'senior'
  | 'tamano_pequeno'
  | 'tamano_mediano'
  | 'tamano_grande'
  | 'premium'
  | 'economico'
  | 'alimento_seco'
  | 'alimento_humedo'
  | 'snacks'
  | 'farmacia'
  | 'antiparasitario'
  | 'natural'
  | 'funcional'
  | 'esterilizados'
  | 'control_peso'
  | 'piel_pelaje'
  | 'salud_urinaria'
  | 'salud_digestiva'
  | 'salud_dental'
  | 'higiene'
  | 'accesorios'
  | 'granel'
  | 'consumo_humano'
  | 'promocional'
  | 'sabor_pollo'
  | 'sabor_carne'
  | 'sabor_pescado'
  | 'sabor_cordero';

export interface ProductVectorMeta {
  version: '2.1';
  /** Classification quality, not purchase probability. */
  confidence: number;
  /** Coverage of the descriptive fields available in the synthetic catalog. */
  sourceCoverage: number;
  evidence: Partial<Record<VectorKey, string[]>>;
}

export type ProductMasterStatus = 'active' | 'inactive' | 'unknown';
export type ProductPricePosition = 'budget' | 'market' | 'premium' | 'unknown';

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  family: string;
  subcategory: string;
  brand: string;
  line: string;
  commercialFamily: string;
  group: string;
  pack: string;
  unit: string;
  unitsPerCase: number | null;
  masterStatus: ProductMasterStatus;
  price: number;
  /** Estimated net content only when the package is unambiguous. */
  contentKg: number | null;
  /** Normalized reference price; omitted when the unit is ambiguous. */
  referencePricePerKg: number | null;
  /** Relative position among comparable dry-food products. */
  pricePosition: ProductPricePosition;
  stock: number;
  units90d: number;
  monthlyUnits: number;
  sales90d: number;
  clients90d: number;
  lastSaleAt: string;
  stockCoverageMonths: number | null;
  margin: number | null;
  vector: Record<VectorKey, number>;
  vectorMeta: ProductVectorMeta;
}

export interface Purchase {
  productId: string;
  date: string;
  quantity: number;
  total: number;
}

export interface InvoiceLineItem {
  productId: string;
  product: string;
  brand: string;
  category: string;
  units: number;
  kilos: number;
  netAmount: number;
}

export interface Invoice {
  id: string;
  number: string;
  issuedAt: string;
  dueAt: string;
  paidAt?: string;
  amount: number;
  outstanding: number;
  status: InvoiceStatus;
  creditTermDays: number | null;
  /** Payment method recorded on the document; distinct from the customer's current terms. */
  paymentMethod: string;
  /** Verified or synthetic document lines when item-level detail is available. */
  lineItems?: InvoiceLineItem[];
}

export interface CreditTermOption {
  days: number;
  minDays: number;
  maxDays: number;
  invoiceCount: number;
  share: number;
  lastUsedAt: string;
}

export interface Client {
  id: number;
  active: boolean;
  sourceStateId: number;
  statusUpdatedAt: string;
  portfolioStatus: PortfolioStatus;
  reference: string;
  name: string;
  tradeName: string;
  address: string;
  locality: string;
  coordinates: [number, number] | null;
  zone: string;
  segment: string;
  channel: string;
  seller: string;
  phone: string;
  email: string;
  creditLimit: number;
  balance: number;
  accountEnabled: boolean;
  salesBlocked: boolean;
  deliveryBlocked: boolean;
  paymentMethod: string;
  creditDays: number | null;
  creditTermStatus: CreditTermStatus;
  creditTermSampleSize: number;
  creditTermDominantShare: number;
  creditTermMinDays: number | null;
  creditTermMaxDays: number | null;
  creditTermOptions: CreditTermOption[];
  avgPaymentDays: number;
  avgPaymentDelayDays: number;
  onTimePaymentRate: number;
  paymentSampleSize: number;
  paymentTrend: number[];
  paymentDelayTrend: number[];
  salesTrend: number[];
  lastPurchaseAt: string;
  nextVisitAt: string;
  sales90d: number;
  unmappedSales90d: number;
  salesDelta: number;
  collectionRisk: number;
  commercialOpportunity: number;
  visitPriority: number;
  health: Health;
  overdueOutstanding: number;
  oldestOverdueDays: number;
  purchases: Purchase[];
  invoices: Invoice[];
  note: string;
}

export interface SnapshotMeta {
  version: string;
  revision: number;
  generatedAt: string;
  source: 'demo';
  sourceLabel: string;
  syncStatus: 'demo';
  disclaimer?: string;
  productVectorVersion?: '2.1';
  coverage?: {
    rawClients: number;
    includedClients: number;
    geocodedClients: number;
    activeClients: number;
    inactiveClients: number;
    activeGeocodedClients: number;
    inactiveGeocodedClients: number;
    rawProducts: number;
    catalogProducts: number;
    invoices365d: number;
    invoices90d: number;
    collections365d: number;
    openDocuments: number;
    omittedInvoiceDetails: number;
    pricedProducts: number;
    paymentSamples: number;
    zoneLabelsAvailable: boolean;
    portfolioConfirmedClients?: number;
    portfolioReviewClients?: number;
    activePortfolioConfirmedClients?: number;
    activePortfolioReviewClients?: number;
    activeSalesBlockedClients?: number;
    clientsWithPaymentTerms?: number;
    creditTermInvoices?: number;
    invalidCreditTermInvoices?: number;
    clientsWithObservedCreditTerms?: number;
    clientsWithMixedCreditTerms?: number;
  };
}

export const SNAPSHOT_REVISION = 8;

export interface DashboardData {
  meta: SnapshotMeta;
  clients: Client[];
  products: Product[];
}

export type SptFilterKey =
  | 'seller'
  | 'brand'
  | 'productGroup'
  | 'channel'
  | 'product'
  | 'client'
  | 'line'
  | 'category'
  | 'subcategory'
  | 'clientType'
  | 'grouping'
  | 'locality';

export type SptFilters = Record<SptFilterKey, string> & { month: string };
export type SptReportPage = 'main' | 'sellers' | 'quarters';

export interface SptReportMeta {
  available: boolean;
  sourceFile: string;
  sourceSystem: string;
  rowCount: number;
  coverageFrom: string;
  sourceDocumentCount: number;
  unavailableDocumentCount: number;
  minDate: string;
  maxDate: string;
  latestMonth: string;
  months: string[];
  options: Record<SptFilterKey, string[]>;
  defaultUniverse: {
    companies: number[];
    sellers: string[];
    channels: string[];
    productGroups: string[];
    excludedCategories: string[];
  };
}

export interface SptPeriodMetrics {
  kilos: number;
  units: number;
  netAmount: number;
  clients: number;
}

export interface SptDailyPoint {
  day: number;
  current: number;
  previousMonth: number;
  previousYear: number;
}

export interface SptMonthlyPoint extends SptPeriodMetrics {
  month: string;
}

export interface SptBreakdownRow extends SptPeriodMetrics {
  label: string;
}

export interface SptQuarterPoint {
  quarter: number;
  current: number;
  previousYear: number;
}

export interface SptReportPayload {
  generatedAt: string;
  sourceMaxDate: string;
  page: SptReportPage;
  selectedMonth: string;
  cutoffDay: number;
  filters: SptFilters;
  current: SptPeriodMetrics;
  previousMonth: SptPeriodMetrics;
  previousYear: SptPeriodMetrics;
  ytd: SptPeriodMetrics;
  previousYtd: SptPeriodMetrics;
  averageLast3MonthsKilos: number;
  daily: SptDailyPoint[];
  monthly: SptMonthlyPoint[];
  sellers: SptBreakdownRow[];
  productGroups: SptBreakdownRow[];
  quarters: SptQuarterPoint[];
}

export type CommercialSalesFilterKey = 'seller' | 'category' | 'brand' | 'productGroup';

export type CommercialSalesPeriodMode = 'month' | 'year';

export type CommercialSalesFilters = Record<CommercialSalesFilterKey, string> & {
  periodMode: CommercialSalesPeriodMode;
  month: string;
  year: string;
};

export interface CommercialSalesReportMeta {
  available: boolean;
  sourceSystem: string;
  rowCount: number;
  coverageFrom: string;
  minDate: string;
  maxDate: string;
  latestMonth: string;
  latestYear: string;
  months: string[];
  years: string[];
  sourceDocumentCount: number;
  unavailableDocumentCount: number;
  options: Record<CommercialSalesFilterKey, string[]>;
  universe: {
    companies: number[];
    branches: number[];
    allowedIssuers: string[];
    excludedClients: string[];
  };
}

export interface CommercialSalesMetrics {
  netAmount: number;
  kilos: number;
  units: number;
  clients: number;
}

export interface CommercialSalesMixRow extends CommercialSalesMetrics {
  label: 'Balanceado' | 'Autoservicio' | 'Drovet' | 'Sanitarios' | 'Otros';
  share: number;
}

export interface CommercialSalesMonthlyPoint {
  month: string;
  current: number;
  previousYear: number;
}

export interface CommercialSalesProductRow extends CommercialSalesMetrics {
  productId: string;
  product: string;
  averagePricePerKilo: number | null;
}

export interface CommercialSalesBrandRow extends CommercialSalesMetrics {
  brand: string;
  averagePricePerKilo: number | null;
  kiloShare: number;
  salesShare: number;
  averageDailySales: number;
  products: CommercialSalesProductRow[];
}

export interface CommercialSalesBrandTotal extends CommercialSalesMetrics {
  averagePricePerKilo: number | null;
  averageDailySales: number;
}

export interface CommercialSalesReportPayload {
  generatedAt: string;
  sourceMaxDate: string;
  periodMode: CommercialSalesPeriodMode;
  selectedPeriod: string;
  selectedMonth: string;
  cutoffDay: number;
  periodStart: string;
  periodEnd: string;
  comparisonStart: string;
  comparisonEnd: string;
  elapsedDays: number;
  comparisonAvailable: boolean;
  filters: CommercialSalesFilters;
  current: CommercialSalesMetrics;
  comparison: CommercialSalesMetrics;
  difference: number;
  variation: number | null;
  segments: {
    balanceado: CommercialSalesMetrics;
    drovet: CommercialSalesMetrics;
    sanitarios: CommercialSalesMetrics;
    autoservicio: CommercialSalesMetrics;
  };
  mix: CommercialSalesMixRow[];
  monthly: CommercialSalesMonthlyPoint[];
  brandTotal: CommercialSalesBrandTotal;
  brands: CommercialSalesBrandRow[];
}

export type MarsClientMode = 'branch' | 'account';

export type MarsFilterKey = 'branch' | 'clientType' | 'channelGroup' | 'brand' | 'subcategoryGroup';

export type MarsFilters = Record<MarsFilterKey, string> & {
  year: string;
  period: string;
  clientMode: MarsClientMode;
};

export interface MarsPeriodDefinition {
  year: number;
  period: number;
  label: string;
  quarter: string;
  start: string;
  end: string;
  days: number;
}

export interface MarsReportMeta {
  available: boolean;
  sourceSystem: string;
  clientTypeCatalogSource: string;
  rowCount: number;
  coverageFrom: string;
  minDate: string;
  maxDate: string;
  capturedAt: string;
  latestYear: string;
  latestPeriod: string;
  years: string[];
  periods: Record<string, MarsPeriodDefinition[]>;
  sourceDocumentCount: number;
  unavailableDocumentCount: number;
  options: Record<MarsFilterKey, string[]>;
  universe: {
    companies: number[];
    branches: number[];
    productGroup: string;
    excludedClients: string[];
  };
}

export interface MarsMetrics {
  kilos: number;
  clients: number;
  accounts: number;
  clientBranches: number;
}

export interface MarsPeriodPoint extends MarsMetrics {
  period: number;
  label: string;
  quarter: string;
  start: string;
  end: string;
  isPartial: boolean;
  previousYearKilos: number;
  previousPeriodKilos: number;
  ytdKilos: number;
  previousYtdKilos: number;
  ytdVsPreviousYear: number | null;
  vsPreviousYear: number | null;
  vsPreviousPeriod: number | null;
}

export interface MarsQuarterPoint {
  quarter: string;
  kilos: number;
  previousYearKilos: number;
}

export interface MarsBrandRow extends MarsMetrics {
  brand: string;
  share: number;
  previousYearKilos: number;
  variation: number | null;
}

export interface MarsReportPayload {
  generatedAt: string;
  sourceMaxDate: string;
  filters: MarsFilters;
  selected: MarsPeriodDefinition;
  isPartial: boolean;
  elapsedDays: number;
  current: MarsMetrics;
  previousPeriod: MarsMetrics;
  previousYear: MarsMetrics;
  ytd: MarsMetrics;
  previousYtd: MarsMetrics;
  periods: MarsPeriodPoint[];
  quarters: MarsQuarterPoint[];
  brands: MarsBrandRow[];
}

export type NutriPetFilterKey = 'channelGroup' | 'brand' | 'product' | 'line' | 'client' | 'grouping' | 'category';

export type NutriPetFilters = Record<NutriPetFilterKey, string> & {
  year: string;
  month: string;
};

export interface NutriPetReportMeta {
  available: boolean;
  sourceSystem: string;
  rowCount: number;
  coverageFrom: string;
  minDate: string;
  maxDate: string;
  capturedAt: string;
  latestYear: string;
  latestMonth: string;
  years: string[];
  monthsByYear: Record<string, string[]>;
  sourceDocumentCount: number;
  unavailableDocumentCount: number;
  options: Record<NutriPetFilterKey, string[]>;
  universe: {
    companies: number[];
    branches: number[];
    allowedIssuers: string[];
    productGroup: string;
    excludedCategories: string[];
    excludedClients: string[];
  };
}

export interface NutriPetMetrics {
  kilos: number;
  clients: number;
  units: number;
  netAmount: number;
}

export interface NutriPetMonthlyPoint extends NutriPetMetrics {
  month: string;
  isPartial: boolean;
  comparisonAvailable: boolean;
  previousMonthKilos: number;
  previousYearKilos: number;
  ytdKilos: number;
  previousYtdKilos: number;
  vsPreviousMonth: number | null;
  vsPreviousYear: number | null;
  ytdVsPreviousYear: number | null;
}

export interface NutriPetQuarterPoint extends NutriPetMetrics {
  quarter: string;
  isPartial: boolean;
}

export interface NutriPetBrandRow extends NutriPetMetrics {
  brand: string;
  share: number;
  previousYearKilos: number;
  variation: number | null;
}

export interface NutriPetProductRow extends NutriPetMetrics {
  productId: string;
  product: string;
  brand: string;
  share: number;
}

export interface NutriPetReportPayload {
  generatedAt: string;
  sourceMaxDate: string;
  selectedMonth: string;
  periodStart: string;
  periodEnd: string;
  isPartial: boolean;
  elapsedDays: number;
  comparisonAvailable: boolean;
  filters: NutriPetFilters;
  current: NutriPetMetrics;
  previousMonth: NutriPetMetrics;
  previousYear: NutriPetMetrics;
  ytd: NutriPetMetrics;
  previousYtd: NutriPetMetrics;
  monthly: NutriPetMonthlyPoint[];
  quarters: NutriPetQuarterPoint[];
  brands: NutriPetBrandRow[];
  products: NutriPetProductRow[];
}

export type BairesFilterKey = 'segment' | 'brand' | 'subcategory' | 'branch';

export type BairesFilters = Record<BairesFilterKey, string> & {
  year: string;
  month: string;
};

export interface BairesReportMeta {
  available: boolean;
  sourceSystem: string;
  rowCount: number;
  coverageFrom: string;
  minDate: string;
  maxDate: string;
  capturedAt: string;
  latestYear: string;
  latestMonth: string;
  years: string[];
  monthsByYear: Record<string, string[]>;
  sourceDocumentCount: number;
  unavailableDocumentCount: number;
  options: Record<BairesFilterKey, string[]>;
  universe: {
    companies: number[];
    branches: number[];
    allowedIssuers: string[];
    productGroups: string[];
    excludedCategories: string[];
    excludedClients: string[];
  };
}

export interface BairesMetrics {
  kilos: number;
  clients: number;
  units: number;
  netAmount: number;
}

export interface BairesMonthlyPoint extends BairesMetrics {
  month: string;
  isPartial: boolean;
  comparisonAvailable: boolean;
  previousMonthKilos: number;
  previousYearKilos: number;
  ytdKilos: number;
  previousYtdKilos: number;
  vsPreviousMonth: number | null;
  vsPreviousYear: number | null;
  ytdVsPreviousYear: number | null;
}

export interface BairesQuarterPoint extends BairesMetrics {
  quarter: string;
  isPartial: boolean;
}

export interface BairesBreakdownRow extends BairesMetrics {
  name: string;
  share: number;
  previousYearKilos: number;
  variation: number | null;
}

export interface BairesReportPayload {
  generatedAt: string;
  sourceMaxDate: string;
  selectedMonth: string;
  periodStart: string;
  periodEnd: string;
  isPartial: boolean;
  elapsedDays: number;
  comparisonAvailable: boolean;
  filters: BairesFilters;
  current: BairesMetrics;
  previousMonth: BairesMetrics;
  previousYear: BairesMetrics;
  ytd: BairesMetrics;
  previousYtd: BairesMetrics;
  monthly: BairesMonthlyPoint[];
  quarters: BairesQuarterPoint[];
  brands: BairesBreakdownRow[];
  subcategories: BairesBreakdownRow[];
}

export type GeneralReportMode = 'core' | 'strategic' | 'autoservice';
export type GeneralReportUnit = 'kilos' | 'currency';

export interface GeneralReportFilters {
  mode: GeneralReportMode;
  month: string;
  seller: string;
  category: string;
  brand: string;
}

export interface GeneralReportMeta {
  available: boolean;
  sourceSystem: string;
  rowCount: number;
  coverageFrom: string;
  minDate: string;
  maxDate: string;
  capturedAt: string;
  latestMonth: string;
  months: string[];
  sourceDocumentCount: number;
  unavailableDocumentCount: number;
  options: {
    sellers: string[];
    coreCategories: string[];
    coreBrands: string[];
    strategicBrands: string[];
  };
  targetSource: {
    label: string;
    capturedAt: string;
    coverageFrom: string;
    coverageThrough: string;
  };
  universe: {
    companies: number[];
    branches: number[];
    allowedIssuers: string[];
    sellers: string[];
    coreCategories: string[];
    coreBrands: string[];
    strategicBrands: string[];
    autoserviceSellers: string[];
  };
}

export interface GeneralPerformanceRow {
  name: string;
  actual: number;
  target: number;
  completion: number | null;
  gap: number;
  share: number;
}

export interface GeneralTrendPoint {
  month: string;
  actual: number;
  target: number;
  completion: number | null;
  isPartial: boolean;
}

export interface GeneralReportPayload {
  generatedAt: string;
  sourceMaxDate: string;
  selectedMonth: string;
  periodStart: string;
  periodEnd: string;
  isPartial: boolean;
  elapsedDays: number;
  daysInMonth: number;
  unit: GeneralReportUnit;
  filters: GeneralReportFilters;
  actual: number;
  target: number;
  completion: number | null;
  gap: number;
  projection: number | null;
  projectedCompletion: number | null;
  previousMonthActual: number;
  previousYearActual: number;
  kilos: number;
  clients: number;
  units: number;
  netAmount: number;
  trend: GeneralTrendPoint[];
  sellers: GeneralPerformanceRow[];
  categories: GeneralPerformanceRow[];
  brands: GeneralPerformanceRow[];
}

export type SalesExplorerFilterKey = 'seller' | 'client' | 'product' | 'brand' | 'category' | 'channel' | 'zone';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SalesExplorerFilters {
  from: string;
  to: string;
  seller: string;
  client: string;
  product: string;
  brand: string;
  category: string;
  channel: string;
  zone: string;
}

export interface SalesExplorerMeta {
  available: boolean;
  sourceSystem: string;
  capturedAt: string;
  minDate: string;
  maxDate: string;
  rowCount: number;
  sourceDocumentCount: number;
  unavailableDocumentCount: number;
  options: {
    sellers: string[];
    clients: SelectOption[];
    products: SelectOption[];
    brands: string[];
    categories: string[];
    channels: string[];
    zones: string[];
  };
  universe: {
    id: string;
    companies: number[];
    branches: number[];
    allowedIssuers: string[];
    excludedClients: string[];
  };
}

export interface SalesExplorerMetrics {
  netAmount: number;
  kilos: number;
  units: number;
  clients: number;
  documents: number;
  averageTicket: number | null;
  averagePricePerKilo: number | null;
}

export interface SalesExplorerPeriodRow extends SalesExplorerMetrics {
  key: string;
  label: string;
  from: string;
  to: string;
}

export interface SalesExplorerClientRow extends SalesExplorerMetrics {
  clientId: number;
  name: string;
  seller: string;
  zone: string;
  products: number;
  lastSaleAt: string;
  share: number;
}

export interface SalesExplorerProductRow extends SalesExplorerMetrics {
  productId: string;
  name: string;
  brand: string;
  category: string;
  clients: number;
  lastSaleAt: string;
  share: number;
}

export interface SalesExplorerDocumentRow {
  key: string;
  documentNumber: string;
  date: string;
  kind: 'invoice' | 'credit_note';
  clientId: number;
  client: string;
  seller: string;
  netAmount: number;
  kilos: number;
  units: number;
  items: number;
}

export interface SalesExplorerPayload {
  generatedAt: string;
  sourceMaxDate: string;
  filters: SalesExplorerFilters;
  summary: SalesExplorerMetrics;
  timelineGrain: 'day' | 'month';
  timeline: SalesExplorerPeriodRow[];
  clients: SalesExplorerClientRow[];
  products: SalesExplorerProductRow[];
  documents: SalesExplorerDocumentRow[];
  documentPagination: { page: number; pageSize: number; total: number; pages: number };
  resultLimits: { clients: number; products: number };
}

export interface SalesExplorerDocumentDetail extends SalesExplorerDocumentRow {
  issuer: string;
  branch: string;
  address: string;
  locality: string;
  lineItems: InvoiceLineItem[];
}

export type PendingBalanceStatus = 'all' | 'overdue' | 'not_due';

export interface PendingBalanceFilters {
  seller: string;
  paymentMethod: string;
  status: string;
}

export interface PendingBalanceReportMeta {
  available: boolean;
  sourceSystem: string;
  capturedAt: string;
  asOfDate: string;
  salesFrom: string;
  clientCount: number;
  documentCount: number;
  options: {
    sellers: string[];
    paymentMethods: string[];
  };
  universe: {
    companies: number[];
    branches: number[];
    excludedSellerGroup: string;
    visibleSellers: string[];
    balanceRule: string;
  };
}

export interface PendingBalanceClientRow {
  clientId: number;
  name: string;
  tradeName: string;
  seller: string;
  paymentMethod: string;
  active: boolean;
  pendingBalance: number;
  overdueBalance: number;
  overdueShare: number;
  earliestDue: string | null;
  oldestOverdueDays: number;
  openDocuments: number;
  overdueDocuments: number;
  creditTermTotalDays: number;
  creditTermAverageDays: number | null;
  sales30: number;
  overdueToSales30: number | null;
}

export interface PendingBalanceSellerRow {
  seller: string;
  clients: number;
  overdueClients: number;
  pendingBalance: number;
  overdueBalance: number;
  overdueShare: number;
  sales30: number;
  overdueToSales30: number | null;
}

export interface PendingBalanceAgingRow {
  key: 'overdue_90' | 'overdue_61_90' | 'overdue_31_60' | 'overdue_1_30' | 'not_due';
  label: string;
  amount: number;
  documents: number;
  share: number;
}

export interface PendingBalanceReportPayload {
  generatedAt: string;
  sourceMaxDate: string;
  salesWindowFrom: string;
  filters: PendingBalanceFilters;
  pendingBalance: number;
  overdueBalance: number;
  overdueShare: number;
  sales30: number;
  overdueToSales30: number | null;
  clientsWithBalance: number;
  overdueClients: number;
  openDocuments: number;
  overdueDocuments: number;
  sellers: PendingBalanceSellerRow[];
  clients: PendingBalanceClientRow[];
  aging: PendingBalanceAgingRow[];
}

export type ReceivableCaseStatus = 'unmanaged' | 'to_contact' | 'in_progress' | 'promise' | 'disputed' | 'resolved';

export type ClientTrendDirection = 'growth' | 'decline';

export interface ClientTrendReview {
  clientId: number;
  direction: ClientTrendDirection;
  reviewedAt: string;
}

export interface ReceivableCaseEvent {
  id: string;
  clientId: number;
  eventType: 'created' | 'assignment' | 'status' | 'follow_up' | 'promise' | 'comment';
  actor: string;
  comment: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
}

export interface ReceivableCase {
  clientId: number;
  responsible: string;
  status: ReceivableCaseStatus;
  nextFollowUpAt: string | null;
  promiseAmount: number | null;
  promiseDueAt: string | null;
  updatedAt: string;
  updatedBy: string;
  lastComment: string;
  eventCount: number;
}

export interface ReceivableDashboardFilters extends PendingBalanceFilters {
  responsible: string;
  internalStatus: string;
  aging: string;
  query: string;
}

export interface ReceivableDashboardRow extends PendingBalanceClientRow {
  workflow: ReceivableCase;
}

export interface PendingBalanceDocumentRow {
  documentId: string;
  clientId: number;
  documentNumber: string;
  issuedAt: string;
  dueAt: string;
  outstanding: number;
  creditTermDays: number | null;
  paymentMethod: string;
  status: 'overdue' | 'not_due';
  overdueDays: number;
}

export interface ReceivableCaseDetail {
  workflow: ReceivableCase;
  events: ReceivableCaseEvent[];
  documents: PendingBalanceDocumentRow[];
}

export interface InvoiceDetailPayload {
  id: string;
  number: string;
  kind: 'invoice' | 'credit_note';
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  amount: number;
  netAmount: number | null;
  outstanding: number;
  status: InvoiceStatus | 'not_due';
  creditTermDays: number | null;
  paymentMethod: string;
  client: {
    id: number;
    name: string;
    tradeName: string;
    seller: string;
    address: string;
    locality: string;
  };
  issuer: string;
  branch: string;
  sourceMaxDate: string;
  detailAvailable: boolean;
  lineItems: SalesExplorerDocumentDetail['lineItems'];
}

export interface ReceivableDashboardPayload {
  generatedAt: string;
  sourceMaxDate: string;
  filters: ReceivableDashboardFilters;
  pendingBalance: number;
  overdueBalance: number;
  overdueShare: number;
  clientsWithBalance: number;
  overdueClients: number;
  openDocuments: number;
  overdueDocuments: number;
  dueFollowUps: number;
  unmanagedClients: number;
  aging: PendingBalanceAgingRow[];
  statusBreakdown: Array<{ status: ReceivableCaseStatus; clients: number; amount: number }>;
  rows: ReceivableDashboardRow[];
  options: {
    sellers: string[];
    paymentMethods: string[];
    responsibles: string[];
  };
}

export type CommercialGoalVersionStatus = 'draft' | 'active' | 'archived';

export interface CommercialGoalVersion {
  id: string;
  version: number;
  name: string;
  status: CommercialGoalVersionStatus;
  sourceLabel: string;
  coverageFrom: string;
  coverageThrough: string;
  notes: string;
  createdAt: string;
  createdBy: string;
  activatedAt: string | null;
  rowCount: number;
}

export interface CommercialGoalRow {
  id: string;
  month: string;
  product: string;
  seller: string;
  kilos: number | null;
  accounts: number | null;
  invoicing: number | null;
}

export interface CommercialGoalChange {
  id: string;
  versionId: string;
  eventType: 'created' | 'row_created' | 'row_updated' | 'row_deleted' | 'activated';
  entityKey: string;
  actor: string;
  comment: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface CommercialGoalsPayload {
  versions: CommercialGoalVersion[];
  selectedVersion: CommercialGoalVersion;
  selectedMonth: string;
  months: string[];
  sellers: string[];
  products: string[];
  rows: CommercialGoalRow[];
  changes: CommercialGoalChange[];
}

export type SavedViewKey =
  | 'map' | 'agenda' | 'routes' | 'clients' | 'sellers' | 'finance' | 'products' | 'brands'
  | 'sales-explorer' | 'receivables' | 'goals'
  | 'reports' | 'commercial-sales' | 'spt' | 'pending-balances' | 'non-buyers' | 'mars' | 'nutripet' | 'baires'
  | 'settings';

export const SAVED_VIEW_KEYS: SavedViewKey[] = [
  'map', 'agenda', 'routes', 'clients', 'sellers', 'finance', 'products', 'brands',
  'sales-explorer', 'receivables', 'goals',
  'reports', 'commercial-sales', 'spt', 'pending-balances', 'non-buyers', 'mars', 'nutripet', 'baires',
  'settings',
];

export interface SavedView {
  id: string;
  viewKey: SavedViewKey;
  name: string;
  filters: Record<string, string>;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NonBuyerFilterKey = 'productGroup' | 'category' | 'brand' | 'seller';

export type NonBuyerFilters = Record<NonBuyerFilterKey, string>;

export interface NonBuyerReportMeta {
  available: boolean;
  sourceSystem: string;
  rowCount: number;
  coverageFrom: string;
  minDate: string;
  maxDate: string;
  capturedAt: string;
  sourceDocumentCount: number;
  unavailableDocumentCount: number;
  options: Record<NonBuyerFilterKey, string[]>;
  agreementsAvailable: boolean;
  agreementsNote: string;
  universe: {
    companies: number[];
    branches: number[];
    allowedIssuers: string[];
    clientStatuses: string[];
    excludedClients: string[];
    excludedProductGroups: string[];
    excludedCategories: string[];
    excludedSellers: string[];
    excludedBrands: string[];
  };
}

export interface NonBuyerSummary {
  universe90: number;
  buyers30: number;
  nonBuyers30: number;
  rate: number | null;
  universe180: number;
}

export interface NonBuyerEntityRow {
  id: string;
  clientId: number | null;
  name: string;
  seller: string;
  lastPurchaseDate: string | null;
  daysSinceLastPurchase: number | null;
  averageKilos3Months: number;
  averageSales3Months: number;
  net180: number;
  net90: number;
  net30: number;
  isNonBuyer30: boolean;
}

export interface NonBuyerSellerRow {
  seller: string;
  universe90: number;
  nonBuyers30: number;
  rate: number | null;
}

export interface NonBuyerReportPayload {
  generatedAt: string;
  sourceMaxDate: string;
  filters: NonBuyerFilters;
  windows: {
    from180: string;
    from90: string;
    from30: string;
    through: string;
    averageFrom: string;
    averageThrough: string;
  };
  accountsSummary: NonBuyerSummary;
  brandsSummary: NonBuyerSummary;
  accounts: NonBuyerEntityRow[];
  brands: NonBuyerEntityRow[];
  accountSellers: NonBuyerSellerRow[];
  brandSellers: NonBuyerSellerRow[];
}

export interface Recommendation {
  product: Product;
  score: number;
  similarity: number;
  peerAdoption: number;
  peerSampleSize: number;
  confidence: RecommendationConfidence;
  reason: string;
}

export interface CommercialActivity {
  id: string;
  clientId: number;
  seller: string;
  type: CommercialActivityType;
  outcome: CommercialActivityOutcome;
  occurredAt: string;
  note: string;
  amount: number | null;
  productIds: string[];
  nextActionAt: string | null;
  createdAt: string;
}

export interface PaymentPromise {
  id: string;
  clientId: number;
  activityId: string | null;
  seller: string;
  dueAt: string;
  amount: number;
  status: PaymentPromiseStatus;
  note: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AgendaEntry {
  id: string;
  clientId: number;
  clientName: string;
  seller: string;
  locality: string;
  address: string;
  coordinates: [number, number] | null;
  scheduledFor: string;
  actionType: CommercialActivityType;
  reason: string;
  source: AgendaSource;
  status: AgendaStatus;
  priority: number;
  collectionRisk: number;
  commercialOpportunity: number;
  overdueOutstanding: number;
  portfolioStatus: PortfolioStatus;
  salesBlocked: boolean;
}

export interface AgendaPayload {
  date: string;
  seller: string;
  entries: AgendaEntry[];
  activities: CommercialActivity[];
  promises: PaymentPromise[];
  stats: {
    planned: number;
    pending: number;
    completed: number;
    overduePromises: number;
    promiseAmountDue: number;
  };
  definitions: {
    planned: string;
    completed: string;
    promiseAmountDue: string;
  };
}

export interface NotificationItem {
  id: string;
  type: 'promise_overdue' | 'promise_due' | 'collection_risk';
  severity: 'critical' | 'attention';
  clientId: number;
  title: string;
  detail: string;
  date: string;
  amount: number | null;
}

export interface RouteStop {
  order: number;
  clientId: number;
  clientName: string;
  locality: string;
  distanceKm: number;
  etaMinutes: number;
  priority: number;
}

export interface RoutePlan {
  depot: typeof SALICE_DEPOT;
  stops: RouteStop[];
  totalKm: number;
  totalMinutes: number;
  algorithm: string;
  feasible: boolean;
  warnings: string[];
  assumptions: {
    visitMinutes: number;
    maxWorkMinutes: number;
    roadFactor: number;
  };
}

export const VECTOR_LABELS: Record<VectorKey, string> = {
  perros: 'Dogs',
  gatos: 'Cats',
  otras_especies: 'Other species',
  cachorros: 'Puppies and kittens',
  adultos: 'Adults',
  senior: 'Senior',
  tamano_pequeno: 'Small pet',
  tamano_mediano: 'Medium pet',
  tamano_grande: 'Large pet',
  premium: 'Premium',
  economico: 'Budget',
  alimento_seco: 'Dry food',
  alimento_humedo: 'Wet food',
  snacks: 'Snacks and treats',
  farmacia: 'Veterinary pharmacy',
  antiparasitario: 'Antiparasitic',
  natural: 'Natural',
  funcional: 'Functional',
  esterilizados: 'Sterilized',
  control_peso: 'Weight control',
  piel_pelaje: 'Skin and coat',
  salud_urinaria: 'Urinary health',
  salud_digestiva: 'Digestive health',
  salud_dental: 'Dental health',
  higiene: 'Hygiene',
  accesorios: 'Accessories',
  granel: 'Bulk',
  consumo_humano: 'Human consumption',
  promocional: 'Promotional',
  sabor_pollo: 'Chicken',
  sabor_carne: 'Beef',
  sabor_pescado: 'Fish',
  sabor_cordero: 'Lamb',
};

export const VECTOR_DESCRIPTIONS: Record<VectorKey, string> = {
  perros: 'Affinity with products intended for dogs.',
  gatos: 'Affinity with products intended for cats.',
  otras_especies: 'Products for birds, horses, cattle, rodents, and other species.',
  cachorros: 'Products formulated for early life stages.',
  adultos: 'Products intended for adult animals.',
  senior: 'Products for older animals.',
  tamano_pequeno: 'Products formulated, dosed, or sized for small pets.',
  tamano_mediano: 'Products formulated, dosed, or sized for medium pets.',
  tamano_grande: 'Products formulated, dosed, or sized for large or giant pets.',
  premium: 'Higher quality, formulation, or relative price positioning.',
  economico: 'Maintenance, value, or accessible price positioning.',
  alimento_seco: 'Dry balanced foods and kibble.',
  alimento_humedo: 'Cans, pouches, and other wet formats.',
  snacks: 'Treats and complementary snacks.',
  farmacia: 'Medicines, biological products, and veterinary supplies.',
  antiparasitario: 'Pipettes and treatments for fleas, ticks, and parasites.',
  natural: 'Natural or organic ingredients and preservative-free positioning.',
  funcional: 'Dietary or therapeutic solutions for specific needs.',
  esterilizados: 'Food and solutions explicitly intended for sterilized animals.',
  control_peso: 'Light, ideal-weight, or weight-control products.',
  piel_pelaje: 'Dermatological care, skin sensitivity, and coat maintenance.',
  salud_urinaria: 'Urinary, renal, or urinary-tract support products.',
  salud_digestiva: 'Explicit gastrointestinal, digestive, or hepatic support.',
  salud_dental: 'Oral hygiene, tartar control, and dental snacks.',
  higiene: 'Litter, sanitary, shampoo, and cleaning products.',
  accesorios: 'Leashes, collars, toys, beds, and equipment.',
  granel: 'Products or formats suited to bulk or portioned sales.',
  consumo_humano: 'Beverages, frozen goods, and other food for people.',
  promocional: 'Point-of-sale material, bonuses, merchandising, and promotions.',
  sabor_pollo: 'Pet foods whose description explicitly mentions chicken.',
  sabor_carne: 'Pet foods whose description explicitly mentions beef.',
  sabor_pescado: 'Pet foods whose description explicitly mentions fish, tuna, or salmon.',
  sabor_cordero: 'Pet foods whose description explicitly mentions lamb.',
};

export const VECTOR_GROUPS: { id: string; label: string; description: string; keys: VectorKey[] }[] = [
  { id: 'species', label: 'Species', description: 'The animal species targeted by the product.', keys: ['perros', 'gatos', 'otras_especies'] },
  { id: 'life-stage', label: 'Life stage and size', description: 'Explicit life stage and pet size.', keys: ['cachorros', 'adultos', 'senior', 'tamano_pequeno', 'tamano_mediano', 'tamano_grande'] },
  { id: 'positioning', label: 'Positioning', description: 'Quality, relative price, and selling format.', keys: ['premium', 'economico', 'natural', 'granel', 'promocional'] },
  { id: 'product-type', label: 'Product type', description: 'Primary product format and use.', keys: ['alimento_seco', 'alimento_humedo', 'snacks', 'farmacia', 'antiparasitario', 'higiene', 'accesorios', 'consumo_humano'] },
  { id: 'needs', label: 'Specific needs', description: 'Explicit health or care functions.', keys: ['funcional', 'esterilizados', 'control_peso', 'piel_pelaje', 'salud_urinaria', 'salud_digestiva', 'salud_dental'] },
  { id: 'flavour', label: 'Protein or flavor', description: 'Primary ingredients explicitly named in pet foods.', keys: ['sabor_pollo', 'sabor_carne', 'sabor_pescado', 'sabor_cordero'] },
];
