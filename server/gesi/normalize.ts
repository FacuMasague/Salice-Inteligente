import {
  APP_VERSION,
  SNAPSHOT_REVISION,
  type Client,
  type DashboardData,
  type DeliveryInvoice,
  type DeliverySheet,
  type DeliverySheetReference,
  type Health,
  type Invoice,
  type InvoiceStatus,
  type Product,
  type Purchase,
} from '../../shared/models.js';
import { invoiceCreditTermDays, summarizeCreditTerms } from '../../shared/credit-terms.js';
import { applyClientLocationQuality } from '../../shared/client-location.js';
import { calculateInventoryMetrics, catalogParticipationReasons } from '../../shared/inventory-metrics.js';
import { applyCatalogPricePositioning, inferProductVectorV2, resolveProductContentKg, VECTOR_KEYS } from '../../shared/product-vectors.js';
import {
  isActionableReceivableAmount,
  isExcludedReceivableClient,
  isReceivableSeller,
} from '../../shared/receivables-policy.js';
import type { GesiRawCapture, GesiRow } from './types.js';

const number = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value: unknown, fallback = '') => value == null ? fallback : String(value).trim();
const date = (value: unknown) => text(value).slice(0, 10);
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

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

export const suggestedDeliveryDate = (issuedAt: string) => {
  if (!issuedAt) return '';
  const value = new Date(`${issuedAt}T12:00:00Z`);
  const day = value.getUTCDay();
  return addDays(issuedAt, day === 5 ? 3 : day === 6 ? 2 : 1);
};

