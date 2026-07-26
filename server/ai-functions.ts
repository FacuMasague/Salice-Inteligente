import { recommendProducts } from '../shared/algorithms.js';
import { isCommercialOpportunityEligible } from '../shared/commercial-opportunities.js';
import type {
  AiCommercialExplanation,
  AiExecutiveBrief,
  AiFunctionDefinition,
  AiReportNarrative,
  AiSellerSummary,
} from '../shared/ai.js';
import type {
  CommercialInboxPayload,
  DashboardData,
  ExecutiveSummaryPayload,
  Product,
  VectorKey,
} from '../shared/models.js';
import { productVectorContradictions } from '../shared/product-vector-audit.js';
import { VECTOR_KEYS } from '../shared/product-vectors.js';
import { buildCommercialInbox } from './agenda.js';
import { buildBairesReport } from './baires-report.js';
import { buildCommercialSalesReport } from './commercial-sales-report.js';
import { buildExecutiveSummary } from './executive-summary.js';
import { canonicalJson, sha256 } from './ai-evidence.js';
import {
  COMMERCIAL_EXPLANATION_SCHEMA,
  EXECUTIVE_BRIEF_SCHEMA,
  PRODUCT_VECTOR_SCHEMA,
  REPORT_NARRATIVE_SCHEMA,
  SELLER_SUMMARY_SCHEMA,
} from './ai-schemas.js';
import type { AiStore } from './ai-store.js';
import { buildGeneralReport } from './general-report.js';
import { buildMarsReport } from './mars-report.js';
import { buildNonBuyerReport } from './non-buyers-report.js';
import { buildNutriPetReport } from './nutripet-report.js';
import {
  listActivities,
  listAgendaItems,
  listPromises,
  listReceivableCases,
} from './operational-store.js';
import { buildPendingBalancesReport } from './pending-balances-report.js';
import { buildSptReport } from './spt-report.js';

export type AiReportId =
  | 'general'
  | 'spt'
  | 'commercial-sales'
  | 'mars'
  | 'nutripet'
  | 'baires'
  | 'non-buyers'
  | 'pending-balances';

interface EvidenceMetric {
  id: string;
  label: string;
  value: number | string | boolean | null;
  unit: string;
  context: string;
}

interface EvidenceBreakdown {
  id: string;
  label: string;
  value: number;
  unit: string;
  comparison: number | null;
}

export interface ReportEvidencePackage {
  reportId: AiReportId;
  reportLabel: string;
  period: string;
  cutoff: string;
  universe: string;
  partial: boolean;
  metrics: EvidenceMetric[];
  breakdowns: EvidenceBreakdown[];
  warnings: Array<{ id: string; text: string }>;
}

const REPORT_CONFIG: Record<AiReportId, { label: string; universe: string }> = {
  general: {
    label: 'Reporte General',
    universe: 'Empresa 3, sucursal 3. Resultados GESI y objetivos del plan mensual activo, sin mezclar ambas fuentes.',
  },
  spt: {
    label: 'SPT',
    universe: 'Canal especializado conciliado: empresas 3/6, canales y grupos documentados, sin POP ni Promociones.',
  },
  'commercial-sales': {
    label: 'Ventas Comercial',
    universe: 'Empresa 3; sucursales 3/6; emisores y exclusiones documentados en el contrato de Ventas Comercial.',
  },
  mars: {
    label: 'Mars',
    universe: 'Pet Nutrition bajo períodos comerciales Mars, clientes, sucursales, marcas y segmentos documentados.',
  },
  nutripet: {
    label: 'NutriPet',
    universe: 'Negocio NutriPet conciliado desde GESI, con sus marcas, productos, canales y filtros propios.',
  },
  baires: {
    label: 'Baires',
    universe: 'Negocio Baires desde GESI, preservando segmentos, sucursal, marcas y subrubros de su contrato.',
  },
  'non-buyers': {
    label: 'Cuentas no compradoras',
    universe: 'Cuentas activas del universo de recuperación documentado; ventanas de 30, 90 y 180 días.',
  },
  'pending-balances': {
    label: 'Saldos Pendientes',
    universe: 'Cartera documental: facturas y notas de débito abiertas con vencimiento válido.',
  },
};

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function rows(value: unknown): Record<string, any>[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') as Record<string, any>[] : [];
}

function metric(
  reportId: AiReportId,
  id: string,
  label: string,
  value: unknown,
  unit: string,
  context = '',
): EvidenceMetric {
  return {
    id: `${reportId}:metric:${id}`,
    label,
    value: value == null
      ? null
      : typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean'
        ? value
        : null,
    unit,
    context,
  };
}

