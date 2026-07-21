import cors from 'cors';
import express from 'express';
import { resolve } from 'node:path';
import { recommendProducts, optimizeRoute } from '../shared/algorithms.js';
import {
  APP_VERSION,
  SAVED_VIEW_KEYS,
  type ClientTrendDirection,
  type CommercialActivityOutcome,
  type CommercialActivityType,
  type PaymentPromiseStatus,
  type SavedViewKey,
} from '../shared/models.js';
import { parseLocalizedNumber } from '../shared/localized-number.js';
import { decodeMultiFilter } from '../shared/multi-filter.js';
import { REPORT_ENDPOINT_METRICS } from '../shared/metric-links.js';
import { metricCatalogSummary } from '../shared/metrics.js';
import { buildAgendaPayload, buildNotifications } from './agenda.js';
import { buildBairesReport, getBairesReportMeta, getBairesReportPath } from './baires-report.js';
import { buildCommercialSalesReport, getCommercialSalesReportMeta, getCommercialSalesReportPath } from './commercial-sales-report.js';
import { buildDataHealth, loadPlatformAuditSummary } from './data-health.js';
import { buildGeneralReport, getGeneralReportMeta, getGeneralReportPath } from './general-report.js';
import { buildMarsReport, getMarsReportMeta, getMarsReportPath } from './mars-report.js';
import { buildNonBuyerReport, getNonBuyerReportMeta, getNonBuyerReportPath } from './non-buyers-report.js';
import { buildPendingBalancesReport, getPendingBalancesReportMeta, getPendingBalancesReportPath } from './pending-balances-report.js';
import { buildNutriPetReport, getNutriPetReportMeta, getNutriPetReportPath } from './nutripet-report.js';
import { ensureSnapshot, getBackupCount, getSnapshotPath, loadSnapshot } from './store.js';
import { buildSptReport, getSptReportMeta, getSptReportPath } from './spt-report.js';
import { buildSalesExplorer, getSalesExplorerDocument, getSalesExplorerMeta, getSalesExplorerPath } from './sales-explorer.js';
import { buildReceivablesDashboard, getReceivableCaseDetail, RECEIVABLE_STATUSES } from './receivables-dashboard.js';
import { exportGoalsPdf, exportGoalsXlsx, exportInvoicePdf, exportReceivablesCsv, exportReceivablesXlsx, exportSalesCsv, exportSalesXlsx } from './admin-exports.js';
import { buildInvoiceDetail } from './invoice-detail.js';
import { acquireServerLock } from './runtime-lock.js';
import { countOperationalBackups } from './operations-backup.js';
import {
  createAgendaItem,
  activateCommercialGoalVersion,
  addReceivableComment,
  createCommercialGoalRow,
  createCommercialGoalVersion,
  createSavedView,
  deleteCommercialGoalRow,
  deleteReceivableCaseEvent,
  deleteSavedView,
  getCommercialGoalsPayload,
  createCommercialActivity,
  getOperationalDatabasePath,
  listActivities,
  listAgendaItems,
  listClientTrendReviews,
  listPromises,
  listReceivableCases,
  listReceivableCaseEvents,
  operationalStatus,
  rebuildAllReceivableCasesFromEvents,
  saveClientNote,
  saveReceivableCase,
  setClientTrendReviewed,
  syncReceivablePaymentPromise,
  listSavedViews,
  updateCommercialGoalRow,
  updateSavedView,
  updatePromiseStatus,
} from './operational-store.js';

const app = express();
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const activityTypes = new Set<CommercialActivityType>(['visit', 'call', 'collection', 'offer']);
const activityOutcomes = new Set<CommercialActivityOutcome>(['completed', 'sale', 'promise', 'no_contact', 'rescheduled', 'no_interest']);
const promiseStatuses = new Set<PaymentPromiseStatus>(['pending', 'kept', 'broken', 'cancelled']);
const clientTrendDirections = new Set<ClientTrendDirection>(['growth', 'decline']);
const savedViewKeys = new Set<SavedViewKey>(SAVED_VIEW_KEYS);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function localDate(value = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(value);
}

