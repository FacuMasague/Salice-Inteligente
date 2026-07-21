import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  MapPin,
  MessageSquareText,
  Package,
  Phone,
  Plus,
  RefreshCw,
  Route,
  Save,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import type {
  AgendaEntry,
  AgendaPayload,
  Client,
  CommercialActivityOutcome,
  CommercialActivityType,
  Product,
  Recommendation,
} from '../../shared/models';
import { matchesMultiFilter, multiFilterLabel } from '../../shared/multi-filter';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { clientInitials, clientPrimaryName, clientSecondaryName } from '../lib/client-name';
import { compactDate, longDate, money } from '../lib/format';

const actionLabels: Record<CommercialActivityType, string> = {
  visit: 'Visita',
  call: 'Llamada',
  collection: 'Cobranza',
  offer: 'Oferta',
};
const outcomeLabels: Record<CommercialActivityOutcome, string> = {
  completed: 'Gestión completada',
  sale: 'Venta concretada',
  promise: 'Promesa de pago',
  no_contact: 'Sin contacto',
  rescheduled: 'Reprogramada',
  no_interest: 'Sin interés por ahora',
};
const sourceLabels = { algorithm: 'Sugerida', manual: 'Programada', promise: 'Promesa' } as const;
const commercialActionTypes: CommercialActivityType[] = ['visit', 'call', 'offer'];
const commercialOutcomes: CommercialActivityOutcome[] = ['completed', 'sale', 'no_contact', 'rescheduled', 'no_interest'];
const isCommercialEntry = (entry: AgendaEntry) => entry.source !== 'promise' && entry.actionType !== 'collection';
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

function defaultOccurredAt(date: string) {
  const current = new Date();
  if (date === today()) {
    const offset = current.getTimezoneOffset() * 60_000;
    return new Date(current.getTime() - offset).toISOString().slice(0, 16);
  }
  return `${date}T09:00`;
}

interface AgendaViewProps {
  clients: Client[];
  products: Product[];
  onOpen: (client: Client) => void;
  onOpenSeller: (seller: string) => void;
  onOpenProduct: (product: Product) => void;
  onPlanRoute: (clientId: number) => void;
  onOperationalChange: () => void;
}

