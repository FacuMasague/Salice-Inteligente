import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, CircleDollarSign, Clock3, MapPin, Search, Target, TrendingUp, Users, WalletCards } from 'lucide-react';
import type { Client } from '../../shared/models';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { clientPrimaryName, clientSecondaryName } from '../lib/client-name';
import { money, number, paymentDelay, shortDate } from '../lib/format';

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

interface SellerProfile {
  name: string;
  clients: Client[];
  activeClients: number;
  confirmedClients: number;
  reviewClients: number;
  mappedClients: number;
  sales90d: number;
  balance: number;
  overdue: number;
  criticalClients: number;
  attentionClients: number;
  healthyClients: number;
  opportunityClients: number;
  averageRisk: number;
  averageOpportunity: number;
  paymentSamples: number;
  averagePaymentDays: number | null;
  averagePaymentDelayDays: number | null;
  onTimeRate: number | null;
  salesTrend: number[];
  priorityClients: Client[];
  localities: { name: string; clients: number; sales: number }[];
}

const monthLabels = (snapshotDate: string) => {
  const anchor = new Date(snapshotDate);
  return Array.from({ length: 6 }, (_, index) => {
    const value = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 5 + index, 1));
    return new Intl.DateTimeFormat('es-AR', { month: 'short', timeZone: 'UTC' }).format(value).replace('.', '');
  });
};

function buildProfiles(clients: Client[]): SellerProfile[] {
  const groups = new Map<string, Client[]>();
  clients.filter((client) => client.active && client.seller && client.seller !== 'Sin vendedor').forEach((client) => {
    groups.set(client.seller, [...(groups.get(client.seller) ?? []), client]);
  });
  return [...groups.entries()].map(([name, sellerClients]) => {
    const paymentSamples = sellerClients.reduce((sum, client) => sum + client.paymentSampleSize, 0);
    const weighted = (value: (client: Client) => number) => paymentSamples
      ? sellerClients.reduce((sum, client) => sum + value(client) * client.paymentSampleSize, 0) / paymentSamples
      : null;
    const localityMap = new Map<string, { clients: number; sales: number }>();
    sellerClients.forEach((client) => {
      const current = localityMap.get(client.locality) ?? { clients: 0, sales: 0 };
      current.clients += 1;
      current.sales += client.sales90d;
      localityMap.set(client.locality, current);
    });
    return {
      name,
      clients: sellerClients,
      activeClients: sellerClients.length,
      confirmedClients: sellerClients.filter((client) => client.portfolioStatus === 'confirmed').length,
      reviewClients: sellerClients.filter((client) => client.portfolioStatus === 'review').length,
      mappedClients: sellerClients.filter((client) => client.coordinates !== null).length,
      sales90d: sellerClients.reduce((sum, client) => sum + client.sales90d, 0),
      balance: sellerClients.reduce((sum, client) => sum + Math.max(0, client.balance), 0),
      overdue: sellerClients.reduce((sum, client) => sum + client.overdueOutstanding, 0),
      criticalClients: sellerClients.filter((client) => client.health === 'critical').length,
      attentionClients: sellerClients.filter((client) => client.health === 'attention').length,
      healthyClients: sellerClients.filter((client) => client.health === 'healthy').length,
      opportunityClients: sellerClients.filter((client) => client.commercialOpportunity >= 55).length,
      averageRisk: sellerClients.reduce((sum, client) => sum + client.collectionRisk, 0) / sellerClients.length,
      averageOpportunity: sellerClients.reduce((sum, client) => sum + client.commercialOpportunity, 0) / sellerClients.length,
      paymentSamples,
      averagePaymentDays: weighted((client) => client.avgPaymentDays),
      averagePaymentDelayDays: weighted((client) => client.avgPaymentDelayDays),
      onTimeRate: weighted((client) => client.onTimePaymentRate),
      salesTrend: Array.from({ length: 6 }, (_, index) => sellerClients.reduce((sum, client) => sum + (client.salesTrend[index] ?? 0), 0)),
      priorityClients: [...sellerClients].sort((left, right) => right.visitPriority - left.visitPriority).slice(0, 8),
      localities: [...localityMap.entries()].map(([locality, values]) => ({ name: locality, ...values })).sort((left, right) => right.sales - left.sales).slice(0, 6),
    };
  }).sort((left, right) => right.sales90d - left.sales90d || left.name.localeCompare(right.name, 'es'));
}

