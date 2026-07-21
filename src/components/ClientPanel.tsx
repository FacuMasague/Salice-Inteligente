import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CalendarDays, Check, ChevronRight, CircleDollarSign, ClipboardCheck, Clock3, Mail, MapPin, Maximize2, Package, Phone, Route, Save, Sparkles, TrendingDown, TrendingUp, WalletCards, X } from 'lucide-react';
import type { Client, CommercialActivity, PaymentPromise, Product, Recommendation } from '../../shared/models';
import { compactDate, creditTermDetail, creditTermLabel, longDate, money, paymentDelay, shortDate } from '../lib/format';

const healthLabel = { healthy: 'Riesgo bajo', attention: 'Atención', critical: 'Riesgo alto' } as const;
const invoiceLabel = { paid: 'Pagada', open: 'Abierta', due_soon: 'Por vencer', overdue: 'Vencida' } as const;

interface ClientPanelProps {
  client: Client;
  products: Product[];
  onClose: () => void;
  onPlanRoute: (clientId: number) => void;
  onNoteSaved: (clientId: number, note: string) => void;
  mode?: 'compact' | 'full';
  snapshotDate?: string;
  onExpand?: () => void;
  onOpenSeller?: (seller: string) => void;
  onOpenProduct?: (product: Product) => void;
}

function ClientProfileCharts({ client, snapshotDate }: { client: Client; snapshotDate: string }) {
  const anchor = new Date(snapshotDate);
  const monthLabels = Array.from({ length: 6 }, (_, index) => new Intl.DateTimeFormat('es-AR', { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 5 + index, 1))).replace('.', ''));
  const maxSales = Math.max(1, ...client.salesTrend);
  const delays = client.paymentDelayTrend;
  const maxDelay = Math.max(1, ...delays.map((value) => Math.abs(value)));
  return <section className="client-profile-analytics">
    <div className="client-financial-kpis">
      <article><span>Pago promedio desde emisión</span><strong>{client.paymentSampleSize ? `${client.avgPaymentDays} días` : 'Sin muestra'}</strong><small>{client.paymentSampleSize} facturas conciliadas</small></article>
      <article><span>Pago contra vencimiento</span><strong>{client.paymentSampleSize ? paymentDelay(client.avgPaymentDelayDays) : 'Sin muestra'}</strong><small>{client.onTimePaymentRate}% de pagos en término</small></article>
      <article><span>Plazo habitual de cuenta corriente</span><strong>{creditTermLabel(client)}</strong><small>{client.creditTermSampleSize ? `${client.creditTermSampleSize} facturas observadas` : client.paymentMethod}</small></article>
      <article><span>Saldo vencido actual</span><strong>{money(client.overdueOutstanding, true)}</strong><small>{client.oldestOverdueDays ? `${client.oldestOverdueDays} días de antigüedad máxima` : 'Sin comprobantes vencidos'}</small></article>
    </div>
    <div className="client-profile-chart-grid">
      <article className="client-profile-chart"><header><div><span className="section-kicker"><BarChart3 size={14} /> Evolución comercial</span><h3>Compras mensuales · 6 meses</h3></div><strong>{money(client.salesTrend.reduce((sum, value) => sum + value, 0), true)}</strong></header><div className="client-sales-bars">{client.salesTrend.map((value, index) => <div key={`${monthLabels[index]}-${index}`} title={`${monthLabels[index]}: ${money(value)}`}><span><i style={{ height: `${Math.max(2, value / maxSales * 100)}%` }} /></span><strong>{monthLabels[index]}</strong><small>{money(value, true)}</small></div>)}</div></article>
      <article className="client-profile-chart"><header><div><span className="section-kicker"><Clock3 size={14} /> Conducta de pago</span><h3>Días contra vencimiento · últimas facturas</h3></div><strong>{client.paymentSampleSize ? paymentDelay(client.avgPaymentDelayDays) : 'Sin muestra'}</strong></header>{delays.length ? <div className="client-delay-chart">{delays.map((value, index) => <div key={`${value}-${index}`} title={`${value > 0 ? `${value} días tarde` : value < 0 ? `${Math.abs(value)} días antes` : 'En fecha'}`}><span className="delay-positive"><i style={{ height: value > 0 ? `${Math.max(3, value / maxDelay * 100)}%` : 0 }} /></span><b /><span className="delay-negative"><i style={{ height: value < 0 ? `${Math.max(3, Math.abs(value) / maxDelay * 100)}%` : 0 }} /></span><small>{index + 1}</small></div>)}</div> : <div className="client-chart-empty">No hay pagos conciliados suficientes para dibujar la evolución.</div>}<footer><span><i className="early" />Antes del vencimiento</span><span><i className="late" />Después del vencimiento</span></footer></article>
    </div>
  </section>;
}

