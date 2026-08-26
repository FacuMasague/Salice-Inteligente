import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  History,
  Info,
  PackageSearch,
  RotateCcw,
  Scale,
  Search,
} from 'lucide-react';
import type { Product } from '../../shared/models';
import type {
  PriceComparison,
  PricePerKgStatus,
  PriceWindowDays,
  ProductPriceAlert,
  ProductPriceAnalysisPayload,
  ProductPriceDetailPayload,
  ProductPriceRow,
} from '../../shared/product-prices';
import { readApiJson } from '../lib/api-response';
import { compactDate, money, number, shortDate } from '../lib/format';
import { MobileFilterSheet } from './MobileFilterSheet';
import { SingleSelectFilter } from './SingleSelectFilter';

type PriceOrder = 'priority' | 'reference-change' | 'effective-change' | 'reference' | 'effective' | 'recent' | 'label';

const alertLabels: Record<ProductPriceAlert, string> = {
  strong_reference_change: 'Cambio fuerte en referencia',
  strong_effective_change: 'Cambio fuerte en precio efectivo',
  ambiguous_presentation: 'Presentación no convertible',
  none: 'Sin alertas',
};

const priceKgLabels: Record<PricePerKgStatus, string> = {
  reliable: 'Precio por kilo disponible',
  ambiguous_presentation: 'Presentación no convertible',
  not_applicable: 'No corresponde comparar por kilo',
  no_reference: 'Sin precio de referencia',
};

const orderLabels: Record<PriceOrder, string> = {
  priority: 'Prioridad de revisión',
  'reference-change': 'Mayor cambio de referencia',
  'effective-change': 'Mayor cambio efectivo',
  reference: 'Mayor precio de referencia',
  effective: 'Mayor precio efectivo',
  recent: 'Cambio más reciente',
  label: 'Nombre A–Z',
};

function signedPercent(value: number | null) {
  if (value == null) return 'Sin base';
  return `${value > 0 ? '+' : ''}${number(value, 1)}%`;
}

function variation(comparison: PriceComparison) {
  if (comparison.status === 'new_observed') return 'Primera observación';
  if (comparison.status === 'unavailable') return 'Sin precio actual';
  return signedPercent(comparison.percentChange);
}

function variationClass(comparison: PriceComparison) {
  return comparison.status.includes('increase') ? 'increase' : comparison.status.includes('decrease') ? 'decrease' : comparison.status;
}

function sortPriceRows(rows: ProductPriceRow[], order: PriceOrder) {
  if (order === 'priority') return rows;
  const absoluteChange = (value: number | null) => value == null ? -1 : Math.abs(value);
  return [...rows].sort((left, right) => {
    if (order === 'label') return left.name.localeCompare(right.name, 'es');
    if (order === 'reference-change') return absoluteChange(right.reference.percentChange) - absoluteChange(left.reference.percentChange) || left.name.localeCompare(right.name, 'es');
    if (order === 'effective-change') return absoluteChange(right.effective.percentChange) - absoluteChange(left.effective.percentChange) || left.name.localeCompare(right.name, 'es');
    if (order === 'reference') return (right.reference.current ?? -1) - (left.reference.current ?? -1) || left.name.localeCompare(right.name, 'es');
    if (order === 'effective') return (right.effective.current ?? -1) - (left.effective.current ?? -1) || left.name.localeCompare(right.name, 'es');
    return (right.lastReferenceChangeAt ?? '').localeCompare(left.lastReferenceChangeAt ?? '') || left.name.localeCompare(right.name, 'es');
  });
}

function friendlyPricePerKgExplanation(status: PricePerKgStatus) {
  if (status === 'reliable') return 'El contenido neto permite comparar importes por kilo.';
  if (status === 'ambiguous_presentation') return 'La presentación no permite convertir la unidad comercial a kilos con suficiente confianza.';
  if (status === 'not_applicable') return 'Para esta presentación se conserva el precio por unidad comercial.';
  return 'No hay un precio de referencia positivo para calcularlo.';
}

function friendlyWarning(warning: string) {
  return warning.replace('GESI no entregó un precio de referencia positivo.', 'No hay un precio de referencia positivo disponible.');
}

function monthLabel(period: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return period;
  return new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    .format(new Date(`${period}-01T12:00:00Z`))
    .replace('.', '');
}