function breakdowns(
  reportId: AiReportId,
  prefix: string,
  source: unknown,
  labelKey: string,
  valueKey: string,
  unit: string,
  comparisonKey?: string,
  limit = 6,
): EvidenceBreakdown[] {
  return rows(source)
    .filter((item) => Number.isFinite(Number(item[valueKey])))
    .sort((left, right) => Math.abs(Number(right[valueKey])) - Math.abs(Number(left[valueKey])))
    .slice(0, limit)
    .map((item, index) => ({
      id: `${reportId}:breakdown:${prefix}:${index + 1}`,
      label: String(item[labelKey] ?? `Fila ${index + 1}`).slice(0, 160),
      value: Number(item[valueKey]),
      unit,
      comparison: comparisonKey && Number.isFinite(Number(item[comparisonKey])) ? Number(item[comparisonKey]) : null,
    }));
}

function warning(reportId: AiReportId, id: string, text: string) {
  return { id: `${reportId}:warning:${id}`, text };
}

export function buildReportEvidence(reportId: AiReportId, payload: unknown): ReportEvidencePackage {
  const source = record(payload);
  const config = REPORT_CONFIG[reportId];
  const warnings: ReportEvidencePackage['warnings'] = [];
  let period = '';
  let cutoff = String(source.sourceMaxDate ?? '');
  let partial = Boolean(source.isPartial);
  let metrics: EvidenceMetric[] = [];
  let detail: EvidenceBreakdown[] = [];

  if (reportId === 'general') {
    period = `${source.periodStart ?? ''} — ${source.periodEnd ?? ''}`;
    const unit = source.unit === 'currency' ? 'ARS' : 'kg';
    metrics = [
      metric(reportId, 'actual', 'Resultado real', source.actual, unit),
      metric(reportId, 'target', 'Objetivo mensual', source.target, unit, 'Plan mensual versionado; no proviene de GESI.'),
      metric(reportId, 'completion', 'Cumplimiento', source.completion, '%'),
      metric(reportId, 'gap', 'Diferencia contra objetivo', source.gap, unit),
      metric(reportId, 'projection', 'Proyección lineal', source.projection, unit, 'Referencia de ritmo, no pronóstico.'),
      metric(reportId, 'previous-month', 'Resultado mes anterior comparable', source.previousMonthActual, unit),
      metric(reportId, 'previous-year', 'Resultado año anterior comparable', source.previousYearActual, unit),
      metric(reportId, 'clients', 'Clientes compradores', source.clients, 'clientes'),
    ];
    detail = [
      ...breakdowns(reportId, 'seller', source.sellers, 'name', 'actual', unit, 'target', 4),
      ...breakdowns(reportId, 'brand', source.brands, 'name', 'actual', unit, 'target', 4),
    ];
    warnings.push(warning(reportId, 'sources', 'Los resultados reales provienen de GESI; los objetivos pertenecen al plan mensual versionado.'));
  } else if (reportId === 'spt') {
    period = String(source.selectedMonth ?? '');
    partial = Number(source.cutoffDay ?? 31) < 28;
    const current = record(source.current);
    const previousMonth = record(source.previousMonth);
    const previousYear = record(source.previousYear);
    metrics = [
      metric(reportId, 'kilos', 'Kilos del período', current.kilos, 'kg'),
      metric(reportId, 'clients', 'Clientes', current.clients, 'clientes'),
      metric(reportId, 'net', 'Venta neta', current.netAmount, 'ARS'),
      metric(reportId, 'previous-month-kilos', 'Kilos mes anterior comparable', previousMonth.kilos, 'kg'),
      metric(reportId, 'previous-year-kilos', 'Kilos año anterior comparable', previousYear.kilos, 'kg'),
      metric(reportId, 'average-3m', 'Promedio de los tres meses completos anteriores', source.averageLast3MonthsKilos, 'kg'),
      metric(reportId, 'ytd', 'Kilos acumulados del año', record(source.ytd).kilos, 'kg'),
      metric(reportId, 'previous-ytd', 'Kilos acumulados del año anterior', record(source.previousYtd).kilos, 'kg'),
    ];
    detail = [
      ...breakdowns(reportId, 'seller', source.sellers, 'label', 'kilos', 'kg', undefined, 4),
      ...breakdowns(reportId, 'group', source.productGroups, 'label', 'kilos', 'kg', undefined, 4),
    ];
    warnings.push(warning(reportId, 'scope', 'La página principal y la lectura por vendedores pueden usar universos diferentes; esta narrativa describe sólo el paquete recibido.'));
  } else if (reportId === 'commercial-sales') {
    period = `${source.periodStart ?? ''} — ${source.periodEnd ?? ''}`;
    partial = !Boolean(source.comparisonAvailable);
    const current = record(source.current);
    const comparison = record(source.comparison);
    metrics = [
      metric(reportId, 'net', 'Venta neta', current.netAmount, 'ARS'),
      metric(reportId, 'kilos', 'Kilos', current.kilos, 'kg'),
      metric(reportId, 'clients', 'Clientes compradores', current.clients, 'clientes'),
      metric(reportId, 'comparison-net', 'Venta neta del período comparable', comparison.netAmount, 'ARS'),
      metric(reportId, 'difference', 'Diferencia absoluta', source.difference, 'ARS'),
      metric(reportId, 'variation', 'Variación', source.variation, '%'),
    ];
    detail = [
      ...breakdowns(reportId, 'mix', source.mix, 'label', 'netAmount', 'ARS', undefined, 5),
      ...breakdowns(reportId, 'brand', source.brands, 'brand', 'netAmount', 'ARS', undefined, 5),
    ];
    if (!source.comparisonAvailable) warnings.push(warning(reportId, 'comparison', 'La cobertura disponible no completa el período comparable.'));
  } else if (reportId === 'mars') {
    period = `${record(source.selected).start ?? ''} — ${record(source.selected).end ?? ''}`;
    const current = record(source.current);
    metrics = [
      metric(reportId, 'kilos', 'Kilos del período Mars', current.kilos, 'kg'),
      metric(reportId, 'clients', 'Clientes', current.clients, 'clientes'),
      metric(reportId, 'accounts', 'Cuentas', current.accounts, 'cuentas'),
      metric(reportId, 'previous-period', 'Kilos período Mars anterior', record(source.previousPeriod).kilos, 'kg'),
      metric(reportId, 'previous-year', 'Kilos año anterior comparable', record(source.previousYear).kilos, 'kg'),
      metric(reportId, 'ytd', 'Kilos acumulados del año', record(source.ytd).kilos, 'kg'),
      metric(reportId, 'previous-ytd', 'Kilos acumulados del año anterior', record(source.previousYtd).kilos, 'kg'),
    ];
    detail = breakdowns(reportId, 'brand', source.brands, 'brand', 'kilos', 'kg', 'previousYearKilos', 5);
    warnings.push(warning(reportId, 'periods', 'Los períodos Mars no equivalen necesariamente a meses calendario.'));
  } else if (reportId === 'nutripet' || reportId === 'baires') {
    period = `${source.periodStart ?? ''} — ${source.periodEnd ?? ''}`;
    const current = record(source.current);
    metrics = [
      metric(reportId, 'kilos', 'Kilos del período', current.kilos, 'kg'),
      metric(reportId, 'clients', 'Clientes', current.clients, 'clientes'),
      metric(reportId, 'net', 'Venta neta', current.netAmount, 'ARS'),
      metric(reportId, 'previous-month', 'Kilos mes anterior comparable', record(source.previousMonth).kilos, 'kg'),
      metric(reportId, 'previous-year', 'Kilos año anterior comparable', record(source.previousYear).kilos, 'kg'),
      metric(reportId, 'ytd', 'Kilos acumulados del año', record(source.ytd).kilos, 'kg'),
      metric(reportId, 'previous-ytd', 'Kilos acumulados del año anterior', record(source.previousYtd).kilos, 'kg'),
    ];
    detail = reportId === 'nutripet'
      ? [
        ...breakdowns(reportId, 'brand', source.brands, 'brand', 'kilos', 'kg', 'previousYearKilos', 4),
        ...breakdowns(reportId, 'product', source.products, 'product', 'kilos', 'kg', undefined, 5),
      ]
      : [
        ...breakdowns(reportId, 'brand', source.brands, 'name', 'kilos', 'kg', 'previousYearKilos', 5),
        ...breakdowns(reportId, 'subcategory', source.subcategories, 'name', 'kilos', 'kg', 'previousYearKilos', 4),
      ];
    if (!source.comparisonAvailable) warnings.push(warning(reportId, 'comparison', 'La cobertura no alcanza a formar todas las comparaciones temporales.'));
  } else if (reportId === 'non-buyers') {
    period = `${record(source.windows).from180 ?? ''} — ${record(source.windows).through ?? ''}`;
    const accounts = record(source.accountsSummary);
    const brands = record(source.brandsSummary);
    metrics = [
      metric(reportId, 'accounts-non-buyers', 'Cuentas sin compra en 30 días', accounts.nonBuyers30, 'cuentas'),
      metric(reportId, 'accounts-universe', 'Universo comprador de cuentas en 90 días', accounts.universe90, 'cuentas'),
      metric(reportId, 'accounts-rate', 'Tasa de cuentas sin compra', accounts.rate, '%'),
      metric(reportId, 'brands-non-buyers', 'Marcas sin compra en 30 días', brands.nonBuyers30, 'marcas'),
      metric(reportId, 'brands-universe', 'Universo comprador de marcas en 90 días', brands.universe90, 'marcas'),
      metric(reportId, 'brands-rate', 'Tasa de marcas sin compra', brands.rate, '%'),
    ];
    detail = [
      ...breakdowns(reportId, 'account-seller', source.accountSellers, 'seller', 'nonBuyers30', 'cuentas', undefined, 5),
      ...breakdowns(reportId, 'brand-seller', source.brandSellers, 'seller', 'nonBuyers30', 'marcas', undefined, 5),
    ];
    warnings.push(warning(reportId, 'agreements', 'GESI no expone el maestro de acuerdos comerciales utilizado históricamente por Power BI.'));
  } else {
    period = `${source.salesWindowFrom ?? ''} — ${source.sourceMaxDate ?? ''}`;
    metrics = [
      metric(reportId, 'pending', 'Saldo pendiente documental', source.pendingBalance, 'ARS'),
      metric(reportId, 'overdue', 'Saldo vencido documental', source.overdueBalance, 'ARS'),
      metric(reportId, 'overdue-share', 'Vencido sobre pendiente', source.overdueShare, '%'),
      metric(reportId, 'sales-30', 'Ventas de los últimos 30 días', source.sales30, 'ARS'),
      metric(reportId, 'overdue-sales', 'Vencido sobre ventas de 30 días', source.overdueToSales30, '%'),
      metric(reportId, 'clients', 'Clientes con saldo', source.clientsWithBalance, 'clientes'),
      metric(reportId, 'overdue-clients', 'Clientes con vencido', source.overdueClients, 'clientes'),
      metric(reportId, 'documents', 'Documentos abiertos', source.openDocuments, 'documentos'),
    ];
    detail = [
      ...breakdowns(reportId, 'seller', source.sellers, 'seller', 'pendingBalance', 'ARS', 'overdueBalance', 5),
      ...breakdowns(reportId, 'aging', source.aging, 'label', 'amount', 'ARS', undefined, 5),
    ];
    warnings.push(warning(reportId, 'documentary', 'La cartera documental puede diferir del saldo neto si existen créditos, recibos o valores sin aplicar.'));
  }

  if (partial) warnings.push(warning(reportId, 'partial', 'El período es parcial o su comparación no está completa.'));
  return {
    reportId,
    reportLabel: config.label,
    period,
    cutoff,
    universe: config.universe,
    partial,
    metrics,
    breakdowns: detail,
    warnings,
  };
}

