import { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarClock, ChevronRight, Gauge, PackageSearch, Search, TrendingDown, TrendingUp, Users } from 'lucide-react';
import type { Product } from '../../shared/models';
import type { DemandDimension, DemandStability, DemandTrend, DemandWindowDays, ProductDemandPayload, ProductDemandRow } from '../../shared/product-demand';
import { compactDate, money, number, shortDate } from '../lib/format';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';
import { SingleSelectFilter } from './SingleSelectFilter';
import { SortButton } from './SortButton';

type DemandSort = 'label' | 'current' | 'previous' | 'variation' | 'buyers' | 'rotation' | 'stability' | 'lastSale';

const dimensionLabels: Record<DemandDimension, string> = { product: 'Producto', brand: 'Marca', family: 'Familia / rubro', group: 'Grupo' };
const trendLabels: Record<DemandTrend, string> = {
  accelerating: 'Aceleración', stable: 'Demanda estable', declining: 'Caída', new_observed: 'Nuevo observado', no_demand: 'Sin demanda', insufficient_history: 'Historia insuficiente',
};
const stabilityLabels: Record<DemandStability, string> = { stable: 'Estable', variable: 'Variable', intermittent: 'Intermitente', insufficient: 'Sin base' };

function variationLabel(row: ProductDemandRow) {
  if (row.trend === 'new_observed') return 'Primera venta observada';
  if (row.trend === 'no_demand') return 'Sin demanda actual';
  if (row.trend === 'insufficient_history') return 'Historia insuficiente';
  if (row.variationPercent == null) return 'Sin base anterior';
  return `${row.variationPercent > 0 ? '+' : ''}${row.variationPercent.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [trend, setTrend] = useState('');
  const [stability, setStability] = useState('');
  const [sort, setSort] = useState(emptySort<DemandSort>());
  const [page, setPage] = useState(1);
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/products/demand-analysis?window=${windowDays}&dimension=${dimension}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'No se pudo calcular demanda y rotación.');
        return response.json() as Promise<ProductDemandPayload>;
      })
      .then((result) => { setPayload(result); setPage(1); })
      .catch((cause) => { if (cause instanceof DOMException && cause.name === 'AbortError') return; setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [dimension, windowDays]);

  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const filtered = useMemo(() => (payload?.rows ?? [])
    .filter((row) => `${row.label} ${row.detail}`.toLocaleLowerCase('es').includes(normalizedQuery))
    .filter((row) => !trend || row.trend === trend)
    .filter((row) => !stability || row.stability === stability), [normalizedQuery, payload, stability, trend]);
  const sorted = useMemo(() => sortItems(filtered, sort, (row, key) => {
    if (key === 'label') return row.label;
    if (key === 'current') return row.current.units;
    if (key === 'previous') return row.previous.units;
    if (key === 'variation') return row.variationPercent;
    if (key === 'buyers') return row.current.buyers;
    if (key === 'rotation') return row.rotationPer30Days;
    if (key === 'stability') return row.stabilityCoefficient;
    return row.lastSaleAt || null;
  }), [filtered, sort]);
  const pageSize = 100;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const openEntity = (row: ProductDemandRow) => {
    if (dimension === 'product') { const product = productMap.get(row.id); if (product) onOpenProduct(product); }
    else if (dimension === 'brand') onOpenBrand(row.id);
    else if (dimension === 'family') onOpenFamily(row.id);
    else onOpenGroup(row.id);
  };

  return <div className="product-demand-workspace">
    <header className="data-card demand-hero">
      <div><span className="section-kicker"><Activity size={15} /> Historia comercial GESI</span><h2>Demanda y rotación</h2><p>Ventanas móviles equivalentes, compradores y estabilidad calculados con reglas visibles. No se usan pronósticos de IA.</p></div>
      <div className="demand-window-switch" aria-label="Ventana de análisis">{([30, 90, 180] as DemandWindowDays[]).map((days) => <button key={days} className={windowDays === days ? 'active' : ''} onClick={() => setWindowDays(days)}>{days} días</button>)}</div>
    </header>

    {payload && <>
      <section className="demand-kpis">
        <article><Gauge size={18} /><span>Unidades · {windowDays} días</span><strong>{number(payload.summary.current.units, 2)}</strong><small>{number(payload.summary.previous.units, 2)} en el período anterior</small></article>
        <article className={(payload.summary.variationPercent ?? 0) < 0 ? 'negative' : ''}>{(payload.summary.variationPercent ?? 0) < 0 ? <TrendingDown size={18} /> : <TrendingUp size={18} />}<span>Variación equivalente</span><strong>{payload.summary.variationPercent == null ? 'Sin base' : `${payload.summary.variationPercent > 0 ? '+' : ''}${payload.summary.variationPercent.toLocaleString('es-AR')}%`}</strong><small>{compactDate(payload.previousRange.from)} → {compactDate(payload.previousRange.through)}</small></article>
        <article><Users size={18} /><span>Compradores únicos</span><strong>{number(payload.summary.current.buyers)}</strong><small>No se suman compradores repetidos</small></article>
        <article><Activity size={18} /><span>Aceleración / caída</span><strong>{number(payload.summary.accelerating)} / {number(payload.summary.declining)}</strong><small>Umbral reproducible de ±20%</small></article>
        <article><PackageSearch size={18} /><span>Nuevos observados</span><strong>{number(payload.summary.newObserved)}</strong><small>{number(payload.summary.withoutDemand)} sin demanda actual</small></article>
      </section>

      <section className={`data-card demand-coverage-note ${payload.historyStatus !== 'complete' ? 'attention' : ''}`}>
        <CalendarClock size={17} /><div><strong>{payload.historyStatus === 'complete' ? 'Comparación histórica completa' : 'Cobertura histórica parcial'}</strong><span>Actual: {compactDate(payload.currentRange.from)} → {compactDate(payload.currentRange.through)} · Anterior: {compactDate(payload.previousRange.from)} → {compactDate(payload.previousRange.through)} · Base disponible desde {compactDate(payload.coverageFrom)}.</span></div>
      </section>
    </>}

    <section className="data-card demand-controls">
      <div className="demand-dimension-switch" aria-label="Dimensión de análisis">{(Object.keys(dimensionLabels) as DemandDimension[]).map((key) => <button key={key} className={dimension === key ? 'active' : ''} onClick={() => { setDimension(key); setPage(1); }}>{dimensionLabels[key]}</button>)}</div>
      <label className="inline-search"><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={`Buscar ${dimensionLabels[dimension].toLocaleLowerCase('es')}…`} /></label>
      <SingleSelectFilter label="Evolución" value={trend} options={Object.entries(trendLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => { setTrend(value); setPage(1); }} />
      <SingleSelectFilter label="Estabilidad" value={stability} options={Object.entries(stabilityLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => { setStability(value); setPage(1); }} />
    </section>

    {loading && <section className="data-card demand-state"><Activity className="loading-icon" size={26} /><strong>Calculando ventanas equivalentes…</strong></section>}
    {error && <section className="data-card demand-state error"><strong>{error}</strong><span>La última base válida permanece sin cambios.</span></section>}
    {!loading && !error && payload && <section className="data-card demand-table-card">
      <div className="demand-table-scroll"><table className="demand-table"><thead><tr>
        <th><SortButton label={dimensionLabels[dimension]} direction={sort.key === 'label' ? sort.direction : null} onClick={() => setSort((state) => cycleSort(state, 'label'))} /></th>
        <th><SortButton label={`U1 · ${windowDays}d`} direction={sort.key === 'current' ? sort.direction : null} onClick={() => setSort((state) => cycleSort(state, 'current'))} /></th>
        <th><SortButton label={`U1 anteriores`} direction={sort.key === 'previous' ? sort.direction : null} onClick={() => setSort((state) => cycleSort(state, 'previous'))} /></th>
        <th><SortButton label="Evolución" direction={sort.key === 'variation' ? sort.direction : null} onClick={() => setSort((state) => cycleSort(state, 'variation'))} /></th>
        <th><SortButton label="Compradores" direction={sort.key === 'buyers' ? sort.direction : null} onClick={() => setSort((state) => cycleSort(state, 'buyers'))} /></th>
        <th><SortButton label="Rotación / 30d" direction={sort.key === 'rotation' ? sort.direction : null} onClick={() => setSort((state) => cycleSort(state, 'rotation'))} /></th>
        <th><SortButton label="Estabilidad" direction={sort.key === 'stability' ? sort.direction : null} onClick={() => setSort((state) => cycleSort(state, 'stability'))} /></th>
        <th><SortButton label="Última venta" direction={sort.key === 'lastSale' ? sort.direction : null} onClick={() => setSort((state) => cycleSort(state, 'lastSale'))} /></th>
        <th>Lectura</th><th />
      </tr></thead><tbody>{visible.map((row) => <tr key={row.id} className={`demand-row ${row.trend}`}>
        <td><button className="demand-entity" onClick={() => openEntity(row)}><strong>{row.label}</strong><small>{row.detail}</small></button></td>
        <td title={`${number(row.current.units, 2)} U1 · ${money(row.current.sales)}`}><strong>{number(row.current.units, 2)}</strong><small>{money(row.current.sales, true)}</small></td>
        <td title={`${number(row.previous.units, 2)} U1 · ${money(row.previous.sales)}`}><strong>{number(row.previous.units, 2)}</strong><small>{number(row.previous.buyers)} compradores</small></td>
        <td><span className={`demand-trend-chip ${row.trend}`}>{variationLabel(row)}</span><small>{trendLabels[row.trend]}</small></td>
        <td><strong>{number(row.current.buyers)}</strong><small>{row.current.activeDays} {row.current.activeDays === 1 ? 'día' : 'días'} con venta</small></td>
        <td title={`${number(row.rotationPer30Days, 2)} U1 cada 30 días`}><strong>{number(row.rotationPer30Days, 2)}</strong><small>U1 normalizadas</small></td>
        <td><span className={`demand-stability-chip ${row.stability}`}>{stabilityLabels[row.stability]}</span><small>{row.stabilityCoefficient == null ? 'Sin coeficiente' : `CV ${(row.stabilityCoefficient * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}% · ${row.activeSubperiods}/3 tramos`}</small></td>
        <td><strong>{row.lastSaleAt ? shortDate(row.lastSaleAt) : 'Sin venta observable'}</strong><small>{row.daysSinceLastSale == null ? 'Sin fecha en la base' : row.daysSinceLastSale === 0 ? 'Hoy' : `Hace ${number(row.daysSinceLastSale)} días`}</small></td>
        <td><p>{row.explanation}</p></td><td><button className="icon-button" aria-label={`Abrir ${row.label}`} onClick={() => openEntity(row)}><ChevronRight size={15} /></button></td>
      </tr>)}</tbody></table></div>
      {!visible.length && <div className="demand-empty">No hay resultados para los filtros actuales.</div>}
      <footer className="table-pagination"><span>Mostrando {visible.length ? (currentPage - 1) * pageSize + 1 : 0}–{(currentPage - 1) * pageSize + visible.length} de {number(sorted.length)}</span><div><button className="button secondary" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><strong>{currentPage} / {pageCount}</strong><button className="button secondary" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Siguiente</button></div></footer>
    </section>}

    {payload && <details className="data-card demand-rules"><summary>Ver reglas exactas del análisis</summary><div>{Object.values(payload.rules).map((rule) => <p key={rule}>{rule}</p>)}</div></details>}
  </div>;
}
