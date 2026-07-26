import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { resolve } from 'node:path';
import { optimizeDeliveryRoute, recommendProducts } from '../shared/algorithms.js';
import { buildProductClientOpportunities, isCommercialOpportunityEligible } from '../shared/commercial-opportunities.js';
import {
  APP_VERSION,
  SAVED_VIEW_KEYS,
  type Client,
  type ClientTrendDirection,
  type CommercialActivityType,
  type PaymentPromiseStatus,
  type SavedViewKey,
  type SavedViewPurpose,
  type VectorKey,
} from '../shared/models.js';
import { VECTOR_KEYS } from '../shared/product-vectors.js';
import { parseLocalizedNumber } from '../shared/localized-number.js';
import type { AiFeedbackRating } from '../shared/ai.js';
import { REPORT_ENDPOINT_METRICS } from '../shared/metric-links.js';
import { metricCatalogSummary } from '../shared/metrics.js';
import { classifyInventoryProduct, type InventoryExceptionType, type InventoryReviewStatus } from '../shared/inventory-decisions.js';
import { buildCommercialInbox, buildNotifications } from './agenda.js';
import { buildBairesReport, getBairesReportMeta, getBairesReportPath } from './baires-report.js';
import { buildCommercialSalesReport, getCommercialSalesReportMeta, getCommercialSalesReportPath } from './commercial-sales-report.js';
import { buildDataHealth, loadPlatformAuditSummary } from './data-health.js';
import { loadExecutiveSummary } from './executive-summary.js';
import { buildGeneralReport, getGeneralReportMeta, getGeneralReportPath } from './general-report.js';
import { buildMarsReport, getMarsReportMeta, getMarsReportPath } from './mars-report.js';
import { buildNonBuyerReport, getNonBuyerReportMeta, getNonBuyerReportPath } from './non-buyers-report.js';
import { buildPendingBalancesReport, getPendingBalancesReportMeta, getPendingBalancesReportPath } from './pending-balances-report.js';
import { buildNutriPetReport, getNutriPetReportMeta, getNutriPetReportPath } from './nutripet-report.js';
import { buildProductDemandAnalysis, getProductDemandAnalysisPath } from './product-demand-analysis.js';
import { buildProductPriceAnalysis, buildProductPriceDetail, getProductPriceAnalysisPath } from './product-price-analysis.js';
import { initializeProductPriceHistory } from './product-price-history.js';
import { ensureSnapshot, getBackupCount, getSnapshotPath, loadSnapshot } from './store.js';
import { buildSptReport, getSptReportMeta, getSptReportPath } from './spt-report.js';
import { buildSalesExplorer, getSalesExplorerDocument, getSalesExplorerMeta, getSalesExplorerPath } from './sales-explorer.js';
import { buildReceivablesDashboard, getReceivableCaseDetail, RECEIVABLE_STATUSES } from './receivables-dashboard.js';
import { exportGoalsPdf, exportGoalsXlsx, exportInvoicePdf, exportReceivablesCsv, exportReceivablesXlsx, exportSalesCsv, exportSalesXlsx } from './admin-exports.js';
import { exportReportXlsx, type ReportExportId } from './report-exports.js';
import { buildInvoiceDetail } from './invoice-detail.js';
import { acquireServerLock } from './runtime-lock.js';
import { manualRefreshProcessStatus, startManualRefresh } from './manual-refresh-runner.js';
import { countOperationalBackups } from './operations-backup.js';
import { auditStoredAiArtifacts, getAiSystemStatus } from './ai-enrichment.js';
import {
  attachCommercialExplanations,
  getExecutiveBrief,
  getReportNarrative,
  getSellerSummaries,
} from './ai-artifacts.js';
import type { AiReportId } from './ai-functions.js';
import { AiStore, prepareAiSchema } from './ai-store.js';
import {
  activateCommercialGoalVersion,
  addReceivableComment,
  createCommercialGoalRow,
  createCommercialGoalVersion,
  createSavedView,
  createCommercialOpportunityLink,
  deleteCommercialGoalRow,
  deleteCommercialOpportunityNote,
  deleteReceivableCaseEvent,
  deleteSavedView,
  getCommercialGoalsPayload,
  getSavedView,
  createCommercialNote,
  getOperationalDatabasePath,
  listActivities,
  listCommercialGoals,
  listAgendaItems,
  listClientTrendReviews,
  listInventoryAlertReviews,
  listInventoryAlertReviewEvents,
  listProductVectorCorrectionEvents,
  listProductVectorCorrections,
  listPromises,
  listReceivableCases,
  listReceivableCaseEvents,
  operationalStatus,
  rebuildAllReceivableCasesFromEvents,
  reconcileInventoryAlertReviews,
  saveClientNote,
  saveReceivableCase,
  setClientTrendReviewed,
  saveInventoryAlertReview,
  saveProductVectorCorrection,
  removeProductVectorCorrection,
  syncReceivablePaymentPromise,
  listSavedViews,
  listCommercialOpportunityLinks,
  updateCommercialGoalRow,
  updateSavedView,
  updatePromiseStatus,
} from './operational-store.js';