export function ClientPanel({ client, products, onClose, onPlanRoute, onNoteSaved, mode = 'compact', snapshotDate = new Date().toISOString(), onExpand, onOpenSeller, onOpenProduct }: ClientPanelProps) {
  const [tab, setTab] = useState<'summary' | 'purchases' | 'account' | 'operations'>('summary');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState('');
  const [note, setNote] = useState(client.note);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [activities, setActivities] = useState<CommercialActivity[]>([]);
  const [promises, setPromises] = useState<PaymentPromise[]>([]);

  useEffect(() => {
    setTab('summary');
    setNote(client.note);
    setSaved(false);
    setRecommendations([]);
    setRecommendationError('');
    setActivities([]);
    setPromises([]);
    const controller = new AbortController();
    fetch(`/api/clients/${client.id}/operations`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => { setActivities(payload.activities || []); setPromises(payload.promises || []); })
      .catch((error: Error) => { if (error.name !== 'AbortError') { setActivities([]); setPromises([]); } });
    if (!client.active) {
      setRecommendationLoading(false);
      return () => controller.abort();
    }
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
    <aside className={`client-panel ${mode === 'full' ? 'client-profile' : 'client-panel-compact'}`} data-tour="client-panel" aria-label={`Ficha de ${client.tradeName}`}>
      <div className="client-panel-header">
        <div className="client-panel-actions">{mode === 'compact' && onExpand && <button className="icon-button" onClick={onExpand} aria-label="Expandir ficha completa" title="Abrir ficha completa"><Maximize2 size={17} /></button>}<button className="icon-button" onClick={onClose} aria-label="Cerrar ficha"><X size={18} /></button></div>
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
        {onOpenSeller ? <button className="client-seller-link" onClick={() => onOpenSeller(client.seller)}><span className="seller-dot" /> {client.seller}<ChevronRight size={13} /></button> : <span><span className="seller-dot" /> {client.seller}</span>}
      </div>

      <div className="panel-tabs" role="tablist">
        <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>Resumen</button>
        <button className={tab === 'purchases' ? 'active' : ''} onClick={() => setTab('purchases')}>Compras</button>
        <button className={tab === 'account' ? 'active' : ''} onClick={() => setTab('account')}>Cuenta corriente</button>
        <button className={tab === 'operations' ? 'active' : ''} onClick={() => setTab('operations')}>Gestiones</button>
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

            {mode === 'full' && <ClientProfileCharts client={client} snapshotDate={snapshotDate} />}

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
                      <button className="entity-link product-entity-link" onClick={() => onOpenProduct?.(recommendation.product)}>{recommendation.product.name}<ChevronRight size={12} /></button>
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
                  <div className="purchase-copy"><button className="entity-link product-entity-link" onClick={() => onOpenProduct?.(item.product)}>{item.product.name}<ChevronRight size={12} /></button><span>{item.quantity} unidades · última compra {shortDate(item.lastDate)}</span></div>
                  <strong>{money(item.total, true)}</strong>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === 'account' && (
          <>
            <section className="credit-card panel-section first">
              <div className="credit-top"><span>Condición configurada en GESI</span><strong>{client.paymentMethod}</strong></div>
              {client.creditLimit > 0 && <><div className="credit-track"><span style={{ width: `${Math.min(100, utilization)}%` }} /></div><div className="credit-values"><span>Saldo neto GESI {money(client.balance)}</span><span>Límite {money(client.creditLimit)} · uso {utilization}%</span></div></>}
              {!client.creditLimit && <div className="credit-values no-limit"><span>Saldo neto GESI {money(client.balance)}</span><span>GESI no informa límite; no se calcula utilización</span></div>}
            </section>
            <section className={`observed-term-card panel-section ${client.creditTermStatus}`}>
              <div className="section-title-row"><div><span className="section-kicker"><CalendarDays size={14} /> Plazo observado</span><h3>{creditTermLabel(client)}</h3></div><span className={`term-status ${client.creditTermStatus}`}>{client.creditTermStatus === 'mixed' ? 'Mixta' : client.creditTermStatus === 'predominant' ? `${client.creditTermDominantShare}%` : client.creditTermSampleSize ? `n=${client.creditTermSampleSize}` : 'Sin muestra'}</span></div>
              <p>{creditTermDetail(client)}</p>
              {client.creditTermOptions.length > 1 && <div className="term-option-list">{client.creditTermOptions.slice(0, 5).map((option) => <span key={`${option.days}-${option.minDays}-${option.maxDays}`}><strong>{option.days} d</strong>{option.minDays !== option.maxDays && <small>{option.minDays}–{option.maxDays} exactos</small>}<em>{option.invoiceCount} fact. · {option.share}%</em></span>)}</div>}
              <small className="term-rule-note">Se calcula con compra/emisión → vencimiento. Las alertas usan siempre la fecha real de cada factura, aun cuando el cliente tenga condiciones diferentes.</small>
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
                      <span>Emitida {compactDate(invoice.issuedAt)} · vence {compactDate(invoice.dueAt)}{invoice.creditTermDays != null ? ` · plazo ${invoice.creditTermDays} d` : ''}</span>
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

        {tab === 'operations' && (
          <>
            <section className="panel-section first">
              <div className="section-title-row"><div><span className="section-kicker"><ClipboardCheck size={14} /> Actividad local</span><h3>Gestiones registradas</h3></div><span className="count-badge">{activities.length}</span></div>
              {!activities.length && <p className="section-description">Todavía no hay visitas, llamadas, cobranzas u ofertas guardadas para este cliente.</p>}
              <div className="panel-operation-list">{activities.map((activity) => <article key={activity.id}><span>{activity.type === 'visit' ? 'Visita' : activity.type === 'call' ? 'Llamada' : activity.type === 'collection' ? 'Cobranza' : 'Oferta'}</span><div><strong>{activity.outcome === 'sale' ? 'Venta concretada' : activity.outcome === 'promise' ? 'Promesa de pago' : activity.outcome === 'no_contact' ? 'Sin contacto' : activity.outcome === 'rescheduled' ? 'Reprogramada' : activity.outcome === 'no_interest' ? 'Sin interés por ahora' : 'Completada'}</strong><small>{longDate(activity.occurredAt)}{activity.note ? ` · ${activity.note}` : ''}</small></div>{activity.amount != null && <strong>{money(activity.amount, true)}</strong>}</article>)}</div>
            </section>
            <section className="panel-section">
              <div className="section-title-row"><div><span className="section-kicker"><CircleDollarSign size={14} /> Compromisos</span><h3>Promesas de pago</h3></div><span className="count-badge">{promises.filter((promise) => promise.status === 'pending').length} pendientes</span></div>
              {!promises.length && <p className="section-description">No hay promesas de pago registradas localmente.</p>}
              <div className="panel-promise-list">{promises.map((promise) => <article className={promise.status} key={promise.id}><span><CircleDollarSign size={14} /></span><div><strong>{money(promise.amount)} · {promise.status === 'pending' ? 'Pendiente' : promise.status === 'kept' ? 'Cumplida' : promise.status === 'broken' ? 'Incumplida' : 'Cancelada'}</strong><small>Fecha prometida {longDate(promise.dueAt)}{promise.note ? ` · ${promise.note}` : ''}</small></div></article>)}</div>
            </section>
            <p className="operations-disclaimer">Fuente: registros humanos de Salice Inteligente. No se escriben ni concilian automáticamente contra GESI en esta versión.</p>
          </>
        )}
      </div>
    </aside>
  );
}
