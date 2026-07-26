import { describe, expect, it } from 'vitest';
import { formatAiDisplayText } from './ai-display';

describe('presentación de cifras generadas por IA', () => {
  it('redondea porcentajes a dos decimales', () => {
    expect(formatAiDisplayText('La variación fue 12.34567% y luego -4,567 %.'))
      .toBe('La variación fue 12,35 % y luego -4,57 %.');
    expect(formatAiDisplayText('El cumplimiento llegó a 80%.'))
      .toBe('El cumplimiento llegó a 80,00 %.');
  });

  it('redondea valores absolutos decimales a enteros', () => {
    expect(formatAiDisplayText('Se registraron 1234.5678 kg y $ 9.876,54.'))
      .toBe('Se registraron 1.235 kg y $ 9.877.');
  });

  it('preserva enteros, fechas, versiones y separadores de miles', () => {
    expect(formatAiDisplayText('Al 25-07-2026 hubo 30 clientes, 1.234 casos y versión 0.9.5.'))
      .toBe('Al 25-07-2026 hubo 30 clientes, 1.234 casos y versión 0.9.5.');
  });

  it('elimina referencias internas sin afectar el formateo', () => {
    expect(formatAiDisplayText('Avance de 51.2399% [general:metric:completion].'))
      .toBe('Avance de 51,24 %.');
  });
});
