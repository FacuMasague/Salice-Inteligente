import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const COMMERCIAL_COLUMNS = 35;

type Movement = {
  saleDate: string;
  productId: string;
  productName: string;
  clientName: string;
  clientId: number;
  clientBranchId: number;
  brand: string;
  line: string;
  category: string;
  subcategory: string;
  family: string;
  units: number;
  kilos: number;
  netAmount: number;
  zone: string;
  groupingName: string;
  clientType: string;
  productGroup: string;
  channel: string;
  address: string;
  companyId: number;
  branchId: number;
  issuerName: string;
  clientStatus: string;
  branchName: string;
  locality: string;
  series: string;
  pointOfSaleId: number;
  invoiceNumber: number;
  branchSeller: string;
  seller: string;
  sourceDocumentKey: string;
  sourceItemId: number;
  sourceKind: string;
  sourceEnteredAt: string;
};

const movement = (input: Partial<Movement> & Pick<Movement, 'saleDate' | 'productId' | 'productGroup' | 'kilos' | 'netAmount'>, index: number): Movement => ({
  productName: `Producto ${input.productId}`,
  clientName: `Cliente ${input.clientId ?? index}`,
  clientId: input.clientId ?? index,
  clientBranchId: input.clientBranchId ?? 1,
  brand: 'Marca base',
  line: 'Adulto',
  category: 'Alimentos Balanceados',
  subcategory: 'Dry',
  family: 'Alimentos',
  units: input.units ?? input.kilos,
  zone: 'Zona prueba',
  groupingName: 'Agrupación prueba',
  clientType: 'Pet Shop',
  channel: 'Especializado',
  address: 'Domicilio sintético',
  companyId: 3,
  branchId: 3,
  issuerName: 'Salice Distribuciones S.A.',
  clientStatus: 'Activo',
  branchName: 'Empresa 3 · sucursal 3',
  locality: 'Mar del Plata',
  series: 'A',
  pointOfSaleId: 1,
  invoiceNumber: index,
  branchSeller: 'Edgardo Larrea',
  seller: 'Edgardo Larrea',
  sourceDocumentKey: `synthetic:${index}`,
  sourceItemId: 1,
  sourceKind: 'invoice',
  sourceEnteredAt: `${input.saleDate}T12:00:00.000Z`,
  ...input,
});

const movementValues = (row: Movement) => [
  row.saleDate, row.productId, row.productName, row.clientName, row.clientId, row.clientBranchId,
  row.brand, row.line, row.category, row.subcategory, row.family, row.units, row.kilos, row.netAmount,
  row.zone, row.groupingName, row.clientType, row.productGroup, row.channel, row.address,
  row.companyId, row.branchId, row.issuerName, row.clientStatus, row.branchName, row.locality,
  row.series, row.pointOfSaleId, row.invoiceNumber, row.branchSeller, row.seller,
  row.sourceDocumentKey, row.sourceItemId, row.sourceKind, row.sourceEnteredAt,
];