export function AgendaView({ clients, products, onOpen, onOpenSeller, onOpenProduct, onPlanRoute, onOperationalChange }: AgendaViewProps) {
  const activeClients = useMemo(() => clients.filter((client) => client.active), [clients]);
  const sellers = useMemo(() => [...new Set(activeClients.map((client) => client.seller).filter((name) => name && name !== 'Sin vendedor'))].sort((a, b) => a.localeCompare(b, 'es')), [activeClients]);
  const [date, setDate] = useState(today);
  const [seller, setSeller] = useState('');
  const [data, setData] = useState<AgendaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [activityOpen, setActivityOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/agenda?date=${encodeURIComponent(date)}&seller=${encodeURIComponent(seller)}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('No se pudo cargar la agenda'); return response.json(); })
      .then((payload: AgendaPayload) => {
        setData(payload);
        const commercialEntries = payload.entries.filter(isCommercialEntry);
        setSelectedId((current) => commercialEntries.some((entry) => entry.id === current) ? current : commercialEntries[0]?.id ?? null);
      })
      .catch((cause: Error) => { if (cause.name !== 'AbortError') setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, seller, refreshToken]);

  const reload = () => setRefreshToken((value) => value + 1);
  const commercialEntries = useMemo(() => (data?.entries ?? []).filter(isCommercialEntry), [data]);
  const visibleEntries = useMemo(() => commercialEntries.filter((entry) => matchesMultiFilter(entry.status, statusFilter)), [commercialEntries, statusFilter]);
  const selectedEntry = commercialEntries.find((entry) => entry.id === selectedId) ?? visibleEntries[0] ?? null;
  const selectedClient = selectedEntry ? clients.find((client) => client.id === selectedEntry.clientId) ?? null : null;
  const selectedActivities = data?.activities.filter((activity) => activity.clientId === selectedClient?.id && activity.type !== 'collection' && activity.outcome !== 'promise').slice(0, 8) ?? [];
  const selectedDateLabel = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`));
  const savedFilters = { date, seller, statusFilter, selectedEntryId: selectedEntry?.id ?? '' };
  const applySaved = (saved: Record<string, string>) => {
    setDate(saved.date || today());
    setSeller(saved.seller || '');
    setStatusFilter(saved.statusFilter || 'pending');
    setSelectedId(saved.selectedEntryId || null);
  };

  const planned = commercialEntries.filter((entry) => entry.source === 'algorithm').length;
  const pending = commercialEntries.filter((entry) => entry.status === 'pending').length;
  const completed = commercialEntries.filter((entry) => entry.status === 'completed').length;
  const visitAndCalls = commercialEntries.filter((entry) => entry.actionType === 'visit' || entry.actionType === 'call').length;
  const offers = commercialEntries.filter((entry) => entry.actionType === 'offer').length;

  return (
    <div className="page-view agenda-page" data-tour="agenda-workstation">
      <section className="agenda-command data-card">
        <div className="agenda-command-title"><span className="section-kicker"><ClipboardCheck size={14} /> Administración comercial</span><h2>Gestiones comerciales</h2><p>{selectedDateLabel} · visitas, llamadas y ofertas separadas del seguimiento de cuentas por cobrar.</p></div>
        <div className="agenda-command-controls">
          <label><span>Fecha</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <MultiSelectFilter label="Vendedor" value={seller} options={sellers} onChange={setSeller} allLabel="Todos" />
          <button className="button secondary" onClick={reload} disabled={loading}><RefreshCw size={15} /> Actualizar</button>
          <button className="button primary" onClick={() => setTaskOpen(true)}><Plus size={16} /> Nueva tarea</button>
        </div>
      </section>

      <SavedViewsBar viewKey="agenda" filters={savedFilters} onApply={applySaved} />

      <div className="agenda-kpis" data-tour="agenda-kpis">
        <article title={data?.definitions.planned}><span className="agenda-kpi-icon green"><CalendarDays size={19} /></span><div><span>Pendientes</span><strong>{data ? pending : '—'}</strong><small>{data ? `${planned} prioridades sugeridas` : 'Cargando gestiones'}</small></div></article>
        <article title={data?.definitions.completed}><span className="agenda-kpi-icon blue"><CheckCircle2 size={19} /></span><div><span>Gestiones registradas</span><strong>{data ? completed : '—'}</strong><small>en la fecha seleccionada</small></div></article>
        <article><span className="agenda-kpi-icon red"><Phone size={19} /></span><div><span>Visitas y llamadas</span><strong>{data ? visitAndCalls : '—'}</strong><small>planificadas para la fecha</small></div></article>
        <article><span className="agenda-kpi-icon ochre"><Package size={19} /></span><div><span>Ofertas</span><strong>{data ? offers : '—'}</strong><small>acciones comerciales</small></div></article>
      </div>

      <div className="agenda-layout">
        <section className="data-card agenda-list-card">
          <div className="data-card-header"><div><span className="section-kicker"><CalendarDays size={14} /> Prioridades del día</span><h2>{multiFilterLabel(seller, 'Todos los vendedores')}</h2></div><MultiSelectFilter className="agenda-status-filter" label="Estado" value={statusFilter} options={[{ value: 'pending', label: 'Pendientes' }, { value: 'completed', label: 'Hechas' }]} onChange={setStatusFilter} /></div>
          <div className="agenda-entry-list">
            {loading && <div className="agenda-empty"><RefreshCw size={22} /><strong>Cargando prioridades…</strong></div>}
            {error && <div className="agenda-empty error"><AlertTriangle size={22} /><strong>{error}</strong><button className="button secondary" onClick={reload}>Reintentar</button></div>}
            {!loading && !error && !visibleEntries.length && <div className="agenda-empty"><CheckCircle2 size={27} /><strong>No hay tareas en este filtro</strong><p>Podés ver todas o programar una nueva acción.</p></div>}
            {visibleEntries.map((entry) => { const entryClient = clients.find((client) => client.id === entry.clientId); return <button key={entry.id} className={`agenda-entry ${selectedEntry?.id === entry.id ? 'active' : ''} ${entry.status}`} onClick={() => setSelectedId(entry.id)}>
              <span className={`agenda-action-icon ${entry.actionType}`}>{entry.actionType === 'call' ? <Phone size={16} /> : entry.actionType === 'offer' ? <Package size={16} /> : <MapPin size={16} />}</span>
              <div className="agenda-entry-copy"><div><strong>{entryClient ? clientPrimaryName(entryClient) : entry.clientName}</strong><span className={`agenda-source ${entry.source}`}>{sourceLabels[entry.source]}</span></div>{entryClient && clientSecondaryName(entryClient) && <small className="agenda-client-trade-name">{clientSecondaryName(entryClient)}</small>}<p>{entry.reason}</p><small>{entry.seller} · {entry.locality} · {actionLabels[entry.actionType]}</small></div>
              <div className="agenda-entry-score"><strong>P{entry.priority}</strong><span>C{entry.collectionRisk} · O{entry.commercialOpportunity}</span>{entry.status === 'completed' && <em><Check size={12} /> Hecha</em>}</div>
            </button>; })}
          </div>
        </section>

        <section className="agenda-detail-card data-card">
          {!selectedClient || !selectedEntry ? <div className="agenda-detail-empty"><UserRound size={38} /><h2>Elegí una tarea</h2><p>Vas a ver contexto, sugerencias de producto e historial antes de contactar al cliente.</p></div> : <>
            <header className="agenda-client-hero">
              <div className="client-avatar">{clientInitials(selectedClient)}</div>
              <div><span className="section-kicker">{selectedClient.reference} · {selectedClient.segment}</span><h2>{clientPrimaryName(selectedClient)}</h2>{clientSecondaryName(selectedClient) && <span className="client-profile-trade-name">{clientSecondaryName(selectedClient)}</span>}<p><MapPin size={13} /> {selectedClient.address}, {selectedClient.locality}</p><button className="entity-link agenda-seller-link" onClick={() => onOpenSeller(selectedClient.seller)}>{selectedClient.seller}<ChevronRight size={12} /></button></div>
              <button className="icon-button" aria-label="Abrir ficha completa" onClick={() => onOpen(selectedClient)}><ChevronRight size={18} /></button>
            </header>
            <div className="agenda-reason"><span className={`agenda-action-icon ${selectedEntry.actionType}`}>{selectedEntry.actionType === 'call' ? <Phone size={16} /> : selectedEntry.actionType === 'offer' ? <Package size={16} /> : <MapPin size={16} />}</span><div><span>Motivo de la tarea · {sourceLabels[selectedEntry.source]}</span><strong>{selectedEntry.reason}</strong></div></div>
            {selectedClient.salesBlocked && <div className="agenda-guardrail"><AlertTriangle size={17} /><span>GESI informa bloqueo de ventas. Validalo con administración antes de tomar un pedido.</span></div>}
            <div className="agenda-client-metrics"><article><span>Riesgo</span><strong>C{selectedClient.collectionRisk}</strong><small>{money(selectedClient.overdueOutstanding, true)} vencido</small></article><article><span>Oportunidad</span><strong>O{selectedClient.commercialOpportunity}</strong><small>{selectedClient.salesDelta >= 0 ? '+' : ''}{selectedClient.salesDelta}% ventas</small></article><article><span>Última compra</span><strong>{compactDate(selectedClient.lastPurchaseAt)}</strong><small>{money(selectedClient.sales90d, true)} en 90d</small></article></div>
            {selectedClient.salesBlocked ? <section className="agenda-offers"><div className="section-title-row"><div><span className="section-kicker"><AlertTriangle size={14} /> Oferta pausada</span><h3>Validar antes de recomendar</h3></div></div><p className="section-description">Las sugerencias se ocultan mientras GESI informe bloqueo de ventas. La ficha conserva el contexto para administración.</p></section> : <AgendaRecommendations client={selectedClient} onOpenProduct={onOpenProduct} />}
            <section className="agenda-history-section">
              <div className="section-title-row"><div><span className="section-kicker"><MessageSquareText size={14} /> Historial local</span><h3>Visitas, llamadas y ofertas</h3></div></div>
              {!selectedActivities.length && <p className="section-description">Todavía no hay actividad comercial guardada para este cliente.</p>}
              {selectedActivities.map((activity) => <article className="agenda-activity-row" key={activity.id}><span>{actionLabels[activity.type]}</span><div><strong>{outcomeLabels[activity.outcome]}</strong><small>{longDate(activity.occurredAt)}{activity.note ? ` · ${activity.note}` : ''}</small></div>{activity.amount != null && <strong>{money(activity.amount, true)}</strong>}</article>)}
            </section>
            <footer className="agenda-detail-actions"><button className="button secondary" disabled={!selectedClient.coordinates} onClick={() => onPlanRoute(selectedClient.id)}><Route size={16} /> Agregar a ruta</button><button className="button primary large" onClick={() => setActivityOpen(true)}><ClipboardCheck size={16} /> Registrar gestión</button></footer>
          </>}
        </section>
      </div>

      {activityOpen && selectedClient && selectedEntry && <ActivityDialog client={selectedClient} entry={selectedEntry} operationalDate={date} products={products} onClose={() => setActivityOpen(false)} onSaved={() => { setActivityOpen(false); reload(); onOperationalChange(); }} />}
      {taskOpen && <TaskDialog clients={activeClients} seller={seller} initialDate={date} onClose={() => setTaskOpen(false)} onSaved={() => { setTaskOpen(false); reload(); }} />}
    </div>
  );
}

function AgendaRecommendations({ client, onOpenProduct }: { client: Client; onOpenProduct: (product: Product) => void }) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/clients/${client.id}/recommendations`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => setRecommendations(payload.recommendations || []))
      .catch(() => setRecommendations([]))
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [client.id]);
  return <section className="agenda-offers"><div className="section-title-row"><div><span className="section-kicker"><Sparkles size={14} /> Oferta sugerida</span><h3>Productos para conversar</h3></div><span className="algorithm-pill">Algorítmico</span></div>{loading && <p className="section-description">Calculando afinidad y adopción en clientes comparables…</p>}<div className="agenda-offer-grid">{recommendations.slice(0, 3).map((item) => <article key={item.product.id}><span><Package size={16} /></span><div><button className="entity-link product-entity-link" onClick={() => onOpenProduct(item.product)}>{item.product.name}<ChevronRight size={12} /></button><small>{item.reason}</small></div><em>{item.score}</em></article>)}</div>{!loading && !recommendations.length && <p className="section-description">No hay una recomendación suficientemente útil con los datos actuales.</p>}</section>;
}