const app = express();
const port = Number(process.env.PORT || 8787);
const commercialNoteTypes = new Set<CommercialActivityType>(['note', 'visit', 'call', 'offer']);
const promiseStatuses = new Set<PaymentPromiseStatus>(['pending', 'kept', 'broken', 'cancelled']);
const clientTrendDirections = new Set<ClientTrendDirection>(['growth', 'decline']);
const inventoryReviewStatuses = new Set<InventoryReviewStatus>(['unreviewed', 'in_review', 'reviewed']);
const inventoryExceptionTypes = new Set<InventoryExceptionType>(['none', 'seasonal', 'discontinued', 'reserved_stock']);
const vectorKeys = new Set<VectorKey>(VECTOR_KEYS);
const savedViewKeys = new Set<SavedViewKey>(SAVED_VIEW_KEYS);
const savedViewPurposes = new Set<SavedViewPurpose>(['general', 'client_recovery', 'collections', 'product_opportunities']);
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

async function withReportNarrative<T extends object>(reportId: AiReportId, report: T) {
  const snapshotAt = (await loadSnapshot()).meta.generatedAt;
  return {
    ...report,
    aiNarrative: getReportNarrative(reportId, report, snapshotAt),
  };
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
  const data = await loadSnapshot();
  const summary = await loadExecutiveSummary(data);
  res.json({
    ...data,
    executiveSummary: summary ? { ...summary, aiBrief: getExecutiveBrief(summary) } : null,
  });
});

