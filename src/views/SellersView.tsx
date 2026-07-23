import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  MapPin,
  Search,
  Target,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import type { Client } from '../../shared/models';
import {
  buildSellerPortfolioProfiles,
  matchesPortfolioLens,
  PORTFOLIO_SIGNAL_THRESHOLD,
  type PortfolioLens,
  type SellerPortfolioProfile,
} from '../../shared/portfolio-analysis';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { SortButton } from '../components/SortButton';
import { clientPrimaryName, clientSecondaryName } from '../lib/client-name';
import { money, number, paymentDelay, shortDate } from '../lib/format';
import { cycleSortDescendingFirst, emptySort, sortItems } from '../lib/sorting';

const decimal = (value: number, digits = 1) => new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
}).format(value);

interface SellersViewProps {
  clients: Client[];
  snapshotDate: string;
  selectedSeller: string;
  onSelectSeller: (seller: string) => void;
  onOpenClient: (client: Client) => void;
}

const lensLabels: Array<{ value: PortfolioLens; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'high_risk', label: 'Riesgo de cobranza' },
  { value: 'high_opportunity', label: 'Oportunidad alta' },
  { value: 'high_priority', label: 'Prioridad alta' },
];

type PortfolioSortKey = 'seller' | 'clients' | 'sales' | 'localities' | 'risk' | 'opportunity' | 'priority';

const monthLabels = (snapshotDate: string) => {
  const anchor = new Date(snapshotDate);
  return Array.from({ length: 6 }, (_, index) => {
    const value = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 5 + index, 1));
    return new Intl.DateTimeFormat('es-AR', { month: 'short', timeZone: 'UTC' }).format(value).replace('.', '');
  });
};

function SalesChart({ profile, snapshotDate }: { profile: SellerPortfolioProfile; snapshotDate: string }) {
  const labels = monthLabels(snapshotDate);
  const max = Math.max(1, ...profile.salesTrend);
  return <div className="seller-sales-chart" aria-label={`Ventas mensuales de ${profile.name}`}>
    {profile.salesTrend.map((value, index) => <article key={`${labels[index]}-${index}`} title={`${labels[index]}: ${money(value)}`}><div><span style={{ height: `${Math.max(2, value / max * 100)}%` }}><i>{money(value, true)}</i></span></div><strong>{labels[index]}</strong></article>)}
  </div>;
}

function RiskComposition({ profile }: { profile: SellerPortfolioProfile }) {
  const total = Math.max(1, profile.activeClients);
  const rows = [
    { label: 'Riesgo bajo', value: profile.healthyClients, className: 'healthy' },
    { label: 'Atención', value: profile.attentionClients, className: 'attention' },
    { label: 'Riesgo alto', value: profile.criticalClients, className: 'critical' },
  ];
  return <div className="seller-risk-composition"><div className="seller-risk-track">{rows.map((row) => <span key={row.label} className={row.className} style={{ width: `${row.value / total * 100}%` }} title={`${row.label}: ${row.value}`} />)}</div>{rows.map((row) => <article key={row.label}><i className={row.className} /><span>{row.label}</span><strong>{number(row.value)}</strong><small>{decimal(row.value / total * 100)}%</small></article>)}</div>;
}

