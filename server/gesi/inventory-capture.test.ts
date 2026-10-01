import { describe, expect, it, vi } from 'vitest';
import { auditInventoryBranchResolutions, completeInventoryRows, normalizeInventoryRows } from './inventory-capture.js';

const scope = { empresaID: 3, sucursalID: 3, almacenID: 2 };
const warehouses = [{ almacenID: 2, sucursalID: 3, descripcion: 'Depósito de prueba' }];
const pendingWithoutBranch = {
  productoID: 'P-PEDIDO', empresaID: 3, sucursalID: 0, almacenID: 2,
  unidad1: 0, unidad2: 0, unidad1Disponible: -2, unidad2Disponible: -1.5,
  unidad1NPEPendientes: 2, unidad2NPEPendientes: 1.5,
};

describe('recuperación de existencias omitidas por paginación', () => {
  const stock = (productoID: string) => ({ ...pendingWithoutBranch, productoID, sucursalID: 3 });
  const products = [{ productoID: 'P1' }, { productoID: 'P2' }];

  it('consulta sólo el código faltante y conserva cantidades físicas, disponibles y pendientes', async () => {
    const fetch = vi.fn(async () => [stock('P2')]);
    const initial = [stock('P1'), stock('P1')];
    const result = await completeInventoryRows(products, initial, scope, warehouses, fetch);
    expect(fetch).toHaveBeenCalledWith(['P2']);
    expect(result.rows).toEqual([stock('P1'), stock('P2')]);
    expect(result.recoveredProductIDs).toEqual(['P2']);
    expect(result.duplicateRows).toBe(1);
    expect(initial).toHaveLength(2);
  });

  it('no consulta la fuente cuando la captura ya está completa', async () => {
    const fetch = vi.fn();
    const result = await completeInventoryRows(products, products.map((p) => stock(p.productoID)), scope, warehouses, fetch);
    expect(fetch).not.toHaveBeenCalled();
    expect(result.recoveredProductIDs).toEqual([]);
  });

  it('divide la recuperación en lotes pequeños sin perder códigos', async () => {
    const masters = Array.from({ length: 81 }, (_, i) => ({ productoID: `P${i}` }));
    const fetch = vi.fn(async (codes: string[]) => codes.map(stock));
    const result = await completeInventoryRows(masters, [], scope, warehouses, fetch);
    expect(fetch.mock.calls.map(([codes]) => codes.length)).toEqual([40, 40, 1]);
    expect(result.rows.map((row) => row.productoID)).toEqual(masters.map((row) => row.productoID));
  });

  it('bloquea una respuesta vacía en vez de fabricar stock cero o reutilizar stock anterior', async () => {
    await expect(completeInventoryRows(products, [stock('P1')], scope, warehouses, async () => [])).rejects.toThrow(/P2/);
  });

  it.each([
    { productoID: 'AJENO' }, { empresaID: 7 }, { almacenID: 12 },
    { unidad1: null }, { unidad2Disponible: '' },
  ])('rechaza códigos, alcance o cantidades inválidos: %j', async (changes) => {
    await expect(completeInventoryRows(products, [stock('P1')], scope, warehouses,
      async () => [{ ...stock('P2'), ...changes }])).rejects.toThrow();
  });

  it('rechaza cantidades conflictivas y conserva evidencia de sucursal resuelta', async () => {
    await expect(completeInventoryRows(products, [stock('P1')], scope, warehouses,
      async () => [stock('P2'), { ...stock('P2'), unidad1Disponible: 4 }])).rejects.toThrow(/conflictivas/);
    const result = await completeInventoryRows(products, [stock('P1')], scope, warehouses,
      async () => [{ ...pendingWithoutBranch, productoID: 'P2' }]);
    expect(result.branchResolvedRows).toBe(1);
    expect(auditInventoryBranchResolutions(result.rows, scope, warehouses)).toBe(1);
  });
});

