import { readFile, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { GesiRawCapture, GesiRow } from '../server/gesi/types.js';

const capturePath = resolve(process.cwd(), 'data/raw/gesi-salice-latest.json');
const targetPath = resolve(process.cwd(), 'data/spt-gesi.sqlite');
const temporaryPath = `${targetPath}.tmp`;

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = (value: unknown) => value == null ? '' : String(value).trim();
const date = (value: unknown) => text(value).slice(0, 10);
const labelMap = (rows: GesiRow[] | undefined, idField: string) => new Map(
  (rows ?? []).map((row) => [number(row[idField]), text(row.descripcion) || text(row.fantasia) || text(row.razonSocial)]),
);
const documentKey = (row: GesiRow) => [
  number(row.empresaID), number(row.comprobanteID), text(row.serie),
  number(row.puntoDeVentaID), number(row.numero),
].join(':');
const deduplicateDocuments = (documents: GesiRow[]) => {
  const unique = new Map<string, GesiRow>();
  for (const document of documents) {
    const key = documentKey(document);
    const current = unique.get(key);
    const currentItems = current && Array.isArray(current.detalleItems) ? current.detalleItems.length : 0;
    const nextItems = Array.isArray(document.detalleItems) ? document.detalleItems.length : 0;
    if (!current || nextItems > currentItems) unique.set(key, document);
  }
  return [...unique.values()];
};

const raw = JSON.parse(await readFile(capturePath, 'utf8')) as GesiRawCapture;
if (raw.captureMeta.empresaID !== 3 || raw.captureMeta.sucursalID !== 3) {
  throw new Error('El modelo SPT sólo admite la captura Salice empresa 3 / sucursal 3.');
}

const products = new Map(raw.products.map((row) => [text(row.productoID), row]));
const clients = new Map(raw.clients.map((row) => [number(row.clienteID), row]));
const channels = labelMap(raw.masters.channels, 'canalDeVentaID');
const sellers = new Map((raw.masters.sellers ?? []).map((row) => [
  number(row.vendedorID), text(row.fantasia) || text(row.razonSocial),
]));
const rubros = labelMap(raw.masters.rubros, 'rubroID');
const subRubros = new Map((raw.masters.subRubros ?? []).map((row) => [
  `${number(row.rubroID)}:${number(row.subRubroID)}`, text(row.descripcion),
]));
const brands = labelMap(raw.masters.productBrands, 'filtroArticulos1ID');
const lines = labelMap(raw.masters.productLines, 'filtroArticulos2ID');
const families = labelMap(raw.masters.productFamilies, 'filtroArticulos3ID');
const productGroups = labelMap(raw.masters.productGroups, 'grupoArtID');
const clientTypes = labelMap(raw.masters.clientTypes, 'tipoDeClienteID');
const fallbackClientTypes = new Map<number, string>([
  [2, 'Pet Shop'], [4, 'Breeder'], [5, 'Veterinaria'], [6, 'Autoservicio (Self Service)'],
  [12, 'AgroVet'], [15, 'Forrajeria'], [17, 'Agrostore'], [18, 'Vet Shop'],
  [19, 'Clinic'], [20, 'Agro Pet'], [21, 'Dieteticas'], [22, 'Granjas y Carnicerias'],
  [23, 'Almacenes'], [24, 'Gastronómicos'], [25, 'Refugios'], [26, 'Dieteticas'],
  [27, 'Empleados'], [28, 'Mayorista'], [29, 'Tradicionales (Despensas)'],
  [30, 'Cadenas/Mayoristas Regionales'], [31, 'Kioscos'],
]);
for (const [id, label] of fallbackClientTypes) if (!clientTypes.has(id)) clientTypes.set(id, label);
const zones = labelMap(raw.masters.zones, 'zonaID');

const branchSeller = (client: GesiRow | undefined) => {
  if (!client) return '';
  const definitions = Array.isArray(client.lstDefinicionClienteSucursal)
    ? client.lstDefinicionClienteSucursal as GesiRow[]
    : [];
  const definition = definitions.find((row) => number(row.empresaID) === 3 && number(row.sucursalID) === 3);
  const sellerID = number(definition?.vendedorID) || number(client.enEstaSucursal_VendedorID) || number(client.vendedorID);
  return sellers.get(sellerID) ?? '';
};

await rm(temporaryPath, { force: true });
const database = new DatabaseSync(temporaryPath);
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE movements (
    sale_date TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_id INTEGER NOT NULL,
    client_branch_id INTEGER NOT NULL,
    brand TEXT NOT NULL,
    line TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT NOT NULL,
    family TEXT NOT NULL,
    units REAL NOT NULL,
    kilos REAL NOT NULL,
    net_amount REAL NOT NULL,
    zone TEXT NOT NULL,
    grouping_name TEXT NOT NULL,
    client_type TEXT NOT NULL,
    product_group TEXT NOT NULL,
    channel TEXT NOT NULL,
    address TEXT NOT NULL,
    company_id INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    issuer_name TEXT NOT NULL,
    client_status TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    locality TEXT NOT NULL,
    series TEXT NOT NULL,
    point_of_sale_id INTEGER NOT NULL,
    invoice_number INTEGER NOT NULL,
    branch_seller TEXT NOT NULL,
    seller TEXT NOT NULL,
    source_document_key TEXT NOT NULL,
    source_item_id INTEGER NOT NULL,
    source_kind TEXT NOT NULL,
    source_entered_at TEXT NOT NULL
  );
  CREATE TABLE report_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE filter_options (filter_key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(filter_key, value));
`);

const insert = database.prepare(`INSERT INTO movements VALUES (${Array.from({ length: 35 }, () => '?').join(',')})`);

let missingProducts = 0;
let missingClients = 0;
let skippedHeadersWithoutDetail = 0;
let insertedRows = 0;
const rejectedBackfillDocuments = raw.captureMeta.optionalEndpointWarnings
  .map((warning) => warning.match(/^Backfill SPT: GESI rechazó (\d+) comprobante/))
  .find((match) => match)?.[1];

const writeDocuments = (documents: GesiRow[], sign: 1 | -1, kind: 'invoice' | 'credit_note') => {
  for (const document of documents) {
    if (document.anulado === true || ![3, 6].includes(number(document.empresaID))) continue;
    const rawItems = Array.isArray(document.detalleItems) ? document.detalleItems as GesiRow[] : [];
    if (!rawItems.length) { skippedHeadersWithoutDetail += 1; continue; }
    const uniqueItems = new Map<string, { row: GesiRow; sourceItemID: number }>();
    rawItems.forEach((row, index) => {
      const itemID = number(row.itemID);
      const sourceItemID = itemID || index + 1;
      const key = itemID ? String(itemID) : `${sourceItemID}:${text(row.codigoDeItem)}`;
      if (!uniqueItems.has(key)) uniqueItems.set(key, { row, sourceItemID });
    });
    const clientID = number(document.clienteID);
    const client = clients.get(clientID);
    if (!client) missingClients += 1;
    let saleDate = date(document.fechaDeEmision);
    if (saleDate === '2025-06-02' || saleDate === '2025-06-03') saleDate = '2025-05-31';
    const groupingID = number(client?.agrupacionID ?? document.agrupacionID);
    const typeID = number(client?.tipoDeClienteID);
    const zoneID = number(client?.zonaID);

    for (const { row: item, sourceItemID } of uniqueItems.values()) {
      if (text(item.tipoDeItem) && text(item.tipoDeItem) !== 'P') continue;
      const productID = text(item.codigoDeItem);
      if (!productID) continue;
      const product = products.get(productID);
      if (!product) missingProducts += 1;
      const rubroID = number(product?.rubroID);
      const subRubroID = number(product?.subRubroID);
      const branchSellerLabel = branchSeller(client) === 'Male' ? 'Delfina' : branchSeller(client);
      const customerSellerRaw = sellers.get(number(client?.vendedorID)) ?? '';
      const customerSeller = customerSellerRaw === 'Male' ? 'Delfina' : customerSellerRaw;
      const companyID = number(document.empresaID);
      const branchID = number(document.sucursalID);
      const issuerName = companyID === 3 && branchID === 3
        ? 'Salice Distribuciones S.A.'
        : companyID === 3 && branchID === 6
          ? 'MDQ Alarcon Distribuciones S.A.'
          : `Empresa ${companyID} · sucursal ${branchID}`;
      insert.run(
        saleDate,
        productID,
        text(product?.descripcion) || productID,
        text(document.razonSocial) || text(client?.razonSocial) || text(client?.fantasia) || `Cliente ${clientID}`,
        clientID,
        number(document.sucursalClienteID),
        brands.get(number(product?.filtroArticulos1ID)) ?? '',
        lines.get(number(product?.filtroArticulos2ID)) ?? '',
        text(product?.rubro) || rubros.get(rubroID) || '',
        text(product?.subrubro) || subRubros.get(`${rubroID}:${subRubroID}`) || '',
        families.get(number(product?.filtroArticulos3ID)) ?? '',
        sign * number(item.cantidadU1),
        sign * number(item.cantidadU2),
        sign * number(item.importeTotalNeto),
        zones.get(zoneID) ?? (zoneID ? `Zona ${zoneID}` : ''),
        groupingID ? `Agrupación ${groupingID}` : '',
        clientTypes.get(typeID) ?? (typeID ? `Tipo ${typeID}` : ''),
        productGroups.get(number(product?.grupoArtID)) ?? '',
        channels.get(number(document.canalDeVentaID)) ?? '',
        text(client?.domicilio),
        companyID,
        branchID,
        issuerName,
        number(client?.estadoID) === 1 ? 'Activo' : 'Inactivo',
        `Empresa ${companyID} · sucursal ${branchID}`,
        text(client?.localidad) || text(document.localidad),
        text(document.serie),
        number(document.puntoDeVentaID),
        number(document.numero),
        branchSellerLabel,
        customerSeller,
        documentKey(document),
        sourceItemID,
        kind,
        text(document.fechaDeIngreso) || text(document.fechaIngreso) || text(document.fechaDeUltimaModificacion),
      );
      insertedRows += 1;
    }
  }
};

database.exec('BEGIN');
try {
  writeDocuments(deduplicateDocuments(raw.sptInvoices ?? raw.invoices ?? []), 1, 'invoice');
  writeDocuments(deduplicateDocuments(raw.sptCreditNotes ?? raw.creditNotes ?? []), -1, 'credit_note');
  database.exec('COMMIT');
} catch (error) {
  database.exec('ROLLBACK');
  database.close();
  await rm(temporaryPath, { force: true });
  throw error;
}

database.exec(`
  CREATE INDEX idx_spt_date ON movements(sale_date);
  CREATE INDEX idx_spt_company_date ON movements(company_id, sale_date);
  CREATE INDEX idx_spt_seller_date ON movements(seller, sale_date);
  CREATE INDEX idx_spt_group_date ON movements(product_group, sale_date);
  CREATE INDEX idx_spt_channel_date ON movements(channel, sale_date);
  CREATE INDEX idx_spt_product ON movements(product_id);
  CREATE INDEX idx_spt_client ON movements(client_id);
  CREATE UNIQUE INDEX idx_spt_source_item ON movements(source_document_key, source_item_id, source_kind);
`);

const dates = database.prepare('SELECT MIN(sale_date) minDate, MAX(sale_date) maxDate FROM movements').get() as { minDate: string; maxDate: string };
const meta = database.prepare('INSERT INTO report_meta(key, value) VALUES (?, ?)');
const metaValues: Record<string, string> = {
  source_file: 'data/raw/gesi-salice-latest.json',
  source_system: 'GESI API · facturas, notas de crédito y maestros Salice',
  source_kind: 'gesi_api',
  captured_at: raw.captureMeta.capturedAt,
  row_count: String(insertedRows),
  min_date: dates.minDate ?? '',
  max_date: dates.maxDate ?? '',
  coverage_from: raw.captureMeta.salesHistoryFrom || dates.minDate || '',
  source_document_count: String((raw.sptInvoices ?? raw.invoices ?? []).length + (raw.sptCreditNotes ?? raw.creditNotes ?? []).length),
  unavailable_document_count: String(skippedHeadersWithoutDetail + Number(rejectedBackfillDocuments ?? 0)),
  missing_product_rows: String(missingProducts),
  missing_client_documents: String(missingClients),
  skipped_documents_without_detail: String(skippedHeadersWithoutDetail),
  client_type_catalog_source: raw.masters.clientTypes.length ? 'gesi_api' : 'catalog_fallback_2026-07-20',
};
database.exec('BEGIN');
for (const [key, value] of Object.entries(metaValues)) meta.run(key, value);
const option = database.prepare('INSERT OR IGNORE INTO filter_options(filter_key, value) VALUES (?, ?)');
const filterColumns = {
  seller: 'seller', brand: 'brand', productGroup: 'product_group', channel: 'channel',
  product: 'product_name', client: 'client_name', line: 'line', category: 'category',
  subcategory: 'subcategory', clientType: 'client_type', grouping: 'grouping_name', locality: 'locality',
};
for (const [key, column] of Object.entries(filterColumns)) {
  const values = database.prepare(`SELECT DISTINCT ${column} value FROM movements WHERE TRIM(${column}) <> '' ORDER BY ${column} COLLATE NOCASE`).all() as { value: string }[];
  for (const row of values) option.run(key, row.value);
}
database.exec('COMMIT');
database.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE; VACUUM;');
database.close();
await rm(targetPath, { force: true });
await rename(temporaryPath, targetPath);

console.log(JSON.stringify({
  target: targetPath,
  rows: insertedRows,
  minDate: dates.minDate,
  maxDate: dates.maxDate,
  missingProductRows: missingProducts,
  missingClientDocuments: missingClients,
  skippedDocumentsWithoutDetail: skippedHeadersWithoutDetail,
}, null, 2));
