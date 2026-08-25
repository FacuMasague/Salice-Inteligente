import { describe, expect, it } from 'vitest';
import {
  assertDeliverySheetDetail,
  assertDeliverySheetContinuity,
  assertDeliverySheetHeaders,
  deliverySheetIsClosed,
  deliverySheetOverlapsCoverage,
  scopeDeliverySheetAssignments,
} from './delivery-sheet-capture.js';

describe('captura de fojas', () => {
  it('acepta cabeceras únicas de empresa 3', () => {
    expect(() => assertDeliverySheetHeaders([
      { fojaID: 10, empresaID: 3 },
      { fojaID: 11, empresaID: 3 },
    ], 'Prueba')).not.toThrow();
  });

  it('bloquea IDs inválidos, repetidos o de otra empresa antes de deduplicar', () => {
    expect(() => assertDeliverySheetHeaders([{ fojaID: 0, empresaID: 3 }], 'Prueba')).toThrow(/entero positivo/);
    expect(() => assertDeliverySheetHeaders([
      { fojaID: 10, empresaID: 3 },
      { fojaID: 10, empresaID: 3 },
    ], 'Prueba')).toThrow(/más de una vez/);
    expect(() => assertDeliverySheetHeaders([{ fojaID: 10, empresaID: 7 }], 'Prueba')).toThrow(/empresa 7/);
  });

  it('exige que el detalle conserve una lista, incluso cuando está vacía', () => {
    expect(() => assertDeliverySheetDetail({ fojaID: 10, listaDeComprobantesAsignados: [] })).not.toThrow();
    expect(() => assertDeliverySheetDetail({ fojaID: 10 })).toThrow(/lista de comprobantes válida/);
  });

  it('incluye una foja que empezó antes del corte pero termina dentro de la cobertura', () => {
    expect(deliverySheetOverlapsCoverage({ desde: '2025-08-01', hasta: '2025-09-01' }, '2025-08-25')).toBe(true);
    expect(deliverySheetOverlapsCoverage({ desde: '2025-07-01', hasta: '2025-08-20' }, '2025-08-25')).toBe(false);
  });

  it('reconoce cierres por estado o fecha', () => {
    expect(deliverySheetIsClosed({ estado: 2 })).toBe(true);
    expect(deliverySheetIsClosed({ estado: 'A', fechaCerrada: '2026-08-20' })).toBe(true);
    expect(deliverySheetIsClosed({ estado: 1 })).toBe(false);
  });

  it('bloquea una respuesta reciente que omite una foja de la captura aprobada', () => {
    const previous = [
      { fojaID: 10, empresaID: 3, desde: '2026-08-01', hasta: '2026-08-30' },
      { fojaID: 11, empresaID: 3, desde: '2025-08-01', hasta: '2025-08-20' },
    ];
    expect(() => assertDeliverySheetContinuity(
      previous,
      [],
      '2025-08-25',
      '2026-07-11',
    )).toThrow(/omitió 1 foja/);
    expect(() => assertDeliverySheetContinuity(
      previous,
      [{ fojaID: 10, empresaID: 3 }],
      '2025-08-25',
      '2026-07-11',
    )).not.toThrow();
  });

  it('valida el solapamiento completo y publica sólo asignaciones dentro de la cobertura', () => {
    const identity = (row: Record<string, unknown>) => String(row.numero);
    const [sheet] = scopeDeliverySheetAssignments([
      {
        fojaID: 10,
        empresaID: 3,
        listaDeComprobantesAsignados: [
          { empresaID: 3, numero: 100 },
          { empresaID: 3, numero: 101 },
        ],
      },
    ], [
      { empresaID: 3, sucursalID: 3, numero: 100, fechaDeEmision: '2025-08-20' },
      { empresaID: 3, sucursalID: 3, numero: 101, fechaDeEmision: '2025-08-25' },
    ], '2025-08-25', identity);
    expect(sheet.listaDeComprobantesAsignados).toEqual([{ empresaID: 3, numero: 101 }]);
  });

  it('bloquea asignaciones sin factura fuente 3/3 aun cuando son anteriores al corte', () => {
    const identity = (row: Record<string, unknown>) => String(row.numero);
    expect(() => scopeDeliverySheetAssignments([
      {
        fojaID: 10,
        empresaID: 3,
        listaDeComprobantesAsignados: [{ empresaID: 3, numero: 100 }],
      },
    ], [
      { empresaID: 3, sucursalID: 7, numero: 100, fechaDeEmision: '2025-08-20' },
    ], '2025-08-25', identity)).toThrow(/empresa 3 \/ sucursal 3/);
  });
});
