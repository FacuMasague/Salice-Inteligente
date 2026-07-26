import { readFileSync } from 'node:fs';
import type { DashboardData, PendingBalanceReportMeta, SptReportMeta } from '../shared/models.js';
import { evaluateFreshness, type DataHealthLevel, type DataHealthPayload, type PlatformAuditSummary, type RefreshRunSummary } from '../shared/data-health.js';
import { resolveActiveDataPaths } from './data-bundle.js';

interface OperationalStatusInput {
  refresh?: {
    current: RefreshRunSummary | null;
    lastAttempt: RefreshRunSummary | null;
    lastSuccess: RefreshRunSummary | null;
    recent: RefreshRunSummary[];
  };
}

function ratio(value: number, total: number) {
  return total > 0 ? value / total * 100 : 0;
}

export function buildDataHealth(
  snapshot: DashboardData,
  spt: SptReportMeta,
  pending: PendingBalanceReportMeta,
  operations: OperationalStatusInput,
  now = new Date(),
  quality: PlatformAuditSummary | null = null,
): DataHealthPayload {
  const warningAfter = Number(process.env.SALICE_FRESHNESS_WARNING_HOURS ?? 24);
  const staleAfter = Number(process.env.SALICE_FRESHNESS_STALE_HOURS ?? 48);
  const freshness = evaluateFreshness(snapshot.meta.generatedAt, now, warningAfter, staleAfter);
  const coverage = snapshot.meta.coverage;
  const activeClients = coverage?.activeClients ?? snapshot.clients.filter((client) => client.active).length;
  const activeGeocoded = coverage?.activeGeocodedClients ?? snapshot.clients.filter((client) => client.active && client.coordinates).length;
  const pricedProducts = coverage?.pricedProducts ?? snapshot.products.filter((product) => product.price > 0).length;
  const invoices = coverage?.invoices365d ?? 0;
  const validTerms = coverage?.creditTermInvoices ?? 0;
  const limitations: string[] = [];
  if (!coverage?.zoneLabelsAvailable) limitations.push('El maestro de zonas de GESI no está disponible; se conservan IDs o rótulos de respaldo.');
  if ((coverage?.omittedInvoiceDetails ?? 0) > 0) limitations.push(`GESI omitió el detalle de ${coverage?.omittedInvoiceDetails} factura(s) del snapshot operativo.`);
  if (spt.unavailableDocumentCount > 0) limitations.push(`${spt.unavailableDocumentCount} comprobante(s) no tienen detalle en la base comercial histórica.`);
  if ((coverage?.activePortfolioReviewClients ?? 0) > 0) limitations.push(`${coverage?.activePortfolioReviewClients} clientes activos requieren confirmar pertenencia a la cartera Salice.`);
  if ((coverage?.correctedLocationClients ?? 0) > 0) limitations.push(`${coverage?.correctedLocationClients} ubicaciones incompatibles con GESI se muestran como referencias aproximadas y trazables de su localidad.`);
  if ((coverage?.locationReviewClients ?? 0) > 0) limitations.push(`${coverage?.locationReviewClients} ubicaciones quedaron fuera del mapa hasta poder confirmar su localidad.`);

  let overall: DataHealthLevel = freshness.level === 'stale' ? 'stale' : freshness.level === 'unknown' ? 'unavailable' : 'healthy';
  if (!spt.available || !pending.available) overall = 'unavailable';
  else if (quality?.status === 'failed') overall = 'unavailable';
  else if (overall === 'healthy' && (freshness.level === 'attention' || limitations.length)) overall = 'attention';

  const sptLevel: DataHealthLevel = spt.available ? (spt.unavailableDocumentCount ? 'attention' : 'healthy') : 'unavailable';
  const pendingLevel: DataHealthLevel = pending.available ? 'healthy' : 'unavailable';
  const snapshotLevel: DataHealthLevel = freshness.level === 'stale' ? 'stale' : freshness.level === 'unknown' ? 'unavailable' : freshness.level === 'attention' ? 'attention' : 'healthy';

  return {
    generatedAt: now.toISOString(),
    overall,
    freshness,
    sources: [
      {
        id: 'snapshot', label: 'Snapshot operativo', level: snapshotLevel,
        capturedAt: snapshot.meta.generatedAt, coverageFrom: '', coverageThrough: snapshot.meta.generatedAt.slice(0, 10),
        records: snapshot.clients.length + snapshot.products.length,
        detail: `${snapshot.clients.length} clientes · ${snapshot.products.length} productos`,
      },
      {
        id: 'commercial', label: 'Base comercial', level: sptLevel,
        capturedAt: snapshot.meta.generatedAt, coverageFrom: spt.coverageFrom, coverageThrough: spt.maxDate,
        records: spt.rowCount,
        detail: `${spt.rowCount} movimientos · ${spt.sourceDocumentCount} comprobantes fuente`,
      },
      {
        id: 'pending-balances', label: 'Saldos pendientes', level: pendingLevel,
        capturedAt: pending.capturedAt, coverageFrom: pending.salesFrom, coverageThrough: pending.asOfDate,
        records: pending.documentCount,
        detail: `${pending.clientCount} clientes · ${pending.documentCount} documentos abiertos`,
      },
      {
        id: 'platform-audit', label: 'Auditoría cruzada',
        level: quality ? (quality.status === 'failed' ? 'unavailable' : quality.status === 'passed_with_warnings' ? 'attention' : 'healthy') : 'unavailable',
        capturedAt: quality?.generatedAt ?? '', coverageFrom: '', coverageThrough: quality?.generatedAt.slice(0, 10) ?? '',
        records: quality?.total ?? 0,
        detail: quality ? `${quality.passed}/${quality.total} controles aprobados · ${quality.warnings} salvedades` : 'Todavía no se ejecutó audit:platform',
      },
    ],
    coverage: {
      activeGeocodedRate: ratio(activeGeocoded, activeClients),
      pricedProductRate: ratio(pricedProducts, snapshot.products.length),
      validCreditTermRate: ratio(validTerms, invoices),
      omittedInvoiceDetails: coverage?.omittedInvoiceDetails ?? 0,
      portfolioReviewClients: coverage?.activePortfolioReviewClients ?? 0,
    },
    limitations,
    quality,
    refresh: operations.refresh ?? { current: null, lastAttempt: null, lastSuccess: null, recent: [] },
  };
}

export function loadPlatformAuditSummary(path = resolveActiveDataPaths().platformAudit): PlatformAuditSummary | null {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as {
      generatedAt?: string;
      sourceSnapshotAt?: string;
      status?: PlatformAuditSummary['status'];
      summary?: Omit<PlatformAuditSummary, 'generatedAt' | 'sourceSnapshotAt' | 'status'>;
    };
    if (!value.generatedAt || !value.sourceSnapshotAt || !value.status || !value.summary) return null;
    return { generatedAt: value.generatedAt, sourceSnapshotAt: value.sourceSnapshotAt, status: value.status, ...value.summary };
  } catch {
    return null;
  }
}
