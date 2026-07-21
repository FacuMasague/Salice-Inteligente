import { APP_VERSION, SNAPSHOT_REVISION, type Client, type DashboardData, type Invoice, type InvoiceLineItem, type Product, type VectorKey } from '../../shared/models.js';
import { invoiceCreditTermDays, summarizeCreditTerms } from '../../shared/credit-terms.js';

const vector = (values: Partial<Record<VectorKey, number>>): Record<VectorKey, number> => ({
  perros: 0, gatos: 0, otras_especies: 0, cachorros: 0, adultos: 0, senior: 0,
  tamano_pequeno: 0, tamano_mediano: 0, tamano_grande: 0,
  premium: 0, economico: 0, alimento_seco: 0, alimento_humedo: 0, snacks: 0,
  farmacia: 0, antiparasitario: 0, natural: 0, funcional: 0, higiene: 0,
  accesorios: 0, granel: 0, consumo_humano: 0, promocional: 0,
  esterilizados: 0, control_peso: 0, piel_pelaje: 0, salud_urinaria: 0,
  salud_digestiva: 0, salud_dental: 0, sabor_pollo: 0, sabor_carne: 0,
  sabor_pescado: 0, sabor_cordero: 0,
  ...values,
});

interface ProductSeed {
  id: string;
  sku: string;
  name: string;
  family: string;
  brand: string;
  group: string;
  pack: string;
  contentKg: number | null;
  price: number;
  stock: number;
  monthlyUnits: number;
  margin: number;
  vector: Record<VectorKey, number>;
}