interface PriceHistoryPoint {
  id: string;
  label: string;
  value: number | null;
  meta: string;
  secondary?: string;
}

function PriceHistoryBars({ title, subtitle, points, tone }: {
  title: string;
  subtitle: string;
  points: PriceHistoryPoint[];
  tone: 'reference' | 'effective';
}) {
  const maximum = Math.max(0, ...points.map((point) => point.value ?? 0));
  const values = points.map((point) => point.value).filter((value): value is number => value != null && value > 0);
  const minimum = values.length ? Math.min(...values) : null;
  const latest = [...points].reverse().find((point) => point.value != null)?.value ?? null;
  return <section className={`price-history-series-v211 ${tone}`}>
    <header>
      <div><strong>{title}</strong><span>{subtitle}</span></div>
      <dl><div><dt>Último</dt><dd>{latest == null ? 'Sin dato' : money(latest)}</dd></div><div><dt>Rango observado</dt><dd>{minimum == null ? 'Sin dato' : `${money(minimum)} – ${money(maximum)}`}</dd></div></dl>
    </header>
    {!points.length || !values.length ? <div className="price-history-empty-v211"><History size={18} /><span>Todavía no hay historia suficiente para mostrar.</span></div> : <div className="price-history-scroll-v211" tabIndex={0} aria-label={`${title}. Deslizá horizontalmente para recorrer los períodos.`}>
      <div className="price-history-bars-v211">
        {points.map((point) => {
          const height = point.value && maximum > 0 ? Math.max(5, point.value / maximum * 100) : 0;
          return <article key={point.id} tabIndex={0} aria-label={`${point.label}: ${point.value == null ? 'sin dato' : money(point.value)}. ${point.meta}`}>
            <strong>{point.value == null ? '—' : money(point.value, true)}</strong>
            <div aria-hidden="true"><i style={{ height: `${height}%` }} /></div>
            <span>{point.label}</span>
            <small>{point.meta}</small>
            {point.secondary && <em>{point.secondary}</em>}
          </article>;
        })}
      </div>
    </div>}
  </section>;
}

function PriceDetail({ detail, product, onOpenProduct }: {
  detail: ProductPriceDetailPayload;
  product: Product;
  onOpenProduct: (product: Product) => void;
}) {
  const row = detail.row;
  const referencePoints: PriceHistoryPoint[] = detail.snapshotHistory.map((point) => ({
    id: point.snapshotAt,
    label: shortDate(point.snapshotAt.slice(0, 10)),
    value: point.referencePrice,
    meta: 'Actualización registrada',
    secondary: point.referencePricePerKg == null ? undefined : `${money(point.referencePricePerKg)}/kg`,
  }));
  const effectivePoints: PriceHistoryPoint[] = detail.effectiveHistory.map((point) => ({
    id: point.period,
    label: monthLabel(point.period),
    value: point.price,
    meta: `${number(point.units, 2)} U1 · ${number(point.buyers)} compradores`,
    secondary: `${number(point.activeDays)} días con venta`,
  }));

  return <section className="price-detail-panel-v211">
    <header className="price-detail-header-v211">
      <div><span>Producto seleccionado</span><h3>{product.name}</h3><p>{row.detail}</p></div>
      <button type="button" className="button secondary" onClick={() => onOpenProduct(product)}><PackageSearch size={15} /> Abrir ficha</button>
    </header>

    <section className="price-current-comparison-v211" aria-label="Precios actuales y comparación">
      <article><span>Precio de referencia</span><strong>{row.reference.current == null ? 'Sin dato' : money(row.reference.current)}</strong><small>{row.reference.previous == null ? 'Todavía no tiene un valor anterior' : `${variation(row.reference)} · anterior ${money(row.reference.previous)}`}</small><p>Valor vigente de la lista comercial.</p></article>
      <article><span>Precio efectivo neto · {detail.windowDays} días</span><strong>{row.effective.current == null ? 'Sin ventas utilizables' : money(row.effective.current)}</strong><small>{row.effective.previous == null ? 'Sin período anterior comparable' : `${variation(row.effective)} · anterior ${money(row.effective.previous)}`}</small><p>Facturación neta dividida por las U1 vendidas.</p></article>
      <article className={row.pricePerKgStatus === 'ambiguous_presentation' ? 'attention' : ''}><span>Precio de referencia por kilo</span><strong>{row.referencePricePerKg == null ? 'No calculable' : `${money(row.referencePricePerKg)}/kg`}</strong><small>{row.effectivePricePerKg == null ? 'Efectivo por kilo no disponible' : `Efectivo ${money(row.effectivePricePerKg)}/kg`}</small><p>{friendlyPricePerKgExplanation(row.pricePerKgStatus)}</p></article>
      <article><span>Referencia de competencia por kilo</span><strong>{row.competitorReferencePricePerKg == null ? 'Sin referencia' : `${money(row.competitorReferencePricePerKg)}/kg`}</strong><small>{row.competitorReferencePricePerKg == null ? 'No hay productos comparables suficientes' : `${number(row.competitorPriceSampleSize)} productos comparables`}</small><p>Se mantiene separada del precio de este producto.</p></article>
    </section>

    <div className={`price-detail-reading-v211 ${row.alert}`}>
      {row.alert === 'strong_reference_change' || row.alert === 'strong_effective_change' ? <AlertTriangle size={17} /> : <Info size={17} />}
      <div><strong>{alertLabels[row.alert]}</strong><span>{friendlyWarning(row.explanation)}</span></div>
      <small>{row.lastReferenceChangeAt ? `Último cambio de referencia: ${shortDate(row.lastReferenceChangeAt.slice(0, 10))}` : `${number(row.snapshotCount)} ${row.snapshotCount === 1 ? 'observación' : 'observaciones'} de referencia`}</small>
    </div>

    {!!detail.warnings.length && <details className="price-warning-details-v211"><summary><AlertTriangle size={15} /> Advertencias sobre este producto <ChevronRight size={15} /></summary><div>{detail.warnings.map((warning) => <p key={warning}>{friendlyWarning(warning)}</p>)}</div></details>}

    <PriceHistoryBars title="Historia del precio de referencia" subtitle="Valores preservados cada vez que se aprobó una actualización" points={referencePoints} tone="reference" />
    <PriceHistoryBars title="Precio efectivo por mes" subtitle="Importe neto ponderado por U1; cada barra comienza en cero" points={effectivePoints} tone="effective" />
  </section>;
}

