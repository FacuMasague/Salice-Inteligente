import type { GesiRow } from './types.js';

export function normalizeInventoryRows(
  rows: GesiRow[],
  scope: { empresaID: number; sucursalID: number; almacenID: number },
) {
  const byProduct = new Map<string, GesiRow>();
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
    const globalZeroStockPlaceholder = company === 65_535
      && Number(row.unidad1Disponible) === 0
      && Number(row.unidad2Disponible) === 0;
    if (
      (company > 0 && company !== scope.empresaID && !globalZeroStockPlaceholder)
      || (branch > 0 && branch !== scope.sucursalID)
      || (warehouse > 0 && warehouse !== scope.almacenID)
    ) {
      throw new Error(`GESI devolvió existencias de ${id} fuera de empresa ${scope.empresaID}, sucursal ${scope.sucursalID} o depósito ${scope.almacenID}.`);
    }
    const missingScope = company <= 0 || globalZeroStockPlaceholder || branch <= 0 || warehouse <= 0;
    const normalized = missingScope ? {
      ...row,
      empresaID: scope.empresaID,
      sucursalID: scope.sucursalID,
      almacenID: scope.almacenID,
    } : row;
    if (missingScope) repairedScopeRows += 1;
    if (byProduct.has(id)) duplicateRows += 1;
    else byProduct.set(id, normalized);
  }
  return {
    rows: [...byProduct.values()],
    duplicateRows,
    invalidRows,
    repairedScopeRows,
  };
}
