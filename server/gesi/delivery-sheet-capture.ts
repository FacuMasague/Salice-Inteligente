import type { GesiRow } from './types.js';

const date = (value: unknown) => String(value ?? '').slice(0, 10);

export function deliverySheetId(row: GesiRow) {
  return Number(row.fojaID);
}

export function deliverySheetStartsAt(row: GesiRow) {
  return date(row.desde ?? row.fecha);
}

export function deliverySheetEndsAt(row: GesiRow) {
  return date(row.hasta ?? row.desde ?? row.fecha);
}

export function deliverySheetIsClosed(row: GesiRow) {
  const status = String(row.estado ?? '').trim().toUpperCase();
  return status === '2' || status === 'C' || Boolean(date(row.fechaCerrada));
}

export function deliverySheetOverlapsCoverage(row: GesiRow, coverageFrom: string) {
  const end = deliverySheetEndsAt(row);
  return Boolean(end && end >= coverageFrom.slice(0, 10));
}

/**
 * GESI pagina cabeceras sin una clave compuesta adicional. Por eso cualquier
 * ID inválido, repetido o ajeno debe bloquearse antes de mezclar el histórico:
 * deduplicarlo primero ocultaría una captura incompleta o fuera de alcance.
 */
export function assertDeliverySheetHeaders(
  rows: GesiRow[],
  label: string,
  expectedCompanyId = 3,
) {
  const seen = new Set<number>();
  for (const row of rows) {
    const id = deliverySheetId(row);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`${label}: GESI devolvió una foja sin fojaID entero positivo.`);
    }
    if (Number(row.empresaID) !== expectedCompanyId) {
      throw new Error(`${label}: la foja ${id} pertenece a empresa ${Number(row.empresaID) || 'no informada'}; se esperaba ${expectedCompanyId}.`);
    }
    if (seen.has(id)) throw new Error(`${label}: GESI devolvió fojaID ${id} más de una vez.`);
    seen.add(id);
  }
}

export function assertDeliverySheetDetail(row: GesiRow) {
  const id = deliverySheetId(row);
  if (!Array.isArray(row.listaDeComprobantesAsignados)) {
    throw new Error(`La foja ${Number.isInteger(id) && id > 0 ? id : 'sin ID'} no incluye una lista de comprobantes válida.`);
  }
}

/**
 * GetItem representa algunas fojas sin comprobantes con `null`, aun cuando la
 * propiedad está presente. El capturador confirma esa señal con tres lecturas
 * antes de llamar a esta función. Sólo se normaliza un estado logístico conocido
 * y sin contradecir un detalle aprobado anterior. Una propiedad ausente o un
 * valor malformado siguen siendo respuestas incompletas y bloquean el paquete.
 */
export function normalizeNullDeliverySheetAssignments(row: GesiRow, previous?: GesiRow) {
  if (row.listaDeComprobantesAsignados !== null) return row;
  const id = deliverySheetId(row);
  const status = String(row.estado ?? '').trim().toUpperCase();
  if (!deliverySheetIsClosed(row) && status !== '1' && status !== 'A') {
    throw new Error(`La foja ${Number.isInteger(id) && id > 0 ? id : 'sin ID'} devolvió null con un estado logístico no verificable.`);
  }
  const previousAssignments = previous?.listaDeComprobantesAsignados;
  if (Array.isArray(previousAssignments) && previousAssignments.length > 0) {
    throw new Error(`La foja ${id} devolvió null pero el detalle aprobado anterior contenía ${previousAssignments.length} comprobante(s).`);
  }
  return { ...row, listaDeComprobantesAsignados: [] };
}

/**
 * Una captura aprobada también funciona como control de continuidad. Las
 * fojas que estaban dentro de la ventana que acabamos de volver a consultar
 * no pueden desaparecer silenciosamente de GetList: una respuesta paginada
 * parcial produciría un paquete formalmente válido, pero incompleto.
 */
export function assertDeliverySheetContinuity(
  previousRows: GesiRow[],
  fetchedRows: GesiRow[],
  coverageFrom: string,
  fetchFrom: string,
) {
  const fetchDate = fetchFrom.slice(0, 10);
  const expectedIds = previousRows
    .filter((row) => deliverySheetOverlapsCoverage(row, coverageFrom))
    .filter((row) => deliverySheetStartsAt(row) >= fetchDate)
    .map(deliverySheetId);
  const fetchedIds = new Set(fetchedRows.map(deliverySheetId));
  const missingIds = expectedIds.filter((id) => !fetchedIds.has(id));
  if (missingIds.length) {
    const sample = missingIds.slice(0, 10).join(', ');
    throw new Error(`GESI omitió ${missingIds.length} foja(s) que estaban en la captura aprobada y debían volver a consultarse: ${sample}${missingIds.length > 10 ? ', …' : ''}.`);
  }
}

/**
 * El solapamiento de cabeceras puede traer una foja que empezó antes del año
 * móvil y terminó dentro de él. Primero se valida el detalle completo contra
 * facturas fuente de la ventana ampliada; recién después se excluyen de la
 * captura publicada las asignaciones anteriores a la cobertura declarada.
 */
export function scopeDeliverySheetAssignments(
  rows: GesiRow[],
  invoiceHeaders: GesiRow[],
  coverageFrom: string,
  documentIdentity: (row: GesiRow) => string,
  expectedCompanyId = 3,
  expectedBranchId = 3,
  excludedInvoiceIdentities = new Set<string>(),
) {
  const coverageDate = coverageFrom.slice(0, 10);
  const invoiceByIdentity = new Map(invoiceHeaders.map((row) => [documentIdentity(row), row]));
  return rows.map((sheet) => {
    assertDeliverySheetDetail(sheet);
    const scopedAssignments = (sheet.listaDeComprobantesAsignados as GesiRow[]).filter((assigned) => {
      const sourceInvoice = invoiceByIdentity.get(documentIdentity(assigned));
      if (
        Number(assigned.empresaID) !== expectedCompanyId
        || !sourceInvoice
        || Number(sourceInvoice.empresaID) !== expectedCompanyId
      ) {
        throw new Error(`La foja ${deliverySheetId(sheet)} contiene un comprobante que no pertenece al universo empresa ${expectedCompanyId} / sucursal ${expectedBranchId} capturado.`);
      }
      // Las fojas pueden conservar facturas anuladas u operaciones de otra
      // sucursal que GetList no incorpora al universo 3/3. El capturador sólo
      // agrega una identidad a este conjunto después de recuperarla por GetItem
      // y verificar su alcance/estado; nunca se excluye por una mera ausencia.
      if (excludedInvoiceIdentities.has(documentIdentity(assigned))) return false;
      if (Number(sourceInvoice.sucursalID) !== expectedBranchId) {
        throw new Error(`La foja ${deliverySheetId(sheet)} contiene un comprobante que no pertenece al universo empresa ${expectedCompanyId} / sucursal ${expectedBranchId} capturado.`);
      }
      const emittedAt = date(sourceInvoice.fechaDeEmision ?? assigned.fechaDeEmision);
      if (!emittedAt) {
        throw new Error(`La foja ${deliverySheetId(sheet)} contiene un comprobante sin fecha de emisión verificable.`);
      }
      return emittedAt >= coverageDate;
    });
    return { ...sheet, listaDeComprobantesAsignados: scopedAssignments };
  });
}