export function ProductPriceAnalysis({ products, onOpenProduct }: { products: Product[]; onOpenProduct: (product: Product) => void }) {
  const [windowDays, setWindowDays] = useState<PriceWindowDays>(90);
  const [payload, setPayload] = useState<ProductPriceAnalysisPayload | null>(null);
  const [detail, setDetail] = useState<ProductPriceDetailPayload | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [alert, setAlert] = useState('');
  const [priceKgStatus, setPriceKgStatus] = useState('');
  const [order, setOrder] = useState<PriceOrder>('priority');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const detailRef = useRef<HTMLDivElement>(null);
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/products/price-analysis?window=${windowDays}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => readApiJson<ProductPriceAnalysisPayload>(response, 'No se pudo calcular el análisis de precios.'))
      .then((result) => {
        setPayload(result);
        setSelectedId((current) => result.rows.some((row) => row.id === current) ? current : '');
        setPage(1);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [windowDays]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); setDetailError(''); setDetailLoading(false); return; }
    const controller = new AbortController();
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    fetch(`/api/products/${encodeURIComponent(selectedId)}/price-history?window=${windowDays}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => readApiJson<ProductPriceDetailPayload>(response, 'No se pudo recuperar la historia del producto.'))
      .then(setDetail)
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setDetailError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selectedId, windowDays]);

  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const filtered = useMemo(() => (payload?.rows ?? [])
    .filter((row) => `${row.name} ${row.detail}`.toLocaleLowerCase('es').includes(normalizedQuery))
    .filter((row) => !alert || row.alert === alert)
    .filter((row) => !priceKgStatus || row.pricePerKgStatus === priceKgStatus), [alert, normalizedQuery, payload, priceKgStatus]);

  useEffect(() => {
    if (selectedId && !filtered.some((row) => row.id === selectedId)) setSelectedId('');
  }, [filtered, selectedId]);

  const sorted = useMemo(() => sortPriceRows(filtered, order), [filtered, order]);
  const pageSize = 24;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedProduct = productMap.get(selectedId);
  const activeFilterCount = Number(Boolean(alert)) + Number(Boolean(priceKgStatus)) + Number(Boolean(normalizedQuery));
  const totalAlerts = (payload?.summary.strongReferenceChanges ?? 0) + (payload?.summary.strongEffectiveChanges ?? 0);

  const clearFilters = () => { setQuery(''); setAlert(''); setPriceKgStatus(''); setPage(1); };
  const selectRow = (id: string) => {
    setSelectedId(id);
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
      window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  return <div className="product-price-workspace">
    <header className="data-card price-hero analysis-hero-v211">
      <div><span className="section-kicker"><BadgeDollarSign size={15} /> Lectura de precios</span><h2>Precios y evolución</h2><p>Revisá cada tipo de precio por separado y abrí la historia del producto para entender qué cambió.</p></div>
      <div className="analysis-period-control"><span>Precio efectivo de</span><div className="demand-window-switch" aria-label="Período del precio efectivo">
        {([30, 90, 180] as PriceWindowDays[]).map((days) => <button type="button" key={days} className={windowDays === days ? 'active' : ''} aria-pressed={windowDays === days} onClick={() => setWindowDays(days)}>{days} días</button>)}
      </div></div>
    </header>

    <section className="price-concept-grid-v211" aria-label="Qué significa cada precio">
      <article><CircleDollarSign size={18} /><div><strong>Referencia</strong><span>Es el valor vigente de lista. Se compara con la actualización anterior.</span></div></article>
      <article><BadgeDollarSign size={18} /><div><strong>Efectivo neto</strong><span>Es lo facturado por unidad comercial (U1). Se compara con un período anterior de igual duración.</span></div></article>
      <article><Scale size={18} /><div><strong>Por kilo</strong><span>Sólo aparece cuando la presentación permite convertir U1 a kilos con confianza.</span></div></article>
    </section>

    {payload && <>
      <section className="analysis-kpi-grid price-kpis-v211" aria-label="Cobertura del análisis de precios">
        <article><span>Con precio de referencia</span><strong>{number(payload.summary.withReference)}</strong><small>de {number(payload.summary.products)} productos</small></article>
        <article><span>Con precio efectivo</span><strong>{number(payload.summary.withEffective)}</strong><small>tuvieron ventas utilizables en {windowDays} días</small></article>
        <article><span>Comparables por kilo</span><strong>{number(payload.summary.withReliablePricePerKg)}</strong><small>{number(payload.summary.ambiguousPresentations)} {payload.summary.ambiguousPresentations === 1 ? 'presentación no convertible' : 'presentaciones no convertibles'}</small></article>
        <article className={totalAlerts > 0 ? 'attention' : ''}><span>Cambios fuertes para revisar</span><strong>{number(totalAlerts)}</strong><small>{number(payload.summary.strongReferenceChanges)} de referencia · {number(payload.summary.strongEffectiveChanges)} efectivos</small></article>
      </section>
      <section className="data-card analysis-coverage-note"><CalendarClock size={18} /><div><strong>Períodos efectivos equivalentes</strong><span>Actual: {compactDate(payload.currentRange.from)} al {compactDate(payload.currentRange.through)} · Anterior: {compactDate(payload.previousRange.from)} al {compactDate(payload.previousRange.through)}. La referencia usa actualizaciones, no estas ventanas.</span></div></section>
    </>}

    <section className="data-card analysis-controls-v211 price-controls-v211">
      <label className="analysis-search-v211"><span>Buscar producto</span><div><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Nombre, SKU, marca o rubro…" /></div></label>
      <label className="analysis-sort-v211"><span>Ordenar por</span><select value={order} onChange={(event) => { setOrder(event.target.value as PriceOrder); setPage(1); }}>{(Object.entries(orderLabels) as [PriceOrder, string][]).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <MobileFilterSheet title="Filtrar análisis de precios" description="Acotá productos por alerta o disponibilidad del precio por kilo." activeCount={activeFilterCount - Number(Boolean(normalizedQuery))} applyLabel={`Ver ${number(sorted.length)} productos`} className="analysis-filter-sheet-v211">
        <SingleSelectFilter label="Alerta" value={alert} options={[{ value: '', label: 'Todas' }, ...Object.entries(alertLabels).map(([value, label]) => ({ value, label }))]} onChange={(value) => { setAlert(value); setPage(1); }} />
        <SingleSelectFilter label="Precio por kilo" value={priceKgStatus} options={[{ value: '', label: 'Todos' }, ...Object.entries(priceKgLabels).map(([value, label]) => ({ value, label }))]} onChange={(value) => { setPriceKgStatus(value); setPage(1); }} />
      </MobileFilterSheet>
      {activeFilterCount > 0 && <button type="button" className="analysis-clear-v211" onClick={clearFilters}><RotateCcw size={14} /> Limpiar</button>}
    </section>

    {loading && !payload && <section className="data-card analysis-state-v211"><BadgeDollarSign className="loading-icon" size={26} /><strong>Organizando precios comparables…</strong><span>El proceso sólo lee la información ya actualizada.</span></section>}
    {error && <section className="data-card analysis-state-v211 error"><strong>{error}</strong><span>La serie histórica preservada no fue modificada.</span></section>}

    {!error && payload && <section className="data-card price-browser-v211">
      <header className="analysis-results-header-v211"><div><span>Explorador</span><h3>{number(sorted.length)} productos</h3><p>Elegí un producto para ver sus comparaciones e historia completas.</p></div><span className="analysis-page-label-v211">Página {currentPage} de {pageCount}</span></header>
      <div className="price-browser-layout-v211">
        <section className="price-directory-v211" aria-label="Lista de productos">
          <div className="price-directory-list-v211">
            {visible.map((row) => <button type="button" key={row.id} className={`${row.id === selectedId ? 'selected' : ''} ${row.alert}`} aria-pressed={row.id === selectedId} onClick={() => selectRow(row.id)}>
              <span className="price-directory-title-v211"><strong>{row.name}</strong><small>{row.detail}</small></span>
              <span className="price-directory-values-v211"><span><small>Referencia</small><strong>{row.reference.current == null ? 'Sin dato' : money(row.reference.current, true)}</strong><em className={variationClass(row.reference)}>{variation(row.reference)}</em></span><span><small>Efectivo neto</small><strong>{row.effective.current == null ? 'Sin ventas' : money(row.effective.current, true)}</strong><em className={variationClass(row.effective)}>{variation(row.effective)}</em></span></span>
              <span className={`price-alert-chip-v211 ${row.alert}`}>{alertLabels[row.alert]}</span>
              <ChevronRight size={18} />
            </button>)}
          </div>
          {!visible.length && <div className="analysis-empty-v211"><PackageSearch size={28} /><strong>No hay productos con estos criterios</strong><span>Quitá uno o más filtros para ampliar la lista.</span><button type="button" className="button secondary" onClick={clearFilters}><RotateCcw size={15} /> Limpiar filtros</button></div>}
          {visible.length > 0 && <footer className="table-pagination analysis-pagination-v211"><span>{(currentPage - 1) * pageSize + 1}–{(currentPage - 1) * pageSize + visible.length} de {number(sorted.length)}</span><div><button type="button" className="button secondary" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><strong>{currentPage} / {pageCount}</strong><button type="button" className="button secondary" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Siguiente</button></div></footer>}
        </section>

        <div className="price-detail-column-v211" ref={detailRef}>
          {!selectedId && <div className="price-detail-placeholder-v211"><History size={30} /><strong>Elegí un producto</strong><span>Acá vas a ver precios actuales, comparación equivalente e historia mensual sin mezclar conceptos.</span><ArrowRight size={18} /></div>}
          {detailLoading && <div className="price-detail-placeholder-v211"><BadgeDollarSign className="loading-icon" size={28} /><strong>Buscando la historia del producto…</strong></div>}
          {detailError && <div className="price-detail-placeholder-v211 error"><AlertTriangle size={28} /><strong>{detailError}</strong><span>El resto del análisis sigue disponible.</span></div>}
          {detail && selectedProduct && <PriceDetail detail={detail} product={selectedProduct} onOpenProduct={onOpenProduct} />}
        </div>
      </div>
    </section>}

    {payload && <details className="data-card analysis-method-v211"><summary><BadgeDollarSign size={16} /><span><strong>Metodología y reglas de precios</strong><small>Detalle técnico para auditoría</small></span><ChevronRight size={16} /></summary><div>{Object.values(payload.rules).map((rule) => <p key={rule}>{rule.replaceAll('GESI', 'la fuente comercial').replaceAll('snapshots', 'registros históricos').replaceAll('snapshot', 'registro histórico')}</p>)}<p>Información comercial disponible desde {compactDate(payload.coverageFrom)}.</p></div></details>}
  </div>;
}
