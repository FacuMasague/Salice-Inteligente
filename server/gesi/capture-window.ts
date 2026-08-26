interface SptFetchWindowOptions {
  hasExistingCapture: boolean;
  historyFrom: string;
  explicitHistoryFrom?: string;
  bootstrapHistoryFrom?: string;
}

interface LogisticsFetchWindowOptions {
  hasExistingCapture: boolean;
  historyFrom: string;
  rollingFrom: string;
  existingCoverageFrom?: string;
  explicitFrom?: string;
}

export interface CalendarMonthWindow {
  key: string;
  from: string;
  until: string;
}

export const DEFAULT_SPT_BOOTSTRAP_HISTORY_FROM = '2025-01-01';

/**
 * Divide una consulta histórica en meses calendario sin superponer límites.
 * GESI puede agotar su tiempo de respuesta antes de devolver siquiera la
 * primera página cuando debe filtrar un año completo de comprobantes; limitar
 * también el rango temporal reduce ese trabajo sin cambiar el universo final.
 */
export function calendarMonthWindows(start: string, end: string): CalendarMonthWindow[] {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
    throw new Error('La ventana de captura debe indicar fechas válidas.');
  }
  if (startDate > endDate) return [];

  const windows: CalendarMonthWindow[] = [];
  let cursor = new Date(startDate);
  while (cursor <= endDate) {
    const nextMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    const windowEnd = new Date(Math.min(endDate.getTime(), nextMonth.getTime() - 1));
    windows.push({
      key: cursor.toISOString().slice(0, 7),
      from: cursor.toISOString(),
      until: windowEnd.toISOString(),
    });
    cursor = nextMonth;
  }
  return windows;
}

export function resolveSptFetchFrom({
  hasExistingCapture,
  historyFrom,
  explicitHistoryFrom,
  bootstrapHistoryFrom,
}: SptFetchWindowOptions) {
  const explicit = explicitHistoryFrom?.trim();
  if (explicit) return explicit;
  const bootstrap = bootstrapHistoryFrom?.trim();
  if (!hasExistingCapture) return bootstrap || DEFAULT_SPT_BOOTSTRAP_HISTORY_FROM;
  return historyFrom;
}

/**
 * La primera captura (o una captura antigua todavía limitada a 45 días) debe
 * completar el mismo año móvil que las facturas. Una vez alcanzada esa
 * cobertura, sólo se vuelven a consultar las fojas recientes: las cerradas
 * anteriores se conservan desde la captura aprobada y no castigan a GESI.
 */
export function resolveLogisticsFetchFrom({
  hasExistingCapture,
  historyFrom,
  rollingFrom,
  existingCoverageFrom,
  explicitFrom,
}: LogisticsFetchWindowOptions) {
  const explicit = explicitFrom?.trim();
  if (explicit) return explicit;
  const existing = existingCoverageFrom?.trim();
  if (!hasExistingCapture || !existing || existing > historyFrom) return historyFrom;
  return rollingFrom;
}

export function captureCacheMatchesActiveBundle(
  captureTimestamp?: string | null,
  activeBundleTimestamp?: string | null,
) {
  return Boolean(captureTimestamp && activeBundleTimestamp && captureTimestamp === activeBundleTimestamp);
}

export function logisticsQueryFrom(fetchFrom: string, overlapDays = 45) {
  const value = new Date(fetchFrom);
  if (!Number.isFinite(value.getTime()) || overlapDays <= 0) return fetchFrom;
  value.setUTCDate(value.getUTCDate() - overlapDays);
  return value.toISOString();
}

/**
 * Al avanzar el año móvil, una foja histórica aprobada todavía puede contener
 * asignaciones del día que acaba de salir de cobertura. Ese pequeño tramo
 * anterior debe seguir disponible para validar la fuente antes de descartarlo.
 */
export function resolveLogisticsInvoiceValidationFrom({
  sheetFetchFrom,
  salesFetchFrom,
  previousCoverageFrom,
}: {
  sheetFetchFrom: string;
  salesFetchFrom: string;
  previousCoverageFrom?: string;
}) {
  return [sheetFetchFrom, salesFetchFrom, previousCoverageFrom?.trim()]
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? sheetFetchFrom;
}
