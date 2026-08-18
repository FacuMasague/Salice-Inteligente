import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, ClipboardCheck, History, Info, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  classifyInventoryProduct,
  compareInventoryDecisionPriority,
  INVENTORY_DECISION_LABELS,
  INVENTORY_DECISION_ORDER,
  INVENTORY_DECISION_POLICY,
  INVENTORY_ATTENTION_STATUSES,
  INVENTORY_EXCEPTION_LABELS,
  INVENTORY_REVIEW_LABELS,
  inventoryReviewDisplayLabel,
  isInventoryDecisionCandidate,
  type InventoryAlertReview,
  type InventoryAlertReviewEvent,
  type InventoryDecisionStatus,
  type InventoryExceptionType,
  type InventoryReviewStatus,
} from '../../shared/inventory-decisions';
import type { Product } from '../../shared/models';
import { encodeMultiFilter, matchesMultiFilter } from '../../shared/multi-filter';
import { AnimatedLayer } from './AnimatedLayer';
import { MobileFilterSheet } from './MobileFilterSheet';
import { MultiSelectFilter } from './MultiSelectFilter';
import { SingleSelectFilter } from './SingleSelectFilter';
import { SortButton } from './SortButton';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';
import { number, shortDate } from '../lib/format';

type InventorySortKey = 'product' | 'status' | 'stock' | 'rotation' | 'coverage' | 'review';

interface InventoryRow {
  product: Product;
  decision: ReturnType<typeof classifyInventoryProduct>;
  review: InventoryAlertReview | null;
}

function useful(value: string) {
  return value && !value.toLocaleLowerCase('es').startsWith('sin ') ? value : 'No informado';
}

function rotationBucket(product: Product) {
  if (product.units90d > 0) return 'with_rotation';
  if (product.inventory.status === 'positive') return 'without_rotation';
  return 'not_evaluable';
}

function statusTone(status: InventoryDecisionStatus) {
  if (status === 'no_stock_with_demand' || status === 'critical_coverage') return 'critical';
  if (status === 'low_coverage' || status === 'stock_without_movement' || status === 'insufficient_data') return 'attention';
  if (status === 'adequate_coverage') return 'healthy';
  return 'neutral';
}

function reviewStatus(review: InventoryAlertReview | null) {
  return review?.status ?? 'unreviewed';
}

function noteExcerpt(note: string, maximum = 90) {
  const normalized = note.replace(/\s+/g, ' ').trim();
  return normalized.length > maximum ? `${normalized.slice(0, maximum - 1).trimEnd()}…` : normalized;
}

function aggregate(rows: InventoryRow[], field: 'brand' | 'family') {
  const groups = new Map<string, { name: string; products: number; alerts: number; critical: number }>();
  for (const row of rows) {
    const name = useful(row.product[field]);
    const current = groups.get(name) ?? { name, products: 0, alerts: 0, critical: 0 };
    current.products += 1;
    if (INVENTORY_ATTENTION_STATUSES.has(row.decision.status)) current.alerts += 1;
    if (row.decision.status === 'no_stock_with_demand' || row.decision.status === 'critical_coverage') current.critical += 1;
    groups.set(name, current);
  }
  return [...groups.values()].sort((a, b) => b.critical - a.critical || b.alerts - a.alerts || a.name.localeCompare(b.name, 'es')).slice(0, 6);
}

