import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Client, DashboardData, Product } from '../shared/models.js';
import { resolveActiveDataPaths } from './data-bundle.js';
import { createDemoSnapshot } from './data/demo-snapshot.js';

const CAPTURED_AT = '2026-07-15T15:00:00.000Z';
const AS_OF_DATE = '2026-07-15';
export const DEMO_SELLERS = ['Alex Morgan', 'Jordan Lee', 'Casey Rivera', 'Taylor Brooks'] as const;
export const DEMO_ISSUER = 'SMART Salice Demo Company';

function monthKeys() {
  const result: string[] = [];
  for (let year = 2025, month = 1; year < 2026 || month <= 7; month += 1) {
    if (month === 13) { year += 1; month = 1; }
    result.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return result;
}

function atomicDatabase(path: string, build: (database: DatabaseSync) => void) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  rmSync(temporary, { force: true });
  const database = new DatabaseSync(temporary);
  try {
    build(database);
    const integrity = String(database.prepare('PRAGMA integrity_check').get()?.integrity_check ?? '');
    if (integrity !== 'ok') throw new Error(`Synthetic database integrity check failed: ${integrity || 'no result'}`);
  } finally {
    database.close();
  }
  rmSync(path, { force: true });
  renameSync(temporary, path);
}

function movementProducts(snapshot: DashboardData, client: Client, monthIndex: number) {
  const ids = [...new Set(client.purchases.map((purchase) => purchase.productId))];
  return [0, 1, 2, 3].map((offset) => snapshot.products.find((product) => product.id === ids[(monthIndex + offset) % ids.length])!).filter(Boolean);
}

function channelFor(client: Client, index: number) {
  if (client.segment === 'Feed Store') return index % 2 ? 'Distributor' : 'Coastal Route';
  if (client.segment === 'Veterinary Store') return 'Specialty';
  return index % 3 === 0 ? 'Small Retail' : 'Specialty';
}