export function reportEvidenceRefs(evidence: ReportEvidencePackage) {
  return [
    ...evidence.metrics.map((item) => item.id),
    ...evidence.breakdowns.map((item) => item.id),
    ...evidence.warnings.map((item) => item.id),
  ];
}

export function buildDefaultReportPayloads(): Partial<Record<AiReportId, unknown>> {
  return {
    general: buildGeneralReport({ mode: 'core' }) ?? undefined,
    spt: buildSptReport({ page: 'main' }) ?? undefined,
    'commercial-sales': buildCommercialSalesReport({}) ?? undefined,
    mars: buildMarsReport({}) ?? undefined,
    nutripet: buildNutriPetReport({}) ?? undefined,
    baires: buildBairesReport({}) ?? undefined,
    'non-buyers': buildNonBuyerReport({}) ?? undefined,
    'pending-balances': buildPendingBalancesReport({}) ?? undefined,
  };
}

export function buildExecutiveEvidence(summary: ExecutiveSummaryPayload) {
  const blocks = [
    ['sales', summary.sales, 'Ventas', 'ARS'],
    ['goals', summary.goals, 'Objetivos', String(summary.goals.unit)],
    ['non-buyers', summary.nonBuyers, 'Recuperación', 'cuentas'],
    ['balances', summary.balances, 'Saldos', 'ARS'],
    ['logistics', summary.logistics, 'Logística documental', 'facturas'],
  ] as const;
  const evidence = blocks.map(([id, value, label, unit]) => ({
    id: `executive:${id}`,
    label,
    values: Object.fromEntries(Object.entries(value).filter(([key, child]) => (
      key !== 'context' && (typeof child === 'number' || child == null)
    ))),
    unit,
    definition: value.context.definition,
    period: value.context.period,
    universe: value.context.universe,
    warning: value.context.warning,
    destination: value.context.destination,
  }));
  const sellers = summary.sellerVariations.rows.map((item, index) => ({
    id: `executive:seller-change:${index + 1}`,
    seller: item.seller,
    currentNetAmount: item.currentNetAmount,
    comparisonNetAmount: item.comparisonNetAmount,
    difference: item.difference,
    variation: item.variation,
  }));
  return {
    snapshotAt: summary.snapshotAt,
    rule: 'Cada bloque conserva su definición, período y universo. No deben sumarse entre sí ni producir un puntaje global.',
    evidence,
    sellers,
  };
}