export function InventoryDecisionTray({ products, reviews, loadError, onReviewSaved, onOpenProduct, onOpenBrand }: {
  products: Product[];
  reviews: Record<string, InventoryAlertReview>;
  loadError?: string;
  onReviewSaved: (review: InventoryAlertReview) => void;
  onOpenProduct: (product: Product) => void;
  onOpenBrand: (brand: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [brand, setBrand] = useState('');
  const [family, setFamily] = useState('');
  const [group, setGroup] = useState('');
  const [activity, setActivity] = useState('active');
  const [rotation, setRotation] = useState('');
  const [reviewState, setReviewState] = useState('');
  const [sort, setSort] = useState(emptySort<InventorySortKey>());
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<InventoryRow | null>(null);
  const [draftStatus, setDraftStatus] = useState<InventoryReviewStatus>('unreviewed');
  const [draftException, setDraftException] = useState<InventoryExceptionType>('none');
  const [draftNote, setDraftNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [reviewEvents, setReviewEvents] = useState<InventoryAlertReviewEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const pageSize = 75;

  const rows = useMemo<InventoryRow[]>(() => products.map((product) => {
    const review = reviews[product.id] ?? null;
    return { product, review, decision: classifyInventoryProduct(product, review) };
  }), [products, reviews]);
  const candidateRows = useMemo(() => rows.filter((row) => isInventoryDecisionCandidate(row.product)).sort(compareInventoryDecisionPriority), [rows]);
  const excludedCount = rows.length - candidateRows.length;
  const candidateProducts = useMemo(() => candidateRows.map((row) => row.product), [candidateRows]);
  const brands = useMemo(() => [...new Set(candidateProducts.map((product) => product.brand).filter((value) => useful(value) !== 'No informado'))].sort((a, b) => a.localeCompare(b, 'es')), [candidateProducts]);
  const families = useMemo(() => [...new Set(candidateProducts.map((product) => product.family).filter((value) => useful(value) !== 'No informado'))].sort((a, b) => a.localeCompare(b, 'es')), [candidateProducts]);
  const groups = useMemo(() => [...new Set(candidateProducts.map((product) => product.group).filter((value) => useful(value) !== 'No informado'))].sort((a, b) => a.localeCompare(b, 'es')), [candidateProducts]);
  const statusOptions = INVENTORY_DECISION_ORDER.map((value) => ({ value, label: INVENTORY_DECISION_LABELS[value] }));
  const baseFiltered = candidateRows
    .filter((row) => `${row.product.name} ${row.product.sku} ${row.product.brand} ${row.product.family} ${row.product.commercialFamily} ${row.product.group}`.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')))
    .filter((row) => matchesMultiFilter(row.product.brand, brand))
    .filter((row) => matchesMultiFilter(row.product.family, family))
    .filter((row) => matchesMultiFilter(row.product.group, group))
    .filter((row) => matchesMultiFilter(row.product.masterStatus, activity))
    .filter((row) => matchesMultiFilter(rotationBucket(row.product), rotation))
    .filter((row) => matchesMultiFilter(row.review?.status ?? 'unreviewed', reviewState));
  const filtered = baseFiltered.filter((row) => matchesMultiFilter(row.decision.status, status));
  const sorted = sortItems(filtered, sort, (row, key) => {
    if (key === 'product') return row.product.name;
    if (key === 'status') return INVENTORY_DECISION_ORDER.indexOf(row.decision.status);
    if (key === 'stock') return row.product.inventory.rawAvailableUnit1;
    if (key === 'rotation') return row.product.monthlyUnits;
    if (key === 'coverage') return row.product.stockCoverageMonths;
    return row.review?.status === 'reviewed' ? 2 : row.review?.status === 'in_review' ? 1 : 0;
  });
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const direction = (key: InventorySortKey) => sort.key === key ? sort.direction : null;
  const changeSort = (key: InventorySortKey) => { setSort((current) => cycleSort(current, key)); setPage(1); };
  const counts = Object.fromEntries(INVENTORY_DECISION_ORDER.map((value) => [value, baseFiltered.filter((row) => row.decision.status === value).length])) as Record<InventoryDecisionStatus, number>;
  const urgentFilter = encodeMultiFilter(['no_stock_with_demand', 'critical_coverage']);
  const excessFilter = encodeMultiFilter(['high_coverage', 'stock_without_movement']);
  const quickFilters = [
    { value: '', label: 'Todos', detail: 'productos visibles', count: baseFiltered.length, tone: 'neutral' },
    { value: urgentFilter, label: 'Urgentes', detail: 'quiebre o cobertura crítica', count: counts.no_stock_with_demand + counts.critical_coverage, tone: 'critical' },
    { value: 'low_coverage', label: 'Reponer pronto', detail: 'cobertura baja', count: counts.low_coverage, tone: 'attention' },
    { value: excessFilter, label: 'Revisar exceso', detail: 'alta cobertura o sin movimiento', count: counts.high_coverage + counts.stock_without_movement, tone: 'attention' },
    { value: 'adequate_coverage', label: 'Cobertura adecuada', detail: 'sin urgencia por cobertura', count: counts.adequate_coverage, tone: 'healthy' },
  ];
  const attentionRows = filtered.filter((row) => INVENTORY_ATTENTION_STATUSES.has(row.decision.status));
  const affectedBrands = new Set(attentionRows.map((row) => useful(row.product.brand))).size;
  const affectedFamilies = new Set(attentionRows.map((row) => useful(row.product.family))).size;
  const brandSummary = aggregate(filtered, 'brand');
  const familySummary = aggregate(filtered, 'family');
  const activeFilterCount = [status, brand, family, group, rotation, reviewState].filter(Boolean).length
    + (activity === 'active' ? 0 : 1);

  const openReview = (row: InventoryRow) => {
    setEditing(row);
    setDraftStatus(row.review?.status ?? 'unreviewed');
    setDraftException(row.review?.exceptionType ?? 'none');
    setDraftNote(row.review?.note ?? '');
    setSaveError('');
    setReviewEvents([]);
    setHistoryError('');
    setHistoryLoading(true);
    fetch(`/api/inventory-alert-reviews/${encodeURIComponent(row.product.id)}/events`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ events: InventoryAlertReviewEvent[] }>;
      })
      .then((payload) => setReviewEvents(payload.events))
      .catch(() => setHistoryError('No se pudo cargar el historial. La revisión actual sigue disponible.'))
      .finally(() => setHistoryLoading(false));
  };
  const saveReview = async () => {
    if (!editing || saving) return;
    setSaving(true); setSaveError('');
    try {
      const response = await fetch(`/api/inventory-alert-reviews/${encodeURIComponent(editing.product.id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: draftStatus, exceptionType: draftException, note: draftNote }),
      });
      if (!response.ok) throw new Error();
      const payload = await response.json() as { review: InventoryAlertReview };
      onReviewSaved(payload.review);
      setEditing(null);
    } catch {
      setSaveError('No se pudo guardar la revisión. La señal de inventario no fue modificada.');
    } finally { setSaving(false); }
  };

  return <div className="inventory-decision-page">
    <section className="data-card inventory-decision-hero">
      <div><span className="section-kicker"><ClipboardCheck size={15} /> Bandeja de decisión · depósito 2</span><h2>Inventario para revisar y decidir</h2><p>Incluye productos con stock positivo o rotación en los últimos 90 días. Los otros {number(excludedCount)} productos siguen disponibles en Catálogo.</p></div>
      <details className="inventory-policy-details"><summary>Cómo se prioriza <ChevronDown size={14} /></summary><div><strong>Política {INVENTORY_DECISION_POLICY.version}</strong><span>Crítica &lt; 0,5 mes · baja &lt; 1 mes · adecuada 1–&lt;3 meses · alta ≥ 3 meses.</span><small>No hay excepciones familiares configuradas.</small></div></details>
    </section>
    <section className="data-card inventory-command-card">
      <div><span className="section-kicker">Prioridades rápidas</span><div className="inventory-priority-shortcuts">{quickFilters.map((item) => <button key={item.label} className={`${item.tone} ${status === item.value ? 'active' : ''}`} onClick={() => { setStatus(item.value); setPage(1); }}><strong>{number(item.count)}</strong><span>{item.label}</span><small>{item.detail}</small></button>)}</div></div>
      <aside><span>Revisión de oficina</span><strong>{number(filtered.filter((row) => row.review?.status === 'unreviewed' && row.review.reopenedAt).length)} reabiertos</strong><small>{number(filtered.filter((row) => row.review?.status === 'in_review').length)} en revisión · {number(filtered.filter((row) => (row.review?.status ?? 'unreviewed') === 'unreviewed' && !row.review?.reopenedAt).length)} pendientes · {number(filtered.filter((row) => row.review?.status === 'reviewed').length)} revisados</small></aside>
    </section>
    <section className="data-card inventory-filter-card">
      <div className="inventory-filter-primary"><label className="inline-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Buscar producto, SKU o marca…" /></label>
        <MobileFilterSheet
          title="Filtrar inventario"
          description="Acotá productos por estado, marca, revisión, familia, actividad o rotación."
          activeCount={activeFilterCount}
          applyLabel={`Ver ${number(sorted.length)} productos`}
        >
          <MultiSelectFilter label="Estado" value={status} options={statusOptions} onChange={(value) => { setStatus(value); setPage(1); }} />
          <MultiSelectFilter label="Marca" value={brand} options={brands} onChange={(value) => { setBrand(value); setPage(1); }} />
          <MultiSelectFilter label="Revisión" value={reviewState} options={[{ value: 'unreviewed', label: INVENTORY_REVIEW_LABELS.unreviewed }, { value: 'in_review', label: INVENTORY_REVIEW_LABELS.in_review }, { value: 'reviewed', label: INVENTORY_REVIEW_LABELS.reviewed }]} onChange={(value) => { setReviewState(value); setPage(1); }} />
          <details className="inventory-more-filters"><summary><SlidersHorizontal size={14} /> Más filtros <ChevronDown size={14} /></summary><div className="inventory-filter-grid"><MultiSelectFilter label="Familia" value={family} options={families} onChange={(value) => { setFamily(value); setPage(1); }} /><MultiSelectFilter label="Grupo" value={group} options={groups} onChange={(value) => { setGroup(value); setPage(1); }} /><MultiSelectFilter label="Actividad" value={activity} options={[{ value: 'active', label: 'Activo' }, { value: 'inactive', label: 'Inactivo' }, { value: 'unknown', label: 'Sin estado' }]} onChange={(value) => { setActivity(value); setPage(1); }} /><MultiSelectFilter label="Rotación" value={rotation} options={[{ value: 'with_rotation', label: 'Con movimiento 90d' }, { value: 'without_rotation', label: 'Stock sin movimiento' }, { value: 'not_evaluable', label: 'No evaluable' }]} onChange={(value) => { setRotation(value); setPage(1); }} /></div></details>
        </MobileFilterSheet>
      </div>
      {loadError && <p className="form-error">{loadError}</p>}
    </section>
    <details className="data-card inventory-secondary-summary"><summary><span><strong>Resumen por marca y familia</strong><small>{number(affectedBrands)} marcas · {number(affectedFamilies)} familias con alertas en el filtro</small></span><ChevronDown size={15} /></summary><section className="inventory-aggregate-grid"><article className="data-card"><div className="data-card-header"><div><span className="section-kicker">Indicador por marca</span><h2>Marcas con más alertas</h2></div></div><div className="inventory-aggregate-list">{brandSummary.map((item) => <button key={item.name} onClick={() => item.name !== 'No informado' && onOpenBrand(item.name)}><span><strong>{item.name}</strong><small>{item.products} productos en el filtro</small></span><em>{item.critical} críticas · {item.alerts} alertas</em><ChevronRight size={15} /></button>)}</div></article><article className="data-card"><div className="data-card-header"><div><span className="section-kicker">Indicador por familia</span><h2>Familias con más alertas</h2></div></div><div className="inventory-aggregate-list">{familySummary.map((item) => <button key={item.name} onClick={() => { if (item.name !== 'No informado') setFamily(item.name); setPage(1); }}><span><strong>{item.name}</strong><small>{item.products} productos en el filtro</small></span><em>{item.critical} críticas · {item.alerts} alertas</em><ChevronRight size={15} /></button>)}</div></article></section></details>
    <section className="data-card inventory-table-card">
      <div className="data-card-header"><div><span className="section-kicker"><AlertTriangle size={14} /> Productos para revisar</span><h2>{number(sorted.length)} productos</h2><p>Pendientes primero; dentro de cada estado se prioriza el mayor impacto.</p></div><span className="count-badge">{currentPage} / {pageCount}</span></div>
      <div className="table-wrap"><table className="data-table inventory-decision-table"><thead><tr>
        <th><SortButton label="Producto" direction={direction('product')} onClick={() => changeSort('product')} /></th>
        <th><SortButton label="Estado" direction={direction('status')} onClick={() => changeSort('status')} /></th>
        <th><SortButton label="Stock U1" direction={direction('stock')} onClick={() => changeSort('stock')} /></th>
        <th><SortButton label="Rotación/mes" direction={direction('rotation')} onClick={() => changeSort('rotation')} /></th>
        <th><SortButton label="Cobertura" direction={direction('coverage')} onClick={() => changeSort('coverage')} /></th>
        <th><SortButton label="Revisión" direction={direction('review')} onClick={() => changeSort('review')} /></th>
      </tr></thead><tbody>{visible.map((row) => <tr key={row.product.id} className={row.review?.status === 'unreviewed' && row.review.reopenedAt ? 'inventory-reopened-row' : row.review?.status === 'reviewed' ? 'inventory-reviewed-row' : row.review?.status === 'in_review' ? 'inventory-in-review-row' : ''} tabIndex={0} role="button" aria-label={`Abrir producto ${row.product.name}`} onClick={() => onOpenProduct(row.product)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenProduct(row.product); } }}>
        <td><button className="entity-link inventory-product-link" onClick={(event) => { event.stopPropagation(); onOpenProduct(row.product); }}><strong>{row.product.name}</strong><small>{row.product.sku} · {useful(row.product.brand)} · {useful(row.product.family)}</small></button></td>
        <td><span className={`inventory-status-badge ${statusTone(row.decision.status)}`}>{row.decision.label}</span></td>
        <td><strong>{row.product.inventory.rawAvailableUnit1 == null ? 'Sin dato' : row.product.inventory.rawAvailableUnit1.toLocaleString('es-AR')}</strong><small>{row.product.unit || 'U1 no informada'}</small></td>
        <td><strong>{row.product.monthlyUnits.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</strong><small>{row.product.units90d.toLocaleString('es-AR')} en 90d</small></td>
        <td><strong>{row.product.stockCoverageMonths == null ? 'No calculable' : `${row.product.stockCoverageMonths.toLocaleString('es-AR', { maximumFractionDigits: 2 })} meses`}</strong><small>umbral {row.decision.thresholdSource === 'general' ? 'general' : 'familiar'}</small></td>
        <td><button className={`inventory-review-button ${reviewStatus(row.review)} ${row.review?.status === 'unreviewed' && row.review.reopenedAt ? 'reopened' : ''}`} onClick={(event) => { event.stopPropagation(); openReview(row); }}>{row.review?.status === 'unreviewed' && row.review.reopenedAt ? <RotateCcw size={14} /> : row.review?.status === 'reviewed' ? <Check size={14} /> : <ClipboardCheck size={14} />}<span>{inventoryReviewDisplayLabel(row.review)}</span></button>{row.review && row.review.incidentNumber > 1 && <small>Incidencia {row.review.incidentNumber}</small>}{row.review?.note && <small title={row.review.note}>{noteExcerpt(row.review.note)}</small>}</td>
      </tr>)}</tbody></table></div>
      {!visible.length && <div className="empty-state"><Info size={22} /><h2>No hay productos para estos filtros</h2><p>Probá ampliar estado, actividad o rotación.</p></div>}
      <div className="table-pagination"><span>Mostrando {visible.length ? (currentPage - 1) * pageSize + 1 : 0}–{(currentPage - 1) * pageSize + visible.length} de {sorted.length}</span><div><button className="button secondary" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><strong>{currentPage} / {pageCount}</strong><button className="button secondary" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Siguiente</button></div></div>
    </section>
    <AnimatedLayer open={Boolean(editing)} className="inventory-review-layer">
      {editing && <>
      <button className="inventory-review-backdrop" aria-label="Cerrar revisión" onClick={() => setEditing(null)} />
      <section className="data-card inventory-review-panel" role="dialog" aria-modal="true" aria-label={`Revisar ${editing.product.name}`}>
        <header><div><span className="section-kicker">Revisión local de oficina · incidencia {editing.review?.incidentNumber ?? 1}</span><h2>{editing.product.name}</h2><p>{editing.decision.label}</p></div><button className="icon-button" aria-label="Cerrar" onClick={() => setEditing(null)}><X size={18} /></button></header>
        <div className="inventory-review-body">
          {editing.review?.status === 'unreviewed' && editing.review.reopenedAt && <div className="inventory-lifecycle-callout reopened"><RotateCcw size={17} /><div><strong>La incidencia volvió a abrirse</strong><span>El producto ya había sido revisado, el problema se resolvió y una captura posterior volvió a detectar una señal que requiere atención.</span></div></div>}
          {editing.review?.resolvedAt && editing.review.status === 'reviewed' && <div className="inventory-lifecycle-callout resolved"><Check size={17} /><div><strong>Problema resuelto en la última captura</strong><span>La revisión se conserva y volverá a abrirse automáticamente si reaparece una incidencia.</span></div></div>}
          <div className={`product-stock-callout ${statusTone(editing.decision.status)}`}><Info size={17} /><div><strong>Por qué aparece</strong><span>{editing.decision.explanation}</span></div></div>
          <SingleSelectFilter label="Estado local" value={draftStatus} options={[{ value: 'unreviewed', label: INVENTORY_REVIEW_LABELS.unreviewed }, { value: 'in_review', label: INVENTORY_REVIEW_LABELS.in_review }, { value: 'reviewed', label: INVENTORY_REVIEW_LABELS.reviewed }]} onChange={(value) => setDraftStatus(value as InventoryReviewStatus)} />
          <SingleSelectFilter label="Excepción humana" value={draftException} options={Object.entries(INVENTORY_EXCEPTION_LABELS).map(([value, label]) => ({ value, label }))} onChange={(value) => setDraftException(value as InventoryExceptionType)} />
          <label className="inventory-note-field"><span>Nota</span><textarea value={draftNote} onChange={(event) => setDraftNote(event.target.value)} maxLength={2000} placeholder="Contexto para la próxima revisión…" /></label>
          {draftException === 'reserved_stock' && <p className="inventory-review-warning">Stock reservado se registra como contexto. Como no se solicita una cantidad, la aplicación no descuenta unidades ni altera la cobertura.</p>}
          {(historyLoading || historyError || reviewEvents.length > 0) && <details className="inventory-review-history">
            <summary><History size={14} /> Historial de la incidencia <ChevronDown size={14} /></summary>
            {historyLoading && <p>Cargando historial…</p>}
            {historyError && <p className="form-error">{historyError}</p>}
            {!historyLoading && reviewEvents.length > 0 && <ol>{reviewEvents.map((event) => <li key={event.id} className={event.eventType}>
              <i>{event.eventType === 'reopened' ? <RotateCcw size={13} /> : event.eventType === 'resolved' ? <Check size={13} /> : <ClipboardCheck size={13} />}</i>
              <div><strong>{event.eventType === 'reopened' ? 'Incidencia reabierta' : event.eventType === 'resolved' ? 'Problema resuelto' : `Revisión guardada · ${INVENTORY_REVIEW_LABELS[event.reviewStatus]}`}</strong><span>Incidencia {event.incidentNumber} · {event.decisionStatus ? INVENTORY_DECISION_LABELS[event.decisionStatus] : 'señal anterior no registrada'}</span>{event.note && <small>{event.note}</small>}</div>
              <time>{shortDate(event.createdAt.slice(0, 10))}</time>
            </li>)}</ol>}
          </details>}
          {saveError && <p className="form-error">{saveError}</p>}
        </div>
        <footer><span>{editing.review?.updatedAt ? `Última actualización ${shortDate(editing.review.updatedAt.slice(0, 10))}` : 'Todavía sin revisión local'}</span><button className="button primary" disabled={saving} onClick={saveReview}>{saving ? 'Guardando…' : 'Guardar revisión'}</button></footer>
      </section>
      </>}
    </AnimatedLayer>
  </div>;
}