describe('normalización de existencias GESI', () => {
  it('resuelve sucursal cero con el maestro del almacén sin modificar cantidades ni la entrada', () => {
    const result = normalizeInventoryRows([pendingWithoutBranch], scope, warehouses);
    expect(result.rows).toEqual([{ ...pendingWithoutBranch, sucursalID: 3, saliceSourceSucursalID: 0 }]);
    expect(result.branchResolvedRows).toBe(1);
    expect(result.repairedScopeRows).toBe(0);
    expect(pendingWithoutBranch.sucursalID).toBe(0);
    expect(normalizeInventoryRows(result.rows, scope, warehouses).rows).toEqual(result.rows);
    expect(() => normalizeInventoryRows(result.rows, scope)).toThrow(/maestro/);
  });

  it.each([
    [],
    [{ almacenID: 12, sucursalID: 3 }],
    [{ almacenID: 2, sucursalID: 7 }],
    [{ almacenID: 2 }],
    [{ almacenID: 2, sucursalID: 3, empresaID: 7 }],
    [{ almacenID: 2, sucursalID: 3 }, { almacenID: 2, sucursalID: 7 }],
  ].map((rows) => ({ rows })))('bloquea un maestro ausente, ajeno o ambiguo: $rows', ({ rows }) => {
    expect(() => normalizeInventoryRows([pendingWithoutBranch], scope, rows)).toThrow();
  });

  it.each([
    { empresaID: 7 }, { empresaID: 65_535 }, { empresaID: 0 },
    { almacenID: 12 }, { almacenID: 0 }, { sucursalID: 7 },
    { sucursalID: undefined }, { sucursalID: null }, { sucursalID: '' },
    { sucursalID: 'inválida' }, { sucursalID: -1 }, { sucursalID: false },
    { unidad1: null }, { unidad2NPEPendientes: undefined }, { unidad1Disponible: 'inválida' },
  ])('no usa el maestro para aceptar otro alcance o cantidades incompletas: %j', (changes) => {
    expect(() => normalizeInventoryRows([{ ...pendingWithoutBranch, ...changes }], scope, warehouses)).toThrow();
  });

  it('audita la sucursal original, las cantidades y el maestro persistidos sin exigirlos a capturas antiguas', () => {
    const resolved = { ...pendingWithoutBranch, sucursalID: 3, saliceSourceSucursalID: 0 };
    expect(auditInventoryBranchResolutions([resolved], scope, warehouses)).toBe(1);
    expect(auditInventoryBranchResolutions([{ ...pendingWithoutBranch, sucursalID: 3 }], scope)).toBe(0);
    expect(() => auditInventoryBranchResolutions([resolved], scope)).toThrow(/maestro/);
    expect(() => auditInventoryBranchResolutions([resolved], scope, [{ almacenID: 2, sucursalID: 7 }])).toThrow(/maestro/);
    for (const changes of [{ saliceSourceSucursalID: 7 }, { sucursalID: 0 }, { empresaID: 7 }, { unidad2: null }]) {
      expect(() => auditInventoryBranchResolutions([{ ...resolved, ...changes }], scope, warehouses)).toThrow(/evidencia/);
    }
  });

  it('mantiene el rechazo de duplicados conflictivos después de resolver la sucursal', () => {
    expect(() => normalizeInventoryRows([
      pendingWithoutBranch,
      { ...pendingWithoutBranch, sucursalID: 3, unidad1Disponible: 5 },
    ], scope, warehouses)).toThrow(/duplicadas y conflictivas/);
    const result = normalizeInventoryRows([
      pendingWithoutBranch, { ...pendingWithoutBranch, sucursalID: 3 },
    ], scope, warehouses);
    expect(result.rows).toEqual([{ ...pendingWithoutBranch, sucursalID: 3 }]);
    expect(result.duplicateRows).toBe(1);
    expect(result.branchResolvedRows).toBe(0);
  });

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
