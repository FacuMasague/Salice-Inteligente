import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronRight, EyeOff, Search, Users } from 'lucide-react';
import type { Client } from '../../shared/models';
import { money, paymentDelay, shortDate } from '../lib/format';

export function ClientsView({ clients, query, onQuery, onOpen }: { clients: Client[]; query: string; onQuery: (value: string) => void; onOpen: (client: Client) => void }) {
  const pageSize = 50;
  const [page, setPage] = useState(1);
  const [commercialStatus, setCommercialStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [portfolio, setPortfolio] = useState<'all' | 'confirmed' | 'review'>('all');
  const [seller, setSeller] = useState('all');
  const [risk, setRisk] = useState<'all' | 'high' | 'attention' | 'low'>('all');
  const [sort, setSort] = useState<'priority' | 'risk' | 'opportunity' | 'sales'>('priority');
  const activeCount = clients.filter((client) => client.active).length;
  const inactiveCount = clients.length - activeCount;
  const sellers = useMemo(() => [...new Set(clients.filter((client) => client.active).map((client) => client.seller))].sort((a, b) => a.localeCompare(b, 'es')), [clients]);
  const filtered = clients
    .filter((client) => commercialStatus === 'all' || (commercialStatus === 'active' ? client.active : !client.active))
    .filter((client) => portfolio === 'all' || client.portfolioStatus === portfolio)
    .filter((client) => seller === 'all' || client.seller === seller)
    .filter((client) => risk === 'all'
      || (risk === 'high' && client.collectionRisk >= 55)
      || (risk === 'attention' && client.collectionRisk >= 25 && client.collectionRisk < 55)
      || (risk === 'low' && client.collectionRisk < 25))
    .filter((client) => `${client.tradeName} ${client.name} ${client.reference} ${client.locality} ${client.zone} ${client.seller}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sort === 'risk' ? b.collectionRisk - a.collectionRisk
      : sort === 'opportunity' ? b.commercialOpportunity - a.commercialOpportunity
        : sort === 'sales' ? b.sales90d - a.sales90d
          : b.visitPriority - a.visitPriority);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return (
    <div className="page-view">
      <div className="page-tools">
        <label className="large-search"><Search size={18} /><input value={query} onChange={(event) => { onQuery(event.target.value); setPage(1); }} placeholder="Buscar cliente, localidad, zona o vendedor…" /></label>
        <div className="client-filter-bar">
          <label><span>GESI</span><select value={commercialStatus} onChange={(event) => { setCommercialStatus(event.target.value as 'active' | 'inactive' | 'all'); setPage(1); }}><option value="active">Activos ({activeCount})</option><option value="inactive">Inactivos ({inactiveCount})</option><option value="all">Todos ({clients.length})</option></select></label>
          <label><span>Cartera Salice</span><select value={portfolio} onChange={(event) => { setPortfolio(event.target.value as typeof portfolio); setPage(1); }}><option value="all">Confirmados + revisar</option><option value="confirmed">Sucursal confirmada</option><option value="review">Revisar pertenencia</option></select></label>
          <label><span>Vendedor</span><select value={seller} onChange={(event) => { setSeller(event.target.value); setPage(1); }}><option value="all">Todos</option>{sellers.map((name) => <option value={name} key={name}>{name}</option>)}</select></label>
          <label><span>Riesgo</span><select value={risk} onChange={(event) => { setRisk(event.target.value as typeof risk); setPage(1); }}><option value="all">Todos</option><option value="high">Alto · 55+</option><option value="attention">Atención · 25–54</option><option value="low">Bajo · 0–24</option></select></label>
          <label><span>Orden</span><select value={sort} onChange={(event) => { setSort(event.target.value as typeof sort); setPage(1); }}><option value="priority">Prioridad de visita</option><option value="risk">Riesgo de cobranza</option><option value="opportunity">Oportunidad comercial</option><option value="sales">Ventas 90 días</option></select></label>
        </div>
      </div>
      <section className="data-card" data-tour="clients-directory">
        <div className="data-card-header"><div><span className="section-kicker">{commercialStatus === 'inactive' ? <EyeOff size={14} /> : <Users size={14} />} Cartera comercial</span><h2>{commercialStatus === 'active' ? 'Clientes activos en GESI' : commercialStatus === 'inactive' ? 'Histórico de clientes inactivos' : 'Universo completo de clientes'}</h2><p>Riesgo de cobranza y oportunidad comercial se calculan por separado.</p></div><span className="count-badge">{filtered.length} resultados</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Cliente</th><th>GESI / Salice</th><th>Zona y vendedor</th><th>Ventas 90d</th><th>Cobranza</th><th>Oportunidad</th><th>Pago vs. vto.</th><th>Visita sugerida</th><th /></tr></thead>
            <tbody>
              {visible.map((client) => (
                <tr key={client.id} className={client.active ? '' : 'inactive-client-row'} onClick={() => onOpen(client)}>
                  <td><div className="table-client"><div className="mini-avatar">{client.tradeName.slice(0, 2).toUpperCase()}</div><div><strong>{client.tradeName}</strong><span>{client.locality} · {client.segment}</span></div></div></td>
                  <td><span className={`gesi-status-badge ${client.active ? 'active' : 'inactive'}`}>{client.active ? 'Activo' : 'Inactivo'}</span><span className={`portfolio-badge ${client.portfolioStatus}`}>{client.portfolioStatus === 'confirmed' ? 'Sucursal confirmada' : 'Revisar cartera'}</span></td>
                  <td><strong className="normal-weight">{client.zone}</strong><span className="cell-sub">{client.seller}</span></td>
                  <td><strong>{money(client.sales90d, true)}</strong><span className={`cell-sub inline-delta ${client.salesDelta > 0 ? 'positive' : client.salesDelta < 0 ? 'negative' : ''}`}>{client.salesDelta > 0 ? <ArrowUpRight size={12} /> : client.salesDelta < 0 ? <ArrowDownRight size={12} /> : null}{client.salesDelta === 0 ? 'sin cambio' : `${Math.abs(client.salesDelta)}%`}</span></td>
                  <td>{client.active ? <><span className={`score-badge ${client.health}`}>{client.collectionRisk}</span><span className="cell-sub">{money(client.overdueOutstanding, true)} vencido</span></> : <span className="muted">—</span>}</td>
                  <td>{client.active ? <><span className="score-badge opportunity">{client.commercialOpportunity}</span><span className="cell-sub">prioridad P{client.visitPriority}</span></> : <span className="muted">—</span>}</td>
                  <td><strong>{client.paymentSampleSize ? paymentDelay(client.avgPaymentDelayDays) : 'Sin muestra'}</strong><span className="cell-sub">{client.paymentSampleSize ? `${client.onTimePaymentRate}% en término · n=${client.paymentSampleSize}` : client.paymentMethod}</span></td>
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
