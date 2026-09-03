import type { LogisticsSnapshot } from '../../shared/models';
import { compactDate } from '../lib/format';

export function DeliverySheetHistory({ logistics, onOpenInvoice }: {
  logistics: LogisticsSnapshot;
  onOpenInvoice: (id: string) => void;
}) {
  const history = logistics.sheets.filter((sheet) => sheet.sourceUnavailable);
  const invoiceById = new Map(logistics.invoices.map((invoice) => [invoice.id, invoice]));
  if (!history.length) return null;
  return <details className="data-card delivery-sheet-history">
        <summary>Fojas históricas no disponibles en GESI ({history.length})</summary>
        <p>Se conservan sus últimas asociaciones aprobadas, pero no se usan como asignaciones actuales. No se presume cierre ni entrega. Los importes de los comprobantes corresponden a los datos actuales.</p>
        {history.map((sheet) => <details key={sheet.id}>
          <summary>Foja {sheet.id} · último estado: {sheet.status === 'closed' ? 'cerrada' : 'abierta'} · {sheet.invoiceIds.length} comprobante{sheet.invoiceIds.length === 1 ? ' histórico' : 's históricos'} · verificada {compactDate(sheet.sourceUnavailable!.lastVerifiedAt)}</summary>
          {sheet.invoiceIds.map((id) => <button className="entity-link" key={id} onClick={() => onOpenInvoice(id)}>{invoiceById.get(id)?.number ?? id}</button>)}
        </details>)}
      </details>;
}
