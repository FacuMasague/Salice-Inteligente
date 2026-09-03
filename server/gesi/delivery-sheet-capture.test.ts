import { GesiHttpError } from './client.js';
import { describe, expect, it, vi } from 'vitest';
import {
  assertDeliverySheetDetail,
  assertDeliverySheetContinuity,
  assertDeliverySheetHeaders,
  deliverySheetContinuityGaps,
  deliverySheetIsClosed,
  deliverySheetOverlapsCoverage,
  normalizeNullDeliverySheetAssignments,
  scopeDeliverySheetAssignments,
  recoverMissingDeliverySheet,
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

  it('normaliza null como lista vacía en estados conocidos y sin contradicción histórica', () => {
    const normalized = normalizeNullDeliverySheetAssignments({
      fojaID: 10,
      estado: 1,
      fechaCerrada: '2026-08-20T12:00:00',
      listaDeComprobantesAsignados: null,
    });
    expect(normalized.listaDeComprobantesAsignados).toEqual([]);
    expect(() => assertDeliverySheetDetail(normalized)).not.toThrow();

    const open = normalizeNullDeliverySheetAssignments({
      fojaID: 11,
      estado: 1,
      listaDeComprobantesAsignados: null,
    });
    expect(open.listaDeComprobantesAsignados).toEqual([]);

    expect(() => normalizeNullDeliverySheetAssignments({
      fojaID: 12,
      estado: 2,
      listaDeComprobantesAsignados: null,
    }, {
      fojaID: 12,
      estado: 2,
      listaDeComprobantesAsignados: [{ comprobanteID: 99 }],
    })).toThrow(/detalle aprobado anterior contenía 1 comprobante/);

    expect(() => normalizeNullDeliverySheetAssignments({
      fojaID: 13,
      estado: 'desconocido',
      listaDeComprobantesAsignados: null,
    })).toThrow(/estado logístico no verificable/);
  });

  it('no convierte una propiedad ausente ni un valor malformado', () => {
    const missing = normalizeNullDeliverySheetAssignments({ fojaID: 10, estado: 2 });
    const malformed = normalizeNullDeliverySheetAssignments({ fojaID: 11, estado: 2, listaDeComprobantesAsignados: {} });
    expect(() => assertDeliverySheetDetail(missing)).toThrow(/lista de comprobantes válida/);
    expect(() => assertDeliverySheetDetail(malformed)).toThrow(/lista de comprobantes válida/);
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
    expect(deliverySheetContinuityGaps(previous, [], '2025-08-25', '2026-07-11'))
      .toEqual([previous[0]]);
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

  it('excluye una factura anulada sólo después de recibir una fuente 3/3 verificada', () => {
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
      { empresaID: 3, sucursalID: 3, numero: 100, fechaDeEmision: '2025-08-25' },
      { empresaID: 3, sucursalID: 3, numero: 101, fechaDeEmision: '2025-08-25', anulado: true },
    ], '2025-08-25', identity, 3, 3, new Set(['101']));
    expect(sheet.listaDeComprobantesAsignados).toEqual([{ empresaID: 3, numero: 100 }]);

    const [foreignSheet] = scopeDeliverySheetAssignments([
      {
        fojaID: 11,
        empresaID: 3,
        listaDeComprobantesAsignados: [{ empresaID: 3, numero: 101 }],
      },
    ], [
      { empresaID: 3, sucursalID: 7, numero: 101, fechaDeEmision: '2025-08-25', anulado: true },
    ], '2025-08-25', identity, 3, 3, new Set(['101']));
    expect(foreignSheet.listaDeComprobantesAsignados).toEqual([]);
  });
});

describe('fojas ausentes de un listado completo', () => {
  const previous = { empresaID: 3, fojaID: 15051, estado: 1, fechaCerrada: null, listaDeComprobantesAsignados: [{ numero: 123 }] };
  const unavailable = () => new GesiHttpError(400, 4041, 'no disponible');
  it('conserva la foja abierta y sus comprobantes sólo como historia tras tres confirmaciones', async () => {
    const client = { request: vi.fn().mockRejectedValue(unavailable()), login: vi.fn().mockResolvedValue(undefined) };
    const result = await recoverMissingDeliverySheet(client, previous, '2026-09-03', '2026-09-02');
    expect(result).toMatchObject({ ...previous, saliceSourceUnavailable: { confirmations: 3, lastVerifiedAt: '2026-09-02' } });
    expect(client.request).toHaveBeenCalledTimes(3);
    expect(client.login).toHaveBeenCalledTimes(2);
    expect(previous).not.toHaveProperty('saliceSourceUnavailable');
  });
  it.each([new GesiHttpError(400, null, 'HTTP 400'), new GesiHttpError(401, 4041, 'HTTP 401'), new Error('timeout')])('no convierte errores ambiguos en historia', async (error) => {
    const client = { request: vi.fn().mockRejectedValueOnce(unavailable()).mockRejectedValueOnce(error), login: vi.fn().mockResolvedValue(undefined) };
    await expect(recoverMissingDeliverySheet(client, previous, '2026-09-03', '2026-09-02')).rejects.toThrow(error.message);
  });
  it('restaura una foja que reaparece sin arrastrar la marca histórica', async () => {
    const client = { request: vi.fn().mockRejectedValueOnce(unavailable()).mockResolvedValueOnce({ fojaReparto: previous }), login: vi.fn().mockResolvedValue(undefined) };
    const result = await recoverMissingDeliverySheet(client, { ...previous, saliceSourceUnavailable: {} }, '2026-09-03', '2026-09-02');
    expect(result).toEqual(previous);
  });
  it.each([{ ...previous, fojaID: 15052 }, { ...previous, empresaID: 7 }, { ...previous, listaDeComprobantesAsignados: null }, {}])('rechaza detalles incorrectos sin rellenarlos con datos antiguos', async (detail) => {
    const client = { request: vi.fn().mockResolvedValue({ fojaReparto: detail }), login: vi.fn() };
    await expect(recoverMissingDeliverySheet(client, previous, '2026-09-03', '2026-09-02')).rejects.toThrow();
  });
});
