import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign, Download, MapPin, Package, ReceiptText, RefreshCw, Truck, UserRound, X } from 'lucide-react';
import type { InvoiceDetailPayload, LogisticsSnapshot } from '../../shared/models';
import { deliveryAssignmentText } from '../lib/delivery-status';
import { compactDate, money, number } from '../lib/format';

interface InvoiceDetailDrawerProps {
  invoiceId: string;
  logistics: LogisticsSnapshot;
  onClose: () => void;
  onOpenClient: (clientId: number) => void;
  onOpenSeller: (seller: string) => void;
  onOpenSheet: (sheetId: number) => void;
}

const statusLabels: Record<InvoiceDetailPayload['status'], string> = {
  paid: 'Pagada', open: 'Abierta', due_soon: 'Por vencer', overdue: 'Vencida', not_due: 'No vencida',
};

export function InvoiceDetailDrawer({ invoiceId, logistics, onClose, onOpenClient, onOpenSeller, onOpenSheet }: InvoiceDetailDrawerProps) {
  const [detail, setDetail] = useState<InvoiceDetailPayload | null>(null);
  const [error, setError] = useState('');
  const deliveryInvoice = logistics.invoices.find((invoice) => invoice.id === invoiceId);

  useEffect(() => {
    setDetail(null);
    setError('');
    const controller = new AbortController();
    fetch(`/api/invoices/detail?id=${encodeURIComponent(invoiceId)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'No se pudo cargar el comprobante.');
        return payload as InvoiceDetailPayload;
      })
      .then(setDetail)
      .catch((cause: Error) => { if (cause.name !== 'AbortError') setError(cause.message); });
    return () => controller.abort();
  }, [invoiceId]);

  return <>
    <button className="invoice-drawer-backdrop" aria-label="Cerrar comprobante" onClick={onClose} />
    <aside className="invoice-detail-drawer" aria-label="Detalle completo del comprobante">
      <header className="invoice-detail-header">
        <div><span className="section-kicker"><ReceiptText size={14} /> Comprobante GESI</span><h2>{detail?.number || 'Cargando comprobante…'}</h2>{detail && <p>{detail.kind === 'credit_note' ? 'Nota de crédito' : 'Factura'} · corte {compactDate(detail.sourceMaxDate)}</p>}</div>
        <button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
      </header>

      {!detail && !error && <div className="invoice-drawer-state"><RefreshCw className="spin" size={24} /><strong>Cargando información disponible…</strong></div>}
      {error && <div className="invoice-drawer-state error"><AlertTriangle size={25} /><strong>{error}</strong></div>}
      {detail && <div className="invoice-detail-body">
        <section className="invoice-client-card">
          <div className="invoice-client-icon"><UserRound size={21} /></div>
          <div><button className="entity-link" onClick={() => onOpenClient(detail.client.id)}><strong>{detail.client.name}</strong></button>{detail.client.tradeName && detail.client.tradeName !== detail.client.name && <span>{detail.client.tradeName}</span>}<small><MapPin size={12} /> {[detail.client.address, detail.client.locality].filter(Boolean).join(', ') || 'Domicilio no informado'}</small></div>
          <button className="entity-link invoice-seller-link" onClick={() => onOpenSeller(detail.client.seller)}>{detail.client.seller}</button>
        </section>

        <section className="invoice-summary-grid">
          <article><CalendarDays size={17} /><span>Emisión</span><strong>{compactDate(detail.issuedAt)}</strong><small>Vence {compactDate(detail.dueAt)}</small></article>
          <article><ReceiptText size={17} /><span>Forma de pago</span><strong>{detail.paymentMethod}</strong><small>{detail.creditTermDays == null ? 'Plazo no informado' : `${number(detail.creditTermDays)} días`}</small></article>
          <article className={detail.outstanding > 0 ? 'attention' : 'settled'}>{detail.outstanding > 0 ? <CircleDollarSign size={17} /> : <CheckCircle2 size={17} />}<span>{detail.outstanding > 0 ? 'Saldo pendiente' : 'Estado'}</span><strong>{detail.outstanding > 0 ? money(detail.outstanding) : statusLabels[detail.status]}</strong><small>Importe {money(detail.amount)}</small></article>
        </section>

        <section className="invoice-source-details">
          <span><strong>Estado</strong>{statusLabels[detail.status]}</span>
          <span><strong>Emisor</strong>{detail.issuer || 'Sin dato verificable'}</span>
          <span><strong>Sucursal</strong>{detail.branch || 'Sin dato verificable'}</span>
          {detail.paidAt && <span><strong>Pago conciliado</strong>{compactDate(detail.paidAt)}</span>}
        </section>

        {deliveryInvoice && <section className={`invoice-logistics-card ${deliveryInvoice.assignmentStatus}`}>
          <div className="invoice-logistics-icon"><Truck size={20} /></div>
          <div>
            <span>Estado en fojas GESI</span>
            <strong>{deliveryAssignmentText(deliveryInvoice.assignmentStatus, deliveryInvoice.sheet?.id)}</strong>
            <small>Envío sugerido {compactDate(deliveryInvoice.suggestedDeliveryAt)} · no confirma expedición ni entrega.</small>
          </div>
          {deliveryInvoice.sheet && <button className="button secondary" onClick={() => onOpenSheet(deliveryInvoice.sheet!.id)}>
            Abrir foja {deliveryInvoice.sheet.id}<ChevronRight size={15} />
          </button>}
        </section>}

        <section className="invoice-line-section">
          <div className="section-title-row"><div><span className="section-kicker"><Package size={14} /> Renglones</span><h3>Detalle de productos</h3></div><span className="count-badge">{number(detail.lineItems.length)}</span></div>
          {!detail.detailAvailable && <div className="invoice-coverage-warning"><AlertTriangle size={17} /><span>GESI no entregó el detalle de esta factura. Se muestran todos los datos de encabezado y saldo que sí están disponibles, sin completar información artificialmente.</span></div>}
          {!!detail.lineItems.length && <div className="invoice-line-table"><header><span>Producto</span><span>Unidades</span><span>Kilos</span><span>Venta neta</span></header>{detail.lineItems.map((item, index) => <article key={`${item.productId}-${index}`}><div><strong>{item.product}</strong><small>{item.productId} · {item.brand} · {item.category}</small></div><span>{number(item.units)}</span><span>{number(item.kilos, 3)}</span><strong>{money(item.netAmount)}</strong></article>)}</div>}
        </section>
      </div>}

      {detail && <footer className="invoice-detail-footer"><span>Comprobante generado con los datos disponibles.</span><a className="button primary" href={`/api/invoices/pdf?id=${encodeURIComponent(detail.id)}`} download><Download size={16} /> Descargar PDF</a></footer>}
    </aside>
  </>;
}
