import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeDollarSign, CalendarClock, ChevronRight, CircleDollarSign, History, PackageSearch, Scale, Search, TrendingDown, TrendingUp } from 'lucide-react';
import type { Product } from '../../shared/models';
import type { PriceComparison, PricePerKgStatus, PriceWindowDays, ProductPriceAlert, ProductPriceAnalysisPayload, ProductPriceDetailPayload, ProductPriceRow } from '../../shared/product-prices';
import { readApiJson } from '../lib/api-response';
import { compactDate, money, number, shortDate } from '../lib/format';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';
import { SingleSelectFilter } from './SingleSelectFilter';
import { SortButton } from './SortButton';
import { Sparkline } from './Sparkline';

type PriceSort = 'product' | 'reference' | 'referenceChange' | 'effective' | 'effectiveChange' | 'priceKg' | 'lastChange' | 'alert';

const alertLabels: Record<ProductPriceAlert, string> = {
  strong_reference_change: 'Cambio fuerte de referencia',
  strong_effective_change: 'Cambio fuerte efectivo',
  ambiguous_presentation: 'Presentación ambigua',
  none: 'Sin alerta',
};
const priceKgLabels: Record<PricePerKgStatus, string> = {
  reliable: 'Con precio/kg confiable',
  ambiguous_presentation: 'Presentación ambigua',
  not_applicable: 'No aplicable por kilo',
  no_reference: 'Sin precio de referencia',
};

function variation(comparison: PriceComparison) {
  if (comparison.status === 'new_observed') return 'Nuevo observado';
  if (comparison.status === 'unavailable') return 'Sin precio actual';
  if (comparison.percentChange == null) return 'Sin base anterior';
  return `${comparison.percentChange > 0 ? '+' : ''}${comparison.percentChange.toLocaleString('es-AR')}%`;
}

function variationClass(comparison: PriceComparison) {
  return comparison.status.includes('increase') ? 'increase' : comparison.status.includes('decrease') ? 'decrease' : comparison.status;
}

