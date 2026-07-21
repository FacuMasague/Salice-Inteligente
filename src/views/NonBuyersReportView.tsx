import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BarChart3, ChevronDown, ChevronRight, Database, Filter, PackageSearch, RefreshCw, Search, Store, Users, X } from 'lucide-react';
import type { Client, DashboardData, NonBuyerEntityRow, NonBuyerFilterKey, NonBuyerFilters, NonBuyerReportMeta, NonBuyerReportPayload, NonBuyerSellerRow } from '../../shared/models';
import { matchesMultiFilter } from '../../shared/multi-filter';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { SortButton } from '../components/SortButton';
import { clientPrimaryName, clientSecondaryName } from '../lib/client-name';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';

type ReportView = 'accounts' | 'brands';
type SortKey = 'id' | 'name' | 'seller' | 'isNonBuyer30' | 'daysSinceLastPurchase' | 'lastPurchaseDate' | 'averageKilos3Months' | 'averageSales3Months';

const EMPTY_FILTERS: NonBuyerFilters = { productGroup: '', category: '', brand: '', seller: '' };
const FILTER_LABELS: Record<NonBuyerFilterKey, string> = { productGroup: 'Grupo de artículos', category: 'Rubro', brand: 'Marca', seller: 'Vendedor' };
const number = (value: number, digits = 0) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(value);
const money = (value: number) => `$${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value)}`;
const percent = (value: number | null) => value == null ? 'Sin base' : `${number(value, 1)}%`;
const shortDate = (value: string | null) => value ? value.split('-').reverse().join('/') : 'Sin compra';
const defaultDetailSort = (view: ReportView) => view === 'brands'
  ? { key: 'daysSinceLastPurchase' as SortKey, direction: 'desc' as const }
  : emptySort<SortKey>();

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <MultiSelectFilter label={label} value={value} options={options} onChange={onChange} />;
}

function SellerBars({ rows, entityLabel }: { rows: NonBuyerSellerRow[]; entityLabel: string }) {
  const max = Math.max(1, ...rows.map((row) => row.nonBuyers30));
  return <div className="nonbuyer-seller-bars">{rows.map((row) => <article key={row.seller} tabIndex={0} aria-label={`${row.seller}: ${row.nonBuyers30} ${entityLabel} sin compra en 30 días, ${percent(row.rate)} de su universo`}><strong>{row.seller}</strong><div><span style={{ width: `${row.nonBuyers30 / max * 100}%` }} /></div><b>{number(row.nonBuyers30)}</b><aside><strong>{row.seller}</strong><span>{number(row.nonBuyers30)} sin compra</span><small>{number(row.universe90)} en universo 90d · {percent(row.rate)}</small></aside></article>)}</div>;
}

function StatusBadge({ row }: { row: NonBuyerEntityRow }) {
  if (row.isNonBuyer30) return <span className="nonbuyer-status attention">Sin compra 30d</span>;
  return <span className="nonbuyer-status current">Compró en 30d</span>;
}

function RecencyBadge({ days }: { days: number | null }) {
  const className = days == null ? 'unknown' : days <= 30 ? 'recent' : days <= 90 ? 'attention' : 'stale';
  return <span className={`nonbuyer-recency ${className}`}>{days == null ? '—' : number(days)}</span>;
}