function evidenceIdsFromOutput(value: unknown, result: string[] = []): string[] {
  if (!value || typeof value !== 'object') return result;
  if (Array.isArray(value)) {
    value.forEach((item) => evidenceIdsFromOutput(item, result));
    return result;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'evidenceIds' && Array.isArray(child)) {
      child.forEach((item) => {
        if (typeof item === 'string') result.push(item);
      });
    } else {
      evidenceIdsFromOutput(child, result);
    }
  }
  return result;
}

function validateReferences(output: unknown, refs: string[]) {
  const allowed = new Set(refs);
  const used = evidenceIdsFromOutput(output);
  if (!used.length) return { valid: false as const, error: 'La salida no cita evidencia interna.' };
  const invalid = used.filter((id) => !allowed.has(id));
  return invalid.length
    ? { valid: false as const, error: `La salida cita evidencia inexistente: ${invalid.slice(0, 5).join(', ')}.` }
    : { valid: true as const };
}

function productEvidence(product: Product) {
  const deterministicSignals = VECTOR_KEYS
    .filter((key) => product.vector[key] > 0)
    .map((key) => ({
      dimension: key,
      value: product.vector[key],
      evidence: product.vectorMeta.evidence[key] ?? [],
    }));
  return {
    productId: product.id,
    name: product.name,
    description: product.description,
    category: product.family,
    subcategory: product.subcategory,
    brand: product.brand,
    line: product.line,
    commercialFamily: product.commercialFamily,
    group: product.group,
    pack: product.pack,
    sourceCoverage: product.vectorMeta.sourceCoverage,
    deterministicVersion: product.vectorMeta.version,
    deterministicSignals,
    rules: {
      zero: 'Cero significa ausencia de evidencia, no incompatibilidad.',
      preserve: 'Las señales determinísticas fuertes deben conservarse.',
      price: 'Precio alto no demuestra calidad nutricional.',
    },
  };
}