const deliverySheetStatus = (row: GesiRow): DeliverySheetReference['status'] => {
  const state = text(row.estado).toUpperCase();
  return state === '2' || state === 'C' || Boolean(date(row.fechaCerrada)) ? 'closed' : 'open';
};

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
  const productBrandLabels = makeLabelMap(capture.masters.productBrands, 'filtroArticulos1ID', ['descripcion']);
  const productLineLabels = makeLabelMap(capture.masters.productLines, 'filtroArticulos2ID', ['descripcion']);
  const productFamilyLabels = makeLabelMap(capture.masters.productFamilies, 'filtroArticulos3ID', ['descripcion']);
  const productGroupLabels = makeLabelMap(capture.masters.productGroups, 'grupoArtID', ['descripcion']);

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
  const productSales90d = new Map<string, number>();
  const productClients90d = new Map<string, Set<number>>();
  const productLastSaleAt = new Map<string, string>();
  for (const invoice of invoices) {
    const purchaseDate = date(invoice.fechaDeEmision);
    const items = Array.isArray(invoice.detalleItems) ? invoice.detalleItems as GesiRow[] : [];
    for (const item of items) {
      if (text(item.tipoDeItem) !== 'P' || !text(item.codigoDeItem) || number(item.importeTotalNeto) <= 0) continue;
      const productId = text(item.codigoDeItem);
      if (purchaseDate > (productLastSaleAt.get(productId) ?? '')) productLastSaleAt.set(productId, purchaseDate);
    }
  }
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
      productSales90d.set(productId, roundMoney((productSales90d.get(productId) ?? 0) + itemTotal));
      const purchasingClients = productClients90d.get(productId) ?? new Set<number>();
      purchasingClients.add(clientID);
      productClients90d.set(productId, purchasingClients);
    });
  }

  const purchasesByClient = new Map<number, Purchase[]>();
  for (const { clientID, ...purchase } of purchaseGroups.values()) {
    const current = purchasesByClient.get(clientID) ?? [];
    current.push(purchase);
    purchasesByClient.set(clientID, current);
  }

  const stockRowsByProduct = groupRows(capture.stocks, 'productoID');
  const stockByProduct = new Map([...stockRowsByProduct].map(([id, rows]) => [id, rows[0]]));
  const pricesByProduct = groupRows(capture.prices, 'productoID');
  const rawProductsByID = new Map(capture.products.map((row) => [text(row.productoID), row]));
  const soldProductIDs = new Set(
    invoices.filter((row) => date(row.fechaDeEmision) >= previous90From)
      .flatMap((row) => Array.isArray(row.detalleItems) ? row.detalleItems as GesiRow[] : [])
      .filter((row) => text(row.tipoDeItem) === 'P')
      .map((row) => text(row.codigoDeItem)).filter(Boolean),
  );
  const catalogProductIDs = [...new Set([
    ...capture.products.filter((row) => text(row.estado) === 'A').map((row) => text(row.productoID)).filter(Boolean),
    ...capture.stocks.filter((row) => number(row.unidad1Disponible) !== 0 || number(row.unidad2Disponible) !== 0).map((row) => text(row.productoID)).filter(Boolean),
    ...soldProductIDs,
  ])].sort();

  const baseProducts: Product[] = catalogProductIDs.map((id) => {
    const row = rawProductsByID.get(id) ?? { productoID: id, descripcion: `Producto ${id} · sin maestro GESI` };
    const stockRow = stockByProduct.get(id);
    const family = text(row.rubro) || rubroLabels.get(number(row.rubroID)) || 'Sin clasificar';
    const subfamily = text(row.subrubro)
      || subRubroLabels.get(`${number(row.rubroID)}:${number(row.subRubroID)}`)
      || 'Sin subrubro informado';
    const brand = productBrandLabels.get(number(row.filtroArticulos1ID)) || 'Sin marca informada';
    const line = productLineLabels.get(number(row.filtroArticulos2ID)) || 'Sin línea informada';
    const commercialFamily = productFamilyLabels.get(number(row.filtroArticulos3ID)) || 'Sin familia comercial informada';
    const group = productGroupLabels.get(number(row.grupoArtID)) || 'Sin grupo informado';
    const rawPack = text(row.embalaje);
    const unit = text(row.unidad1) || 'Unidad';
    const pack = rawPack && rawPack !== '1000' && rawPack !== '1' ? rawPack : unit;
    const units90d = Math.max(0, productUnits90d.get(id) ?? 0);
    const monthlyUnitsExact = units90d / 3;
    const productName = text(row.descripcion, `Producto ${id} · sin descripción`);
    const productDescription = text(row.descripcionExtendida);
    const price = selectPrice(pricesByProduct.get(id) ?? []);
    const masterStatus = text(row.estado) === 'A' ? 'active' : text(row.estado) === 'I' ? 'inactive' : 'unknown';
    const inventory = calculateInventoryMetrics({
      availableUnit1: stockRow ? number(stockRow.unidad1Disponible) : null,
      availableUnit2: stockRow ? number(stockRow.unidad2Disponible) : null,
      units90d,
      masterStatus,
      price,
      unit1: text(row.unidad1),
      unit2: text(row.unidad2),
      capturedAllProducts: capture.captureMeta.inventoryIncludesZeroStock === true,
      duplicateRows: Math.max(0, (stockRowsByProduct.get(id)?.length ?? 0) - 1),
    });
    const catalogParticipation = catalogParticipationReasons({
      masterStatus,
      soldRecently: soldProductIDs.has(id),
      availableUnit1: inventory.rawAvailableUnit1,
      availableUnit2: inventory.rawAvailableUnit2,
    });
    const vectorProfile = inferProductVectorV2({
      name: productName,
      description: productDescription,
      category: family,
      subcategory: subfamily,
      brand,
      line,
      commercialFamily,
      group,
      pack,
    });
    return {
      id,
      sku: id,
      name: productName,
      description: productDescription,
      family,
      subcategory: subfamily,
      brand,
      line,
      commercialFamily,
      group,
      pack,
      unit,
      unitsPerCase: number(row.unidadesPorCaja) > 0 ? number(row.unidadesPorCaja) : null,
      masterStatus,
      commercialStatus: inventory.commercialStatus,
      discontinuationStatus: 'not_reported',
      catalogParticipation,
      price,
      contentKg: vectorProfile.vector.alimento_seco >= 75 ? resolveProductContentKg({
        unit1: unit,
        unit2: text(row.unidad2),
        unit2PerUnit1: number(row.unidad2XUnidad1) > 0 ? number(row.unidad2XUnidad1) : null,
        descriptions: [productName, productDescription, pack],
      }) : null,
      referencePricePerKg: null,
      pricePosition: 'unknown',
      stock: Math.round(inventory.operationalStock * 100) / 100,
      units90d: Math.round(units90d * 100) / 100,
      monthlyUnits: Math.round(inventory.monthlyRotation * 100) / 100,
      sales90d: productSales90d.get(id) ?? 0,
      clients90d: productClients90d.get(id)?.size ?? 0,
      lastSaleAt: productLastSaleAt.get(id) ?? '',
      stockCoverageMonths: inventory.coverageMonths == null ? null : Math.round(inventory.coverageMonths * 10) / 10,
      inventory: {
        capturedAt: capture.captureMeta.capturedAt,
        companyId: capture.captureMeta.empresaID,
        branchId: capture.captureMeta.sucursalID,
        warehouseId: capture.captureMeta.almacenPrincipalID,
        warehouseLabel: capture.captureMeta.almacenPrincipal ?? text(stockRow?.almacen, `Depósito ${capture.captureMeta.almacenPrincipalID}`),
        completeZeroStockUniverse: capture.captureMeta.inventoryIncludesZeroStock === true,
        rawAvailableUnit1: inventory.rawAvailableUnit1,
        rawAvailableUnit2: inventory.rawAvailableUnit2,
        unit2: text(row.unidad2),
        unit2PerUnit1: number(row.unidad2XUnidad1) > 0 ? number(row.unidad2XUnidad1) : null,
        status: inventory.stockStatus,
        quality: inventory.quality,
        qualityReasons: inventory.qualityReasons,
      },
      margin: null,
      vector: vectorProfile.vector,
      vectorMeta: vectorProfile.meta,
    };
  });
  const products = applyCatalogPricePositioning(baseProducts.map((product) => ({
    ...product,
    referencePricePerKg: product.price > 0 && product.contentKg
      ? Math.round(product.price / product.contentKg * 100) / 100
      : null,
  })));

  const rawClients: Client[] = capture.clients
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
      const creditTerm = summarizeCreditTerms(clientInvoices.map((invoice) => ({
        issuedAt: date(invoice.fechaDeEmision),
        dueAt: date(invoice.fechaDePrimerVencimiento),
      })));
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
      const documentPaymentMethod = (document: GesiRow) => {
        const documentPaymentID = number(document.formaDePagoID);
        return paymentMethodLabels.get(documentPaymentID)
          || (documentPaymentID ? `Forma de pago ${documentPaymentID}` : paymentMethod);
      };
      const documentSeller = (document: GesiRow) => sellerLabels.get(number(document.vendedorID)) || '';
      const channelID = number(row.canalDeVentaID);
      const zoneID = number(row.zonaID);
      const typeID = number(row.tipoDeClienteID);
      const channel = channelLabels.get(channelID) || (channelID ? `Canal ${channelID}` : 'Sin canal');
      const openInvoices: Invoice[] = (pendingByClient.get(id) ?? [])
        .filter((document) => (
          isActionableReceivableAmount(document.saldoPendiente)
          && isReceivableSeller(documentSeller(document))
          && date(document.fechaDePrimerVencimiento)
        ))
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
            creditTermDays: invoiceCreditTermDays(date(document.fechaDeEmision), dueAt),
            paymentMethod: documentPaymentMethod(document),
            seller: documentSeller(document),
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
        creditTermDays: invoiceCreditTermDays(sample.issuedAt, sample.dueAt),
        paymentMethod: documentPaymentMethod(sample.invoice),
        seller: documentSeller(sample.invoice) || undefined,
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
        locality: text(row.localidad) || 'Sin localidad',
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
        creditDays: creditTerm.creditDays,
        creditTermStatus: creditTerm.status,
        creditTermSampleSize: creditTerm.sampleSize,
        creditTermDominantShare: creditTerm.dominantShare,
        creditTermMinDays: creditTerm.minDays,
        creditTermMaxDays: creditTerm.maxDays,
        creditTermOptions: creditTerm.options,
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
    }).filter((client) => !isExcludedReceivableClient(client.name, client.tradeName));
  const locationQuality = applyClientLocationQuality(rawClients);
  const clients = locationQuality.clients
    .sort((a, b) => b.visitPriority - a.visitPriority || a.tradeName.localeCompare(b.tradeName));

  const invoiceIDs = new Set(invoices.map(documentIdentity));
  const assignmentByInvoice = new Map<string, DeliverySheetReference>();
  const logisticsSheets: DeliverySheet[] = (capture.deliverySheets ?? []).map((row) => {
    const status = deliverySheetStatus(row);
    const reference: DeliverySheetReference = {
      id: number(row.fojaID),
      status,
      driver: text(row.descripcionRepartidor) || (number(row.repartidorID) ? `Repartidor ${number(row.repartidorID)}` : 'Sin repartidor informado'),
      startsAt: date(row.desde),
      endsAt: date(row.hasta),
      closedAt: text(row.fechaCerrada) || null,
    };
    const assigned = Array.isArray(row.listaDeComprobantesAsignados)
      ? row.listaDeComprobantesAsignados as GesiRow[]
      : [];
    const assignedInvoiceIDs = [...new Set(assigned.map(documentIdentity).filter((id) => invoiceIDs.has(id)))];
    for (const id of assignedInvoiceIDs) {
      const current = assignmentByInvoice.get(id);
      if (!current || (current.status === 'open' && reference.status === 'closed') || reference.id > current.id) {
        assignmentByInvoice.set(id, reference);
      }
    }
    return {
      ...reference,
      zone: text(row.descripcionZona),
      subzone: text(row.descripcionSubZona),
      comment: text(row.comentario),
      dispatchComment: text(row.comentarioExpedicion),
      dispatchedAt: text(row.fechaExpedido) || null,
      invoiceIds: assignedInvoiceIDs,
    };
  }).filter((sheet) => sheet.id > 0);
  const explicitlyUnassigned = new Set((capture.unassignedDeliveryDocuments ?? []).map(documentIdentity));
  const logisticsFrom = capture.captureMeta.logisticsFrom || addDays(snapshotDate, -45);
  const logisticsCoverageFrom = date(logisticsFrom);
  const logisticsInvoices: DeliveryInvoice[] = invoices
    .filter((row) => date(row.fechaDeEmision) >= logisticsCoverageFrom)
    .map((row) => {
      const id = documentIdentity(row);
      const sheet = assignmentByInvoice.get(id) ?? null;
      const assignmentStatus: DeliveryInvoice['assignmentStatus'] = sheet
        ? sheet.status === 'closed' ? 'closed_sheet' : 'open_sheet'
        : explicitlyUnassigned.has(id) ? 'unassigned' : 'unknown';
      return {
        id,
        clientId: number(row.clienteID),
        number: documentNumber(row),
        issuedAt: date(row.fechaDeEmision),
        suggestedDeliveryAt: suggestedDeliveryDate(date(row.fechaDeEmision)),
        amount: roundMoney(number(row.importeTotal)),
        deliveryAddress: text(row.domicilioEntrega) || text(row.domicilio),
        locality: text(row.localidad) || 'Sin localidad',
        assignmentStatus,
        sheet,
      };
    })
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || a.number.localeCompare(b.number));
  const logisticsCoverage = {
    coverageFrom: logisticsCoverageFrom,
    coverageThrough: snapshotDate,
    invoices: logisticsInvoices.length,
    unassignedInvoices: logisticsInvoices.filter((invoice) => invoice.assignmentStatus === 'unassigned').length,
    openSheetInvoices: logisticsInvoices.filter((invoice) => invoice.assignmentStatus === 'open_sheet').length,
    closedSheetInvoices: logisticsInvoices.filter((invoice) => invoice.assignmentStatus === 'closed_sheet').length,
    unknownInvoices: logisticsInvoices.filter((invoice) => invoice.assignmentStatus === 'unknown').length,
    sheets: logisticsSheets.length,
    openSheets: logisticsSheets.filter((sheet) => sheet.status === 'open').length,
    closedSheets: logisticsSheets.filter((sheet) => sheet.status === 'closed').length,
    sheetsWithDriver: logisticsSheets.filter((sheet) => !sheet.driver.startsWith('Sin ')).length,
  };

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
  const creditTermInvoices = clients.reduce((sum, client) => sum + client.creditTermSampleSize, 0);
  const invalidCreditTermInvoices = invoices.length - creditTermInvoices;
  const masterProductIDs = new Set(capture.products.map((row) => text(row.productoID)).filter(Boolean));
  const uniqueStockProductIDs = new Set(capture.stocks.map((row) => text(row.productoID)).filter(Boolean));
  const stockForMaster = capture.stocks.filter((row) => masterProductIDs.has(text(row.productoID)));
  const inventoryCoverage = {
    companyId: capture.captureMeta.empresaID,
    branchId: capture.captureMeta.sucursalID,
    warehouseId: capture.captureMeta.almacenPrincipalID,
    warehouseLabel: capture.captureMeta.almacenPrincipal ?? text(capture.stocks.find((row) => row.almacen)?.almacen, `Depósito ${capture.captureMeta.almacenPrincipalID}`),
    capturedAt: capture.captureMeta.capturedAt,
    completeZeroStockUniverse: capture.captureMeta.inventoryIncludesZeroStock === true,
    masterRows: capture.products.length,
    uniqueMasterProducts: masterProductIDs.size,
    duplicateMasterRows: capture.products.length - masterProductIDs.size,
    activeMasterProducts: capture.products.filter((row) => text(row.estado) === 'A').length,
    inactiveMasterProducts: capture.products.filter((row) => text(row.estado) === 'I').length,
    unknownMasterProducts: capture.products.filter((row) => !['A', 'I'].includes(text(row.estado))).length,
    stockRows: capture.stocks.length,
    uniqueStockProducts: uniqueStockProductIDs.size,
    duplicateStockRows: capture.captureMeta.inventoryDuplicateRows ?? capture.stocks.length - uniqueStockProductIDs.size,
    invalidStockRows: capture.captureMeta.inventoryInvalidRows ?? capture.stocks.filter((row) => !text(row.productoID)).length,
    positiveStockProducts: stockForMaster.filter((row) => number(row.unidad1Disponible) > 0).length,
    zeroStockProducts: stockForMaster.filter((row) => number(row.unidad1Disponible) === 0).length,
    negativeStockProducts: stockForMaster.filter((row) => number(row.unidad1Disponible) < 0).length,
    missingStockProducts: [...masterProductIDs].filter((id) => !uniqueStockProductIDs.has(id)).length,
    catalogProducts: products.length,
    commercializableProducts: products.filter((product) => product.commercialStatus === 'commercializable').length,
    insufficientProducts: products.filter((product) => product.commercialStatus === 'insufficient' || product.inventory.quality === 'insufficient').length,
    explicitDiscontinuedProducts: 0,
    productsWithMissingPrimaryUnit: capture.products.filter((row) => !text(row.unidad1)).length,
    productsWithSecondaryUnit: capture.products.filter((row) => Boolean(text(row.unidad2))).length,
  };
  const unavailableMasters = [
    capture.masters.zones.length ? '' : 'zonas',
    capture.masters.clientTypes.length ? '' : 'tipos de cliente',
  ].filter(Boolean);
  const omittedDetailsWarning = omittedInvoiceDetails
    ? ` GESI omitió el detalle de ${omittedInvoiceDetails} ${omittedInvoiceDetails === 1 ? 'factura' : 'facturas'}.`
    : '';
  const unavailableMastersWarning = unavailableMasters.length
    ? ` Los maestros de ${unavailableMasters.join(' y ')} no están disponibles.`
    : '';

  return {
    meta: {
      version: APP_VERSION,
      revision: SNAPSHOT_REVISION,
      generatedAt: capture.captureMeta.capturedAt,
      source: 'gesi',
      sourceLabel: 'GESI · Salice',
      syncStatus: 'connected',
      apiBaseConfigured: true,
      productVectorVersion: '2.2',
      disclaimer: `Foto validada de GESI. La operación usa ${activeClients} clientes activos; ${activePortfolioConfirmedClients} tienen definición explícita para la sucursal Salice y ${activeClients - activePortfolioConfirmedClients} quedan marcados para revisión, sin excluirlos automáticamente.${omittedDetailsWarning}${unavailableMastersWarning}`,
      coverage: {
        rawClients: capture.clients.length,
        includedClients: clients.length,
        geocodedClients,
        activeClients,
        inactiveClients,
      activeGeocodedClients,
      inactiveGeocodedClients,
      correctedLocationClients: clients.filter((client) => client.active && client.locationStatus === 'corrected').length,
      locationReviewClients: clients.filter((client) => client.active && client.locationStatus === 'review').length,
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
        creditTermInvoices,
        invalidCreditTermInvoices,
        clientsWithObservedCreditTerms: clients.filter((client) => client.creditTermSampleSize > 0).length,
        clientsWithMixedCreditTerms: clients.filter((client) => client.creditTermStatus === 'mixed').length,
        logistics: logisticsCoverage,
        inventory: inventoryCoverage,
      },
    },
    products,
    clients,
    logistics: {
      coverageFrom: logisticsCoverageFrom,
      coverageThrough: snapshotDate,
      invoices: logisticsInvoices,
      sheets: logisticsSheets,
    },
  };
}

