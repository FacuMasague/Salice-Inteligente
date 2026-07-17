import 'dotenv/config';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GesiClient } from '../server/gesi/client.js';
import type { GesiRawCapture, GesiRow } from '../server/gesi/types.js';

const required = ['GESI_BASE_URL', 'GESI_USERNAME', 'GESI_PASSWORD', 'GESI_EMPRESA_ID', 'GESI_SUCURSAL_ID'] as const;
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Faltan variables GESI: ${missing.join(', ')}`);

const rawDirectory = resolve(process.cwd(), 'data/raw');
const target = resolve(rawDirectory, 'gesi-salice-latest.json');
const reuseCatalog = process.argv.includes('--reuse-catalog');
const previousCapture = reuseCatalog
  ? JSON.parse(await readFile(target, 'utf8')) as GesiRawCapture
  : null;

const empresaID = Number(process.env.GESI_EMPRESA_ID);
const sucursalID = Number(process.env.GESI_SUCURSAL_ID);
const almacenPrincipalID = 2;
if (empresaID !== 3 || sucursalID !== 3) {
  throw new Error('Esta v0.0.3 es exclusiva de Salice: requiere empresaID=3 y sucursalID=3.');
}

const client = new GesiClient({
  baseUrl: process.env.GESI_BASE_URL!,
  username: process.env.GESI_USERNAME!,
  password: process.env.GESI_PASSWORD!,
  empresaId: String(empresaID),
  sucursalId: String(sucursalID),
});

const capturedAt = new Date();
const isoDaysAgo = (days: number) => {
  const value = new Date(capturedAt);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString();
};
const historyFrom = isoDaysAgo(365);
const salesDetailFrom = isoDaysAgo(180);
const historyUntil = capturedAt.toISOString();

const listBody = (from: string) => ({
  datosOperacion: {
    fechaDesde: from,
    fechaHasta: historyUntil,
    sucursalID,
    estadoAnulado: 'N',
  },
  datosCliente: {},
});

const documentKey = (row: GesiRow) => ({
  empresaID: Number(row.empresaID),
  comprobanteID: Number(row.comprobanteID),
  serie: String(row.serie ?? ''),
  puntoDeVentaID: Number(row.puntoDeVentaID),
  numero: Number(row.numero),
});
const documentIdentity = (row: GesiRow) => [
  Number(row.empresaID),
  Number(row.comprobanteID),
  String(row.serie ?? ''),
  Number(row.puntoDeVentaID),
  Number(row.numero),
].join(':');
const optionalEndpointWarnings: string[] = [];

const chunks = <T>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};

async function fetchDocumentDetails(
  label: string,
  path: string,
  rows: GesiRow[],
  shouldInclude: (row: GesiRow) => boolean,
) {
  const selected = rows.filter(shouldInclude);
  const batches = chunks(selected, 500);
  const detailed: GesiRow[] = [];
  let skipped = 0;

  const fetchBatch = async (batch: GesiRow[]): Promise<GesiRow[]> => {
    try {
      const payload = await client.request<GesiRow>(`${path}&pageNumber=1&pageSize=${batch.length}`, {
        method: 'POST',
        body: JSON.stringify(batch.map(documentKey)),
      });
      return Array.isArray(payload.comprobantes) ? payload.comprobantes as GesiRow[] : [];
    } catch (error) {
      if (batch.length === 1) {
        skipped += 1;
        return [];
      }
      const middle = Math.ceil(batch.length / 2);
      const left = await fetchBatch(batch.slice(0, middle));
      const right = await fetchBatch(batch.slice(middle));
      return [...left, ...right];
    }
  };

  for (let index = 0; index < batches.length; index += 1) {
    const items = await fetchBatch(batches[index]);
    detailed.push(...items);
    console.log(`${label}: lote ${index + 1}/${batches.length} (${detailed.length}/${selected.length})`);
  }
  if (skipped) optionalEndpointWarnings.push(`${label}: GESI rechazó ${skipped} comprobante(s) individual(es).`);
  return detailed;
}

async function fetchPrices(productIDs: string[]) {
  const batches = chunks(productIDs, 100);
  const prices: GesiRow[] = [];
  for (let index = 0; index < batches.length; index += 1) {
    const codes = encodeURIComponent(batches[index].join(','));
    const rows = await client.getAll<GesiRow>(`/api/Maestros/Productos/GetPrecios?codigos=${codes}`, 'precios', 1000);
    prices.push(...rows);
    console.log(`Precios: lote ${index + 1}/${batches.length} (${prices.length} definiciones)`);
  }
  return prices;
}

console.log('GESI Salice: autenticando…');
await client.login();

console.log('GESI Salice: descargando maestros y movimientos…');
const safeMaster = async (path: string, key: string, warning: string) => {
  try {
    return await client.getAll<GesiRow>(path, key);
  } catch (error) {
    optionalEndpointWarnings.push(`${warning}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
};
const tracked = async (label: string, promise: Promise<GesiRow[]>) => {
  const rows = await promise;
  console.log(`${label}: ${rows.length}`);
  return rows;
};