const productSeeds: ProductSeed[] = [
  { id: 'P001', sku: 'DOG-ADULT-15', name: 'EverPaw Adult Dog 15 kg', family: 'Dry Food', brand: 'EverPaw', group: 'Orbit Nutrition', pack: '15 kg bag', contentKg: 15, price: 48900, stock: 84, monthlyUnits: 142, margin: 24, vector: vector({ perros: 100, adultos: 100, alimento_seco: 100, economico: 62 }) },
  { id: 'P002', sku: 'DOG-PREMIUM-15', name: 'Northstar Adult Dog 15 kg', family: 'Dry Food', brand: 'Northstar', group: 'Orbit Nutrition', pack: '15 kg bag', contentKg: 15, price: 68700, stock: 61, monthlyUnits: 96, margin: 29, vector: vector({ perros: 100, adultos: 100, alimento_seco: 100, premium: 96, natural: 48 }) },
  { id: 'P003', sku: 'DOG-PUPPY-12', name: 'WildTail Puppy Growth 12 kg', family: 'Dry Food', brand: 'WildTail', group: 'Nova Pet', pack: '12 kg bag', contentKg: 12, price: 57200, stock: 42, monthlyUnits: 74, margin: 27, vector: vector({ perros: 100, cachorros: 100, alimento_seco: 100, premium: 58, funcional: 35 }) },
  { id: 'P004', sku: 'DOG-SENIOR-12', name: 'MeadowCat Senior Dog Care 12 kg', family: 'Dry Food', brand: 'MeadowCat', group: 'Harbor SPT', pack: '12 kg bag', contentKg: 12, price: 64600, stock: 27, monthlyUnits: 39, margin: 31, vector: vector({ perros: 100, senior: 100, alimento_seco: 100, premium: 72, funcional: 88 }) },
  { id: 'P005', sku: 'CAT-ADULT-10', name: 'EverPaw Adult Cat 10 kg', family: 'Dry Food', brand: 'EverPaw', group: 'Nova Pet', pack: '10 kg bag', contentKg: 10, price: 53400, stock: 73, monthlyUnits: 118, margin: 25, vector: vector({ gatos: 100, adultos: 100, alimento_seco: 100, economico: 58 }) },
  { id: 'P006', sku: 'CAT-PREMIUM-75', name: 'Northstar Adult Cat 7.5 kg', family: 'Dry Food', brand: 'Northstar', group: 'Orbit Nutrition', pack: '7.5 kg bag', contentKg: 7.5, price: 61900, stock: 34, monthlyUnits: 82, margin: 32, vector: vector({ gatos: 100, adultos: 100, alimento_seco: 100, premium: 98, natural: 55 }) },
  { id: 'P007', sku: 'CAT-KITTEN-75', name: 'Aster First Year Cat 7.5 kg', family: 'Dry Food', brand: 'Aster', group: 'Nova Pet', pack: '7.5 kg bag', contentKg: 7.5, price: 65200, stock: 29, monthlyUnits: 46, margin: 30, vector: vector({ gatos: 100, cachorros: 100, alimento_seco: 100, premium: 78, funcional: 42 }) },
  { id: 'P008', sku: 'CAT-URINARY-75', name: 'Juniper Urinary Care Cat 7.5 kg', family: 'Dry Food', brand: 'Juniper', group: 'Nova Pet', pack: '7.5 kg bag', contentKg: 7.5, price: 71400, stock: 21, monthlyUnits: 57, margin: 34, vector: vector({ gatos: 100, adultos: 78, alimento_seco: 100, premium: 86, funcional: 100, salud_urinaria: 100 }) },
  { id: 'P009', sku: 'LITTER-20', name: 'CleanNest Mineral Litter 20 kg', family: 'Hygiene', brand: 'CleanNest', group: 'CleanNest', pack: '20 kg bag', contentKg: 20, price: 21800, stock: 96, monthlyUnits: 164, margin: 36, vector: vector({ gatos: 75, higiene: 100, economico: 72 }) },
  { id: 'P010', sku: 'LITTER-PREMIUM-8', name: 'Harbor Home Clumping Litter 8 kg', family: 'Hygiene', brand: 'Harbor Home', group: 'Harbor Retail', pack: '8 kg bag', contentKg: 8, price: 26400, stock: 48, monthlyUnits: 71, margin: 39, vector: vector({ gatos: 72, premium: 88, natural: 35, higiene: 100 }) },
  { id: 'P011', sku: 'DOG-TREAT-1', name: 'MaxTrail Natural Dog Treats 1 kg', family: 'Treats', brand: 'MaxTrail', group: 'PawPeak', pack: '1 kg pouch', contentKg: 1, price: 12900, stock: 123, monthlyUnits: 137, margin: 42, vector: vector({ perros: 100, snacks: 100, premium: 66, natural: 100 }) },
  { id: 'P012', sku: 'CAT-TREAT-20', name: 'Pampas Pet Creamy Cat Treats x20', family: 'Treats', brand: 'Pampas Pet', group: 'Harbor SPT', pack: '20 unit box', contentKg: .5, price: 18600, stock: 67, monthlyUnits: 91, margin: 44, vector: vector({ gatos: 100, snacks: 100, premium: 82, natural: 54 }) },
  { id: 'P013', sku: 'LEASH-STD', name: 'TrailWorks Adjustable Leash', family: 'Accessories', brand: 'TrailWorks', group: 'Harbor Retail', pack: 'Unit', contentKg: null, price: 14800, stock: 52, monthlyUnits: 43, margin: 47, vector: vector({ perros: 88, accesorios: 100, premium: 36 }) },
  { id: 'P014', sku: 'CAT-PLAY-KIT', name: 'Aster Interactive Cat Play Kit', family: 'Accessories', brand: 'Aster', group: 'PawPeak', pack: 'Kit', contentKg: null, price: 17300, stock: 39, monthlyUnits: 36, margin: 49, vector: vector({ gatos: 100, cachorros: 35, accesorios: 100, premium: 44 }) },
  { id: 'P015', sku: 'DOG-VALUE-25', name: 'WildTail Value Dog Food 25 kg', family: 'Dry Food', brand: 'WildTail', group: 'Orbit Nutrition', pack: '25 kg bag', contentKg: 25, price: 42100, stock: 112, monthlyUnits: 188, margin: 19, vector: vector({ perros: 100, adultos: 90, alimento_seco: 100, economico: 100, granel: 86 }) },
  { id: 'P016', sku: 'CAT-VALUE-15', name: 'MeadowCat Value Cat Food 15 kg', family: 'Dry Food', brand: 'MeadowCat', group: 'Nova Pet', pack: '15 kg bag', contentKg: 15, price: 44800, stock: 75, monthlyUnits: 133, margin: 21, vector: vector({ gatos: 100, adultos: 88, alimento_seco: 100, economico: 100, granel: 82 }) },
];

