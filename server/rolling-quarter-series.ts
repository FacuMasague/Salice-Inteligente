import { isoDate, monthEnd, monthStart, shiftedMonth, utcDate } from './reporting-periods.js';

export interface RollingCalendarQuarterWindow {
  quarter: string;
  label: string;
  year: number;
  start: string;
  end: string;
  naturalStart: string;
  naturalEnd: string;
  previousYearStart: string;
  previousYearEnd: string;
  isPartial: boolean;
}

function previousYearDate(value: string) {
  const year = Number(value.slice(0, 4)) - 1;
  const month = Number(value.slice(5, 7)) - 1;
  const day = Number(value.slice(8, 10));
  const clampedDay = Math.min(day, monthEnd(year, month).getUTCDate());
  return isoDate(utcDate(year, month, clampedDay));
}

/**
 * Divide los últimos 13 meses visibles en sus trimestres calendario reales.
 * Los extremos se conservan como tramos parciales y su comparación interanual
 * replica exactamente los mismos meses y días del año anterior.
 */
export function rollingCalendarQuarterWindows(reportingDate: string, monthCount = 13, coverageFrom = ''): RollingCalendarQuarterWindow[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportingDate) || monthCount < 1) return [];
  const latestYear = Number(reportingDate.slice(0, 4));
  const latestMonth = Number(reportingDate.slice(5, 7)) - 1;
  const first = shiftedMonth(latestYear, latestMonth, -(monthCount - 1));
  const requestedWindowStart = isoDate(monthStart(first.year, first.month));
  const windowStart = /^\d{4}-\d{2}-\d{2}$/.test(coverageFrom) && coverageFrom > requestedWindowStart
    ? coverageFrom
    : requestedWindowStart;
  const windowStartYear = Number(windowStart.slice(0, 4));
  const windowStartMonth = Number(windowStart.slice(5, 7)) - 1;
  const firstQuarterMonth = Math.floor(windowStartMonth / 3) * 3;
  const windows: RollingCalendarQuarterWindow[] = [];

  for (let offset = 0; ; offset += 3) {
    const shifted = shiftedMonth(windowStartYear, firstQuarterMonth, offset);
    const naturalStart = isoDate(monthStart(shifted.year, shifted.month));
    if (naturalStart > reportingDate) break;
    const naturalEnd = isoDate(monthEnd(shifted.year, shifted.month + 2));
    const start = naturalStart < windowStart ? windowStart : naturalStart;
    const end = naturalEnd > reportingDate ? reportingDate : naturalEnd;
    if (start <= end) {
      const quarterNumber = Math.floor(shifted.month / 3) + 1;
      windows.push({
        quarter: `T${quarterNumber}`,
        label: `T${quarterNumber} ${shifted.year}`,
        year: shifted.year,
        start,
        end,
        naturalStart,
        naturalEnd,
        previousYearStart: previousYearDate(start),
        previousYearEnd: previousYearDate(end),
        isPartial: start > naturalStart || end < naturalEnd,
      });
    }
    if (naturalEnd >= reportingDate) break;
  }

  return windows;
}
