import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  Gauge,
  PackageSearch,
  RotateCcw,
  Search,
} from 'lucide-react';
import type { Product } from '../../shared/models';
import type { AiOperationalBrief, AiStoredArtifact } from '../../shared/ai';
import type {
  DemandDimension,
  DemandStability,
  DemandTrend,
  DemandWindowDays,
  ProductDemandPayload,
  ProductDemandRow,
} from '../../shared/product-demand';
import { compactDate, money, number, shortDate } from '../lib/format';
import { MobileFilterSheet } from './MobileFilterSheet';
import { MultiSelectFilter } from './MultiSelectFilter';
import { SingleSelectFilter } from './SingleSelectFilter';
import { AiOperationalBriefCard } from './AiInsights';

type DemandOrder = 'priority' | 'units' | 'variation-up' | 'variation-down' | 'buyers' | 'rotation' | 'recent' | 'label';

const dimensionLabels: Record<DemandDimension, string> = {
  product: 'Producto',
  brand: 'Marca',
  family: 'Familia / rubro',
  group: 'Grupo',
};

const trendLabels: Record<DemandTrend, string> = {
  accelerating: 'En crecimiento',
  stable: 'Sin cambio relevante',
  declining: 'En caída',
  new_observed: 'Primera venta observada',
  no_demand: 'Sin ventas recientes',
  insufficient_history: 'Sin historia comparable',
};

const stabilityLabels: Record<DemandStability, string> = {
  stable: 'Regular',
  variable: 'Variable',
  intermittent: 'Intermitente',
  insufficient: 'Sin base suficiente',
};

const orderLabels: Record<DemandOrder, string> = {
  priority: 'Señales más marcadas',
  units: 'Más unidades vendidas',
  'variation-up': 'Mayor crecimiento',
  'variation-down': 'Mayor caída',
  buyers: 'Más compradores',
  rotation: 'Mayor rotación',
  recent: 'Venta más reciente',
  label: 'Nombre A–Z',
};

function signedPercent(value: number | null, digits = 1) {
  if (value == null) return 'Sin base';
  return `${value > 0 ? '+' : ''}${number(value, digits)}%`;
}

function variationLabel(row: ProductDemandRow) {
  if (row.trend === 'new_observed') return 'Primera venta';
  if (row.trend === 'no_demand') return 'Sin ventas';
  if (row.trend === 'insufficient_history') return 'Sin comparación';
  return signedPercent(row.variationPercent);
}

function sortDemandRows(rows: ProductDemandRow[], order: DemandOrder) {
  if (order === 'priority') return rows;
  return [...rows].sort((left, right) => {
    if (order === 'label') return left.label.localeCompare(right.label, 'es');
    if (order === 'units') return right.current.units - left.current.units || left.label.localeCompare(right.label, 'es');
    if (order === 'variation-up') return (right.variationPercent ?? Number.NEGATIVE_INFINITY) - (left.variationPercent ?? Number.NEGATIVE_INFINITY) || left.label.localeCompare(right.label, 'es');
    if (order === 'variation-down') return (left.variationPercent ?? Number.POSITIVE_INFINITY) - (right.variationPercent ?? Number.POSITIVE_INFINITY) || left.label.localeCompare(right.label, 'es');
    if (order === 'buyers') return right.current.buyers - left.current.buyers || left.label.localeCompare(right.label, 'es');
    if (order === 'rotation') return right.rotationPer30Days - left.rotationPer30Days || left.label.localeCompare(right.label, 'es');
    return right.lastSaleAt.localeCompare(left.lastSaleAt) || left.label.localeCompare(right.label, 'es');
  });
}