export const DEMO_PRODUCTS: Product[] = productSeeds.map((product, index) => ({
  ...product,
  description: `Synthetic ${product.family.toLowerCase()} item for the SMART Salice demo.`,
  subcategory: product.family === 'Dry Food' ? (product.contentKg && product.contentKg >= 12 ? 'Large Bags' : 'Small Bags') : product.family,
  line: `${product.brand} Demo Line`,
  commercialFamily: 'Synthetic demo catalog',
  unit: 'EA',
  unitsPerCase: null,
  masterStatus: 'active',
  referencePricePerKg: product.contentKg ? Math.round(product.price / product.contentKg) : null,
  pricePosition: product.vector.premium >= 75 ? 'premium' : product.vector.economico >= 75 ? 'budget' : 'market',
  units90d: product.monthlyUnits * 3,
  sales90d: product.price * product.monthlyUnits * 3,
  clients90d: 4 + index % 8,
  lastSaleAt: '2026-07-15',
  stockCoverageMonths: Math.round(product.stock / Math.max(product.monthlyUnits, 1) * 10) / 10,
  vectorMeta: {
    version: '2.1', confidence: 92, sourceCoverage: 100,
    evidence: Object.fromEntries(Object.entries(product.vector)
      .filter(([, value]) => value > 0)
      .map(([key]) => [key, ['Synthetic catalog name and classification']])) as Product['vectorMeta']['evidence'],
  },
}));

interface ClientSeed {
  name: string;
  locality: string;
  coordinates: [number, number];
  zone: string;
  segment: string;
  seller: string;
  address: string;
  productIds: string[];
  balance: number;
  credit: number;
  payDays: number;
  priority: number;
  delta: number;
}