const [
  clients,
  products,
  stocks,
  balances,
  invoiceHeaders,
  collectionHeaders,
  pendingDocuments,
  channels,
  paymentMethods,
  sellers,
  rubros,
  subRubros,
  clientTypes,
  zones,
] = await Promise.all([
  tracked('Clientes', client.getAll<GesiRow>('/api/Maestros/Clientes/GetList?sucursales=S&contactos=N&definicionesSucursal=S', 'clientes')),
  tracked('Productos', previousCapture ? Promise.resolve(previousCapture.products) : client.getAll<GesiRow>('/api/Maestros/Productos/GetList?precios=N&stock=N&imagenes=N&costos=N&incluirSucursalesHabilitadas=S', 'productos')),
  tracked('Existencias positivas', previousCapture ? Promise.resolve(previousCapture.stocks) : client.getAll<GesiRow>(`/api/Maestros/Productos/GetExistencias?sucursales=${sucursalID}&almacenes=${almacenPrincipalID}&incluirProductosSinExistencias=N`, 'existencias', 1000)),
  tracked('Saldos', client.getAll<GesiRow>('/api/Maestros/Clientes/GetSaldos?incluirComprobanteMasAntiguo=S', 'saldos')),
  tracked('Facturas 365d', client.postAll<GesiRow>('/api/Ventas/Comprobantes/Facturas/GetList', 'comprobantes', listBody(historyFrom), 500)),
  tracked('Cobros 365d', client.postAll<GesiRow>('/api/Ventas/Comprobantes/Cobros/GetList', 'comprobantes', listBody(historyFrom), 500)),
  tracked('Comprobantes pendientes', client.getAll<GesiRow>(`/api/Ventas/Comprobantes/GetComprobantesPendientes?fechaHasta=${encodeURIComponent(historyUntil)}&sucursalID=${sucursalID}`, 'comprobantes', 1000)),
  tracked('Canales', client.getAll<GesiRow>('/api/Maestros/CanalesDeVenta/GetList', 'canalesDeVenta')),
  tracked('Formas de pago', client.getAll<GesiRow>('/api/Maestros/FormasDePago/GetList', 'formasDePago')),
  tracked('Vendedores', client.getAll<GesiRow>('/api/Maestros/Vendedores/GetList', 'vendedores')),
  tracked('Rubros', client.getAll<GesiRow>('/api/Maestros/Rubros/GetList', 'rubros')),
  tracked('Subrubros', client.getAll<GesiRow>('/api/Maestros/SubRubros/GetList', 'subRubros')),
  tracked('Tipos de cliente', safeMaster('/api/Maestros/TiposDeCliente/GetList', 'tiposDeCliente', 'Tipos de cliente no disponibles')),
  tracked('Zonas', safeMaster('/api/Maestros/Zonas/GetList', 'zonas', 'Zonas no disponibles')),
]);

const [invoiceDetails, collectionDetails] = await Promise.all([
  fetchDocumentDetails(
    'Detalle de facturas',
    '/api/Ventas/Comprobantes/Facturas/GetItem?incluirDetalleDeVenta=S',
    invoiceHeaders,
    (row) => String(row.fechaDeEmision ?? '') >= salesDetailFrom,
  ),
  fetchDocumentDetails(
    'Aplicaciones de cobros',
    '/api/Ventas/Comprobantes/Cobros/GetItem?incluirDetalleDeAplicacion=S',
    collectionHeaders,
    () => true,
  ),
]);

const catalogProductIDs = [...new Set([
  ...stocks.map((row) => String(row.productoID ?? '')).filter(Boolean),
  ...invoiceDetails.flatMap((invoice) => Array.isArray(invoice.detalleItems) ? invoice.detalleItems as GesiRow[] : [])
    .map((item) => String(item.codigoDeItem ?? '')).filter(Boolean),
])].sort();
const prices = previousCapture?.prices ?? await fetchPrices(catalogProductIDs);

const invoiceDetailByKey = new Map(invoiceDetails.map((row) => [documentIdentity(row), row]));
const invoices = invoiceHeaders.map((row) => invoiceDetailByKey.get(documentIdentity(row)) ?? row);
const collectionDetailByKey = new Map(collectionDetails.map((row) => [documentIdentity(row), row]));
const collections = collectionHeaders.map((row) => collectionDetailByKey.get(documentIdentity(row)) ?? row);

const capture: GesiRawCapture = {
  captureMeta: {
    capturedAt: historyUntil,
    empresaID,
    sucursalID,
    almacenPrincipalID,
    historyFrom,
    salesDetailFrom,
    historyUntil,
    optionalEndpointWarnings,
  },
  clients,
  products,
  prices,
  stocks,
  balances,
  invoices,
  collections,
  pendingDocuments,
  masters: { channels, paymentMethods, sellers, rubros, subRubros, clientTypes, zones },
};

await mkdir(rawDirectory, { recursive: true });
const temporary = `${target}.tmp`;
await writeFile(temporary, `${JSON.stringify(capture)}\n`, 'utf8');
await rename(temporary, target);

console.log('Captura GESI Salice completada.');
console.log(JSON.stringify({
  clients: clients.length,
  products: products.length,
  catalogProductsWithStockOrSales: catalogProductIDs.length,
  priceDefinitions: prices.length,
  positiveStocks: stocks.length,
  balances: balances.length,
  invoices365d: invoices.length,
  invoicesWithDetail180d: invoiceDetails.length,
  collections365d: collections.length,
  pendingDocuments: pendingDocuments.length,
  warnings: optionalEndpointWarnings,
}, null, 2));