app.get('/api/products/demand-analysis', async (req, res) => {
  const data = await loadSnapshot();
  const analysis = buildProductDemandAnalysis(data.products, req.query as Record<string, unknown>);
  if (!analysis) return res.status(503).json({ error: 'La base comercial para demanda y rotación todavía no fue construida.', path: getProductDemandAnalysisPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(analysis);
});

app.get('/api/products/price-analysis', async (req, res) => {
  const data = await loadSnapshot();
  const analysis = buildProductPriceAnalysis(data.products, data.meta.generatedAt, req.query as Record<string, unknown>);
  if (!analysis) return res.status(503).json({ error: 'La base comercial para precios efectivos todavía no fue construida.', path: getProductPriceAnalysisPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(analysis);
});

app.get('/api/products/:id/price-history', async (req, res) => {
  const data = await loadSnapshot();
  const product = data.products.find((item) => item.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
  const detail = buildProductPriceDetail(product, data.meta.generatedAt, req.query as Record<string, unknown>);
  if (!detail) return res.status(503).json({ error: 'La base comercial para precios efectivos todavía no fue construida.', path: getProductPriceAnalysisPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(detail);
});

app.get('/api/metrics/catalog', (_req, res) => {
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.json(metricCatalogSummary());
});

app.get('/api/reports/executive-summary', async (_req, res) => {
  const data = await loadSnapshot();
  const summary = await loadExecutiveSummary(data);
  if (!summary) return res.status(503).json({ error: 'El resumen inicial no puede construirse porque falta al menos una de sus fuentes analíticas.' });
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ ...summary, aiBrief: getExecutiveBrief(summary) });
});

app.get('/api/reports/spt/meta', (_req, res) => {
  const meta = getSptReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'La base analítica SPT de GESI todavía no fue construida.', path: getSptReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/spt', async (req, res) => {
  const report = buildSptReport(req.query);
  if (!report) return res.status(503).json({ error: 'La base analítica SPT de GESI todavía no fue construida.', path: getSptReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(await withReportNarrative('spt', report));
});

app.get('/api/reports/commercial-sales/meta', (_req, res) => {
  const meta = getCommercialSalesReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'La base comercial de GESI todavía no fue construida.', path: getCommercialSalesReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/commercial-sales', async (req, res) => {
  const report = buildCommercialSalesReport(req.query);
  if (!report) return res.status(503).json({ error: 'La base comercial de GESI todavía no fue construida.', path: getCommercialSalesReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(await withReportNarrative('commercial-sales', report));
});

app.get('/api/reports/general/meta', (_req, res) => {
  const meta = getGeneralReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'La base del Reporte General todavía no fue construida.', path: getGeneralReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/general', async (req, res) => {
  const report = buildGeneralReport(req.query);
  if (!report) return res.status(503).json({ error: 'La base del Reporte General todavía no fue construida.', path: getGeneralReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(await withReportNarrative('general', report));
});

app.get('/api/reports/mars/meta', (_req, res) => {
  const meta = getMarsReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'La base Mars de GESI todavía no fue construida.', path: getMarsReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/mars', async (req, res) => {
  const report = buildMarsReport(req.query);
  if (!report) return res.status(503).json({ error: 'La base Mars de GESI todavía no fue construida.', path: getMarsReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(await withReportNarrative('mars', report));
});

app.get('/api/reports/nutripet/meta', (_req, res) => {
  const meta = getNutriPetReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'La base NutriPet de GESI todavía no fue construida.', path: getNutriPetReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/nutripet', async (req, res) => {
  const report = buildNutriPetReport(req.query);
  if (!report) return res.status(503).json({ error: 'La base NutriPet de GESI todavía no fue construida.', path: getNutriPetReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(await withReportNarrative('nutripet', report));
});

app.get('/api/reports/baires/meta', (_req, res) => {
  const meta = getBairesReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'La base Baires de GESI todavía no fue construida.', path: getBairesReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/baires', async (req, res) => {
  const report = buildBairesReport(req.query);
  if (!report) return res.status(503).json({ error: 'La base Baires de GESI todavía no fue construida.', path: getBairesReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(await withReportNarrative('baires', report));
});

app.get('/api/reports/non-buyers/meta', (_req, res) => {
  const meta = getNonBuyerReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'La base de cuentas no compradoras todavía no fue construida.', path: getNonBuyerReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/non-buyers', async (req, res) => {
  const report = buildNonBuyerReport(req.query);
  if (!report) return res.status(503).json({ error: 'La base de cuentas no compradoras todavía no fue construida.', path: getNonBuyerReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(await withReportNarrative('non-buyers', report));
});

app.get('/api/reports/pending-balances/meta', (_req, res) => {
  const meta = getPendingBalancesReportMeta();
  if (!meta.available) return res.status(503).json({ error: 'La base de Saldos Pendientes todavía no fue construida.', path: getPendingBalancesReportPath() });
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json(meta);
});

app.get('/api/reports/pending-balances', async (req, res) => {
  const report = buildPendingBalancesReport(req.query);
  if (!report) return res.status(503).json({ error: 'La base de Saldos Pendientes todavía no fue construida.', path: getPendingBalancesReportPath() });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(await withReportNarrative('pending-balances', report));
});

const reportExportIds = new Set<ReportExportId>(['spt', 'mars', 'nutripet', 'baires', 'non-buyers']);

app.get('/api/reports/export/:reportId', async (req, res) => {
  const reportId = String(req.params.reportId) as ReportExportId;
  if (!reportExportIds.has(reportId)) return res.status(404).json({ error: 'El reporte solicitado no posee una exportación propia.' });
  return sendDownload(res, () => exportReportXlsx(res, reportId, req.query));
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

app.get('/api/invoices/detail', async (req, res) => {
  const id = String(req.query.id ?? '').trim().slice(0, 300);
  if (!id) return res.status(400).json({ error: 'Falta identificar el comprobante.' });
  const detail = buildInvoiceDetail(await loadSnapshot(), id);
  res.setHeader('Cache-Control', 'no-store');
  return detail ? res.json(detail) : res.status(404).json({ error: 'Comprobante no encontrado en las fuentes disponibles.' });
});

app.get('/api/invoices/pdf', async (req, res) => {
  const id = String(req.query.id ?? '').trim().slice(0, 300);
  if (!id) return res.status(400).json({ error: 'Falta identificar el comprobante.' });
  const detail = buildInvoiceDetail(await loadSnapshot(), id);
  if (!detail) return res.status(404).json({ error: 'Comprobante no encontrado en las fuentes disponibles.' });
  return sendDownload(res, () => exportInvoicePdf(res, detail));
});

app.get('/api/admin/sales/export', async (req, res) => {
  const format = String(req.query.format ?? 'csv');
  if (format === 'csv') return sendDownload(res, () => exportSalesCsv(res, req.query));
  if (format === 'xlsx') return sendDownload(res, () => exportSalesXlsx(res, req.query));
  return res.status(400).json({ error: 'Formato inválido. Usá csv o xlsx.' });
});

app.get('/api/client-trend-reviews', (req, res) => {
  const direction = String(req.query.direction ?? '') as ClientTrendDirection;
  if (direction && !clientTrendDirections.has(direction)) return res.status(400).json({ error: 'Evolución inválida.' });
  return res.json({ reviews: listClientTrendReviews(direction || undefined) });
});

app.put('/api/client-trend-reviews/:clientId/:direction', async (req, res) => {
  const clientId = Number(req.params.clientId);
  const direction = String(req.params.direction) as ClientTrendDirection;
  const data = await loadSnapshot();
  if (!data.clients.some((client) => client.id === clientId)) return res.status(404).json({ error: 'Cliente no encontrado.' });
  if (!clientTrendDirections.has(direction)) return res.status(400).json({ error: 'Evolución inválida.' });
  const review = setClientTrendReviewed(clientId, direction, req.body?.reviewed !== false);
  return res.json({ review });
});

app.get('/api/inventory-alert-reviews', (_req, res) => {
  return loadSnapshot().then((data) => {
    reconcileInventoryAlertReviews(data.products, data.meta.generatedAt);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ reviews: listInventoryAlertReviews() });
  });
});

app.get('/api/inventory-alert-reviews/:productId/events', async (req, res) => {
  const productId = String(req.params.productId ?? '').trim().slice(0, 160);
  const data = await loadSnapshot();
  if (!data.products.some((product) => product.id === productId)) return res.status(404).json({ error: 'Producto no encontrado.' });
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ events: listInventoryAlertReviewEvents(productId) });
});

app.put('/api/inventory-alert-reviews/:productId', async (req, res) => {
  const productId = String(req.params.productId ?? '').trim().slice(0, 160);
  const status = String(req.body?.status ?? '') as InventoryReviewStatus;
  const exceptionType = String(req.body?.exceptionType ?? 'none') as InventoryExceptionType;
  const data = await loadSnapshot();
  const product = data.products.find((item) => item.id === productId);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado.' });
  if (!inventoryReviewStatuses.has(status) || !inventoryExceptionTypes.has(exceptionType)) return res.status(400).json({ error: 'Estado o excepción inválidos.' });
  const review = saveInventoryAlertReview(productId, {
    status,
    exceptionType,
    note: String(req.body?.note ?? ''),
    actor: 'Oficina Salice',
    decisionStatus: classifyInventoryProduct(product, null).status,
    snapshotAt: data.meta.generatedAt,
  });
  return res.json({ review });
});

app.get('/api/product-vector-corrections/:productId', async (req, res) => {
  const productId = String(req.params.productId ?? '').trim().slice(0, 160);
  const data = await loadSnapshot();
  if (!data.products.some((product) => product.id === productId)) return res.status(404).json({ error: 'Producto no encontrado.' });
  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    corrections: listProductVectorCorrections(productId),
    history: listProductVectorCorrectionEvents(productId),
  });
});

app.put('/api/product-vector-corrections/:productId/:key', async (req, res) => {
  const productId = String(req.params.productId ?? '').trim().slice(0, 160);
  const key = String(req.params.key ?? '') as VectorKey;
  const value = Number(req.body?.value);
  const reason = String(req.body?.reason ?? '').trim();
  const data = await loadSnapshot();
  if (!data.products.some((product) => product.id === productId)) return res.status(404).json({ error: 'Producto no encontrado.' });
  if (!vectorKeys.has(key) || !Number.isFinite(value) || value < 0 || value > 100) return res.status(400).json({ error: 'Vector o valor inválido.' });
  if (reason.length < 5) return res.status(400).json({ error: 'Indicá un motivo de al menos 5 caracteres.' });
  const correction = saveProductVectorCorrection(productId, { key, value: Math.round(value), reason, actor: 'Oficina Salice' });
  return res.json({ correction });
});

app.delete('/api/product-vector-corrections/:productId/:key', async (req, res) => {
  const productId = String(req.params.productId ?? '').trim().slice(0, 160);
  const key = String(req.params.key ?? '') as VectorKey;
  const reason = String(req.body?.reason ?? '').trim();
  if (!vectorKeys.has(key)) return res.status(400).json({ error: 'Vector inválido.' });
  if (reason.length < 5) return res.status(400).json({ error: 'Indicá el motivo de la reversión.' });
  const event = removeProductVectorCorrection(productId, key, reason, 'Oficina Salice');
  if (!event) return res.status(404).json({ error: 'No existe una corrección activa para esa dimensión.' });
  return res.json({ event });
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
  const client = data.clients.find((value) => value.id === clientId);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado.' });
  const status = String(req.body?.status ?? '');
  if (!RECEIVABLE_STATUSES.includes(status as typeof RECEIVABLE_STATUSES[number])) return res.status(400).json({ error: 'Estado interno inválido.' });
  const nextFollowUpAt = req.body?.nextFollowUpAt ? validDate(req.body.nextFollowUpAt) : null;
  if (req.body?.nextFollowUpAt && !nextFollowUpAt) return res.status(400).json({ error: 'La fecha de seguimiento no es válida.' });
  const promiseAmount = status === 'promise' ? parseLocalizedNumber(req.body?.promiseAmount) : null;
  const promiseDueAt = status === 'promise' ? validDate(req.body?.promiseDueAt) : null;
  if (status === 'promise' && (promiseAmount == null || promiseAmount <= 0 || !promiseDueAt)) {
    return res.status(400).json({ error: 'Informá un importe y una fecha válidos para la promesa.' });
  }
  const workflow = saveReceivableCase({
    clientId,
    responsible: String(req.body?.responsible ?? '').slice(0, 120),
    status: status as typeof RECEIVABLE_STATUSES[number],
    nextFollowUpAt,
    promiseAmount,
    promiseDueAt,
    actor: 'Oficina Salice',
    comment: String(req.body?.comment ?? '').slice(0, 2000),
  });
  syncReceivablePaymentPromise(clientId, client.seller);
  return res.json({ workflow, detail: getReceivableCaseDetail(clientId) });
});

app.delete('/api/admin/receivables/:clientId/events/:eventId', async (req, res) => {
  const clientId = Number(req.params.clientId);
  const data = await loadSnapshot();
  const client = data.clients.find((value) => value.id === clientId);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado.' });
  const deleted = deleteReceivableCaseEvent(clientId, String(req.params.eventId), 'Oficina Salice');
  if (deleted) syncReceivablePaymentPromise(clientId, client.seller);
  return deleted ? res.json(getReceivableCaseDetail(clientId)) : res.status(404).json({ error: 'Seguimiento no encontrado o ya eliminado.' });
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

app.get('/api/admin/goals/progress', async (req, res) => {
  try {
    const payload = getCommercialGoalsPayload(String(req.query.versionId ?? ''), String(req.query.month ?? ''));
    const goals = listCommercialGoals(payload.selectedVersion.id);
    const modes = [
      { mode: 'core', label: 'Objetivos kilos' },
      { mode: 'strategic', label: 'Marcas estratégicas' },
      { mode: 'autoservice', label: 'Autoservicio' },
    ] as const;
    const reports = modes.map((item) => ({
      ...item,
      report: buildGeneralReport({ mode: item.mode, month: payload.selectedMonth }, goals),
    }));
    if (reports.some((item) => !item.report)) return res.status(503).json({ error: 'No se pudieron calcular los resultados de GESI.' });
    const data = await loadSnapshot();
    const activities = listActivities({
      from: `${payload.selectedMonth}-01`,
      to: `${payload.selectedMonth}-31T23:59:59.999Z`,
      limit: 10000,
    });
    const activityBySeller = new Map<string, { notes: number; clients: Set<number> }>();
    for (const activity of activities) {
      const current = activityBySeller.get(activity.seller) ?? { notes: 0, clients: new Set<number>() };
      current.notes += 1; current.clients.add(activity.clientId); activityBySeller.set(activity.seller, current);
    }
    const opportunitiesBySeller = new Map<string, number>();
    for (const client of data.clients.filter((value) => isCommercialOpportunityEligible(value) && value.commercialOpportunity >= 55)) {
      opportunitiesBySeller.set(client.seller, (opportunitiesBySeller.get(client.seller) ?? 0) + 1);
    }
    const core = reports[0].report!;
    const sellerNames = new Set([...core.sellers.map((row) => row.name), ...activityBySeller.keys(), ...opportunitiesBySeller.keys()]);
    return res.json({
      versionId: payload.selectedVersion.id,
      month: payload.selectedMonth,
      sourceMaxDate: core.sourceMaxDate,
      summaries: reports.map(({ mode, label, report }) => ({
        mode, label, unit: report!.unit, actual: report!.actual, target: report!.target,
        gap: report!.gap, completion: report!.completion, isPartial: report!.isPartial,
      })),
      sellers: [...sellerNames].sort((a, b) => a.localeCompare(b, 'es')).map((seller) => {
        const result = core.sellers.find((row) => row.name === seller);
        const activity = activityBySeller.get(seller);
        return {
          seller,
          actual: result?.actual ?? 0,
          target: result?.target ?? 0,
          gap: result?.gap ?? 0,
          completion: result?.completion ?? null,
          clientsWithNotes: activity?.clients.size ?? 0,
          notes: activity?.notes ?? 0,
          highOpportunityClients: opportunitiesBySeller.get(seller) ?? 0,
        };
      }),
      activity: {
        notes: activities.length,
        clientsWithNotes: new Set(activities.map((item) => item.clientId)).size,
        highOpportunityClients: [...opportunitiesBySeller.values()].reduce((sum, value) => sum + value, 0),
      },
    });
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
  if (viewKey && !savedViewKeys.has(viewKey as SavedViewKey)) return res.status(400).json({ error: 'Vista inválida.' });
  const normalizedViewKey = viewKey ? viewKey as SavedViewKey : undefined;
  const purpose = String(req.query.purpose ?? '');
  if (purpose && !savedViewPurposes.has(purpose as SavedViewPurpose)) return res.status(400).json({ error: 'Propósito de lista inválido.' });
  return res.json({ views: listSavedViews(normalizedViewKey, purpose ? purpose as SavedViewPurpose : undefined) });
});

app.post('/api/saved-views', (req, res) => {
  const viewKey = String(req.body?.viewKey ?? '') as SavedViewKey;
  const name = String(req.body?.name ?? '').trim().slice(0, 80);
  const filters = stringRecord(req.body?.filters);
  const purpose = String(req.body?.purpose ?? 'general') as SavedViewPurpose;
  if (!savedViewKeys.has(viewKey) || !savedViewPurposes.has(purpose) || !name || !filters) return res.status(400).json({ error: 'Nombre, vista, propósito o filtros inválidos.' });
  return res.status(201).json({ view: createSavedView({ viewKey, purpose, name, filters, favorite: Boolean(req.body?.favorite) }) });
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
  const data = await loadSnapshot();
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ...operationalStatus(),
    backups: await getBackupCount(),
    operationalBackups: await countOperationalBackups(),
    ai: getAiSystemStatus(data.meta.generatedAt),
  });
});

const aiFeedbackRatings = new Set<AiFeedbackRating>(['useful', 'not_useful', 'incorrect', 'incomplete']);

app.get('/api/ai/artifacts/:artifactId/feedback', (req, res) => {
  const store = new AiStore();
  try {
    const artifact = store.artifactIdentity(String(req.params.artifactId));
    if (!artifact) return res.status(404).json({ error: 'Lectura de IA no encontrada.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      feedback: store.listFeedback(
        artifact.id,
        String(req.query.entityType ?? artifact.entity_type),
        String(req.query.entityId ?? artifact.entity_id),
      ),
    });
  } finally {
    store.close();
  }
});

app.post('/api/ai/artifacts/:artifactId/feedback', (req, res) => {
  const rating = String(req.body?.rating ?? '') as AiFeedbackRating;
  if (!aiFeedbackRatings.has(rating)) return res.status(400).json({ error: 'Elegí una valoración válida.' });
  const correction = String(req.body?.correction ?? '').trim();
  if (correction.length > 500) return res.status(400).json({ error: 'La corrección no puede superar 500 caracteres.' });
  if ((rating === 'incorrect' || rating === 'incomplete') && correction.length < 5) {
    return res.status(400).json({ error: 'Agregá una corrección breve para indicar qué falta o qué es incorrecto.' });
  }
  const store = new AiStore();
  try {
    const artifact = store.artifactIdentity(String(req.params.artifactId));
    if (!artifact) return res.status(404).json({ error: 'Lectura de IA no encontrada.' });
    const feedback = store.addFeedback({
      artifactId: artifact.id,
      snapshotAt: artifact.snapshot_at,
      promptVersion: artifact.prompt_version,
      rating,
      correction,
      subjectEntityType: String(req.body?.entityType ?? artifact.entity_type),
      subjectEntityId: String(req.body?.entityId ?? artifact.entity_id),
      actor: 'Oficina Salice',
    });
    return res.status(201).json({ feedback });
  } finally {
    store.close();
  }
});

app.get('/api/system/data-health', async (_req, res) => {
  const data = await loadSnapshot();
  res.setHeader('Cache-Control', 'no-store');
  res.json(buildDataHealth(data, getSptReportMeta(), getPendingBalancesReportMeta(), operationalStatus(), new Date(), loadPlatformAuditSummary()));
});

app.get('/api/system/refresh', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(manualRefreshProcessStatus());
});

app.post('/api/system/refresh', (_req, res) => {
  const operational = operationalStatus();
  if (operational.refresh.current || manualRefreshProcessStatus().running) {
    return res.status(409).json({
      error: 'Ya hay una actualización de GESI en curso.',
      ...manualRefreshProcessStatus(),
      refresh: operational.refresh.current,
    });
  }
  const result = startManualRefresh();
  return result.started
    ? res.status(202).json(result)
    : res.status(409).json({ error: 'No se pudo iniciar porque ya existe una actualización en curso.', ...result });
});

app.get('/api/agenda', async (req, res) => {
  const date = validDate(req.query.date) || localDate();
  const seller = String(req.query.seller || '').trim().slice(0, 1000);
  const data = await loadSnapshot();
  const activities = listActivities({ limit: 1000 });
  const promises = listPromises({ limit: 1000 });
  const items = listAgendaItems({ includeCancelled: false });
  const inbox = buildCommercialInbox(data, date, seller, items, activities, promises, listReceivableCases());
  res.json(attachCommercialExplanations(inbox, data.meta.generatedAt));
});

app.get('/api/ai/seller-summaries', async (_req, res) => {
  const data = await loadSnapshot();
  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    snapshotAt: data.meta.generatedAt,
    summaries: getSellerSummaries(data.meta.generatedAt),
  });
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
    receivableEvents: listReceivableCaseEvents(clientId, 100),
  });
});

app.post('/api/commercial-notes', async (req, res) => {
  const data = await loadSnapshot();
  const clientId = Number(req.body?.clientId);
  const client = data.clients.find((item) => item.id === clientId);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!client.active) return res.status(409).json({ error: 'El cliente está inactivo en GESI; agregá contexto histórico desde su nota general.' });
  const type = String(req.body?.type || 'note') as CommercialActivityType;
  if (!commercialNoteTypes.has(type)) return res.status(400).json({ error: 'Categoría de nota inválida' });
  const occurredAt = req.body?.occurredAt ? validDateTime(req.body.occurredAt) : new Date().toISOString();
  if (!occurredAt || occurredAt > new Date().toISOString()) return res.status(400).json({ error: 'La fecha y hora de la nota no son válidas' });
  const note = String(req.body?.note || '').trim().slice(0, 1000);
  if (!note) return res.status(400).json({ error: 'Escribí una nota breve sobre lo ocurrido fuera del sistema' });
  const result = createCommercialNote({
    clientId,
    seller: client.seller,
    type,
    occurredAt,
    note,
  });
  return res.status(201).json(result);
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
  return res.json({ recommendations: recommendProducts(client, data.clients, data.products, 12) });
});

app.get('/api/commercial-opportunity-links', (req, res) => {
  const clientId = req.query.clientId == null ? undefined : Number(req.query.clientId);
  if (clientId != null && !Number.isInteger(clientId)) return res.status(400).json({ error: 'Cliente inválido.' });
  return res.json({ links: listCommercialOpportunityLinks({
    clientId,
    productId: String(req.query.productId ?? '') || undefined,
    savedViewId: String(req.query.savedViewId ?? '') || undefined,
  }) });
});

app.post('/api/commercial-opportunity-links', async (req, res) => {
  const data = await loadSnapshot();
  const clientId = Number(req.body?.clientId);
  const productId = String(req.body?.productId ?? '');
  const client = data.clients.find((item) => item.id === clientId);
  const product = data.products.find((item) => item.id === productId);
  if (!client || !product) return res.status(404).json({ error: 'Cliente o producto no encontrado.' });
  if (!client.active || client.salesBlocked || client.sales90d <= 0) return res.status(409).json({ error: 'El cliente ya no es elegible para oportunidades comerciales.' });
  const recommendation = recommendProducts(client, data.clients, data.products, 100).find((item) => item.product.id === productId);
  if (!recommendation) return res.status(409).json({ error: 'La oportunidad ya no está respaldada por el snapshot activo.' });
  const savedViewId = String(req.body?.savedViewId ?? '') || null;
  const note = String(req.body?.note ?? '').trim().slice(0, 1000);
  if (!savedViewId && !note) return res.status(400).json({ error: 'Elegí una lista o escribí una nota.' });
  if (savedViewId) {
    const view = getSavedView(savedViewId);
    if (!view || view.purpose !== 'product_opportunities') return res.status(400).json({ error: 'La lista de oportunidades no es válida.' });
  }
  const noteResult = note ? createCommercialNote({
    clientId,
    seller: client.seller,
    type: 'note',
    occurredAt: new Date().toISOString(),
    note,
    productIds: [productId],
  }) : null;
  try {
    const link = createCommercialOpportunityLink({
      savedViewId,
      clientId,
      productId,
      recommendationKinds: recommendation.kinds,
      activityId: noteResult?.activity.id ?? null,
      snapshotAt: data.meta.generatedAt,
    });
    return res.status(201).json({ link, activity: noteResult?.activity ?? null });
  } catch (error) {
    if (String(error).includes('UNIQUE')) return res.status(409).json({ error: 'La oportunidad ya está vinculada a esa lista.' });
    throw error;
  }
});

app.delete('/api/clients/:clientId/opportunity-notes/:activityId', async (req, res) => {
  const clientId = Number(req.params.clientId);
  const data = await loadSnapshot();
  if (!data.clients.some((client) => client.id === clientId)) return res.status(404).json({ error: 'Cliente no encontrado.' });
  const activity = deleteCommercialOpportunityNote(String(req.params.activityId), clientId);
  if (!activity) return res.status(404).json({ error: 'La nota de oportunidad no existe o no está vinculada a productos.' });
  return res.json({ ok: true, activity });
});

app.get('/api/products/:id/client-opportunities', async (req, res) => {
  const data = await loadSnapshot();
  const product = data.products.find((item) => item.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
  return res.json({ opportunities: buildProductClientOpportunities(product, data.clients, data.products, data.clients.length) });
});

app.post('/api/routes/optimize', async (req, res) => {
  const orderedClientIds: number[] = Array.isArray(req.body?.clientIds)
    ? req.body.clientIds.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value))
    : [];
  const invoiceIds = Array.isArray(req.body?.invoiceIds) ? req.body.invoiceIds.map(String) : [];
  if (!orderedClientIds.length || !invoiceIds.length) return res.status(400).json({ error: 'Elegí al menos una parada con facturas.' });
  const data = await loadSnapshot();
  const selectedClients = orderedClientIds
    .map((clientId) => data.clients.find((client) => client.id === clientId))
    .filter((client): client is Client => client != null);
  const unsafeClients = selectedClients.filter((client) => !client.coordinates || client.locationPrecision === 'locality');
  if (unsafeClients.length) {
    return res.status(400).json({
      error: `No se puede calcular el recorrido: ${unsafeClients.length} cliente(s) no tienen una ubicación exacta verificada.`,
    });
  }
  const selectedInvoiceIDs = new Set(invoiceIds);
  const invoices = data.logistics.invoices.filter((invoice) => selectedInvoiceIDs.has(invoice.id) && orderedClientIds.includes(invoice.clientId));
  if (!invoices.length) return res.status(400).json({ error: 'Las facturas elegidas no pertenecen al snapshot logístico activo.' });
  const stopMinutes = Number(req.body?.stopMinutes);
  const maxWorkMinutes = Number(req.body?.maxWorkMinutes);
  const mode = req.body?.mode === 'manual' ? 'manual' : 'suggested';
  return res.json(optimizeDeliveryRoute(orderedClientIds, invoices, data.clients, {
    stopMinutes: Number.isFinite(stopMinutes) ? stopMinutes : undefined,
    maxWorkMinutes: Number.isFinite(maxWorkMinutes) ? maxWorkMinutes : undefined,
    mode,
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
  app.use('/api', (_req, res) => res.status(404).json({
    error: 'La función solicitada no está disponible en este proceso. Reiniciá Salice Inteligente para cargar la versión vigente.',
  }));
  app.use(express.static(dist));
  app.use((_req, res) => res.sendFile(resolve(dist, 'index.html')));
}

await ensureSnapshot();
await prepareAiSchema();
rebuildAllReceivableCasesFromEvents();
const startupSnapshot = await loadSnapshot();
auditStoredAiArtifacts(startupSnapshot.meta.generatedAt);
reconcileInventoryAlertReviews(startupSnapshot.products, startupSnapshot.meta.generatedAt);
await initializeProductPriceHistory(startupSnapshot);
const startupClients = new Map(startupSnapshot.clients.map((client) => [client.id, client]));
for (const workflow of listReceivableCases()) {
  syncReceivablePaymentPromise(workflow.clientId, startupClients.get(workflow.clientId)?.seller ?? workflow.responsible);
}
acquireServerLock();
app.listen(port, '127.0.0.1', () => {
  console.log(`Salice API v${APP_VERSION} en http://127.0.0.1:${port}`);
  console.log(`Snapshot persistente: ${getSnapshotPath()}`);
  console.log(`Datos operativos: ${getOperationalDatabasePath()}`);
});
