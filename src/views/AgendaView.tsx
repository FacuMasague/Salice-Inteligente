import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  FileText,
  MapPin,
  MessageSquareText,
  Package,
  Plus,
  RefreshCw,
  Route,
  Save,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import type {
  Client,
  CommercialActivity,
  CommercialActivityType,
  CommercialInboxEntry,
  CommercialInboxPayload,
  CommercialInboxSource,
  Product,
  Recommendation,
} from '../../shared/models';
import { isCommercialOpportunityEligible } from '../../shared/commercial-opportunities';
import { matchesMultiFilter, multiFilterLabel } from '../../shared/multi-filter';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { AiCommercialExplanationCard } from '../components/AiInsights';
import { clientInitials, clientPrimaryName, clientSecondaryName } from '../lib/client-name';
import { compactDate, longDate, money, shortDate } from '../lib/format';

const sourceLabels: Record<CommercialInboxSource, string> = {
  system: 'Sistema',
  promise: 'Promesa',
  reminder: 'Recordatorio',
  note: 'Nota de oficina',
};
const noteTypeLabels: Record<CommercialActivityType, string> = {
  note: 'Nota general',
  visit: 'Visita realizada',
  call: 'Llamada realizada',
  collection: 'Cobranza',
  offer: 'Oferta conversada',
};
const noteTypes: CommercialActivityType[] = ['note', 'visit', 'call', 'offer'];
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

function localDateTime() {
  const current = new Date();
  const offset = current.getTimezoneOffset() * 60_000;
  return new Date(current.getTime() - offset).toISOString().slice(0, 16);
}

function sourceIcon(source: CommercialInboxSource) {
  if (source === 'promise') return <CircleDollarSign size={14} />;
  if (source === 'reminder') return <CalendarDays size={14} />;
  if (source === 'note') return <MessageSquareText size={14} />;
  return <Sparkles size={14} />;
}

interface AgendaViewProps {
  clients: Client[];
  products: Product[];
  onOpen: (client: Client) => void;
  onOpenSeller: (seller: string) => void;
  onOpenProduct: (product: Product) => void;
  onPlanRoute: (clientId: number) => void;
  onOpenReceivables: () => void;
  onOperationalChange: () => void;
}