function buildCommercialDatabase(path: string, snapshot: DashboardData) {
  atomicDatabase(path, (database) => {
    database.exec(`
      PRAGMA journal_mode = OFF;
      PRAGMA synchronous = OFF;
      CREATE TABLE report_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
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
      CREATE TABLE filter_options (filter_key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (filter_key, value));
      CREATE INDEX idx_movements_date ON movements(sale_date);
      CREATE INDEX idx_movements_client ON movements(client_id, sale_date);
      CREATE INDEX idx_movements_product ON movements(product_id, sale_date);
      CREATE INDEX idx_movements_seller ON movements(seller, sale_date);
      CREATE INDEX idx_movements_group ON movements(product_group, sale_date);
      CREATE INDEX idx_movements_document ON movements(source_document_key);
    `);
    const insert = database.prepare(`INSERT INTO movements VALUES (${Array.from({ length: 35 }, () => '?').join(', ')})`);
    let rowCount = 0;
    let documentCount = 0;
    database.exec('BEGIN');
    for (const [monthIndex, month] of monthKeys().entries()) {
      for (const [clientIndex, client] of snapshot.clients.entries()) {
        if ((clientIndex === 8 && month > '2026-03') || (clientIndex === 13 && month > '2026-05')) continue;
        const products = movementProducts(snapshot, client, monthIndex);
        for (const [itemIndex, product] of products.entries()) {
          const latestMonth = month === '2026-07';
          const day = latestMonth ? 4 + ((clientIndex + itemIndex * 3) % 12) : 4 + ((clientIndex * 2 + itemIndex * 5) % 23);
          const saleDate = `${month}-${String(day).padStart(2, '0')}`;
          const units = 2 + ((monthIndex + clientIndex * 2 + itemIndex * 3) % 10);
          const growth = 1 + monthIndex * .006 + (clientIndex % 4) * .015;
          const netAmount = Math.round(product.price * units * growth);
          const kilos = product.contentKg == null ? 0 : Math.round(product.contentKg * units * 100) / 100;
          const invoiceNumber = 700000 + monthIndex * 1000 + clientIndex * 10 + itemIndex;
          const documentKey = `DEMO:${month}:${client.id}:${itemIndex}`;
          insert.run(
            saleDate, product.id, product.name, client.name, client.id, client.id * 10 + 1,
            product.brand, product.line, product.family, product.subcategory, product.family,
            units, kilos, netAmount, client.zone, `${client.zone} Portfolio`, client.segment,
            product.group, channelFor(client, clientIndex), client.address,
            3, 3, DEMO_ISSUER, 'Active', 'SMART Salice Demo Office', client.locality,
            'A', 1, invoiceNumber, client.seller, client.seller, documentKey, itemIndex + 1,
            'invoice', `${saleDate}T15:00:00.000Z`,
          );
          rowCount += 1;
          documentCount += 1;
          if ((monthIndex + clientIndex + itemIndex) % 37 === 0) {
            insert.run(
              saleDate, product.id, product.name, client.name, client.id, client.id * 10 + 1,
              product.brand, product.line, product.family, product.subcategory, product.family,
              -1, product.contentKg == null ? 0 : -product.contentKg, -Math.round(product.price * .92),
              client.zone, `${client.zone} Portfolio`, client.segment, product.group,
              channelFor(client, clientIndex), client.address, 3, 3, DEMO_ISSUER, 'Active',
              'SMART Salice Demo Office', client.locality, 'C', 1, invoiceNumber + 500000,
              client.seller, client.seller, `${documentKey}:CREDIT`, 1, 'credit_note', `${saleDate}T17:00:00.000Z`,
            );
            rowCount += 1;
            documentCount += 1;
          }
        }
      }
    }
    database.exec('COMMIT');

    const meta = database.prepare('INSERT INTO report_meta (key, value) VALUES (?, ?)');
    const metadata: Record<string, string> = {
      source_file: 'generated://smart-salice/synthetic-commercial-demo',
      source_system: 'Synthetic local demo dataset',
      source_kind: 'deterministic_local_generator',
      captured_at: CAPTURED_AT,
      row_count: String(rowCount),
      min_date: '2025-01-04',
      max_date: AS_OF_DATE,
      coverage_from: '2025-01-01',
      source_document_count: String(documentCount),
      unavailable_document_count: '0',
      missing_product_rows: '0',
      missing_client_documents: '0',
      skipped_documents_without_detail: '0',
      client_type_catalog_source: 'Synthetic demo classifications',
    };
    for (const [key, value] of Object.entries(metadata)) meta.run(key, value);

    const filter = database.prepare('INSERT OR IGNORE INTO filter_options (filter_key, value) VALUES (?, ?)');
    const columns: Record<string, string> = {
      seller: 'seller', brand: 'brand', productGroup: 'product_group', channel: 'channel',
      product: 'product_name', client: 'client_name', line: 'line', category: 'category',
      subcategory: 'subcategory', clientType: 'client_type', grouping: 'grouping_name', locality: 'locality',
    };
    for (const [key, column] of Object.entries(columns)) {
      const values = database.prepare(`SELECT DISTINCT ${column} AS value FROM movements WHERE TRIM(${column}) <> '' ORDER BY value`).all() as { value: string }[];
      for (const row of values) filter.run(key, row.value);
    }
  });
}

