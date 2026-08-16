import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, EyeOff, MapPinned, TrendingUp, Users, WalletCards } from 'lucide-react';
import type { Client, LogisticsSnapshot, Product } from '../../shared/models';
import { decodeMultiFilter, matchesMultiFilter } from '../../shared/multi-filter';
import { ClientMap } from '../components/ClientMap';
import { ClientPanel } from '../components/ClientPanel';
import { MobileFilterSheet } from '../components/MobileFilterSheet';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { clientKilos90d, productContentById } from '../lib/commercial-metrics';
import { money, number, zoneLabel } from '../lib/format';

interface MapDashboardProps {
  clients: Client[];
  products: Product[];
  logistics: LogisticsSnapshot;
  selected: Client | null;
  onSelect: (client: Client | null) => void;
  onPlanRoute: (clientId: number) => void;
  onNoteSaved: (clientId: number, note: string) => void;
  onExpandClient: () => void;
  onOpenSeller: (seller: string) => void;
  onOpenProduct: (product: Product) => void;
  onOpenInvoice: (invoiceId: string) => void;
  snapshotDate: string;
  clientVisibility: ClientVisibility;
  onClientVisibilityChange: (value: ClientVisibility) => void;
}

export type ClientVisibility = string;

export function MapDashboard({ clients, products, logistics, selected, onSelect, onPlanRoute, onNoteSaved, onExpandClient, onOpenSeller, onOpenProduct, onOpenInvoice, snapshotDate, clientVisibility, onClientVisibilityChange }: MapDashboardProps) {
  const [zone, setZone] = useState('');
  const [health, setHealth] = useState('');
  const [portfolioStatus, setPortfolioStatus] = useState('');
  const [locationStatus, setLocationStatus] = useState('');
  const [scope, setScope] = useState('regional');
  const activeClients = useMemo(() => clients.filter((client) => client.active), [clients]);
  const visibleByStatus = useMemo(() => clients.filter((client) => (
    matchesMultiFilter(client.active ? 'active' : 'inactive', clientVisibility)
  )), [clients, clientVisibility]);
  const mappedClients = useMemo(() => visibleByStatus.filter((client) => client.coordinates !== null), [visibleByStatus]);
  const scopedClients = useMemo(() => mappedClients.filter((client) => {
    const regional = client.coordinates![0] >= -39.7 && client.coordinates![0] <= -35.7
      && client.coordinates![1] >= -60.8 && client.coordinates![1] <= -56.2;
    return matchesMultiFilter(regional ? 'regional' : 'outside', scope);
  }), [mappedClients, scope]);
  const zones = useMemo(() => [...new Set(scopedClients.map((client) => client.zone))], [scopedClients]);
  const zoneOptions = useMemo(() => zones.map((value) => {
    const localities = [...new Set(scopedClients.filter((client) => client.zone === value).map((client) => client.locality).filter(Boolean))];
    return { value, label: zoneLabel(value, localities.length === 1 ? localities[0] : '') };
  }), [scopedClients, zones]);
  const filtered = useMemo(() => scopedClients.filter((client) => matchesMultiFilter(client.zone, zone)
    && matchesMultiFilter(client.health, health)
    && matchesMultiFilter(client.portfolioStatus, portfolioStatus)
    && matchesMultiFilter(client.locationStatus ?? 'original', locationStatus)), [scopedClients, zone, health, portfolioStatus, locationStatus]);
  const portfolio = activeClients.reduce((sum, client) => sum + client.sales90d, 0);
  const contentByProduct = useMemo(() => productContentById(products), [products]);
  const portfolioKiloMetric = useMemo(() => activeClients.reduce((total, client) => {
    const metric = clientKilos90d(client, contentByProduct);
    return { kilos: total.kilos + metric.kilos, complete: total.complete && metric.complete };
  }, { kilos: 0, complete: true }), [activeClients, contentByProduct]);
  const debt = activeClients.reduce((sum, client) => sum + client.balance, 0);
  const critical = activeClients.filter((client) => client.health === 'critical').length;
  const trend = activeClients.reduce((totals, client) => totals.map((total, index) => total + (client.salesTrend[index] || 0)), [0, 0, 0, 0, 0, 0]);
  const previousQuarter = trend.slice(0, 3).reduce((sum, value) => sum + value, 0);
  const currentQuarter = trend.slice(3).reduce((sum, value) => sum + value, 0);
  const portfolioDelta = previousQuarter ? Math.round((currentQuarter - previousQuarter) / previousQuarter * 100) : 0;
  const savedFilters = { scope, clientVisibility, portfolioStatus, locationStatus, zone, health, selectedClientId: selected ? String(selected.id) : '' };
  const activeFilterCount = [scope === 'regional' ? '' : scope, clientVisibility, portfolioStatus, locationStatus, zone, health].filter(Boolean).length;
  const applySaved = (saved: Record<string, string>) => {
    setScope(saved.scope || 'regional');
    onClientVisibilityChange(saved.clientVisibility || '');
    setPortfolioStatus(saved.portfolioStatus || '');
    setLocationStatus(saved.locationStatus || '');
    setZone(saved.zone || '');
    setHealth(saved.health || '');
    const selectedClient = clients.find((client) => client.id === Number(saved.selectedClientId));
    onSelect(selectedClient ?? null);
  };
  useEffect(() => {
    if (selected && !filtered.some((client) => client.id === selected.id)) onSelect(null);
  }, [filtered, onSelect, selected]);

  return (
    <div className="map-dashboard">
      <div className="kpi-strip" data-tour="map-kpis">
        <article className="kpi-card"><div className="kpi-icon green"><Users size={20} /></div><div><span>Clientes activos</span><strong>{number(activeClients.length)}</strong><small>{number(activeClients.filter((client) => client.portfolioStatus === 'confirmed').length)} confirmados en sucursal · {number(activeClients.filter((client) => client.portfolioStatus === 'review').length)} a revisar</small></div></article>
        <article className="kpi-card"><div className="kpi-icon ochre"><TrendingUp size={20} /></div><div><span>Facturación / kilos · 90 días</span><strong>{money(portfolio, true)}</strong><small>{number(portfolioKiloMetric.kilos, 2)} kg{portfolioKiloMetric.complete ? '' : ' · conversión parcial'}</small><small className={portfolioDelta >= 0 ? 'positive' : 'negative'}>{portfolioDelta >= 0 ? '↑' : '↓'} {Math.abs(portfolioDelta)}% en facturación vs. trimestre anterior</small></div></article>
        <article className="kpi-card"><div className="kpi-icon blue"><WalletCards size={20} /></div><div><span>Saldo neto en cuenta corriente</span><strong>{money(debt, true)}</strong><small>{number(activeClients.filter((client) => client.balance > 0).length)} clientes activos con saldo deudor</small></div></article>
        <article className="kpi-card"><div className="kpi-icon red"><AlertCircle size={20} /></div><div><span>Riesgo de cobranza alto</span><strong>{critical}</strong><small>puntaje 55 o superior · revisar antes de vender</small></div></article>
      </div>

      <SavedViewsBar viewKey="map" filters={savedFilters} onApply={applySaved} />

      <div className={`map-workspace ${selected ? 'with-panel' : ''}`}>
        <section className="map-stage">
          <div className="map-toolbar">
            <div className="map-heading"><div className="live-dot" /><span><strong>{number(filtered.length)}</strong> {filtered.length === 1 ? 'cliente visible' : 'clientes visibles'}</span></div>
            <MobileFilterSheet
              title="Filtros del mapa"
              description="Mostrá sólo los clientes relevantes sin reducir el espacio del mapa."
              activeCount={activeFilterCount}
              triggerClassName="map-filter-toggle"
            >
              <div className="filter-group" data-tour="map-filters">
                <MultiSelectFilter label="Alcance" value={scope} options={[{ value: 'regional', label: 'Mar del Plata y zona' }, { value: 'outside', label: 'Resto de Argentina' }]} onChange={(value) => { setScope(value); setZone(''); onSelect(null); }} />
                <MultiSelectFilter label="Estado comercial" value={clientVisibility} options={[{ value: 'active', label: 'Activos' }, { value: 'inactive', label: 'Inactivos' }]} onChange={(value) => { onClientVisibilityChange(value); setZone(''); onSelect(null); }} />
                <MultiSelectFilter label="Cartera Salice" value={portfolioStatus} options={[{ value: 'confirmed', label: 'Sucursal confirmada' }, { value: 'review', label: 'Revisar pertenencia' }]} onChange={(value) => { setPortfolioStatus(value); onSelect(null); }} />
                <MultiSelectFilter label="Ubicación" value={locationStatus} options={[{ value: 'original', label: 'Original del sistema' }, { value: 'corrected', label: 'Corregida automáticamente' }]} onChange={(value) => { setLocationStatus(value); onSelect(null); }} />
                <MultiSelectFilter label="Zona" value={zone} options={zoneOptions} onChange={(value) => { setZone(value); onSelect(null); }} />
                <MultiSelectFilter label="Riesgo" value={health} options={[{ value: 'healthy', label: 'Riesgo bajo' }, { value: 'attention', label: 'Atención' }, { value: 'critical', label: 'Riesgo alto' }]} onChange={(value) => { setHealth(value); onSelect(null); }} />
                <div className="map-mobile-saved-views"><SavedViewsBar viewKey="map" filters={savedFilters} onApply={applySaved} /></div>
              </div>
            </MobileFilterSheet>
          </div>
          <ClientMap clients={filtered} products={products} selectedId={selected?.id ?? null} onSelect={onSelect} />
          <details className="map-legend"><summary><MapPinned size={14} /> Leyenda del mapa <ChevronDown size={14} /></summary><div><span><i className="legend-dot depot" /> Depósito · Bradley 1450</span><span><i className="legend-dot healthy" /> Riesgo bajo</span><span><i className="legend-dot attention" /> Atención</span><span><i className="legend-dot critical" /> Riesgo alto</span><span><i className="legend-dot corrected" /> Ubicación aproximada corregida</span>{(decodeMultiFilter(clientVisibility).length === 0 || decodeMultiFilter(clientVisibility).includes('inactive')) && <span><i className="legend-dot inactive" /> Cliente inactivo</span>}<span>Los grupos se separan al acercar el mapa</span></div></details>
        </section>
        {selected && <ClientPanel client={selected} products={products} logistics={logistics} onClose={() => onSelect(null)} onPlanRoute={onPlanRoute} onNoteSaved={onNoteSaved} onExpand={onExpandClient} onOpenSeller={onOpenSeller} onOpenProduct={onOpenProduct} onOpenInvoice={onOpenInvoice} snapshotDate={snapshotDate} />}
      </div>
    </div>
  );
}
