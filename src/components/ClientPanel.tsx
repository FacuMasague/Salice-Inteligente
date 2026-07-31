import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CalendarDays, Check, ChevronRight, CircleDollarSign, ClipboardCheck, Clock3, Mail, MapPin, Maximize2, Package, Phone, Route, Save, Sparkles, Trash2, TrendingDown, TrendingUp, Truck, WalletCards, X } from 'lucide-react';
import { isCommercialOpportunityEligible } from '../../shared/commercial-opportunities';
import type { Client, CommercialActivity, LogisticsSnapshot, PaymentPromise, Product, ReceivableCaseEvent, Recommendation } from '../../shared/models';
import { clientInitials, clientPrimaryName, clientSecondaryName } from '../lib/client-name';
import { invoiceDeliveryDisplay } from '../lib/delivery-status';
import { compactDate, creditTermDetail, creditTermLabel, longDate, money, number, paymentDelay, shortDate } from '../lib/format';
import { clientKilos90d } from '../lib/commercial-metrics';
import { partitionClientActivities } from '../lib/commercial-activities';
import { ActionDialog } from './ActionDialog';
import { AiCommercialExplanationCard } from './AiInsights';
import type { AiCommercialExplanation, AiStoredArtifact } from '../../shared/ai';

const healthLabel = { healthy: 'Riesgo bajo', attention: 'Atención', critical: 'Riesgo alto' } as const;
const invoiceLabel = { paid: 'Pagada', open: 'Abierta', due_soon: 'Por vencer', overdue: 'Vencida' } as const;

interface ClientPanelProps {
  client: Client;
  products: Product[];
  logistics: LogisticsSnapshot;
  onClose: () => void;
  onPlanRoute: (clientId: number) => void;
  onNoteSaved: (clientId: number, note: string) => void;
  mode?: 'compact' | 'full';
  snapshotDate?: string;
  onExpand?: () => void;
  onOpenSeller?: (seller: string) => void;
  onOpenProduct?: (product: Product) => void;
  onOpenBrand?: (brand: string) => void;
  onOpenInvoice?: (invoiceId: string) => void;
}

const receivableEventLabels: Record<ReceivableCaseEvent['eventType'], string> = {
  created: 'Seguimiento iniciado', assignment: 'Responsable asignado', status: 'Estado actualizado',
  follow_up: 'Seguimiento guardado', promise: 'Promesa informada', comment: 'Comentario de cobranza',
};

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
      <article className="client-profile-chart"><header><div><span className="section-kicker"><BarChart3 size={14} /> Evolución comercial</span><h3>Facturación mensual · 6 meses</h3></div><strong>{money(client.salesTrend.reduce((sum, value) => sum + value, 0), true)}</strong></header><div className="client-sales-bars">{client.salesTrend.map((value, index) => <div key={`${monthLabels[index]}-${index}`} title={`${monthLabels[index]}: ${money(value)}`}><span><i style={{ height: `${Math.max(2, value / maxSales * 100)}%` }} /></span><strong>{monthLabels[index]}</strong><small>{money(value, true)}</small></div>)}</div></article>
      <article className="client-profile-chart"><header><div><span className="section-kicker"><Clock3 size={14} /> Conducta de pago</span><h3>Días contra vencimiento · últimas facturas</h3></div><strong>{client.paymentSampleSize ? paymentDelay(client.avgPaymentDelayDays) : 'Sin muestra'}</strong></header>{delays.length ? <div className="client-delay-chart">{delays.map((value, index) => <div key={`${value}-${index}`} title={`${value > 0 ? `${value} días tarde` : value < 0 ? `${Math.abs(value)} días antes` : 'En fecha'}`}><span className="delay-positive"><i style={{ height: value > 0 ? `${Math.max(3, value / maxDelay * 100)}%` : 0 }} /></span><b /><span className="delay-negative"><i style={{ height: value < 0 ? `${Math.max(3, Math.abs(value) / maxDelay * 100)}%` : 0 }} /></span><small>{index + 1}</small></div>)}</div> : <div className="client-chart-empty">No hay pagos conciliados suficientes para dibujar la evolución.</div>}<footer><span><i className="early" />Antes del vencimiento</span><span><i className="late" />Después del vencimiento</span></footer></article>
    </div>
  </section>;
}

