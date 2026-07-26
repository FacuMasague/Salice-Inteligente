import { readFile } from 'node:fs/promises';
import type {
  DashboardData,
  ExecutiveSummaryContext,
  ExecutiveSummaryPayload,
} from '../shared/models.js';
import { resolveActiveDataPaths } from './data-bundle.js';
import {
  buildCommercialSalesReport,
  buildCommercialSellerVariations,
  getCommercialSalesReportMeta,
} from './commercial-sales-report.js';
import { buildGeneralReport, getGeneralReportMeta } from './general-report.js';
import { buildNonBuyerReport, getNonBuyerReportMeta } from './non-buyers-report.js';
import { buildPendingBalancesReport, getPendingBalancesReportMeta } from './pending-balances-report.js';
import { metricVariation } from './report-metrics.js';

const commercialUniverse = 'Ventas · Comercial: empresa 3; sucursales 3/6; emisores y exclusiones documentados en su ficha.';
const goalsUniverse = 'Reporte General · Objetivos kilos: empresa 3, sucursal 3, marcas, rubros y vendedores del plan activo.';
const nonBuyerUniverse = 'Cuentas activas del universo de recuperación documentado; excluye grupos, rubros y vendedores definidos en su ficha.';
const balancesUniverse = 'Cartera documental: facturas y notas de débito abiertas con vencimiento válido.';

function context(input: ExecutiveSummaryContext): ExecutiveSummaryContext {
  return input;
}