function createCommercialDatabase(path: string) {
  const database = new DatabaseSync(path);
  database.exec(`
    CREATE TABLE movements (
      sale_date TEXT NOT NULL, product_id TEXT NOT NULL, product_name TEXT NOT NULL,
      client_name TEXT NOT NULL, client_id INTEGER NOT NULL, client_branch_id INTEGER NOT NULL,
      brand TEXT NOT NULL, line TEXT NOT NULL, category TEXT NOT NULL, subcategory TEXT NOT NULL,
      family TEXT NOT NULL, units REAL NOT NULL, kilos REAL NOT NULL, net_amount REAL NOT NULL,
      zone TEXT NOT NULL, grouping_name TEXT NOT NULL, client_type TEXT NOT NULL,
      product_group TEXT NOT NULL, channel TEXT NOT NULL, address TEXT NOT NULL,
      company_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, issuer_name TEXT NOT NULL,
      client_status TEXT NOT NULL, branch_name TEXT NOT NULL, locality TEXT NOT NULL,
      series TEXT NOT NULL, point_of_sale_id INTEGER NOT NULL, invoice_number INTEGER NOT NULL,
      branch_seller TEXT NOT NULL, seller TEXT NOT NULL, source_document_key TEXT NOT NULL,
      source_item_id INTEGER NOT NULL, source_kind TEXT NOT NULL, source_entered_at TEXT NOT NULL
    );
    CREATE TABLE report_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE filter_options (filter_key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(filter_key, value));
  `);

  const sourceRows = [
    movement({ saleDate: '2025-07-10', productId: 'BAIRES', productGroup: 'Baires SPT', brand: 'Old Prince Noveles', kilos: 6, netAmount: 600, clientId: 1 }, 1),
    movement({ saleDate: '2026-06-10', productId: 'BAIRES', productGroup: 'Baires SPT', brand: 'Old Prince Noveles', kilos: 8, netAmount: 800, clientId: 1 }, 2),
    movement({ saleDate: '2026-07-10', productId: 'BAIRES', productGroup: 'Baires SPT', brand: 'Old Prince Noveles', kilos: 10, netAmount: 1_000, clientId: 1 }, 3),
    movement({ saleDate: '2026-07-18', productId: 'BAIRES-M', productGroup: 'Baires Masivo', brand: 'Kongo', kilos: 4, netAmount: 500, clientId: 2, channel: 'Small Retail' }, 4),
    movement({ saleDate: '2025-07-12', productId: 'NUTRI', productGroup: 'Nutri Pet', brand: 'MaxPet', line: 'Cat', kilos: 3, netAmount: 300, clientId: 3 }, 5),
    movement({ saleDate: '2026-06-12', productId: 'NUTRI', productGroup: 'Nutri Pet', brand: 'MaxPet', line: 'Cat', kilos: 5, netAmount: 500, clientId: 3 }, 6),
    movement({ saleDate: '2026-07-15', productId: 'NUTRI', productGroup: 'Nutri Pet', brand: 'MaxPet', line: 'Cat', kilos: 7, netAmount: 700, clientId: 3 }, 7),
    movement({ saleDate: '2025-07-15', productId: 'MARS', productGroup: 'Pet Nutrition', brand: 'Whiskas', kilos: 5, netAmount: 500, clientId: 4 }, 8),
    movement({ saleDate: '2026-06-20', productId: 'MARS', productGroup: 'Pet Nutrition', brand: 'Whiskas', kilos: 9, netAmount: 900, clientId: 4 }, 9),
    movement({ saleDate: '2026-07-14', productId: 'MARS', productGroup: 'Pet Nutrition', brand: 'Whiskas', kilos: 11, netAmount: 1_100, clientId: 4 }, 10),
    movement({ saleDate: '2026-04-01', productId: 'DORMANT', productGroup: 'Baires SPT', brand: 'Marca dormida', kilos: 2, netAmount: 200, clientId: 5, branchSeller: 'Ana Ottaviano', seller: 'Ana Ottaviano' }, 11),
    movement({ saleDate: '2026-07-20', productId: 'CREDIT', productGroup: 'Baires SPT', brand: 'Old Prince Noveles', kilos: -1, units: -1, netAmount: -100, clientId: 1, sourceKind: 'credit_note' }, 12),
    movement({ saleDate: '2026-07-20', productId: 'EXCLUDED', productGroup: 'Drovet', brand: 'Excluida', kilos: 50, netAmount: 5_000, clientId: 6, category: 'POP' }, 13),
  ];
  const insert = database.prepare(`INSERT INTO movements VALUES (${Array.from({ length: COMMERCIAL_COLUMNS }, () => '?').join(',')})`);
  for (const row of sourceRows) insert.run(...movementValues(row));

  const meta = database.prepare('INSERT INTO report_meta(key, value) VALUES (?, ?)');
  const values: Record<string, string> = {
    source_file: 'fixture://synthetic-commercial-v1',
    source_system: 'GESI API · fixture sintético sin datos reales',
    source_kind: 'synthetic_fixture',
    captured_at: '2026-07-20T13:05:02.525Z',
    row_count: String(sourceRows.length),
    min_date: '2025-07-10',
    max_date: '2026-07-20',
    coverage_from: '2025-07-10',
    source_document_count: String(sourceRows.length),
    unavailable_document_count: '0',
    missing_product_rows: '0',
    missing_client_documents: '0',
    skipped_documents_without_detail: '0',
    client_type_catalog_source: 'synthetic_fixture',
  };
  for (const [key, value] of Object.entries(values)) meta.run(key, value);
  database.close();
}

function createPendingBalancesDatabase(path: string) {
  const database = new DatabaseSync(path);
  database.exec(`
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
  `);
  const meta = database.prepare('INSERT INTO report_meta(key, value) VALUES (?, ?)');
  const values: Record<string, string> = {
    source_system: 'GESI API · fixture sintético sin datos reales',
    captured_at: '2026-07-20T13:05:02.525Z',
    as_of_date: '2026-07-20', sales_from: '2026-06-21', client_count: '3', document_count: '5',
    sellers: JSON.stringify(['Ana Ottaviano', 'Andres Dominguez', 'Edgardo Larrea', 'Ignacio Carea', 'Julieta Errecart']),
  };
  for (const [key, value] of Object.entries(values)) meta.run(key, value);
  const client = database.prepare('INSERT INTO clients VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  client.run(1, 'Cliente sintético vencido', '', 'Edgardo Larrea', 'CTA CTE 30 DIAS', 1, 15_500, 10_500, '2026-07-01', 19, 3, 2, 90, 30, 20_000);
  client.run(2, 'Cliente sintético vigente', '', 'Ana Ottaviano', 'CONTADO', 1, 8_000, 0, '2026-08-01', 0, 1, 0, 30, 30, 12_000);
  client.run(3, 'Consumidor Final', '', 'Edgardo Larrea', 'CONTADO', 1, 50_000, 50_000, '2026-07-01', 19, 1, 1, 30, 30, 50_000);
  const document = database.prepare('INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  document.run('synthetic:1', 1, 'FAC A 0001-00000001', '2026-06-01', '2026-07-01', 10_000, 30, 'CTA CTE 30 DIAS', 'overdue');
  document.run('synthetic:2', 1, 'FAC A 0001-00000002', '2026-07-15', '2026-08-14', 5_000, 30, 'CTA CTE 30 DIAS', 'open');
  document.run('synthetic:tiny', 1, 'FAC A 0001-00000004', '2026-06-01', '2026-07-01', 500, 30, 'CTA CTE 30 DIAS', 'overdue');
  document.run('synthetic:3', 2, 'FAC A 0001-00000003', '2026-07-02', '2026-08-01', 8_000, 30, 'CONTADO', 'open');
  document.run('synthetic:excluded', 3, 'FAC A 0001-00000005', '2026-06-01', '2026-07-01', 50_000, 30, 'CONTADO', 'overdue');
  database.close();
}

export function createSyntheticReportFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'salice-report-fixture-'));
  const commercial = join(directory, 'commercial.sqlite');
  const pendingBalances = join(directory, 'pending-balances.sqlite');
  createCommercialDatabase(commercial);
  createPendingBalancesDatabase(pendingBalances);
  return {
    directory,
    commercial,
    pendingBalances,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}
