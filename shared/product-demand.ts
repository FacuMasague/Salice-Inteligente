export type DemandWindowDays = 30 | 90 | 180;
export type DemandDimension = 'product' | 'brand' | 'family' | 'group';
export type DemandTrend = 'accelerating' | 'stable' | 'declining' | 'new_observed' | 'no_demand' | 'insufficient_history';
export type DemandStability = 'stable' | 'variable' | 'intermittent' | 'insufficient';
export type DemandHistoryStatus = 'complete' | 'partial_comparison' | 'partial_current';

export interface DemandPeriodMetrics {
  units: number;
  sales: number;
  buyers: number;
  activeDays: number;
}

export interface ProductDemandRow {
  id: string;
  label: string;
  detail: string;
  dimension: DemandDimension;
  productCount: number;
  current: DemandPeriodMetrics;
  previous: DemandPeriodMetrics;
  rotationPer30Days: number;
  previousRotationPer30Days: number;
  variationPercent: number | null;
  trend: DemandTrend;
  stability: DemandStability;
  stabilityCoefficient: number | null;
  activeSubperiods: number;
  firstSaleAt: string;
  lastSaleAt: string;
  daysSinceLastSale: number | null;
  historyStatus: DemandHistoryStatus;
  explanation: string;
}

export interface ProductDemandPayload {
  generatedAt: string;
  sourceSystem: string;
  coverageFrom: string;
  sourceMaxDate: string;
  windowDays: DemandWindowDays;
  dimension: DemandDimension;
  currentRange: { from: string; through: string };
  previousRange: { from: string; through: string };
  historyStatus: DemandHistoryStatus;
  summary: {
    current: DemandPeriodMetrics;
    previous: DemandPeriodMetrics;
    variationPercent: number | null;
    accelerating: number;
    declining: number;
    newObserved: number;
    withoutDemand: number;
  };
  rows: ProductDemandRow[];
  rules: {
    demand: string;
    comparison: string;
    acceleration: string;
    stability: string;
    newProducts: string;
  };
}

const dayMilliseconds = 86_400_000;

export function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function demandPeriodRanges(through: string, windowDays: DemandWindowDays) {
  const currentFrom = shiftIsoDate(through, -(windowDays - 1));
  const previousThrough = shiftIsoDate(currentFrom, -1);
  return {
    current: { from: currentFrom, through },
    previous: { from: shiftIsoDate(previousThrough, -(windowDays - 1)), through: previousThrough },
  };
}

export function demandHistoryStatus(coverageFrom: string, ranges: ReturnType<typeof demandPeriodRanges>): DemandHistoryStatus {
  if (!coverageFrom || coverageFrom > ranges.current.from) return 'partial_current';
  if (coverageFrom > ranges.previous.from) return 'partial_comparison';
  return 'complete';
}

export function demandVariation(current: number, previous: number) {
  if (previous <= 0) return null;
  return (current - previous) / previous * 100;
}

export function classifyDemandTrend(input: {
  currentUnits: number;
  previousUnits: number;
  firstSaleAt: string;
  currentFrom: string;
  historyStatus: DemandHistoryStatus;
}): DemandTrend {
  if (input.historyStatus !== 'complete') return 'insufficient_history';
  if (input.currentUnits <= 0) return 'no_demand';
  if (input.previousUnits <= 0 && input.firstSaleAt >= input.currentFrom) return 'new_observed';
  if (input.previousUnits <= 0) return 'accelerating';
  const variation = demandVariation(input.currentUnits, input.previousUnits) ?? 0;
  if (variation >= 20) return 'accelerating';
  if (variation <= -20) return 'declining';
  return 'stable';
}

export function classifyDemandStability(subperiodUnits: number[]) {
  const values = subperiodUnits.map((value) => Math.max(0, value));
  const activeSubperiods = values.filter((value) => value > 0).length;
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  if (mean <= 0) return { status: 'insufficient' as const, coefficient: null, activeSubperiods };
  const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  const coefficient = deviation / mean;
  if (activeSubperiods < 2 || coefficient > .75) return { status: 'intermittent' as const, coefficient, activeSubperiods };
  if (coefficient > .35) return { status: 'variable' as const, coefficient, activeSubperiods };
  return { status: 'stable' as const, coefficient, activeSubperiods };
}

export function daysBetweenDemandDates(from: string, through: string) {
  if (!from || !through) return null;
  return Math.max(0, Math.round((new Date(`${through}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / dayMilliseconds));
}

export function demandExplanation(row: Pick<ProductDemandRow, 'trend' | 'stability' | 'variationPercent'> & { windowDays?: DemandWindowDays }) {
  const window = row.windowDays ?? 90;
  if (row.trend === 'insufficient_history') return `La base no cubre los ${window} días actuales y los ${window} anteriores completos.`;
  if (row.trend === 'no_demand') return `No registra unidades positivas en facturas durante los últimos ${window} días; la cobertura histórica sí alcanza.`;
  if (row.trend === 'new_observed') return `Su primera venta observable cae dentro de los últimos ${window} días. Esto no prueba la fecha de alta del maestro.`;
  const variation = row.variationPercent == null ? 'sin base anterior' : `${Math.abs(row.variationPercent).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
  const direction = row.trend === 'accelerating' ? `La demanda acelera ${variation}` : row.trend === 'declining' ? `La demanda cae ${variation}` : `La demanda se mantiene dentro de ±20%`;
  const stability = row.stability === 'stable' ? 'con rotación estable' : row.stability === 'variable' ? 'con variaciones internas' : row.stability === 'intermittent' ? 'de forma intermitente' : 'sin rotación suficiente para medir estabilidad';
  return `${direction} frente al período anterior equivalente, ${stability}.`;
}