export function buildExecutiveSummary(
  data: DashboardData,
): ExecutiveSummaryPayload | null {
  const sales = buildCommercialSalesReport({});
  const goals = buildGeneralReport({ mode: 'core' });
  const nonBuyers = buildNonBuyerReport({});
  const balances = buildPendingBalancesReport({});
  if (!sales || !goals || !nonBuyers || !balances) return null;

  const commercialMeta = getCommercialSalesReportMeta();
  const goalsMeta = getGeneralReportMeta();
  const nonBuyerMeta = getNonBuyerReportMeta();
  const balancesMeta = getPendingBalancesReportMeta();
  const logisticsCounts = {
    unassigned: data.logistics.invoices.filter((invoice) => invoice.assignmentStatus === 'unassigned').length,
    openSheet: data.logistics.invoices.filter((invoice) => invoice.assignmentStatus === 'open_sheet').length,
    closedSheet: data.logistics.invoices.filter((invoice) => invoice.assignmentStatus === 'closed_sheet').length,
    unknown: data.logistics.invoices.filter((invoice) => invoice.assignmentStatus === 'unknown').length,
  };

  return {
    generatedAt: new Date().toISOString(),
    snapshotAt: data.meta.generatedAt,
    sales: {
      netAmount: sales.current.netAmount,
      kilos: sales.current.kilos,
      buyers: sales.current.clients,
      comparisonNetAmount: sales.comparison.netAmount,
      comparisonKilos: sales.comparison.kilos,
      netVariation: sales.variation,
      kiloVariation: metricVariation(sales.current.kilos, sales.comparison.kilos),
      context: context({
        definition: 'Venta neta, kilos y compradores únicos del período; compara contra la misma cantidad de días del período anterior.',
        period: `${sales.periodStart} — ${sales.periodEnd}; comparable ${sales.comparisonStart} — ${sales.comparisonEnd}`,
        cutoff: sales.sourceMaxDate,
        source: commercialMeta.sourceSystem,
        universe: commercialUniverse,
        warning: sales.comparisonAvailable ? '' : 'La cobertura disponible no alcanza a completar el período comparable.',
        destination: 'commercial-sales',
      }),
    },
    goals: {
      actual: goals.actual,
      target: goals.target,
      completion: goals.completion,
      gap: goals.gap,
      projectedCompletion: goals.projectedCompletion,
      unit: goals.unit,
      targetSource: goalsMeta.targetSource.label,
      context: context({
        definition: 'Kilos reales del bloque Objetivos kilos frente al plan mensual activo. La proyección, cuando existe, es lineal.',
        period: `${goals.periodStart} — ${goals.periodEnd}`,
        cutoff: goals.sourceMaxDate,
        source: `${goalsMeta.sourceSystem} + plan versionado: ${goalsMeta.targetSource.label}`,
        universe: goalsUniverse,
        warning: 'El objetivo es planificación de Salice y no proviene de GESI.',
        destination: 'reports',
      }),
    },
    nonBuyers: {
      accounts: nonBuyers.accountsSummary.nonBuyers30,
      universe90: nonBuyers.accountsSummary.universe90,
      rate: nonBuyers.accountsSummary.rate,
      context: context({
        definition: 'Cuenta con venta neta positiva en 180 días y venta neta no positiva en los últimos 30 días; la tasa usa compradores de 90 días.',
        period: `${nonBuyers.windows.from180} — ${nonBuyers.windows.through}`,
        cutoff: nonBuyers.sourceMaxDate,
        source: nonBuyerMeta.sourceSystem,
        universe: nonBuyerUniverse,
        warning: nonBuyerMeta.agreementsAvailable ? '' : nonBuyerMeta.agreementsNote,
        destination: 'non-buyers',
      }),
    },
    balances: {
      pending: balances.pendingBalance,
      overdue: balances.overdueBalance,
      overdueShare: balances.overdueShare,
      clients: balances.clientsWithBalance,
      context: context({
        definition: 'Saldo positivo abierto de documentos débito y porción cuyo primer vencimiento es anterior al corte.',
        period: `Estado al ${balances.sourceMaxDate}; ventas auxiliares desde ${balances.salesWindowFrom}`,
        cutoff: balances.sourceMaxDate,
        source: balancesMeta.sourceSystem,
        universe: balancesUniverse,
        warning: 'Es cartera documental y puede diferir del saldo neto si existen créditos o anticipos sin aplicar.',
        destination: 'pending-balances',
      }),
    },
    sellerVariations: {
      rows: buildCommercialSellerVariations(sales).slice(0, 5),
      context: context({
        definition: 'Vendedores ordenados por la mayor diferencia absoluta de venta neta contra el período equivalente; el porcentaje queda vacío si la base era cero.',
        period: `${sales.periodStart} — ${sales.periodEnd}; comparable ${sales.comparisonStart} — ${sales.comparisonEnd}`,
        cutoff: sales.sourceMaxDate,
        source: commercialMeta.sourceSystem,
        universe: commercialUniverse,
        warning: 'La posición refleja magnitud de cambio, no desempeño contra objetivos.',
        destination: 'commercial-sales',
      }),
    },
    logistics: {
      invoices: data.logistics.invoices.length,
      ...logisticsCounts,
      context: context({
        definition: 'Facturas identificables clasificadas según no tengan foja, integren una foja abierta o una foja cerrada.',
        period: `${data.logistics.coverageFrom} — ${data.logistics.coverageThrough}`,
        cutoff: data.logistics.coverageThrough,
        source: 'GESI API · facturas y fojas de reparto',
        universe: 'Facturas logísticas identificables dentro de la cobertura disponible en el snapshot.',
        warning: 'Una foja cerrada documenta el cierre de la carga en GESI; no confirma que la entrega se haya realizado.',
        destination: 'routes',
      }),
    },
  };
}

export async function loadExecutiveSummary(data: DashboardData): Promise<ExecutiveSummaryPayload | null> {
  const path = resolveActiveDataPaths().executiveSummary;
  try {
    const summary = JSON.parse(await readFile(path, 'utf8')) as ExecutiveSummaryPayload;
    if (summary.snapshotAt !== data.meta.generatedAt) {
      throw new Error(`El resumen ejecutivo corresponde a ${summary.snapshotAt} y el snapshot activo a ${data.meta.generatedAt}.`);
    }
    return summary;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    // Compatibilidad con paquetes creados antes de que el resumen pasara a ser
    // un artefacto versionado. Los paquetes nuevos siempre llegan precalculados.
    return buildExecutiveSummary(data);
  }
}