function ActivityDialog({ client, entry, operationalDate, products, onClose, onSaved }: { client: Client; entry: AgendaEntry; operationalDate: string; products: Product[]; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<CommercialActivityType>(entry.actionType);
  const [outcome, setOutcome] = useState<CommercialActivityOutcome>('completed');
  const [occurredAt, setOccurredAt] = useState(defaultOccurredAt(operationalDate > today() ? today() : operationalDate));
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [nextActionAt, setNextActionAt] = useState('');
  const [productIds, setProductIds] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { fetch(`/api/clients/${client.id}/recommendations`).then((response) => response.json()).then((payload) => setRecommendations(payload.recommendations || [])).catch(() => setRecommendations([])); }, [client.id]);
  const offered = recommendations.slice(0, 5).map((item) => item.product).filter((product) => products.some((item) => item.id === product.id));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        clientId: client.id,
        agendaItemId: entry.id,
        type,
        outcome,
        occurredAt: new Date(occurredAt).toISOString(),
        note,
        amount: amount || null,
        productIds,
        nextActionAt: nextActionAt || null,
        promise: null,
      }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo guardar la gestión');
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la gestión');
    } finally { setSaving(false); }
  };
  return <div className="agenda-modal-layer"><button className="agenda-modal-backdrop" aria-label="Cerrar" onClick={onClose} /><form className="agenda-modal data-card" onSubmit={submit}><header><div><span className="section-kicker"><ClipboardCheck size={14} /> Registro comercial</span><h2>{clientPrimaryName(client)}</h2><p>{clientSecondaryName(client) ? `${clientSecondaryName(client)} · ` : ''}Este dato queda en SQLite y no modifica GESI.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={17} /></button></header><div className="agenda-form-grid"><label><span>Tipo de gestión</span><select value={type} onChange={(event) => setType(event.target.value as CommercialActivityType)}>{commercialActionTypes.map((value) => <option key={value} value={value}>{actionLabels[value]}</option>)}</select></label><label><span>Resultado</span><select value={outcome} onChange={(event) => setOutcome(event.target.value as CommercialActivityOutcome)}>{commercialOutcomes.map((value) => <option key={value} value={value}>{outcomeLabels[value]}</option>)}</select></label><label><span>Fecha y hora</span><input type="datetime-local" value={occurredAt} max={defaultOccurredAt(today())} onChange={(event) => setOccurredAt(event.target.value)} required /></label><label><span>Importe asociado · opcional</span><input type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ej. 125.000,50" /></label><label className="full"><span>Resultado y contexto</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder="Qué se habló, objeciones y próximos pasos" /></label><label><span>Próxima acción{outcome === 'rescheduled' ? '' : ' · opcional'}</span><input type="date" min={occurredAt.slice(0, 10)} value={nextActionAt} onChange={(event) => setNextActionAt(event.target.value)} required={outcome === 'rescheduled'} /></label></div>{!!offered.length && <fieldset className="offered-products"><legend>Productos ofrecidos · opcional</legend>{offered.map((product) => <label key={product.id}><input type="checkbox" checked={productIds.includes(product.id)} onChange={() => setProductIds((current) => current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id])} /><span>{product.name}</span></label>)}</fieldset>}{error && <p className="form-error modal-error">{error}</p>}<footer><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary large" disabled={saving}><Save size={16} /> {saving ? 'Guardando…' : 'Guardar gestión'}</button></footer></form></div>;
}

