import { APP_VERSION, SNAPSHOT_REVISION, type Client, type DashboardData, type Invoice, type Product, type VectorKey } from '../../shared/models.js';

const v = (values: Partial<Record<VectorKey, number>>): Record<VectorKey, number> => ({
  perros: 0, gatos: 0, otras_especies: 0, cachorros: 0, adultos: 0, senior: 0,
  premium: 0, economico: 0, alimento_seco: 0, alimento_humedo: 0, snacks: 0,
  farmacia: 0, antiparasitario: 0, natural: 0, funcional: 0, higiene: 0,
  accesorios: 0, granel: 0, consumo_humano: 0, promocional: 0,
  ...values,
});

const products: Product[] = [
  { id: 'P001', sku: 'ALI-PER-ADU-15', name: 'Nutrición Perro Adulto 15 kg', family: 'Alimento seco', brand: 'Línea Equilibrio', pack: 'Bolsa 15 kg', price: 48900, stock: 84, monthlyUnits: 142, margin: 24, vector: v({ perros: 100, adultos: 100, economico: 62, granel: 28 }) },
  { id: 'P002', sku: 'ALI-PER-PRE-15', name: 'Perro Adulto Premium 15 kg', family: 'Alimento seco', brand: 'Línea Selecta', pack: 'Bolsa 15 kg', price: 68700, stock: 61, monthlyUnits: 96, margin: 29, vector: v({ perros: 100, adultos: 100, premium: 96, natural: 48 }) },
  { id: 'P003', sku: 'ALI-PER-CAC-12', name: 'Cachorro Crecimiento 12 kg', family: 'Alimento seco', brand: 'Línea Equilibrio', pack: 'Bolsa 12 kg', price: 57200, stock: 42, monthlyUnits: 74, margin: 27, vector: v({ perros: 100, cachorros: 100, premium: 58, funcional: 35 }) },
  { id: 'P004', sku: 'ALI-PER-SEN-12', name: 'Perro Senior Cuidado 12 kg', family: 'Alimento funcional', brand: 'Línea Vital', pack: 'Bolsa 12 kg', price: 64600, stock: 27, monthlyUnits: 39, margin: 31, vector: v({ perros: 100, senior: 100, premium: 72, funcional: 88, natural: 42 }) },
  { id: 'P005', sku: 'ALI-GAT-ADU-10', name: 'Nutrición Gato Adulto 10 kg', family: 'Alimento seco', brand: 'Línea Equilibrio', pack: 'Bolsa 10 kg', price: 53400, stock: 73, monthlyUnits: 118, margin: 25, vector: v({ gatos: 100, adultos: 100, economico: 58, granel: 22 }) },
  { id: 'P006', sku: 'ALI-GAT-PRE-75', name: 'Gato Adulto Premium 7,5 kg', family: 'Alimento seco', brand: 'Línea Selecta', pack: 'Bolsa 7,5 kg', price: 61900, stock: 34, monthlyUnits: 82, margin: 32, vector: v({ gatos: 100, adultos: 100, premium: 98, natural: 55 }) },
  { id: 'P007', sku: 'ALI-GAT-KIT-75', name: 'Gatito Primer Año 7,5 kg', family: 'Alimento seco', brand: 'Línea Selecta', pack: 'Bolsa 7,5 kg', price: 65200, stock: 29, monthlyUnits: 46, margin: 30, vector: v({ gatos: 100, cachorros: 100, premium: 78, funcional: 42 }) },
  { id: 'P008', sku: 'ALI-GAT-URI-75', name: 'Gato Control Urinario 7,5 kg', family: 'Alimento funcional', brand: 'Línea Vital', pack: 'Bolsa 7,5 kg', price: 71400, stock: 21, monthlyUnits: 57, margin: 34, vector: v({ gatos: 100, adultos: 78, senior: 36, premium: 86, funcional: 100 }) },
  { id: 'P009', sku: 'HIG-ARE-20', name: 'Piedras Sanitarias Compact 20 kg', family: 'Higiene', brand: 'Casa Limpia', pack: 'Bolsa 20 kg', price: 21800, stock: 96, monthlyUnits: 164, margin: 36, vector: v({ gatos: 75, higiene: 100, economico: 72, granel: 20 }) },
  { id: 'P010', sku: 'HIG-ARE-PRE-8', name: 'Arena Aglomerante Premium 8 kg', family: 'Higiene', brand: 'Casa Limpia', pack: 'Bolsa 8 kg', price: 26400, stock: 48, monthlyUnits: 71, margin: 39, vector: v({ gatos: 72, premium: 88, natural: 35, higiene: 100 }) },
  { id: 'P011', sku: 'SNK-DOG-NAT-1', name: 'Snack Natural Perros 1 kg', family: 'Snacks', brand: 'Bocado Natural', pack: 'Bolsa 1 kg', price: 12900, stock: 123, monthlyUnits: 137, margin: 42, vector: v({ perros: 100, adultos: 55, cachorros: 40, premium: 66, natural: 100 }) },
  { id: 'P012', sku: 'SNK-CAT-500', name: 'Snack Cremoso Gatos x 20', family: 'Snacks', brand: 'Bocado Natural', pack: 'Caja x 20', price: 18600, stock: 67, monthlyUnits: 91, margin: 44, vector: v({ gatos: 100, adultos: 60, cachorros: 45, premium: 82, natural: 54 }) },
  { id: 'P013', sku: 'ACC-COR-STD', name: 'Correa Reforzada Regulable', family: 'Accesorios', brand: 'Paseo', pack: 'Unidad', price: 14800, stock: 52, monthlyUnits: 43, margin: 47, vector: v({ perros: 88, accesorios: 100, premium: 36 }) },
  { id: 'P014', sku: 'ACC-CAT-PLAY', name: 'Kit Juego Interactivo Gatos', family: 'Accesorios', brand: 'Paseo', pack: 'Kit', price: 17300, stock: 39, monthlyUnits: 36, margin: 49, vector: v({ gatos: 100, cachorros: 35, accesorios: 100, premium: 44 }) },
  { id: 'P015', sku: 'ALI-GRA-PER-25', name: 'Balanceado Perro Económico 25 kg', family: 'Alimento seco', brand: 'Línea Rinde', pack: 'Bolsa 25 kg', price: 42100, stock: 112, monthlyUnits: 188, margin: 19, vector: v({ perros: 100, adultos: 90, economico: 100, granel: 86 }) },
  { id: 'P016', sku: 'ALI-GRA-GAT-15', name: 'Balanceado Gato Económico 15 kg', family: 'Alimento seco', brand: 'Línea Rinde', pack: 'Bolsa 15 kg', price: 44800, stock: 75, monthlyUnits: 133, margin: 21, vector: v({ gatos: 100, adultos: 88, economico: 100, granel: 82 }) },
];

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
  sales: number;
  delta: number;
}