const clientSeeds: ClientSeed[] = [
  { name: 'North Paw Market', locality: 'Harbor City', coordinates: [-37.958, -57.568], zone: 'North District', segment: 'Pet Shop', seller: 'Alex Morgan', address: '100 Demo Avenue', productIds: ['P001', 'P005', 'P009', 'P011', 'P013'], balance: 284000, credit: 900000, payDays: 25, priority: 82, delta: 34 },
  { name: 'Harbor Pet Supply', locality: 'Harbor City', coordinates: [-38.003, -57.552], zone: 'Central District', segment: 'Pet Shop', seller: 'Jordan Lee', address: '220 Sample Street', productIds: ['P002', 'P005', 'P006', 'P009', 'P011', 'P012'], balance: 0, credit: 1300000, payDays: 18, priority: 54, delta: 7 },
  { name: 'Pine & Paws', locality: 'Harbor City', coordinates: [-38.041, -57.586], zone: 'West District', segment: 'Feed Store', seller: 'Alex Morgan', address: '315 Fiction Road', productIds: ['P001', 'P005', 'P015', 'P016'], balance: 860000, credit: 950000, payDays: 46, priority: 96, delta: -38 },
  { name: 'Coastal Companions', locality: 'Harbor City', coordinates: [-38.047, -57.542], zone: 'South District', segment: 'Pet Shop', seller: 'Jordan Lee', address: '44 Prototype Lane', productIds: ['P002', 'P006', 'P008', 'P010', 'P012', 'P014'], balance: 145000, credit: 1100000, payDays: 21, priority: 67, delta: 19 },
  { name: 'Meadow Feed', locality: 'Meadow Junction', coordinates: [-38.009, -57.708], zone: 'Inland District', segment: 'Feed Store', seller: 'Casey Rivera', address: '12 Sandbox Way', productIds: ['P001', 'P003', 'P005', 'P015', 'P016'], balance: 0, credit: 820000, payDays: 14, priority: 48, delta: 4 },
  { name: 'Bright Tails', locality: 'Southshore', coordinates: [-38.271, -57.84], zone: 'Coastal South', segment: 'Pet Shop', seller: 'Casey Rivera', address: '78 Mockup Boulevard', productIds: ['P001', 'P002', 'P005', 'P009', 'P011'], balance: 510000, credit: 700000, payDays: 39, priority: 91, delta: -44 },
  { name: 'Summit Animal Care', locality: 'Highland Point', coordinates: [-37.848, -58.255], zone: 'Highland Route', segment: 'Veterinary Store', seller: 'Taylor Brooks', address: '520 Scenario Drive', productIds: ['P001', 'P003', 'P004', 'P015', 'P016'], balance: 72000, credit: 1500000, payDays: 27, priority: 63, delta: 36 },
  { name: 'Seaside Pet Shop', locality: 'Northshore', coordinates: [-37.833, -57.508], zone: 'Coastal North', segment: 'Pet Shop', seller: 'Alex Morgan', address: '9 Example Court', productIds: ['P002', 'P005', 'P006', 'P009', 'P012', 'P014'], balance: 340000, credit: 780000, payDays: 32, priority: 78, delta: 9 },
  { name: 'Country Bowl', locality: 'Cedar Plains', coordinates: [-37.451, -57.729], zone: 'Rural North', segment: 'Feed Store', seller: 'Taylor Brooks', address: '61 Demo Park', productIds: ['P001', 'P005', 'P015', 'P016'], balance: 0, credit: 940000, payDays: 17, priority: 41, delta: 2 },
  { name: 'Urban Whiskers', locality: 'Harbor City', coordinates: [-38.017, -57.54], zone: 'Central District', segment: 'Pet Shop', seller: 'Jordan Lee', address: '805 Placeholder Street', productIds: ['P002', 'P004', 'P006', 'P008', 'P010', 'P011', 'P012', 'P014'], balance: 1180000, credit: 1200000, payDays: 52, priority: 99, delta: -41 },
  { name: 'Greenfield Vet', locality: 'Harbor City', coordinates: [-38.086, -57.557], zone: 'South District', segment: 'Veterinary Store', seller: 'Casey Rivera', address: '140 Test Route', productIds: ['P002', 'P003', 'P004', 'P006', 'P007', 'P008'], balance: 96000, credit: 1750000, payDays: 23, priority: 58, delta: 11 },
  { name: 'Pawprint Depot', locality: 'Harbor City', coordinates: [-37.97, -57.563], zone: 'North District', segment: 'Pet Shop', seller: 'Alex Morgan', address: '33 Concept Avenue', productIds: ['P001', 'P002', 'P005', 'P009', 'P010', 'P011', 'P013'], balance: 0, credit: 1050000, payDays: 16, priority: 45, delta: 14 },
  { name: 'Hilltop Farm Store', locality: 'Ridgeview', coordinates: [-37.942, -57.774], zone: 'Highland Route', segment: 'Veterinary Store', seller: 'Taylor Brooks', address: '410 Fictional Way', productIds: ['P001', 'P003', 'P004', 'P015', 'P016'], balance: 265000, credit: 1400000, payDays: 30, priority: 69, delta: 5 },
  { name: 'South Trail Pets', locality: 'South Trail', coordinates: [-38.176, -57.65], zone: 'Inland District', segment: 'Pet Shop', seller: 'Casey Rivera', address: '548 Simulation Road', productIds: ['P001', 'P005', 'P009', 'P011', 'P012'], balance: 430000, credit: 620000, payDays: 41, priority: 88, delta: -35 },
  { name: 'Dune Pet Market', locality: 'Dune Coast', coordinates: [-37.263, -56.974], zone: 'Coastal North', segment: 'Pet Shop', seller: 'Alex Morgan', address: '1280 Demo Promenade', productIds: ['P002', 'P005', 'P006', 'P009', 'P010', 'P012'], balance: 0, credit: 880000, payDays: 20, priority: 51, delta: 39 },
  { name: 'Oak & Grain', locality: 'Oakfield', coordinates: [-38.113, -57.844], zone: 'Coastal South', segment: 'Feed Store', seller: 'Casey Rivera', address: '640 Sample Road', productIds: ['P001', 'P003', 'P005', 'P015', 'P016'], balance: 180000, credit: 760000, payDays: 29, priority: 72, delta: 8 },
];

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function latestPurchaseDate(index: number) {
  return ['2026-07-15', '2026-07-11', '2026-07-08', '2026-07-14'][index % 4];
}

function createPurchases(seed: ClientSeed, index: number) {
  const latest = latestPurchaseDate(index);
  const dates = [latest, addDays(latest, -28), addDays(latest, -56)];
  return seed.productIds.flatMap((productId, productIndex) => {
    const product = DEMO_PRODUCTS.find((item) => item.id === productId)!;
    return dates.map((date, dateIndex) => {
      const quantity = 2 + ((index + productIndex * 2 + dateIndex) % 7);
      return { productId, date, quantity, total: Math.round(product.price * quantity * (0.96 + (index % 3) * 0.01)) };
    });
  });
}