function PriceDetail({ detail, product, onOpenProduct }: { detail: ProductPriceDetailPayload; product: Product; onOpenProduct: (product: Product) => void }) {
  const row = detail.row;
  const effectiveValues = detail.effectiveHistory.map((point) => point.price);
  return <section className="data-card price-detail-card">
    <header className="price-detail-header"><div><span className="section-kicker"><History size={14} /> Historia del producto seleccionado</span><h2>{product.name}</h2><p>{row.detail}</p></div><button className="button secondary" onClick={() => onOpenProduct(product)}><PackageSearch size={15} /> Abrir ficha completa</button></header>
    <div className="price-layer-grid">
      <article><span>Referencia GESI</span><strong>{row.reference.current == null ? 'Sin dato' : money(row.reference.current)}</strong><small>{row.reference.previous == null ? 'Sin valor anterior' : `${money(row.reference.previous)} anterior · ${variation(row.reference)}`}</small></article>
      <article><span>Efectivo neto por U1 · {detail.windowDays}d</span><strong>{row.effective.current == null ? 'Sin ventas utilizables' : money(row.effective.current)}</strong><small>{row.effective.previous == null ? 'Sin base anterior' : `${money(row.effective.previous)} anterior · ${variation(row.effective)}`}</small></article>
      <article className={row.pricePerKgStatus === 'ambiguous_presentation' ? 'attention' : ''}><span>Producto por kilo</span><strong>{row.referencePricePerKg == null ? 'No calculable' : `${money(row.referencePricePerKg)}/kg`}</strong><small>{row.effectivePricePerKg == null ? row.pricePerKgExplanation : `Efectivo ${money(row.effectivePricePerKg)}/kg`}</small></article>
      <article><span>Competencia por kilo</span><strong>{row.competitorReferencePricePerKg == null ? 'Sin referencia' : `${money(row.competitorReferencePricePerKg)}/kg`}</strong><small>{row.competitorReferencePricePerKg == null ? 'No hay cohorte suficiente' : `Mediana de ${number(row.competitorPriceSampleSize)} productos comparables`}</small></article>
      <article><span>Último cambio de referencia</span><strong>{row.lastReferenceChangeAt ? shortDate(row.lastReferenceChangeAt.slice(0, 10)) : 'Sin cambio observado'}</strong><small>{number(row.snapshotCount)} valores preservados</small></article>
    </div>
    {!!detail.warnings.length && <div className="price-warning-list">{detail.warnings.map((warning) => <p key={warning}><AlertTriangle size={14} />{warning}</p>)}</div>}
    <div className="price-history-grid">
      <section><header><div><strong>Evolución de la referencia</strong><small>Historial preservado</small></div><Sparkline values={detail.snapshotHistory.map((point) => point.referencePrice ?? 0).filter((value) => value > 0)} color="#577e3c" width={130} /></header><div className="price-history-list">{detail.snapshotHistory.map((point) => <article key={point.snapshotAt}><span>{shortDate(point.snapshotAt.slice(0, 10))}<small>{point.sourceLabel}</small></span><strong>{point.referencePrice == null ? 'Sin precio' : money(point.referencePrice)}</strong><em>{point.referencePricePerKg == null ? '—' : `${money(point.referencePricePerKg)}/kg`}</em></article>)}</div></section>
      <section><header><div><strong>Evolución efectiva mensual</strong><small>Neto facturado ponderado por U1</small></div><Sparkline values={effectiveValues} color="#c48226" width={130} /></header><div className="price-history-list">{detail.effectiveHistory.map((point) => <article key={point.period}><span>{point.period}<small>{number(point.activeDays)} días · {number(point.buyers)} compradores</small></span><strong>{money(point.price)}</strong><em>{number(point.units, 2)} U1</em></article>)}</div></section>
    </div>
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
  const [sort, setSort] = useState(emptySort<PriceSort>());
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    fetch(`/api/products/price-analysis?window=${windowDays}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => readApiJson<ProductPriceAnalysisPayload>(response, 'No se pudo calcular el análisis de precios.'))
      .then((result) => { setPayload(result); setSelectedId((current) => result.rows.some((row) => row.id === current) ? current : result.rows[0]?.id ?? ''); setPage(1); })
      .catch((cause) => { if (cause instanceof DOMException && cause.name === 'AbortError') return; setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [windowDays]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    const controller = new AbortController();
    fetch(`/api/products/${encodeURIComponent(selectedId)}/price-history?window=${windowDays}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => readApiJson<ProductPriceDetailPayload>(response, 'No se pudo recuperar la historia del producto.'))
      .then(setDetail)
      .catch((cause) => { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setDetail(null); });
    return () => controller.abort();
  }, [selectedId, windowDays]);

  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const filtered = useMemo(() => (payload?.rows ?? []).filter((row) => `${row.name} ${row.detail}`.toLocaleLowerCase('es').includes(normalizedQuery))
    .filter((row) => !alert || row.alert === alert)
    .filter((row) => !priceKgStatus || row.pricePerKgStatus === priceKgStatus), [alert, normalizedQuery, payload, priceKgStatus]);
  useEffect(() => {
    if (filtered.length && !filtered.some((row) => row.id === selectedId)) setSelectedId(filtered[0].id);
    if (!filtered.length && selectedId) setSelectedId('');
  }, [filtered, selectedId]);
  const sorted = useMemo(() => sortItems(filtered, sort, (row, key) => {
    if (key === 'product') return row.name;
    if (key === 'reference') return row.reference.current;
    if (key === 'referenceChange') return row.reference.percentChange;
    if (key === 'effective') return row.effective.current;
    if (key === 'effectiveChange') return row.effective.percentChange;
    if (key === 'priceKg') return row.referencePricePerKg;
    if (key === 'lastChange') return row.lastReferenceChangeAt;
    return row.alert;
  }), [filtered, sort]);
  const pageSize = 100;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedProduct = productMap.get(selectedId);

  return <div className="product-price-workspace">
    <header className="data-card price-hero"><div><span className="section-kicker"><BadgeDollarSign size={15} /> Precios GESI y ventas reales</span><h2>Precios y evolución</h2><p>Referencia, precio efectivo neto y precio por kilo permanecen separados. Cada cambio conserva su fuente y base comparable.</p></div><div className="demand-window-switch" aria-label="Ventana del precio efectivo">{([30, 90, 180] as PriceWindowDays[]).map((days) => <button key={days} className={windowDays === days ? 'active' : ''} onClick={() => setWindowDays(days)}>{days} días</button>)}</div></header>
    {payload && <><section className="price-kpis">
      <article><CircleDollarSign size={18} /><span>Referencia GESI</span><strong>{number(payload.summary.withReference)}</strong><small>de {number(payload.summary.products)} productos</small></article>
      <article><BadgeDollarSign size={18} /><span>Precio efectivo · {windowDays}d</span><strong>{number(payload.summary.withEffective)}</strong><small>con ventas utilizables</small></article>
      <article><Scale size={18} /><span>Precio/kg confiable</span><strong>{number(payload.summary.withReliablePricePerKg)}</strong><small>{number(payload.summary.ambiguousPresentations)} presentación ambigua</small></article>
      <article className={payload.summary.strongReferenceChanges ? 'attention' : ''}><TrendingUp size={18} /><span>Cambios fuertes referencia</span><strong>{number(payload.summary.strongReferenceChanges)}</strong><small>entre actualizaciones · ±15%</small></article>
      <article className={payload.summary.strongEffectiveChanges ? 'attention' : ''}><TrendingDown size={18} /><span>Cambios fuertes efectivos</span><strong>{number(payload.summary.strongEffectiveChanges)}</strong><small>con muestra suficiente</small></article>
    </section><section className="data-card price-coverage-note"><CalendarClock size={17} /><div><strong>Períodos efectivos equivalentes</strong><span>Actual: {compactDate(payload.currentRange.from)} → {compactDate(payload.currentRange.through)} · Anterior: {compactDate(payload.previousRange.from)} → {compactDate(payload.previousRange.through)}. La referencia compara actualizaciones, no estas ventanas.</span></div></section></>}
    <section className="data-card price-controls"><label className="inline-search"><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Buscar producto, SKU, marca o familia…" /></label><SingleSelectFilter label="Alerta" value={alert} options={Object.entries(alertLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => { setAlert(value); setPage(1); }} /><SingleSelectFilter label="Precio por kilo" value={priceKgStatus} options={Object.entries(priceKgLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => { setPriceKgStatus(value); setPage(1); }} /></section>
    {loading && <section className="data-card price-state"><BadgeDollarSign className="loading-icon" size={26} /><strong>Reconstruyendo precios comparables…</strong></section>}
    {error && <section className="data-card price-state error"><strong>{error}</strong><span>La serie preservada no fue modificada.</span></section>}
    {!loading && !error && payload && <section className="data-card price-table-card"><div className="price-table-scroll"><table className="price-table"><thead><tr>
      <th><SortButton label="Producto" direction={sort.key === 'product' ? sort.direction : null} onClick={() => setSort((state) => cycleSort(state, 'product'))} /></th>
      <th><SortButton label="Referencia GESI" direction={sort.key === 'reference' ? sort.direction : null} onClick={() => setSort((state) => cycleSort(state, 'reference'))} /></th>
      <th><SortButton label="Cambio referencia" direction={sort.key === 'referenceChange' ? sort.direction : null} onClick={() => setSort((state) => cycleSort(state, 'referenceChange'))} /></th>
      <th><SortButton label={`Efectivo · ${windowDays}d`} direction={sort.key === 'effective' ? sort.direction : null} onClick={() => setSort((state) => cycleSort(state, 'effective'))} /></th>
      <th><SortButton label="Cambio efectivo" direction={sort.key === 'effectiveChange' ? sort.direction : null} onClick={() => setSort((state) => cycleSort(state, 'effectiveChange'))} /></th>
      <th><SortButton label="Precio/kg" direction={sort.key === 'priceKg' ? sort.direction : null} onClick={() => setSort((state) => cycleSort(state, 'priceKg'))} /></th>
      <th><SortButton label="Último cambio" direction={sort.key === 'lastChange' ? sort.direction : null} onClick={() => setSort((state) => cycleSort(state, 'lastChange'))} /></th>
      <th><SortButton label="Alerta" direction={sort.key === 'alert' ? sort.direction : null} onClick={() => setSort((state) => cycleSort(state, 'alert'))} /></th><th />
    </tr></thead><tbody>{visible.map((row) => <tr key={row.id} className={`${row.id === selectedId ? 'selected' : ''} ${row.alert}`}>
      <td><button className="price-product-button" onClick={() => setSelectedId(row.id)}><strong>{row.name}</strong><small>{row.detail}</small></button></td>
      <td><strong>{row.reference.current == null ? 'Sin precio' : money(row.reference.current)}</strong><small>{row.reference.previous == null ? 'Sin valor anterior' : `Anterior ${money(row.reference.previous)}`}</small></td>
      <td><span className={`price-change-chip ${variationClass(row.reference)}`}>{variation(row.reference)}</span><small>{row.reference.absoluteChange == null ? 'Sin diferencia' : `${row.reference.absoluteChange > 0 ? '+' : ''}${money(row.reference.absoluteChange)}`}</small></td>
      <td><strong>{row.effective.current == null ? 'Sin ventas' : money(row.effective.current)}</strong><small>{number(row.currentEffective.units, 2)} U1 · {number(row.currentEffective.activeDays)} días</small></td>
      <td><span className={`price-change-chip ${variationClass(row.effective)}`}>{variation(row.effective)}</span><small>{row.effective.previous == null ? 'Sin base anterior' : `Anterior ${money(row.effective.previous)}`}</small></td>
      <td><strong>{row.referencePricePerKg == null ? 'No calculable' : `${money(row.referencePricePerKg)}/kg`}</strong><small>{row.competitorReferencePricePerKg == null ? priceKgLabels[row.pricePerKgStatus] : `Competencia ${money(row.competitorReferencePricePerKg)}/kg · ${number(row.competitorPriceSampleSize)} comparables`}</small></td>
      <td><strong>{row.lastReferenceChangeAt ? shortDate(row.lastReferenceChangeAt.slice(0, 10)) : 'Sin cambio observado'}</strong><small>{number(row.snapshotCount)} registros</small></td>
      <td><span className={`price-alert-chip ${row.alert}`}>{alertLabels[row.alert]}</span><small>{row.explanation}</small></td>
      <td><button className="icon-button" aria-label={`Analizar ${row.name}`} onClick={() => setSelectedId(row.id)}><ChevronRight size={15} /></button></td>
    </tr>)}</tbody></table></div><footer className="table-pagination"><span>Mostrando {visible.length ? (currentPage - 1) * pageSize + 1 : 0}–{(currentPage - 1) * pageSize + visible.length} de {number(sorted.length)}</span><div><button className="button secondary" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><strong>{currentPage} / {pageCount}</strong><button className="button secondary" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Siguiente</button></div></footer></section>}
    {detail && selectedProduct && <PriceDetail detail={detail} product={selectedProduct} onOpenProduct={onOpenProduct} />}
    {payload && <details className="data-card demand-rules"><summary>Ver reglas exactas de precios</summary><div>{Object.values(payload.rules).map((rule) => <p key={rule}>{rule}</p>)}</div></details>}
  </div>;
}
