import { describe, expect, it } from 'vitest';
import { normalizeInventoryRows } from './inventory-capture.js';

const scope = { empresaID: 3, sucursalID: 3, almacenID: 2 };

describe('normalización de existencias GESI', () => {
  it('excluye filas sin producto, deduplica y completa el alcance omitido por el endpoint filtrado', () => {
    const result = normalizeInventoryRows([
      { productoID: '', unidad1Disponible: 0 },
      { productoID: 'P-1', empresaID: 3, sucursalID: 3, almacenID: 2 },
      { productoID: 'P-1', empresaID: 3, sucursalID: 3, almacenID: 2 },
      { productoID: 'P-2', empresaID: 0, sucursalID: null, almacenID: '', unidad1: 0, unidad2: 0, unidad1Disponible: 0, unidad2Disponible: 0, unidad1NPEPendientes: 0, unidad2NPEPendientes: 0 },
      { productoID: 'P-3', empresaID: 65_535, sucursalID: 3, almacenID: 2, unidad1: 0, unidad2: 0, unidad1Disponible: 0, unidad2Disponible: 0, unidad1NPEPendientes: 0, unidad2NPEPendientes: 0 },
    ], scope);

    expect(result.invalidRows).toBe(1);
    expect(result.duplicateRows).toBe(1);
    expect(result.repairedScopeRows).toBe(2);
    expect(result.rows).toEqual([
      { productoID: 'P-1', empresaID: 3, sucursalID: 3, almacenID: 2 },
      { productoID: 'P-2', empresaID: 3, sucursalID: 3, almacenID: 2, unidad1: 0, unidad2: 0, unidad1Disponible: 0, unidad2Disponible: 0, unidad1NPEPendientes: 0, unidad2NPEPendientes: 0 },
      { productoID: 'P-3', empresaID: 3, sucursalID: 3, almacenID: 2, unidad1: 0, unidad2: 0, unidad1Disponible: 0, unidad2Disponible: 0, unidad1NPEPendientes: 0, unidad2NPEPendientes: 0 },
    ]);
  });

  it('rechaza una fila que declara explícitamente otro alcance', () => {
    expect(() => normalizeInventoryRows([
      { productoID: 'P-7', empresaID: 7, sucursalID: 3, almacenID: 2 },
    ], scope)).toThrow(/fuera de empresa 3/);
    expect(() => normalizeInventoryRows([
      { productoID: 'P-65535', empresaID: 65_535, sucursalID: 3, almacenID: 2, unidad1Disponible: 1, unidad2Disponible: 0 },
    ], scope)).toThrow(/fuera de empresa 3/);
    expect(() => normalizeInventoryRows([
      { productoID: 'P-65535-FISICO', empresaID: 65_535, sucursalID: 3, almacenID: 2, unidad1: 1, unidad2: 0, unidad1Disponible: 0, unidad2Disponible: 0 },
    ], scope)).toThrow(/fuera de empresa 3/);
    expect(() => normalizeInventoryRows([
      { productoID: 'P-65535-INCOMPLETO', empresaID: 65_535, sucursalID: 3, almacenID: 2, unidad1: null, unidad2: 0, unidad1Disponible: 0, unidad2Disponible: 0 },
    ], scope)).toThrow(/fuera de empresa 3/);
    expect(() => normalizeInventoryRows([
      { productoID: 'P-65535-SIN-ALCANCE', empresaID: 65_535, sucursalID: null, almacenID: null, unidad1: 0, unidad2: 0, unidad1Disponible: 0, unidad2Disponible: 0, unidad1NPEPendientes: 0, unidad2NPEPendientes: 0 },
    ], scope)).toThrow(/fuera de empresa 3/);
    expect(() => normalizeInventoryRows([
      { productoID: 'P-PENDIENTE', empresaID: 0, sucursalID: 0, almacenID: 0, unidad1: 0, unidad2: 0, unidad1Disponible: 0, unidad2Disponible: 0, unidad1NPEPendientes: 1, unidad2NPEPendientes: 0 },
    ], scope)).toThrow(/sin un alcance verificable/);
    expect(() => normalizeInventoryRows([
      { productoID: 'P-SIN-ALCANCE', empresaID: 0, sucursalID: 0, almacenID: 0, unidad1: 1, unidad2: 0, unidad1Disponible: 1, unidad2Disponible: 0, unidad1NPEPendientes: 0, unidad2NPEPendientes: 0 },
    ], scope)).toThrow(/sin un alcance verificable/);
  });

  it('prefiere la fila exacta si el duplicado cero es equivalente y bloquea cifras conflictivas', () => {
    const zero = { productoID: 'P-1', unidad1: 0, unidad2: 0, unidad1Disponible: 0, unidad2Disponible: 0, unidad1NPEPendientes: 0, unidad2NPEPendientes: 0 };
    const result = normalizeInventoryRows([
      { ...zero, empresaID: 65_535, sucursalID: 3, almacenID: 2 },
      { ...zero, empresaID: 3, sucursalID: 3, almacenID: 2 },
    ], scope);
    expect(result.rows[0].empresaID).toBe(3);
    expect(result.duplicateRows).toBe(1);
    expect(() => normalizeInventoryRows([
      { ...zero, empresaID: 65_535, sucursalID: 3, almacenID: 2 },
      { ...zero, empresaID: 3, sucursalID: 3, almacenID: 2, unidad1: 2, unidad1Disponible: 2 },
    ], scope)).toThrow(/duplicadas y conflictivas/);
  });
});