function createInvoiceLines(seed: ClientSeed, index: number, sequence: number, amount: number): InvoiceLineItem[] {
  const selected = Array.from({ length: Math.min(4, seed.productIds.length) }, (_, offset) => {
    const productId = seed.productIds[(sequence + offset) % seed.productIds.length];
    const product = DEMO_PRODUCTS.find((item) => item.id === productId)!;
    const units = 2 + ((index + sequence * 2 + offset * 3) % 7);
    return { product, units, weight: product.price * units };
  });
  const totalWeight = selected.reduce((sum, item) => sum + item.weight, 0);
  let allocated = 0;
  return selected.map(({ product, units, weight }, itemIndex) => {
    const netAmount = itemIndex === selected.length - 1 ? amount - allocated : Math.round(amount * weight / totalWeight);
    allocated += netAmount;
    return {
      productId: product.id,
      product: product.name,
      brand: product.brand,
      category: product.family,
      units,
      kilos: product.contentKg == null ? 0 : Math.round(product.contentKg * units * 1000) / 1000,
      netAmount,
    };
  });
}

function createInvoices(seed: ClientSeed, index: number): Invoice[] {
  const contractualDays = seed.payDays > 30 ? 45 : 30;
  const firstAmount = 246000 + index * 17300;
  const secondAmount = 198000 + index * 12100;
  const invoices: Invoice[] = [
    { id: `INV-${index + 1}-01`, number: `INV-${String(61320 + index).padStart(8, '0')}`, issuedAt: '2026-04-03', dueAt: addDays('2026-04-03', contractualDays), paidAt: addDays('2026-04-03', seed.payDays - 2), amount: firstAmount, outstanding: 0, status: 'paid', creditTermDays: contractualDays, paymentMethod: 'Net 30', lineItems: createInvoiceLines(seed, index, 0, firstAmount) },
    { id: `INV-${index + 1}-02`, number: `INV-${String(61880 + index).padStart(8, '0')}`, issuedAt: '2026-05-05', dueAt: addDays('2026-05-05', contractualDays), paidAt: addDays('2026-05-05', seed.payDays + 2), amount: secondAmount, outstanding: 0, status: 'paid', creditTermDays: contractualDays, paymentMethod: 'Net 30', lineItems: createInvoiceLines(seed, index, 1, secondAmount) },
  ];
  if (seed.balance > 0) {
    const critical = seed.balance / seed.credit > 0.78 || seed.payDays > 44;
    const status: Invoice['status'] = critical || index === 5 || index === 15 ? 'overdue' : index % 3 === 0 ? 'due_soon' : 'open';
    const overdueIndices = [2, 5, 9, 15];
    const overdueDates = ['2026-07-12', '2026-06-27', '2026-05-31', '2026-03-27'];
    const futureDates = ['2026-07-18', '2026-08-02', '2026-09-05', '2026-10-04'];
    const dueAt = status === 'overdue'
      ? overdueDates[Math.max(0, overdueIndices.indexOf(index))]
      : status === 'due_soon' ? futureDates[0] : futureDates[1 + (index % 3)];
    const issuedAt = addDays(dueAt, -contractualDays);
    const openInvoice = {
      id: `INV-${index + 1}-03`, number: `INV-${String(62410 + index).padStart(8, '0')}`,
      issuedAt, dueAt,
      amount: seed.balance, outstanding: seed.balance, status,
    };
    invoices.unshift({ ...openInvoice, creditTermDays: invoiceCreditTermDays(openInvoice.issuedAt, openInvoice.dueAt), paymentMethod: contractualDays === 45 ? 'Net 45' : 'Net 30', lineItems: createInvoiceLines(seed, index, 2, seed.balance) });
  }
  return invoices;
}

