import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { resolve } from 'node:path';
import { recommendProducts, optimizeRoute } from '../shared/algorithms.js';
import {
  APP_VERSION,
  type CommercialActivityOutcome,
  type CommercialActivityType,
  type PaymentPromiseStatus,
} from '../shared/models.js';
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
import { exportGoalsPdf, exportGoalsXlsx, exportReceivablesCsv, exportReceivablesXlsx, exportSalesCsv, exportSalesXlsx } from './admin-exports.js';
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
  deleteSavedView,
  getCommercialGoalsPayload,
  createCommercialActivity,
  getOperationalDatabasePath,
  listActivities,
  listAgendaItems,
  listPromises,
  operationalStatus,
  saveClientNote,
  saveReceivableCase,
  listSavedViews,
  updateCommercialGoalRow,
  updateSavedView,
  updatePromiseStatus,
} from './operational-store.js';

const app = express();
const port = Number(process.env.PORT || 8787);
const activityTypes = new Set<CommercialActivityType>(['visit', 'call', 'collection', 'offer']);
const activityOutcomes = new Set<CommercialActivityOutcome>(['completed', 'sale', 'promise', 'no_contact', 'rescheduled', 'no_interest']);
const promiseStatuses = new Set<PaymentPromiseStatus>(['pending', 'kept', 'broken', 'cancelled']);
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
  const number = Number(value);
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
  if (!meta.available) return res.status(503).json({ error: 'La base analítica SPT de GESI todavía no fue construida.', path: getSptReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/spt', (req, res) => {
  const report = buildSptReport(req.query);
  if (!report) return res.status(503).json({ error: 'La base analítica SPT de GESI todavía no fue construida.', path: getSptReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(report);
});

app.get('/api/reports/commercial-sales/meta', (_req, res) => {
  const meta = getCommercialSalesReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'La base comercial de GESI todavía no fue construida.', path: getCommercialSalesReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/commercial-sales', (req, res) => {
  const report = buildCommercialSalesReport(req.query);
  if (!report) return res.status(503).json({ error: 'La base comercial de GESI todavía no fue construida.', path: getCommercialSalesReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(report);
});

app.get('/api/reports/general/meta', (_req, res) => {
  const meta = getGeneralReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'La base del Reporte General todavía no fue construida.', path: getGeneralReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/general', (req, res) => {
  const report = buildGeneralReport(req.query);
  if (!report) return res.status(503).json({ error: 'La base del Reporte General todavía no fue construida.', path: getGeneralReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(report);
});

app.get('/api/reports/mars/meta', (_req, res) => {
  const meta = getMarsReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'La base Mars de GESI todavía no fue construida.', path: getMarsReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/mars', (req, res) => {
  const report = buildMarsReport(req.query);
  if (!report) return res.status(503).json({ error: 'La base Mars de GESI todavía no fue construida.', path: getMarsReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(report);
});

app.get('/api/reports/nutripet/meta', (_req, res) => {
  const meta = getNutriPetReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'La base NutriPet de GESI todavía no fue construida.', path: getNutriPetReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/nutripet', (req, res) => {
  const report = buildNutriPetReport(req.query);
  if (!report) return res.status(503).json({ error: 'La base NutriPet de GESI todavía no fue construida.', path: getNutriPetReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(report);
});

app.get('/api/reports/baires/meta', (_req, res) => {
  const meta = getBairesReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'La base Baires de GESI todavía no fue construida.', path: getBairesReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/baires', (req, res) => {
  const report = buildBairesReport(req.query);
  if (!report) return res.status(503).json({ error: 'La base Baires de GESI todavía no fue construida.', path: getBairesReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(report);
});

app.get('/api/reports/non-buyers/meta', (_req, res) => {
  const meta = getNonBuyerReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'La base de cuentas no compradoras todavía no fue construida.', path: getNonBuyerReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/non-buyers', (req, res) => {
  const report = buildNonBuyerReport(req.query);
  if (!report) return res.status(503).json({ error: 'La base de cuentas no compradoras todavía no fue construida.', path: getNonBuyerReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(report);
});

app.get('/api/reports/pending-balances/meta', (_req, res) => {
  const meta = getPendingBalancesReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'La base de Saldos Pendientes todavía no fue construida.', path: getPendingBalancesReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/pending-balances', (req, res) => {
  const report = buildPendingBalancesReport(req.query);
  if (!report) return res.status(503).json({ error: 'La base de Saldos Pendientes todavía no fue construida.', path: getPendingBalancesReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(report);
});

app.get('/api/admin/sales/meta', (_req, res) => {
  const meta = getSalesExplorerMeta();
  if (!meta.available) return res.status(503).json({ error: 'La base del explorador de ventas todavía no fue construida.', path: getSalesExplorerPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/admin/sales', (req, res) => {
  const report = buildSalesExplorer(req.query);
  if (!report) return res.status(503).json({ error: 'La base del explorador de ventas todavía no fue construida.', path: getSalesExplorerPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(report);
});

app.get('/api/admin/sales/document', (req, res) => {
  const key = String(req.query.key ?? '').trim().slice(0, 300);
  if (!key) return res.status(400).json({ error: 'Falta identificar el comprobante.' });
  const detail = getSalesExplorerDocument(key);
  return detail ? res.json(detail) : res.status(404).json({ error: 'Comprobante no encontrado dentro del universo comercial.' });
});

app.get('/api/admin/sales/export', async (req, res) => {
  const format = String(req.query.format ?? 'csv');
  if (format === 'csv') return sendDownload(res, () => exportSalesCsv(res, req.query));
  if (format === 'xlsx') return sendDownload(res, () => exportSalesXlsx(res, req.query));
  return res.status(400).json({ error: 'Formato inválido. Usá csv o xlsx.' });
});

app.get('/api/admin/receivables', (req, res) => {
  const payload = buildReceivablesDashboard(req.query);
  if (!payload) return res.status(503).json({ error: 'La base consolidada de cuentas por cobrar todavía no fue construida.' });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(payload);
});

app.get('/api/admin/receivables/export', async (req, res) => {
  const format = String(req.query.format ?? 'csv');
  if (format === 'csv') return sendDownload(res, () => exportReceivablesCsv(res, req.query));
  if (format === 'xlsx') return sendDownload(res, () => exportReceivablesXlsx(res, req.query));
  return res.status(400).json({ error: 'Formato inválido. Usá csv o xlsx.' });
});

app.get('/api/admin/receivables/:clientId', async (req, res) => {
  const clientId = Number(req.params.clientId);
  const data = await loadSnapshot();
  if (!data.clients.some((client) => client.id === clientId)) return res.status(404).json({ error: 'Cliente no encontrado.' });
  return res.json(getReceivableCaseDetail(clientId));
});

app.patch('/api/admin/receivables/:clientId', async (req, res) => {
  const clientId = Number(req.params.clientId);
  const data = await loadSnapshot();
  if (!data.clients.some((client) => client.id === clientId)) return res.status(404).json({ error: 'Cliente no encontrado.' });
  const status = String(req.body?.status ?? '');
  if (!RECEIVABLE_STATUSES.includes(status as typeof RECEIVABLE_STATUSES[number])) return res.status(400).json({ error: 'Estado interno inválido.' });
  const nextFollowUpAt = req.body?.nextFollowUpAt ? validDate(req.body.nextFollowUpAt) : null;
  if (req.body?.nextFollowUpAt && !nextFollowUpAt) return res.status(400).json({ error: 'La fecha de seguimiento no es válida.' });
  const workflow = saveReceivableCase({
    clientId,
    responsible: String(req.body?.responsible ?? '').slice(0, 120),
    status: status as typeof RECEIVABLE_STATUSES[number],
    nextFollowUpAt,
    actor: 'Oficina Salice',
    comment: String(req.body?.comment ?? '').slice(0, 2000),
  });
  return res.json({ workflow, detail: getReceivableCaseDetail(clientId) });
});

app.post('/api/admin/receivables/:clientId/comments', async (req, res) => {
  const clientId = Number(req.params.clientId);
  const data = await loadSnapshot();
  if (!data.clients.some((client) => client.id === clientId)) return res.status(404).json({ error: 'Cliente no encontrado.' });
  const comment = String(req.body?.comment ?? '').trim().slice(0, 2000);
  if (!comment) return res.status(400).json({ error: 'Escribí un comentario antes de guardar.' });
  addReceivableComment(clientId, comment, 'Oficina Salice');
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
  return res.status(400).json({ error: 'Formato inválido. Usá xlsx o pdf.' });
});

app.post('/api/admin/goals/versions', (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'Indicá un nombre para la nueva versión.' });
  try {
    const version = createCommercialGoalVersion({
      name,
      notes: String(req.body?.notes ?? '').slice(0, 1000),
      cloneFromId: String(req.body?.cloneFromId ?? '') || undefined,
      actor: 'Oficina Salice',
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
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'El mes no es válido.' });
  if (kilos === undefined || accounts === undefined || invoicing === undefined) return res.status(400).json({ error: 'Los valores deben ser números positivos o quedar vacíos.' });
  if (kilos == null && accounts == null && invoicing == null) return res.status(400).json({ error: 'Indicá al menos un objetivo.' });
  try {
    const row = createCommercialGoalRow(String(req.params.versionId), {
      month,
      product: String(req.body?.product ?? '').slice(0, 160),
      seller: String(req.body?.seller ?? '').slice(0, 120),
      kilos,
      accounts,
      invoicing,
      actor: 'Oficina Salice',
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
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'El mes no es válido.' });
  if (kilos === undefined || accounts === undefined || invoicing === undefined) return res.status(400).json({ error: 'Los valores deben ser números positivos o quedar vacíos.' });
  if (kilos == null && accounts == null && invoicing == null) return res.status(400).json({ error: 'Indicá al menos un objetivo.' });
  try {
    const row = updateCommercialGoalRow(String(req.params.versionId), String(req.params.rowId), {
      month,
      product: String(req.body?.product ?? '').slice(0, 160),
      seller: String(req.body?.seller ?? '').slice(0, 120),
      kilos,
      accounts,
      invoicing,
      actor: 'Oficina Salice',
      comment: String(req.body?.comment ?? '').slice(0, 1000),
    });
    return row ? res.json({ row }) : res.status(404).json({ error: 'Objetivo no encontrado.' });
  } catch (error) {
    return res.status(409).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.delete('/api/admin/goals/versions/:versionId/rows/:rowId', (req, res) => {
  try {
    const deleted = deleteCommercialGoalRow(String(req.params.versionId), String(req.params.rowId), 'Oficina Salice');
    return deleted ? res.status(204).end() : res.status(404).json({ error: 'Objetivo no encontrado.' });
  } catch (error) {
    return res.status(409).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/admin/goals/versions/:versionId/activate', (req, res) => {
  try {
    const version = activateCommercialGoalVersion(
      String(req.params.versionId), 'Oficina Salice', String(req.body?.comment ?? '').slice(0, 1000),
    );
    return res.json({ version });
  } catch (error) {
    return res.status(409).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/saved-views', (req, res) => {
  const viewKey = String(req.query.viewKey ?? '');
  if (viewKey && !['sales-explorer', 'receivables'].includes(viewKey)) return res.status(400).json({ error: 'Vista inválida.' });
  const normalizedViewKey = viewKey ? viewKey as 'sales-explorer' | 'receivables' : undefined;
  return res.json({ views: listSavedViews(normalizedViewKey) });
});

app.post('/api/saved-views', (req, res) => {
  const viewKey = String(req.body?.viewKey ?? '') as 'sales-explorer' | 'receivables';
  const name = String(req.body?.name ?? '').trim().slice(0, 80);
  const filters = stringRecord(req.body?.filters);
  if (!['sales-explorer', 'receivables'].includes(viewKey) || !name || !filters) return res.status(400).json({ error: 'Nombre, vista o filtros inválidos.' });
  return res.status(201).json({ view: createSavedView({ viewKey, name, filters, favorite: Boolean(req.body?.favorite) }) });
});

app.patch('/api/saved-views/:id', (req, res) => {
  const filters = req.body?.filters == null ? undefined : stringRecord(req.body.filters);
  if (req.body?.filters != null && !filters) return res.status(400).json({ error: 'Filtros inválidos.' });
  const name = req.body?.name == null ? undefined : String(req.body.name).trim().slice(0, 80);
  if (req.body?.name != null && !name) return res.status(400).json({ error: 'El nombre de la vista no puede quedar vacío.' });
  const view = updateSavedView(String(req.params.id), {
    name,
    filters: filters ?? undefined,
    favorite: req.body?.favorite == null ? undefined : Boolean(req.body.favorite),
  });
  return view ? res.json({ view }) : res.status(404).json({ error: 'Vista guardada no encontrada.' });
});

app.delete('/api/saved-views/:id', (req, res) => (
  deleteSavedView(String(req.params.id)) ? res.status(204).end() : res.status(404).json({ error: 'Vista guardada no encontrada.' })
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
  if (!data.clients.some((client) => client.id === clientId)) return res.status(404).json({ error: 'Cliente no encontrado' });
  return res.json({
    activities: listActivities({ clientId, limit: 50 }),
    promises: listPromises({ clientId, limit: 50 }),
    agenda: listAgendaItems({ clientId, includeCancelled: false }).slice(0, 50),
  });
});

app.post('/api/activities', async (req, res) => {
  const data = await loadSnapshot();
  const clientId = Number(req.body?.clientId);
  const client = data.clients.find((item) => item.id === clientId);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!client.active) return res.status(409).json({ error: 'El cliente está inactivo en GESI; la gestión comercial no se puede agregar a la agenda activa.' });
  const type = String(req.body?.type || '') as CommercialActivityType;
  const outcome = String(req.body?.outcome || '') as CommercialActivityOutcome;
  if (!activityTypes.has(type)) return res.status(400).json({ error: 'Tipo de gestión inválido' });
  if (!activityOutcomes.has(outcome)) return res.status(400).json({ error: 'Resultado de gestión inválido' });
  const occurredAt = req.body?.occurredAt ? validDateTime(req.body.occurredAt) : new Date().toISOString();
  if (!occurredAt) return res.status(400).json({ error: 'La fecha y hora de la gestión no son válidas' });
  const occurredDate = localDate(new Date(occurredAt));
  const nextActionAt = req.body?.nextActionAt ? validDate(req.body.nextActionAt) : null;
  if (req.body?.nextActionAt && !nextActionAt) return res.status(400).json({ error: 'La fecha de próxima acción no es válida' });
  if (nextActionAt && nextActionAt < occurredDate) return res.status(400).json({ error: 'La próxima acción no puede quedar antes de la gestión' });
  if (outcome === 'rescheduled' && !nextActionAt) return res.status(400).json({ error: 'Indicá la nueva fecha para una gestión reprogramada' });
  const rawAmount = req.body?.amount == null || req.body.amount === '' ? null : Number(req.body.amount);
  if (rawAmount != null && (!Number.isFinite(rawAmount) || rawAmount < 0)) return res.status(400).json({ error: 'El importe no es válido' });
  const amount = rawAmount === 0 ? null : rawAmount;
  const knownProducts = new Set(data.products.map((product) => product.id));
  const requestedProductIds: string[] = Array.isArray(req.body?.productIds)
    ? req.body.productIds.map((value: unknown) => String(value))
    : [];
  const productIds = [...new Set(requestedProductIds.filter((id) => knownProducts.has(id)))].slice(0, 20);
  let promise: { dueAt: string; amount: number; note: string } | null = null;
  if (outcome === 'promise') {
    const dueAt = validDate(req.body?.promise?.dueAt);
    const amount = Number(req.body?.promise?.amount);
    if (!dueAt || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Indicá fecha e importe válidos para la promesa' });
    if (dueAt < occurredDate) return res.status(400).json({ error: 'La promesa no puede vencer antes de la gestión' });
    promise = { dueAt, amount, note: String(req.body?.promise?.note || '').trim().slice(0, 500) };
  } else if (req.body?.promise) {
    return res.status(400).json({ error: 'Elegí “Promesa de pago” como resultado para guardar una promesa' });
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
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!client.active) return res.status(409).json({ error: 'El cliente está inactivo en GESI' });
  const scheduledFor = validDate(req.body?.scheduledFor);
  const actionType = String(req.body?.actionType || '') as CommercialActivityType;
  if (!scheduledFor || !activityTypes.has(actionType)) return res.status(400).json({ error: 'Fecha o tipo de acción inválidos' });
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  if (!reason) return res.status(400).json({ error: 'Indicá el motivo de la tarea' });
  return res.status(201).json(createAgendaItem({ clientId, seller: client.seller, scheduledFor, actionType, reason }));
});

app.patch('/api/promises/:id', (req, res) => {
  const status = String(req.body?.status || '') as PaymentPromiseStatus;
  if (!promiseStatuses.has(status)) return res.status(400).json({ error: 'Estado de promesa inválido' });
  const promise = updatePromiseStatus(String(req.params.id), status);
  if (!promise) return res.status(404).json({ error: 'Promesa no encontrada' });
  return res.json({ promise });
});

app.get('/api/clients/:id/recommendations', async (req, res) => {
  const data = await loadSnapshot();
  const client = data.clients.find((item) => item.id === Number(req.params.id));
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
  return res.json({ recommendations: recommendProducts(client, data.clients, data.products) });
});

app.post('/api/routes/optimize', async (req, res) => {
  const selectedIds = Array.isArray(req.body?.clientIds) ? req.body.clientIds.map(Number) : [];
  if (!selectedIds.length) return res.status(400).json({ error: 'Elegí al menos un cliente' });
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
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
  saveClientNote(client.id, note);
  return res.json({ ok: true, note });
});

if (process.env.NODE_ENV === 'production') {
  const dist = resolve(process.cwd(), 'dist');
  app.use(express.static(dist));
  app.use((_req, res) => res.sendFile(resolve(dist, 'index.html')));
}

await ensureSnapshot();
acquireServerLock();
app.listen(port, '127.0.0.1', () => {
  console.log(`Salice API v${APP_VERSION} en http://127.0.0.1:${port}`);
  console.log(`Snapshot persistente: ${getSnapshotPath()}`);
  console.log(`Datos operativos: ${getOperationalDatabasePath()}`);
});
