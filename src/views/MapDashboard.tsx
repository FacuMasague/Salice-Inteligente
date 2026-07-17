import { useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, EyeOff, Filter, MapPinned, TrendingUp, Users, WalletCards } from 'lucide-react';
import type { Client, Product } from '../../shared/models';
import { ClientMap } from '../components/ClientMap';
import { ClientPanel } from '../components/ClientPanel';
import { money } from '../lib/format';

interface MapDashboardProps {
  clients: Client[];
  products: Product[];
  selected: Client | null;
  onSelect: (client: Client | null) => void;
  onPlanRoute: (clientId: number) => void;
  onNoteSaved: (clientId: number, note: string) => void;
  clientVisibility: ClientVisibility;
  onClientVisibilityChange: (value: ClientVisibility) => void;
}

export type ClientVisibility = 'active' | 'inactive' | 'all';

export function MapDashboard({ clients, products, selected, onSelect, onPlanRoute, onNoteSaved, clientVisibility, onClientVisibilityChange }: MapDashboardProps) {
  const [zone, setZone] = useState('Todas');
  const [health, setHealth] = useState('all');
  const [portfolioStatus, setPortfolioStatus] = useState<'all' | 'confirmed' | 'review'>('all');
  const [scope, setScope] = useState<'regional' | 'all'>('regional');
  const activeClients = useMemo(() => clients.filter((client) => client.active), [clients]);
  const visibleByStatus = useMemo(() => clients.filter((client) => (
    clientVisibility === 'all' || (clientVisibility === 'active' ? client.active : !client.active)
  )), [clients, clientVisibility]);
  const mappedClients = useMemo(() => visibleByStatus.filter((client) => client.coordinates !== null), [visibleByStatus]);
  const scopedClients = mappedClients.filter((client) => scope === 'all' || (
    client.coordinates![0] >= -39.5 && client.coordinates![0] <= -36.5
    && client.coordinates![1] >= -59.5 && client.coordinates![1] <= -56.5
  ));
  const zones = useMemo(() => ['Todas', ...new Set(scopedClients.map((client) => client.zone))], [scopedClients]);
  const filtered = scopedClients.filter((client) => (zone === 'Todas' || client.zone === zone)
    && (health === 'all' || client.health === health)
    && (portfolioStatus === 'all' || client.portfolioStatus === portfolioStatus));
  const portfolio = activeClients.reduce((sum, client) => sum + client.sales90d, 0);
  const debt = activeClients.reduce((sum, client) => sum + client.balance, 0);
  const critical = activeClients.filter((client) => client.health === 'critical').length;
  const trend = activeClients.reduce((totals, client) => totals.map((total, index) => total + (client.salesTrend[index] || 0)), [0, 0, 0, 0, 0, 0]);
  const previousQuarter = trend.slice(0, 3).reduce((sum, value) => sum + value, 0);
  const currentQuarter = trend.slice(3).reduce((sum, value) => sum + value, 0);
  const portfolioDelta = previousQuarter ? Math.round((currentQuarter - previousQuarter) / previousQuarter * 100) : 0;

  return (
    <div className="map-dashboard">
      <div className="kpi-strip" data-tour="map-kpis">
        <article className="kpi-card"><div className="kpi-icon green"><Users size={20} /></div><div><span>Activos en GESI</span><strong>{activeClients.length}</strong><small>{activeClients.filter((client) => client.portfolioStatus === 'confirmed').length} confirmados en sucursal · {activeClients.filter((client) => client.portfolioStatus === 'review').length} a revisar</small></div></article>
        <article className="kpi-card"><div className="kpi-icon ochre"><TrendingUp size={20} /></div><div><span>Facturación · 90 días</span><strong>{money(portfolio, true)}</strong><small className={portfolioDelta >= 0 ? 'positive' : 'negative'}>{portfolioDelta >= 0 ? '↑' : '↓'} {Math.abs(portfolioDelta)}% vs. trimestre anterior</small></div></article>
        <article className="kpi-card"><div className="kpi-icon blue"><WalletCards size={20} /></div><div><span>Saldo neto en cuenta corriente</span><strong>{money(debt, true)}</strong><small>{activeClients.filter((client) => client.balance > 0).length} clientes activos con saldo deudor</small></div></article>
        <article className="kpi-card"><div className="kpi-icon red"><AlertCircle size={20} /></div><div><span>Riesgo de cobranza alto</span><strong>{critical}</strong><small>puntaje 55 o superior · revisar antes de vender</small></div></article>
      </div>

      <div className={`map-workspace ${selected ? 'with-panel' : ''}`}>
        <section className="map-stage">
          <div className="map-toolbar">
            <div className="map-heading"><div className="live-dot" /><span><strong>{filtered.length}</strong> {filtered.length === 1 ? 'cliente visible' : 'clientes visibles'}</span></div>
            <div className="filter-group" data-tour="map-filters">
              <label className="map-select"><MapPinned size={15} /><select value={scope} onChange={(event) => { setScope(event.target.value as 'regional' | 'all'); setZone('Todas'); }}><option value="regional">Mar del Plata y zona</option><option value="all">Toda Argentina</option></select><ChevronDown size={14} /></label>
              <label className="map-select"><EyeOff size={15} /><select value={clientVisibility} onChange={(event) => { onClientVisibilityChange(event.target.value as ClientVisibility); setZone('Todas'); onSelect(null); }}><option value="active">Sólo activos</option><option value="inactive">Sólo inactivos</option><option value="all">Activos e inactivos</option></select><ChevronDown size={14} /></label>
              <label className="map-select"><Users size={15} /><select value={portfolioStatus} onChange={(event) => { setPortfolioStatus(event.target.value as typeof portfolioStatus); onSelect(null); }}><option value="all">Toda la cartera Salice</option><option value="confirmed">Sucursal confirmada</option><option value="review">Revisar pertenencia</option></select><ChevronDown size={14} /></label>
              <label className="map-select"><MapPinned size={15} /><select value={zone} onChange={(event) => setZone(event.target.value)}>{zones.map((item) => <option key={item} value={item}>{item === 'Todas' ? 'Todas las zonas' : item}</option>)}</select><ChevronDown size={14} /></label>
              <label className="map-select"><Filter size={15} /><select value={health} onChange={(event) => setHealth(event.target.value)}><option value="all">Todo riesgo de cobranza</option><option value="healthy">Riesgo bajo</option><option value="attention">Atención</option><option value="critical">Riesgo alto</option></select><ChevronDown size={14} /></label>
            </div>
          </div>
          <ClientMap clients={filtered} selectedId={selected?.id ?? null} onSelect={onSelect} />
          <div className="map-legend"><span><i className="legend-dot depot" /> Depósito · Bradley 1450</span><span><i className="legend-dot healthy" /> Riesgo bajo</span><span><i className="legend-dot attention" /> Atención</span><span><i className="legend-dot critical" /> Riesgo alto</span>{clientVisibility !== 'active' && <span><i className="legend-dot inactive" /> Inactivo GESI</span>}<span>Los grupos se separan al acercar el mapa</span></div>
        </section>
        {selected && <ClientPanel client={selected} products={products} onClose={() => onSelect(null)} onPlanRoute={onPlanRoute} onNoteSaved={onNoteSaved} />}
      </div>
    </div>
  );
}