function SalesChart({ profile, snapshotDate }: { profile: SellerProfile; snapshotDate: string }) {
  const labels = monthLabels(snapshotDate);
  const max = Math.max(1, ...profile.salesTrend);
  return <div className="seller-sales-chart" aria-label={`Ventas mensuales de ${profile.name}`}>
    {profile.salesTrend.map((value, index) => <article key={`${labels[index]}-${index}`} title={`${labels[index]}: ${money(value)}`}><div><span style={{ height: `${Math.max(2, value / max * 100)}%` }}><i>{money(value, true)}</i></span></div><strong>{labels[index]}</strong></article>)}
  </div>;
}

function RiskComposition({ profile }: { profile: SellerProfile }) {
  const total = Math.max(1, profile.activeClients);
  const rows = [
    { label: 'Riesgo bajo', value: profile.healthyClients, className: 'healthy' },
    { label: 'Atención', value: profile.attentionClients, className: 'attention' },
    { label: 'Riesgo alto', value: profile.criticalClients, className: 'critical' },
  ];
  return <div className="seller-risk-composition"><div className="seller-risk-track">{rows.map((row) => <span key={row.label} className={row.className} style={{ width: `${row.value / total * 100}%` }} title={`${row.label}: ${row.value}`} />)}</div>{rows.map((row) => <article key={row.label}><i className={row.className} /><span>{row.label}</span><strong>{number(row.value)}</strong><small>{decimal(row.value / total * 100)}%</small></article>)}</div>;
}

