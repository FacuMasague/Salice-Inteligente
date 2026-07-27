import { describe, expect, it } from 'vitest';
import { resolveSptFetchFrom } from './capture-window.js';

describe('resolveSptFetchFrom', () => {
  const historyFrom = '2025-07-28T00:00:00.000Z';

  it('usa el histórico completo sólo al inicializar un disco vacío', () => {
    expect(resolveSptFetchFrom({
      hasExistingCapture: false,
      historyFrom,
      bootstrapHistoryFrom: '2025-01-01',
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
