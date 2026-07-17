import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Check, ChevronRight, Clock3, Mail, MapPin, Package, Phone, Route, Save, Sparkles, TrendingDown, TrendingUp, WalletCards, X } from 'lucide-react';
import type { Client, Product, Recommendation } from '../../shared/models';
import { compactDate, longDate, money, paymentDelay, shortDate } from '../lib/format';

const healthLabel = { healthy: 'Riesgo bajo', attention: 'Atención', critical: 'Riesgo alto' } as const;
const invoiceLabel = { paid: 'Pagada', open: 'Abierta', due_soon: 'Por vencer', overdue: 'Vencida' } as const;

interface ClientPanelProps {
  client: Client;
  products: Product[];
  onClose: () => void;
  onPlanRoute: (clientId: number) => void;
  onNoteSaved: (clientId: number, note: string) => void;
}

export function ClientPanel({ client, products, onClose, onPlanRoute, onNoteSaved }: ClientPanelProps) {
  const [tab, setTab] = useState<'summary' | 'purchases' | 'account'>('summary');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState('');
  const [note, setNote] = useState(client.note);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setTab('summary');
    setNote(client.note);
    setSaved(false);
    setRecommendations([]);
    setRecommendationError('');
    if (!client.active) {
      setRecommendationLoading(false);
      return;
    }
    const controller = new AbortController();
    setRecommendationLoading(true);
    fetch(`/api/clients/${client.id}/recommendations`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('No se pudieron calcular'); return response.json(); })
      .then((payload) => setRecommendations(payload.recommendations || []))
      .catch((error: Error) => { if (error.name !== 'AbortError') setRecommendationError('No se pudieron calcular las sugerencias.'); })
      .finally(() => { if (!controller.signal.aborted) setRecommendationLoading(false); });
    return () => controller.abort();
  }, [client.id, client.active]);

  const purchased = useMemo(() => {
    const grouped = new Map<string, { product: Product; quantity: number; total: number; lastDate: string }>();
    client.purchases.forEach((purchase) => {
      const product = products.find((item) => item.id === purchase.productId);
      if (!product) return;
      const current = grouped.get(product.id) || { product, quantity: 0, total: 0, lastDate: purchase.date };
      current.quantity += purchase.quantity;
      current.total += purchase.total;
      if (purchase.date > current.lastDate) current.lastDate = purchase.date;
      grouped.set(product.id, current);
    });
    return [...grouped.values()].sort((a, b) => b.total - a.total);
  }, [client.purchases, products]);

  const saveNote = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError('');
    try {
      const response = await fetch(`/api/clients/${client.id}/note`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      if (!response.ok) throw new Error('No se pudo guardar');
      onNoteSaved(client.id, note);
      setSaved(true);
    } catch {
      setSaveError('No se pudo guardar. La nota anterior sigue intacta.');
    } finally {
      setSaving(false);
    }
  };

  const utilization = client.creditLimit ? Math.round(Math.max(0, client.balance) / client.creditLimit * 100) : 0;
  const openInvoices = client.invoices.filter((invoice) => invoice.outstanding > 0);

  return (
    <aside className="client-panel" data-tour="client-panel">
      <div className="client-panel-header">
        <button className="icon-button panel-close" onClick={onClose} aria-label="Cerrar ficha"><X size={18} /></button>
        <div className="client-avatar">{client.tradeName.split(' ').map((word) => word[0]).slice(0, 2).join('')}</div>
        <div className="client-title-block">
          <div className="eyebrow">{client.reference} · {client.segment}</div>
          <h2>{client.tradeName}</h2>
          <p><MapPin size={14} /> {client.address}, {client.locality}</p>
        </div>
        <div className="client-header-statuses"><span className={`gesi-status-badge ${client.active ? 'active' : 'inactive'}`}>{client.active ? 'Activo GESI' : 'Inactivo GESI'}</span><span className={`portfolio-badge ${client.portfolioStatus}`}>{client.portfolioStatus === 'confirmed' ? 'Salice confirmado' : 'Revisar cartera'}</span>{client.active && <span className={`health-badge ${client.health}`}>{healthLabel[client.health]}</span>}</div>
      </div>

      <div className="client-contact-row">
        {client.phone ? <a href={`tel:${client.phone}`}><Phone size={15} /> {client.phone}</a> : <span><Phone size={15} /> Sin teléfono</span>}
        {client.email ? <a href={`mailto:${client.email}`}><Mail size={15} /> Email</a> : <span><Mail size={15} /> Sin email</span>}
        <span><span className="seller-dot" /> {client.seller}</span>
      </div>

      <div className="panel-tabs" role="tablist">
        <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>Resumen</button>
        <button className={tab === 'purchases' ? 'active' : ''} onClick={() => setTab('purchases')}>Compras</button>
        <button className={tab === 'account' ? 'active' : ''} onClick={() => setTab('account')}>Cuenta corriente</button>
      </div>

      <div className="client-panel-body">
        {tab === 'summary' && (
          <>
            {!client.active && <div className="inactive-client-notice"><AlertTriangle size={19} /><div><strong>Fuera de la cartera activa</strong><span>GESI lo marca como inactivo. Se conserva para consulta histórica; última actualización del maestro: {longDate(client.statusUpdatedAt)}.</span></div></div>}
            {client.active && client.portfolioStatus === 'review' && <div className="portfolio-review-notice"><AlertTriangle size={18} /><div><strong>Pertenencia a Salice por confirmar</strong><span>Está activo en GESI pero no tiene definición explícita para empresa 3 / sucursal 3. No se excluye automáticamente.</span></div></div>}
            {client.salesBlocked && <div className="sales-block-notice"><AlertTriangle size={18} /><div><strong>GESI informa “bloqueo de ventas”</strong><span>Validar con administración qué uso operativo tiene este campo antes de tomar una decisión.</span></div></div>}
            <section className="metric-grid three">
              <article className="mini-metric">
                <span>Ventas 90 días</span>
                <strong>{money(client.sales90d, true)}</strong>
                <small className={client.salesDelta >= 0 ? 'positive' : 'negative'}>
                  {client.salesDelta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {Math.abs(client.salesDelta)}% vs. período anterior
                </small>
              </article>
              <article className="mini-metric">
                <span>Riesgo de cobranza</span>
                <strong>C{client.collectionRisk}</strong>
                <small>{money(client.overdueOutstanding, true)} vencido · {client.oldestOverdueDays || 0} días máx.</small>
              </article>
              <article className="mini-metric">
                <span>Oportunidad comercial</span>
                <strong>O{client.commercialOpportunity}</strong>
                <small>P{client.visitPriority} prioridad combinada</small>
              </article>
            </section>

            {client.active && client.health !== 'healthy' && (
              <div className={`attention-card ${client.health}`}>
                <AlertTriangle size={19} />
                <div>
                  <strong>{client.health === 'critical' ? 'Revisar cobranza antes de vender' : 'Seguimiento de cobranza recomendado'}</strong>
                  <span>{openInvoices.some((invoice) => invoice.status === 'overdue') ? `Tiene ${money(client.overdueOutstanding)} vencidos; el más antiguo lleva ${client.oldestOverdueDays} días.` : 'Tiene vencimientos próximos o conducta de pago a seguir.'}</span>
                </div>
              </div>
            )}

            {client.active ? <section className="panel-section">
              <div className="section-title-row">
                <div><span className="section-kicker"><Sparkles size={14} /> Motor de oportunidades</span><h3>Qué ofrecer en la próxima visita</h3></div>
                <span className="algorithm-pill">Algorítmico</span>
              </div>
              <p className="section-description">Afinidad vectorial, adopción en pares confirmados de Salice, zona y rotación. El gasto pondera el perfil para no mezclar unidades incompatibles.</p>
              <div className="recommendation-list">
                {recommendationLoading && <p className="section-description">Calculando sugerencias para este cliente…</p>}
                {recommendationError && <p className="form-error">{recommendationError}</p>}
                {recommendations.slice(0, 3).map((recommendation) => (
                  <article className="recommendation-card" key={recommendation.product.id}>
                    <div className="product-icon"><Package size={18} /></div>
                    <div className="recommendation-copy">
                      <strong>{recommendation.product.name}</strong>
                      <span>{recommendation.reason}</span>
                      <small>{recommendation.product.price > 0 ? money(recommendation.product.price) : 'Sin precio'} · Stock {recommendation.product.stock} · <span className={`confidence ${recommendation.confidence}`}>{recommendation.confidence === 'reliable' ? 'Confiable' : recommendation.confidence === 'exploratory' ? 'Exploratoria' : 'Datos insuficientes'}</span></small>
                    </div>
                    <div className="score-ring" style={{ '--score': recommendation.score } as React.CSSProperties}>
                      <span>{recommendation.score}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section> : <section className="panel-section"><div className="section-title-row"><div><span className="section-kicker"><Sparkles size={14} /> Motor de oportunidades</span><h3>Recomendaciones pausadas</h3></div></div><p className="section-description inactive-recommendation-copy">Los clientes inactivos no participan de comparaciones, recomendaciones ni recorridos. Podés consultar sus compras y su cuenta corriente desde las otras pestañas.</p></section>}

            <section className="panel-section next-action">
              <div className="section-title-row">
                <div><span className="section-kicker"><CalendarDays size={14} /> {client.active ? 'Próxima acción' : 'Registro interno'}</span><h3>{client.active ? `Visita · ${longDate(client.nextVisitAt)}` : 'Notas históricas del cliente'}</h3></div>
                {client.active && <strong className="priority-number">P{client.visitPriority}</strong>}
              </div>
              <textarea value={note} onChange={(event) => { setNote(event.target.value); setSaved(false); }} maxLength={500} aria-label="Nota para la próxima visita" />
              {saveError && <p className="form-error">{saveError}</p>}
              <div className="action-row">
                <button className="button secondary" onClick={saveNote} disabled={saving || note === client.note}>
                  {saved ? <Check size={15} /> : <Save size={15} />} {saved ? 'Guardada' : saving ? 'Guardando…' : 'Guardar nota'}
                </button>
                {client.active && <button className="button primary" onClick={() => onPlanRoute(client.id)}><Route size={15} /> Agregar a ruta</button>}
              </div>
            </section>
          </>
        )}

        {tab === 'purchases' && (
          <section className="panel-section first">
            <div className="section-title-row"><div><span className="section-kicker">Últimos 90 días</span><h3>Mix de compra</h3></div><strong>{purchased.length} productos</strong></div>
            <div className="purchase-list">
              {!purchased.length && <p className="section-description">No hay detalle de productos en la ventana de 90 días.</p>}
              {purchased.map((item, index) => (
                <article key={item.product.id} className="purchase-row">
                  <span className="purchase-rank">{index + 1}</span>
                  <div className="purchase-copy"><strong>{item.product.name}</strong><span>{item.quantity} unidades · última compra {shortDate(item.lastDate)}</span></div>
                  <strong>{money(item.total, true)}</strong>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === 'account' && (
          <>
            <section className="credit-card panel-section first">
              <div className="credit-top"><span>Condición de pago</span><strong>{client.paymentMethod}</strong></div>
              {client.creditLimit > 0 && <><div className="credit-track"><span style={{ width: `${Math.min(100, utilization)}%` }} /></div><div className="credit-values"><span>Saldo neto GESI {money(client.balance)}</span><span>Límite {money(client.creditLimit)} · uso {utilization}%</span></div></>}
              {!client.creditLimit && <div className="credit-values no-limit"><span>Saldo neto GESI {money(client.balance)}</span><span>GESI no informa límite; no se calcula utilización</span></div>}
            </section>
            <section className="panel-section">
              <div className="section-title-row"><div><span className="section-kicker"><WalletCards size={14} /> Comprobantes</span><h3>Historial de cuenta</h3></div></div>
              <div className="invoice-list">
                {!client.invoices.length && <p className="section-description">No hay comprobantes pendientes ni pagos conciliados en la ventana analizada.</p>}
                {client.invoices.map((invoice) => (
                  <article className="invoice-row" key={invoice.id}>
                    <div className={`invoice-status-dot ${invoice.status}`} />
                    <div className="invoice-copy">
                      <strong>{invoice.number}</strong>
                      <span>Emitida {compactDate(invoice.issuedAt)} · vence {compactDate(invoice.dueAt)}</span>
                      {invoice.paidAt && <small><Check size={12} /> Pagada {compactDate(invoice.paidAt)}</small>}
                    </div>
                    <div className="invoice-amount"><strong>{money(invoice.outstanding > 0 ? invoice.outstanding : invoice.amount)}</strong><span className={`status-text ${invoice.status}`}>{invoiceLabel[invoice.status]}{invoice.outstanding > 0 && invoice.outstanding !== invoice.amount ? ' · saldo' : ''}</span></div>
                  </article>
                ))}
              </div>
            </section>
            <div className="payment-behavior">
              <Clock3 size={18} />
              <div><strong>Comportamiento contra vencimiento</strong><span>{client.paymentSampleSize ? `Paga en promedio ${paymentDelay(client.avgPaymentDelayDays)} · ${client.onTimePaymentRate}% en término sobre ${client.paymentSampleSize} facturas conciliadas. Tiempo total desde emisión: ${client.avgPaymentDays} días.` : 'Aún no hay facturas con vencimiento y cobranza conciliados en los últimos 365 días.'}</span></div>
              <ChevronRight size={17} />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
