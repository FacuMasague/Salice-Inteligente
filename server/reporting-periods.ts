const dayMilliseconds = 86_400_000;
const REPORTING_TIME_ZONE = 'America/Argentina/Buenos_Aires';
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function localDate(value: string, timeZone: string) {
  if (!value) return '';
  if (isoDatePattern.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Fecha hasta la que un paquete permite informar actividad, aunque todavía no
 * existan movimientos en ese día o mes. Nunca retrocede respecto de la última
 * venta y usa el huso horario operativo de Salice.
 */
export function reportingDate(maxMovementDate: string, capturedAt: string, timeZone = REPORTING_TIME_ZONE) {
  const capturedDate = localDate(capturedAt, timeZone);
  const movementDate = isoDatePattern.test(maxMovementDate) ? maxMovementDate : '';
  return [movementDate, capturedDate].filter(Boolean).sort().at(-1) ?? '';
}

export function includeReportingMonth(months: string[], date: string, order: 'asc' | 'desc' = 'desc') {
  const reportingMonth = date.slice(0, 7);
  const values = [...new Set([...months.filter((month) => /^\d{4}-\d{2}$/.test(month)), reportingMonth].filter(Boolean))];
  return values.sort((left, right) => order === 'asc' ? left.localeCompare(right) : right.localeCompare(left));
}

export function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day, 12));
}

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function monthStart(year: number, month: number) {
  return utcDate(year, month, 1);
}

export function monthEnd(year: number, month: number) {
  return utcDate(year, month + 1, 0);
}

export function shiftedMonth(year: number, month: number, delta: number) {
  const shifted = utcDate(year, month + delta, 1);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() };
}

export function cutoffDate(year: number, month: number, day: number) {
  return utcDate(year, month, Math.min(day, monthEnd(year, month).getUTCDate()));
}

export function daysInclusive(start: string, end: string) {
  return Math.round((new Date(`${end}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) / dayMilliseconds) + 1;
}

export function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function shiftDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDate(date);
}

export function previousThreeFullMonths(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return {
    from: isoDate(utcDate(year, month - 3, 1)),
    through: isoDate(utcDate(year, month, 0)),
  };
}