export function AgendaView({
  clients,
  products: _products,
  onOpen,
  onOpenSeller,
  onOpenProduct,
  onPlanRoute,
  onOpenReceivables,
  onOperationalChange,
}: AgendaViewProps) {
  const activeClients = useMemo(() => clients.filter((client) => client.active), [clients]);
  const sellers = useMemo(() => [...new Set(activeClients.map((client) => client.seller).filter((name) => name && name !== 'Sin vendedor'))]
    .sort((left, right) => left.localeCompare(right, 'es')), [activeClients]);
  const [date, setDate] = useState(today);
  const [seller, setSeller] = useState('');
  const [source, setSource] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<CommercialInboxPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/agenda?date=${encodeURIComponent(date)}&seller=${encodeURIComponent(seller)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('No se pudo cargar la bandeja comercial');
        return response.json();
      })
      .then((payload: CommercialInboxPayload) => {
        setData(payload);
        setSelectedId((current) => payload.entries.some((entry) => entry.clientId === current)
          ? current
          : payload.entries[0]?.clientId ?? null);
      })
      .catch((cause: Error) => {
        if (cause.name !== 'AbortError') setError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, seller, refreshToken]);

  const reload = () => setRefreshToken((value) => value + 1);
  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const visibleEntries = useMemo(() => (data?.entries ?? []).filter((entry) => {
    if (source && !entry.sources.some((value) => matchesMultiFilter(value, source))) return false;
    if (normalizedQuery && !`${entry.clientName} ${entry.seller} ${entry.locality} ${entry.signals.map((item) => `${item.label} ${item.detail}`).join(' ')}`
      .toLocaleLowerCase('es').includes(normalizedQuery)) return false;
    return true;
  }), [data, normalizedQuery, source]);
  const selectedEntry = visibleEntries.find((entry) => entry.clientId === selectedId) ?? visibleEntries[0] ?? null;
  const selectedClient = selectedEntry ? clients.find((client) => client.id === selectedEntry.clientId) ?? null : null;
  const selectedOpportunityEligible = selectedClient ? isCommercialOpportunityEligible(selectedClient) : false;
  const weekLabel = data
    ? `${shortDate(data.weekStart)} al ${shortDate(data.weekEnd)}`
    : 'semana seleccionada';
  const savedFilters = { date, seller, source, query, selectedClientId: String(selectedEntry?.clientId ?? '') };
  const applySaved = (saved: Record<string, string>) => {
    setDate(saved.date || today());
    setSeller(saved.seller || '');
    setSource(saved.source || '');
    setQuery(saved.query || '');
    setSelectedId(Number(saved.selectedClientId) || null);
  };

  return (
    <div className="page-view agenda-page commercial-inbox-page" data-tour="agenda-workstation">
      <section className="agenda-command data-card">
        <div className="agenda-command-title">
          <span className="section-kicker"><ClipboardList size={14} /> Administración comercial</span>
          <h2>Bandeja comercial</h2>
          <p>{weekLabel} · señales, oportunidades, promesas, recordatorios y notas en una sola lectura.</p>
        </div>
        <div className="agenda-command-controls">
          <label><span>Semana que contiene</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <MultiSelectFilter label="Vendedor" value={seller} options={sellers} onChange={setSeller} allLabel="Todos" />
          <button className="button secondary" onClick={reload} disabled={loading}><RefreshCw size={15} /> Actualizar</button>
          <button className="button primary" onClick={() => setNoteOpen(true)}><Plus size={16} /> Agregar nota</button>
        </div>
      </section>

      <SavedViewsBar viewKey="agenda" filters={savedFilters} onApply={applySaved} />

      <div className="agenda-kpis" data-tour="agenda-kpis">
        <article><span className="agenda-kpi-icon green"><UserRound size={19} /></span><div><span>Clientes visibles</span><strong>{data ? data.stats.clients : '—'}</strong><small>sin duplicarlos por motivo</small></div></article>
        <article title={data?.definitions.systemSignals}><span className="agenda-kpi-icon blue"><Sparkles size={19} /></span><div><span>Señales del sistema</span><strong>{data ? data.stats.systemSignals : '—'}</strong><small>orientan; no planifican</small></div></article>
        <article title={data?.definitions.dueItems}><span className="agenda-kpi-icon red"><CalendarDays size={19} /></span><div><span>Compromisos y recordatorios</span><strong>{data ? data.stats.dueItems : '—'}</strong><small>existentes hasta fin de semana</small></div></article>
        <article title={data?.definitions.notes}><span className="agenda-kpi-icon ochre"><MessageSquareText size={19} /></span><div><span>Notas de la semana</span><strong>{data ? data.stats.notes : '—'}</strong><small>hechos registrados por la oficina</small></div></article>
      </div>

      <section className="data-card commercial-inbox-filters">
        <MultiSelectFilter
          label="Origen"
          value={source}
          options={Object.entries(sourceLabels).map(([value, label]) => ({ value, label }))}
          onChange={setSource}
          allLabel="Todos"
        />
        <label className="inline-search"><FileText size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, localidad o motivo…" /></label>
        <span>{multiFilterLabel(seller, 'Todos los vendedores')}</span>
      </section>

      <div className="agenda-layout">
        <section className="data-card agenda-list-card">
          <div className="data-card-header"><div><span className="section-kicker"><CalendarDays size={14} /> Lectura semanal</span><h2>Clientes para revisar</h2><p>Orden descendente por prioridad P. C, O y P permanecen separados.</p></div><span className="count-badge">{visibleEntries.length}</span></div>
          <div className="agenda-entry-list">
            {loading && <div className="agenda-empty"><RefreshCw size={22} /><strong>Cargando bandeja…</strong></div>}
            {error && <div className="agenda-empty error"><AlertTriangle size={22} /><strong>{error}</strong><button className="button secondary" onClick={reload}>Reintentar</button></div>}
            {!loading && !error && !visibleEntries.length && <div className="agenda-empty"><MessageSquareText size={27} /><strong>No hay clientes en este filtro</strong><p>Cambiá el origen, la búsqueda o la semana.</p></div>}
            {visibleEntries.map((entry) => {
              const entryClient = clients.find((client) => client.id === entry.clientId);
              const primarySignal = entry.signals[0];
              return <button key={entry.clientId} className={`agenda-entry commercial-inbox-entry ${selectedEntry?.clientId === entry.clientId ? 'active' : ''}`} onClick={() => setSelectedId(entry.clientId)}>
                <span className={`agenda-action-icon ${primarySignal?.severity ?? 'information'}`}>{primarySignal?.source === 'promise' ? <CircleDollarSign size={16} /> : primarySignal?.source === 'reminder' ? <CalendarDays size={16} /> : entry.notes.length ? <MessageSquareText size={16} /> : <Sparkles size={16} />}</span>
                <div className="agenda-entry-copy">
                  <div><strong>{entryClient ? clientPrimaryName(entryClient) : entry.clientName}</strong></div>
                  {entryClient && clientSecondaryName(entryClient) && <small className="agenda-client-trade-name">{clientSecondaryName(entryClient)}</small>}
                  <p>{primarySignal?.label ?? 'Nota registrada'}{primarySignal?.date ? ` · ${shortDate(primarySignal.date)}` : ''}</p>
                  <small>{entry.seller} · {entry.locality}</small>
                  <div className="commercial-inbox-source-list">{entry.sources.map((value) => <span key={value} className={value}>{sourceIcon(value)} {sourceLabels[value]}</span>)}</div>
                </div>
                <div className="agenda-entry-score"><strong>P{entry.visitPriority}</strong><span>C{entry.collectionRisk}{!entry.salesBlocked && entry.sales90d > 0 ? ` · O${entry.commercialOpportunity}` : ''}</span><em>{entry.signals.length} motivo{entry.signals.length === 1 ? '' : 's'}</em></div>
              </button>;
            })}
          </div>
        </section>

        <section className="agenda-detail-card data-card commercial-inbox-detail">
          {!selectedClient || !selectedEntry ? <div className="agenda-detail-empty"><UserRound size={38} /><h2>Elegí un cliente</h2><p>Vas a ver por qué aparece, las oportunidades disponibles y las notas de oficina.</p></div> : <>
            <header className="agenda-client-hero">
              <div className="client-avatar">{clientInitials(selectedClient)}</div>
              <div><span className="section-kicker">{selectedClient.reference} · {selectedClient.segment}</span><h2>{clientPrimaryName(selectedClient)}</h2>{clientSecondaryName(selectedClient) && <span className="client-profile-trade-name">{clientSecondaryName(selectedClient)}</span>}<p><MapPin size={13} /> {selectedClient.address}, {selectedClient.locality}</p><button className="entity-link agenda-seller-link" onClick={() => onOpenSeller(selectedClient.seller)}>{selectedClient.seller}<ChevronRight size={12} /></button></div>
              <button className="icon-button" aria-label="Abrir ficha completa" onClick={() => onOpen(selectedClient)}><ChevronRight size={18} /></button>
            </header>

            <div className="agenda-client-metrics"><article><span>Riesgo</span><strong>C{selectedEntry.collectionRisk}</strong><small>{money(selectedEntry.overdueOutstanding, true)} vencido</small></article>{selectedOpportunityEligible && <article><span>Oportunidad</span><strong>O{selectedEntry.commercialOpportunity}</strong><small>{selectedEntry.salesDelta >= 0 ? '+' : ''}{selectedEntry.salesDelta}% ventas</small></article>}<article><span>Prioridad combinada</span><strong>P{selectedEntry.visitPriority}</strong><small>no es una planificación</small></article></div>

            <section className="commercial-inbox-reasons">
              <div className="section-title-row"><div><span className="section-kicker"><ClipboardList size={14} /> Motivos visibles</span><h3>Por qué aparece en la bandeja</h3></div><span className="count-badge">{selectedEntry.signals.length}</span></div>
              {!selectedEntry.signals.length && <p className="section-description">Aparece porque la oficina registró una nota durante esta semana.</p>}
              {selectedEntry.signals.map((item) => <article key={item.id} className={`commercial-inbox-signal ${item.severity}`}>
                <span className={item.source}>{sourceIcon(item.source)}</span>
                <div><strong>{item.label}</strong><p>{item.detail}</p><small>{sourceLabels[item.source]}{item.date ? ` · ${longDate(item.date)}` : ''}</small></div>
                {item.amount != null && <b>{money(item.amount, true)}</b>}
              </article>)}
            </section>

            <AiCommercialExplanationCard artifact={selectedEntry.aiExplanation} />

            {!selectedOpportunityEligible ? <section className="agenda-offers"><div className="section-title-row"><div><span className="section-kicker"><AlertTriangle size={14} /> Sin oportunidades comerciales</span><h3>{selectedClient.salesBlocked ? 'Cliente con bloqueo de ventas' : 'Sin compras en los últimos 90 días'}</h3></div></div><p className="section-description">{selectedClient.salesBlocked ? 'Puede permanecer en la bandeja por cobranza, recordatorios o notas, pero no se muestra como oportunidad ni recibe productos sugeridos mientras GESI informe el bloqueo.' : 'Puede permanecer en la bandeja por cobranza, recordatorios o notas, pero se necesita una compra reciente para evaluar su mix sin inventar afinidad.'}</p></section> : <InboxOpportunities client={selectedClient} onOpenProduct={onOpenProduct} />}

            <section className="agenda-history-section">
              <div className="section-title-row"><div><span className="section-kicker"><MessageSquareText size={14} /> Notas de oficina</span><h3>Hechos registrados fuera del sistema</h3></div><span className="count-badge">{selectedEntry.notes.length}</span></div>
              {!selectedEntry.notes.length && <p className="section-description">Todavía no hay notas para este cliente. Una nota no completa ni modifica las sugerencias.</p>}
              {selectedEntry.notes.map((note) => <article className="agenda-activity-row" key={note.id}><span>{noteTypeLabels[note.type]}</span><div><strong>{note.note}</strong><small>{longDate(note.occurredAt)}</small></div></article>)}
            </section>

            <footer className="agenda-detail-actions">
              {selectedEntry.sources.some((value) => value === 'promise' || value === 'reminder') && <button className="button secondary" onClick={onOpenReceivables}><CircleDollarSign size={16} /> Abrir cuentas por cobrar</button>}
              <button className="button secondary" disabled={!selectedClient.coordinates} onClick={() => onPlanRoute(selectedClient.id)}><Route size={16} /> Ver en rutas</button>
              <button className="button primary large" onClick={() => setNoteOpen(true)}><MessageSquareText size={16} /> Agregar nota</button>
            </footer>
          </>}
        </section>
      </div>

      {noteOpen && <CommercialNoteDialog
        clients={activeClients}
        initialClient={selectedClient}
        onClose={() => setNoteOpen(false)}
        onSaved={() => {
          setNoteOpen(false);
          reload();
          onOperationalChange();
        }}
      />}
    </div>
  );
}

