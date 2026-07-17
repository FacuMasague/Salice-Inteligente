import {
  SNAPSHOT_REVISION,
  type Client,
  type DashboardData,
  type Health,
  type Invoice,
  type InvoiceStatus,
  type Product,
  type Purchase,
  type VectorKey,
} from '../../shared/models.js';
import type { GesiRawCapture, GesiRow } from './types.js';

const VECTOR_KEYS: VectorKey[] = [
  'perros', 'gatos', 'otras_especies', 'cachorros', 'adultos', 'senior',
  'premium', 'economico', 'alimento_seco', 'alimento_humedo', 'snacks',
  'farmacia', 'antiparasitario', 'natural', 'funcional', 'higiene',
  'accesorios', 'granel', 'consumo_humano', 'promocional',
];

const number = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value: unknown, fallback = '') => value == null ? fallback : String(value).trim();
const date = (value: unknown) => text(value).slice(0, 10);
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const normalizeText = (value: unknown) => text(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const addDays = (value: string, days: number) => {
  const result = new Date(`${value}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
};

const daysBetween = (from: string, to: string) => Math.round(
  (new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000,
);

const documentIdentity = (row: GesiRow) => [
  number(row.empresaID),
  number(row.comprobanteID),
  text(row.serie),
  number(row.puntoDeVentaID),
  number(row.numero),
].join(':');

const applicationInvoiceIdentity = (row: GesiRow) => [
  number(row.empresaID),
  number(row.vto_ComprobanteID),
  text(row.vto_Serie),
  number(row.vto_PuntoDeVentaID),
  number(row.vto_Numero),
].join(':');

const deduplicateDocuments = (rows: GesiRow[]) => {
  const result = new Map<string, GesiRow>();
  for (const row of rows) {
    const key = documentIdentity(row);
    const current = result.get(key);
    const rowDetail = Array.isArray(row.detalleItems) ? row.detalleItems.length : 0;
    const currentDetail = current && Array.isArray(current.detalleItems) ? current.detalleItems.length : 0;
    if (!current || rowDetail > currentDetail) result.set(key, row);
  }
  return [...result.values()];
};

const parseCoordinates = (value: unknown): [number, number] | null => {
  const matches = text(value).match(/-?\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 2) return null;
  const point: [number, number] = [Number(matches[0]), Number(matches[1])];
  const inArgentina = point[0] >= -55 && point[0] <= -21 && point[1] >= -75 && point[1] <= -53;
  return point.every(Number.isFinite) && inArgentina ? point : null;
};

const emptyVector = (): Record<VectorKey, number> => Object.fromEntries(
  VECTOR_KEYS.map((key) => [key, 0]),
) as Record<VectorKey, number>;

export function inferProductVector(row: GesiRow): Record<VectorKey, number> {
  const source = normalizeText([
    row.descripcion,
    row.descripcionExtendida,
    row.rubro,
    row.subrubro,
    row.embalaje,
  ].filter(Boolean).join(' '));
  const has = (...terms: string[]) => terms.some((term) => source.includes(normalizeText(term)));
  const vector = emptyVector();

  const dry = has('alimentos balanceados', 'large bags', 'small bags', 'balanceado', 'croqueta');
  const wet = has('alimento humedo', 'sobrecito', 'pouch', 'lata');
  const snack = has('snack', 'golosina', 'premio', 'treat');
  const pharmacy = has('farmaco', 'biologico', 'antibiot', 'antiinflam', 'anestes', 'vacuna', 'oftalm', 'otico', 'hormonal', 'quirurg');
  const antiparasitic = has('antiparasitario', 'pulguicida', 'garrapaticida', 'mosquicida', 'pipeta', 'pulga', 'garrapata');
  const hygiene = has('higiene', 'sanitario', 'shampoo', 'enjuague', 'arena', 'piedra', 'locion', 'desinfectante');
  const accessories = has('accesorio', 'instrumental', 'correa', 'collar', 'juguete', 'cama', 'comedero', 'transportadora');
  const human = has('almacen', 'especias', 'condimentos', 'salsas', 'refrigerados', 'congelados', 'infusiones', 'cafe', 'bebidas');
  const promotional = has('pop', 'promocion', 'bonificado', 'merchandising');
  const petRelated = dry || wet || snack || pharmacy || antiparasitic || hygiene || accessories;

  vector.perros = has('perro', 'canino', 'dog', 'puppy') ? 100 : petRelated && !has('gato', 'felino', 'cat') ? 35 : 0;
  vector.gatos = has('gato', 'felino', 'cat', 'kitten') ? 100 : petRelated && !has('perro', 'canino', 'dog') ? 35 : 0;
  vector.otras_especies = has('equino', 'bovino', 'ave', 'roedor', 'conejo', 'pez', 'porcino', 'ovino') ? 100 : 0;
  vector.cachorros = has('cachorro', 'puppy', 'kitten', 'gatito', 'junior', 'baby') ? 100 : 0;
  vector.senior = has('senior', 'geriat', '7+', 'edad avanzada') ? 100 : 0;
  vector.adultos = has('adulto', 'adult') ? 100 : petRelated && !vector.cachorros && !vector.senior ? 45 : 0;
  vector.premium = has('premium', 'super premium', 'select', 'holistic') ? 95 : dry || wet || snack ? 35 : 0;
  vector.economico = has('econom', 'rinde', 'mantenimiento', 'granel') ? 95 : dry ? 30 : 0;
  vector.alimento_seco = dry ? 100 : 0;
  vector.alimento_humedo = wet ? 100 : 0;
  vector.snacks = snack ? 100 : 0;
  vector.farmacia = pharmacy ? 100 : antiparasitic ? 75 : 0;
  vector.antiparasitario = antiparasitic ? 100 : 0;
  vector.natural = has('natural', 'holistic', 'organico', 'sin conservantes') ? 100 : snack ? 35 : 0;
  vector.funcional = has('renal', 'urinario', 'gastro', 'hepato', 'diet', 'control', 'terapeut', 'cardio', 'artrosi') ? 100 : pharmacy ? 70 : 0;
  vector.higiene = hygiene ? 100 : 0;
  vector.accesorios = accessories ? 100 : 0;
  vector.granel = has('granel') ? 100 : has('large bags') ? 35 : 0;
  vector.consumo_humano = human ? 100 : 0;
  vector.promocional = promotional ? 100 : 0;
  return vector;
}

const makeLabelMap = (rows: GesiRow[], idField: string, fields: string[]) => new Map(
  rows.map((row) => [number(row[idField]), fields.map((field) => text(row[field])).find(Boolean) ?? '']),
);

const groupRows = (rows: GesiRow[], field: string) => {
  const result = new Map<string, GesiRow[]>();
  for (const row of rows) {
    const key = text(row[field]);
    if (!key) continue;
    const current = result.get(key) ?? [];
    current.push(row);
    result.set(key, current);
  }
  return result;
};

const median = (values: number[]) => {
  const sorted = values.filter((value) => value > 0 && Number.isFinite(value)).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0;
};

const selectPrice = (rows: GesiRow[]) => {
  const candidates = (channelID?: number) => rows
    .filter((row) => channelID == null || number(row.canalDeVentaID) === channelID)
    .map((row) => number(row.precio))
    .filter((value) => value > 0);
  return roundMoney(median(candidates(3)) || median(candidates(1)) || median(candidates()));
};

const documentNumber = (row: GesiRow) => {
  const labels: Record<string, string> = { F: 'FAC', D: 'NDB', C: 'NCR', R: 'REC' };
  const subtype = text(row.subtipo);
  const label = (labels[subtype] ?? subtype) || 'COMP';
  const series = text(row.serie);
  const point = String(number(row.puntoDeVentaID)).padStart(4, '0');
  const sequence = String(number(row.numero)).padStart(8, '0');
  return `${label}${series ? ` ${series}` : ''} ${point}-${sequence}`;
};

const invoiceStatus = (dueAt: string, snapshotDate: string): InvoiceStatus => (
  dueAt < snapshotDate ? 'overdue' : dueAt <= addDays(snapshotDate, 7) ? 'due_soon' : 'open'
);

const recentMonthKeys = (snapshotDate: string) => {
  const months: string[] = [];
  const cursor = new Date(`${snapshotDate.slice(0, 7)}-01T12:00:00Z`);
  for (let offset = 5; offset >= 0; offset -= 1) {
    const value = new Date(cursor);
    value.setUTCMonth(value.getUTCMonth() - offset);
    months.push(value.toISOString().slice(0, 7));
  }
  return months;
};

export function normalizeCapture(capture: GesiRawCapture): DashboardData {
  const snapshotDate = date(capture.captureMeta.capturedAt);
  const current90From = addDays(snapshotDate, -90);
  const previous90From = addDays(snapshotDate, -180);
  const monthKeys = recentMonthKeys(snapshotDate);

  const invoices = deduplicateDocuments(capture.invoices).filter((row) => row.anulado !== true);
  const collections = deduplicateDocuments(capture.collections).filter((row) => row.anulado !== true);
  const pendingDocuments = deduplicateDocuments(capture.pendingDocuments);
  const current90Invoices = invoices.filter((row) => date(row.fechaDeEmision) >= current90From);
  const previous90Invoices = invoices.filter((row) => date(row.fechaDeEmision) >= previous90From && date(row.fechaDeEmision) < current90From);

  const channelLabels = makeLabelMap(capture.masters.channels, 'canalDeVentaID', ['descripcion']);
  const paymentMethodLabels = makeLabelMap(capture.masters.paymentMethods, 'formaDePagoID', ['descripcion']);
  const sellerLabels = makeLabelMap(capture.masters.sellers, 'vendedorID', ['fantasia', 'razonSocial']);
  const zoneLabels = makeLabelMap(capture.masters.zones, 'zonaID', ['descripcion']);
  const typeLabels = makeLabelMap(capture.masters.clientTypes, 'tipoDeClienteID', ['descripcion']);
  const rubroLabels = makeLabelMap(capture.masters.rubros, 'rubroID', ['descripcion']);
  const subRubroLabels = new Map(capture.masters.subRubros.map((row) => [
    `${number(row.rubroID)}:${number(row.subRubroID)}`,
    text(row.descripcion),
  ]));

  const balances = new Map(capture.balances.map((row) => [number(row.clienteID), number(row.saldoCliente)]));
  const branchDefinitions = new Map<number, GesiRow>();
  for (const clientRow of capture.clients) {
    const definitions = Array.isArray(clientRow.lstDefinicionClienteSucursal)
      ? clientRow.lstDefinicionClienteSucursal as GesiRow[]
      : [];
    const definition = definitions.find((row) => number(row.empresaID) === 3 && number(row.sucursalID) === 3)
      ?? definitions.find((row) => number(row.sucursalID) === 3);
    if (definition) branchDefinitions.set(number(clientRow.clienteID), definition);
  }

  const invoicesByClient = new Map<number, GesiRow[]>();
  for (const invoice of invoices) {
    const id = number(invoice.clienteID);
    const current = invoicesByClient.get(id) ?? [];
    current.push(invoice);
    invoicesByClient.set(id, current);
  }

  const pendingByClient = new Map<number, GesiRow[]>();
  for (const document of pendingDocuments) {
    const id = number(document.clienteID);
    const current = pendingByClient.get(id) ?? [];
    current.push(document);
    pendingByClient.set(id, current);
  }

  const applicationsByInvoice = new Map<string, GesiRow[]>();
  for (const collection of collections) {
    const applications = Array.isArray(collection.aplicacionesADebitos) ? collection.aplicacionesADebitos as GesiRow[] : [];
    for (const application of applications) {
      const key = applicationInvoiceIdentity(application);
      const current = applicationsByInvoice.get(key) ?? [];
      current.push(application);
      applicationsByInvoice.set(key, current);
    }
  }

  const paymentSamplesByClient = new Map<number, { issuedAt: string; dueAt: string; paidAt: string; days: number; delayDays: number; invoice: GesiRow }[]>();
  for (const invoice of invoices) {
    if (Math.abs(number(invoice.saldoPendiente)) > .01) continue;
    const issuedAt = date(invoice.fechaDeEmision);
    const dueAt = date(invoice.fechaDePrimerVencimiento);
    const paidAt = (applicationsByInvoice.get(documentIdentity(invoice)) ?? [])
      .map((row) => date(row.fecha)).filter(Boolean).sort().at(-1);
    if (!issuedAt || !dueAt || !paidAt) continue;
    const days = daysBetween(issuedAt, paidAt);
    const delayDays = daysBetween(dueAt, paidAt);
    if (days < 0 || days > 365 || delayDays < -365 || delayDays > 365) continue;
    const clientID = number(invoice.clienteID);
    const current = paymentSamplesByClient.get(clientID) ?? [];
    current.push({ issuedAt, dueAt, paidAt, days, delayDays, invoice });
    paymentSamplesByClient.set(clientID, current);
  }

  const purchaseGroups = new Map<string, Purchase & { clientID: number }>();
  const productUnits90d = new Map<string, number>();
  for (const invoice of current90Invoices) {
    const items = Array.isArray(invoice.detalleItems) ? invoice.detalleItems as GesiRow[] : [];
    const productItems = items.filter((item) => text(item.tipoDeItem) === 'P' && text(item.codigoDeItem) && number(item.importeTotalNeto) > 0);
    const totalNet = productItems.reduce((sum, item) => sum + number(item.importeTotalNeto), 0);
    if (!productItems.length || totalNet <= 0) continue;
    const invoiceTotal = roundMoney(number(invoice.importeTotal));
    let allocated = 0;
    productItems.forEach((item, index) => {
      const productId = text(item.codigoDeItem);
      const quantity = Math.max(0, number(item.cantidadU1));
      const itemTotal = index === productItems.length - 1
        ? roundMoney(invoiceTotal - allocated)
        : roundMoney(invoiceTotal * number(item.importeTotalNeto) / totalNet);
      allocated = roundMoney(allocated + itemTotal);
      const purchaseDate = date(invoice.fechaDeEmision);
      const clientID = number(invoice.clienteID);
      const key = `${clientID}:${productId}:${purchaseDate}`;
      const current = purchaseGroups.get(key) ?? { clientID, productId, date: purchaseDate, quantity: 0, total: 0 };
      current.quantity += quantity;
      current.total = roundMoney(current.total + itemTotal);
      purchaseGroups.set(key, current);
      productUnits90d.set(productId, (productUnits90d.get(productId) ?? 0) + quantity);
    });
  }

  const purchasesByClient = new Map<number, Purchase[]>();
  for (const { clientID, ...purchase } of purchaseGroups.values()) {
    const current = purchasesByClient.get(clientID) ?? [];
    current.push(purchase);
    purchasesByClient.set(clientID, current);
  }

  const stockByProduct = new Map(capture.stocks.map((row) => [text(row.productoID), row]));
  const pricesByProduct = groupRows(capture.prices, 'productoID');
  const rawProductsByID = new Map(capture.products.map((row) => [text(row.productoID), row]));
  const soldProductIDs = new Set(
    invoices.filter((row) => date(row.fechaDeEmision) >= previous90From)
      .flatMap((row) => Array.isArray(row.detalleItems) ? row.detalleItems as GesiRow[] : [])
      .filter((row) => text(row.tipoDeItem) === 'P')
      .map((row) => text(row.codigoDeItem)).filter(Boolean),
  );
  const catalogProductIDs = [...new Set([...stockByProduct.keys(), ...soldProductIDs])].sort();

  const products: Product[] = catalogProductIDs.map((id) => {
    const row = rawProductsByID.get(id) ?? { productoID: id, descripcion: `Producto ${id} · sin maestro GESI` };
    const stockRow = stockByProduct.get(id);
    const family = text(row.rubro) || rubroLabels.get(number(row.rubroID)) || 'Sin clasificar';
    const subfamily = text(row.subrubro)
      || subRubroLabels.get(`${number(row.rubroID)}:${number(row.subRubroID)}`)
      || 'Sin subrubro';
    return {
      id,
      sku: id,
      name: text(row.descripcion, `Producto ${id} · sin descripción`),
      family,
      brand: subfamily,
      pack: text(row.embalaje) || text(row.unidad1) || 'Unidad',
      price: selectPrice(pricesByProduct.get(id) ?? []),
      stock: Math.max(0, Math.round(number(stockRow?.unidad1Disponible))),
      monthlyUnits: Math.round((productUnits90d.get(id) ?? 0) / 3),
      margin: null,
      vector: inferProductVector({ ...row, rubro: family, subrubro: subfamily }),
    };
  });

  const clients: Client[] = capture.clients
    .map((row) => {
      const id = number(row.clienteID);
      const gesiStateId = number(row.estadoID);
      const clientInvoices = (invoicesByClient.get(id) ?? []).sort((a, b) => date(a.fechaDeEmision).localeCompare(date(b.fechaDeEmision)));
      const currentInvoices = clientInvoices.filter((invoice) => date(invoice.fechaDeEmision) >= current90From);
      const previousInvoices = clientInvoices.filter((invoice) => date(invoice.fechaDeEmision) >= previous90From && date(invoice.fechaDeEmision) < current90From);
      const sales90d = roundMoney(currentInvoices.reduce((sum, invoice) => sum + number(invoice.importeTotal), 0));
      const previousSales90d = roundMoney(previousInvoices.reduce((sum, invoice) => sum + number(invoice.importeTotal), 0));
      const salesDelta = previousSales90d > 0
        ? Math.round(clamp((sales90d - previousSales90d) / previousSales90d * 100, -100, 300))
        : sales90d > 0 ? 100 : 0;
      const purchases = (purchasesByClient.get(id) ?? []).sort((a, b) => b.date.localeCompare(a.date));
      const mappedSales = roundMoney(purchases.reduce((sum, purchase) => sum + purchase.total, 0));
      const paymentSamples = (paymentSamplesByClient.get(id) ?? []).sort((a, b) => a.paidAt.localeCompare(b.paidAt));
      const avgPaymentDays = paymentSamples.length
        ? Math.round(paymentSamples.reduce((sum, sample) => sum + sample.days, 0) / paymentSamples.length)
        : 0;
      const avgPaymentDelayDays = paymentSamples.length
        ? Math.round(paymentSamples.reduce((sum, sample) => sum + sample.delayDays, 0) / paymentSamples.length)
        : 0;
      const onTimePaymentRate = paymentSamples.length
        ? Math.round(paymentSamples.filter((sample) => sample.delayDays <= 0).length / paymentSamples.length * 100)
        : 0;
      const branchDefinition = branchDefinitions.get(id);
      const portfolioStatus = branchDefinition ? 'confirmed' as const : 'review' as const;
      const sellerID = number(branchDefinition?.vendedorID || row.enEstaSucursal_VendedorID || row.vendedorID);
      const paymentMethodID = number(branchDefinition?.formaDePagoID || row.enEstaSucursal_FormaDePagoID || row.formaDePagoID);
      const paymentMethod = paymentMethodLabels.get(paymentMethodID)
        || (paymentMethodID ? `Forma de pago ${paymentMethodID}` : 'Sin condición informada');
      const creditDaysFromMethod = number(paymentMethod.match(/\d+/)?.[0]);
      const creditDays = Math.max(0, Math.round(number(row.limiteDeCredito_Dias) || creditDaysFromMethod));
      const channelID = number(row.canalDeVentaID);
      const zoneID = number(row.zonaID);
      const typeID = number(row.tipoDeClienteID);
      const channel = channelLabels.get(channelID) || (channelID ? `Canal ${channelID}` : 'Sin canal');
      const openInvoices: Invoice[] = (pendingByClient.get(id) ?? [])
        .filter((document) => number(document.saldoPendiente) > .01 && date(document.fechaDePrimerVencimiento))
        .map((document) => {
          const dueAt = date(document.fechaDePrimerVencimiento);
          return {
            id: documentIdentity(document),
            number: documentNumber(document),
            issuedAt: date(document.fechaDeEmision),
            dueAt,
            amount: roundMoney(number(document.importeTotal) || number(document.saldoPendiente)),
            outstanding: roundMoney(number(document.saldoPendiente)),
            status: invoiceStatus(dueAt, snapshotDate),
          };
        });
      const paidInvoices: Invoice[] = paymentSamples.slice(-5).reverse().map((sample) => ({
        id: documentIdentity(sample.invoice),
        number: documentNumber(sample.invoice),
        issuedAt: sample.issuedAt,
        dueAt: sample.dueAt,
        paidAt: sample.paidAt,
        amount: roundMoney(number(sample.invoice.importeTotal)),
        outstanding: 0,
        status: 'paid',
      }));
      const overdue = openInvoices.filter((invoice) => invoice.status === 'overdue');
      const dueSoon = openInvoices.some((invoice) => invoice.status === 'due_soon');
      const rawBalance = roundMoney(balances.get(id) ?? 0);
      const balance = Math.abs(rawBalance) < 1 ? 0 : rawBalance;
      const creditLimit = Math.max(0, roundMoney(number(row.limiteDeCredito)));
      const oldestOverdueDays = overdue.length ? Math.max(...overdue.map((invoice) => daysBetween(invoice.dueAt, snapshotDate))) : 0;
      const overdueOutstanding = roundMoney(overdue.reduce((sum, invoice) => sum + invoice.outstanding, 0));
      const lastPurchaseAt = clientInvoices.map((invoice) => date(invoice.fechaDeEmision)).filter(Boolean).sort().at(-1) ?? '';
      const daysSincePurchase = lastPurchaseAt ? Math.max(0, daysBetween(lastPurchaseAt, snapshotDate)) : 365;
      const overduePressureBase = Math.max(sales90d / 3, 500_000);
      const collectionRisk = gesiStateId === 1 ? Math.round(clamp(
        (overdue.length ? 18 : 0)
        + Math.min(27, oldestOverdueDays / 4)
        + Math.min(20, overdueOutstanding / overduePressureBase * 20)
        + Math.min(15, Math.max(0, avgPaymentDelayDays) / 2)
        + (dueSoon ? 6 : 0)
        + (row.bloqueoVentas === true ? 8 : 0)
        + (row.habilitadoCuentaCorriente === false ? 6 : 0),
      )) : 0;
      const commercialOpportunity = gesiStateId === 1 ? Math.round(clamp(
        10
        + Math.min(30, daysSincePurchase / 6)
        + Math.min(25, Math.max(0, -salesDelta) / 2)
        + (sales90d === 0 ? 20 : 0)
        + (new Set(purchases.map((purchase) => purchase.productId)).size < 3 ? 10 : 0),
      )) : 0;
      const visitPriority = gesiStateId === 1
        ? Math.round(clamp(collectionRisk * .58 + commercialOpportunity * .42))
        : 0;
      const health: Health = collectionRisk >= 55 ? 'critical' : collectionRisk >= 25 ? 'attention' : 'healthy';
      const salesByMonth = new Map(monthKeys.map((key) => [key, 0]));
      clientInvoices.forEach((invoice) => {
        const key = date(invoice.fechaDeEmision).slice(0, 7);
        if (salesByMonth.has(key)) salesByMonth.set(key, (salesByMonth.get(key) ?? 0) + number(invoice.importeTotal));
      });
      return {
        id,
        active: gesiStateId === 1,
        gesiStateId,
        statusUpdatedAt: date(row.ultimaActualizacion),
        portfolioStatus,
        reference: text(row.referencia) || String(id),
        name: text(row.razonSocial, 'Cliente sin razón social'),
        tradeName: text(row.fantasia) || text(row.razonSocial, 'Cliente sin nombre'),
        address: text(row.domicilio, 'Sin domicilio'),
        locality: text(row.localidad, 'Sin localidad'),
        coordinates: parseCoordinates(row.geoCoordenadas),
        zone: zoneLabels.get(zoneID) || (zoneID ? `Zona ${zoneID}` : 'Sin zona'),
        segment: typeLabels.get(typeID) || channel,
        channel,
        seller: sellerLabels.get(sellerID) || (sellerID ? `Vendedor ${sellerID}` : 'Sin vendedor'),
        phone: text(row.telefono),
        email: text(row.email),
        creditLimit,
        balance,
        accountEnabled: row.habilitadoCuentaCorriente === true || text(row.habilitadoCuentaCorriente).toUpperCase() === 'S',
        salesBlocked: row.bloqueoVentas === true,
        deliveryBlocked: row.bloqueoRemitos === true,
        paymentMethod,
        creditDays,
        avgPaymentDays,
        avgPaymentDelayDays,
        onTimePaymentRate,
        paymentSampleSize: paymentSamples.length,
        paymentTrend: paymentSamples.slice(-8).map((sample) => sample.days),
        paymentDelayTrend: paymentSamples.slice(-8).map((sample) => sample.delayDays),
        salesTrend: monthKeys.map((key) => roundMoney(salesByMonth.get(key) ?? 0)),
        lastPurchaseAt,
        nextVisitAt: addDays(snapshotDate, visitPriority >= 80 ? 1 : visitPriority >= 60 ? 3 : 7),
        sales90d,
        unmappedSales90d: roundMoney(sales90d - mappedSales),
        salesDelta,
        collectionRisk,
        commercialOpportunity,
        visitPriority,
        health,
        overdueOutstanding,
        oldestOverdueDays,
        purchases,
        invoices: [...openInvoices.sort((a, b) => a.dueAt.localeCompare(b.dueAt)), ...paidInvoices],
        note: text(row.notas),
      };
    })
    .sort((a, b) => b.visitPriority - a.visitPriority || a.tradeName.localeCompare(b.tradeName));

  const omittedInvoiceDetails = capture.captureMeta.optionalEndpointWarnings
    .map((warning) => warning.match(/Detalle de facturas: GESI rechazó (\d+)/)?.[1])
    .filter(Boolean)
    .reduce((sum, value) => sum + Number(value), 0);
  const paymentSampleCount = [...paymentSamplesByClient.values()].reduce((sum, samples) => sum + samples.length, 0);
  const geocodedClients = clients.filter((client) => client.coordinates).length;
  const activeClients = clients.filter((client) => client.active).length;
  const inactiveClients = clients.length - activeClients;
  const activeGeocodedClients = clients.filter((client) => client.active && client.coordinates).length;
  const inactiveGeocodedClients = geocodedClients - activeGeocodedClients;
  const pricedProducts = products.filter((product) => product.price > 0).length;
  const openDocumentCount = clients.flatMap((client) => client.invoices).filter((invoice) => invoice.outstanding > 0).length;
  const portfolioConfirmedClients = clients.filter((client) => client.portfolioStatus === 'confirmed').length;
  const activePortfolioConfirmedClients = clients.filter((client) => client.active && client.portfolioStatus === 'confirmed').length;
  const activeSalesBlockedClients = clients.filter((client) => client.active && client.salesBlocked).length;

  return {
    meta: {
      version: '0.0.3',
      revision: SNAPSHOT_REVISION,
      generatedAt: capture.captureMeta.capturedAt,
      source: 'gesi',
      sourceLabel: 'GESI · Salice',
      syncStatus: 'connected',
      apiBaseConfigured: true,
      disclaimer: `Foto validada de GESI. La operación usa ${activeClients} clientes activos; ${activePortfolioConfirmedClients} tienen definición explícita para la sucursal Salice y ${activeClients - activePortfolioConfirmedClients} quedan marcados para revisión, sin excluirlos automáticamente. GESI omitió el detalle de ${omittedInvoiceDetails} facturas y el maestro de zonas no está disponible.`,
      coverage: {
        rawClients: capture.clients.length,
        includedClients: clients.length,
        geocodedClients,
        activeClients,
        inactiveClients,
        activeGeocodedClients,
        inactiveGeocodedClients,
        rawProducts: capture.products.length,
        catalogProducts: products.length,
        invoices365d: invoices.length,
        invoices90d: current90Invoices.length,
        collections365d: collections.length,
        openDocuments: openDocumentCount,
        omittedInvoiceDetails,
        pricedProducts,
        paymentSamples: paymentSampleCount,
        zoneLabelsAvailable: capture.masters.zones.length > 0,
        portfolioConfirmedClients,
        portfolioReviewClients: clients.length - portfolioConfirmedClients,
        activePortfolioConfirmedClients,
        activePortfolioReviewClients: activeClients - activePortfolioConfirmedClients,
        activeSalesBlockedClients,
        clientsWithPaymentTerms: clients.filter((client) => client.paymentMethod !== 'Sin condición informada').length,
      },
    },
    products,
    clients,
  };
}

export function validateNormalizedSnapshot(data: DashboardData) {
  const issues: string[] = [];
  const productIDs = new Set(data.products.map((product) => product.id));
  const snapshotDate = date(data.meta.generatedAt);
  const current90From = addDays(snapshotDate, -90);
  const check = (condition: boolean, message: string) => { if (!condition) issues.push(message); };

  check(data.meta.source === 'gesi', 'El snapshot normalizado no está marcado como GESI');
  check(data.meta.revision === SNAPSHOT_REVISION, `Revisión ${data.meta.revision} != ${SNAPSHOT_REVISION}`);
  check(new Set(data.clients.map((client) => client.id)).size === data.clients.length, 'Hay IDs de cliente duplicados');
  check(productIDs.size === data.products.length, 'Hay IDs de producto duplicados');
  check(data.meta.coverage?.includedClients === data.clients.length, 'La cobertura de clientes no coincide con el snapshot');
  check(data.meta.coverage?.activeClients === data.clients.filter((client) => client.active).length, 'La cobertura de clientes activos no coincide');
  check(data.meta.coverage?.inactiveClients === data.clients.filter((client) => !client.active).length, 'La cobertura de clientes inactivos no coincide');
  check(data.meta.coverage?.catalogProducts === data.products.length, 'La cobertura de productos no coincide con el snapshot');
  check(data.meta.coverage?.portfolioConfirmedClients === data.clients.filter((client) => client.portfolioStatus === 'confirmed').length, 'La cobertura de cartera confirmada no coincide');
  check(data.meta.coverage?.activePortfolioReviewClients === data.clients.filter((client) => client.active && client.portfolioStatus === 'review').length, 'La cobertura de cartera activa a revisar no coincide');

  for (const product of data.products) {
    const values = Object.values(product.vector);
    check(values.length === VECTOR_KEYS.length, `${product.id}: vector con ${values.length} dimensiones`);
    check(values.every((value) => Number.isFinite(value) && value >= 0 && value <= 100), `${product.id}: vector fuera de 0–100`);
    check(product.price >= 0 && product.stock >= 0 && product.monthlyUnits >= 0, `${product.id}: precio, stock o rotación inválidos`);
  }

  for (const client of data.clients) {
    const prefix = `Cliente ${client.id}`;
    check(client.active === (client.gesiStateId === 1), `${prefix}: estado activo incoherente con GESI`);
    check(client.gesiStateId > 0, `${prefix}: estado GESI inválido`);
    check(client.portfolioStatus === 'confirmed' || client.portfolioStatus === 'review', `${prefix}: pertenencia a Salice inválida`);
    check([client.collectionRisk, client.commercialOpportunity, client.visitPriority, client.onTimePaymentRate].every((value) => Number.isFinite(value) && value >= 0 && value <= 100), `${prefix}: puntaje fuera de 0–100`);
    check(client.active || (client.collectionRisk === 0 && client.commercialOpportunity === 0 && client.visitPriority === 0), `${prefix}: cliente inactivo con puntajes operativos`);
    const purchaseTotal = roundMoney(client.purchases.reduce((sum, purchase) => sum + purchase.total, 0));
    check(client.purchases.every((purchase) => productIDs.has(purchase.productId)), `${prefix}: compra con producto inexistente`);
    check(client.purchases.every((purchase) => purchase.date >= current90From && purchase.date <= snapshotDate), `${prefix}: compra fuera de 90 días`);
    check(Math.abs(roundMoney(purchaseTotal + client.unmappedSales90d - client.sales90d)) <= .02, `${prefix}: ventas no reconciliadas`);
    check(client.paymentSampleSize >= client.paymentTrend.length, `${prefix}: muestra de pagos menor que la tendencia`);
    check(client.paymentSampleSize >= client.paymentDelayTrend.length, `${prefix}: muestra de pagos menor que la tendencia contra vencimiento`);
    check(client.paymentSampleSize > 0 || client.avgPaymentDays === 0, `${prefix}: promedio de pago sin muestra`);
    check(client.nextVisitAt >= snapshotDate, `${prefix}: próxima visita anterior al snapshot`);
    check(client.salesTrend.length === 6 && client.salesTrend.every((value) => value >= 0), `${prefix}: tendencia de ventas inválida`);
    if (client.coordinates) {
      check(client.coordinates[0] >= -55 && client.coordinates[0] <= -21 && client.coordinates[1] >= -75 && client.coordinates[1] <= -53, `${prefix}: coordenadas fuera de Argentina`);
    }
    for (const invoice of client.invoices) {
      if (invoice.status === 'paid') check(Boolean(invoice.paidAt) && invoice.outstanding === 0, `${prefix}/${invoice.id}: pagada incoherente`);
      if (invoice.status === 'overdue') check(invoice.dueAt < snapshotDate && invoice.outstanding > 0, `${prefix}/${invoice.id}: vencida incoherente`);
      if (invoice.status === 'due_soon') check(invoice.dueAt >= snapshotDate && invoice.dueAt <= addDays(snapshotDate, 7) && invoice.outstanding > 0, `${prefix}/${invoice.id}: próximo vencimiento incoherente`);
      if (invoice.status === 'open') check(invoice.dueAt > addDays(snapshotDate, 7) && invoice.outstanding > 0, `${prefix}/${invoice.id}: comprobante abierto incoherente`);
    }
  }
  return issues;
}
