import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Clock3, MapPin, Navigation, Route, Sparkles, Truck } from "lucide-react";
import { distanceKm } from "../../shared/algorithms";
import type { Client, RoutePlan } from "../../shared/models";
import { matchesMultiFilter } from "../../shared/multi-filter";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { SavedViewsBar } from "../components/SavedViewsBar";
import { SingleSelectFilter } from "../components/SingleSelectFilter";
import { minutesAsTime, money } from "../lib/format";
import { clientPrimaryName, clientSecondaryName } from "../lib/client-name";
const initialRouteIDs = (clients: Client[]) => {
    const ranked = clients
        .filter((client): client is Client & {
        coordinates: [
            number,
            number
        ];
    } => client.active && client.coordinates !== null)
        .sort((a, b) => b.visitPriority - a.visitPriority);
    const anchor = ranked[0];
    if (!anchor)
        return [];
    const sameLocality = ranked.filter((client) => client.locality === anchor.locality);
    const nearby = ranked.filter((client) => client.locality !== anchor.locality && distanceKm(anchor.coordinates, client.coordinates) <= 35);
    const ordered = [...sameLocality, ...nearby];
    return ordered.slice(0, 5).map((client) => client.id);
};
export function RoutesView({ clients, initialClientId, onOpenClient, onOpenSeller }: {
    clients: Client[];
    initialClientId: number | null;
    onOpenClient: (client: Client) => void;
    onOpenSeller: (seller: string) => void;
}) {
    const routableClients = useMemo(() => clients.filter((client) => client.active && client.coordinates !== null), [clients]);
    const sellers = useMemo(() => [...new Set(routableClients.map((client) => client.seller))].sort((a, b) => a.localeCompare(b, "en")), [routableClients]);
    const [seller, setSeller] = useState(() => {
        const requested = clients.find((client) => client.id === initialClientId && client.active && client.coordinates !== null);
        if (requested)
            return requested.seller;
        return [...routableClients].sort((a, b) => b.visitPriority - a.visitPriority)[0]?.seller || "";
    });
    const [selectedIds, setSelectedIds] = useState<Set<number>>(() => {
        const requested = clients.find((client) => client.id === initialClientId && client.active && client.coordinates !== null);
        const activeRoutable = clients.filter((client) => client.active && client.coordinates !== null);
        const initialSeller = requested?.seller || [...activeRoutable].sort((a, b) => b.visitPriority - a.visitPriority)[0]?.seller;
        const pool = initialSeller ? activeRoutable.filter((client) => client.seller === initialSeller) : activeRoutable;
        const selected = new Set(initialRouteIDs(pool));
        if (requested)
            selected.add(requested.id);
        return selected;
    });
    const [plan, setPlan] = useState<RoutePlan | null>(null);
    const [loading, setLoading] = useState(false);
    const [visitMinutes, setVisitMinutes] = useState(25);
    const [maxWorkMinutes, setMaxWorkMinutes] = useState(480);
    useEffect(() => {
        if (!initialClientId)
            return;
        const requested = routableClients.find((client) => client.id === initialClientId);
        if (!requested)
            return;
        const pool = routableClients.filter((client) => client.seller === requested.seller);
        const selected = new Set(initialRouteIDs(pool));
        selected.add(requested.id);
        setSeller(requested.seller);
        setSelectedIds(selected);
        setPlan(null);
    }, [initialClientId, routableClients]);
    const orderedClients = useMemo(() => routableClients.filter((client) => matchesMultiFilter(client.seller, seller)).sort((a, b) => b.visitPriority - a.visitPriority), [routableClients, seller]);
    const selectedSales = clients.filter((client) => selectedIds.has(client.id)).reduce((sum, client) => sum + client.sales90d, 0);
    const savedFilters = { seller, selectedClientIds: [...selectedIds].join(","), visitMinutes: String(visitMinutes), maxWorkMinutes: String(maxWorkMinutes) };
    const applySaved = (saved: Record<string, string>) => {
        const nextSeller = saved.seller || "";
        const validIds = new Set((saved.selectedClientIds || "").split(",").map(Number).filter((id) => routableClients.some((client) => client.id === id)));
        setSeller(nextSeller);
        setSelectedIds(validIds);
        setVisitMinutes([15, 25, 35, 45].includes(Number(saved.visitMinutes)) ? Number(saved.visitMinutes) : 25);
        setMaxWorkMinutes([360, 420, 480, 540].includes(Number(saved.maxWorkMinutes)) ? Number(saved.maxWorkMinutes) : 480);
        setPlan(null);
    };
    const changeSeller = (nextSeller: string) => {
        const pool = routableClients.filter((client) => matchesMultiFilter(client.seller, nextSeller));
        setSeller(nextSeller);
        setSelectedIds(new Set(initialRouteIDs(pool)));
        setPlan(null);
    };
    const toggle = (id: number) => {
        setPlan(null);
        setSelectedIds((current) => {
            const next = new Set(current);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };
    const optimize = async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/routes/optimize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientIds: [...selectedIds], visitMinutes, maxWorkMinutes }) });
            const payload = await response.json();
            if (!response.ok)
                throw new Error(payload.error);
            setPlan(payload);
        }
        finally {
            setLoading(false);
        }
    };
    return (<div className="page-view routes-layout">
      <section className="data-card route-picker" data-tour="route-picker">
        <div className="data-card-header"><div><span className="section-kicker"><CalendarDays size={14}/> Planner</span><h2>Suggested visits</h2></div><div className="route-picker-actions"><MultiSelectFilter label="Seller" value={seller} options={sellers} onChange={changeSeller}/><span className="count-badge">{selectedIds.size} selected</span></div></div>
        <p className="section-description">{orderedClients.length} geolocated customers · Visit priority P combines 58% collection risk and 42% commercial opportunity.</p>
        <div className="route-constraints"><SingleSelectFilter label="Visit duration" value={visitMinutes} options={[{ value: 15, label: "15 min" }, { value: 25, label: "25 min" }, { value: 35, label: "35 min" }, { value: 45, label: "45 min" }]} onChange={(value) => { setVisitMinutes(Number(value)); setPlan(null); }}/><SingleSelectFilter label="Maximum workday" value={maxWorkMinutes} options={[{ value: 360, label: "6 hours" }, { value: 420, label: "7 hours" }, { value: 480, label: "8 hours" }, { value: 540, label: "9 hours" }]} onChange={(value) => { setMaxWorkMinutes(Number(value)); setPlan(null); }}/></div>
        <SavedViewsBar viewKey="routes" filters={savedFilters} onApply={applySaved}/>
        <div className="route-client-list">
          {orderedClients.map((client) => <article className={`route-client ${selectedIds.has(client.id) ? "selected" : ""}`} key={client.id}>
            <button className="route-check-button" onClick={() => toggle(client.id)} aria-label={`${selectedIds.has(client.id) ? "Remove" : "Add"} ${clientPrimaryName(client)} ${selectedIds.has(client.id) ? "from" : "to"} route`}><span className="route-check">{selectedIds.has(client.id) && <Check size={14}/>}</span></button>
            <button className="route-client-identity" onClick={() => onOpenClient(client)}><strong>{clientPrimaryName(client)}</strong><span>{clientSecondaryName(client) && <>{clientSecondaryName(client)} · </>}<MapPin size={12}/> {client.locality}</span></button>
            <button className="entity-link route-seller-link" onClick={() => onOpenSeller(client.seller)}>{client.seller}</button>
            <div className="route-priority"><strong>P{client.visitPriority}</strong><span>C{client.collectionRisk} · O{client.commercialOpportunity}</span></div>
          </article>)}
        </div>
        <div className="route-picker-footer"><div><span>Selected 90-day sales</span><strong>{money(selectedSales, true)}</strong></div><button className="button primary large" disabled={!selectedIds.size || loading} onClick={optimize}><Sparkles size={17}/> {loading ? "Optimizing\u2026" : "Optimize route"}</button></div>
      </section>
      <section className="route-result">
        {!plan ? <div className="route-empty"><div className="empty-route-icon"><Route size={38}/></div><h2>Build the seller's workday</h2><p>Select customers in the same corridor and generate an estimate using geographic distance, a road factor, visit duration, and workday limit.</p><div className="algorithm-explainer"><Sparkles size={16}/><span><strong>Explainable estimate</strong> · validate roads and opening hours before leaving</span></div></div> : <>
          <article className="route-overview data-card">
            <div><span className="section-kicker"><Navigation size={14}/> Estimated route</span><h2>{plan.stops.length}-visit workday</h2><p>Departure from {plan.depot.address} · 09:00 · {plan.feasible ? "within configured limit" : "requires adjustment"}</p></div>
            <div className="route-totals"><span><Truck size={17}/><strong>{plan.totalKm} km</strong><small>route distance</small></span><span><Clock3 size={17}/><strong>{Math.floor(plan.totalMinutes / 60)} h {plan.totalMinutes % 60} min</strong><small>including visits</small></span></div>
          </article>
          {!!plan.warnings.length && <div className="route-warnings">{plan.warnings.map((warning) => <p key={warning}><Clock3 size={15}/> {warning}</p>)}</div>}
          <div className="route-timeline">
            <div className="depot-stop"><span><Truck size={16}/></span><div><strong>{plan.depot.name}</strong><small>{plan.depot.address}, {plan.depot.locality} · exit 09:00</small></div></div>
            {plan.stops.map((stop) => { const client = clients.find((item) => item.id === stop.clientId); const destination = client?.coordinates?.join(","); const visibleName = client ? clientPrimaryName(client) : stop.clientName; return <article key={stop.clientId} className="timeline-stop"><div className="stop-number">{stop.order}</div><div className="stop-card"><div><span className="section-kicker">{minutesAsTime(stop.etaMinutes)} · {stop.distanceKm} estimated km from prior stop</span><h3>{visibleName}</h3><p>{client && clientSecondaryName(client) ? `${clientSecondaryName(client)} \u00B7 ` : ""}{stop.locality} · priority P{stop.priority}</p></div>{destination && <a className="icon-button" aria-label={`Open navigation to ${visibleName}`} href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`} target="_blank" rel="noreferrer"><Navigation size={17}/></a>}</div></article>; })}
            <div className="depot-stop return"><span><Truck size={16}/></span><div><strong>Return to {plan.depot.address}</strong><small>Estimated finish · {minutesAsTime(plan.totalMinutes)}</small></div></div>
          </div>
          <p className="route-algorithm-note">{plan.algorithm}. Assumptions: road factor ×{plan.assumptions.roadFactor}, {plan.assumptions.visitMinutes} min per visit, maximum {Math.round(plan.assumptions.maxWorkMinutes / 60)} h. Traffic and customer time windows are not included.</p>
        </>}
      </section>
    </div>);
}