function validDate(value: unknown) {
  const text = String(value || '');
  if (!datePattern.test(text)) return null;
  const parsed = new Date(`${text}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : null;
}

function validDateTime(value: unknown) {
  const text = String(value || '');
  return text && !Number.isNaN(new Date(text).getTime()) ? new Date(text).toISOString() : null;
}

function stringRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 50)
    .map(([key, item]) => [key.slice(0, 80), String(item ?? '').slice(0, 4000)] as const);
  return Object.fromEntries(entries);
}

function optionalNonNegativeNumber(value: unknown) {
  if (value == null || value === '') return null;
  const number = parseLocalizedNumber(value);
  if (number == null) return undefined;
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

async function sendDownload(response: express.Response, action: () => void | Promise<void>) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!response.headersSent) response.status(500).json({ error: message });
    else response.end();
  }
}

app.use(cors({ origin: ['http://127.0.0.1:5173', 'http://localhost:5173'] }));
app.use(express.json({ limit: '1mb' }));
for (const [path, metricIds] of Object.entries(REPORT_ENDPOINT_METRICS)) {
  app.use(path, (_req, res, next) => {
    res.setHeader('X-Salice-Metrics', metricIds.join(','));
    next();
  });
}

app.get('/api/health', async (_req, res) => {
  const data = await loadSnapshot();
  res.json({ ok: true, version: data.meta.version, source: data.meta.source, generatedAt: data.meta.generatedAt });
});

app.get('/api/dashboard', async (_req, res) => {
  res.json(await loadSnapshot());
});

app.get('/api/metrics/catalog', (_req, res) => {
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.json(metricCatalogSummary());
});

app.get('/api/reports/spt/meta', (_req, res) => {
  const meta = getSptReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'The local Sales Performance database is unavailable.', path: getSptReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/spt', (req, res) => {
  const report = buildSptReport(req.query);
  if (!report) return res.status(503).json({ error: 'The local Sales Performance database is unavailable.', path: getSptReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(report);
});

app.get('/api/reports/commercial-sales/meta', (_req, res) => {
  const meta = getCommercialSalesReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'The local commercial database is unavailable.', path: getCommercialSalesReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/commercial-sales', (req, res) => {
  const report = buildCommercialSalesReport(req.query);
  if (!report) return res.status(503).json({ error: 'The local commercial database is unavailable.', path: getCommercialSalesReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(report);
});

app.get('/api/reports/general/meta', (_req, res) => {
  const meta = getGeneralReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'The local General Report database is unavailable.', path: getGeneralReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/general', (req, res) => {
  const report = buildGeneralReport(req.query);
  if (!report) return res.status(503).json({ error: 'The local General Report database is unavailable.', path: getGeneralReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(report);
});

app.get('/api/reports/mars/meta', (_req, res) => {
  const meta = getMarsReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'The local Orbit Nutrition database is unavailable.', path: getMarsReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/mars', (req, res) => {
  const report = buildMarsReport(req.query);
  if (!report) return res.status(503).json({ error: 'The local Orbit Nutrition database is unavailable.', path: getMarsReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(report);
});

app.get('/api/reports/nutripet/meta', (_req, res) => {
  const meta = getNutriPetReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'The local Nova Pet database is unavailable.', path: getNutriPetReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/nutripet', (req, res) => {
  const report = buildNutriPetReport(req.query);
  if (!report) return res.status(503).json({ error: 'The local Nova Pet database is unavailable.', path: getNutriPetReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(report);
});

app.get('/api/reports/baires/meta', (_req, res) => {
  const meta = getBairesReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'The local Harbor Portfolio database is unavailable.', path: getBairesReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/baires', (req, res) => {
  const report = buildBairesReport(req.query);
  if (!report) return res.status(503).json({ error: 'The local Harbor Portfolio database is unavailable.', path: getBairesReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(report);
});

app.get('/api/reports/non-buyers/meta', (_req, res) => {
  const meta = getNonBuyerReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'The local dormant-account database is unavailable.', path: getNonBuyerReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/non-buyers', (req, res) => {
  const report = buildNonBuyerReport(req.query);
  if (!report) return res.status(503).json({ error: 'The local dormant-account database is unavailable.', path: getNonBuyerReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(report);
});

app.get('/api/reports/pending-balances/meta', (_req, res) => {
  const meta = getPendingBalancesReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'The local pending-balances database is unavailable.', path: getPendingBalancesReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/pending-balances', (req, res) => {
  const report = buildPendingBalancesReport(req.query);
  if (!report) return res.status(503).json({ error: 'The local pending-balances database is unavailable.', path: getPendingBalancesReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(report);
});

app.get('/api/admin/sales/meta', (_req, res) => {
  const meta = getSalesExplorerMeta();
  if (!meta.available) return res.status(503).json({ error: 'The local sales-explorer database is unavailable.', path: getSalesExplorerPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/admin/sales', (req, res) => {
  const report = buildSalesExplorer(req.query);
  if (!report) return res.status(503).json({ error: 'The local sales-explorer database is unavailable.', path: getSalesExplorerPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(report);
});

app.get('/api/admin/sales/document', (req, res) => {
  const key = String(req.query.key ?? '').trim().slice(0, 300);
  if (!key) return res.status(400).json({ error: 'A document identifier is required.' });
  const detail = getSalesExplorerDocument(key);
  return detail ? res.json(detail) : res.status(404).json({ error: 'Document not found in the commercial universe.' });
});

app.get('/api/invoices/detail', async (req, res) => {
  const id = String(req.query.id ?? '').trim().slice(0, 300);
  if (!id) return res.status(400).json({ error: 'A document identifier is required.' });
  const detail = buildInvoiceDetail(await loadSnapshot(), id);
  res.setHeader('Cache-Control', 'no-store');
  return detail ? res.json(detail) : res.status(404).json({ error: 'Document not found in the available local sources.' });
});

app.get('/api/invoices/pdf', async (req, res) => {
  const id = String(req.query.id ?? '').trim().slice(0, 300);
  if (!id) return res.status(400).json({ error: 'A document identifier is required.' });
  const detail = buildInvoiceDetail(await loadSnapshot(), id);
  if (!detail) return res.status(404).json({ error: 'Document not found in the available local sources.' });
  return sendDownload(res, () => exportInvoicePdf(res, detail));
});

app.get('/api/admin/sales/export', async (req, res) => {
  const format = String(req.query.format ?? 'csv');
  if (format === 'csv') return sendDownload(res, () => exportSalesCsv(res, req.query));
  if (format === 'xlsx') return sendDownload(res, () => exportSalesXlsx(res, req.query));
  return res.status(400).json({ error: 'Invalid format. Use csv or xlsx.' });
});

app.get('/api/client-trend-reviews', (req, res) => {
  const direction = String(req.query.direction ?? '') as ClientTrendDirection;
  if (direction && !clientTrendDirections.has(direction)) return res.status(400).json({ error: 'Invalid trend direction.' });
  return res.json({ reviews: listClientTrendReviews(direction || undefined) });
});

app.put('/api/client-trend-reviews/:clientId/:direction', async (req, res) => {
  const clientId = Number(req.params.clientId);
  const direction = String(req.params.direction) as ClientTrendDirection;
  const data = await loadSnapshot();
  if (!data.clients.some((client) => client.id === clientId)) return res.status(404).json({ error: 'Customer not found.' });
  if (!clientTrendDirections.has(direction)) return res.status(400).json({ error: 'Invalid trend direction.' });
  const review = setClientTrendReviewed(clientId, direction, req.body?.reviewed !== false);
  return res.json({ review });
});

app.get('/api/admin/receivables', (req, res) => {
  const payload = buildReceivablesDashboard(req.query);
  if (!payload) return res.status(503).json({ error: 'The consolidated accounts-receivable database is unavailable.' });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(payload);
});

app.get('/api/admin/receivables/export', async (req, res) => {
  const format = String(req.query.format ?? 'csv');
  if (format === 'csv') return sendDownload(res, () => exportReceivablesCsv(res, req.query));
  if (format === 'xlsx') return sendDownload(res, () => exportReceivablesXlsx(res, req.query));
  return res.status(400).json({ error: 'Invalid format. Use csv or xlsx.' });
});

app.get('/api/admin/receivables/:clientId', async (req, res) => {
  const clientId = Number(req.params.clientId);
  const data = await loadSnapshot();
  if (!data.clients.some((client) => client.id === clientId)) return res.status(404).json({ error: 'Customer not found.' });
  return res.json(getReceivableCaseDetail(clientId));
});

app.patch('/api/admin/receivables/:clientId', async (req, res) => {
  const clientId = Number(req.params.clientId);
  const data = await loadSnapshot();
  const client = data.clients.find((value) => value.id === clientId);
  if (!client) return res.status(404).json({ error: 'Customer not found.' });
  const status = String(req.body?.status ?? '');
  if (!RECEIVABLE_STATUSES.includes(status as typeof RECEIVABLE_STATUSES[number])) return res.status(400).json({ error: 'Invalid internal status.' });
  const nextFollowUpAt = req.body?.nextFollowUpAt ? validDate(req.body.nextFollowUpAt) : null;
  if (req.body?.nextFollowUpAt && !nextFollowUpAt) return res.status(400).json({ error: 'The follow-up date is invalid.' });
  const promiseAmount = status === 'promise' ? parseLocalizedNumber(req.body?.promiseAmount) : null;
  const promiseDueAt = status === 'promise' ? validDate(req.body?.promiseDueAt) : null;
  if (status === 'promise' && (promiseAmount == null || promiseAmount <= 0 || !promiseDueAt)) {
    return res.status(400).json({ error: 'Provide a valid amount and date for the promise.' });
  }
  const workflow = saveReceivableCase({
    clientId,
    responsible: String(req.body?.responsible ?? '').slice(0, 120),
    status: status as typeof RECEIVABLE_STATUSES[number],
    nextFollowUpAt,
    promiseAmount,
    promiseDueAt,
    actor: 'SMART Salice Office',
    comment: String(req.body?.comment ?? '').slice(0, 2000),
  });
  syncReceivablePaymentPromise(clientId, client.seller);
  return res.json({ workflow, detail: getReceivableCaseDetail(clientId) });
});

app.delete('/api/admin/receivables/:clientId/events/:eventId', async (req, res) => {
  const clientId = Number(req.params.clientId);
  const data = await loadSnapshot();
  const client = data.clients.find((value) => value.id === clientId);
  if (!client) return res.status(404).json({ error: 'Customer not found.' });
  const deleted = deleteReceivableCaseEvent(clientId, String(req.params.eventId), 'SMART Salice Office');
  if (deleted) syncReceivablePaymentPromise(clientId, client.seller);
  return deleted ? res.json(getReceivableCaseDetail(clientId)) : res.status(404).json({ error: 'Follow-up not found or already deleted.' });
});

app.post('/api/admin/receivables/:clientId/comments', async (req, res) => {
  const clientId = Number(req.params.clientId);
  const data = await loadSnapshot();
  if (!data.clients.some((client) => client.id === clientId)) return res.status(404).json({ error: 'Customer not found.' });
  const comment = String(req.body?.comment ?? '').trim().slice(0, 2000);
  if (!comment) return res.status(400).json({ error: 'Write a comment before saving.' });
  addReceivableComment(clientId, comment, 'SMART Salice Office');
  return res.status(201).json(getReceivableCaseDetail(clientId));
});

app.get('/api/admin/goals', (req, res) => {
  try {
    return res.json(getCommercialGoalsPayload(String(req.query.versionId ?? ''), String(req.query.month ?? '')));
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/admin/goals/export', async (req, res) => {
  const format = String(req.query.format ?? 'xlsx');
  const versionId = String(req.query.versionId ?? '') || undefined;
  const month = String(req.query.month ?? '') || undefined;
  if (format === 'xlsx') return sendDownload(res, () => exportGoalsXlsx(res, versionId, month));
  if (format === 'pdf') return sendDownload(res, () => exportGoalsPdf(res, versionId, month));
  return res.status(400).json({ error: 'Invalid format. Use xlsx or pdf.' });
});

app.post('/api/admin/goals/versions', (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'Provide a name for the new version.' });
  try {
    const version = createCommercialGoalVersion({
      name,
      notes: String(req.body?.notes ?? '').slice(0, 1000),
      cloneFromId: String(req.body?.cloneFromId ?? '') || undefined,
      actor: 'SMART Salice Office',
    });
    return res.status(201).json({ version });
  } catch (error) {
    return res.status(409).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/admin/goals/versions/:versionId/rows', (req, res) => {
  const month = String(req.body?.month ?? '');
  const kilos = optionalNonNegativeNumber(req.body?.kilos);
  const accounts = optionalNonNegativeNumber(req.body?.accounts);
  const invoicing = optionalNonNegativeNumber(req.body?.invoicing);
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'The month is invalid.' });
  if (kilos === undefined || accounts === undefined || invoicing === undefined) return res.status(400).json({ error: 'Values must be positive numbers or blank.' });
  if (kilos == null && accounts == null && invoicing == null) return res.status(400).json({ error: 'Provide at least one goal.' });
  try {
    const row = createCommercialGoalRow(String(req.params.versionId), {
      month,
      product: String(req.body?.product ?? '').slice(0, 160),
      seller: String(req.body?.seller ?? '').slice(0, 120),
      kilos,
      accounts,
      invoicing,
      actor: 'SMART Salice Office',
      comment: String(req.body?.comment ?? '').slice(0, 1000),
    });
    return res.status(201).json({ row });
  } catch (error) {
    return res.status(409).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.patch('/api/admin/goals/versions/:versionId/rows/:rowId', (req, res) => {
  const month = String(req.body?.month ?? '');
  const kilos = optionalNonNegativeNumber(req.body?.kilos);
  const accounts = optionalNonNegativeNumber(req.body?.accounts);
  const invoicing = optionalNonNegativeNumber(req.body?.invoicing);
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'The month is invalid.' });
  if (kilos === undefined || accounts === undefined || invoicing === undefined) return res.status(400).json({ error: 'Values must be positive numbers or blank.' });
  if (kilos == null && accounts == null && invoicing == null) return res.status(400).json({ error: 'Provide at least one goal.' });
  try {
    const row = updateCommercialGoalRow(String(req.params.versionId), String(req.params.rowId), {
      month,
      product: String(req.body?.product ?? '').slice(0, 160),
      seller: String(req.body?.seller ?? '').slice(0, 120),
      kilos,
      accounts,
      invoicing,
      actor: 'SMART Salice Office',
      comment: String(req.body?.comment ?? '').slice(0, 1000),
    });
    return row ? res.json({ row }) : res.status(404).json({ error: 'Goal not found.' });
  } catch (error) {
    return res.status(409).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.delete('/api/admin/goals/versions/:versionId/rows/:rowId', (req, res) => {
  try {
    const deleted = deleteCommercialGoalRow(String(req.params.versionId), String(req.params.rowId), 'SMART Salice Office');
    return deleted ? res.status(204).end() : res.status(404).json({ error: 'Goal not found.' });
  } catch (error) {
    return res.status(409).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/admin/goals/versions/:versionId/activate', (req, res) => {
  try {
    const version = activateCommercialGoalVersion(
      String(req.params.versionId), 'SMART Salice Office', String(req.body?.comment ?? '').slice(0, 1000),
    );
    return res.json({ version });
  } catch (error) {
    return res.status(409).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/saved-views', (req, res) => {
  const viewKey = String(req.query.viewKey ?? '');
  if (viewKey && !savedViewKeys.has(viewKey as SavedViewKey)) return res.status(400).json({ error: 'Invalid view.' });
  const normalizedViewKey = viewKey ? viewKey as SavedViewKey : undefined;
  return res.json({ views: listSavedViews(normalizedViewKey) });
});

app.post('/api/saved-views', (req, res) => {
  const viewKey = String(req.body?.viewKey ?? '') as SavedViewKey;
  const name = String(req.body?.name ?? '').trim().slice(0, 80);
  const filters = stringRecord(req.body?.filters);
  if (!savedViewKeys.has(viewKey) || !name || !filters) return res.status(400).json({ error: 'Invalid name, view, or filters.' });
  return res.status(201).json({ view: createSavedView({ viewKey, name, filters, favorite: Boolean(req.body?.favorite) }) });
});

app.patch('/api/saved-views/:id', (req, res) => {
  const filters = req.body?.filters == null ? undefined : stringRecord(req.body.filters);
  if (req.body?.filters != null && !filters) return res.status(400).json({ error: 'Invalid filters.' });
  const name = req.body?.name == null ? undefined : String(req.body.name).trim().slice(0, 80);
  if (req.body?.name != null && !name) return res.status(400).json({ error: 'The view name cannot be blank.' });
  const view = updateSavedView(String(req.params.id), {
    name,
    filters: filters ?? undefined,
    favorite: req.body?.favorite == null ? undefined : Boolean(req.body.favorite),
  });
  return view ? res.json({ view }) : res.status(404).json({ error: 'Saved view not found.' });
});

app.delete('/api/saved-views/:id', (req, res) => (
  deleteSavedView(String(req.params.id)) ? res.status(204).end() : res.status(404).json({ error: 'Saved view not found.' })
));

app.get('/api/system/status', async (_req, res) => {
  res.json({ ...operationalStatus(), backups: await getBackupCount(), operationalBackups: await countOperationalBackups() });
});

app.get('/api/system/data-health', async (_req, res) => {
  const data = await loadSnapshot();
  res.setHeader('Cache-Control', 'no-store');
  res.json(buildDataHealth(data, getSptReportMeta(), getPendingBalancesReportMeta(), operationalStatus(), new Date(), loadPlatformAuditSummary()));
});

app.get('/api/agenda', async (req, res) => {
  const date = validDate(req.query.date) || localDate();
  const seller = String(req.query.seller || '').trim().slice(0, 1000);
  const selectedSellers = decodeMultiFilter(seller);
  const data = await loadSnapshot();
  const activities = listActivities({ limit: 1000 });
  const promises = listPromises({ limit: 1000 });
  const items = listAgendaItems({ date, seller: selectedSellers.length === 1 ? selectedSellers[0] : undefined });
  res.json(buildAgendaPayload(data, date, seller, items, activities, promises));
});

app.get('/api/notifications', async (_req, res) => {
  const data = await loadSnapshot();
  const date = localDate();
  const items = buildNotifications(data, date, listPromises({ status: 'pending', dueThrough: date, limit: 200 }));
  res.json({ date, count: items.length, items });
});

app.get('/api/clients/:id/operations', async (req, res) => {
  const clientId = Number(req.params.id);
  const data = await loadSnapshot();
  if (!data.clients.some((client) => client.id === clientId)) return res.status(404).json({ error: 'Customer not found' });
  return res.json({
    activities: listActivities({ clientId, limit: 50 }),
    promises: listPromises({ clientId, limit: 50 }),
    agenda: listAgendaItems({ clientId, includeCancelled: false }).slice(0, 50),
    receivableEvents: listReceivableCaseEvents(clientId, 100),
  });
});

app.post('/api/activities', async (req, res) => {
  const data = await loadSnapshot();
  const clientId = Number(req.body?.clientId);
  const client = data.clients.find((item) => item.id === clientId);
  if (!client) return res.status(404).json({ error: 'Customer not found' });
  if (!client.active) return res.status(409).json({ error: 'The customer is inactive; commercial activity cannot enter the active agenda.' });
  const type = String(req.body?.type || '') as CommercialActivityType;
  const outcome = String(req.body?.outcome || '') as CommercialActivityOutcome;
  if (!activityTypes.has(type)) return res.status(400).json({ error: 'Invalid activity type' });
  if (!activityOutcomes.has(outcome)) return res.status(400).json({ error: 'Invalid activity outcome' });
  const occurredAt = req.body?.occurredAt ? validDateTime(req.body.occurredAt) : new Date().toISOString();
  if (!occurredAt) return res.status(400).json({ error: 'Invalid activity date and time' });
  const occurredDate = localDate(new Date(occurredAt));
  const nextActionAt = req.body?.nextActionAt ? validDate(req.body.nextActionAt) : null;
  if (req.body?.nextActionAt && !nextActionAt) return res.status(400).json({ error: 'Invalid next-action date' });
  if (nextActionAt && nextActionAt < occurredDate) return res.status(400).json({ error: 'The next action cannot be earlier than the activity' });
  if (outcome === 'rescheduled' && !nextActionAt) return res.status(400).json({ error: 'Provide the new date for a rescheduled activity' });
  const rawAmount = req.body?.amount == null || req.body.amount === '' ? null : parseLocalizedNumber(req.body.amount);
  if (rawAmount != null && (!Number.isFinite(rawAmount) || rawAmount < 0)) return res.status(400).json({ error: 'Invalid amount' });
  const amount = rawAmount === 0 ? null : rawAmount;
  const knownProducts = new Set(data.products.map((product) => product.id));
  const requestedProductIds: string[] = Array.isArray(req.body?.productIds)
    ? req.body.productIds.map((value: unknown) => String(value))
    : [];
  const productIds = [...new Set(requestedProductIds.filter((id) => knownProducts.has(id)))].slice(0, 20);
  let promise: { dueAt: string; amount: number; note: string } | null = null;
  if (outcome === 'promise') {
    const dueAt = validDate(req.body?.promise?.dueAt);
    const amount = parseLocalizedNumber(req.body?.promise?.amount);
    if (!dueAt || amount == null || amount <= 0) return res.status(400).json({ error: 'Provide a valid date and amount for the promise' });
    if (dueAt < occurredDate) return res.status(400).json({ error: 'The promise cannot be due before the activity' });
    promise = { dueAt, amount, note: String(req.body?.promise?.note || '').trim().slice(0, 500) };
  } else if (req.body?.promise) {
    return res.status(400).json({ error: 'Choose “Payment promise” as the outcome to save a promise' });
  }
  const result = createCommercialActivity({
    clientId,
    seller: client.seller,
    type,
    outcome,
    occurredAt,
    note: String(req.body?.note || '').trim().slice(0, 1000),
    amount,
    productIds,
    nextActionAt,
    agendaItemId: req.body?.agendaItemId ? String(req.body.agendaItemId).slice(0, 120) : null,
    promise,
  });
  return res.status(201).json(result);
});

app.post('/api/agenda', async (req, res) => {
  const data = await loadSnapshot();
  const clientId = Number(req.body?.clientId);
  const client = data.clients.find((item) => item.id === clientId);
  if (!client) return res.status(404).json({ error: 'Customer not found' });
  if (!client.active) return res.status(409).json({ error: 'The customer is inactive' });
  const scheduledFor = validDate(req.body?.scheduledFor);
  const actionType = String(req.body?.actionType || '') as CommercialActivityType;
  if (!scheduledFor || !activityTypes.has(actionType)) return res.status(400).json({ error: 'Invalid date or action type' });
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  if (!reason) return res.status(400).json({ error: 'Provide a task reason' });
  return res.status(201).json(createAgendaItem({ clientId, seller: client.seller, scheduledFor, actionType, reason }));
});

app.patch('/api/promises/:id', (req, res) => {
  const status = String(req.body?.status || '') as PaymentPromiseStatus;
  if (!promiseStatuses.has(status)) return res.status(400).json({ error: 'Invalid promise status' });
  const promise = updatePromiseStatus(String(req.params.id), status);
  if (!promise) return res.status(404).json({ error: 'Promise not found' });
  return res.json({ promise });
});

app.get('/api/clients/:id/recommendations', async (req, res) => {
  const data = await loadSnapshot();
  const client = data.clients.find((item) => item.id === Number(req.params.id));
  if (!client) return res.status(404).json({ error: 'Customer not found' });
  return res.json({ recommendations: recommendProducts(client, data.clients, data.products) });
});

app.post('/api/routes/optimize', async (req, res) => {
  const selectedIds = Array.isArray(req.body?.clientIds) ? req.body.clientIds.map(Number) : [];
  if (!selectedIds.length) return res.status(400).json({ error: 'Choose at least one customer' });
  const data = await loadSnapshot();
  const visitMinutes = Number(req.body?.visitMinutes);
  const maxWorkMinutes = Number(req.body?.maxWorkMinutes);
  return res.json(optimizeRoute(selectedIds, data.clients, {
    visitMinutes: Number.isFinite(visitMinutes) ? visitMinutes : undefined,
    maxWorkMinutes: Number.isFinite(maxWorkMinutes) ? maxWorkMinutes : undefined,
  }));
});

app.patch('/api/clients/:id/note', async (req, res) => {
  const note = String(req.body?.note || '').trim().slice(0, 500);
  const data = await loadSnapshot();
  const client = data.clients.find((item) => item.id === Number(req.params.id));
  if (!client) return res.status(404).json({ error: 'Customer not found' });
  saveClientNote(client.id, note);
  return res.json({ ok: true, note });
});

if (process.env.NODE_ENV === 'production') {
  const dist = resolve(process.cwd(), 'dist');
  app.use(express.static(dist));
  app.use((_req, res) => res.sendFile(resolve(dist, 'index.html')));
}

await ensureSnapshot();
rebuildAllReceivableCasesFromEvents();
const startupSnapshot = await loadSnapshot();
const startupClients = new Map(startupSnapshot.clients.map((client) => [client.id, client]));
for (const workflow of listReceivableCases()) {
  syncReceivablePaymentPromise(workflow.clientId, startupClients.get(workflow.clientId)?.seller ?? workflow.responsible);
}
acquireServerLock();
app.listen(port, host, () => {
  console.log(`SMART Salice v${APP_VERSION} is running at http://${host}:${port}`);
  console.log(`Synthetic snapshot: ${getSnapshotPath()}`);
  console.log(`Local operational data: ${getOperationalDatabasePath()}`);
});