function validateProductVectorOutput(output: unknown, product: Product) {
  const value = record(output);
  const vector = record(value.vector) as Record<VectorKey, number>;
  const evidence = rows(value.evidence);
  for (const key of VECTOR_KEYS) {
    if (!Number.isInteger(vector[key]) || vector[key] < 0 || vector[key] > 100) {
      return { valid: false as const, error: `La dimensión ${key} no es un entero entre 0 y 100.` };
    }
    if (product.vector[key] >= 75 && vector[key] < 65) {
      return { valid: false as const, error: `La salida debilita la señal determinística fuerte ${key}.` };
    }
    if (vector[key] > 0 && !evidence.some((item) => item.dimension === key)) {
      return { valid: false as const, error: `La dimensión positiva ${key} no contiene evidencia.` };
    }
  }
  if (VECTOR_KEYS.every((key) => vector[key] === 0) && (!Array.isArray(value.warnings) || value.warnings.length === 0)) {
    return { valid: false as const, error: 'Un vector vacío debe explicar la falta de evidencia.' };
  }
  const combinations = record(value.declaredCombinations);
  const declaredCombinations = Object.fromEntries(
    Object.entries({
      species: String(combinations.species ?? ''),
      lifeStage: String(combinations.lifeStage ?? ''),
      petSize: String(combinations.petSize ?? ''),
    }).filter(([, child]) => child),
  );
  const candidate: Product = {
    ...product,
    vector,
    vectorMeta: {
      ...product.vectorMeta,
      confidence: Number(value.confidence),
      evidence: {},
      declaredCombinations,
    },
  };
  const contradictions = productVectorContradictions(candidate);
  return contradictions.length
    ? { valid: false as const, error: `La auditoría vectorial rechazó el candidato: ${contradictions.join('; ')}.` }
    : { valid: true as const };
}

function localDate(snapshotAt: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(snapshotAt));
}

function inboxEvidence(data: DashboardData, snapshotAt: string) {
  const inbox = buildCommercialInbox(
    data,
    localDate(snapshotAt),
    '',
    listAgendaItems({ includeCancelled: false }),
    listActivities({ limit: 1_000 }),
    listPromises({ limit: 1_000 }),
    listReceivableCases(),
  );
  return {
    inbox,
    clients: inbox.entries.map((entry) => {
      const client = data.clients.find((item) => item.id === entry.clientId)!;
      const eligible = isCommercialOpportunityEligible(client);
      const signalEvidence = entry.signals.map((signal, index) => ({
        id: `client:${entry.clientId}:signal:${index + 1}`,
        kind: signal.kind,
        source: signal.source,
        label: signal.label,
        severity: signal.severity,
        date: signal.date,
        amount: signal.amount,
      }));
      const metricEvidence = [
        { id: `client:${entry.clientId}:metric:C`, label: 'Riesgo de cobranza C', value: entry.collectionRisk },
        { id: `client:${entry.clientId}:metric:O`, label: 'Oportunidad O', value: eligible ? entry.commercialOpportunity : null },
        { id: `client:${entry.clientId}:metric:P`, label: 'Prioridad P', value: entry.visitPriority },
        { id: `client:${entry.clientId}:metric:sales`, label: 'Ventas 90 días', value: entry.sales90d },
        { id: `client:${entry.clientId}:metric:delta`, label: 'Variación de ventas', value: entry.salesDelta },
        { id: `client:${entry.clientId}:metric:debt`, label: 'Saldo vencido', value: entry.overdueOutstanding },
      ];
      const opportunities = eligible
        ? recommendProducts(client, data.clients, data.products, 3).map((item, index) => ({
          id: `client:${entry.clientId}:opportunity:${index + 1}`,
          productId: item.product.id,
          product: item.product.name,
          reason: item.reason,
          confidence: item.confidence,
          score: item.score,
        }))
        : [];
      return {
        clientId: entry.clientId,
        seller: entry.seller,
        eligibleForOpportunity: eligible,
        salesBlocked: entry.salesBlocked,
        portfolioStatus: entry.portfolioStatus,
        metrics: metricEvidence,
        signals: signalEvidence,
        activitySummary: {
          count: entry.notes.length,
          categories: [...new Set(entry.notes.map((item) => item.type))],
          latestAt: entry.notes[0]?.occurredAt ?? null,
        },
        opportunities,
      };
    }),
  };
}