function TaskDialog({ clients, seller, initialDate, onClose, onSaved }: { clients: Client[]; seller: string; initialDate: string; onClose: () => void; onSaved: () => void }) {
  const pool = useMemo(() => clients.filter((client) => matchesMultiFilter(client.seller, seller)), [clients, seller]);
  const [query, setQuery] = useState('');
  const [clientId, setClientId] = useState<number | null>(null);
  const [scheduledFor, setScheduledFor] = useState(initialDate);
  const [actionType, setActionType] = useState<CommercialActivityType>('visit');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const results = query.trim().length < 2 ? [] : pool.filter((client) => `${client.name} ${client.tradeName} ${client.reference} ${client.locality}`.toLowerCase().includes(query.toLowerCase())).slice(0, 7);
  const selected = pool.find((client) => client.id === clientId) ?? null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return setError('Elegí un cliente de la lista');
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/agenda', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, scheduledFor, actionType, reason }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo programar');
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo programar'); } finally { setSaving(false); }
  };
  return <div className="agenda-modal-layer"><button className="agenda-modal-backdrop" aria-label="Cerrar" onClick={onClose} /><form className="agenda-modal compact data-card" onSubmit={submit}><header><div><span className="section-kicker"><Plus size={14} /> Planificación manual</span><h2>Programar una tarea comercial</h2><p>Se suma a las prioridades calculadas por el sistema.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={17} /></button></header><div className="task-client-search"><label><span>Cliente</span><input value={query} onChange={(event) => { setQuery(event.target.value); setClientId(null); }} placeholder="Buscar por razón social, nombre, referencia o localidad" /></label>{!selected && !!results.length && <div>{results.map((client) => <button type="button" key={client.id} onClick={() => { setClientId(client.id); setQuery(clientPrimaryName(client)); }}><strong>{clientPrimaryName(client)}</strong><span>{clientSecondaryName(client) ? `${clientSecondaryName(client)} · ` : ''}{client.locality} · {client.seller}</span></button>)}</div>}{selected && <p><Check size={14} /> {clientPrimaryName(selected)}{clientSecondaryName(selected) ? ` · ${clientSecondaryName(selected)}` : ''} · {selected.seller}</p>}</div><div className="agenda-form-grid"><label><span>Fecha</span><input type="date" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} required /></label><label><span>Acción</span><select value={actionType} onChange={(event) => setActionType(event.target.value as CommercialActivityType)}>{commercialActionTypes.map((value) => <option key={value} value={value}>{actionLabels[value]}</option>)}</select></label><label className="full"><span>Motivo</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={500} placeholder="Qué hay que resolver o conversar" /></label></div>{error && <p className="form-error modal-error">{error}</p>}<footer><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}><CalendarDays size={15} /> {saving ? 'Programando…' : 'Programar tarea'}</button></footer></form></div>;
}