export const DEMO_CLIENTS: Client[] = clientSeeds.map((seed, index) => {
  const invoices = createInvoices(seed, index);
  const purchases = createPurchases(seed, index);
  const sales90d = purchases.reduce((sum, purchase) => sum + purchase.total, 0);
  const overdue = invoices.some((invoice) => invoice.status === 'overdue');
  const utilization = seed.balance / seed.credit;
  const health = overdue && (utilization > .6 || seed.payDays > 40) ? 'critical' : overdue || utilization > .55 ? 'attention' : 'healthy';
  const baseTrend = Math.round(sales90d / 3 / 1000);
  const creditTerm = summarizeCreditTerms(invoices.map(({ issuedAt, dueAt }) => ({ issuedAt, dueAt })));
  return {
    id: 4100 + index, active: true, sourceStateId: 1, statusUpdatedAt: '2026-07-15', portfolioStatus: 'confirmed',
    reference: `DEMO-${String(4100 + index)}`, name: `${seed.name} Demo LLC`, tradeName: seed.name,
    address: seed.address, locality: seed.locality, coordinates: seed.coordinates, zone: seed.zone,
    segment: seed.segment, channel: seed.segment === 'Pet Shop' ? 'Specialty Retail' : seed.segment, seller: seed.seller,
    phone: `+54 223 555 ${String(1000 + index).padStart(4, '0')}`, email: `buyer${index + 1}@synthetic-demo.invalid`,
    creditLimit: seed.credit, balance: seed.balance, accountEnabled: true, salesBlocked: false, deliveryBlocked: false,
    paymentMethod: contractualLabel(seed.payDays), creditDays: creditTerm.creditDays, creditTermStatus: creditTerm.status,
    creditTermSampleSize: creditTerm.sampleSize, creditTermDominantShare: creditTerm.dominantShare,
    creditTermMinDays: creditTerm.minDays, creditTermMaxDays: creditTerm.maxDays, creditTermOptions: creditTerm.options,
    avgPaymentDays: seed.payDays, avgPaymentDelayDays: seed.payDays - (seed.payDays > 30 ? 45 : 30),
    onTimePaymentRate: seed.payDays <= (seed.payDays > 30 ? 45 : 30) ? 80 : 40, paymentSampleSize: 5,
    paymentTrend: [seed.payDays - 5, seed.payDays + 2, seed.payDays - 1, seed.payDays + 4, seed.payDays],
    paymentDelayTrend: [-4, 1, -2, 2, seed.payDays - (seed.payDays > 30 ? 45 : 30)],
    salesTrend: [Math.round(baseTrend * .84), Math.round(baseTrend * .88), Math.round(baseTrend * .96), Math.round(baseTrend * 1.02), baseTrend, Math.round(baseTrend * (1 + seed.delta / 100))],
    lastPurchaseAt: latestPurchaseDate(index), nextVisitAt: ['2026-07-22', '2026-07-23', '2026-07-24'][index % 3],
    sales90d, unmappedSales90d: 0, salesDelta: seed.delta,
    collectionRisk: health === 'critical' ? 72 : health === 'attention' ? 38 : 12,
    commercialOpportunity: Math.max(15, Math.min(90, 42 - seed.delta)), visitPriority: seed.priority, health,
    overdueOutstanding: invoices.filter((invoice) => invoice.status === 'overdue').reduce((sum, invoice) => sum + invoice.outstanding, 0),
    oldestOverdueDays: invoices.some((invoice) => invoice.status === 'overdue')
      ? Math.max(...invoices.filter((invoice) => invoice.status === 'overdue').map((invoice) => Math.max(0, Math.round((new Date('2026-07-15T12:00:00Z').getTime() - new Date(`${invoice.dueAt}T12:00:00Z`).getTime()) / 86_400_000))))
      : 0,
    purchases, invoices,
    note: index % 3 === 0 ? 'Review stock gaps and offer high-rotation items.' : index % 3 === 1 ? 'Prefers a message before an office follow-up.' : 'Confirm available stock before preparing the order.',
  };
});

function contractualLabel(payDays: number) {
  return payDays > 30 ? 'Net 45' : 'Net 30';
}

export function createDemoSnapshot(): DashboardData {
  return {
    meta: {
      version: APP_VERSION,
      revision: SNAPSHOT_REVISION,
      generatedAt: '2026-07-15T15:00:00.000Z',
      source: 'demo',
      sourceLabel: 'Synthetic local demo dataset',
      syncStatus: 'demo',
      productVectorVersion: '2.1',
      disclaimer: 'All companies, people, products, documents, balances, and transactions in this build are fictional and generated locally for demonstration.',
    },
    products: DEMO_PRODUCTS,
    clients: DEMO_CLIENTS,
  };
}