function sellerEvidence(data: DashboardData) {
  const active = data.clients.filter((client) => client.active);
  const names = [...new Set(active.map((client) => client.seller || 'Sin vendedor'))]
    .sort((left, right) => left.localeCompare(right, 'es'));
  return names.map((seller) => {
    const clients = active.filter((client) => (client.seller || 'Sin vendedor') === seller);
    const eligible = clients.filter(isCommercialOpportunityEligible);
    const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const refs = [
      `seller:${seller}:clients`,
      `seller:${seller}:sales`,
      `seller:${seller}:collection`,
      `seller:${seller}:opportunity`,
      `seller:${seller}:priority`,
      `seller:${seller}:coverage`,
    ];
    return {
      seller,
      refs,
      metrics: [
        { id: refs[0], label: 'Clientes activos', value: clients.length },
        { id: refs[1], label: 'Ventas 90 días', value: clients.reduce((sum, client) => sum + client.sales90d, 0) },
        {
          id: refs[2],
          label: 'Cobranza',
          value: {
            averageC: average(clients.map((client) => client.collectionRisk)),
            highRiskClients: clients.filter((client) => client.collectionRisk >= 55).length,
            overdueAmount: clients.reduce((sum, client) => sum + client.overdueOutstanding, 0),
          },
        },
        {
          id: refs[3],
          label: 'Oportunidad elegible',
          value: {
            averageO: average(eligible.map((client) => client.commercialOpportunity)),
            highOpportunityClients: eligible.filter((client) => client.commercialOpportunity >= 55).length,
            eligibleClients: eligible.length,
          },
        },
        {
          id: refs[4],
          label: 'Prioridad de revisión',
          value: {
            averageP: average(clients.map((client) => client.visitPriority)),
            highPriorityClients: clients.filter((client) => client.visitPriority >= 55).length,
          },
        },
        {
          id: refs[5],
          label: 'Cobertura',
          value: {
            confirmedClients: clients.filter((client) => client.portfolioStatus === 'confirmed').length,
            reviewClients: clients.filter((client) => client.portfolioStatus === 'review').length,
            localities: new Set(clients.map((client) => client.locality).filter(Boolean)).size,
          },
        },
      ],
      rules: [
        'C, O y P son señales separadas.',
        'La lectura no evalúa productividad, no crea objetivos y no interpreta notas como desempeño.',
      ],
    };
  });
}

const REPORT_PROMPT = `Sos el redactor analítico de Salice Inteligente. Describí exclusivamente el paquete compacto recibido.
No recalcules cifras, no inventes causas, no presentes hipótesis como hechos y no compares universos incompatibles.
Citá en cada hallazgo, impulsor, aspecto a revisar y respuesta los evidenceIds exactos recibidos.
Si el período es parcial, declaralo. Diferenciá resultados reales, objetivos, comparaciones y limitaciones.
Presentá todos los porcentajes con exactamente dos decimales y todos los valores absolutos redondeados a números enteros.
La salida se almacena junto al snapshot; no des instrucciones, tareas ni conversaciones abiertas.`;

const EXECUTIVE_PROMPT = `Generá una lectura ejecutiva compacta de Salice usando sólo los bloques recibidos.
Cada bloque tiene definición, período y universo propios: no los sumes ni fabriques un puntaje o semáforo general.
Separá objetivos de resultados reales. No afirmes entregas: una foja cerrada es sólo estado documental.
No crees tareas. Cada afirmación verificable debe citar evidenceIds exactos. Conservá todas las limitaciones relevantes.
Presentá todos los porcentajes con exactamente dos decimales y todos los valores absolutos redondeados a números enteros.`;

