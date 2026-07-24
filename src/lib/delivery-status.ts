import type { DeliveryAssignmentStatus, LogisticsSnapshot } from '../../shared/models';

export const DELIVERY_ASSIGNMENT_LABELS: Record<DeliveryAssignmentStatus, string> = {
  unassigned: 'Sin asignar a foja',
  open_sheet: 'Foja abierta',
  closed_sheet: 'Foja cerrada',
  unknown: 'Estado de foja no confirmado',
};

export function deliveryAssignmentText(status: DeliveryAssignmentStatus, sheetId?: number) {
  if (status === 'open_sheet' && sheetId) return `Foja ${sheetId} abierta`;
  if (status === 'closed_sheet' && sheetId) return `Foja ${sheetId} cerrada`;
  return DELIVERY_ASSIGNMENT_LABELS[status];
}

export type InvoiceDeliveryDisplayStatus = DeliveryAssignmentStatus | 'outside_coverage' | 'unavailable';

export interface InvoiceDeliveryDisplay {
  status: InvoiceDeliveryDisplayStatus;
  label: string;
  sheetId?: number;
}

export function invoiceDeliveryDisplay(
  invoiceId: string,
  issuedAt: string,
  logistics: LogisticsSnapshot,
): InvoiceDeliveryDisplay {
  const deliveryInvoice = logistics.invoices.find((invoice) => invoice.id === invoiceId);
  if (deliveryInvoice) {
    return {
      status: deliveryInvoice.assignmentStatus,
      label: deliveryAssignmentText(deliveryInvoice.assignmentStatus, deliveryInvoice.sheet?.id),
      sheetId: deliveryInvoice.sheet?.id,
    };
  }

  const invoiceDate = issuedAt.slice(0, 10);
  const coverageFrom = logistics.coverageFrom.slice(0, 10);
  const coverageThrough = logistics.coverageThrough.slice(0, 10);
  if (invoiceDate < coverageFrom || invoiceDate > coverageThrough) {
    return { status: 'outside_coverage', label: 'Fuera de cobertura de fojas' };
  }
  return { status: 'unavailable', label: 'Estado de foja no confirmado' };
}
