import { describe, expect, it } from 'vitest';
import { normalizeInventoryRows } from './inventory-capture.js';

const scope = { empresaID: 3, sucursalID: 3, almacenID: 2 };

describe('normalización de existencias GESI', () => {
  it('excluye filas sin producto, deduplica y completa el alcance omitido por el endpoint filtrado', () => {
    const result = normalizeInventoryRows([
      { productoID: '', unidad1Disponible: 0 },
      { productoID: 'P-1', empresaID: 3, sucursalID: 3, almacenID: 2 },
      { productoID: 'P-1', empresaID: 3, sucursalID: 3, almacenID: 2 },
      { productoID: 'P-2', empresaID: 0, sucursalID: null, almacenID: '' },
      { productoID: 'P-3', empresaID: 65_535, sucursalID: 3, almacenID: 2, unidad1Disponible: 0, unidad2Disponible: 0 },
    ], scope);

    expect(result.invalidRows).toBe(1);
    expect(result.duplicateRows).toBe(1);
    expect(result.repairedScopeRows).toBe(2);
    expect(result.rows).toEqual([
      { productoID: 'P-1', empresaID: 3, sucursalID: 3, almacenID: 2 },
      { productoID: 'P-2', empresaID: 3, sucursalID: 3, almacenID: 2 },
      { productoID: 'P-3', empresaID: 3, sucursalID: 3, almacenID: 2, unidad1Disponible: 0, unidad2Disponible: 0 },
    ]);
  });

  it('rechaza una fila que declara explícitamente otro alcance', () => {
    expect(() => normalizeInventoryRows([
      { productoID: 'P-7', empresaID: 7, sucursalID: 3, almacenID: 2 },
    ], scope)).toThrow(/fuera de empresa 3/);
    expect(() => normalizeInventoryRows([
      { productoID: 'P-65535', empresaID: 65_535, sucursalID: 3, almacenID: 2, unidad1Disponible: 1, unidad2Disponible: 0 },
    ], scope)).toThrow(/fuera de empresa 3/);
  });
});
