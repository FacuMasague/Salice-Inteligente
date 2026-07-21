const dayMilliseconds = 86_400_000;

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
