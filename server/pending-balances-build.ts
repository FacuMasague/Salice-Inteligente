import { renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { GesiRawCapture, GesiRow } from './gesi/types.js';

export const PENDING_BALANCE_SELLERS = [
  'Ana Ottaviano',
  'Andres Dominguez',
  'Edgardo Larrea',
  'Ignacio Carea',
  'Julieta Errecart',
];

const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = (value: unknown) => value == null ? '' : String(value).trim();
const date = (value: unknown) => text(value).slice(0, 10);
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const shiftDays = (value: string, days: number) => {
  const result = new Date(`${value}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
};
const daysBetween = (from: string, through: string) => Math.round(
  (new Date(`${through}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000,
);
const documentKey = (row: GesiRow) => [
  numeric(row.empresaID), numeric(row.comprobanteID), text(row.serie),
  numeric(row.puntoDeVentaID), numeric(row.numero),
].join(':');
const documentNumber = (row: GesiRow) => {
  const labels: Record<string, string> = { F: 'FAC', D: 'NDB', C: 'NCR', R: 'REC' };
  const subtype = text(row.subtipo);
  const label = labels[subtype] ?? (subtype || 'COMP');
  return `${label}${text(row.serie) ? ` ${text(row.serie)}` : ''} ${String(numeric(row.puntoDeVentaID)).padStart(4, '0')}-${String(numeric(row.numero)).padStart(8, '0')}`;
};
const deduplicate = (rows: GesiRow[]) => {
  const result = new Map<string, GesiRow>();
  for (const row of rows) if (!result.has(documentKey(row))) result.set(documentKey(row), row);
  return [...result.values()];
};

export function buildPendingBalancesDatabase(
  capture: GesiRawCapture,
  targetPath = resolve(process.cwd(), 'data/pending-balances.sqlite'),
) {
  if (capture.captureMeta.empresaID !== 3 || capture.captureMeta.sucursalID !== 3) {
    throw new Error('Saldos Pendientes sólo admite la captura Salice empresa 3 / sucursal 3.');
  }
  const asOfDate = date(capture.captureMeta.capturedAt);
  const salesFrom = shiftDays(asOfDate, -29);
  const sellerLabels = new Map(capture.masters.sellers.map((row) => [
    numeric(row.vendedorID), text(row.fantasia) || text(row.razonSocial),
  ]));
  const paymentLabels = new Map(capture.masters.paymentMethods.map((row) => [
    numeric(row.formaDePagoID), text(row.descripcion),
  ]));
  const clients = new Map<number, {
    source: GesiRow;
    seller: string;
    paymentMethod: string;
  }>();

  for (const row of capture.clients) {
    const definitions = Array.isArray(row.lstDefinicionClienteSucursal) ? row.lstDefinicionClienteSucursal as GesiRow[] : [];
    const definition = definitions.find((item) => numeric(item.empresaID) === 3 && numeric(item.sucursalID) === 3)
      ?? definitions.find((item) => numeric(item.sucursalID) === 3);
    const sellerID = numeric(definition?.vendedorID || row.enEstaSucursal_VendedorID || row.vendedorID);
    const paymentID = numeric(definition?.formaDePagoID || row.enEstaSucursal_FormaDePagoID || row.formaDePagoID);
    clients.set(numeric(row.clienteID), {
      source: row,
      seller: sellerLabels.get(sellerID) ?? '',
      paymentMethod: paymentLabels.get(paymentID) ?? (paymentID ? `Forma de pago ${paymentID}` : 'Sin condición informada'),
    });
  }

  const sales30 = new Map<number, number>();
  const addSales = (rows: GesiRow[], sign: 1 | -1) => {
    for (const row of deduplicate(rows)) {
      const issuedAt = date(row.fechaDeEmision);
      if (row.anulado === true || issuedAt < salesFrom || issuedAt > asOfDate) continue;
      const clientID = numeric(row.clienteID);
      sales30.set(clientID, (sales30.get(clientID) ?? 0) + sign * numeric(row.importeTotal));
    }
  };
  addSales(capture.invoices, 1);
  addSales(capture.creditNotes, -1);

  const pendingByClient = new Map<number, GesiRow[]>();
  for (const document of deduplicate(capture.pendingDocuments)) {
    // El modelo publicado trata "Saldo Pendiente" como cartera de documentos
    // débito abierta. Recibos y notas de crédito pueden seguir sin aplicar en
    // GESI, pero no forman parte de esta suma (sí afectan el saldo neto CC).
    if (document.anulado === true || !['F', 'D'].includes(text(document.subtipo)) || numeric(document.saldoPendiente) <= .01) continue;
    const clientID = numeric(document.clienteID);
    const current = pendingByClient.get(clientID) ?? [];
    current.push(document);
    pendingByClient.set(clientID, current);
  }

  const temporaryPath = `${targetPath}.tmp`;
  rmSync(temporaryPath, { force: true });
  const database = new DatabaseSync(temporaryPath);
  database.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    CREATE TABLE report_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE clients (
      client_id INTEGER PRIMARY KEY,
      client_name TEXT NOT NULL,
      trade_name TEXT NOT NULL,
      seller TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      active INTEGER NOT NULL,
      pending_balance REAL NOT NULL,
      overdue_balance REAL NOT NULL,
      earliest_due TEXT,
      oldest_overdue_days INTEGER NOT NULL,
      open_documents INTEGER NOT NULL,
      overdue_documents INTEGER NOT NULL,
      term_total_days INTEGER NOT NULL,
      term_average_days REAL,
      sales_30 REAL NOT NULL
    );
    CREATE TABLE documents (
      document_id TEXT PRIMARY KEY,
      client_id INTEGER NOT NULL,
      document_number TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      due_at TEXT NOT NULL,
      outstanding REAL NOT NULL,
      credit_term_days INTEGER,
      payment_method TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE INDEX clients_seller_idx ON clients(seller);
    CREATE INDEX clients_payment_idx ON clients(payment_method);
    CREATE INDEX documents_client_idx ON documents(client_id);
  `);
  const insertMeta = database.prepare('INSERT INTO report_meta (key, value) VALUES (?, ?)');
  const insertClient = database.prepare(`INSERT INTO clients (
    client_id, client_name, trade_name, seller, payment_method, active,
    pending_balance, overdue_balance, earliest_due, oldest_overdue_days,
    open_documents, overdue_documents, term_total_days, term_average_days, sales_30
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertDocument = database.prepare(`INSERT INTO documents (
    document_id, client_id, document_number, issued_at, due_at, outstanding, credit_term_days, payment_method, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  let clientCount = 0;
  let documentCount = 0;
  database.exec('BEGIN');
  try {
    for (const [clientID, client] of clients) {
      if (!PENDING_BALANCE_SELLERS.includes(client.seller)) continue;
      const documents = (pendingByClient.get(clientID) ?? []).map((row) => {
        const issuedAt = date(row.fechaDeEmision);
        const dueAt = date(row.fechaDePrimerVencimiento);
        const termDays = issuedAt && dueAt ? daysBetween(issuedAt, dueAt) : null;
        return { row, issuedAt, dueAt, termDays, outstanding: roundMoney(numeric(row.saldoPendiente)) };
      }).filter((document) => document.issuedAt && document.dueAt && document.termDays != null && document.termDays >= 0 && document.termDays <= 365);
      const pendingBalance = roundMoney(documents.reduce((sum, document) => sum + document.outstanding, 0));
      if (pendingBalance <= .01) continue;
      const overdue = documents.filter((document) => document.dueAt < asOfDate);
      const overdueBalance = roundMoney(overdue.reduce((sum, document) => sum + document.outstanding, 0));
      const earliestDue = [...documents].sort((left, right) => left.dueAt.localeCompare(right.dueAt))[0]?.dueAt ?? null;
      const termTotal = documents.reduce((sum, document) => sum + Number(document.termDays), 0);
      const termAverage = documents.length ? termTotal / documents.length : null;
      const source = client.source;
      insertClient.run(
        clientID,
        text(source.razonSocial) || 'Cliente sin razón social',
        text(source.nombreDeFantasia),
        client.seller,
        client.paymentMethod,
        numeric(source.estadoID) === 1 ? 1 : 0,
        pendingBalance,
        overdueBalance,
        earliestDue,
        overdue.length ? Math.max(...overdue.map((document) => daysBetween(document.dueAt, asOfDate))) : 0,
        documents.length,
        overdue.length,
        termTotal,
        termAverage,
        roundMoney(sales30.get(clientID) ?? 0),
      );
      clientCount += 1;
      for (const document of documents) {
        insertDocument.run(
          documentKey(document.row),
          clientID,
          documentNumber(document.row),
          document.issuedAt,
          document.dueAt,
          document.outstanding,
          document.termDays,
          paymentLabels.get(numeric(document.row.formaDePagoID))
            ?? (numeric(document.row.formaDePagoID) ? `Forma de pago ${numeric(document.row.formaDePagoID)}` : client.paymentMethod),
          document.dueAt < asOfDate ? 'overdue' : 'open',
        );
        documentCount += 1;
      }
    }
    const meta: Record<string, string> = {
      source_system: 'GESI API · saldos, comprobantes pendientes y ventas Salice',
      captured_at: capture.captureMeta.capturedAt,
      as_of_date: asOfDate,
      sales_from: salesFrom,
      client_count: String(clientCount),
      document_count: String(documentCount),
      sellers: JSON.stringify(PENDING_BALANCE_SELLERS),
    };
    for (const [key, value] of Object.entries(meta)) insertMeta.run(key, value);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    database.close();
    rmSync(temporaryPath, { force: true });
    throw error;
  }
  database.close();
  rmSync(targetPath, { force: true });
  renameSync(temporaryPath, targetPath);
  return { targetPath, clientCount, documentCount, asOfDate, salesFrom };
}
