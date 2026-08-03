import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import nodemailer from 'nodemailer';
import type {
  DeveloperAlertRecord,
  DeveloperAlertSeverity,
  DeveloperAlertStatus,
} from '../shared/developer-observability.js';
import { getOperationalDatabasePath } from './operational-store.js';

type Row = Record<string, unknown>;

const DEFAULT_RECIPIENT = 'facumasague@gmail.com';
const DEDUPE_HOURS = 6;

function safe(value: unknown, maxLength = 2_000) {
  return String(value ?? '')
    .replace(/(password|contraseña|token|secret|api[-_ ]?key)\s*[:=]\s*[^\s,;]+/gi, '$1: [oculto]')
    .replace(/[\r\n]{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

function configuration() {
  const host = process.env.SALICE_ALERT_SMTP_HOST?.trim() ?? '';
  const user = process.env.SALICE_ALERT_SMTP_USER?.trim() ?? '';
  const pass = process.env.SALICE_ALERT_SMTP_PASS ?? '';
  const from = process.env.SALICE_ALERT_EMAIL_FROM?.trim() || user;
  const port = Math.max(1, Number(process.env.SALICE_ALERT_SMTP_PORT) || 587);
  return {
    host,
    user,
    pass,
    from,
    port,
    secure: process.env.SALICE_ALERT_SMTP_SECURE === 'true' || port === 465,
    recipient: process.env.SALICE_ALERT_EMAIL_TO?.trim() || DEFAULT_RECIPIENT,
    configured: Boolean(host && user && pass && from),
  };
}

function database() {
  const store = new DatabaseSync(getOperationalDatabasePath());
  store.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS developer_alert_events (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      source TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      delivery TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      sent_at TEXT,
      delivery_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_developer_alert_events_time ON developer_alert_events(occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_developer_alert_events_fingerprint ON developer_alert_events(fingerprint, occurred_at DESC);
  `);
  return store;
}

function runAudit(store: DatabaseSync | null, sql: string, ...values: SQLInputValue[]) {
  if (!store) return;
  try {
    store.prepare(sql).run(...values);
  } catch (error) {
    console.warn(`No se pudo registrar una alerta Developer: ${safe(error instanceof Error ? error.message : error, 500)}`);
  }
}

function wasRecentlySent(store: DatabaseSync | null, fingerprint: string, threshold: string) {
  if (!store) return false;
  try {
    return Boolean(store.prepare(`
      SELECT id FROM developer_alert_events
      WHERE fingerprint = ? AND occurred_at >= ? AND delivery IN ('sent', 'deduplicated') LIMIT 1
    `).get(fingerprint, threshold));
  } catch (error) {
    console.warn(`No se pudo deduplicar una alerta Developer: ${safe(error instanceof Error ? error.message : error, 500)}`);
    return false;
  }
}

export async function sendDeveloperAlert(input: {
  kind: string;
  severity?: DeveloperAlertSeverity;
  title: string;
  detail: unknown;
  source: string;
}) {
  const now = new Date();
  const config = configuration();
  const kind = safe(input.kind, 80) || 'system-error';
  const severity = input.severity ?? 'error';
  const title = safe(input.title, 180) || 'Salice Inteligente necesita atención';
  const detail = safe(input.detail);
  const source = safe(input.source, 160);
  const fingerprint = createHash('sha256').update(`${kind}|${source}|${title}|${detail}`).digest('hex');
  const id = randomUUID();
  let store: DatabaseSync | null = null;
  let auditError = '';
  try {
    store = database();
  } catch (error) {
    auditError = safe(error instanceof Error ? error.message : error, 500);
    console.warn(`No se pudo abrir el registro de alertas Developer: ${auditError}`);
  }
  try {
    const threshold = new Date(now.getTime() - DEDUPE_HOURS * 3_600_000).toISOString();
    if (wasRecentlySent(store, fingerprint, threshold)) {
      runAudit(store, `INSERT INTO developer_alert_events
        (id, kind, severity, title, detail, source, fingerprint, delivery, occurred_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'deduplicated', ?)`,
      id, kind, severity, title, detail, source, fingerprint, now.toISOString());
      return { delivery: 'deduplicated' as const };
    }
    if (!config.configured) {
      runAudit(store, `INSERT INTO developer_alert_events
        (id, kind, severity, title, detail, source, fingerprint, delivery, occurred_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'not_configured', ?)`,
      id, kind, severity, title, detail, source, fingerprint, now.toISOString());
      return { delivery: 'not_configured' as const };
    }
    try {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        requireTLS: !config.secure,
        auth: { user: config.user, pass: config.pass },
        connectionTimeout: 15_000,
        socketTimeout: 20_000,
      });
      await transporter.sendMail({
        from: config.from,
        to: config.recipient,
        subject: `[Salice · ${severity.toUpperCase()}] ${title}`,
        text: `${title}\n\n${detail || 'Sin detalle adicional.'}${auditError ? `\n\nAdemás, no se pudo registrar localmente la alerta: ${auditError}` : ''}\n\nOrigen: ${source}\nFecha: ${now.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`,
      });
      runAudit(store, `INSERT INTO developer_alert_events
        (id, kind, severity, title, detail, source, fingerprint, delivery, occurred_at, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)`,
      id, kind, severity, title, detail, source, fingerprint, now.toISOString(), new Date().toISOString());
      return { delivery: 'sent' as const };
    } catch (error) {
      const deliveryError = safe(error instanceof Error ? error.message : error, 500);
      runAudit(store, `INSERT INTO developer_alert_events
        (id, kind, severity, title, detail, source, fingerprint, delivery, occurred_at, delivery_error)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'failed', ?, ?)`,
      id, kind, severity, title, detail, source, fingerprint, now.toISOString(), deliveryError);
      console.warn(`No se pudo enviar una alerta Developer: ${deliveryError}`);
      return { delivery: 'failed' as const };
    }
  } finally {
    store?.close();
  }
}

export function developerAlertStatus(limit = 100): DeveloperAlertStatus {
  const config = configuration();
  const store = database();
  try {
    const recent = (store.prepare(`
      SELECT id, kind, severity, title, detail, source, delivery, occurred_at, sent_at, delivery_error
      FROM developer_alert_events ORDER BY occurred_at DESC LIMIT ?
    `).all(Math.max(1, Math.min(500, Math.round(limit)))) as Row[]).map((row): DeveloperAlertRecord => ({
      id: String(row.id),
      kind: String(row.kind),
      severity: String(row.severity) as DeveloperAlertRecord['severity'],
      title: String(row.title),
      detail: String(row.detail),
      source: String(row.source),
      delivery: String(row.delivery) as DeveloperAlertRecord['delivery'],
      occurredAt: String(row.occurred_at),
      sentAt: row.sent_at == null ? null : String(row.sent_at),
      deliveryError: row.delivery_error == null ? null : String(row.delivery_error),
    }));
    return { configured: config.configured, recipient: config.recipient, recent };
  } finally {
    store.close();
  }
}
