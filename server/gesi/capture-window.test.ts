import { describe, expect, it } from 'vitest';
import {
  captureCacheMatchesActiveBundle,
  logisticsQueryFrom,
  resolveLogisticsInvoiceValidationFrom,
  resolveLogisticsFetchFrom,
  resolveSptFetchFrom,
} from './capture-window.js';

describe('resolveSptFetchFrom', () => {
  const historyFrom = '2025-07-28T00:00:00.000Z';

  it('usa el histórico completo sólo al inicializar un disco vacío', () => {
    expect(resolveSptFetchFrom({
      hasExistingCapture: false,
      historyFrom,
      bootstrapHistoryFrom: '2025-01-01',
    })).toBe('2025-01-01');
  });

  it('protege una instalación local nueva aunque falte la variable de bootstrap', () => {
    expect(resolveSptFetchFrom({
      hasExistingCapture: false,
      historyFrom,
    })).toBe('2025-01-01');
  });

  it('usa la ventana móvil cuando ya existe una captura persistida', () => {
    expect(resolveSptFetchFrom({
      hasExistingCapture: true,
      historyFrom,
      bootstrapHistoryFrom: '2025-01-01',
    })).toBe(historyFrom);
  });

  it('respeta un rango explícito para tareas operativas excepcionales', () => {
    expect(resolveSptFetchFrom({
      hasExistingCapture: true,
      historyFrom,
      explicitHistoryFrom: '2024-01-01',
      bootstrapHistoryFrom: '2025-01-01',
    })).toBe('2024-01-01');
  });
});

describe('resolveLogisticsFetchFrom', () => {
  const historyFrom = '2025-08-25T00:00:00.000Z';
  const rollingFrom = '2026-07-11T00:00:00.000Z';

  it('carga el año móvil completo al inicializar una captura', () => {
    expect(resolveLogisticsFetchFrom({
      hasExistingCapture: false,
      historyFrom,
      rollingFrom,
    })).toBe(historyFrom);
  });

  it('amplía una captura anterior limitada a 45 días', () => {
    expect(resolveLogisticsFetchFrom({
      hasExistingCapture: true,
      historyFrom,
      rollingFrom,
      existingCoverageFrom: '2026-07-11T00:00:00.000Z',
    })).toBe(historyFrom);
  });

  it('reutiliza el histórico y consulta sólo la ventana reciente una vez completado', () => {
    expect(resolveLogisticsFetchFrom({
      hasExistingCapture: true,
      historyFrom,
      rollingFrom,
      existingCoverageFrom: historyFrom,
    })).toBe(rollingFrom);
  });

  it('respeta un inicio explícito para una auditoría excepcional', () => {
    expect(resolveLogisticsFetchFrom({
      hasExistingCapture: true,
      historyFrom,
      rollingFrom,
      existingCoverageFrom: historyFrom,
      explicitFrom: '2026-01-01',
    })).toBe('2026-01-01');
  });
});

describe('seguridad del histórico logístico', () => {
  it('sólo reutiliza el raw que produjo el paquete activo', () => {
    expect(captureCacheMatchesActiveBundle('2026-08-24T22:16:39.310Z', '2026-08-24T22:16:39.310Z')).toBe(true);
    expect(captureCacheMatchesActiveBundle('2026-08-25T10:00:00.000Z', '2026-08-24T22:16:39.310Z')).toBe(false);
    expect(captureCacheMatchesActiveBundle(null, '2026-08-24T22:16:39.310Z')).toBe(false);
  });

  it('consulta un solapamiento para no perder fojas que cruzan el corte', () => {
    expect(logisticsQueryFrom('2025-08-25T00:00:00.000Z')).toBe('2025-07-11T00:00:00.000Z');
  });

  it('conserva un día de facturas auxiliares al avanzar la cobertura aprobada', () => {
    expect(resolveLogisticsInvoiceValidationFrom({
      sheetFetchFrom: '2026-07-12T00:00:00.000Z',
      salesFetchFrom: '2025-08-26T00:00:00.000Z',
      previousCoverageFrom: '2025-08-25T00:00:00.000Z',
    })).toBe('2025-08-25T00:00:00.000Z');
  });

  it('no amplía facturas cuando ventas ya cubre toda la validación logística', () => {
    expect(resolveLogisticsInvoiceValidationFrom({
      sheetFetchFrom: '2025-07-11T00:00:00.000Z',
      salesFetchFrom: '2025-01-01',
      previousCoverageFrom: '2025-08-25T00:00:00.000Z',
    })).toBe('2025-01-01');
  });
});
