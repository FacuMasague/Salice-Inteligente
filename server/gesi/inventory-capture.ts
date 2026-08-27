import type { GesiRow } from './types.js';

const finiteNumber = (value: unknown) => (
  (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
  && Number.isFinite(Number(value))
) ? Number(value) : NaN;
const isExactNumericZero = (value: unknown) => finiteNumber(value) === 0;
type InventoryScope = { empresaID: number; sucursalID: number; almacenID: number };
const inventoryFields = ['unidad1', 'unidad2', 'unidad1Disponible', 'unidad2Disponible', 'unidad1NPEPendientes', 'unidad2NPEPendientes'] as const;
const inventorySignature = (row: GesiRow) => JSON.stringify(inventoryFields.map((field) => {
  const value = row[field];
  if (value == null || value === '') return null;
  return Number.isFinite(Number(value)) ? Number(value) : String(value);
}));

function assertWarehouseBranch(warehouses: GesiRow[], scope: InventoryScope) {
  const matches = warehouses.filter((row) => finiteNumber(row.almacenID) === scope.almacenID);
  const warehouse = matches[0];
  if (matches.length !== 1 || finiteNumber(warehouse.sucursalID) !== scope.sucursalID
    || (warehouse.empresaID != null && finiteNumber(warehouse.empresaID) !== scope.empresaID)) {
    throw new Error(`El maestro de almacenes no confirma inequívocamente el almacén ${scope.almacenID} de la sucursal ${scope.sucursalID}.`);
  }
}

/** Verifica también la evidencia conservada al reusar o auditar una captura. */
export function auditInventoryBranchResolutions(rows: GesiRow[], scope: InventoryScope, warehouses: GesiRow[] = []) {
  const resolved = rows.filter((row) => Object.hasOwn(row, 'saliceSourceSucursalID'));
  if (resolved.length) assertWarehouseBranch(warehouses, scope);
  for (const row of resolved) {
    if (finiteNumber(row.saliceSourceSucursalID) !== 0
      || finiteNumber(row.empresaID) !== scope.empresaID
      || finiteNumber(row.sucursalID) !== scope.sucursalID
      || finiteNumber(row.almacenID) !== scope.almacenID
      || !inventoryFields.every((field) => Number.isFinite(finiteNumber(row[field])))) {
      throw new Error(`La resolución de sucursal de ${String(row.productoID)} no conserva evidencia válida del alcance y sus cantidades.`);
    }
  }
  return resolved.length;
}

export function normalizeInventoryRows(
  rows: GesiRow[],
  scope: InventoryScope,
  warehouses: GesiRow[] = [],
) {
  auditInventoryBranchResolutions(rows, scope, warehouses);
  const byProduct = new Map<string, GesiRow>();
  const scopeRankByProduct = new Map<string, number>();
  let duplicateRows = 0;
  let invalidRows = 0;
  let repairedScopeRows = 0;
  for (const row of rows) {
    const id = String(row.productoID ?? '').trim();
    if (!id) {
      invalidRows += 1;
      continue;
    }
    const company = finiteNumber(row.empresaID);
    const branch = finiteNumber(row.sucursalID);
    const warehouse = finiteNumber(row.almacenID);
    const zeroInventoryPlaceholder = inventoryFields.every((field) => isExactNumericZero(row[field]));
    const exactScope = company === scope.empresaID && branch === scope.sucursalID && warehouse === scope.almacenID;
    const globalZeroStockPlaceholder = company === 65_535
      && branch === scope.sucursalID
      && warehouse === scope.almacenID
      && zeroInventoryPlaceholder;
    if (
      (company > 0 && company !== scope.empresaID && !globalZeroStockPlaceholder)
      || (branch > 0 && branch !== scope.sucursalID)
      || (warehouse > 0 && warehouse !== scope.almacenID)
    ) {
      throw new Error(`GESI devolvió existencias de ${id} fuera de empresa ${scope.empresaID}, sucursal ${scope.sucursalID} o almacén ${scope.almacenID}.`);
    }
    // GESI puede devolver sucursal 0 en existencias con pedidos pendientes.
    // Sólo el maestro consultado en esta captura permite resolver esa sucursal;
    // nunca se infiere empresa/almacén ni se cambia ninguna cantidad.
    const resolveBranch = company === scope.empresaID && warehouse === scope.almacenID
      && branch === 0 && !zeroInventoryPlaceholder;
    if (resolveBranch) {
      assertWarehouseBranch(warehouses, scope);
      if (!inventoryFields.every((field) => Number.isFinite(finiteNumber(row[field])))) {
        throw new Error(`GESI devolvió cantidades ausentes o no numéricas de ${id}; el maestro no permite completarlas.`);
      }
    }
    const missingScope = !(company > 0) || globalZeroStockPlaceholder || !(branch > 0) || !(warehouse > 0);
    if (missingScope && !zeroInventoryPlaceholder && !resolveBranch) {
      throw new Error(`GESI devolvió existencias no nulas de ${id} sin un alcance verificable de empresa, sucursal y almacén (empresa=${company}, sucursal=${branch}, almacén=${warehouse}).`);
    }
    const normalized = resolveBranch ? {
      ...row,
      sucursalID: scope.sucursalID,
      saliceSourceSucursalID: row.sucursalID,
    } : missingScope ? {
      ...row,
      empresaID: scope.empresaID,
      sucursalID: scope.sucursalID,
      almacenID: scope.almacenID,
    } : row;
    if (missingScope && !resolveBranch) repairedScopeRows += 1;
    const current = byProduct.get(id);
    if (current) {
      duplicateRows += 1;
      if (inventorySignature(current) !== inventorySignature(normalized)) {
        throw new Error(`GESI devolvió filas de existencias duplicadas y conflictivas para ${id}.`);
      }
      const scopeRank = exactScope ? 2 : 1;
      if (scopeRank > (scopeRankByProduct.get(id) ?? 0)) {
        byProduct.set(id, normalized);
        scopeRankByProduct.set(id, scopeRank);
      }
    } else {
      byProduct.set(id, normalized);
      scopeRankByProduct.set(id, exactScope ? 2 : 1);
    }
  }
  return {
    rows: [...byProduct.values()],
    duplicateRows,
    invalidRows,
    repairedScopeRows,
    branchResolvedRows: auditInventoryBranchResolutions([...byProduct.values()], scope, warehouses),
  };
}
