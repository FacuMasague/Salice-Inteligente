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

  it('reemplaza las abreviaturas históricas de señales por nombres comprensibles', () => {
    expect(formatAiDisplayText('Riesgo de cobranza C72, oportunidad O61 y prioridad P68.'))
      .toBe('Riesgo de cobranza 72/100, oportunidad comercial 61/100 y prioridad de revisión 68/100.');
    expect(formatAiDisplayText('Las señales C/O/P deben leerse por separado.'))
      .toBe('Las señales de riesgo de cobranza, oportunidad comercial y prioridad de revisión deben leerse por separado.');
    expect(formatAiDisplayText('Riesgo de cobranza crítico (C=88). La prioridad P=80 refuerza la revisión. O no registra valor.'))
      .toBe('Riesgo de cobranza crítico (88/100). La prioridad de revisión 80/100 refuerza la revisión. La oportunidad comercial no registra valor.');
    expect(formatAiDisplayText('El período P13 se conserva sin cambios.'))
      .toBe('El período P13 se conserva sin cambios.');
  });
});