function DemandComparison({ row }: { row: ProductDemandRow }) {
  const maximum = Math.max(row.current.units, row.previous.units, 1);
  const currentWidth = row.current.units > 0 ? Math.max(3, row.current.units / maximum * 100) : 0;
  const previousWidth = row.previous.units > 0 ? Math.max(3, row.previous.units / maximum * 100) : 0;
  return <div className="demand-card-comparison" aria-label={`Unidades actuales ${number(row.current.units, 2)}; período anterior ${number(row.previous.units, 2)}`}>
    <div><span>Período actual</span><strong>{number(row.current.units, 2)} U1</strong><i><b style={{ width: `${currentWidth}%` }} /></i></div>
    <div className="previous"><span>Período anterior</span><strong>{number(row.previous.units, 2)} U1</strong><i><b style={{ width: `${previousWidth}%` }} /></i></div>
  </div>;
}

export function ProductDemandAnalysis({ products, onOpenProduct, onOpenBrand, onOpenFamily, onOpenGroup }: {
  products: Product[];
  onOpenProduct: (product: Product) => void;
  onOpenBrand: (brand: string) => void;
  onOpenFamily: (family: string) => void;
  onOpenGroup: (group: string) => void;
}) {
  const [windowDays, setWindowDays] = useState<DemandWindowDays>(90);
  const [dimension, setDimension] = useState<DemandDimension>('product');
  const [payload, setPayload] = useState<ProductDemandPayload | null>(null);
  const [aiBrief, setAiBrief] = useState<AiStoredArtifact<AiOperationalBrief> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [family, setFamily] = useState('');
  const [group, setGroup] = useState('');
  const [line, setLine] = useState('');
  const [availability, setAvailability] = useState('all');
  const [masterStatus, setMasterStatus] = useState('');
  const [trend, setTrend] = useState('');
  const [stability, setStability] = useState('');
  const [order, setOrder] = useState<DemandOrder>('priority');
  const [page, setPage] = useState(1);
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setAppliedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const parameters = new URLSearchParams({
      window: String(windowDays), dimension, search: appliedQuery, brand, family, group, line,
      availability, masterStatus, trend, stability,
    });
    fetch(`/api/products/demand-analysis?${parameters}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'No se pudo calcular demanda y rotación.');
        return response.json() as Promise<ProductDemandPayload>;
      })
      .then((result) => { setPayload(result); setPage(1); })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [appliedQuery, availability, brand, dimension, family, group, line, masterStatus, stability, trend, windowDays]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/ai/product-demand-brief', { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => setAiBrief(result?.artifact ?? null))
      .catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) setAiBrief(null);
      });
    return () => controller.abort();
  }, []);

  const sorted = useMemo(() => sortDemandRows(payload?.rows ?? [], order), [order, payload]);
  const pageSize = 24;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeFilterCount = [brand, family, group, line, masterStatus, trend, stability].filter(Boolean).length
    + (availability === 'all' ? 0 : 1)
    + Number(Boolean(appliedQuery));
  const comparisonLabel = payload?.historyStatus === 'complete' ? 'Períodos equivalentes' : 'Comparación parcial';

  const clearFilters = () => {
    setQuery(''); setAppliedQuery(''); setBrand(''); setFamily(''); setGroup(''); setLine('');
    setAvailability('all'); setMasterStatus(''); setTrend(''); setStability(''); setPage(1);
  };

  const openEntity = (row: ProductDemandRow) => {
    if (dimension === 'product') {
      const product = productMap.get(row.id);
      if (product) onOpenProduct(product);
    } else if (dimension === 'brand') onOpenBrand(row.id);
    else if (dimension === 'family') onOpenFamily(row.id);
    else onOpenGroup(row.id);
  };

  return <div className="product-demand-workspace">
    <header className="data-card demand-hero analysis-hero-v211">
      <div>
        <span className="section-kicker"><Activity size={15} /> Movimiento de productos</span>
        <h2>Demanda y rotación</h2>
        <p>Compará ventas reales contra el período anterior, detectá cambios y abrí el producto o grupo que necesites revisar.</p>
      </div>
      <div className="analysis-period-control"><span>Período a comparar</span><div className="demand-window-switch" aria-label="Período de análisis">
        {([30, 90, 180] as DemandWindowDays[]).map((days) => <button type="button" key={days} className={windowDays === days ? 'active' : ''} aria-pressed={windowDays === days} onClick={() => setWindowDays(days)}>{days} días</button>)}
      </div></div>
    </header>

    {payload && <>
      <section className="analysis-kpi-grid demand-kpis-v211" aria-label="Resumen de demanda">
        <article><span>Unidades vendidas</span><strong>{number(payload.summary.current.units, 2)} U1</strong><small>{money(payload.summary.current.sales, true)} facturados en {windowDays} días</small></article>
        <article className={(payload.summary.variationPercent ?? 0) < 0 ? 'down' : 'up'}><span>Cambio frente al período anterior</span><strong>{signedPercent(payload.summary.variationPercent)}</strong><small>Anterior: {number(payload.summary.previous.units, 2)} U1</small></article>
        <article><span>Kilos estimados</span><strong>{number(payload.summary.current.kilos, 2)} kg</strong><small>{payload.summary.kiloVariationPercent == null ? 'Sin base comparable' : `${signedPercent(payload.summary.kiloVariationPercent)} frente al período anterior`}</small></article>
        <article><span>Compradores únicos</span><strong>{number(payload.summary.current.buyers)}</strong><small>{number(payload.summary.current.activeDays)} días con ventas en el período</small></article>
      </section>

      <section className="data-card demand-signal-panel">
        <header><div><strong>Señales para revisar</strong><span>Elegí una señal para usarla como filtro. Los límites son siempre los mismos.</span></div>{trend && <button type="button" onClick={() => setTrend('')}>Ver todas</button>}</header>
        <div role="group" aria-label="Filtrar por evolución">
          <button type="button" className={trend === 'accelerating' ? 'active' : ''} aria-pressed={trend === 'accelerating'} onClick={() => setTrend((current) => current === 'accelerating' ? '' : 'accelerating')}><ArrowUpRight size={17} /><span><strong>{number(payload.summary.accelerating)}</strong> en crecimiento</span><small>Subieron 20% o más</small></button>
          <button type="button" className={trend === 'declining' ? 'active' : ''} aria-pressed={trend === 'declining'} onClick={() => setTrend((current) => current === 'declining' ? '' : 'declining')}><ArrowDownRight size={17} /><span><strong>{number(payload.summary.declining)}</strong> en caída</span><small>Bajaron 20% o más</small></button>
          <button type="button" className={trend === 'new_observed' ? 'active' : ''} aria-pressed={trend === 'new_observed'} onClick={() => setTrend((current) => current === 'new_observed' ? '' : 'new_observed')}><PackageSearch size={17} /><span><strong>{number(payload.summary.newObserved)}</strong> primeras ventas</span><small>Sin ventas en el período previo</small></button>
          <button type="button" className={trend === 'no_demand' ? 'active' : ''} aria-pressed={trend === 'no_demand'} onClick={() => setTrend((current) => current === 'no_demand' ? '' : 'no_demand')}><Activity size={17} /><span><strong>{number(payload.summary.withoutDemand)}</strong> sin ventas</span><small>Con historia suficiente</small></button>
        </div>
      </section>

      <section className={`data-card analysis-coverage-note ${payload.historyStatus !== 'complete' ? 'attention' : ''}`}><CalendarClock size={18} /><div><strong>{comparisonLabel}</strong><span>Actual: {compactDate(payload.currentRange.from)} al {compactDate(payload.currentRange.through)} · Anterior: {compactDate(payload.previousRange.from)} al {compactDate(payload.previousRange.through)}.</span></div></section>
      {payload.summary.productsWithoutKilos > 0 && <section className="data-card analysis-coverage-note attention"><PackageSearch size={18} /><div><strong>Los kilos tienen cobertura parcial</strong><span>{number(payload.summary.productsWithoutKilos)} productos vendidos no tienen una presentación convertible. Sus unidades y ventas sí están incluidas.</span></div></section>}
    </>}

    <AiOperationalBriefCard artifact={windowDays === 90 && dimension === 'product' && !appliedQuery && !brand && !family && !group && !line && availability === 'all' && !masterStatus && !trend && !stability ? aiBrief : null} eyebrow="Interpretación general · 90 días" />

    <section className="data-card analysis-controls-v211 demand-controls-v211">
      <div className="analysis-control-block dimension-control"><span>Analizar por</span><div className="demand-dimension-switch" aria-label="Agrupar resultados por">
        {(Object.keys(dimensionLabels) as DemandDimension[]).map((key) => <button type="button" key={key} className={dimension === key ? 'active' : ''} aria-pressed={dimension === key} onClick={() => { setDimension(key); setPage(1); }}>{dimensionLabels[key]}</button>)}
      </div></div>
      <label className="analysis-search-v211"><span>Buscar en los resultados</span><div><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={`Buscar por ${dimensionLabels[dimension].toLocaleLowerCase('es')}…`} /></div></label>
      <label className="analysis-sort-v211"><span>Ordenar por</span><select value={order} onChange={(event) => { setOrder(event.target.value as DemandOrder); setPage(1); }}>{(Object.entries(orderLabels) as [DemandOrder, string][]).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <MobileFilterSheet title="Filtrar demanda y rotación" description="Acotá el análisis por clasificación, disponibilidad o comportamiento." activeCount={activeFilterCount - Number(Boolean(appliedQuery))} applyLabel={`Ver ${number(sorted.length)} resultados`} className="analysis-filter-sheet-v211">
        <MultiSelectFilter label="Marca" value={brand} options={payload?.options.brands ?? []} onChange={(value) => { setBrand(value); setPage(1); }} />
        <MultiSelectFilter label="Rubro" value={family} options={payload?.options.families ?? []} onChange={(value) => { setFamily(value); setPage(1); }} />
        <MultiSelectFilter label="Grupo" value={group} options={payload?.options.groups ?? []} onChange={(value) => { setGroup(value); setPage(1); }} />
        <MultiSelectFilter label="Línea" value={line} options={payload?.options.lines ?? []} onChange={(value) => { setLine(value); setPage(1); }} />
        <SingleSelectFilter label="Disponibilidad" value={availability} options={[{ value: 'all', label: 'Todos' }, { value: 'stock', label: 'Con stock' }, { value: 'commercial', label: 'Comercializables' }]} onChange={(value) => { setAvailability(value); setPage(1); }} />
        <MultiSelectFilter label="Estado del producto" value={masterStatus} options={[{ value: 'active', label: 'Activo' }, { value: 'inactive', label: 'Inactivo' }, { value: 'unknown', label: 'Sin definir' }]} onChange={(value) => { setMasterStatus(value); setPage(1); }} />
        <MultiSelectFilter label="Evolución" value={trend} options={Object.entries(trendLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => { setTrend(value); setPage(1); }} />
        <MultiSelectFilter label="Regularidad" value={stability} options={Object.entries(stabilityLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => { setStability(value); setPage(1); }} />
      </MobileFilterSheet>
      {activeFilterCount > 0 && <button type="button" className="analysis-clear-v211" onClick={clearFilters}><RotateCcw size={14} /> Limpiar</button>}
      {loading && payload && <span className="analysis-refreshing-v211" role="status"><Activity className="loading-icon" size={14} /> Actualizando…</span>}
    </section>

    {loading && !payload && <section className="data-card analysis-state-v211"><Activity className="loading-icon" size={26} /><strong>Calculando períodos comparables…</strong><span>Las cifras provienen de los movimientos ya actualizados.</span></section>}
    {error && <section className="data-card analysis-state-v211 error"><strong>{error}</strong><span>La base comercial y los cálculos previos no fueron modificados.</span></section>}
    {!error && payload && <section className="data-card demand-results-v211">
      <header className="analysis-results-header-v211"><div><span>Resultados</span><h3>{number(sorted.length)} {dimensionLabels[dimension].toLocaleLowerCase('es')}{sorted.length === 1 ? '' : 's'}</h3><p>Actual contra los {windowDays} días inmediatamente anteriores. U1 es la unidad comercial del producto.</p></div><span className="analysis-page-label-v211">Página {currentPage} de {pageCount}</span></header>
      <div className="demand-card-list-v211">
        {visible.map((row) => <article key={row.id} className={`demand-result-card-v211 ${row.trend}`}>
          <header><button type="button" className="demand-card-entity-v211" onClick={() => openEntity(row)}><span><strong>{row.label}</strong><small>{row.detail}</small></span><ChevronRight size={18} /></button><span className={`analysis-status-chip-v211 ${row.trend}`}>{trendLabels[row.trend]}</span></header>
          <div className="demand-card-main-v211"><DemandComparison row={row} /><div className="demand-card-change-v211"><span>Evolución</span><strong>{variationLabel(row)}</strong><small>{row.trend === 'stable' ? 'Dentro del margen de ±20%' : trendLabels[row.trend]}</small></div></div>
          <dl className="analysis-metric-list-v211">
            <div><dt>Kilos estimados</dt><dd>{row.kiloDataStatus !== 'unavailable' ? `${number(row.current.kilos, 2)} kg` : 'Sin conversión'}</dd></div>
            <div><dt>Compradores</dt><dd>{number(row.current.buyers)}</dd></div>
            <div><dt>Rotación cada 30 días</dt><dd>{number(row.rotationPer30Days, 2)} U1</dd></div>
            <div><dt>Última venta</dt><dd>{row.lastSaleAt ? shortDate(row.lastSaleAt) : 'No observada'}</dd></div>
          </dl>
          <details className="analysis-card-details-v211"><summary>Cómo leer este resultado <ArrowRight size={14} /></summary><div><p>{row.explanation}</p><dl>
            <div><dt>Facturación actual</dt><dd>{money(row.current.sales)}</dd></div>
            <div><dt>Facturación anterior</dt><dd>{money(row.previous.sales)}</dd></div>
            <div><dt>Regularidad</dt><dd>{stabilityLabels[row.stability]}{row.stabilityCoefficient == null ? '' : ` · CV ${number(row.stabilityCoefficient * 100, 1)}%`}</dd></div>
            <div><dt>Días con venta</dt><dd>{number(row.current.activeDays)} de {windowDays}</dd></div>
          </dl></div></details>
        </article>)}
      </div>
      {!visible.length && <div className="analysis-empty-v211"><PackageSearch size={28} /><strong>No hay resultados con estos criterios</strong><span>Probá quitar uno o más filtros para ampliar el universo.</span><button type="button" className="button secondary" onClick={clearFilters}><RotateCcw size={15} /> Limpiar filtros</button></div>}
      {visible.length > 0 && <footer className="table-pagination analysis-pagination-v211"><span>Mostrando {(currentPage - 1) * pageSize + 1}–{(currentPage - 1) * pageSize + visible.length} de {number(sorted.length)}</span><div><button type="button" className="button secondary" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><strong>{currentPage} / {pageCount}</strong><button type="button" className="button secondary" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Siguiente</button></div></footer>}
    </section>}

    {payload && <details className="data-card analysis-method-v211"><summary><Gauge size={16} /><span><strong>Metodología y reglas del cálculo</strong><small>Detalle técnico para auditoría</small></span><ChevronRight size={16} /></summary><div>{Object.values(payload.rules).map((rule) => <p key={rule}>{rule.replaceAll('GESI', 'la fuente comercial')}</p>)}<p>Cobertura disponible desde {compactDate(payload.coverageFrom)}.</p></div></details>}
  </div>;
}
