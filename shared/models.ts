import type {
  AiCommercialExplanation,
  AiExecutiveBrief,
  AiReportNarrative,
  AiStoredArtifact,
} from './ai.js';

export type Health = 'healthy' | 'attention' | 'critical';
export type InvoiceStatus = 'paid' | 'open' | 'due_soon' | 'overdue';
export type PortfolioStatus = 'confirmed' | 'review';
export type RecommendationConfidence = 'reliable' | 'exploratory' | 'insufficient';
export type RecommendationKind = 'mix_gap' | 'peer_adoption' | 'stockout_substitute' | 'high_stock_opportunity';
export type CommercialActivityType = 'note' | 'visit' | 'call' | 'collection' | 'offer';
export type CommercialActivityOutcome = 'noted' | 'completed' | 'sale' | 'promise' | 'no_contact' | 'rescheduled' | 'no_interest';
export type PaymentPromiseStatus = 'pending' | 'kept' | 'broken' | 'cancelled';
export type AgendaSource = 'algorithm' | 'manual' | 'promise';
export type AgendaStatus = 'pending' | 'completed' | 'cancelled';
export type CreditTermStatus = 'unavailable' | 'single' | 'consistent' | 'predominant' | 'mixed';

export const APP_VERSION = '1.2.2';

export const SALICE_DEPOT: {
  name: string;
  address: string;
  locality: string;
  coordinates: [number, number];
} = {
  name: 'Centro de distribución Salice',
  address: 'Eduardo Bradley 1450',
  locality: 'Mar del Plata',
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
  version: '2.1' | '2.2';
  /** Calidad de la clasificación, no probabilidad de venta. */
  confidence: number;
  /** Cobertura de los campos descriptivos y maestros disponibles en GESI. */
  sourceCoverage: number;
  evidence: Partial<Record<VectorKey, string[]>>;
  /** Combinaciones explícitas que no deben auditarse como contradicciones. */
  declaredCombinations?: Partial<Record<'species' | 'lifeStage' | 'petSize', string>>;
}