export function SellersView({ clients, snapshotDate, selectedSeller, onSelectSeller, onOpenClient }: SellersViewProps) {
  const profiles = useMemo(() => buildProfiles(clients), [clients]);
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase('es');
  const visibleProfiles = profiles.filter((profile) => !normalized || profile.name.toLocaleLowerCase('es').includes(normalized));
  const selected = profiles.find((profile) => profile.name === selectedSeller) ?? profiles[0] ?? null;
  const totalClients = profiles.reduce((sum, profile) => sum + profile.activeClients, 0);
  const totalSales = profiles.reduce((sum, profile) => sum + profile.sales90d, 0);
  const totalOverdue = profiles.reduce((sum, profile) => sum + profile.overdue, 0);
  const highRisk = profiles.reduce((sum, profile) => sum + profile.criticalClients, 0);
  const savedFilters = { query, selectedSeller: selected?.name ?? '' };
  const applySaved = (saved: Record<string, string>) => {
    setQuery(saved.query ?? '');
    if (saved.selectedSeller && profiles.some((profile) => profile.name === saved.selectedSeller)) onSelectSeller(saved.selectedSeller);
  };
  if (!selected) return <div className="page-view"><section className="data-card report-empty">No hay vendedores asignados en la foto actual.</section></div>;
  const maxSellerSales = Math.max(1, ...profiles.map((profile) => profile.sales90d));
  const maxLocalitySales = Math.max(1, ...selected.localities.map((row) => row.sales));
  return <div className="page-view sellers-page" data-tour="sellers-overview">
    <section className="seller-overview-kpis">
      <article><span className="seller-kpi-icon green"><Users size={20} /></span><div><small>Carteras con responsable</small><strong>{number(profiles.length)}</strong><em>{number(totalClients)} clientes activos asignados</em></div></article>
      <article><span className="seller-kpi-icon green"><TrendingUp size={20} /></span><div><small>Ventas · 90 días</small><strong>{money(totalSales, true)}</strong><em>suma de las carteras visibles</em></div></article>
      <article><span className="seller-kpi-icon ochre"><WalletCards size={20} /></span><div><small>Saldo vencido</small><strong>{money(totalOverdue, true)}</strong><em>de clientes activos asignados</em></div></article>
      <article><span className="seller-kpi-icon blue"><AlertTriangle size={20} /></span><div><small>Riesgo alto</small><strong>{number(highRisk)}</strong><em>clientes con C55 o superior</em></div></article>
    </section>

    <SavedViewsBar viewKey="sellers" filters={savedFilters} onApply={applySaved} />

    <div className="seller-workspace">
      <section className="data-card seller-directory-card">
        <div className="data-card-header"><div><span className="section-kicker"><Users size={14} /> Fuerza comercial</span><h2>Vendedores y carteras</h2><p>Elegí una persona para abrir su lectura operativa.</p></div><span className="count-badge">{visibleProfiles.length}</span></div>
        <label className="seller-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar vendedor" /></label>
        <div className="seller-directory-list">{visibleProfiles.map((profile) => <button key={profile.name} className={profile.name === selected.name ? 'active' : ''} onClick={() => onSelectSeller(profile.name)}><div><strong>{profile.name}</strong><span>{number(profile.activeClients)} clientes · {number(profile.mappedClients)} geolocalizados</span></div><b>{money(profile.sales90d, true)}</b><i><span style={{ width: `${profile.sales90d / maxSellerSales * 100}%` }} /></i><small>{profile.criticalClients} riesgo alto · {profile.opportunityClients} oportunidades</small><ChevronRight size={15} /></button>)}</div>
      </section>

      <div className="seller-detail-stack">
        <section className="data-card seller-hero-card">
          <div className="seller-hero-heading"><div className="seller-avatar">{selected.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</div><div><span className="section-kicker">Cartera operativa</span><h2>{selected.name}</h2><p>{number(selected.confirmedClients)} confirmados en Salice · {number(selected.reviewClients)} por revisar · última compra {shortDate([...selected.clients].sort((a, b) => b.lastPurchaseAt.localeCompare(a.lastPurchaseAt))[0]?.lastPurchaseAt ?? '')}</p></div></div>
          <div className="seller-detail-kpis"><article><small>Clientes activos</small><strong>{number(selected.activeClients)}</strong><span>{decimal(selected.mappedClients / Math.max(1, selected.activeClients) * 100)}% geolocalizados</span></article><article><small>Ventas · 90d</small><strong>{money(selected.sales90d, true)}</strong><span>promedio {money(selected.sales90d / Math.max(1, selected.activeClients), true)} por cliente</span></article><article><small>Saldo vencido</small><strong>{money(selected.overdue, true)}</strong><span>{selected.balance ? decimal(selected.overdue / selected.balance * 100) : 0}% del saldo deudor</span></article><article><small>Señal comercial</small><strong>C{Math.round(selected.averageRisk)} · O{Math.round(selected.averageOpportunity)}</strong><span>{selected.opportunityClients} clientes con O55+</span></article></div>
        </section>

        <div className="seller-chart-grid">
          <section className="data-card seller-chart-card"><div className="data-card-header"><div><span className="section-kicker"><TrendingUp size={14} /> Evolución</span><h2>Ventas mensuales</h2><p>Seis meses del snapshot, suma de la cartera activa.</p></div></div><SalesChart profile={selected} snapshotDate={snapshotDate} /></section>
          <section className="data-card seller-chart-card"><div className="data-card-header"><div><span className="section-kicker"><WalletCards size={14} /> Cobranza</span><h2>Composición de riesgo</h2><p>Distribución de clientes según el puntaje C.</p></div></div><RiskComposition profile={selected} /><div className="seller-payment-summary"><article><Clock3 size={17} /><div><span>Pago promedio desde emisión</span><strong>{selected.averagePaymentDays == null ? 'Sin muestra' : `${decimal(selected.averagePaymentDays)} días`}</strong></div></article><article><CircleDollarSign size={17} /><div><span>Contra vencimiento</span><strong>{selected.averagePaymentDelayDays == null ? 'Sin muestra' : paymentDelay(Math.round(selected.averagePaymentDelayDays))}</strong></div></article><article><Target size={17} /><div><span>Pagos en término</span><strong>{selected.onTimeRate == null ? 'Sin muestra' : `${decimal(selected.onTimeRate)}%`}</strong><small>{number(selected.paymentSamples)} facturas conciliadas</small></div></article></div></section>
        </div>

        <div className="seller-operational-grid">
          <section className="data-card seller-priority-card"><div className="data-card-header"><div><span className="section-kicker"><Target size={14} /> Próximas acciones</span><h2>Clientes prioritarios</h2><p>Ordenados por P, combinación de cobranza y oportunidad.</p></div></div><div className="seller-priority-list">{selected.priorityClients.map((client) => <button key={client.id} onClick={() => onOpenClient(client)}><span className={`score-badge ${client.health}`}>{client.visitPriority}</span><div><strong>{clientPrimaryName(client)}</strong><small>{clientSecondaryName(client) ? `${clientSecondaryName(client)} · ` : ''}{client.locality} · C{client.collectionRisk} · O{client.commercialOpportunity}</small></div><span>{money(client.sales90d, true)}<small>{money(client.overdueOutstanding, true)} vencido</small></span><ChevronRight size={15} /></button>)}</div></section>
          <section className="data-card seller-locality-card"><div className="data-card-header"><div><span className="section-kicker"><MapPin size={14} /> Territorio</span><h2>Principales localidades</h2><p>Ordenadas por venta de los últimos 90 días.</p></div></div><div className="seller-locality-list">{selected.localities.map((row) => <article key={row.name}><div><strong>{row.name}</strong><span>{row.clients} clientes</span></div><i><span style={{ width: `${row.sales / maxLocalitySales * 100}%` }} /></i><b>{money(row.sales, true)}</b></article>)}</div></section>
        </div>
      </div>
    </div>
  </div>;
}