const COMMERCIAL_PROMPT = `Explicá por qué cada cliente ya seleccionado por el algoritmo aparece en la bandeja.
No agregues ni elimines clientes. Mantené C, O y P separados; O no es probabilidad y P no es planificación.
Sólo podés mencionar oportunidades incluidas en la evidencia y únicamente si eligibleForOpportunity es true.
No afirmes que un producto fue ofrecido, no generes mensajes, guiones, tareas ni gestiones.
Las notas se reciben sólo como conteos y categorías: no infieras contenido. Devolvé exactamente un item por clientId recibido.
Presentá todos los porcentajes con exactamente dos decimales y todos los valores absolutos redondeados a números enteros.`;

const SELLER_PROMPT = `Resumí cada cartera activa usando únicamente sus agregados.
No evalúes productividad, no compares vendedores como ranking, no crees objetivos ni tareas y no interpretes notas como desempeño.
Mantené C, O y P separados. O se calcula sólo sobre clientes elegibles.
Devolvé exactamente un item por vendedor recibido y citá evidenceIds en cada señal o aspecto a revisar.
Presentá todos los porcentajes con exactamente dos decimales y todos los valores absolutos redondeados a números enteros.`;

const PRODUCT_PROMPT = `Clasificá un producto nuevo en las 33 dimensiones recibidas usando únicamente nombre, descripción y maestros comerciales disponibles.
Los valores van de 0 a 100; cero significa falta de evidencia, no imposibilidad.
No inventes especie, edad, porte, necesidad, sabor o posicionamiento. Precio alto no demuestra calidad.
Conservá toda señal determinística fuerte. Cada dimensión positiva debe tener evidencia con la fuente concreta.
Si la evidencia es insuficiente, usá valores conservadores y explicalo en warnings.
Las combinaciones de especie, etapa o porte sólo se declaran cuando la entrada las expresa explícitamente.`;

