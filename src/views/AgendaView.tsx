import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Check, CheckCircle2, ChevronRight, ClipboardCheck, MapPin, MessageSquareText, Package, Phone, Plus, RefreshCw, Route, Save, Sparkles, UserRound, X, } from "lucide-react";
import type { AgendaEntry, AgendaPayload, Client, CommercialActivityOutcome, CommercialActivityType, Product, Recommendation, } from "../../shared/models";
import { matchesMultiFilter, multiFilterLabel } from "../../shared/multi-filter";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { SavedViewsBar } from "../components/SavedViewsBar";
import { clientInitials, clientPrimaryName, clientSecondaryName } from "../lib/client-name";
import { compactDate, longDate, money } from "../lib/format";
const actionLabels: Record<CommercialActivityType, string> = {
    visit: "Visit",
    call: "Call",
    collection: "Collections",
    offer: "Offer",
};
const outcomeLabels: Record<CommercialActivityOutcome, string> = {
    completed: "Activity completed",
    sale: "Sale completed",
    promise: "Payment promise",
    no_contact: "No contact",
    rescheduled: "Rescheduled",
    no_interest: "Not interested for now",
};
const sourceLabels = { algorithm: "Suggested", manual: "Scheduled", promise: "Promise" } as const;
const commercialActionTypes: CommercialActivityType[] = ["visit", "call", "offer"];
const commercialOutcomes: CommercialActivityOutcome[] = ["completed", "sale", "no_contact", "rescheduled", "no_interest"];
const isCommercialEntry = (entry: AgendaEntry) => entry.source !== "promise" && entry.actionType !== "collection";
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
function defaultOccurredAt(date: string) {
    const current = new Date();
    if (date === today()) {
        const offset = current.getTimezoneOffset() * 60000;
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
    const sellers = useMemo(() => [...new Set(activeClients.map((client) => client.seller).filter((name) => name && name !== "No seller"))].sort((a, b) => a.localeCompare(b, "en")), [activeClients]);
    const [date, setDate] = useState(today);
    const [seller, setSeller] = useState("");
    const [data, setData] = useState<AgendaPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState("pending");
    const [activityOpen, setActivityOpen] = useState(false);
    const [taskOpen, setTaskOpen] = useState(false);
    const [refreshToken, setRefreshToken] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError("");
        fetch(`/api/agenda?date=${encodeURIComponent(date)}&seller=${encodeURIComponent(seller)}`, { signal: controller.signal })
            .then((response) => {
            if (!response.ok)
                throw new Error("The agenda could not be loaded");
            return response.json();
        })
            .then((payload: AgendaPayload) => {
            setData(payload);
            const commercialEntries = payload.entries.filter(isCommercialEntry);
            setSelectedId((current) => commercialEntries.some((entry) => entry.id === current) ? current : commercialEntries[0]?.id ?? null);
        })
            .catch((cause: Error) => {
            if (cause.name !== "AbortError")
                setError(cause.message);
        })
            .finally(() => {
            if (!controller.signal.aborted)
                setLoading(false);
        });
        return () => controller.abort();
    }, [date, seller, refreshToken]);
    const reload = () => setRefreshToken((value) => value + 1);
    const commercialEntries = useMemo(() => (data?.entries ?? []).filter(isCommercialEntry), [data]);
    const visibleEntries = useMemo(() => commercialEntries.filter((entry) => matchesMultiFilter(entry.status, statusFilter)), [commercialEntries, statusFilter]);
    const selectedEntry = commercialEntries.find((entry) => entry.id === selectedId) ?? visibleEntries[0] ?? null;
    const selectedClient = selectedEntry ? clients.find((client) => client.id === selectedEntry.clientId) ?? null : null;
    const selectedActivities = data?.activities.filter((activity) => activity.clientId === selectedClient?.id && activity.type !== "collection" && activity.outcome !== "promise").slice(0, 8) ?? [];
    const selectedDateLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`));
    const savedFilters = { date, seller, statusFilter, selectedEntryId: selectedEntry?.id ?? "" };
    const applySaved = (saved: Record<string, string>) => {
        setDate(saved.date || today());
        setSeller(saved.seller || "");
        setStatusFilter(saved.statusFilter || "pending");
        setSelectedId(saved.selectedEntryId || null);
    };
    const planned = commercialEntries.filter((entry) => entry.source === "algorithm").length;
    const pending = commercialEntries.filter((entry) => entry.status === "pending").length;
    const completed = commercialEntries.filter((entry) => entry.status === "completed").length;
    const visitAndCalls = commercialEntries.filter((entry) => entry.actionType === "visit" || entry.actionType === "call").length;
    const offers = commercialEntries.filter((entry) => entry.actionType === "offer").length;
    return (<div className="page-view agenda-page" data-tour="agenda-workstation">
      <section className="agenda-command data-card">
        <div className="agenda-command-title"><span className="section-kicker"><ClipboardCheck size={14}/> Commercial operations</span><h2>Commercial activities</h2><p>{selectedDateLabel} · visits, calls, and offers kept separate from accounts-receivable follow-up.</p></div>
        <div className="agenda-command-controls">
          <label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)}/></label>
          <MultiSelectFilter label="Seller" value={seller} options={sellers} onChange={setSeller} allLabel="All"/>
          <button className="button secondary" onClick={reload} disabled={loading}><RefreshCw size={15}/> Refresh</button>
          <button className="button primary" onClick={() => setTaskOpen(true)}><Plus size={16}/> New task</button>
        </div>
      </section>

      <SavedViewsBar viewKey="agenda" filters={savedFilters} onApply={applySaved}/>

      <div className="agenda-kpis" data-tour="agenda-kpis">
        <article title={data?.definitions.planned}><span className="agenda-kpi-icon green"><CalendarDays size={19}/></span><div><span>Pending</span><strong>{data ? pending : "\u2014"}</strong><small>{data ? `${planned} suggested priorities` : "Loading activities"}</small></div></article>
        <article title={data?.definitions.completed}><span className="agenda-kpi-icon blue"><CheckCircle2 size={19}/></span><div><span>Recorded activities</span><strong>{data ? completed : "\u2014"}</strong><small>on the selected date</small></div></article>
        <article><span className="agenda-kpi-icon red"><Phone size={19}/></span><div><span>Visits and calls</span><strong>{data ? visitAndCalls : "\u2014"}</strong><small>planned for the date</small></div></article>
        <article><span className="agenda-kpi-icon ochre"><Package size={19}/></span><div><span>Offers</span><strong>{data ? offers : "\u2014"}</strong><small>commercial actions</small></div></article>
      </div>

      <div className="agenda-layout">
        <section className="data-card agenda-list-card">
          <div className="data-card-header"><div><span className="section-kicker"><CalendarDays size={14}/> Today's priorities</span><h2>{multiFilterLabel(seller, "All sellers")}</h2></div><MultiSelectFilter className="agenda-status-filter" label="Status" value={statusFilter} options={[{ value: "pending", label: "Pending" }, { value: "completed", label: "Dones" }]} onChange={setStatusFilter}/></div>
          <div className="agenda-entry-list">
            {loading && <div className="agenda-empty"><RefreshCw size={22}/><strong>Loading priorities…</strong></div>}
            {error && <div className="agenda-empty error"><AlertTriangle size={22}/><strong>{error}</strong><button className="button secondary" onClick={reload}>Reintentar</button></div>}
            {!loading && !error && !visibleEntries.length && <div className="agenda-empty"><CheckCircle2 size={27}/><strong>There are no tasks in this filter</strong><p>Show all tasks or schedule a new action.</p></div>}
            {visibleEntries.map((entry) => {
            const entryClient = clients.find((client) => client.id === entry.clientId);
            return <button key={entry.id} className={`agenda-entry ${selectedEntry?.id === entry.id ? "active" : ""} ${entry.status}`} onClick={() => setSelectedId(entry.id)}>
              <span className={`agenda-action-icon ${entry.actionType}`}>{entry.actionType === "call" ? <Phone size={16}/> : entry.actionType === "offer" ? <Package size={16}/> : <MapPin size={16}/>}</span>
              <div className="agenda-entry-copy"><div><strong>{entryClient ? clientPrimaryName(entryClient) : entry.clientName}</strong><span className={`agenda-source ${entry.source}`}>{sourceLabels[entry.source]}</span></div>{entryClient && clientSecondaryName(entryClient) && <small className="agenda-client-trade-name">{clientSecondaryName(entryClient)}</small>}<p>{entry.reason}</p><small>{entry.seller} · {entry.locality} · {actionLabels[entry.actionType]}</small></div>
              <div className="agenda-entry-score"><strong>P{entry.priority}</strong><span>C{entry.collectionRisk} · O{entry.commercialOpportunity}</span>{entry.status === "completed" && <em><Check size={12}/> Done</em>}</div>
            </button>;
        })}
          </div>
        </section>

        <section className="agenda-detail-card data-card">
          {!selectedClient || !selectedEntry ? <div className="agenda-detail-empty"><UserRound size={38}/><h2>Choose a task</h2><p>Review context, product suggestions, and history before contacting the customer.</p></div> : <>
            <header className="agenda-client-hero">
              <div className="client-avatar">{clientInitials(selectedClient)}</div>
              <div><span className="section-kicker">{selectedClient.reference} · {selectedClient.segment}</span><h2>{clientPrimaryName(selectedClient)}</h2>{clientSecondaryName(selectedClient) && <span className="client-profile-trade-name">{clientSecondaryName(selectedClient)}</span>}<p><MapPin size={13}/> {selectedClient.address}, {selectedClient.locality}</p><button className="entity-link agenda-seller-link" onClick={() => onOpenSeller(selectedClient.seller)}>{selectedClient.seller}<ChevronRight size={12}/></button></div>
              <button className="icon-button" aria-label="Open complete profile" onClick={() => onOpen(selectedClient)}><ChevronRight size={18}/></button>
            </header>
            <div className="agenda-reason"><span className={`agenda-action-icon ${selectedEntry.actionType}`}>{selectedEntry.actionType === "call" ? <Phone size={16}/> : selectedEntry.actionType === "offer" ? <Package size={16}/> : <MapPin size={16}/>}</span><div><span>Task reason · {sourceLabels[selectedEntry.source]}</span><strong>{selectedEntry.reason}</strong></div></div>
            {selectedClient.salesBlocked && <div className="agenda-guardrail"><AlertTriangle size={17}/><span>The local demo record flags a sales block. Confirm with the office before taking an order.</span></div>}
            <div className="agenda-client-metrics"><article><span>Risk</span><strong>C{selectedClient.collectionRisk}</strong><small>{money(selectedClient.overdueOutstanding, true)} overdue</small></article><article><span>Opportunity</span><strong>O{selectedClient.commercialOpportunity}</strong><small>{selectedClient.salesDelta >= 0 ? "+" : ""}{selectedClient.salesDelta}% sales</small></article><article><span>Last purchase</span><strong>{compactDate(selectedClient.lastPurchaseAt)}</strong><small>{money(selectedClient.sales90d, true)} in 90d</small></article></div>
            {selectedClient.salesBlocked ? <section className="agenda-offers"><div className="section-title-row"><div><span className="section-kicker"><AlertTriangle size={14}/> Offer pausada</span><h3>Validate before recommending</h3></div></div><p className="section-description">Suggestions stay hidden while a sales block is active. The profile retains the context for office review.</p></section> : <AgendaRecommendations client={selectedClient} onOpenProduct={onOpenProduct}/>}
            <section className="agenda-history-section">
              <div className="section-title-row"><div><span className="section-kicker"><MessageSquareText size={14}/> Local history</span><h3>Visits, calls, and offers</h3></div></div>
              {!selectedActivities.length && <p className="section-description">No commercial activity has been saved for this customer yet.</p>}
              {selectedActivities.map((activity) => <article className="agenda-activity-row" key={activity.id}><span>{actionLabels[activity.type]}</span><div><strong>{outcomeLabels[activity.outcome]}</strong><small>{longDate(activity.occurredAt)}{activity.note ? ` \u00B7 ${activity.note}` : ""}</small></div>{activity.amount != null && <strong>{money(activity.amount, true)}</strong>}</article>)}
            </section>
            <footer className="agenda-detail-actions"><button className="button secondary" disabled={!selectedClient.coordinates} onClick={() => onPlanRoute(selectedClient.id)}><Route size={16}/> Add to route</button><button className="button primary large" onClick={() => setActivityOpen(true)}><ClipboardCheck size={16}/> Record activity</button></footer>
          </>}
        </section>
      </div>

      {activityOpen && selectedClient && selectedEntry && <ActivityDialog client={selectedClient} entry={selectedEntry} operationalDate={date} products={products} onClose={() => setActivityOpen(false)} onSaved={() => { setActivityOpen(false); reload(); onOperationalChange(); }}/>}
      {taskOpen && <TaskDialog clients={activeClients} seller={seller} initialDate={date} onClose={() => setTaskOpen(false)} onSaved={() => { setTaskOpen(false); reload(); }}/>}
    </div>);
}
function AgendaRecommendations({ client, onOpenProduct }: {
    client: Client;
    onOpenProduct: (product: Product) => void;
}) {
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
            if (!controller.signal.aborted)
                setLoading(false);
        });
        return () => controller.abort();
    }, [client.id]);
    return <section className="agenda-offers"><div className="section-title-row"><div><span className="section-kicker"><Sparkles size={14}/> Suggested offer</span><h3>Products to discuss</h3></div><span className="algorithm-pill">Algorithmic</span></div>{loading && <p className="section-description">Calculating similarity and adoption across comparable customers…</p>}<div className="agenda-offer-grid">{recommendations.slice(0, 3).map((item) => <article key={item.product.id}><span><Package size={16}/></span><div><button className="entity-link product-entity-link" onClick={() => onOpenProduct(item.product)}>{item.product.name}<ChevronRight size={12}/></button><small>{item.reason}</small></div><em>{item.score}</em></article>)}</div>{!loading && !recommendations.length && <p className="section-description">The current evidence does not support a useful recommendation.</p>}</section>;
}
function ActivityDialog({ client, entry, operationalDate, products, onClose, onSaved }: {
    client: Client;
    entry: AgendaEntry;
    operationalDate: string;
    products: Product[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const [type, setType] = useState<CommercialActivityType>(entry.actionType);
    const [outcome, setOutcome] = useState<CommercialActivityOutcome>("completed");
    const [occurredAt, setOccurredAt] = useState(defaultOccurredAt(operationalDate > today() ? today() : operationalDate));
    const [note, setNote] = useState("");
    const [amount, setAmount] = useState("");
    const [nextActionAt, setNextActionAt] = useState("");
    const [productIds, setProductIds] = useState<string[]>([]);
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => { fetch(`/api/clients/${client.id}/recommendations`).then((response) => response.json()).then((payload) => setRecommendations(payload.recommendations || [])).catch(() => setRecommendations([])); }, [client.id]);
    const offered = recommendations.slice(0, 5).map((item) => item.product).filter((product) => products.some((item) => item.id === product.id));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError("");
        try {
            const response = await fetch("/api/activities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
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
            if (!response.ok)
                throw new Error(payload.error || "The activity could not be saved");
            onSaved();
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : "The activity could not be saved");
        }
        finally {
            setSaving(false);
        }
    };
    return <div className="agenda-modal-layer"><button className="agenda-modal-backdrop" aria-label="Close" onClick={onClose}/><form className="agenda-modal data-card" onSubmit={submit}><header><div><span className="section-kicker"><ClipboardCheck size={14}/> Commercial record</span><h2>{clientPrimaryName(client)}</h2><p>{clientSecondaryName(client) ? `${clientSecondaryName(client)} \u00B7 ` : ""}This entry stays in local operational storage and does not alter analytical facts.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={17}/></button></header><div className="agenda-form-grid"><label><span>Activity type</span><select value={type} onChange={(event) => setType(event.target.value as CommercialActivityType)}>{commercialActionTypes.map((value) => <option key={value} value={value}>{actionLabels[value]}</option>)}</select></label><label><span>Outcome</span><select value={outcome} onChange={(event) => setOutcome(event.target.value as CommercialActivityOutcome)}>{commercialOutcomes.map((value) => <option key={value} value={value}>{outcomeLabels[value]}</option>)}</select></label><label><span>Date and time</span><input type="datetime-local" value={occurredAt} max={defaultOccurredAt(today())} onChange={(event) => setOccurredAt(event.target.value)} required/></label><label><span>Related amount · optional</span><input type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 125.000,50"/></label><label className="full"><span>Outcome and context</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder="Discussion, objections, and next steps"/></label><label><span>Next action{outcome === "rescheduled" ? "" : " \u00B7 optional"}</span><input type="date" min={occurredAt.slice(0, 10)} value={nextActionAt} onChange={(event) => setNextActionAt(event.target.value)} required={outcome === "rescheduled"}/></label></div>{!!offered.length && <fieldset className="offered-products"><legend>Products offered · optional</legend>{offered.map((product) => <label key={product.id}><input type="checkbox" checked={productIds.includes(product.id)} onChange={() => setProductIds((current) => current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id])}/><span>{product.name}</span></label>)}</fieldset>}{error && <p className="form-error modal-error">{error}</p>}<footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary large" disabled={saving}><Save size={16}/> {saving ? "Saving\u2026" : "Save activity"}</button></footer></form></div>;
}
function TaskDialog({ clients, seller, initialDate, onClose, onSaved }: {
    clients: Client[];
    seller: string;
    initialDate: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    const pool = useMemo(() => clients.filter((client) => matchesMultiFilter(client.seller, seller)), [clients, seller]);
    const [query, setQuery] = useState("");
    const [clientId, setClientId] = useState<number | null>(null);
    const [scheduledFor, setScheduledFor] = useState(initialDate);
    const [actionType, setActionType] = useState<CommercialActivityType>("visit");
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const results = query.trim().length < 2 ? [] : pool.filter((client) => `${client.name} ${client.tradeName} ${client.reference} ${client.locality}`.toLowerCase().includes(query.toLowerCase())).slice(0, 7);
    const selected = pool.find((client) => client.id === clientId) ?? null;
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selected)
            return setError("Choose a customer from the list");
        setSaving(true);
        setError("");
        try {
            const response = await fetch("/api/agenda", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, scheduledFor, actionType, reason }) });
            const payload = await response.json();
            if (!response.ok)
                throw new Error(payload.error || "The task could not be scheduled");
            onSaved();
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : "The task could not be scheduled");
        }
        finally {
            setSaving(false);
        }
    };
    return <div className="agenda-modal-layer"><button className="agenda-modal-backdrop" aria-label="Close" onClick={onClose}/><form className="agenda-modal compact data-card" onSubmit={submit}><header><div><span className="section-kicker"><Plus size={14}/> Manual planning</span><h2>Schedule a commercial task</h2><p>It is added to the priorities calculated by the system.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={17}/></button></header><div className="task-client-search"><label><span>Customer</span><input value={query} onChange={(event) => { setQuery(event.target.value); setClientId(null); }} placeholder="Search by company, trade name, reference, or locality"/></label>{!selected && !!results.length && <div>{results.map((client) => <button type="button" key={client.id} onClick={() => { setClientId(client.id); setQuery(clientPrimaryName(client)); }}><strong>{clientPrimaryName(client)}</strong><span>{clientSecondaryName(client) ? `${clientSecondaryName(client)} \u00B7 ` : ""}{client.locality} · {client.seller}</span></button>)}</div>}{selected && <p><Check size={14}/> {clientPrimaryName(selected)}{clientSecondaryName(selected) ? ` \u00B7 ${clientSecondaryName(selected)}` : ""} · {selected.seller}</p>}</div><div className="agenda-form-grid"><label><span>Date</span><input type="date" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} required/></label><label><span>Action</span><select value={actionType} onChange={(event) => setActionType(event.target.value as CommercialActivityType)}>{commercialActionTypes.map((value) => <option key={value} value={value}>{actionLabels[value]}</option>)}</select></label><label className="full"><span>Reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={500} placeholder="What needs to be resolved or discussed"/></label></div>{error && <p className="form-error modal-error">{error}</p>}<footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}><CalendarDays size={15}/> {saving ? "Scheduling\u2026" : "Schedule task"}</button></footer></form></div>;
}
