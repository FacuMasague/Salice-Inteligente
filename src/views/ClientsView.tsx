import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, ChevronRight, EyeOff, Search, Users } from 'lucide-react';
import { isCommercialOpportunityEligible } from '../../shared/commercial-opportunities';
import type { Client, ClientTrendDirection, ClientTrendReview, Product } from '../../shared/models';
import { decodeMultiFilter, matchesMultiFilter } from '../../shared/multi-filter';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { SingleSelectFilter } from '../components/SingleSelectFilter';
import { SortButton } from '../components/SortButton';
import { clientInitials, clientPrimaryName, clientSecondaryName } from '../lib/client-name';
import { clientKilos90d, productContentById } from '../lib/commercial-metrics';
import { creditTermLabel, money, number, paymentDelay, shortDate, zoneLabel } from '../lib/format';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';

type ClientSortKey = 'client' | 'zone' | 'sales' | 'priority' | 'term' | 'visit';

export function ClientsView({ clients, products, query, onQuery, onOpen, onOpenSeller }: { clients: Client[]; products: Product[]; query: string; onQuery: (value: string) => void; onOpen: (client: Client) => void; onOpenSeller: (seller: string) => void }) {
  const pageSize = 50;
  const [page, setPage] = useState(1);
  const [commercialStatus, setCommercialStatus] = useState('');
  const [portfolio, setPortfolio] = useState('');
  const [seller, setSeller] = useState('');
  const [risk, setRisk] = useState('');
  const [trend, setTrend] = useState('');
  const [locationStatus, setLocationStatus] = useState('');
  const [sort, setSort] = useState<'priority' | 'risk' | 'opportunity' | 'sales' | 'growth' | 'decline'>('priority');
  const [tableSort, setTableSort] = useState(emptySort<ClientSortKey>());
  const [reviewedTrends, setReviewedTrends] = useState<Set<string>>(new Set());
  const [reviewPending, setReviewPending] = useState<number | null>(null);
  const [reviewError, setReviewError] = useState('');
  useEffect(() => {
    fetch('/api/client-trend-reviews')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('No se pudieron cargar las revisiones.')))
      .then((payload: { reviews: ClientTrendReview[] }) => setReviewedTrends(new Set(payload.reviews.map((review) => `${review.direction}:${review.clientId}`))))
      .catch(() => setReviewError('No se pudo recuperar qué clientes ya fueron revisados.'));
  }, []);
  const trendMode: ClientTrendDirection | null = sort === 'growth' || sort === 'decline' ? sort : null;
  const reviewed = (clientId: number, direction = trendMode) => Boolean(direction && reviewedTrends.has(`${direction}:${clientId}`));
  const activeCount = clients.filter((client) => client.active).length;
  const inactiveCount = clients.length - activeCount;
  const sellers = useMemo(() => [...new Set(clients.filter((client) => client.active).map((client) => client.seller))].sort((a, b) => a.localeCompare(b, 'es')), [clients]);
  const contentByProduct = useMemo(() => productContentById(products), [products]);
  const baseFiltered = clients
    .filter((client) => matchesMultiFilter(client.active ? 'active' : 'inactive', commercialStatus))
    .filter((client) => matchesMultiFilter(client.portfolioStatus, portfolio))
    .filter((client) => matchesMultiFilter(client.seller, seller))
    .filter((client) => matchesMultiFilter(client.collectionRisk >= 55 ? 'high' : client.collectionRisk >= 25 ? 'attention' : 'low', risk))
    .filter((client) => matchesMultiFilter(client.salesDelta >= 30 ? 'growth' : client.salesDelta <= -30 ? 'decline' : 'stable', trend))
    .filter((client) => matchesMultiFilter(client.locationStatus ?? 'original', locationStatus))
    .filter((client) => trendMode === 'growth' ? client.salesDelta >= 30 : trendMode === 'decline' ? client.salesDelta <= -30 : true)
    .filter((client) => `${client.tradeName} ${client.name} ${client.reference} ${client.locality} ${client.zone} ${client.seller}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => trendMode && reviewed(a.id) !== reviewed(b.id) ? Number(reviewed(a.id)) - Number(reviewed(b.id))
      : sort === 'growth' ? b.salesDelta - a.salesDelta
      : sort === 'decline' ? a.salesDelta - b.salesDelta
        : sort === 'risk' ? b.collectionRisk - a.collectionRisk
      : sort === 'opportunity' ? Number(isCommercialOpportunityEligible(b)) - Number(isCommercialOpportunityEligible(a))
        || b.commercialOpportunity - a.commercialOpportunity
        : sort === 'sales' ? b.sales90d - a.sales90d
          : b.visitPriority - a.visitPriority);
  const tableSorted = sortItems(baseFiltered, tableSort, (client, key) => {
    if (key === 'client') return clientPrimaryName(client);
    if (key === 'zone') return `${client.zone} ${client.seller}`;
    if (key === 'sales') return client.sales90d;
    if (key === 'priority') return client.visitPriority;
    if (key === 'term') return client.creditDays;
    return client.nextVisitAt;
  });
  const filtered = trendMode
    ? tableSorted.sort((left, right) => Number(reviewed(left.id)) - Number(reviewed(right.id)))
    : tableSorted;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const direction = (key: ClientSortKey) => tableSort.key === key ? tableSort.direction : null;
  const ariaSort = (key: ClientSortKey): 'ascending' | 'descending' | 'none' => direction(key) === 'asc' ? 'ascending' : direction(key) === 'desc' ? 'descending' : 'none';
  const changeTableSort = (key: ClientSortKey) => { setTableSort((current) => cycleSort(current, key)); setPage(1); };
  const savedFilters = { query, commercialStatus, portfolio, seller, risk, trend, locationStatus, sort };
  const applySaved = (saved: Record<string, string>) => {
    onQuery(saved.query ?? '');
    setCommercialStatus(saved.commercialStatus ?? '');
    setPortfolio(saved.portfolio ?? '');
    setSeller(saved.seller ?? '');
    setRisk(saved.risk ?? '');
    setTrend(saved.trend ?? '');
    setLocationStatus(saved.locationStatus ?? '');
    setSort((saved.sort as typeof sort) || 'priority');
    setPage(1);
  };
  const toggleReviewed = async (clientId: number) => {
    if (!trendMode || reviewPending != null) return;
    const key = `${trendMode}:${clientId}`;
    const nextReviewed = !reviewedTrends.has(key);
    setReviewError(''); setReviewPending(clientId);
    setReviewedTrends((current) => { const next = new Set(current); if (nextReviewed) next.add(key); else next.delete(key); return next; });
    try {
      const response = await fetch(`/api/client-trend-reviews/${clientId}/${trendMode}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewed: nextReviewed }),
      });
      if (!response.ok) throw new Error('No se pudo guardar la revisión.');
    } catch {
      setReviewedTrends((current) => { const next = new Set(current); if (nextReviewed) next.delete(key); else next.add(key); return next; });
      setReviewError('No se pudo guardar la revisión del cliente.');
    } finally { setReviewPending(null); }
  };
  return (
    <div className="page-view clients-page">
      <div className="page-tools clients-page-tools">
        <label className="large-search"><Search size={18} /><input value={query} onChange={(event) => { onQuery(event.target.value); setPage(1); }} placeholder="Buscar cliente, localidad, zona o vendedor…" /></label>
        <div className="client-filter-bar">
          <MultiSelectFilter label="Estado comercial" value={commercialStatus} options={[{ value: 'active', label: `Activos (${activeCount})` }, { value: 'inactive', label: `Inactivos (${inactiveCount})` }]} onChange={(value) => { setCommercialStatus(value); setPage(1); }} />
          <MultiSelectFilter label="Cartera Salice" value={portfolio} options={[{ value: 'confirmed', label: 'Sucursal confirmada' }, { value: 'review', label: 'Revisar pertenencia' }]} onChange={(value) => { setPortfolio(value); setPage(1); }} />
          <MultiSelectFilter label="Vendedor" value={seller} options={sellers} onChange={(value) => { setSeller(value); setPage(1); }} />
          <MultiSelectFilter label="Riesgo" value={risk} options={[{ value: 'high', label: 'Alto · 55+' }, { value: 'attention', label: 'Atención · 25–54' }, { value: 'low', label: 'Bajo · 0–24' }]} onChange={(value) => { setRisk(value); setPage(1); }} />
          <MultiSelectFilter label="Evolución" value={trend} options={[{ value: 'growth', label: 'Aumentó 30%+' }, { value: 'decline', label: 'Cayó 30%+' }, { value: 'stable', label: 'Estable · menos de 30%' }]} onChange={(value) => { setTrend(value); setPage(1); }} />
          <MultiSelectFilter label="Ubicación" value={locationStatus} options={[{ value: 'original', label: 'Original del sistema' }, { value: 'corrected', label: 'Corregida automáticamente' }, { value: 'review', label: 'Pendiente de revisión' }]} onChange={(value) => { setLocationStatus(value); setPage(1); }} />
          <SingleSelectFilter label="Orden" value={sort} options={[{ value: 'priority', label: 'Prioridad de visita' }, { value: 'risk', label: 'Riesgo de cobranza' }, { value: 'opportunity', label: 'Oportunidad comercial' }, { value: 'sales', label: 'Ventas 90 días' }, { value: 'growth', label: 'Mayor crecimiento · 30%+' }, { value: 'decline', label: 'Mayor caída · 30%+' }]} onChange={(value) => { setSort(value as typeof sort); setTableSort(emptySort<ClientSortKey>()); setPage(1); }} />
        </div>
        <SavedViewsBar viewKey="clients" filters={savedFilters} onApply={applySaved} />
      </div>
      <section className="data-card" data-tour="clients-directory">
        <div className="data-card-header"><div><span className="section-kicker">{decodeMultiFilter(commercialStatus).length === 1 && decodeMultiFilter(commercialStatus)[0] === 'inactive' ? <EyeOff size={14} /> : <Users size={14} />} Cartera comercial</span><h2>{trendMode === 'growth' ? 'Clientes con crecimiento de 30% o más' : trendMode === 'decline' ? 'Clientes con caída de 30% o más' : decodeMultiFilter(commercialStatus).length === 1 && decodeMultiFilter(commercialStatus)[0] === 'active' ? 'Clientes activos' : decodeMultiFilter(commercialStatus).length === 1 && decodeMultiFilter(commercialStatus)[0] === 'inactive' ? 'Histórico de clientes inactivos' : 'Universo completo de clientes'}</h2><p>{trendMode ? 'Los pendientes de revisar aparecen primero; el tilde mueve el cliente al final de esta lista.' : 'Riesgo de cobranza y oportunidad comercial se calculan por separado.'}</p>{reviewError && <small className="form-error">{reviewError}</small>}</div><span className="count-badge">{number(filtered.length)} resultados</span></div>
        <div className="table-wrap">
          <table className="data-table clients-data-table">
            <thead><tr><th aria-sort={ariaSort('client')}><SortButton label="Cliente" direction={direction('client')} onClick={() => changeTableSort('client')} /></th><th aria-sort={ariaSort('zone')}><SortButton label="Zona y vendedor" direction={direction('zone')} onClick={() => changeTableSort('zone')} /></th><th aria-sort={ariaSort('sales')}><SortButton label="Facturación / kilos · 90d" direction={direction('sales')} onClick={() => changeTableSort('sales')} /></th><th aria-sort={ariaSort('priority')}><SortButton label="Prioridad" direction={direction('priority')} onClick={() => changeTableSort('priority')} /></th><th className="clients-compact-hide" aria-sort={ariaSort('term')}><SortButton label="Plazo / pago" direction={direction('term')} onClick={() => changeTableSort('term')} /></th><th className="clients-compact-hide" aria-sort={ariaSort('visit')}><SortButton label="Revisión sugerida" direction={direction('visit')} onClick={() => changeTableSort('visit')} /></th><th>{trendMode ? 'Revisado' : ''}</th></tr></thead>
            <tbody>
              {visible.map((client) => {
                const kiloMetric = clientKilos90d(client, contentByProduct);
                return (
                <tr key={client.id} className={`${client.active ? '' : 'inactive-client-row'} ${trendMode && reviewed(client.id) ? 'trend-reviewed-row' : ''}`} onClick={() => onOpen(client)}>
                  <td><div className="table-client client-legal-identity"><div className="mini-avatar">{clientInitials(client)}</div><div><strong>{clientPrimaryName(client)}</strong>{clientSecondaryName(client) && <span className="client-trade-name">{clientSecondaryName(client)}</span>}<span>{client.locality} · {client.segment}{client.locationStatus === 'corrected' ? ' · Ubicación corregida' : client.locationStatus === 'review' ? ' · Ubicación a revisar' : ''}</span></div></div></td>
                  <td><strong className="normal-weight">{zoneLabel(client.zone, client.locality)}</strong><button className="entity-link cell-sub" onClick={(event) => { event.stopPropagation(); onOpenSeller(client.seller); }}>{client.seller}</button></td>
                  <td><strong>{money(client.sales90d, true)}</strong><span className="cell-sub" title={kiloMetric.complete ? 'Conversión según presentación de producto' : 'Conversión parcial: hay compras sin presentación convertible'}>{number(kiloMetric.kilos, 2)} kg{kiloMetric.complete ? '' : ' · parcial'}</span><span title="Compara los últimos 90 días contra los 90 días inmediatamente anteriores" className={`cell-sub inline-delta ${client.salesDelta > 0 ? 'positive' : client.salesDelta < 0 ? 'negative' : ''}`}>{client.salesDelta > 0 ? <ArrowUpRight size={12} /> : client.salesDelta < 0 ? <ArrowDownRight size={12} /> : null}{client.salesDelta === 0 ? 'sin cambio vs. 90d previos' : `${client.salesDelta > 0 ? '+' : '-'}${Math.abs(client.salesDelta)}% vs. 90d previos`}</span></td>
                  <td>{client.active ? <><span className={`score-badge ${client.health}`}>{client.visitPriority}</span><span className="cell-sub">riesgo {client.collectionRisk} · oportunidad {isCommercialOpportunityEligible(client) ? client.commercialOpportunity : '—'}</span></> : <><span className="muted">—</span><span className="cell-sub">Cliente inactivo</span></>}</td>
                  <td className="clients-compact-hide"><strong>{creditTermLabel(client)}</strong><span className="cell-sub">{client.paymentSampleSize ? `${paymentDelay(client.avgPaymentDelayDays)} · ${client.onTimePaymentRate}% en término` : client.paymentMethod}</span></td>
                  <td className="clients-compact-hide">{client.active ? <><strong>{shortDate(client.nextVisitAt)}</strong><span className="cell-sub">referencia algorítmica</span></> : <span className="muted">Fuera de la bandeja</span>}</td>
                  <td>{trendMode ? <button className={`trend-review-button ${reviewed(client.id) ? 'active' : ''}`} aria-label={`${reviewed(client.id) ? 'Marcar como pendiente' : 'Marcar como revisado'} a ${clientPrimaryName(client)}`} title={reviewed(client.id) ? 'Volver a pendientes' : 'Marcar como revisado'} disabled={reviewPending === client.id} onClick={(event) => { event.stopPropagation(); toggleReviewed(client.id); }}><Check size={16} /></button> : <button className="icon-button"><ChevronRight size={17} /></button>}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-pagination"><span>Mostrando {number((currentPage - 1) * pageSize + (visible.length ? 1 : 0))}–{number((currentPage - 1) * pageSize + visible.length)} de {number(filtered.length)}</span><div><button className="button secondary" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><strong>{number(currentPage)} / {number(pageCount)}</strong><button className="button secondary" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Siguiente</button></div></div>
      </section>
    </div>
  );
}