export interface ProductVectorCorrection {
  productId: string;
  key: VectorKey;
  value: number;
  reason: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ProductVectorCorrectionEvent extends ProductVectorCorrection {
  id: string;
  eventType: 'set' | 'removed';
}

export type ProductMasterStatus = 'active' | 'inactive' | 'unknown';
export type ProductPricePosition = 'budget' | 'market' | 'premium' | 'unknown';
export type ProductCommercialStatus = 'commercializable' | 'not_commercializable' | 'insufficient';
export type StockSignalStatus = 'positive' | 'zero' | 'negative' | 'unavailable';
export type StockSignalQuality = 'reliable' | 'attention' | 'insufficient';
export type CatalogParticipationReason = 'active_master' | 'recent_sale' | 'nonzero_inventory';

export interface ProductInventorySignal {
  capturedAt: string;
  companyId: number;
  branchId: number;
  warehouseId: number;
  warehouseLabel: string;
  completeZeroStockUniverse: boolean;
  rawAvailableUnit1: number | null;
  rawAvailableUnit2: number | null;
  unit2: string;
  unit2PerUnit1: number | null;
  status: StockSignalStatus;
  quality: StockSignalQuality;
  qualityReasons: string[];
}

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
  commercialStatus: ProductCommercialStatus;
  /** GESI no expone una marca inequívoca de discontinuación. */
  discontinuationStatus: 'not_reported';
  catalogParticipation: CatalogParticipationReason[];
  price: number;
  /** Contenido neto estimado sólo cuando la presentación es inequívoca. */
  contentKg: number | null;
  /** Precio de referencia normalizado; no se calcula si la unidad es ambigua. */
  referencePricePerKg: number | null;
  /** Mediana por kilo de otros productos comparables del catálogo. */
  competitorReferencePricePerKg?: number | null;
  /** Cantidad de productos comparables usados para la referencia competitiva. */
  competitorPriceSampleSize?: number;
  /** Posición relativa dentro de alimentos secos comparables. */
  pricePosition: ProductPricePosition;
  stock: number;
  units90d: number;
  /** Kilos inferidos desde unidades vendidas y contenido neto por U1 durante 90 días. */
  kilos90d?: number;
  /** Distingue datos heredados observados, inferencias por presentación y conversiones ausentes. */
  kiloDataStatus?: 'available' | 'estimated' | 'unavailable';
  monthlyUnits: number;
  sales90d: number;
  clients90d: number;
  lastSaleAt: string;
  stockCoverageMonths: number | null;
  inventory: ProductInventorySignal;
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
  /** Forma de pago informada por el comprobante; no debe confundirse con la condición actual del cliente. */
  paymentMethod: string;
  /** Vendedor informado por el comprobante; en snapshots anteriores puede faltar y se usa el de la ficha del cliente. */
  seller?: string;
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
  gesiStateId: number;
  statusUpdatedAt: string;
  portfolioStatus: PortfolioStatus;
  reference: string;
  name: string;
  tradeName: string;
  address: string;
  locality: string;
  coordinates: [number, number] | null;
  /**
   * Trazabilidad de la ubicación mostrada. `corrected` usa una referencia
   * aproximada de la localidad cuando las coordenadas de GESI son incompatibles;
   * `review` no se dibuja hasta contar con una ubicación confiable.
   */
  locationStatus?: 'original' | 'corrected' | 'review';
  originalCoordinates?: [number, number] | null;
  locationCorrectionReason?: string;
  locationPrecision?: 'exact' | 'locality';
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
  source: 'demo' | 'gesi';
  sourceLabel: string;
  syncStatus: 'demo' | 'connected' | 'error';
  apiBaseConfigured: boolean;
  disclaimer?: string;
  productVectorVersion?: '2.1' | '2.2';
  coverage?: {
    rawClients: number;
    includedClients: number;
    geocodedClients: number;
    activeClients: number;
    inactiveClients: number;
    activeGeocodedClients: number;
    inactiveGeocodedClients: number;
    correctedLocationClients?: number;
    locationReviewClients?: number;
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
    logistics?: {
      coverageFrom: string;
      coverageThrough: string;
      invoices: number;
      unassignedInvoices: number;
      openSheetInvoices: number;
      closedSheetInvoices: number;
      unknownInvoices: number;
      sheets: number;
      openSheets: number;
      closedSheets: number;
      sheetsWithDriver: number;
    };
    inventory?: {
      companyId: number;
      branchId: number;
      warehouseId: number;
      warehouseLabel: string;
      capturedAt: string;
      completeZeroStockUniverse: boolean;
      masterRows: number;
      uniqueMasterProducts: number;
      duplicateMasterRows: number;
      activeMasterProducts: number;
      inactiveMasterProducts: number;
      unknownMasterProducts: number;
      stockRows: number;
      uniqueStockProducts: number;
      duplicateStockRows: number;
      invalidStockRows: number;
      positiveStockProducts: number;
      zeroStockProducts: number;
      negativeStockProducts: number;
      missingStockProducts: number;
      catalogProducts: number;
      commercializableProducts: number;
      insufficientProducts: number;
      explicitDiscontinuedProducts: number;
      productsWithMissingPrimaryUnit: number;
      productsWithSecondaryUnit: number;
    };
  };
}

export const SNAPSHOT_REVISION = 11;

export type DeliveryAssignmentStatus = 'unassigned' | 'open_sheet' | 'closed_sheet' | 'unknown';

export interface DeliverySheetReference {
  id: number;
  status: 'open' | 'closed';
  driver: string;
  startsAt: string;
  endsAt: string;
  closedAt: string | null;
}

export interface DeliveryInvoice {
  id: string;
  clientId: number;
  number: string;
  issuedAt: string;
  suggestedDeliveryAt: string;
  amount: number;
  kilos?: number;
  kiloDataStatus?: 'available' | 'estimated' | 'unavailable';
  deliveryAddress: string;
  locality: string;
  assignmentStatus: DeliveryAssignmentStatus;
  sheet: DeliverySheetReference | null;
}

export interface DeliverySheet extends DeliverySheetReference {
  zone: string;
  subzone: string;
  comment: string;
  dispatchComment: string;
  dispatchedAt: string | null;
  invoiceIds: string[];
}

export interface LogisticsSnapshot {
  coverageFrom: string;
  coverageThrough: string;
  invoices: DeliveryInvoice[];
  sheets: DeliverySheet[];
}