const seeds: ClientSeed[] = [
  { name: 'Huella Norte', locality: 'Mar del Plata', coordinates: [-37.958, -57.568], zone: 'Mar del Plata Norte', segment: 'Pet shop', seller: 'Lucía R.', address: 'Av. Constitución 5120', productIds: ['P001', 'P005', 'P009', 'P011', 'P013'], balance: 284000, credit: 900000, payDays: 25, priority: 82, sales: 1380000, delta: 12 },
  { name: 'Mundo Animal Centro', locality: 'Mar del Plata', coordinates: [-38.003, -57.552], zone: 'Mar del Plata Centro', segment: 'Pet shop', seller: 'Martín A.', address: 'Catamarca 1840', productIds: ['P002', 'P005', 'P006', 'P009', 'P011', 'P012'], balance: 0, credit: 1300000, payDays: 18, priority: 54, sales: 1910000, delta: 7 },
  { name: 'Forrajería El Ombú', locality: 'Mar del Plata', coordinates: [-38.041, -57.586], zone: 'Mar del Plata Oeste', segment: 'Forrajería', seller: 'Lucía R.', address: 'Av. Polonia 1925', productIds: ['P001', 'P005', 'P015', 'P016'], balance: 860000, credit: 950000, payDays: 46, priority: 96, sales: 1720000, delta: -9 },
  { name: 'Mascotas del Puerto', locality: 'Mar del Plata', coordinates: [-38.047, -57.542], zone: 'Mar del Plata Sur', segment: 'Pet shop', seller: 'Martín A.', address: '12 de Octubre 3180', productIds: ['P002', 'P006', 'P008', 'P010', 'P012', 'P014'], balance: 145000, credit: 1100000, payDays: 21, priority: 67, sales: 1540000, delta: 19 },
  { name: 'La Posta Balanceados', locality: 'Batán', coordinates: [-38.009, -57.708], zone: 'Batán - Chapadmalal', segment: 'Forrajería', seller: 'Sofía G.', address: 'Colectora 295 km 12', productIds: ['P001', 'P003', 'P005', 'P015', 'P016'], balance: 0, credit: 820000, payDays: 14, priority: 48, sales: 1210000, delta: 4 },
  { name: 'Punto Mascota', locality: 'Miramar', coordinates: [-38.271, -57.84], zone: 'Miramar', segment: 'Pet shop', seller: 'Sofía G.', address: 'Calle 21 1432', productIds: ['P001', 'P002', 'P005', 'P009', 'P011'], balance: 510000, credit: 700000, payDays: 39, priority: 91, sales: 1080000, delta: -14 },
  { name: 'Agro Sierra', locality: 'Balcarce', coordinates: [-37.848, -58.255], zone: 'Balcarce', segment: 'Agroveterinaria', seller: 'Diego M.', address: 'Av. Kelly 742', productIds: ['P001', 'P003', 'P004', 'P015', 'P016'], balance: 72000, credit: 1500000, payDays: 27, priority: 63, sales: 2080000, delta: 16 },
  { name: 'Costa Pet', locality: 'Santa Clara del Mar', coordinates: [-37.833, -57.508], zone: 'Costa Norte', segment: 'Pet shop', seller: 'Lucía R.', address: 'Acapulco 865', productIds: ['P002', 'P005', 'P006', 'P009', 'P012', 'P014'], balance: 340000, credit: 780000, payDays: 32, priority: 78, sales: 1260000, delta: 9 },
  { name: 'El Molino Rural', locality: 'Coronel Vidal', coordinates: [-37.451, -57.729], zone: 'Mar Chiquita', segment: 'Forrajería', seller: 'Diego M.', address: 'Belgrano 380', productIds: ['P001', 'P005', 'P015', 'P016'], balance: 0, credit: 940000, payDays: 17, priority: 41, sales: 1330000, delta: 2 },
  { name: 'Animalia Güemes', locality: 'Mar del Plata', coordinates: [-38.017, -57.54], zone: 'Mar del Plata Centro', segment: 'Pet shop', seller: 'Martín A.', address: 'Olavarría 2810', productIds: ['P002', 'P004', 'P006', 'P008', 'P010', 'P011', 'P012', 'P014'], balance: 1180000, credit: 1200000, payDays: 52, priority: 99, sales: 2340000, delta: -18 },
  { name: 'Veterinaria del Bosque', locality: 'Mar del Plata', coordinates: [-38.086, -57.557], zone: 'Mar del Plata Sur', segment: 'Veterinaria', seller: 'Sofía G.', address: 'Av. Mario Bravo 1550', productIds: ['P002', 'P003', 'P004', 'P006', 'P007', 'P008'], balance: 96000, credit: 1750000, payDays: 23, priority: 58, sales: 1890000, delta: 11 },
  { name: 'Pet Market Constitución', locality: 'Mar del Plata', coordinates: [-37.97, -57.563], zone: 'Mar del Plata Norte', segment: 'Pet shop', seller: 'Lucía R.', address: 'Av. Tejedor 1180', productIds: ['P001', 'P002', 'P005', 'P009', 'P010', 'P011', 'P013'], balance: 0, credit: 1050000, payDays: 16, priority: 45, sales: 1650000, delta: 14 },
  { name: 'Campo & Compañía', locality: 'Sierra de los Padres', coordinates: [-37.942, -57.774], zone: 'Sierra de los Padres', segment: 'Agroveterinaria', seller: 'Diego M.', address: 'Av. Argentina 410', productIds: ['P001', 'P003', 'P004', 'P015', 'P016'], balance: 265000, credit: 1400000, payDays: 30, priority: 69, sales: 1760000, delta: 5 },
  { name: 'Colitas Chapadmalal', locality: 'Chapadmalal', coordinates: [-38.176, -57.65], zone: 'Batán - Chapadmalal', segment: 'Pet shop', seller: 'Sofía G.', address: 'Ruta 11 km 548', productIds: ['P001', 'P005', 'P009', 'P011', 'P012'], balance: 430000, credit: 620000, payDays: 41, priority: 88, sales: 930000, delta: -6 },
  { name: 'Las Gaviotas Pet', locality: 'Villa Gesell', coordinates: [-37.263, -56.974], zone: 'Costa Norte', segment: 'Pet shop', seller: 'Lucía R.', address: 'Av. 3 1280', productIds: ['P002', 'P005', 'P006', 'P009', 'P010', 'P012'], balance: 0, credit: 880000, payDays: 20, priority: 51, sales: 1470000, delta: 22 },
  { name: 'NutriCampo', locality: 'Otamendi', coordinates: [-38.113, -57.844], zone: 'Miramar', segment: 'Forrajería', seller: 'Sofía G.', address: 'San Martín 640', productIds: ['P001', 'P003', 'P005', 'P015', 'P016'], balance: 180000, credit: 760000, payDays: 29, priority: 72, sales: 1120000, delta: 8 },
];

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function latestPurchaseDate(index: number) {
  return ['2026-07-08', '2026-07-04', '2026-06-28', '2026-07-11'][index % 4];
}