export function createAiFunctionDefinitions(input: {
  store: AiStore;
  snapshotAt: string;
}): AiFunctionDefinition[] {
  return [
    {
      key: 'product_vectorization',
      model: 'gpt-5.6-terra',
      effort: 'high',
      prompt: PRODUCT_PROMPT,
      promptVersion: 1,
      schemaVersion: 1,
      schemaName: 'salice_product_vector_v1',
      schema: PRODUCT_VECTOR_SCHEMA as unknown as Record<string, unknown>,
      maxOutputTokens: 2_500,
      buildJobs: (snapshot) => {
        const data = snapshot as DashboardData;
        input.store.ensureProductVectorBaseline(
          input.snapshotAt,
          data.products.map((product) => ({
            id: product.id,
            vectorVersion: product.vectorMeta.version,
            vectorHash: sha256(canonicalJson({ vector: product.vector, meta: product.vectorMeta })),
          })),
        );
        return data.products
          .filter((product) => (
            !input.store.hasProductVectorBaseline(product.id)
            && !input.store.hasValidProductVectorArtifact(product.id)
          ))
          .map((product) => ({
            entityType: 'product',
            entityId: product.id,
            evidence: productEvidence(product),
            evidenceRefs: [`product:${product.id}:catalog`],
          }));
      },
      validateOutput: (output, job, snapshot) => {
        const product = (snapshot as DashboardData).products.find((item) => item.id === job.entityId);
        return product
          ? validateProductVectorOutput(output, product)
          : { valid: false, error: 'El producto candidato ya no existe en el snapshot.' };
      },
    },
    {
      key: 'report_narrative',
      model: 'gpt-5.6-terra',
      effort: 'medium',
      prompt: REPORT_PROMPT,
      promptVersion: 2,
      schemaVersion: 1,
      schemaName: 'salice_report_narrative_v1',
      schema: REPORT_NARRATIVE_SCHEMA as unknown as Record<string, unknown>,
      maxOutputTokens: 2_200,
      buildJobs: () => Object.entries(buildDefaultReportPayloads())
        .filter((entry): entry is [AiReportId, unknown] => entry[1] != null)
        .map(([reportId, payload]) => {
          const evidence = buildReportEvidence(reportId, payload);
          return {
            entityType: 'report',
            entityId: reportId,
            evidence,
            evidenceRefs: reportEvidenceRefs(evidence),
          };
        }),
      validateOutput: (output, job) => validateReferences(output as AiReportNarrative, job.evidenceRefs),
    },
    {
      key: 'executive_summary',
      model: 'gpt-5.6-terra',
      effort: 'medium',
      prompt: EXECUTIVE_PROMPT,
      promptVersion: 2,
      schemaVersion: 1,
      schemaName: 'salice_executive_brief_v1',
      schema: EXECUTIVE_BRIEF_SCHEMA as unknown as Record<string, unknown>,
      maxOutputTokens: 2_200,
      buildJobs: (snapshot) => {
        const summary = buildExecutiveSummary(snapshot as DashboardData);
        if (!summary) return [];
        const evidence = buildExecutiveEvidence(summary);
        const refs = [
          ...evidence.evidence.map((item) => item.id),
          ...evidence.sellers.map((item) => item.id),
        ];
        return [{
          entityType: 'executive',
          entityId: 'how-are-we',
          evidence,
          evidenceRefs: refs,
        }];
      },
      validateOutput: (output, job) => {
        const text = JSON.stringify(output).toLocaleLowerCase('es');
        if (/semáforo general|puntaje (único|general)|score general/.test(text)) {
          return { valid: false, error: 'La salida creó un puntaje o semáforo general.' };
        }
        return validateReferences(output as AiExecutiveBrief, job.evidenceRefs);
      },
    },
    {
      key: 'commercial_inbox_explanation',
      model: 'gpt-5.6-terra',
      effort: 'low',
      prompt: COMMERCIAL_PROMPT,
      promptVersion: 2,
      schemaVersion: 1,
      schemaName: 'salice_commercial_explanations_v1',
      schema: COMMERCIAL_EXPLANATION_SCHEMA as unknown as Record<string, unknown>,
      maxOutputTokens: 2_500,
      buildJobs: (snapshot) => {
        const data = snapshot as DashboardData;
        const value = inboxEvidence(data, input.snapshotAt);
        const jobs = [];
        for (let index = 0; index < value.clients.length; index += 6) {
          const clients = value.clients.slice(index, index + 6);
          const refs = clients.flatMap((client) => [
            ...client.metrics.map((item) => item.id),
            ...client.signals.map((item) => item.id),
            ...client.opportunities.map((item) => item.id),
          ]);
          jobs.push({
            entityType: 'commercial_inbox_batch',
            entityId: `${value.inbox.weekStart}:${Math.floor(index / 6) + 1}`,
            evidence: {
              weekStart: value.inbox.weekStart,
              weekEnd: value.inbox.weekEnd,
              clients,
            },
            evidenceRefs: refs,
          });
        }
        return jobs;
      },
      validateOutput: (output, job) => {
        const expected = rows(record(job.evidence).clients).map((item) => Number(item.clientId)).sort((a, b) => a - b);
        const items = rows(record(output).items);
        const actual = items.map((item) => Number(item.clientId)).sort((a, b) => a - b);
        if (canonicalJson(actual) !== canonicalJson(expected)) {
          return { valid: false, error: 'La salida no contiene exactamente los clientes del lote.' };
        }
        const evidenceClients = rows(record(job.evidence).clients);
        for (const item of items as unknown as AiCommercialExplanation[]) {
          const source = evidenceClients.find((client) => Number(client.clientId) === item.clientId);
          if (!source) return { valid: false, error: `Cliente ${item.clientId} fuera del lote.` };
          if (!source.eligibleForOpportunity && item.commercialOpportunity.trim()) {
            return { valid: false, error: `Se generó una oportunidad para el cliente no elegible ${item.clientId}.` };
          }
        }
        return validateReferences(output, job.evidenceRefs);
      },
    },
    {
      key: 'seller_summary',
      model: 'gpt-5.6-terra',
      effort: 'low',
      prompt: SELLER_PROMPT,
      promptVersion: 2,
      schemaVersion: 1,
      schemaName: 'salice_seller_summaries_v1',
      schema: SELLER_SUMMARY_SCHEMA as unknown as Record<string, unknown>,
      maxOutputTokens: 2_500,
      buildJobs: (snapshot) => {
        const sellers = sellerEvidence(snapshot as DashboardData);
        const jobs = [];
        for (let index = 0; index < sellers.length; index += 10) {
          const batch = sellers.slice(index, index + 10);
          jobs.push({
            entityType: 'seller_batch',
            entityId: `sellers:${Math.floor(index / 10) + 1}`,
            evidence: { sellers: batch },
            evidenceRefs: batch.flatMap((seller) => seller.refs),
          });
        }
        return jobs;
      },
      validateOutput: (output, job) => {
        const expected = rows(record(job.evidence).sellers).map((item) => String(item.seller)).sort();
        const actual = rows(record(output).items).map((item) => String(item.seller)).sort();
        if (canonicalJson(actual) !== canonicalJson(expected)) {
          return { valid: false, error: 'La salida no contiene exactamente los vendedores del lote.' };
        }
        return validateReferences(output as { items: AiSellerSummary[] }, job.evidenceRefs);
      },
    },
  ];
}

export function reportNarrativeHash(reportId: AiReportId, payload: unknown) {
  return sha256(canonicalJson(buildReportEvidence(reportId, payload)));
}

export function executiveBriefHash(payload: ExecutiveSummaryPayload) {
  return sha256(canonicalJson(buildExecutiveEvidence(payload)));
}

export function inboxWeekFromPayload(payload: CommercialInboxPayload) {
  return `${payload.weekStart}:${payload.weekEnd}`;
}
