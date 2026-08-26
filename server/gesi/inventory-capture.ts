import type { GesiRow } from './types.js';

const isExactNumericZero = (value: unknown) => value != null
  && !(typeof value === 'string' && value.trim() === '')
  && Number.isFinite(Number(value))
  && Number(value) === 0;
const inventoryFields = ['unidad1', 'unidad2', 'unidad1Disponible', 'unidad2Disponible', 'unidad1NPEPendientes', 'unidad2NPEPendientes'] as const;
const inventorySignature = (row: GesiRow) => JSON.stringify(inventoryFields.map((field) => {
  const value = row[field];
  if (value == null || value === '') return null;
  return Number.isFinite(Number(value)) ? Number(value) : String(value);
}));

export function normalizeInventoryRows(
  rows: GesiRow[],
  scope: { empresaID: number; sucursalID: number; almacenID: number },
) {
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
    const company = Number(row.empresaID);
    const branch = Number(row.sucursalID);
    const warehouse = Number(row.almacenID);
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
    const missingScope = company <= 0 || globalZeroStockPlaceholder || branch <= 0 || warehouse <= 0;
    if (missingScope && !zeroInventoryPlaceholder) {
      throw new Error(`GESI devolvió existencias no nulas de ${id} sin un alcance verificable de empresa, sucursal y almacén.`);
    }
    const normalized = missingScope ? {
      ...row,
      empresaID: scope.empresaID,
      sucursalID: scope.sucursalID,
      almacenID: scope.almacenID,
    } : row;
    if (missingScope) repairedScopeRows += 1;
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
  };
}