function createPurchases(seed: ClientSeed, index: number) {
  const latest = latestPurchaseDate(index);
  const dates = [latest, addDays(latest, -28), addDays(latest, -56)];
  return seed.productIds.flatMap((productId, productIndex) => {
    const product = products.find((item) => item.id === productId)!;
    return dates.map((date, dateIndex) => {
      const quantity = 2 + ((index + productIndex * 2 + dateIndex) % 7);
      return { productId, date, quantity, total: Math.round(product.price * quantity * (0.96 + (index % 3) * 0.01)) };
    });
  });
}

function createInvoices(seed: ClientSeed, index: number): Invoice[] {
  const firstIssuedAt = '2026-04-03';
  const secondIssuedAt = '2026-05-05';
  const invoices: Invoice[] = [
    { id: `INV-${index + 1}-01`, number: `FAC B-${String(61320 + index).padStart(8, '0')}`, issuedAt: firstIssuedAt, dueAt: '2026-04-24', paidAt: addDays(firstIssuedAt, seed.payDays - 2), amount: 246000 + index * 17300, outstanding: 0, status: 'paid' },
    { id: `INV-${index + 1}-02`, number: `FAC B-${String(61880 + index).padStart(8, '0')}`, issuedAt: secondIssuedAt, dueAt: '2026-05-26', paidAt: addDays(secondIssuedAt, seed.payDays + 2), amount: 198000 + index * 12100, outstanding: 0, status: 'paid' },
  ];
  if (seed.balance > 0) {
    const critical = seed.balance / seed.credit > 0.78 || seed.payDays > 44;
    const status: Invoice['status'] = critical ? 'overdue' : index % 3 === 0 ? 'due_soon' : index % 3 === 1 ? 'open' : 'overdue';
    invoices.unshift({
      id: `INV-${index + 1}-03`,
      number: `FAC B-${String(62410 + index).padStart(8, '0')}`,
      issuedAt: '2026-06-24',
      dueAt: status === 'overdue' ? '2026-07-07' : status === 'due_soon' ? '2026-07-18' : '2026-08-02',
      amount: seed.balance,
      outstanding: seed.balance,
      status,
    });
  }
  return invoices;
}