export interface DashboardData {
  meta: SnapshotMeta;
  clients: Client[];
  products: Product[];
  logistics: LogisticsSnapshot;
  executiveSummary?: ExecutiveSummaryPayload | null;
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
    branches: number[];
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
  aiNarrative?: AiStoredArtifact<AiReportNarrative> | null;
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
  aiNarrative?: AiStoredArtifact<AiReportNarrative> | null;
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

export interface CommercialSellerVariationRow {
  seller: string;
  currentNetAmount: number;
  comparisonNetAmount: number;
  difference: number;
  variation: number | null;
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
  aiNarrative?: AiStoredArtifact<AiReportNarrative> | null;
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
  aiNarrative?: AiStoredArtifact<AiReportNarrative> | null;
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
  aiNarrative?: AiStoredArtifact<AiReportNarrative> | null;
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
  aiNarrative?: AiStoredArtifact<AiReportNarrative> | null;
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

export type SalesExplorerFilterKey = 'seller' | 'client' | 'product' | 'brand' | 'category' | 'productGroup' | 'channel' | 'zone';

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
  productGroup: string;
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
    productGroups: string[];
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
  lineItems: Array<{
    productId: string;
    product: string;
    brand: string;
    category: string;
    units: number;
    kilos: number;
    netAmount: number;
  }>;
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
    minimumDocumentOutstanding: number;
    excludedClients: string[];
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
  aiNarrative?: AiStoredArtifact<AiReportNarrative> | null;
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
  seller: string;
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
  createdBy?: string;
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

export interface CommercialGoalProgressPayload {
  versionId: string;
  month: string;
  sourceMaxDate: string;
  summaries: Array<{
    mode: GeneralReportMode;
    label: string;
    unit: GeneralReportUnit;
    actual: number;
    target: number;
    gap: number;
    completion: number | null;
    isPartial: boolean;
  }>;
  sellers: Array<{
    seller: string;
    actual: number;
    target: number;
    gap: number;
    completion: number | null;
    clientsWithNotes: number;
    notes: number;
    highOpportunityClients: number;
  }>;
  activity: {
    notes: number;
    clientsWithNotes: number;
    highOpportunityClients: number;
  };
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

export type SavedViewPurpose = 'general' | 'client_recovery' | 'collections' | 'product_opportunities';

export interface SavedView {
  id: string;
  viewKey: SavedViewKey;
  purpose: SavedViewPurpose;
  name: string;
  filters: Record<string, string>;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialOpportunityLink {
  id: string;
  savedViewId: string | null;
  clientId: number;
  productId: string;
  recommendationKinds: RecommendationKind[];
  activityId: string | null;
  snapshotAt: string;
  createdAt: string;
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
  aiNarrative?: AiStoredArtifact<AiReportNarrative> | null;
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

export type ExecutiveSummaryDestination =
  | 'commercial-sales'
  | 'reports'
  | 'non-buyers'
  | 'pending-balances'
  | 'routes';

export interface ExecutiveSummaryContext {
  definition: string;
  period: string;
  cutoff: string;
  source: string;
  universe: string;
  warning: string;
  destination: ExecutiveSummaryDestination;
}

export interface ExecutiveSummaryPayload {
  aiBrief?: AiStoredArtifact<AiExecutiveBrief> | null;
  generatedAt: string;
  snapshotAt: string;
  sales: {
    netAmount: number;
    kilos: number;
    buyers: number;
    comparisonNetAmount: number;
    comparisonKilos: number;
    netVariation: number | null;
    kiloVariation: number | null;
    context: ExecutiveSummaryContext;
  };
  goals: {
    actual: number;
    target: number;
    completion: number | null;
    gap: number;
    projectedCompletion: number | null;
    unit: GeneralReportUnit;
    targetSource: string;
    context: ExecutiveSummaryContext;
  };
  nonBuyers: {
    accounts: number;
    universe90: number;
    rate: number | null;
    context: ExecutiveSummaryContext;
  };
  balances: {
    pending: number;
    overdue: number;
    overdueShare: number;
    clients: number;
    context: ExecutiveSummaryContext;
  };
  sellerVariations: {
    rows: CommercialSellerVariationRow[];
    context: ExecutiveSummaryContext;
  };
  logistics: {
    invoices: number;
    unassigned: number;
    openSheet: number;
    closedSheet: number;
    unknown: number;
    context: ExecutiveSummaryContext;
  };
}

export interface Recommendation {
  product: Product;
  score: number;
  similarity: number;
  peerAdoption: number;
  peerSampleSize: number;
  confidence: RecommendationConfidence;
  reason: string;
  kinds: RecommendationKind[];
  affinityExplanation: string;
  evidence: string[];
  comparableClients: Array<Pick<Client, 'id' | 'name' | 'tradeName' | 'seller' | 'locality'>>;
  replacedProduct: Product | null;
}

export interface ProductClientOpportunity {
  client: Pick<Client, 'id' | 'name' | 'tradeName' | 'seller' | 'locality' | 'commercialOpportunity' | 'sales90d'>;
  score: number;
  similarity: number;
  peerAdoption: number;
  peerSampleSize: number;
  confidence: RecommendationConfidence;
  reason: string;
  kinds: Exclude<RecommendationKind, 'stockout_substitute'>[];
  affinityExplanation: string;
  evidence: string[];
  comparableClients: Array<Pick<Client, 'id' | 'name' | 'tradeName' | 'seller' | 'locality'>>;
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
  createdBy?: string;
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

export type CommercialInboxSource = 'system' | 'promise' | 'reminder' | 'note';

export type CommercialInboxSignalKind =
  | 'promise_overdue'
  | 'promise_due'
  | 'follow_up_overdue'
  | 'follow_up_due'
  | 'legacy_reminder'
  | 'sales_blocked'
  | 'sales_decline'
  | 'collection_risk'
  | 'commercial_opportunity'
  | 'suggested_review';

export interface CommercialInboxSignal {
  id: string;
  kind: CommercialInboxSignalKind;
  source: Exclude<CommercialInboxSource, 'note'>;
  label: string;
  detail: string;
  date: string | null;
  severity: 'critical' | 'attention' | 'information';
  amount: number | null;
}

export interface CommercialInboxEntry {
  aiExplanation?: AiStoredArtifact<AiCommercialExplanation> | null;
  clientId: number;
  clientName: string;
  seller: string;
  locality: string;
  address: string;
  coordinates: [number, number] | null;
  collectionRisk: number;
  commercialOpportunity: number;
  visitPriority: number;
  overdueOutstanding: number;
  sales90d: number;
  salesDelta: number;
  salesBlocked: boolean;
  portfolioStatus: PortfolioStatus;
  sources: CommercialInboxSource[];
  signals: CommercialInboxSignal[];
  notes: CommercialActivity[];
}

export interface CommercialInboxPayload {
  weekStart: string;
  weekEnd: string;
  seller: string;
  entries: CommercialInboxEntry[];
  stats: {
    clients: number;
    systemSignals: number;
    dueItems: number;
    notes: number;
  };
  definitions: {
    systemSignals: string;
    dueItems: string;
    notes: string;
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
  address: string;
  locality: string;
  distanceKm: number;
  etaMinutes: number;
  invoiceCount: number;
  invoiceIds: string[];
  amount: number;
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
    stopMinutes: number;
    maxWorkMinutes: number;
    roadFactor: number;
  };
}

export const VECTOR_LABELS: Record<VectorKey, string> = {
  perros: 'Perros',
  gatos: 'Gatos',
  otras_especies: 'Otras especies',
  cachorros: 'Cachorros',
  adultos: 'Adultos',
  senior: 'Senior',
  tamano_pequeno: 'Mascota pequeña',
  tamano_mediano: 'Mascota mediana',
  tamano_grande: 'Mascota grande',
  premium: 'Premium',
  economico: 'Económico',
  alimento_seco: 'Alimento seco',
  alimento_humedo: 'Alimento húmedo',
  snacks: 'Snacks y premios',
  farmacia: 'Farmacia veterinaria',
  antiparasitario: 'Antiparasitario',
  natural: 'Natural',
  funcional: 'Funcional',
  esterilizados: 'Esterilizados',
  control_peso: 'Control de peso',
  piel_pelaje: 'Piel y pelaje',
  salud_urinaria: 'Salud urinaria',
  salud_digestiva: 'Salud digestiva',
  salud_dental: 'Salud dental',
  higiene: 'Higiene',
  accesorios: 'Accesorios',
  granel: 'Granel',
  consumo_humano: 'Consumo humano',
  promocional: 'Promocional',
  sabor_pollo: 'Pollo',
  sabor_carne: 'Carne vacuna',
  sabor_pescado: 'Pescado',
  sabor_cordero: 'Cordero',
};

export const VECTOR_DESCRIPTIONS: Record<VectorKey, string> = {
  perros: 'Afinidad con productos destinados a perros.',
  gatos: 'Afinidad con productos destinados a gatos.',
  otras_especies: 'Productos para aves, equinos, bovinos, roedores y otras especies.',
  cachorros: 'Productos formulados para primeras etapas de vida.',
  adultos: 'Productos orientados a animales adultos.',
  senior: 'Productos para animales mayores o de edad avanzada.',
  tamano_pequeno: 'Productos formulados, dosificados o dimensionados para mascotas pequeñas.',
  tamano_mediano: 'Productos formulados, dosificados o dimensionados para mascotas medianas.',
  tamano_grande: 'Productos formulados, dosificados o dimensionados para mascotas grandes o gigantes.',
  premium: 'Posicionamiento de calidad, formulación o precio superior.',
  economico: 'Oferta de mantenimiento, rendimiento o precio accesible.',
  alimento_seco: 'Alimentos balanceados secos y croquetas.',
  alimento_humedo: 'Latas, sobres, pouch y otras presentaciones húmedas.',
  snacks: 'Premios, golosinas y snacks complementarios.',
  farmacia: 'Medicamentos, biológicos y productos veterinarios.',
  antiparasitario: 'Pipetas y tratamientos contra pulgas, garrapatas y parásitos.',
  natural: 'Ingredientes o posicionamiento natural, orgánico o sin conservantes.',
  funcional: 'Soluciones dietarias, terapéuticas o para necesidades específicas.',
  esterilizados: 'Alimentos y soluciones destinados explícitamente a animales castrados o esterilizados.',
  control_peso: 'Productos light, de peso ideal o control de peso para mascotas.',
  piel_pelaje: 'Cuidado dermatológico, sensibilidad de piel y mantenimiento del pelaje.',
  salud_urinaria: 'Productos urinarios, renales o de soporte de las vías urinarias.',
  salud_digestiva: 'Soporte gastrointestinal, digestivo o hepático explícito.',
  salud_dental: 'Higiene oral, control de sarro y snacks dentales.',
  higiene: 'Arenas, sanitarios, shampoo y productos de limpieza.',
  accesorios: 'Correas, collares, juguetes, camas y equipamiento.',
  granel: 'Productos o formatos adecuados para venta fraccionada o gran volumen.',
  consumo_humano: 'Almacén, bebidas, congelados y otros alimentos para personas.',
  promocional: 'Material POP, bonificaciones, merchandising y promociones.',
  sabor_pollo: 'Alimentos para mascotas con pollo declarado en su descripción.',
  sabor_carne: 'Alimentos para mascotas con carne vacuna declarada.',
  sabor_pescado: 'Alimentos para mascotas con pescado, atún o salmón declarado.',
  sabor_cordero: 'Alimentos para mascotas con cordero declarado.',
};

export const VECTOR_GROUPS: { id: string; label: string; description: string; keys: VectorKey[] }[] = [
  { id: 'species', label: 'Especie', description: 'Para quién está destinado el producto.', keys: ['perros', 'gatos', 'otras_especies'] },
  { id: 'life-stage', label: 'Edad y tamaño', description: 'Etapa de vida y porte explícitos de la mascota.', keys: ['cachorros', 'adultos', 'senior', 'tamano_pequeno', 'tamano_mediano', 'tamano_grande'] },
  { id: 'positioning', label: 'Posicionamiento', description: 'Calidad, precio relativo y forma de comercialización.', keys: ['premium', 'economico', 'natural', 'granel', 'promocional'] },
  { id: 'product-type', label: 'Tipo de producto', description: 'Formato y uso principal del artículo.', keys: ['alimento_seco', 'alimento_humedo', 'snacks', 'farmacia', 'antiparasitario', 'higiene', 'accesorios', 'consumo_humano'] },
  { id: 'needs', label: 'Necesidades específicas', description: 'Funciones de salud o cuidado declaradas.', keys: ['funcional', 'esterilizados', 'control_peso', 'piel_pelaje', 'salud_urinaria', 'salud_digestiva', 'salud_dental'] },
  { id: 'flavour', label: 'Proteína o sabor', description: 'Ingredientes principales declarados en alimentos para mascotas.', keys: ['sabor_pollo', 'sabor_carne', 'sabor_pescado', 'sabor_cordero'] },
];
