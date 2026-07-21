import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronRight, EyeOff, Search, Users } from 'lucide-react';
import type { Client } from '../../shared/models';
import { decodeMultiFilter, matchesMultiFilter } from '../../shared/multi-filter';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SingleSelectFilter } from '../components/SingleSelectFilter';
import { SortButton } from '../components/SortButton';
import { creditTermLabel, money, paymentDelay, shortDate } from '../lib/format';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';

type ClientSortKey = 'client' | 'status' | 'zone' | 'sales' | 'risk' | 'opportunity' | 'term' | 'visit';

export function ClientsView({ clients, query, onQuery, onOpen, onOpenSeller }: { clients: Client[]; query: string; onQuery: (value: string) => void; onOpen: (client: Client) => void; onOpenSeller: (seller: string) => void }) {
  const pageSize = 50;
  const [page, setPage] = useState(1);
  const [commercialStatus, setCommercialStatus] = useState('active');
  const [portfolio, setPortfolio] = useState('');
  const [seller, setSeller] = useState('');
  const [risk, setRisk] = useState('');
  const [sort, setSort] = useState<'priority' | 'risk' | 'opportunity' | 'sales'>('priority');
  const [tableSort, setTableSort] = useState(emptySort<ClientSortKey>());
  const activeCount = clients.filter((client) => client.active).length;
  const inactiveCount = clients.length - activeCount;
  const sellers = useMemo(() => [...new Set(clients.filter((client) => client.active).map((client) => client.seller))].sort((a, b) => a.localeCompare(b, 'es')), [clients]);
  const baseFiltered = clients
    .filter((client) => matchesMultiFilter(client.active ? 'active' : 'inactive', commercialStatus))
    .filter((client) => matchesMultiFilter(client.portfolioStatus, portfolio))
    .filter((client) => matchesMultiFilter(client.seller, seller))
    .filter((client) => matchesMultiFilter(client.collectionRisk >= 55 ? 'high' : client.collectionRisk >= 25 ? 'attention' : 'low', risk))
    .filter((client) => `${client.tradeName} ${client.name} ${client.reference} ${client.locality} ${client.zone} ${client.seller}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sort === 'risk' ? b.collectionRisk - a.collectionRisk
      : sort === 'opportunity' ? b.commercialOpportunity - a.commercialOpportunity
        : sort === 'sales' ? b.sales90d - a.sales90d
          : b.visitPriority - a.visitPriority);
  const filtered = sortItems(baseFiltered, tableSort, (client, key) => {
    if (key === 'client') return client.tradeName;
    if (key === 'status') return client.active;
    if (key === 'zone') return `${client.zone} ${client.seller}`;
    if (key === 'sales') return client.sales90d;
    if (key === 'risk') return client.collectionRisk;
    if (key === 'opportunity') return client.commercialOpportunity;
    if (key === 'term') return client.creditDays;
    return client.nextVisitAt;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const direction = (key: ClientSortKey) => tableSort.key === key ? tableSort.direction : null;
  const ariaSort = (key: ClientSortKey): 'ascending' | 'descending' | 'none' => direction(key) === 'asc' ? 'ascending' : direction(key) === 'desc' ? 'descending' : 'none';
  const changeTableSort = (key: ClientSortKey) => { setTableSort((current) => cycleSort(current, key)); setPage(1); };
  return (
    <div className="page-view">
      <div className="page-tools">
        <label className="large-search"><Search size={18} /><input value={query} onChange={(event) => { onQuery(event.target.value); setPage(1); }} placeholder="Buscar cliente, localidad, zona o vendedor…" /></label>
        <div className="client-filter-bar">
          <MultiSelectFilter label="GESI" value={commercialStatus} options={[{ value: 'active', label: `Activos (${activeCount})` }, { value: 'inactive', label: `Inactivos (${inactiveCount})` }]} onChange={(value) => { setCommercialStatus(value); setPage(1); }} />
          <MultiSelectFilter label="Cartera Salice" value={portfolio} options={[{ value: 'confirmed', label: 'Sucursal confirmada' }, { value: 'review', label: 'Revisar pertenencia' }]} onChange={(value) => { setPortfolio(value); setPage(1); }} />
          <MultiSelectFilter label="Vendedor" value={seller} options={sellers} onChange={(value) => { setSeller(value); setPage(1); }} />
          <MultiSelectFilter label="Riesgo" value={risk} options={[{ value: 'high', label: 'Alto · 55+' }, { value: 'attention', label: 'Atención · 25–54' }, { value: 'low', label: 'Bajo · 0–24' }]} onChange={(value) => { setRisk(value); setPage(1); }} />
          <SingleSelectFilter label="Orden" value={sort} options={[{ value: 'priority', label: 'Prioridad de visita' }, { value: 'risk', label: 'Riesgo de cobranza' }, { value: 'opportunity', label: 'Oportunidad comercial' }, { value: 'sales', label: 'Ventas 90 días' }]} onChange={(value) => { setSort(value as typeof sort); setPage(1); }} />
        </div>
      </div>
      <section className="data-card" data-tour="clients-directory">
        <div className="data-card-header"><div><span className="section-kicker">{decodeMultiFilter(commercialStatus).length === 1 && decodeMultiFilter(commercialStatus)[0] === 'inactive' ? <EyeOff size={14} /> : <Users size={14} />} Cartera comercial</span><h2>{decodeMultiFilter(commercialStatus).length === 1 && decodeMultiFilter(commercialStatus)[0] === 'active' ? 'Clientes activos en GESI' : decodeMultiFilter(commercialStatus).length === 1 && decodeMultiFilter(commercialStatus)[0] === 'inactive' ? 'Histórico de clientes inactivos' : 'Universo completo de clientes'}</h2><p>Riesgo de cobranza y oportunidad comercial se calculan por separado.</p></div><span className="count-badge">{filtered.length} resultados</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th aria-sort={ariaSort('client')}><SortButton label="Cliente" direction={direction('client')} onClick={() => changeTableSort('client')} /></th><th aria-sort={ariaSort('status')}><SortButton label="GESI / Salice" direction={direction('status')} onClick={() => changeTableSort('status')} /></th><th aria-sort={ariaSort('zone')}><SortButton label="Zona y vendedor" direction={direction('zone')} onClick={() => changeTableSort('zone')} /></th><th aria-sort={ariaSort('sales')}><SortButton label="Ventas 90d" direction={direction('sales')} onClick={() => changeTableSort('sales')} /></th><th aria-sort={ariaSort('risk')}><SortButton label="Cobranza" direction={direction('risk')} onClick={() => changeTableSort('risk')} /></th><th aria-sort={ariaSort('opportunity')}><SortButton label="Oportunidad" direction={direction('opportunity')} onClick={() => changeTableSort('opportunity')} /></th><th aria-sort={ariaSort('term')}><SortButton label="Plazo / pago" direction={direction('term')} onClick={() => changeTableSort('term')} /></th><th aria-sort={ariaSort('visit')}><SortButton label="Visita sugerida" direction={direction('visit')} onClick={() => changeTableSort('visit')} /></th><th /></tr></thead>
            <tbody>
              {visible.map((client) => (
                <tr key={client.id} className={client.active ? '' : 'inactive-client-row'} onClick={() => onOpen(client)}>
                  <td><div className="table-client"><div className="mini-avatar">{client.tradeName.slice(0, 2).toUpperCase()}</div><div><strong>{client.tradeName}</strong><span>{client.locality} · {client.segment}</span></div></div></td>
                  <td><span className={`gesi-status-badge ${client.active ? 'active' : 'inactive'}`}>{client.active ? 'Activo' : 'Inactivo'}</span><span className={`portfolio-badge ${client.portfolioStatus}`}>{client.portfolioStatus === 'confirmed' ? 'Sucursal confirmada' : 'Revisar cartera'}</span></td>
                  <td><strong className="normal-weight">{client.zone}</strong><button className="entity-link cell-sub" onClick={(event) => { event.stopPropagation(); onOpenSeller(client.seller); }}>{client.seller}</button></td>
                  <td><strong>{money(client.sales90d, true)}</strong><span className={`cell-sub inline-delta ${client.salesDelta > 0 ? 'positive' : client.salesDelta < 0 ? 'negative' : ''}`}>{client.salesDelta > 0 ? <ArrowUpRight size={12} /> : client.salesDelta < 0 ? <ArrowDownRight size={12} /> : null}{client.salesDelta === 0 ? 'sin cambio' : `${Math.abs(client.salesDelta)}%`}</span></td>
                  <td>{client.active ? <><span className={`score-badge ${client.health}`}>{client.collectionRisk}</span><span className="cell-sub">{money(client.overdueOutstanding, true)} vencido</span></> : <span className="muted">—</span>}</td>
                  <td>{client.active ? <><span className="score-badge opportunity">{client.commercialOpportunity}</span><span className="cell-sub">prioridad P{client.visitPriority}</span></> : <span className="muted">—</span>}</td>
                  <td><strong>{creditTermLabel(client)}</strong><span className="cell-sub">{client.paymentSampleSize ? `${paymentDelay(client.avgPaymentDelayDays)} · ${client.onTimePaymentRate}% en término` : client.paymentMethod}</span></td>
                  <td>{client.active ? <><strong>{shortDate(client.nextVisitAt)}</strong><span className="cell-sub">fecha algorítmica</span></> : <span className="muted">Fuera de agenda</span>}</td>
                  <td><button className="icon-button"><ChevronRight size={17} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-pagination"><span>Mostrando {(currentPage - 1) * pageSize + (visible.length ? 1 : 0)}–{(currentPage - 1) * pageSize + visible.length} de {filtered.length}</span><div><button className="button secondary" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><strong>{currentPage} / {pageCount}</strong><button className="button secondary" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Siguiente</button></div></div>
      </section>
    </div>
  );
}
