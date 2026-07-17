import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Clock3, MapPin, Navigation, Route, Sparkles, Truck } from 'lucide-react';
import { distanceKm } from '../../shared/algorithms';
import type { Client, RoutePlan } from '../../shared/models';
import { minutesAsTime, money } from '../lib/format';

const initialRouteIDs = (clients: Client[]) => {
  const ranked = clients
    .filter((client): client is Client & { coordinates: [number, number] } => client.active && client.coordinates !== null)
    .sort((a, b) => b.visitPriority - a.visitPriority);
  const anchor = ranked[0];
  if (!anchor) return [];
  const sameLocality = ranked.filter((client) => client.locality === anchor.locality);
  const nearby = ranked.filter((client) => client.locality !== anchor.locality && distanceKm(anchor.coordinates, client.coordinates) <= 35);
  const ordered = [...sameLocality, ...nearby];
  return ordered.slice(0, 5).map((client) => client.id);
};

export function RoutesView({ clients, initialClientId }: { clients: Client[]; initialClientId: number | null }) {
  const routableClients = useMemo(() => clients.filter((client) => client.active && client.coordinates !== null), [clients]);
  const sellers = useMemo(() => [...new Set(routableClients.map((client) => client.seller))].sort((a, b) => a.localeCompare(b, 'es')), [routableClients]);
  const [seller, setSeller] = useState(() => {
    const requested = clients.find((client) => client.id === initialClientId && client.active && client.coordinates !== null);
    if (requested) return requested.seller;
    return [...routableClients].sort((a, b) => b.visitPriority - a.visitPriority)[0]?.seller || '';
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => {
    const requested = clients.find((client) => client.id === initialClientId && client.active && client.coordinates !== null);
    const activeRoutable = clients.filter((client) => client.active && client.coordinates !== null);
    const initialSeller = requested?.seller || [...activeRoutable].sort((a, b) => b.visitPriority - a.visitPriority)[0]?.seller;
    const pool = initialSeller ? activeRoutable.filter((client) => client.seller === initialSeller) : activeRoutable;
    const selected = new Set(initialRouteIDs(pool));
    if (requested) selected.add(requested.id);
    return selected;
  });
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [visitMinutes, setVisitMinutes] = useState(25);
  const [maxWorkMinutes, setMaxWorkMinutes] = useState(480);
  useEffect(() => {
    if (!initialClientId) return;
    const requested = routableClients.find((client) => client.id === initialClientId);
    if (!requested) return;
    const pool = routableClients.filter((client) => client.seller === requested.seller);
    const selected = new Set(initialRouteIDs(pool));
    selected.add(requested.id);
    setSeller(requested.seller);
    setSelectedIds(selected);
    setPlan(null);
  }, [initialClientId, routableClients]);
  const orderedClients = useMemo(
    () => routableClients.filter((client) => !seller || client.seller === seller).sort((a, b) => b.visitPriority - a.visitPriority),
    [routableClients, seller],
  );
  const selectedSales = clients.filter((client) => selectedIds.has(client.id)).reduce((sum, client) => sum + client.sales90d, 0);

  const changeSeller = (nextSeller: string) => {
    const pool = routableClients.filter((client) => !nextSeller || client.seller === nextSeller);
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
      const response = await fetch('/api/routes/optimize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientIds: [...selectedIds], visitMinutes, maxWorkMinutes }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setPlan(payload);
    } finally { setLoading(false); }
  };

  return (
    <div className="page-view routes-layout">
      <section className="data-card route-picker" data-tour="route-picker">
        <div className="data-card-header"><div><span className="section-kicker"><CalendarDays size={14} /> Planificador</span><h2>Visitas sugeridas</h2></div><div className="route-picker-actions"><label><span>Vendedor</span><select value={seller} onChange={(event) => changeSeller(event.target.value)}><option value="">Todos</option>{sellers.map((name) => <option key={name} value={name}>{name}</option>)}</select></label><span className="count-badge">{selectedIds.size} elegidas</span></div></div>
        <p className="section-description">{orderedClients.length} clientes geolocalizados · P visita combina 58% riesgo de cobranza y 42% oportunidad comercial.</p>
        <div className="route-constraints"><label><span>Duración por visita</span><select value={visitMinutes} onChange={(event) => { setVisitMinutes(Number(event.target.value)); setPlan(null); }}><option value={15}>15 min</option><option value={25}>25 min</option><option value={35}>35 min</option><option value={45}>45 min</option></select></label><label><span>Jornada máxima</span><select value={maxWorkMinutes} onChange={(event) => { setMaxWorkMinutes(Number(event.target.value)); setPlan(null); }}><option value={360}>6 horas</option><option value={420}>7 horas</option><option value={480}>8 horas</option><option value={540}>9 horas</option></select></label></div>
        <div className="route-client-list">
          {orderedClients.map((client) => <button className={`route-client ${selectedIds.has(client.id) ? 'selected' : ''}`} key={client.id} onClick={() => toggle(client.id)}>
            <span className="route-check">{selectedIds.has(client.id) && <Check size={14} />}</span>
            <div><strong>{client.tradeName}</strong><span><MapPin size={12} /> {client.locality} · {client.seller}</span></div>
            <div className="route-priority"><strong>P{client.visitPriority}</strong><span>C{client.collectionRisk} · O{client.commercialOpportunity}</span></div>
          </button>)}
        </div>
        <div className="route-picker-footer"><div><span>Venta 90d seleccionada</span><strong>{money(selectedSales, true)}</strong></div><button className="button primary large" disabled={!selectedIds.size || loading} onClick={optimize}><Sparkles size={17} /> {loading ? 'Optimizando…' : 'Optimizar recorrido'}</button></div>
      </section>
      <section className="route-result">
        {!plan ? <div className="route-empty"><div className="empty-route-icon"><Route size={38} /></div><h2>Armá la jornada del vendedor</h2><p>Elegí clientes del mismo corredor y generá una estimación. Se aplica un factor vial sobre la distancia geográfica, duración por visita y límite de jornada.</p><div className="algorithm-explainer"><Sparkles size={16} /><span><strong>Estimación explicable</strong> · validar caminos y horarios antes de salir</span></div></div> : <>
          <article className="route-overview data-card">
            <div><span className="section-kicker"><Navigation size={14} /> Ruta estimada</span><h2>Jornada de {plan.stops.length} visitas</h2><p>Salida desde Mar del Plata · 09:00 · {plan.feasible ? 'dentro del límite configurado' : 'requiere ajustes'}</p></div>
            <div className="route-totals"><span><Truck size={17} /><strong>{plan.totalKm} km</strong><small>recorrido</small></span><span><Clock3 size={17} /><strong>{Math.floor(plan.totalMinutes / 60)} h {plan.totalMinutes % 60} min</strong><small>con visitas</small></span></div>
          </article>
          {!!plan.warnings.length && <div className="route-warnings">{plan.warnings.map((warning) => <p key={warning}><Clock3 size={15} /> {warning}</p>)}</div>}
          <div className="route-timeline">
            <div className="depot-stop"><span><Truck size={16} /></span><div><strong>Centro de distribución Salice</strong><small>Salida · 09:00</small></div></div>
            {plan.stops.map((stop) => { const client = clients.find((item) => item.id === stop.clientId); const destination = client?.coordinates?.join(','); return <article key={stop.clientId} className="timeline-stop"><div className="stop-number">{stop.order}</div><div className="stop-card"><div><span className="section-kicker">{minutesAsTime(stop.etaMinutes)} · {stop.distanceKm} km estimados desde la parada anterior</span><h3>{stop.clientName}</h3><p>{stop.locality} · prioridad P{stop.priority}</p></div>{destination && <a className="icon-button" aria-label={`Abrir navegación a ${stop.clientName}`} href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`} target="_blank" rel="noreferrer"><Navigation size={17} /></a>}</div></article>; })}
            <div className="depot-stop return"><span><Truck size={16} /></span><div><strong>Regreso al centro</strong><small>Fin estimado · {minutesAsTime(plan.totalMinutes)}</small></div></div>
          </div>
          <p className="route-algorithm-note">{plan.algorithm}. Supuestos: factor vial ×{plan.assumptions.roadFactor}, {plan.assumptions.visitMinutes} min por visita y máximo {Math.round(plan.assumptions.maxWorkMinutes / 60)} h. No incluye tránsito ni ventanas del cliente.</p>
        </>}
      </section>
    </div>
  );
}