function daysBetween(from: string, through: string) {
  return Math.round((new Date(`${through}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000);
}

function buildPendingBalancesDatabase(path: string, snapshot: DashboardData) {
  atomicDatabase(path, (database) => {
    database.exec(`
      PRAGMA journal_mode = OFF;
      PRAGMA synchronous = OFF;
      CREATE TABLE report_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE clients (
        client_id INTEGER PRIMARY KEY, client_name TEXT NOT NULL, trade_name TEXT NOT NULL,
        seller TEXT NOT NULL, payment_method TEXT NOT NULL, active INTEGER NOT NULL,
        pending_balance REAL NOT NULL, overdue_balance REAL NOT NULL, earliest_due TEXT,
        oldest_overdue_days INTEGER NOT NULL, open_documents INTEGER NOT NULL,
        overdue_documents INTEGER NOT NULL, term_total_days INTEGER NOT NULL,
        term_average_days REAL, sales_30 REAL NOT NULL
      );
      CREATE TABLE documents (
        document_id TEXT PRIMARY KEY, client_id INTEGER NOT NULL, document_number TEXT NOT NULL,
        issued_at TEXT NOT NULL, due_at TEXT NOT NULL, outstanding REAL NOT NULL,
        credit_term_days INTEGER, payment_method TEXT NOT NULL, status TEXT NOT NULL
      );
      CREATE INDEX idx_pending_clients_seller ON clients(seller);
      CREATE INDEX idx_pending_clients_payment ON clients(payment_method);
      CREATE INDEX idx_pending_documents_client ON documents(client_id);
    `);
    const clientInsert = database.prepare('INSERT INTO clients VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const documentInsert = database.prepare('INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    let clientCount = 0;
    let documentCount = 0;
    for (const client of snapshot.clients) {
      const documents = client.invoices.filter((invoice) => invoice.outstanding > .01);
      if (!documents.length) continue;
      const overdue = documents.filter((invoice) => invoice.dueAt < AS_OF_DATE);
      const pendingBalance = documents.reduce((sum, invoice) => sum + invoice.outstanding, 0);
      const overdueBalance = overdue.reduce((sum, invoice) => sum + invoice.outstanding, 0);
      const terms = documents.map((invoice) => invoice.creditTermDays).filter((value): value is number => value != null);
      clientInsert.run(
        client.id, client.name, client.tradeName, client.seller, client.paymentMethod, Number(client.active),
        pendingBalance, overdueBalance, documents.map((invoice) => invoice.dueAt).sort()[0] ?? null,
        overdue.length ? Math.max(...overdue.map((invoice) => daysBetween(invoice.dueAt, AS_OF_DATE))) : 0,
        documents.length, overdue.length, terms.reduce((sum, value) => sum + value, 0),
        terms.length ? terms.reduce((sum, value) => sum + value, 0) / terms.length : null,
        Math.round(client.sales90d / 3),
      );
      clientCount += 1;
      for (const invoice of documents) {
        documentInsert.run(
          invoice.id, client.id, invoice.number, invoice.issuedAt, invoice.dueAt, invoice.outstanding,
          invoice.creditTermDays, invoice.paymentMethod, invoice.dueAt < AS_OF_DATE ? 'overdue' : 'not_due',
        );
        documentCount += 1;
      }
    }
    const meta = database.prepare('INSERT INTO report_meta (key, value) VALUES (?, ?)');
    const metadata: Record<string, string> = {
      source_system: 'Synthetic local demo dataset', captured_at: CAPTURED_AT, as_of_date: AS_OF_DATE,
      sales_from: '2026-06-16', client_count: String(clientCount), document_count: String(documentCount),
      sellers: JSON.stringify(DEMO_SELLERS),
    };
    for (const [key, value] of Object.entries(metadata)) meta.run(key, value);
  });
}

function writeSnapshot(path: string, snapshot: DashboardData) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

export function ensureLocalDemoData(workspace = process.cwd()) {
  const paths = resolveActiveDataPaths(workspace);
  const snapshot = createDemoSnapshot();
  if (!existsSync(paths.snapshot)) writeSnapshot(paths.snapshot, snapshot);
  if (!existsSync(paths.staging)) writeSnapshot(paths.staging, snapshot);
  if (!existsSync(paths.commercial)) buildCommercialDatabase(paths.commercial, snapshot);
  if (!existsSync(paths.pendingBalances)) buildPendingBalancesDatabase(paths.pendingBalances, snapshot);
  return paths;
}

export function rebuildLocalDemoData(workspace = process.cwd()) {
  const paths = resolveActiveDataPaths(workspace);
  const snapshot = createDemoSnapshot();
  writeSnapshot(paths.snapshot, snapshot);
  writeSnapshot(paths.staging, snapshot);
  buildCommercialDatabase(paths.commercial, snapshot);
  buildPendingBalancesDatabase(paths.pendingBalances, snapshot);
  return paths;
}

export function productCategory(product: Product) {
  return product.family;
}