export function validateNormalizedSnapshot(data: DashboardData) {
  const issues: string[] = [];
  const productIDs = new Set(data.products.map((product) => product.id));
  const snapshotDate = date(data.meta.generatedAt);
  const current90From = addDays(snapshotDate, -90);
  const check = (condition: boolean, message: string) => { if (!condition) issues.push(message); };

  check(data.meta.source === 'gesi', 'El snapshot normalizado no está marcado como GESI');
  check(data.meta.productVectorVersion === '2.2', 'El snapshot no declara vectorización de producto v2.2');
  check(data.meta.revision === SNAPSHOT_REVISION, `Revisión ${data.meta.revision} != ${SNAPSHOT_REVISION}`);
  check(new Set(data.clients.map((client) => client.id)).size === data.clients.length, 'Hay IDs de cliente duplicados');
  check(productIDs.size === data.products.length, 'Hay IDs de producto duplicados');
  check(data.meta.coverage?.includedClients === data.clients.length, 'La cobertura de clientes no coincide con el snapshot');
  check(data.meta.coverage?.activeClients === data.clients.filter((client) => client.active).length, 'La cobertura de clientes activos no coincide');
  check(data.meta.coverage?.inactiveClients === data.clients.filter((client) => !client.active).length, 'La cobertura de clientes inactivos no coincide');
  check(data.meta.coverage?.catalogProducts === data.products.length, 'La cobertura de productos no coincide con el snapshot');
  check(data.meta.coverage?.inventory?.completeZeroStockUniverse === true, 'El snapshot no certifica la captura de existencias cero');
  check(data.meta.coverage?.inventory?.companyId === 3 && data.meta.coverage.inventory.branchId === 3 && data.meta.coverage.inventory.warehouseId === 2, 'El contexto de inventario no corresponde a empresa 3 / sucursal 3 / depósito 2');
  check(data.meta.coverage?.inventory?.missingStockProducts === 0, 'Hay maestros sin fila de existencias en el universo completo');
  check(data.meta.coverage?.portfolioConfirmedClients === data.clients.filter((client) => client.portfolioStatus === 'confirmed').length, 'La cobertura de cartera confirmada no coincide');
  check(data.meta.coverage?.activePortfolioReviewClients === data.clients.filter((client) => client.active && client.portfolioStatus === 'review').length, 'La cobertura de cartera activa a revisar no coincide');
  check(data.meta.coverage?.creditTermInvoices === data.clients.reduce((sum, client) => sum + client.creditTermSampleSize, 0), 'La cobertura de facturas con plazo observado no coincide');
  check(data.meta.coverage?.clientsWithObservedCreditTerms === data.clients.filter((client) => client.creditTermSampleSize > 0).length, 'La cobertura de clientes con plazo observado no coincide');
  check(data.meta.coverage?.clientsWithMixedCreditTerms === data.clients.filter((client) => client.creditTermStatus === 'mixed').length, 'La cobertura de clientes con plazo mixto no coincide');
  check(Boolean(data.logistics), 'El snapshot no contiene la capa logística');
  if (data.logistics) {
    check(data.meta.coverage?.logistics?.invoices === data.logistics.invoices.length, 'La cobertura de facturas logísticas no coincide');
    check(data.meta.coverage?.logistics?.sheets === data.logistics.sheets.length, 'La cobertura de fojas no coincide');
    const sheetIDs = new Set(data.logistics.sheets.map((sheet) => sheet.id));
    check(sheetIDs.size === data.logistics.sheets.length, 'Hay fojas de reparto duplicadas');
    check(new Set(data.logistics.invoices.map((invoice) => invoice.id)).size === data.logistics.invoices.length, 'Hay facturas logísticas duplicadas');
    for (const invoice of data.logistics.invoices) {
      check(invoice.issuedAt >= data.logistics.coverageFrom && invoice.issuedAt <= data.logistics.coverageThrough, `${invoice.id}: factura logística fuera de cobertura`);
      check(invoice.suggestedDeliveryAt > invoice.issuedAt, `${invoice.id}: fecha sugerida de reparto inválida`);
      check(invoice.sheet == null === ['unassigned', 'unknown'].includes(invoice.assignmentStatus), `${invoice.id}: asignación a foja incoherente`);
      if (invoice.sheet) {
        check(sheetIDs.has(invoice.sheet.id), `${invoice.id}: foja inexistente`);
        check(invoice.assignmentStatus === (invoice.sheet.status === 'closed' ? 'closed_sheet' : 'open_sheet'), `${invoice.id}: estado de foja incoherente`);
      }
    }
  }

  for (const product of data.products) {
    const values = Object.values(product.vector);
    check(values.length === VECTOR_KEYS.length, `${product.id}: vector con ${values.length} dimensiones`);
    check(product.vectorMeta.version === '2.2', `${product.id}: metadata vectorial distinta de v2.2`);
    check(product.contentKg == null || product.contentKg > 0, `${product.id}: contenido neto inválido`);
    check(product.referencePricePerKg == null || product.referencePricePerKg > 0, `${product.id}: precio por kilo inválido`);
    check(values.every((value) => Number.isFinite(value) && value >= 0 && value <= 100), `${product.id}: vector fuera de 0–100`);
    check(product.vectorMeta.version === '2.2' && product.vectorMeta.confidence >= 0 && product.vectorMeta.confidence <= 100, `${product.id}: metadatos vectoriales inválidos`);
    check(product.price >= 0 && product.stock >= 0 && product.monthlyUnits >= 0 && product.sales90d >= 0 && product.clients90d >= 0, `${product.id}: precio, stock o rotación inválidos`);
    check(product.catalogParticipation.length > 0, `${product.id}: producto sin motivo de participación en catálogo`);
    check(product.discontinuationStatus === 'not_reported', `${product.id}: discontinuación inventada fuera de GESI`);
    check(product.inventory.companyId === 3 && product.inventory.branchId === 3 && product.inventory.warehouseId === 2, `${product.id}: contexto de existencias distinto de empresa 3 / sucursal 3 / depósito 2`);
    check(product.inventory.status !== 'negative' || product.stock === 0, `${product.id}: disponibilidad negativa usada como stock operativo`);
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
    check(client.creditTermSampleSize >= 0 && client.creditTermOptions.reduce((sum, option) => sum + option.invoiceCount, 0) === client.creditTermSampleSize, `${prefix}: resumen de plazos no reconcilia`);
    check(client.creditTermStatus !== 'unavailable' || (client.creditDays == null && client.creditTermSampleSize === 0), `${prefix}: plazo no disponible incoherente`);
    check(client.creditTermStatus === 'unavailable' || (client.creditDays != null && client.creditTermSampleSize > 0), `${prefix}: plazo observado incoherente`);
    check(client.creditTermOptions.every((option) => option.days >= 0 && option.minDays <= option.days && option.days <= option.maxDays && option.invoiceCount > 0 && option.share > 0 && option.share <= 100), `${prefix}: opción de plazo inválida`);
    check(client.nextVisitAt >= snapshotDate, `${prefix}: próxima visita anterior al snapshot`);
    check(client.salesTrend.length === 6 && client.salesTrend.every((value) => value >= 0), `${prefix}: tendencia de ventas inválida`);
    if (client.coordinates) {
      check(client.coordinates[0] >= -55 && client.coordinates[0] <= -21 && client.coordinates[1] >= -75 && client.coordinates[1] <= -53, `${prefix}: coordenadas fuera de Argentina`);
    }
    for (const invoice of client.invoices) {
      check(invoice.creditTermDays == null || invoice.creditTermDays === daysBetween(invoice.issuedAt, invoice.dueAt), `${prefix}/${invoice.id}: plazo observado incoherente`);
      if (invoice.status === 'paid') check(Boolean(invoice.paidAt) && invoice.outstanding === 0, `${prefix}/${invoice.id}: pagada incoherente`);
      if (invoice.status === 'overdue') check(invoice.dueAt < snapshotDate && invoice.outstanding > 0, `${prefix}/${invoice.id}: vencida incoherente`);
      if (invoice.status === 'due_soon') check(invoice.dueAt >= snapshotDate && invoice.dueAt <= addDays(snapshotDate, 7) && invoice.outstanding > 0, `${prefix}/${invoice.id}: próximo vencimiento incoherente`);
      if (invoice.status === 'open') check(invoice.dueAt > addDays(snapshotDate, 7) && invoice.outstanding > 0, `${prefix}/${invoice.id}: comprobante abierto incoherente`);
    }
  }
  return issues;
}
