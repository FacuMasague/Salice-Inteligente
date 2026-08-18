import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, Clock3, FileText,
  MapPin, MessageSquareText, Truck, UserRound, X,
} from 'lucide-react';
import type { Client, DeliverySheet, LogisticsSnapshot } from '../../shared/models';
import { clientPrimaryName } from '../lib/client-name';
import { compactDate, money, number } from '../lib/format';

interface DeliverySheetDetailDrawerProps {
  sheet: DeliverySheet;
  logistics: LogisticsSnapshot;
  clients: Client[];
  onClose: () => void;
  onOpenClient: (clientId: number) => void;
  onOpenInvoice: (invoiceId: string) => void;
}

function dateTime(value: string | null) {
  if (!value) return 'No informada';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${compactDate(value)} · hora no conservada`;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(parsed);
}

export function DeliverySheetDetailDrawer({
  sheet,
  logistics,
  clients,
  onClose,
  onOpenClient,
  onOpenInvoice,
}: DeliverySheetDetailDrawerProps) {
  const invoiceById = new Map(logistics.invoices.map((invoice) => [invoice.id, invoice]));
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const invoices = sheet.invoiceIds.map((id) => invoiceById.get(id)).filter((invoice) => invoice != null);
  const clientIds = [...new Set(invoices.map((invoice) => invoice.clientId))];
  const total = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);

  return <>
    <button className="delivery-sheet-drawer-backdrop" aria-label="Cerrar foja" onClick={onClose} />
    <aside className="delivery-sheet-detail-drawer" aria-label={`Detalle de foja ${sheet.id}`}>
      <header className="delivery-sheet-detail-header">
        <div>
          <span className="section-kicker"><Truck size={14} /> Foja de reparto GESI</span>
          <h2>Foja {sheet.id}</h2>
          <p>{sheet.status === 'closed' ? 'Cerrada administrativamente' : 'Abierta'} · sólo lectura</p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
      </header>

      <div className="delivery-sheet-detail-body">
        <div className="delivery-sheet-caveat">
          <AlertTriangle size={17} />
          <span>Una foja cerrada confirma el cierre de la carga en GESI; no demuestra expedición ni entrega al cliente.</span>
        </div>

        <section className="delivery-sheet-summary-grid">
          <article className={sheet.status}><CheckCircle2 size={18} /><span>Estado</span><strong>{sheet.status === 'closed' ? 'Cerrada' : 'Abierta'}</strong><small>Cierre {dateTime(sheet.closedAt)}</small></article>
          <article><UserRound size={18} /><span>Repartidor</span><strong>{sheet.driver || 'No informado'}</strong><small>Asignación de la cabecera</small></article>
          <article><FileText size={18} /><span>Contenido</span><strong>{number(invoices.length)} comprobantes</strong><small>{number(clientIds.length)} clientes · {money(total, true)}</small></article>
        </section>

        <section className="delivery-sheet-source-details">
          <div><CalendarDays size={14} /><span><strong>Período</strong><small>{compactDate(sheet.startsAt)}–{compactDate(sheet.endsAt)}</small></span></div>
          <div><Clock3 size={14} /><span><strong>Fecha expedida</strong><small>{sheet.dispatchedAt ? dateTime(sheet.dispatchedAt) : 'No informada por GESI'}</small></span></div>
          <div><MapPin size={14} /><span><strong>Zona</strong><small>{sheet.zone || 'No informada'}</small></span></div>
          <div><MapPin size={14} /><span><strong>Subzona</strong><small>{sheet.subzone || 'No informada'}</small></span></div>
        </section>

        <section className="delivery-sheet-comments">
          <div><MessageSquareText size={15} /><span><strong>Comentario de la foja</strong>{sheet.comment || 'Sin comentario informado'}</span></div>
          <div><MessageSquareText size={15} /><span><strong>Comentario de expedición</strong>{sheet.dispatchComment || 'No informado por GESI'}</span></div>
        </section>

        <section className="delivery-sheet-invoices">
          <div className="section-title-row">
            <div><span className="section-kicker"><FileText size={14} /> Comprobantes asignados</span><h3>Contenido de la foja</h3></div>
            <span className="count-badge">{number(invoices.length)}</span>
          </div>
          {!invoices.length && <p className="section-description">Esta foja no contiene facturas identificables en los datos actuales.</p>}
          <div className="delivery-sheet-invoice-list">
            {invoices.map((invoice) => {
              const client = clientById.get(invoice.clientId);
              return <article key={invoice.id}>
                <button className="delivery-sheet-invoice-main" onClick={() => onOpenInvoice(invoice.id)}>
                  <span><strong>{invoice.number}</strong><small>Facturada {compactDate(invoice.issuedAt)} · {money(invoice.amount, true)}</small></span>
                  <ChevronRight size={15} />
                </button>
                <button className="delivery-sheet-client-link" disabled={!client} onClick={() => client && onOpenClient(client.id)}>
                  {client ? clientPrimaryName(client) : `Cliente ${invoice.clientId}`}
                </button>
              </article>;
            })}
          </div>
        </section>
      </div>
    </aside>
  </>;
}