function DetailTable({ rows, view, clients, onOpen, onOpenSeller, onOpenBrand }: { rows: NonBuyerEntityRow[]; view: ReportView; clients: DashboardData['clients']; onOpen: (client: Client) => void; onOpenSeller: (seller: string) => void; onOpenBrand: (brand: string) => void }) {
  const [sort, setSort] = useState(() => defaultDetailSort(view));
  const [visibleCount, setVisibleCount] = useState(100);
  useEffect(() => { setVisibleCount(100); }, [rows, view]);
  useEffect(() => { setSort(defaultDetailSort(view)); }, [view]);
  const sorted = sortItems(rows, sort, (row, key) => row[key]);
  const direction = (key: SortKey) => sort.key === key ? sort.direction : null;
  const change = (key: SortKey) => setSort((current) => cycleSort(current, key));
  const visible = sorted.slice(0, visibleCount);
  const clientMap = new Map(clients.map((client) => [client.id, client]));
  return <><div className={`nonbuyer-table ${view === 'brands' ? 'brand-mode' : ''}`}><header>{view === 'accounts' && <SortButton label="ID" direction={direction('id')} onClick={() => change('id')} />}<SortButton label={view === 'accounts' ? 'Cuenta' : 'Marca'} direction={direction('name')} onClick={() => change('name')} />{view === 'accounts' && <SortButton label="Vendedor" direction={direction('seller')} onClick={() => change('seller')} />}<SortButton label="Estado" direction={direction('isNonBuyer30')} onClick={() => change('isNonBuyer30')} /><SortButton label="Días" direction={direction('daysSinceLastPurchase')} onClick={() => change('daysSinceLastPurchase')} /><SortButton label="Última compra" direction={direction('lastPurchaseDate')} onClick={() => change('lastPurchaseDate')} /><SortButton label="Prom. kg · 3 meses" direction={direction('averageKilos3Months')} onClick={() => change('averageKilos3Months')} /><SortButton label="Prom. ventas · 3 meses" direction={direction('averageSales3Months')} onClick={() => change('averageSales3Months')} /></header>{visible.map((row) => { const client = row.clientId == null ? null : clientMap.get(row.clientId); return <article key={row.id} className={view === 'accounts' && client ? 'clickable' : ''} onClick={() => { if (view === 'accounts' && client) onOpen(client); }}>{view === 'accounts' && <span className="nonbuyer-id">{row.clientId}</span>}{view === 'brands' ? <button className="entity-link" onClick={() => onOpenBrand(row.name)}>{row.name}</button> : <strong>{client ? clientPrimaryName(client) : row.name}{client && clientSecondaryName(client) && <small className="client-trade-name">{clientSecondaryName(client)}</small>}</strong>}{view === 'accounts' && <button className="entity-link" onClick={(event) => { event.stopPropagation(); onOpenSeller(row.seller); }}>{row.seller}<ChevronRight size={12} /></button>}<StatusBadge row={row} /><RecencyBadge days={row.daysSinceLastPurchase} /><span>{shortDate(row.lastPurchaseDate)}</span><span>{number(row.averageKilos3Months, 1)} kg</span><span>{money(row.averageSales3Months)}</span></article>; })}</div>{visible.length < sorted.length && <button className="button secondary nonbuyer-more-rows" onClick={() => setVisibleCount((count) => count + 100)}>Mostrar 100 filas más</button>}</>;
}

