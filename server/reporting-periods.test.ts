import { describe, expect, it } from 'vitest';
import {
  cutoffDate,
  daysInclusive,
  includeReportingMonth,
  isoDate,
  previousThreeFullMonths,
  reportingDate,
  shiftDays,
  shiftedMonth,
} from './reporting-periods';

describe('cortes temporales canónicos', () => {
  it('limita el corte equivalente al último día real del mes', () => {
    expect(isoDate(cutoffDate(2026, 1, 31))).toBe('2026-02-28');
    expect(isoDate(cutoffDate(2024, 1, 31))).toBe('2024-02-29');
  });

  it('calcula ventanas inclusivas y desplazamientos sin depender de la zona horaria', () => {
    expect(daysInclusive('2026-07-01', '2026-07-20')).toBe(20);
    expect(shiftDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftedMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });

  it('define los tres meses calendario completos anteriores', () => {
    expect(previousThreeFullMonths('2026-07-20')).toEqual({ from: '2026-04-01', through: '2026-06-30' });
  });

  it('avanza al mes del paquete aunque la última venta sea del mes anterior', () => {
    expect(reportingDate('2026-07-31', '2026-08-03T13:00:00.000Z')).toBe('2026-08-03');
    expect(includeReportingMonth(['2026-07', '2026-06'], '2026-08-03')).toEqual(['2026-08', '2026-07', '2026-06']);
  });

  it('respeta la fecha argentina cerca de medianoche UTC y nunca retrocede', () => {
    expect(reportingDate('2026-07-31', '2026-08-01T01:30:00.000Z')).toBe('2026-07-31');
    expect(reportingDate('2026-08-04', '2026-08-03T13:00:00.000Z')).toBe('2026-08-04');
  });
});
