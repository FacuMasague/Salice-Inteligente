import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowUp, CalendarDays, Check, ChevronDown, ChevronRight, ChevronUp,
  Clock3, FileText, MapPin, Navigation, Route, Search, Sparkles, Truck,
} from 'lucide-react';
import { groupDeliveryInvoices } from '../../shared/algorithms';
import type { Client, DeliveryAssignmentStatus, LogisticsSnapshot, RoutePlan } from '../../shared/models';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SingleSelectFilter } from '../components/SingleSelectFilter';
import { DELIVERY_ASSIGNMENT_LABELS, deliveryAssignmentText, summarizeReliableInvoiceKilos } from '../lib/delivery-status';
import { compactDate, minutesAsTime, money, number } from '../lib/format';
import { clientPrimaryName } from '../lib/client-name';
import { DeliverySheetMap, type DeliveryMapPoint } from '../components/DeliverySheetMap';

const statusOptions = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'unassigned', label: 'Sin asignar' },
  { value: 'open_sheet', label: 'Foja abierta' },
  { value: 'closed_sheet', label: 'Foja cerrada' },
  { value: 'unknown', label: 'Sin confirmar' },
];

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export function RoutesView({
  clients,
  logistics,
  initialClientId,
  onOpenClient,
  onOpenInvoice,
}: {
  clients: Client[];
  logistics: LogisticsSnapshot;
  initialClientId: number | null;
  onOpenClient: (client: Client) => void;
  onOpenInvoice: (invoiceId: string) => void;
}) {
  const clientById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const coverageFrom = logistics.coverageFrom.slice(0, 10);
  const coverageThrough = logistics.coverageThrough.slice(0, 10);
  const defaultFrom = addDays(coverageThrough, -7);
  const [from, setFrom] = useState(defaultFrom < coverageFrom ? coverageFrom : defaultFrom);
  const [through, setThrough] = useState(coverageThrough);
  const [status, setStatus] = useState('all');
  const [locality, setLocality] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'planner' | 'sheets'>('planner');
  const [driver, setDriver] = useState('');
  const [zone, setZone] = useState('');
  const [sheetNumber, setSheetNumber] = useState('');
  const [selectedSheetId, setSelectedSheetId] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [manualOrder, setManualOrder] = useState<number[]>([]);
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [stopMinutes, setStopMinutes] = useState(15);
  const [maxWorkMinutes, setMaxWorkMinutes] = useState(480);
  const [expandedClients, setExpandedClients] = useState<Set<number>>(new Set());

  const localities = useMemo(() => [...new Set(logistics.invoices.map((invoice) => invoice.locality).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es')), [logistics.invoices]);
  const sheetById = useMemo(() => new Map(logistics.sheets.map((sheet) => [sheet.id, sheet])), [logistics.sheets]);
  const drivers = useMemo(() => [...new Set(logistics.sheets.map((sheet) => sheet.driver).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [logistics.sheets]);
  const zones = useMemo(() => [...new Set(logistics.sheets.flatMap((sheet) => [sheet.zone, sheet.subzone]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [logistics.sheets]);
  const sheetNumbers = useMemo(() => logistics.sheets.map((sheet) => String(sheet.id)).sort((a, b) => Number(b) - Number(a)), [logistics.sheets]);
  const filteredInvoices = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es');
    return logistics.invoices.filter((invoice) => {
      const client = clientById.get(invoice.clientId);
      return invoice.issuedAt >= from
        && invoice.issuedAt <= through
        && (status === 'all' || invoice.assignmentStatus === status)
        && (!locality || locality.split('|').includes(invoice.locality))
        && (!driver || (invoice.sheet?.driver && driver.split('|').includes(invoice.sheet.driver)))
        && (!zone || (invoice.sheet && [sheetById.get(invoice.sheet.id)?.zone, sheetById.get(invoice.sheet.id)?.subzone].some((value) => value && zone.split('|').includes(value))))
        && (!sheetNumber || (invoice.sheet && sheetNumber.split('|').includes(String(invoice.sheet.id))))
        && (!normalizedQuery || `${invoice.number} ${invoice.deliveryAddress} ${invoice.locality} ${client?.name ?? ''} ${client?.tradeName ?? ''}`
          .toLocaleLowerCase('es').includes(normalizedQuery));
    });
  }, [clientById, driver, from, locality, logistics.invoices, query, sheetById, sheetNumber, status, through, zone]);
  const stops = useMemo(() => groupDeliveryInvoices(filteredInvoices, clients), [clients, filteredInvoices]);
  const stopByClient = useMemo(() => new Map(stops.map((stop) => [stop.clientId, stop])), [stops]);
  const selectedStops = manualOrder.map((id) => stopByClient.get(id)).filter((stop): stop is NonNullable<typeof stop> => Boolean(stop));
  const selectedInvoices = selectedStops.flatMap((stop) => stop.invoices);
  const visibleSheetIds = useMemo(() => new Set(filteredInvoices.flatMap((invoice) => invoice.sheet ? [invoice.sheet.id] : [])), [filteredInvoices]);
  const visibleSheets = useMemo(() => logistics.sheets.filter((sheet) => visibleSheetIds.has(sheet.id)), [logistics.sheets, visibleSheetIds]);
  const mapInvoices = useMemo(() => selectedSheetId === 'all'
    ? filteredInvoices
    : selectedSheetId === 'unassigned'
      ? filteredInvoices.filter((invoice) => !invoice.sheet)
      : filteredInvoices.filter((invoice) => invoice.sheet?.id === Number(selectedSheetId)), [filteredInvoices, selectedSheetId]);
  const mapPoints = useMemo(() => {
    const grouped = new Map<number, DeliveryMapPoint>();
    for (const invoice of mapInvoices) {
      const client = clientById.get(invoice.clientId);
      if (!client?.coordinates) continue;
      const current = grouped.get(client.id);
      if (current) current.invoices.push(invoice);
      else grouped.set(client.id, { client, invoices: [invoice], status: invoice.assignmentStatus });
    }
    return [...grouped.values()];
  }, [clientById, mapInvoices]);
  const unmappedInvoices = useMemo(() => mapInvoices.filter((invoice) => !clientById.get(invoice.clientId)?.coordinates), [clientById, mapInvoices]);
  const reliableKiloSummary = useMemo(() => summarizeReliableInvoiceKilos(mapInvoices), [mapInvoices]);
  const selectedSheet = selectedSheetId !== 'all' && selectedSheetId !== 'unassigned' ? sheetById.get(Number(selectedSheetId)) : null;

  useEffect(() => {
    setSelectedIds((current) => new Set([...current].filter((id) => stopByClient.has(id))));
    setManualOrder((current) => current.filter((id) => stopByClient.has(id)));
    setPlan(null);
  }, [stopByClient]);

  useEffect(() => {
    if (!initialClientId) return;
    const target = stops.find((stop) => stop.clientId === initialClientId && stop.coordinates);
    if (!target) return;
    setSelectedIds(new Set([target.clientId]));
    setManualOrder([target.clientId]);
    setExpandedClients(new Set([target.clientId]));
    setPlan(null);
  }, [initialClientId, stops]);

  const toggle = (clientId: number) => {
    const stop = stopByClient.get(clientId);
    if (!stop?.coordinates) return;
    setPlan(null);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(clientId)) {
        next.delete(clientId);
        setManualOrder((order) => order.filter((id) => id !== clientId));
      } else {
        next.add(clientId);
        setManualOrder((order) => [...order, clientId]);
      }
      return next;
    });
  };

  const move = (clientId: number, direction: -1 | 1) => {
    setPlan(null);
    setManualOrder((current) => {
      const index = current.indexOf(clientId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const estimate = async (mode: 'manual' | 'suggested') => {
    setLoading(true);
    setRouteError('');
    try {
      const response = await fetch('/api/routes/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientIds: manualOrder,
          invoiceIds: selectedInvoices.map((invoice) => invoice.id),
          stopMinutes,
          maxWorkMinutes,
          mode,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo calcular el recorrido.');
      setPlan(payload);
      if (mode === 'suggested') setManualOrder(payload.stops.map((stop: RoutePlan['stops'][number]) => stop.clientId));
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : 'No se pudo calcular el recorrido.');
    } finally {
      setLoading(false);
    }
  };

  const counts = Object.fromEntries((['unassigned', 'open_sheet', 'closed_sheet', 'unknown'] as DeliveryAssignmentStatus[])
    .map((key) => [key, filteredInvoices.filter((invoice) => invoice.assignmentStatus === key).length])) as Record<DeliveryAssignmentStatus, number>;

  return (
    <div className="page-view delivery-routes-page">
      <section className="data-card delivery-route-header" data-tour="route-picker">
        <div>
          <span className="section-kicker"><Truck size={15} /> Repartos desde GESI · sólo lectura</span>
          <h2>Facturas y fojas de reparto</h2>
          <p>Una foja cerrada confirma el cierre de la carga en GESI; no demuestra que el cliente haya recibido la mercadería.</p>
          <div className="delivery-mode-switch"><button className={mode === 'planner' ? 'active' : ''} onClick={() => setMode('planner')}><Route size={14} /> Planificador</button><button className={mode === 'sheets' ? 'active' : ''} onClick={() => setMode('sheets')}><MapPin size={14} /> Mapa de fojas</button></div>
        </div>
        <div className="delivery-coverage"><span>Cobertura</span><strong>{compactDate(coverageFrom)}–{compactDate(coverageThrough)}</strong><small>{number(logistics.sheets.length)} fojas leídas</small></div>
      </section>

      <section className="delivery-route-kpis">
        <article><FileText size={18} /><div><span>Facturas visibles</span><strong>{number(filteredInvoices.length)}</strong></div></article>
        <article className="unassigned"><AlertTriangle size={18} /><div><span>Sin asignar</span><strong>{number(counts.unassigned)}</strong></div></article>
        <article className="open"><Truck size={18} /><div><span>En foja abierta</span><strong>{number(counts.open_sheet)}</strong></div></article>
        <article className="closed"><Check size={18} /><div><span>En foja cerrada</span><strong>{number(counts.closed_sheet)}</strong></div></article>
      </section>

      <section className="data-card delivery-route-filters">
        <label><span>FACTURADA DESDE</span><input type="date" min={coverageFrom} max={through} value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label><span>HASTA</span><input type="date" min={from} max={coverageThrough} value={through} onChange={(event) => setThrough(event.target.value)} /></label>
        <SingleSelectFilter label="Estado de reparto" value={status} options={statusOptions} onChange={setStatus} />
        <MultiSelectFilter label="Localidad" value={locality} options={localities} onChange={setLocality} />
        {mode === 'sheets' && <MultiSelectFilter label="Chofer" value={driver} options={drivers} onChange={setDriver} />}
        {mode === 'sheets' && <MultiSelectFilter label="Zona" value={zone} options={zones} onChange={setZone} />}
        {mode === 'sheets' && <MultiSelectFilter label="Número de foja" value={sheetNumber} options={sheetNumbers} onChange={setSheetNumber} />}
        <label className="delivery-route-search"><span>BUSCAR</span><div><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cliente, factura o domicilio" /></div></label>
      </section>

      {mode === 'sheets' ? <div className="delivery-sheet-workspace">
        <aside className="data-card delivery-sheet-directory">
          <header><div><span className="section-kicker"><FileText size={14} /> Fojas visibles</span><h2>Seleccionar carga</h2><p>La posición de cada cliente no representa el orden real del reparto.</p></div></header>
          <button className={selectedSheetId === 'all' ? 'active' : ''} onClick={() => setSelectedSheetId('all')}><span><strong>Todas las facturas filtradas</strong><small>{filteredInvoices.length} comprobantes</small></span><ChevronRight size={15} /></button>
          {filteredInvoices.some((invoice) => !invoice.sheet) && <button className={selectedSheetId === 'unassigned' ? 'active' : ''} onClick={() => setSelectedSheetId('unassigned')}><span><strong>Sin foja asignada</strong><small>{filteredInvoices.filter((invoice) => !invoice.sheet).length} comprobantes</small></span><em className="unassigned">Sin asignar</em><ChevronRight size={15} /></button>}
          {visibleSheets.map((sheet) => {
            const invoiceCount = filteredInvoices.filter((invoice) => invoice.sheet?.id === sheet.id).length;
            return <button key={sheet.id} className={selectedSheetId === String(sheet.id) ? 'active' : ''} onClick={() => setSelectedSheetId(String(sheet.id))}><span><strong>Foja {sheet.id}</strong><small>{sheet.driver || 'Sin chofer'} · {sheet.zone || 'Sin zona'} · {invoiceCount} comprobantes</small></span><em className={sheet.status === 'closed' ? 'closed_sheet' : 'open_sheet'}>{sheet.status === 'closed' ? 'Cerrada' : 'Abierta'}</em><ChevronRight size={15} /></button>;
          })}
          {!visibleSheets.length && !filteredInvoices.some((invoice) => !invoice.sheet) && <div className="delivery-route-empty"><Search size={22} /><span>No hay fojas para los filtros elegidos.</span></div>}
        </aside>
        <section className="delivery-sheet-main">
          <article className="data-card delivery-sheet-map-card">
            <header><div><span className="section-kicker"><MapPin size={14} /> Mapa de fojas</span><h2>{selectedSheet ? `Foja ${selectedSheet.id}` : selectedSheetId === 'unassigned' ? 'Facturas sin asignar' : 'Distribución visible'}</h2><p>Abiertas en azul, cerradas en verde y sin asignar en naranja. Los puntos corregidos son aproximados.</p></div><div className="delivery-map-legend"><span className="open_sheet">Abierta</span><span className="closed_sheet">Cerrada</span><span className="unassigned">Sin asignar</span></div></header>
            <DeliverySheetMap points={mapPoints} onOpenClient={onOpenClient} />
          </article>
          <article className="data-card delivery-sheet-detail">
            <header><div><span className="section-kicker"><Truck size={14} /> Comprobantes de la selección</span><h2>{number(mapInvoices.length)} facturas · {money(mapInvoices.reduce((sum, invoice) => sum + invoice.amount, 0), true)}</h2><p>{reliableKiloSummary.reliableInvoiceCount ? `${number(reliableKiloSummary.kilos, 2)} kg estimados en ${number(reliableKiloSummary.reliableInvoiceCount)} de ${number(reliableKiloSummary.totalInvoiceCount)} facturas` : 'Kilos sin conversión disponible'}{selectedSheet ? ` · ${selectedSheet.driver || 'sin chofer'} · ${selectedSheet.zone || 'sin zona'}` : ''}</p></div></header>
            {mapInvoices.some((invoice) => invoice.kiloDataStatus === 'unavailable') && <p className="delivery-data-warning"><AlertTriangle size={13} /> Hay comprobantes con productos sin conversión a kilos; el monto continúa disponible.</p>}
            <div className="delivery-sheet-invoices">{mapInvoices.map((invoice) => {
              const client = clientById.get(invoice.clientId);
              return <article key={invoice.id}><button className="entity-link" disabled={!client} onClick={() => client && onOpenClient(client)}><strong>{client ? clientPrimaryName(client) : `Cliente ${invoice.clientId}`}</strong><small>{invoice.locality} · {client?.locationStatus === 'corrected' ? 'ubicación aproximada' : client?.coordinates ? 'ubicación disponible' : 'sin ubicación'}</small></button><button className="entity-link" onClick={() => onOpenInvoice(invoice.id)}><strong>{invoice.number}</strong><small>{compactDate(invoice.issuedAt)}</small></button><span><strong>{money(invoice.amount, true)}</strong><small>{invoice.kiloDataStatus !== 'unavailable' ? `${number(invoice.kilos ?? 0, 2)} kg estimados` : 'sin conversión a kg'}</small></span></article>;
            })}</div>
            {!!unmappedInvoices.length && <details className="delivery-unmapped-list"><summary><AlertTriangle size={14} /> {unmappedInvoices.length} comprobantes sin punto en el mapa</summary><div>{unmappedInvoices.map((invoice) => { const client = clientById.get(invoice.clientId); return <button key={invoice.id} onClick={() => client && onOpenClient(client)} disabled={!client}><strong>{client ? clientPrimaryName(client) : `Cliente ${invoice.clientId}`}</strong><span>{invoice.number} · {invoice.locality || 'Sin localidad'}</span></button>; })}</div></details>}
          </article>
        </section>
      </div> : <div className="delivery-route-workspace">
        <section className="data-card delivery-stop-picker">
          <header><div><span className="section-kicker"><MapPin size={14} /> Paradas agrupadas</span><h2>Clientes a incluir</h2><p>Varias facturas del mismo cliente forman una sola parada.</p></div><span className="count-badge">{selectedIds.size} elegidas</span></header>
          <div className="delivery-stop-list">
            {stops.map((stop) => {
              const client = clientById.get(stop.clientId);
              const selected = selectedIds.has(stop.clientId);
              const expanded = expandedClients.has(stop.clientId);
              const approximateLocation = client?.locationPrecision === 'locality';
              const missingRouteData = !stop.coordinates;
              return <article className={`delivery-stop-row ${selected ? 'selected' : ''} ${missingRouteData ? 'unroutable' : ''}`} key={stop.clientId}>
                <button className="route-check-button" disabled={missingRouteData} onClick={() => toggle(stop.clientId)} aria-label={`${selected ? 'Quitar' : 'Agregar'} parada`}>
                  <span className="route-check">{selected && <Check size={14} />}</span>
                </button>
                <div className="delivery-stop-main">
                  <button className="delivery-client-link" disabled={!client} onClick={() => client && onOpenClient(client)}><strong>{client ? clientPrimaryName(client) : stop.clientName}</strong></button>
                  <span><MapPin size={12} /> {stop.address} · {stop.locality}</span>
                  {missingRouteData && <small className="delivery-data-warning"><AlertTriangle size={12} /> {approximateLocation ? 'Ubicación aproximada de la localidad: requiere verificación antes de usarla en una ruta.' : 'Dirección sin coordenadas: visible, pero no se puede estimar la ruta.'}</small>}
                  <div className="delivery-stop-statuses">{[...new Set(stop.invoices.map((invoice) => invoice.assignmentStatus))].map((value) => <em className={value} key={value}>{DELIVERY_ASSIGNMENT_LABELS[value]}</em>)}</div>
                </div>
                <div className="delivery-stop-summary"><strong>{stop.invoices.length} {stop.invoices.length === 1 ? 'factura' : 'facturas'}</strong><span>{money(stop.amount, true)}</span><button className="icon-button" onClick={() => setExpandedClients((current) => { const next = new Set(current); next.has(stop.clientId) ? next.delete(stop.clientId) : next.add(stop.clientId); return next; })} aria-label="Ver facturas">{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button></div>
                {expanded && <div className="delivery-invoice-list">{stop.invoices.map((invoice) => <button key={invoice.id} onClick={() => onOpenInvoice(invoice.id)}>
                  <span><strong>{invoice.number}</strong><small>Facturada {compactDate(invoice.issuedAt)} · envío sugerido {compactDate(invoice.suggestedDeliveryAt)}</small></span>
                  <span><em className={invoice.assignmentStatus}>{deliveryAssignmentText(invoice.assignmentStatus, invoice.sheet?.id)}</em>{invoice.sheet?.driver && <small>{invoice.sheet.driver}</small>}</span>
                  <strong>{money(invoice.amount, true)}</strong>
                </button>)}</div>}
              </article>;
            })}
            {!stops.length && <div className="delivery-route-empty"><Search size={22} /><span>No hay facturas que coincidan con los filtros elegidos.</span></div>}
          </div>
        </section>

        <section className="delivery-route-planner">
          <div className="data-card delivery-order-card">
            <header><div><span className="section-kicker"><Route size={14} /> Orden del reparto</span><h2>Secuencia de paradas</h2><p>Podés ordenar manualmente o pedir una secuencia estimada.</p></div></header>
            <div className="delivery-order-list">{selectedStops.map((stop, index) => <article key={stop.clientId}><span>{index + 1}</span><div><strong>{stop.clientName}</strong><small>{stop.invoices.length} factura(s) · {stop.locality}</small></div><button disabled={index === 0} onClick={() => move(stop.clientId, -1)} aria-label="Subir parada"><ArrowUp size={14} /></button><button disabled={index === selectedStops.length - 1} onClick={() => move(stop.clientId, 1)} aria-label="Bajar parada"><ArrowDown size={14} /></button></article>)}</div>
            {!selectedStops.length && <div className="delivery-order-empty">Elegí clientes con coordenadas para armar el recorrido.</div>}
            <div className="delivery-route-constraints"><SingleSelectFilter label="Tiempo por parada" value={stopMinutes} options={[{ value: 10, label: '10 min' }, { value: 15, label: '15 min' }, { value: 20, label: '20 min' }, { value: 30, label: '30 min' }]} onChange={(value) => { setStopMinutes(Number(value)); setPlan(null); }} /><SingleSelectFilter label="Jornada máxima" value={maxWorkMinutes} options={[{ value: 360, label: '6 horas' }, { value: 420, label: '7 horas' }, { value: 480, label: '8 horas' }, { value: 540, label: '9 horas' }]} onChange={(value) => { setMaxWorkMinutes(Number(value)); setPlan(null); }} /></div>
            {routeError && <p className="form-error">{routeError}</p>}
            <div className="delivery-route-actions"><button className="button ghost" disabled={!selectedStops.length || loading} onClick={() => estimate('manual')}><Route size={16} /> Estimar en este orden</button><button className="button primary" disabled={!selectedStops.length || loading} onClick={() => estimate('suggested')}><Sparkles size={16} /> {loading ? 'Calculando…' : 'Sugerir secuencia'}</button></div>
          </div>

          {!plan ? <div className="data-card route-empty delivery-plan-empty"><Route size={34} /><h2>Recorrido todavía sin estimar</h2><p>La fecha “envío sugerido” aplica la generalización de oficina: día siguiente y, para facturas del viernes, lunes. No es un compromiso ni una confirmación de entrega.</p></div> : <div className="delivery-route-result">
            <article className="data-card route-overview"><div><span className="section-kicker"><Navigation size={14} /> Recorrido estimado</span><h2>{plan.stops.length} paradas · {selectedInvoices.length} facturas</h2><p>Salida y regreso a {plan.depot.address}. No representa el recorrido realmente realizado.</p></div><div className="route-totals"><span><Truck size={17} /><strong>{plan.totalKm} km</strong><small>estimados</small></span><span><Clock3 size={17} /><strong>{Math.floor(plan.totalMinutes / 60)} h {plan.totalMinutes % 60} min</strong><small>con paradas</small></span></div></article>
            {!!plan.warnings.length && <div className="route-warnings">{plan.warnings.map((warning) => <p key={warning}><AlertTriangle size={15} /> {warning}</p>)}</div>}
            <div className="route-timeline">
              <div className="depot-stop"><span><Truck size={16} /></span><div><strong>{plan.depot.name}</strong><small>{plan.depot.address} · salida 09:00</small></div></div>
              {plan.stops.map((stop) => {
                const client = clientById.get(stop.clientId);
                const destination = client?.locationPrecision === 'locality' ? null : client?.coordinates?.join(',');
                return <article key={stop.clientId} className="timeline-stop"><div className="stop-number">{stop.order}</div><div className="stop-card"><div><span className="section-kicker">{minutesAsTime(stop.etaMinutes)} · {stop.distanceKm} km desde la parada anterior</span><h3>{stop.clientName}</h3><p>{stop.address} · {stop.locality} · {stop.invoiceCount} factura(s) · {money(stop.amount, true)}</p></div>{destination && <a className="icon-button" aria-label={`Abrir navegación a ${stop.clientName}`} href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`} target="_blank" rel="noreferrer"><Navigation size={17} /></a>}</div></article>;
              })}
              <div className="depot-stop return"><span><Truck size={16} /></span><div><strong>Regreso al depósito</strong><small>Fin estimado · {minutesAsTime(plan.totalMinutes)}</small></div></div>
            </div>
            <p className="route-algorithm-note">{plan.algorithm}. Supuestos: factor vial ×{plan.assumptions.roadFactor}, {plan.assumptions.stopMinutes} min por parada y máximo {Math.round(plan.assumptions.maxWorkMinutes / 60)} h. No incluye tránsito, capacidad, ventanas horarias ni prueba de entrega.</p>
          </div>}
        </section>
      </div>}
    </div>
  );
}
