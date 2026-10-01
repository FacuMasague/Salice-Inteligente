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

export const DEFAULT_SPT_BOOTSTRAP_HISTORY_FROM = '2025-01-01';

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

/** Document emission dates have day grain; query and retention must share a cut. */
export function gesiDocumentQueryFrom(value: string) {
  const day = value.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== day) throw new Error(`Inicio de consulta documental inválido: ${value}`);
  return parsed.toISOString();
}

export const SPT_HISTORY_CONTINUITY_VERSION = 1;

/** Older captures may have silently dropped each annual boundary day. Rebuild
 * the full history once; only an approved capture can enable incremental reuse. */
export function canReuseSptHistory(approved: boolean, version?: number) {
  return approved && version === SPT_HISTORY_CONTINUITY_VERSION;
}