const clients: Client[] = seeds.map((seed, index) => {
  const invoices = createInvoices(seed, index);
  const purchases = createPurchases(seed, index);
  const sales90d = purchases.reduce((sum, purchase) => sum + purchase.total, 0);
  const overdue = invoices.some((invoice) => invoice.status === 'overdue');
  const utilization = seed.balance / seed.credit;
  const health = overdue && (utilization > 0.6 || seed.payDays > 40) ? 'critical' : overdue || utilization > 0.55 ? 'attention' : 'healthy';
  const baseTrend = Math.round(sales90d / 3 / 1000);
  return {
    id: 4100 + index,
    active: true,
    gesiStateId: 1,
    statusUpdatedAt: '2026-07-15',
    portfolioStatus: 'confirmed',
    reference: `CLI-${String(4100 + index)}`,
    name: `${seed.name} S.R.L.`,
    tradeName: seed.name,
    address: seed.address,
    locality: seed.locality,
    coordinates: seed.coordinates,
    zone: seed.zone,
    segment: seed.segment,
    channel: seed.segment === 'Pet shop' ? 'Minorista especializado' : seed.segment,
    seller: seed.seller,
    phone: `223 5${String(301000 + index * 137).slice(-6)}`,
    email: `compras${index + 1}@cliente-demo.local`,
    creditLimit: seed.credit,
    balance: seed.balance,
    accountEnabled: true,
    salesBlocked: false,
    deliveryBlocked: false,
    paymentMethod: seed.payDays > 30 ? 'CTA CTE 45 DÍAS' : 'CTA CTE 30 DÍAS',
    creditDays: seed.payDays > 30 ? 45 : 30,
    avgPaymentDays: seed.payDays,
    avgPaymentDelayDays: seed.payDays - (seed.payDays > 30 ? 45 : 30),
    onTimePaymentRate: seed.payDays <= (seed.payDays > 30 ? 45 : 30) ? 80 : 40,
    paymentSampleSize: 5,
    paymentTrend: [seed.payDays - 5, seed.payDays + 2, seed.payDays - 1, seed.payDays + 4, seed.payDays],
    paymentDelayTrend: [-4, 1, -2, 2, seed.payDays - (seed.payDays > 30 ? 45 : 30)],
    salesTrend: [Math.round(baseTrend * .84), Math.round(baseTrend * .88), Math.round(baseTrend * .96), Math.round(baseTrend * 1.02), baseTrend, Math.round(baseTrend * (1 + seed.delta / 100))],
    lastPurchaseAt: latestPurchaseDate(index),
    nextVisitAt: index % 3 === 0 ? '2026-07-16' : index % 3 === 1 ? '2026-07-17' : '2026-07-18',
    sales90d,
    unmappedSales90d: 0,
    salesDelta: seed.delta,
    collectionRisk: health === 'critical' ? 72 : health === 'attention' ? 38 : 12,
    commercialOpportunity: Math.max(15, Math.min(90, 42 - seed.delta)),
    visitPriority: seed.priority,
    health,
    overdueOutstanding: invoices.filter((invoice) => invoice.status === 'overdue').reduce((sum, invoice) => sum + invoice.outstanding, 0),
    oldestOverdueDays: invoices.some((invoice) => invoice.status === 'overdue') ? 9 : 0,
    purchases,
    invoices,
    note: index % 3 === 0 ? 'Revisar faltantes y ofrecer novedades de alta rotación.' : index % 3 === 1 ? 'Prefiere contacto por WhatsApp antes de la visita.' : 'Validar stock disponible antes de tomar el pedido.',
  };
});

export function createDemoSnapshot(): DashboardData {
  return {
    meta: {
      version: APP_VERSION,
      revision: SNAPSHOT_REVISION,
      generatedAt: '2026-07-15T11:30:00-03:00',
      source: 'demo',
      sourceLabel: 'Datos demostrativos',
      syncStatus: 'demo',
      apiBaseConfigured: false,
      disclaimer: 'Los nombres, importes y movimientos son sintéticos. Falta configurar la URL del servidor GESI de Salice.',
    },
    products,
    clients,
  };
}
