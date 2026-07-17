import 'dotenv/config';
import { GesiClient } from '../server/gesi/client.js';

type Row = Record<string, unknown>;

const required = ['GESI_BASE_URL', 'GESI_USERNAME', 'GESI_PASSWORD', 'GESI_EMPRESA_ID', 'GESI_SUCURSAL_ID'] as const;
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Faltan variables GESI: ${missing.join(', ')}`);

const client = new GesiClient({
  baseUrl: process.env.GESI_BASE_URL!,
  username: process.env.GESI_USERNAME!,
  password: process.env.GESI_PASSWORD!,
  empresaId: process.env.GESI_EMPRESA_ID,
  sucursalId: process.env.GESI_SUCURSAL_ID,
});

const today = new Date();
const dateFrom = (days: number) => {
  const value = new Date(today);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString();
};

const keys = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.keys(value as Row).sort()
  : [];

const arrayStats = (rows: Row[], nested: string) => {
  const lengths = rows.map((row) => Array.isArray(row[nested]) ? (row[nested] as unknown[]).length : 0);
  return {
    populated: lengths.filter(Boolean).length,
    maxItems: Math.max(0, ...lengths),
    firstItemKeys: keys(rows.flatMap((row) => Array.isArray(row[nested]) ? row[nested] as Row[] : [])[0]),
  };
};

async function getPage(path: string) {
  return client.request<Row>(path);
}

async function postPage(path: string, body: unknown) {
  return client.request<Row>(path, { method: 'POST', body: JSON.stringify(body) });
}

await client.login();

const [clientsResponse, productsResponse, balancesResponse] = await Promise.all([
  getPage('/api/Maestros/Clientes/GetList?pageNumber=1&pageSize=100&sucursales=S&contactos=N&definicionesSucursal=S'),
  getPage('/api/Maestros/Productos/GetList?pageNumber=1&pageSize=100&precios=S&stock=S&imagenes=N&costos=N&almacenes=2&incluirExistenciasEnCero=S&incluirSucursalesHabilitadas=S'),
  getPage('/api/Maestros/Clientes/GetSaldos?pageNumber=1&pageSize=100&incluirComprobanteMasAntiguo=S'),
]);

const clients = (clientsResponse.clientes ?? []) as Row[];
const products = (productsResponse.productos ?? []) as Row[];
const balances = (balancesResponse.saldos ?? []) as Row[];

const baseBody = {
  datosOperacion: {
    fechaDesde: dateFrom(90),
    fechaHasta: today.toISOString(),
    sucursalID: Number(process.env.GESI_SUCURSAL_ID),
    estadoAnulado: 'N',
  },
  datosCliente: {},
};

const [invoicesBranch, invoicesWarehouse, collections, pending] = await Promise.all([
  postPage('/api/Ventas/Comprobantes/Facturas/GetList?pageNumber=1&pageSize=500', baseBody),
  postPage('/api/Ventas/Comprobantes/Facturas/GetList?pageNumber=1&pageSize=500', {
    ...baseBody,
    datosOperacion: { ...baseBody.datosOperacion, almacenID: 2 },
  }),
  postPage('/api/Ventas/Comprobantes/Cobros/GetList?pageNumber=1&pageSize=1000', {
    datosOperacion: {
      fechaDesde: dateFrom(365),
      fechaHasta: today.toISOString(),
      sucursalID: Number(process.env.GESI_SUCURSAL_ID),
      estadoAnulado: 'N',
    },
    datosCliente: {},
  }),
  getPage(`/api/Ventas/Comprobantes/GetComprobantesPendientes?fechaHasta=${encodeURIComponent(today.toISOString())}&sucursalID=${process.env.GESI_SUCURSAL_ID}&pageNumber=1&pageSize=1000`),
]);

const documentKeys = (response: Row) => ((response.comprobantes ?? []) as Row[]).slice(0, 1000).map((row) => ({
  empresaID: Number(row.empresaID),
  comprobanteID: Number(row.comprobanteID),
  serie: String(row.serie ?? ''),
  puntoDeVentaID: Number(row.puntoDeVentaID),
  numero: Number(row.numero),
}));

const [invoiceDetails, collectionDetails] = await Promise.all([
  postPage('/api/Ventas/Comprobantes/Facturas/GetItem?incluirDetalleDeVenta=S&pageNumber=1&pageSize=1100', documentKeys(invoicesWarehouse)),
  postPage('/api/Ventas/Comprobantes/Cobros/GetItem?incluirDetalleDeAplicacion=S&pageNumber=1&pageSize=1100', documentKeys(collections)),
]);

const summarizeDocuments = (response: Row) => {
  const documents = (response.comprobantes ?? []) as Row[];
  const ids = (field: string) => [...new Set(documents.map((row) => Number(row[field])).filter(Number.isFinite))].sort((a, b) => a - b);
  return {
    pagination: response.paginacion,
    pageRows: documents.length,
    rowKeys: keys(documents[0]),
    sucursalIDs: ids('sucursalID'),
    almacenIDs: ids('almacenID'),
    itemDetail: arrayStats(documents, 'detalleItems'),
    debitApplications: arrayStats(documents, 'aplicacionesADebitos'),
  };
};

const report = {
  context: {
    empresaID: Number(process.env.GESI_EMPRESA_ID),
    sucursalID: Number(process.env.GESI_SUCURSAL_ID),
    almacenID: 2,
    measuredAt: today.toISOString(),
  },
  clients: {
    pagination: clientsResponse.paginacion,
    pageRows: clients.length,
    rowKeys: keys(clients[0]),
    withCoordinates: clients.filter((row) => typeof row.geoCoordenadas === 'string' && row.geoCoordenadas.trim()).length,
    withCurrentAccount: clients.filter((row) => row.habilitadoCuentaCorriente === true).length,
    branches: arrayStats(clients, 'sucursales'),
  },
  products: {
    pagination: productsResponse.paginacion,
    pageRows: products.length,
    rowKeys: keys(products[0]),
    enabledInBranch: products.filter((row) => row.habilitadoEnEstaSucursal === true).length,
    prices: arrayStats(products, 'precios'),
    stocks: arrayStats(products, 'existencias'),
  },
  balances: {
    pagination: balancesResponse.paginacion,
    pageRows: balances.length,
    rowKeys: keys(balances[0]),
  },
  invoices90dBranch: summarizeDocuments(invoicesBranch),
  invoices90dWarehouse: summarizeDocuments(invoicesWarehouse),
  invoiceDetailProbe: summarizeDocuments(invoiceDetails),
  collections365dBranch: summarizeDocuments(collections),
  collectionDetailProbe: summarizeDocuments(collectionDetails),
  pendingBranch: summarizeDocuments(pending),
};

console.log(JSON.stringify(report, null, 2));