export function NonBuyersReportView({ data, onOpen, onOpenSeller, onOpenBrand }: { data: DashboardData; onOpen: (client: Client) => void; onOpenSeller: (seller: string) => void; onOpenBrand: (brand: string) => void }) {
  const [meta, setMeta] = useState<NonBuyerReportMeta | null>(null);
  const [report, setReport] = useState<NonBuyerReportPayload | null>(null);
  const [filters, setFilters] = useState<NonBuyerFilters>(EMPTY_FILTERS);
  const [view, setView] = useState<ReportView>('accounts');
  const [statusMode, setStatusMode] = useState('');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { fetch('/api/reports/non-buyers/meta').then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'No se pudo abrir el modelo'); return payload as NonBuyerReportMeta; }).then(setMeta).catch((cause: Error) => { setError(cause.message); setLoading(false); }); }, []);
  useEffect(() => { if (!meta) return; const controller = new AbortController(); const parameters = new URLSearchParams(); for (const [key, value] of Object.entries(filters)) if (value) parameters.set(key, value); setLoading(true); setError(''); fetch(`/api/reports/non-buyers?${parameters}`, { signal: controller.signal }).then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'No se pudo calcular el reporte'); return payload as NonBuyerReportPayload; }).then(setReport).catch((cause: Error) => { if (cause.name !== 'AbortError') setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [filters, meta]);

  const activeFilterCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);
  const sourceRows = view === 'accounts' ? report?.accounts ?? [] : report?.brands ?? [];
  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const filteredRows = useMemo(() => sourceRows.filter((row) => {
    if (!matchesMultiFilter(row.isNonBuyer30 ? 'non-buyers' : 'buyers', statusMode)) return false;
    if (!normalizedQuery) return true;
    return `${row.id} ${row.name} ${row.seller}`.toLocaleLowerCase('es').includes(normalizedQuery);
  }), [normalizedQuery, sourceRows, statusMode]);
  const update = (key: NonBuyerFilterKey, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const selectView = (next: ReportView) => { setView(next); setStatusMode(''); setQuery(''); };

  if (!meta && loading) return <div className="page-view nonbuyer-page"><div className="spt-loading"><RefreshCw className="spin" size={24} /><strong>Preparando cuentas no compradoras</strong><span>Reconstruyendo ventanas de 30, 90 y 180 días desde GESI…</span></div></div>;
  if (!meta || (!report && error)) return <div className="page-view nonbuyer-page"><div className="spt-loading error"><Database size={24} /><strong>No pudimos abrir el reporte</strong><span>{error}</span></div></div>;
  if (!report) return <div className="page-view nonbuyer-page"><div className="spt-loading"><RefreshCw className="spin" size={24} /><strong>Calculando cuentas no compradoras</strong></div></div>;

  const summary = view === 'accounts' ? report.accountsSummary : report.brandsSummary;
  const sellers = view === 'accounts' ? report.accountSellers : report.brandSellers;
  const entityPlural = view === 'accounts' ? 'cuentas' : 'marcas';
  const savedFilters = { ...filters, view, statusMode, query };
  const applySaved = (saved: Record<string, string>) => {
    setFilters({ productGroup: saved.productGroup || '', category: saved.category || '', brand: saved.brand || '', seller: saved.seller || '' });
    setView(saved.view === 'brands' ? 'brands' : 'accounts');
    setStatusMode(saved.statusMode || '');
    setQuery(saved.query ?? '');
  };
  return <div className="page-view nonbuyer-page">
    <section className="data-card nonbuyer-filter-card" data-tour="non-buyers-overview"><div className="nonbuyer-filter-heading"><div><span className="section-kicker"><PackageSearch size={14} /> Cuentas no compradoras</span><h2>Recuperación comercial · corte al {shortDate(report.sourceMaxDate)}</h2><p>Detecta cuentas y marcas con actividad en 180 días que no volvieron a comprar durante los últimos 30.</p></div><div className="nonbuyer-view-switch" role="tablist" aria-label="Vista del reporte"><button role="tab" aria-selected={view === 'accounts'} className={view === 'accounts' ? 'active' : ''} onClick={() => selectView('accounts')}><Users size={16} /> Cuentas</button><button role="tab" aria-selected={view === 'brands'} className={view === 'brands' ? 'active' : ''} onClick={() => selectView('brands')}><Store size={16} /> Marcas</button></div></div><div className="nonbuyer-filter-controls"><SelectFilter label={FILTER_LABELS.seller} value={filters.seller} options={meta.options.seller} onChange={(value) => update('seller', value)} /><SelectFilter label={FILTER_LABELS.productGroup} value={filters.productGroup} options={meta.options.productGroup} onChange={(value) => update('productGroup', value)} /><button className={`button secondary nonbuyer-more-button ${activeFilterCount ? 'active' : ''}`} onClick={() => setExpanded((value) => !value)}><Filter size={14} /> Más filtros {activeFilterCount ? `(${activeFilterCount})` : ''}<ChevronDown size={13} /></button></div>{expanded && <div className="nonbuyer-filter-expanded"><SelectFilter label={FILTER_LABELS.category} value={filters.category} options={meta.options.category} onChange={(value) => update('category', value)} /><SelectFilter label={FILTER_LABELS.brand} value={filters.brand} options={meta.options.brand} onChange={(value) => update('brand', value)} /><label className="nonbuyer-unavailable-filter"><span>Acuerdos comerciales</span><div>No disponible en API GESI</div></label><button className="button secondary" onClick={() => setFilters(EMPTY_FILTERS)}><X size={14} /> Restablecer</button></div>}<SavedViewsBar viewKey="non-buyers" filters={savedFilters} onApply={applySaved} />{loading && <div className="nutripet-filter-loading"><RefreshCw className="spin" size={13} /> Recalculando</div>}</section>

    <section className="nonbuyer-period-note"><AlertCircle size={17} /><div><strong>Ventanas móviles sobre la foto de GESI</strong><span>Sin compra: {shortDate(report.windows.from30)}–{shortDate(report.windows.through)} · Universo: ventas positivas desde {shortDate(report.windows.from180)} · Promedios: {shortDate(report.windows.averageFrom)}–{shortDate(report.windows.averageThrough)}.</span></div></section>

    <div className="nonbuyer-kpis"><article><span className="nonbuyer-kpi-icon ochre"><PackageSearch size={20} /></span><div><small>{view === 'accounts' ? 'Cuentas' : 'Marcas'} sin compra · 30d</small><strong>{number(summary.nonBuyers30)}</strong><em>actividad positiva en los 180 días previos</em></div></article><article><span className="nonbuyer-kpi-icon blue"><BarChart3 size={20} /></span><div><small>% sin compra</small><strong>{percent(summary.rate)}</strong><em>sobre universo comprador de 90 días</em></div></article><article><span className="nonbuyer-kpi-icon green"><Users size={20} /></span><div><small>Universo · 90d</small><strong>{number(summary.universe90)}</strong><em>{number(summary.universe180)} con compra en 180 días</em></div></article><article><span className="nonbuyer-kpi-icon green"><Store size={20} /></span><div><small>Compraron · 30d</small><strong>{number(summary.buyers30)}</strong><em>importe neto positivo en la ventana</em></div></article></div>

    <div className="nonbuyer-main-grid"><section className="data-card nonbuyer-seller-card"><div className="data-card-header"><div><span className="section-kicker"><BarChart3 size={14} /> Responsables</span><h2>{view === 'accounts' ? 'Cuentas' : 'Marcas'} sin compra por vendedor</h2><p>Pasá el cursor o enfocá una barra para ver universo y tasa.</p></div></div><SellerBars rows={sellers} entityLabel={entityPlural} /></section><section className="data-card nonbuyer-definition-card"><div className="data-card-header"><div><span className="section-kicker"><Database size={14} /> Definición</span><h2>Cómo se calcula</h2></div></div><ol><li><b>Universo 180d</b><span>{entityPlural} con venta neta positiva desde {shortDate(report.windows.from180)}.</span></li><li><b>Sin compra 30d</b><span>pertenece al universo, pero su venta neta no fue positiva desde {shortDate(report.windows.from30)}.</span></li><li><b>Tasa</b><span>sin compra 30d dividido por el universo comprador de 90 días.</span></li></ol><p>Las notas de crédito reducen la venta neta, como en el modelo del Power BI.</p></section></div>

    <section className="data-card nonbuyer-detail-card"><div className="data-card-header nonbuyer-detail-header"><div><span className="section-kicker"><Users size={14} /> Detalle operativo</span><h2>{view === 'accounts' ? 'Cuentas del universo de 180 días' : 'Marcas del universo de 180 días'}</h2><p>Promedios mensuales sobre los tres últimos meses calendario completos.</p></div><span className="count-badge">{number(filteredRows.length)} de {number(sourceRows.length)}</span></div><div className="nonbuyer-table-tools"><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={view === 'accounts' ? 'Buscar ID, cuenta o vendedor' : 'Buscar marca'} /></label><MultiSelectFilter label="Estado de compra" value={statusMode} options={[{ value: 'non-buyers', label: 'Sin compra 30d' }, { value: 'buyers', label: 'Compraron 30d' }]} onChange={setStatusMode} /></div><DetailTable rows={filteredRows} view={view} clients={data.clients} onOpen={onOpen} onOpenSeller={onOpenSeller} onOpenBrand={onOpenBrand} /></section>

    <section className="nutripet-source-note"><Database size={16} /><div><strong>{meta.sourceSystem}</strong><span>{number(meta.rowCount)} movimientos elegibles · cobertura {meta.coverageFrom} a {meta.maxDate} · empresa 3 / sucursal 3 · clientes activos · excluye Consumidor Final, Drovet, Kualcos, POP, Promociones, Administración y Carolina.{view === 'brands' ? ` También excluye ${meta.universe.excludedBrands.filter(Boolean).join(', ')}.` : ''} {meta.agreementsNote} El PBIX se usa sólo como referencia funcional y de conciliación.</span></div></section>
  </div>;
}