export function SellersView({ clients, snapshotDate, selectedSeller, onSelectSeller, onOpenClient }: SellersViewProps) {
  const [query, setQuery] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [lens, setLens] = useState<PortfolioLens>('all');
  const [portfolioSort, setPortfolioSort] = useState(emptySort<PortfolioSortKey>());

  const profiles = useMemo(() => buildSellerPortfolioProfiles(clients), [clients]);
  const normalized = query.trim().toLocaleLowerCase('es');
  const filteredProfiles = profiles.filter((profile) => !normalized || profile.name.toLocaleLowerCase('es').includes(normalized));
  const visibleProfiles = sortItems(filteredProfiles, portfolioSort, (profile, key) => {
    if (key === 'seller') return profile.name;
    if (key === 'clients') return profile.activeClients;
    if (key === 'sales') return profile.sales90d;
    if (key === 'localities') return profile.localities.length;
    if (key === 'risk') return profile.criticalClients;
    if (key === 'opportunity') return profile.opportunityClients;
    return profile.prioritySignalClients;
  });
  const selected = profiles.find((profile) => profile.name === selectedSeller) ?? profiles[0] ?? null;
  const totalClients = profiles.reduce((sum, profile) => sum + profile.activeClients, 0);
  const totalSales = profiles.reduce((sum, profile) => sum + profile.sales90d, 0);
  const highRisk = profiles.reduce((sum, profile) => sum + profile.criticalClients, 0);
  const savedFilters = { query, selectedSeller: selected?.name ?? '' };
  const applySaved = (saved: Record<string, string>) => {
    setQuery(saved.query ?? '');
    if (saved.selectedSeller && profiles.some((profile) => profile.name === saved.selectedSeller)) {
      onSelectSeller(saved.selectedSeller);
    }
  };

  if (!selected) {
    return <div className="page-view"><section className="data-card report-empty">No hay vendedores asignados en la foto actual.</section></div>;
  }

  const selectSeller = (seller: string) => {
    onSelectSeller(seller);
    setClientQuery('');
    setLens('all');
  };
  const normalizedClientQuery = clientQuery.trim().toLocaleLowerCase('es');
  const visibleClients = selected.clientRows.filter((row) => (
    matchesPortfolioLens(row, lens)
    && (!normalizedClientQuery || `${row.client.name} ${row.client.tradeName} ${row.client.reference} ${row.client.locality}`
      .toLocaleLowerCase('es').includes(normalizedClientQuery))
  ));
  const lensCount = (value: PortfolioLens) => selected.clientRows.filter((row) => matchesPortfolioLens(row, value)).length;
  const direction = (key: PortfolioSortKey) => portfolioSort.key === key ? portfolioSort.direction : null;
  const changeSort = (key: PortfolioSortKey) => setPortfolioSort((current) => cycleSortDescendingFirst(current, key));

  return <div className="page-view sellers-page" data-tour="sellers-overview">
    <section className="seller-overview-kpis">
      <article><span className="seller-kpi-icon green"><Users size={20} /></span><div><small>Carteras visibles</small><strong>{number(profiles.length)}</strong><em>{number(totalClients)} clientes activos, incluso sin vendedor</em></div></article>
      <article><span className="seller-kpi-icon green"><TrendingUp size={20} /></span><div><small>Ventas · 90 días</small><strong>{money(totalSales, true)}</strong><em>suma de clientes activos visibles</em></div></article>
      <article><span className="seller-kpi-icon blue"><AlertTriangle size={20} /></span><div><small>Riesgo alto</small><strong>{number(highRisk)}</strong><em>clientes con C{PORTFOLIO_SIGNAL_THRESHOLD} o superior</em></div></article>
    </section>

    <SavedViewsBar viewKey="sellers" filters={savedFilters} onApply={applySaved} />

    <section className="data-card seller-portfolio-comparison">
      <div className="data-card-header"><div><span className="section-kicker"><Users size={14} /> Lectura comparativa</span><h2>Carteras comerciales activas</h2><p>Incluye Sin vendedor para no ocultar clientes. No reasigna ni define territorios.</p></div><label className="seller-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar vendedor" /></label></div>
      <div className="table-wrap">
        <table className="data-table seller-portfolio-table">
          <thead><tr>
            <th><SortButton label="Vendedor" direction={direction('seller')} descendingFirst onClick={() => changeSort('seller')} /></th>
            <th><SortButton label="Clientes" direction={direction('clients')} descendingFirst onClick={() => changeSort('clients')} /></th>
            <th><SortButton label="Ventas 90d" direction={direction('sales')} descendingFirst onClick={() => changeSort('sales')} /></th>
            <th><SortButton label="Localidades" direction={direction('localities')} descendingFirst onClick={() => changeSort('localities')} /></th>
            <th><SortButton label="Riesgo de cobranza" direction={direction('risk')} descendingFirst onClick={() => changeSort('risk')} /></th>
            <th><SortButton label="Oportunidad alta" direction={direction('opportunity')} descendingFirst onClick={() => changeSort('opportunity')} /></th>
            <th><SortButton label="Prioridad alta" direction={direction('priority')} descendingFirst onClick={() => changeSort('priority')} /></th>
          </tr></thead>
          <tbody>{visibleProfiles.map((profile) => <tr key={profile.name} className={profile.name === selected.name ? 'active' : ''} onClick={() => selectSeller(profile.name)}>
            <td><button className="entity-link">{profile.name}<ChevronRight size={13} /></button></td>
            <td><strong>{number(profile.activeClients)}</strong><span className="cell-sub">{profile.reviewClients} por revisar</span></td>
            <td><strong>{money(profile.sales90d, true)}</strong><span className="cell-sub">{money(profile.sales90d / Math.max(1, profile.activeClients), true)} por cliente</span></td>
            <td><strong>{number(profile.localities.length)}</strong><span className="cell-sub">localidades informadas</span></td>
            <td><strong>{number(profile.criticalClients)}</strong><span className="cell-sub">riesgo</span></td>
            <td><strong>{number(profile.opportunityClients)}</strong><span className="cell-sub">elegibles</span></td>
            <td><strong>{number(profile.prioritySignalClients)}</strong><span className="cell-sub">prioridad</span></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <div className="seller-detail-stack">
      <section className="data-card seller-hero-card">
        <div className="seller-hero-heading"><div className="seller-avatar">{selected.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</div><div><span className="section-kicker">Cartera operativa activa</span><h2>{selected.name}</h2><p>{number(selected.confirmedClients)} confirmados en Salice · {number(selected.reviewClients)} por revisar · última compra {selected.lastPurchaseAt ? shortDate(selected.lastPurchaseAt) : 'sin compra observable'}</p></div></div>
        <div className="seller-detail-kpis">
          <article><small>Clientes activos</small><strong>{number(selected.activeClients)}</strong><span>{decimal(selected.mappedClients / Math.max(1, selected.activeClients) * 100)}% geolocalizados</span></article>
          <article><small>Ventas · 90d</small><strong>{money(selected.sales90d, true)}</strong><span>{money(selected.sales90d / Math.max(1, selected.activeClients), true)} por cliente</span></article>
          <article><small>Riesgo promedio</small><strong>C{Math.round(selected.averageRisk)}</strong><span>{selected.criticalClients} con riesgo de cobranza</span></article>
          <article><small>Oportunidad promedio elegible</small><strong>O{Math.round(selected.averageOpportunity)}</strong><span>{selected.opportunityClients} con oportunidad alta</span></article>
          <article><small>Prioridad promedio</small><strong>P{Math.round(selected.averagePriority)}</strong><span>{selected.prioritySignalClients} con prioridad alta</span></article>
        </div>
      </section>

      <div className="seller-chart-grid">
        <section className="data-card seller-chart-card"><div className="data-card-header"><div><span className="section-kicker"><TrendingUp size={14} /> Ventas</span><h2>Evolución mensual</h2><p>Seis meses del snapshot, suma de la cartera activa.</p></div></div><SalesChart profile={selected} snapshotDate={snapshotDate} /></section>
        <section className="data-card seller-chart-card"><div className="data-card-header"><div><span className="section-kicker"><WalletCards size={14} /> Cobranza</span><h2>Composición de riesgo</h2><p>C es independiente de O y P.</p></div></div><RiskComposition profile={selected} /><div className="seller-payment-summary"><article><Clock3 size={17} /><div><span>Pago promedio desde emisión</span><strong>{selected.averagePaymentDays == null ? 'Sin muestra' : `${decimal(selected.averagePaymentDays)} días`}</strong></div></article><article><CircleDollarSign size={17} /><div><span>Contra vencimiento</span><strong>{selected.averagePaymentDelayDays == null ? 'Sin muestra' : paymentDelay(Math.round(selected.averagePaymentDelayDays))}</strong></div></article><article><Target size={17} /><div><span>Pagos en término</span><strong>{selected.onTimeRate == null ? 'Sin muestra' : `${decimal(selected.onTimeRate)}%`}</strong><small>{number(selected.paymentSamples)} facturas conciliadas</small></div></article></div></section>
      </div>

      <div className="seller-operational-grid">
        <section className="data-card seller-priority-card">
          <div className="data-card-header"><div><span className="section-kicker"><Target size={14} /> Lectura de clientes</span><h2>Cartera para revisar</h2><p>Los filtros no crean tareas. El orden se mantiene siempre por P descendente.</p></div><span className="count-badge">{number(visibleClients.length)}</span></div>
          <div className="seller-client-controls">
            <label><Search size={14} /><input value={clientQuery} onChange={(event) => setClientQuery(event.target.value)} placeholder="Buscar cliente o localidad" /></label>
            <div>{lensLabels.map((item) => <button key={item.value} className={lens === item.value ? 'active' : ''} onClick={() => setLens(item.value)}>{item.label}<span>{lensCount(item.value)}</span></button>)}</div>
          </div>
          <div className="seller-priority-list seller-portfolio-client-list">
            {visibleClients.map((row) => {
              const client = row.client;
              return <button key={client.id} onClick={() => onOpenClient(client)}>
                <span className={`score-badge ${client.health}`}>P{client.visitPriority}</span>
                <div><strong>{clientPrimaryName(client)}</strong><small>{clientSecondaryName(client) ? `${clientSecondaryName(client)} · ` : ''}{client.locality}</small><em>{money(client.sales90d, true)} en 90 días</em></div>
                <ChevronRight size={15} />
              </button>;
            })}
            {!visibleClients.length && <p className="seller-list-empty">No hay clientes para este filtro.</p>}
          </div>
        </section>

        <section className="data-card seller-locality-card">
          <div className="data-card-header"><div><span className="section-kicker"><MapPin size={14} /> Distribución observada</span><h2>Localidades informadas</h2><p>Localidad del maestro GESI; no equivale a territorio ni propone reasignaciones.</p></div><span className="count-badge">{selected.localities.length}</span></div>
          <div className="seller-locality-table">
            <div className="seller-locality-head"><span>Localidad y señales</span><span>Clientes</span><span>Ventas 90d</span></div>
            {selected.localities.map((row) => <article key={row.name}>
              <div><strong>{row.name}</strong><span>P prom. {Math.round(row.averagePriority)} · riesgo {row.highRisk} · oportunidad {row.highOpportunity} · prioridad {row.highPriority}</span></div>
              <b>{number(row.clients)}</b>
              <b>{money(row.sales90d, true)}</b>
            </article>)}
          </div>
        </section>
      </div>
    </div>
  </div>;
}