function InboxOpportunities({ client, onOpenProduct }: { client: Client; onOpenProduct: (product: Product) => void }) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/clients/${client.id}/recommendations`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => setRecommendations(payload.recommendations || []))
      .catch(() => setRecommendations([]))
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [client.id]);
  return <section className="agenda-offers"><div className="section-title-row"><div><span className="section-kicker"><Sparkles size={14} /> Oportunidades explicables</span><h3>Productos para conversar</h3></div><span className="algorithm-pill">Sistema</span></div>{loading && <p className="section-description">Calculando mix, comparables, quiebres y disponibilidad…</p>}<div className="agenda-offer-grid">{recommendations.slice(0, 3).map((item) => <article key={item.product.id}><span><Package size={16} /></span><div><button className="entity-link product-entity-link" onClick={() => onOpenProduct(item.product)}>{item.product.name}<ChevronRight size={12} /></button><small>{item.reason} · {item.confidence === 'reliable' ? 'confianza alta' : item.confidence === 'exploratory' ? 'confianza media' : 'confianza limitada'}</small></div><em>{item.score}</em></article>)}</div>{!loading && !recommendations.length && <p className="section-description">No hay una oportunidad suficientemente respaldada con los datos actuales.</p>}<p className="section-description recommendation-human-rule">El puntaje ordena evidencia: no es probabilidad de compra y no registra que el producto haya sido ofrecido.</p></section>;
}

function CommercialNoteDialog({
  clients,
  initialClient,
  onClose,
  onSaved,
}: {
  clients: Client[];
  initialClient: Client | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [query, setQuery] = useState(initialClient ? clientPrimaryName(initialClient) : '');
  const [clientId, setClientId] = useState<number | null>(initialClient?.id ?? null);
  const [type, setType] = useState<CommercialActivityType>('note');
  const [occurredAt, setOccurredAt] = useState(localDateTime);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selected = clients.find((client) => client.id === clientId) ?? null;
  const results = query.trim().length < 2
    ? []
    : clients.filter((client) => `${client.name} ${client.tradeName} ${client.reference} ${client.locality}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))).slice(0, 7);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return setError('Elegí un cliente de la lista');
    if (!note.trim()) return setError('Escribí una nota breve sobre lo ocurrido');
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/commercial-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selected.id,
          type,
          occurredAt: new Date(occurredAt).toISOString(),
          note,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo guardar la nota');
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la nota');
    } finally {
      setSaving(false);
    }
  };
  return <div className="agenda-modal-layer"><button className="agenda-modal-backdrop" aria-label="Cerrar" onClick={onClose} /><form className="agenda-modal compact data-card" onSubmit={submit}><header><div><span className="section-kicker"><MessageSquareText size={14} /> Registro de oficina</span><h2>Agregar una nota</h2><p>Documenta algo ocurrido fuera del sistema. No comunica, asigna ni planifica acciones.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={17} /></button></header><div className="task-client-search"><label><span>Cliente</span><input value={query} onChange={(event) => { setQuery(event.target.value); setClientId(null); }} placeholder="Buscar por razón social, nombre, referencia o localidad" /></label>{!selected && !!results.length && <div>{results.map((client) => <button type="button" key={client.id} onClick={() => { setClientId(client.id); setQuery(clientPrimaryName(client)); }}><strong>{clientPrimaryName(client)}</strong><span>{clientSecondaryName(client) ? `${clientSecondaryName(client)} · ` : ''}{client.locality} · {client.seller}</span></button>)}</div>}{selected && <p>{clientPrimaryName(selected)}{clientSecondaryName(selected) ? ` · ${clientSecondaryName(selected)}` : ''} · {selected.seller}</p>}</div><div className="agenda-form-grid"><label><span>Categoría</span><select value={type} onChange={(event) => setType(event.target.value as CommercialActivityType)}>{noteTypes.map((value) => <option key={value} value={value}>{noteTypeLabels[value]}</option>)}</select></label><label><span>Cuándo ocurrió</span><input type="datetime-local" value={occurredAt} max={localDateTime()} onChange={(event) => setOccurredAt(event.target.value)} required /></label><label className="full"><span>Nota</span><textarea value={note} onChange={(event) => setNote(event.target.value)} required maxLength={1000} placeholder="Qué ocurrió y qué contexto conviene conservar…" /></label></div>{error && <p className="form-error modal-error">{error}</p>}<footer><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}><Save size={15} /> {saving ? 'Guardando…' : 'Guardar nota'}</button></footer></form></div>;
}
