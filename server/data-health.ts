import { readFileSync } from 'node:fs';
import type { DashboardData, PendingBalanceReportMeta, SptReportMeta } from '../shared/models.js';
import type { DataHealthLevel, DataHealthPayload, PlatformAuditSummary } from '../shared/data-health.js';
import { resolveActiveDataPaths } from './data-bundle.js';

function ratio(value: number, total: number) {
  return total > 0 ? value / total * 100 : 0;
}

export function buildDataHealth(
  snapshot: DashboardData,
  spt: SptReportMeta,
  pending: PendingBalanceReportMeta,
  _operations: unknown,
  now = new Date(),
  quality: PlatformAuditSummary | null = null,
): DataHealthPayload {
  const freshness = {
    level: 'current' as const,
    generatedAt: snapshot.meta.generatedAt,
    ageHours: null,
    warningAfterHours: 0,
    staleAfterHours: 0,
    label: 'Validated synthetic demo',
  };
  const coverage = snapshot.meta.coverage;
  const activeClients = coverage?.activeClients ?? snapshot.clients.filter((client) => client.active).length;
  const activeGeocoded = coverage?.activeGeocodedClients ?? snapshot.clients.filter((client) => client.active && client.coordinates).length;
  const pricedProducts = coverage?.pricedProducts ?? snapshot.products.filter((product) => product.price > 0).length;
  const invoices = coverage?.invoices365d ?? 0;
  const validTerms = coverage?.creditTermInvoices ?? 0;
  const limitations: string[] = [];
  if ((coverage?.omittedInvoiceDetails ?? 0) > 0) limitations.push(`${coverage?.omittedInvoiceDetails} fictional invoice details are intentionally unavailable.`);
  if (spt.unavailableDocumentCount > 0) limitations.push(`${spt.unavailableDocumentCount} documents have no detail in the local commercial database.`);
  if ((coverage?.activePortfolioReviewClients ?? 0) > 0) limitations.push(`${coverage?.activePortfolioReviewClients} active fictional customers require portfolio review.`);

  let overall: DataHealthLevel = 'healthy';
  if (!spt.available || !pending.available) overall = 'unavailable';
  else if (quality?.status === 'failed') overall = 'unavailable';
  else if (limitations.length) overall = 'attention';

  const sptLevel: DataHealthLevel = spt.available ? (spt.unavailableDocumentCount ? 'attention' : 'healthy') : 'unavailable';
  const pendingLevel: DataHealthLevel = pending.available ? 'healthy' : 'unavailable';
  const snapshotLevel: DataHealthLevel = 'healthy';

  return {
    generatedAt: now.toISOString(),
    overall,
    freshness,
    sources: [
      {
        id: 'snapshot', label: 'Operational snapshot', level: snapshotLevel,
        capturedAt: snapshot.meta.generatedAt, coverageFrom: '', coverageThrough: snapshot.meta.generatedAt.slice(0, 10),
        records: snapshot.clients.length + snapshot.products.length,
        detail: `${snapshot.clients.length} customers · ${snapshot.products.length} products`,
      },
      {
        id: 'commercial', label: 'Commercial database', level: sptLevel,
        capturedAt: snapshot.meta.generatedAt, coverageFrom: spt.coverageFrom, coverageThrough: spt.maxDate,
        records: spt.rowCount,
        detail: `${spt.rowCount} signed movements · ${spt.sourceDocumentCount} source documents`,
      },
      {
        id: 'pending-balances', label: 'Pending balances', level: pendingLevel,
        capturedAt: pending.capturedAt, coverageFrom: pending.salesFrom, coverageThrough: pending.asOfDate,
        records: pending.documentCount,
        detail: `${pending.clientCount} customers · ${pending.documentCount} open documents`,
      },
      {
        id: 'platform-audit', label: 'Cross-platform audit',
        level: quality ? (quality.status === 'failed' ? 'unavailable' : quality.status === 'passed_with_warnings' ? 'attention' : 'healthy') : 'unavailable',
        capturedAt: quality?.generatedAt ?? '', coverageFrom: '', coverageThrough: quality?.generatedAt.slice(0, 10) ?? '',
        records: quality?.total ?? 0,
        detail: quality ? `${quality.passed}/${quality.total} checks passed · ${quality.warnings} warnings` : 'Run pnpm audit:platform to create this summary',
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