export function ClientPanel({ client, products, logistics, onClose, onPlanRoute, onNoteSaved, mode = 'compact', snapshotDate = new Date().toISOString(), onExpand, onOpenSeller, onOpenProduct, onOpenBrand, onOpenInvoice }: ClientPanelProps) {
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
  const [receivableEvents, setReceivableEvents] = useState<ReceivableCaseEvent[]>([]);
  const [deletingOpportunityId, setDeletingOpportunityId] = useState('');
  const [opportunityDeleteError, setOpportunityDeleteError] = useState('');
  const [opportunityToDelete, setOpportunityToDelete] = useState<CommercialActivity | null>(null);
  const [aiExplanation, setAiExplanation] = useState<AiStoredArtifact<AiCommercialExplanation> | null>(null);

  useEffect(() => {
    setTab('summary');
    setNote(client.note);
    setSaved(false);
    setRecommendations([]);
    setRecommendationError('');
    setActivities([]);
    setPromises([]);
    setReceivableEvents([]);
    setDeletingOpportunityId('');
    setOpportunityDeleteError('');
    setAiExplanation(null);
    const controller = new AbortController();
    fetch(`/api/clients/${client.id}/operations`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => { setActivities(payload.activities || []); setPromises(payload.promises || []); setReceivableEvents(payload.receivableEvents || []); })
      .catch((error: Error) => { if (error.name !== 'AbortError') { setActivities([]); setPromises([]); setReceivableEvents([]); } });
    fetch(`/api/ai/clients/${client.id}/explanation`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setAiExplanation(payload?.artifact ?? null))
      .catch((error: Error) => { if (error.name !== 'AbortError') setAiExplanation(null); });
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
    const grouped = new Map<string, { product: Product; quantity: number; total: number; kilos: number; kilosComplete: boolean; lastDate: string }>();
    client.purchases.forEach((purchase) => {
      const product = products.find((item) => item.id === purchase.productId);
      if (!product) return;
      const current = grouped.get(product.id) || { product, quantity: 0, total: 0, kilos: 0, kilosComplete: true, lastDate: purchase.date };
      current.quantity += purchase.quantity;
      current.total += purchase.total;
      if (product.contentKg == null) current.kilosComplete = false;
      else current.kilos += purchase.quantity * product.contentKg;
      if (purchase.date > current.lastDate) current.lastDate = purchase.date;
      grouped.set(product.id, current);
    });
    return [...grouped.values()].sort((a, b) => b.total - a.total);
  }, [client.purchases, products]);
  const clientKiloMetric = useMemo(() => clientKilos90d(client, products), [client, products]);

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
  const activeReceivableEvents = receivableEvents.filter((event) => !event.deletedAt && event.eventType !== 'status');
  const { opportunities: opportunityActivities, general: generalActivities } = partitionClientActivities(activities);
  const deleteOpportunityNote = async (activity: CommercialActivity) => {
    setDeletingOpportunityId(activity.id);
    setOpportunityDeleteError('');
    try {
      const response = await fetch(`/api/clients/${client.id}/opportunity-notes/${encodeURIComponent(activity.id)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No se pudo eliminar la nota.');
      setActivities((current) => current.filter((item) => item.id !== activity.id));
      setOpportunityToDelete(null);
    } catch (error) {
      setOpportunityDeleteError(error instanceof Error ? error.message : 'No se pudo eliminar la nota.');
    } finally {
      setDeletingOpportunityId('');
    }
  };

  return (
    <aside className={`client-panel ${mode === 'full' ? 'client-profile' : 'client-panel-compact'}`} data-tour="client-panel" aria-label={`Ficha de ${clientPrimaryName(client)}`}>
      <div className="client-panel-header">
        <div className="client-panel-actions">{mode === 'compact' && onExpand && <button className="icon-button" onClick={onExpand} aria-label="Expandir ficha completa" title="Abrir ficha completa"><Maximize2 size={17} /></button>}<button className="icon-button" onClick={onClose} aria-label="Cerrar ficha"><X size={18} /></button></div>
        <div className="client-avatar">{clientInitials(client)}</div>
        <div className="client-title-block">
          <div className="eyebrow">{client.reference} · {client.segment}</div>
          <h2>{clientPrimaryName(client)}</h2>
          {clientSecondaryName(client) && <span className="client-profile-trade-name">{clientSecondaryName(client)}</span>}
          <p><MapPin size={14} /> {client.address}, {client.locality}</p>
        </div>
        <div className="client-header-statuses"><span className={`gesi-status-badge ${client.active ? 'active' : 'inactive'}`}>{client.active ? 'Cliente activo' : 'Cliente inactivo'}</span><span className={`portfolio-badge ${client.portfolioStatus}`}>{client.portfolioStatus === 'confirmed' ? 'Salice confirmado' : 'Revisar cartera'}</span>{client.active && <span className={`health-badge ${client.health}`}>{healthLabel[client.health]}</span>}</div>
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
            {!client.active && <div className="inactive-client-notice"><AlertTriangle size={19} /><div><strong>Fuera de la cartera activa</strong><span>El sistema comercial lo marca como inactivo. Se conserva para consulta histórica; última actualización: {longDate(client.statusUpdatedAt)}.</span></div></div>}
            {client.locationStatus === 'corrected' && <div className="location-correction-notice"><MapPin size={18} /><div><strong>Ubicación corregida automáticamente</strong><span>{client.locationCorrectionReason} La dirección original no fue modificada.</span></div></div>}
            {client.locationStatus === 'review' && <div className="portfolio-review-notice"><AlertTriangle size={18} /><div><strong>Ubicación pendiente de revisión</strong><span>{client.locationCorrectionReason} El cliente continúa disponible fuera del mapa.</span></div></div>}
            {client.active && client.portfolioStatus === 'review' && <div className="portfolio-review-notice"><AlertTriangle size={18} /><div><strong>Pertenencia a Salice por confirmar</strong><span>Está activo en el sistema comercial, pero su pertenencia a la cartera Salice todavía no está confirmada. No se excluye automáticamente.</span></div></div>}
            {client.salesBlocked && <div className="sales-block-notice"><AlertTriangle size={18} /><div><strong>Bloqueo de ventas informado</strong><span>Validar con administración qué uso operativo tiene este campo antes de tomar una decisión.</span></div></div>}
            <section className="metric-grid three">
              <article className="mini-metric">
                <span>Facturación / kilos · 90 días</span>
                <strong>{money(client.sales90d, true)}</strong>
                <small>{number(clientKiloMetric.kilos, 2)} kg{clientKiloMetric.complete ? '' : ' · conversión parcial'}</small>
                <small className={client.salesDelta >= 0 ? 'positive' : 'negative'}>
                  {client.salesDelta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {Math.abs(client.salesDelta)}% vs. período anterior
                </small>
              </article>
              <article className="mini-metric">
                <span>Riesgo de cobranza</span>
                <strong>{client.collectionRisk}/100</strong>
                <small>{money(client.overdueOutstanding, true)} vencido · {client.oldestOverdueDays || 0} días máx.</small>
              </article>
              <article className="mini-metric">
                <span>{isCommercialOpportunityEligible(client) ? 'Oportunidad comercial' : 'Oportunidad no mostrada'}</span>
                <strong>{isCommercialOpportunityEligible(client) ? `${client.commercialOpportunity}/100` : '—'}</strong>
                <small>{client.salesBlocked ? 'Bloqueo de ventas informado' : client.sales90d <= 0 ? 'Sin compras en 90 días' : `Prioridad de revisión ${client.visitPriority}/100`}</small>
              </article>
            </section>
            <AiCommercialExplanationCard artifact={aiExplanation} />

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
              <p className="section-description">Faltantes del mix reciente, adopción en clientes comparables, sustitutos ante quiebres y stock alto con afinidad. Sólo incluye productos compatibles y con stock positivo.</p>
              <div className="recommendation-list">
                {recommendationLoading && <p className="section-description">Calculando sugerencias para este cliente…</p>}
                {recommendationError && <p className="form-error">{recommendationError}</p>}
                {recommendations.slice(0, 3).map((recommendation) => (
                  <article className="recommendation-card" key={recommendation.product.id}>
                    <div className="product-icon"><Package size={18} /></div>
                    <div className="recommendation-copy">
                      <button className="entity-link product-entity-link" onClick={() => onOpenProduct?.(recommendation.product)}>{recommendation.product.name}<ChevronRight size={12} /></button>
                      <span>{recommendation.reason}</span>
                      <span className="recommendation-affinity-copy">{recommendation.affinityExplanation}</span>
                      <small>{recommendation.product.price > 0 ? money(recommendation.product.price) : 'Sin precio'} · Stock {recommendation.product.stock} · {onOpenBrand ? <button className="entity-link inline-entity" onClick={() => onOpenBrand(recommendation.product.brand)}>{recommendation.product.brand}</button> : recommendation.product.brand} · <span className={`confidence ${recommendation.confidence}`}>{recommendation.confidence === 'reliable' ? 'Confianza alta' : recommendation.confidence === 'exploratory' ? 'Confianza media' : 'Confianza limitada'}</span></small>
                    </div>
                    <div className="score-ring" style={{ '--score': recommendation.score } as React.CSSProperties}>
                      <span>{recommendation.score}</span>
                    </div>
                  </article>
                ))}
              </div>
              <p className="section-description recommendation-human-rule">Las sugerencias no crean tareas ni registran que una oferta haya ocurrido. Las notas de oficina permanecen separadas.</p>
            </section> : <section className="panel-section"><div className="section-title-row"><div><span className="section-kicker"><Sparkles size={14} /> Motor de oportunidades</span><h3>Recomendaciones pausadas</h3></div></div><p className="section-description inactive-recommendation-copy">Los clientes inactivos no participan de comparaciones, recomendaciones ni recorridos. Podés consultar sus compras y su cuenta corriente desde las otras pestañas.</p></section>}

            <section className="panel-section next-action">
              <div className="section-title-row">
                <div><span className="section-kicker"><CalendarDays size={14} /> {client.active ? 'Referencia del sistema' : 'Registro interno'}</span><h3>{client.active ? `Revisión sugerida · ${longDate(client.nextVisitAt)}` : 'Notas históricas del cliente'}</h3></div>
                {client.active && <strong className="priority-number">{client.visitPriority}/100</strong>}
              </div>
              <textarea value={note} onChange={(event) => { setNote(event.target.value); setSaved(false); }} maxLength={500} aria-label="Nota general del cliente" placeholder="Nota general del cliente; no programa ni comunica acciones." />
              {saveError && <p className="form-error">{saveError}</p>}
              <div className="action-row">
                <button className="button secondary" onClick={saveNote} disabled={saving || note === client.note}>
                  {saved ? <Check size={15} /> : <Save size={15} />} {saved ? 'Guardada' : saving ? 'Guardando…' : 'Guardar nota'}
                </button>
                {client.active && <button className="button primary" disabled={!client.coordinates || client.locationPrecision === 'locality'} title={client.locationPrecision === 'locality' ? 'La ubicación debe verificarse antes de usarla en una ruta' : undefined} onClick={() => onPlanRoute(client.id)}><Route size={15} /> {client.locationPrecision === 'locality' ? 'Ubicación por verificar' : 'Agregar a ruta'}</button>}
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
                  <div className="purchase-copy"><button className="entity-link product-entity-link" onClick={() => onOpenProduct?.(item.product)}>{item.product.name}<ChevronRight size={12} /></button><span>{item.quantity} unidades · {number(item.kilos, 2)} kg{item.kilosComplete ? '' : ' parciales'} · última compra {shortDate(item.lastDate)}</span></div>
                  <strong>{money(item.total, true)}</strong>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === 'account' && (
          <>
            <section className="credit-card panel-section first">
              <div className="credit-top"><span>Condición comercial configurada</span><strong>{client.paymentMethod}</strong></div>
              {client.creditLimit > 0 && <><div className="credit-track"><span style={{ width: `${Math.min(100, utilization)}%` }} /></div><div className="credit-values"><span>Saldo neto {money(client.balance)}</span><span>Límite {money(client.creditLimit)} · uso {utilization}%</span></div></>}
              {!client.creditLimit && <div className="credit-values no-limit"><span>Saldo neto {money(client.balance)}</span><span>Sin límite informado; no se calcula utilización</span></div>}
            </section>
            <section className={`observed-term-card panel-section ${client.creditTermStatus}`}>
              <div className="section-title-row"><div><span className="section-kicker"><CalendarDays size={14} /> Plazo observado</span><h3>{creditTermLabel(client)}</h3></div><span className={`term-status ${client.creditTermStatus}`}>{client.creditTermStatus === 'mixed' ? 'Mixta' : client.creditTermStatus === 'predominant' ? `${client.creditTermDominantShare}%` : client.creditTermSampleSize ? `n=${client.creditTermSampleSize}` : 'Sin muestra'}</span></div>
              <p>{creditTermDetail(client)}</p>
              {client.creditTermOptions.length > 1 && <div className="term-option-list">{client.creditTermOptions.slice(0, 5).map((option) => <span key={`${option.days}-${option.minDays}-${option.maxDays}`}><strong>{option.days} d</strong>{option.minDays !== option.maxDays && <small>{option.minDays}–{option.maxDays} exactos</small>}<em>{option.invoiceCount} fact. · {option.share}%</em></span>)}</div>}
              <small className="term-rule-note">Se calcula con compra/emisión → vencimiento. Las alertas usan siempre la fecha real de cada factura, aun cuando el cliente tenga condiciones diferentes.</small>
            </section>
            <section className="panel-section">
              <div className="section-title-row"><div><span className="section-kicker"><WalletCards size={14} /> Comprobantes</span><h3>Historial de cuenta</h3></div></div>
              <p className="invoice-logistics-note"><Truck size={14} /><span>Estado según las fojas disponibles. <strong>Una foja cerrada no confirma que la mercadería haya sido entregada.</strong></span></p>
              <div className="invoice-list">
                {!client.invoices.length && <p className="section-description">No hay comprobantes pendientes ni pagos conciliados en la ventana analizada.</p>}
                {client.invoices.map((invoice) => {
                  const delivery = invoiceDeliveryDisplay(invoice.id, invoice.issuedAt, logistics);
                  return <button className="invoice-row" key={invoice.id} onClick={() => onOpenInvoice?.(invoice.id)} disabled={!onOpenInvoice}>
                    <div className={`invoice-status-dot ${invoice.status}`} />
                    <div className="invoice-copy">
                      <strong>{invoice.number}</strong>
                      <span>Emitida {compactDate(invoice.issuedAt)} · vence {compactDate(invoice.dueAt)}{invoice.creditTermDays != null ? ` · plazo ${invoice.creditTermDays} d` : ''}</span>
                      <small>{invoice.paymentMethod || 'Sin forma de pago informada'}</small>
                      <small className="invoice-delivery-line" title={delivery.sheetId ? 'Abrir el comprobante y consultar la foja' : undefined}><Truck size={12} /><span className={`invoice-delivery-badge ${delivery.status} ${delivery.sheetId ? 'linked' : ''}`}>{delivery.label}{delivery.sheetId && <ChevronRight size={10} />}</span></small>
                      {invoice.paidAt && <small><Check size={12} /> Pagada {compactDate(invoice.paidAt)}</small>}
                    </div>
                    <div className="invoice-amount"><strong>{money(invoice.outstanding > 0 ? invoice.outstanding : invoice.amount)}</strong><span className={`status-text ${invoice.status}`}>{invoiceLabel[invoice.status]}{invoice.outstanding > 0 && invoice.outstanding !== invoice.amount ? ' · saldo' : ''}</span></div>
                    <ChevronRight size={15} />
                  </button>;
                })}
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
              <div className="section-title-row"><div><span className="section-kicker"><WalletCards size={14} /> Cuentas por cobrar</span><h3>Seguimientos administrativos</h3></div><span className="count-badge">{activeReceivableEvents.length}</span></div>
              {!activeReceivableEvents.length && <p className="section-description">Todavía no hay seguimientos guardados desde Cuentas por cobrar.</p>}
              <div className="panel-operation-list receivable-events">{activeReceivableEvents.map((event) => <article key={event.id}><span>{receivableEventLabels[event.eventType]}</span><div><strong>{event.comment || receivableEventLabels[event.eventType]}</strong><small>{longDate(event.createdAt)} · {event.actor}</small></div></article>)}</div>
            </section>
            <section className="panel-section first">
              <div className="section-title-row"><div><span className="section-kicker"><Sparkles size={14} /> Productos vinculados</span><h3>Oportunidades</h3></div><span className="count-badge">{opportunityActivities.length}</span></div>
              {!opportunityActivities.length && <p className="section-description">Todavía no hay notas vinculadas a oportunidades de productos.</p>}
              {opportunityDeleteError && <p className="form-error">{opportunityDeleteError}</p>}
              <div className="panel-operation-list opportunity-activity-list">{opportunityActivities.map((activity) => <article key={activity.id}><span>Nota</span><div><strong>{activity.note || 'Oportunidad documentada por la oficina'}</strong><small>{longDate(activity.occurredAt)} · {activity.createdBy || 'Registro anterior'}</small><div className="opportunity-activity-products">{activity.productIds.map((productId) => { const product = products.find((item) => item.id === productId); return product ? <button className="entity-link product-entity-link" key={productId} onClick={() => onOpenProduct?.(product)}><Package size={13} />{product.name}<ChevronRight size={12} /></button> : <span key={productId}>Producto {productId} no disponible</span>; })}</div></div><button className="icon-button opportunity-delete-button" disabled={deletingOpportunityId === activity.id} onClick={() => setOpportunityToDelete(activity)} aria-label="Eliminar nota de oportunidad" title="Eliminar nota"><Trash2 size={15} /></button></article>)}</div>
            </section>
            <section className="panel-section first">
              <div className="section-title-row"><div><span className="section-kicker"><ClipboardCheck size={14} /> Registro local</span><h3>Notas sobre hechos externos</h3></div><span className="count-badge">{generalActivities.length}</span></div>
              {!generalActivities.length && <p className="section-description">Todavía no hay otras notas de visitas, llamadas u ofertas para este cliente.</p>}
              <div className="panel-operation-list">{generalActivities.map((activity) => <article key={activity.id}><span>{activity.type === 'note' ? 'Nota' : activity.type === 'visit' ? 'Visita' : activity.type === 'call' ? 'Llamada' : activity.type === 'collection' ? 'Cobranza' : 'Oferta'}</span><div><strong>{activity.outcome === 'noted' ? 'Nota de oficina' : activity.outcome === 'sale' ? 'Venta concretada' : activity.outcome === 'promise' ? 'Promesa de pago' : activity.outcome === 'no_contact' ? 'Sin contacto' : activity.outcome === 'rescheduled' ? 'Reprogramada' : activity.outcome === 'no_interest' ? 'Sin interés por ahora' : 'Registro anterior'}</strong><small>{longDate(activity.occurredAt)} · {activity.createdBy || 'Registro anterior'}{activity.note ? ` · ${activity.note}` : ''}</small></div>{activity.amount != null && <strong>{money(activity.amount, true)}</strong>}</article>)}</div>
            </section>
            <section className="panel-section">
              <div className="section-title-row"><div><span className="section-kicker"><CircleDollarSign size={14} /> Compromisos</span><h3>Promesas de pago</h3></div><span className="count-badge">{promises.filter((promise) => promise.status === 'pending').length} pendientes</span></div>
              {!promises.length && <p className="section-description">No hay promesas de pago registradas localmente.</p>}
              <div className="panel-promise-list">{promises.map((promise) => <article className={promise.status} key={promise.id}><span><CircleDollarSign size={14} /></span><div><strong>{money(promise.amount)} · {promise.status === 'pending' ? 'Pendiente' : promise.status === 'kept' ? 'Cumplida' : promise.status === 'broken' ? 'Incumplida' : 'Cancelada'}</strong><small>Fecha prometida {longDate(promise.dueAt)}{promise.note ? ` · ${promise.note}` : ''}</small></div></article>)}</div>
            </section>
            <p className="operations-disclaimer">Fuente: registros humanos de Salice Inteligente. No modifican automáticamente los datos del sistema comercial.</p>
          </>
        )}
      </div>
      <ActionDialog open={opportunityToDelete != null} title="Eliminar nota de oportunidad" description="La nota se eliminará, pero la recomendación y cualquier lista guardada se conservarán." confirmLabel="Eliminar nota" busy={opportunityToDelete != null && deletingOpportunityId === opportunityToDelete.id} onCancel={() => setOpportunityToDelete(null)} onConfirm={() => { if (opportunityToDelete) void deleteOpportunityNote(opportunityToDelete); }} />
    </aside>
  );
}
