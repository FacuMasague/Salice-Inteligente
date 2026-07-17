export type Health = 'healthy' | 'attention' | 'critical';
export type InvoiceStatus = 'paid' | 'open' | 'due_soon' | 'overdue';
export type PortfolioStatus = 'confirmed' | 'review';
export type RecommendationConfidence = 'reliable' | 'exploratory' | 'insufficient';

export type VectorKey =
  | 'perros'
  | 'gatos'
  | 'otras_especies'
  | 'cachorros'
  | 'adultos'
  | 'senior'
  | 'premium'
  | 'economico'
  | 'alimento_seco'
  | 'alimento_humedo'
  | 'snacks'
  | 'farmacia'
  | 'antiparasitario'
  | 'natural'
  | 'funcional'
  | 'higiene'
  | 'accesorios'
  | 'granel'
  | 'consumo_humano'
  | 'promocional';

export interface Product {
  id: string;
  sku: string;
  name: string;
  family: string;
  brand: string;
  pack: string;
  price: number;
  stock: number;
  monthlyUnits: number;
  margin: number | null;
  vector: Record<VectorKey, number>;
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
  creditDays: number;
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
  };
}

export const SNAPSHOT_REVISION = 5;

export interface DashboardData {
  meta: SnapshotMeta;
  clients: Client[];
  products: Product[];
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
  perros: 'Perros',
  gatos: 'Gatos',
  otras_especies: 'Otras especies',
  cachorros: 'Cachorros',
  adultos: 'Adultos',
  senior: 'Senior',
  premium: 'Premium',
  economico: 'Económico',
  alimento_seco: 'Alimento seco',
  alimento_humedo: 'Alimento húmedo',
  snacks: 'Snacks y premios',
  farmacia: 'Farmacia veterinaria',
  antiparasitario: 'Antiparasitario',
  natural: 'Natural',
  funcional: 'Funcional',
  higiene: 'Higiene',
  accesorios: 'Accesorios',
  granel: 'Granel',
  consumo_humano: 'Consumo humano',
  promocional: 'Promocional',
};

export const VECTOR_DESCRIPTIONS: Record<VectorKey, string> = {
  perros: 'Afinidad con productos destinados a perros.',
  gatos: 'Afinidad con productos destinados a gatos.',
  otras_especies: 'Productos para aves, equinos, bovinos, roedores y otras especies.',
  cachorros: 'Productos formulados para primeras etapas de vida.',
  adultos: 'Productos orientados a animales adultos.',
  senior: 'Productos para animales mayores o de edad avanzada.',
  premium: 'Posicionamiento de calidad, formulación o precio superior.',
  economico: 'Oferta de mantenimiento, rendimiento o precio accesible.',
  alimento_seco: 'Alimentos balanceados secos y croquetas.',
  alimento_humedo: 'Latas, sobres, pouch y otras presentaciones húmedas.',
  snacks: 'Premios, golosinas y snacks complementarios.',
  farmacia: 'Medicamentos, biológicos y productos veterinarios.',
  antiparasitario: 'Pipetas y tratamientos contra pulgas, garrapatas y parásitos.',
  natural: 'Ingredientes o posicionamiento natural, orgánico o sin conservantes.',
  funcional: 'Soluciones dietarias, terapéuticas o para necesidades específicas.',
  higiene: 'Arenas, sanitarios, shampoo y productos de limpieza.',
  accesorios: 'Correas, collares, juguetes, camas y equipamiento.',
  granel: 'Productos o formatos adecuados para venta fraccionada o gran volumen.',
  consumo_humano: 'Almacén, bebidas, congelados y otros alimentos para personas.',
  promocional: 'Material POP, bonificaciones, merchandising y promociones.',
};
