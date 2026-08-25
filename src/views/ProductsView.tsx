import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Boxes, ChevronDown, ChevronRight, ListFilter, Search, SlidersHorizontal } from 'lucide-react';
import { classifyInventoryProduct, type InventoryAlertReview } from '../../shared/inventory-decisions';
import { productPresentationLabel } from '../../shared/product-insights';
import { VECTOR_DESCRIPTIONS, VECTOR_GROUPS, VECTOR_LABELS, type Client, type Product, type VectorKey } from '../../shared/models';
import { matchesMultiFilter } from '../../shared/multi-filter';
import { productAvailableStock } from '../../shared/product-stock';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { InventoryDecisionTray } from '../components/InventoryDecisionTray';
import { ProductPanel } from '../components/ProductPanel';
import { ProductComparisonWorkspace } from '../components/ProductComparisonWorkspace';
import { ProductDemandAnalysis } from '../components/ProductDemandAnalysis';
import { ProductPriceAnalysis } from '../components/ProductPriceAnalysis';
import { CommercialOpportunitiesWorkspace } from '../components/CommercialOpportunitiesWorkspace';
import { MobileFilterSheet } from '../components/MobileFilterSheet';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { SingleSelectFilter } from '../components/SingleSelectFilter';
import { money, number, shortDate } from '../lib/format';

const vectorKeys = Object.keys(VECTOR_LABELS) as VectorKey[];

type CatalogSort = 'rotation' | 'sales' | 'kilos' | 'buyers' | 'stock' | 'price' | 'lastSale' | 'name' | 'original';
type ProductMode = 'inventory' | 'demand' | 'prices' | 'opportunities' | 'catalog' | 'compare' | 'vectors';

export function ProductsView({ products, clients, snapshotDate, tutorialVectorMode = false, focusProductId = null, focusFamily = '', comparisonProductIds, comparisonRequest = 0, onComparisonChange, onFocusFamilyConsumed, onOpenProduct, onOpenBrand, onOpenClient, onOpenSeller, onDataChanged }: {
  products: Product[];
  clients: Client[];
  snapshotDate: string;
  tutorialVectorMode?: boolean;
  focusProductId?: string | null;
  focusFamily?: string;
  comparisonProductIds: string[];
  comparisonRequest?: number;
  onComparisonChange: (ids: string[]) => void;
  onFocusFamilyConsumed?: () => void;
  onOpenProduct: (product: Product) => void;
  onOpenBrand: (brand: string) => void;
  onOpenClient: (client: Client) => void;
  onOpenSeller: (seller: string) => void;
  onDataChanged?: () => void | Promise<void>;
}) {
  const [mode, setMode] = useState<ProductMode>('inventory');
  const productModeNavRef = useRef<HTMLElement>(null);
  const analysisMenuRef = useRef<HTMLDetailsElement>(null);
  const [selectedId, setSelectedId] = useState(() => [...products].sort((a, b) => b.monthlyUnits - a.monthlyUnits)[0]?.id || '');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [family, setFamily] = useState('');
  const [brand, setBrand] = useState('');
  const [line, setLine] = useState('');
  const [group, setGroup] = useState('');
  const [masterStatus, setMasterStatus] = useState('');
  const [inventoryStatus, setInventoryStatus] = useState('');
  const [availability, setAvailability] = useState<'commercial' | 'stock' | 'all'>('commercial');
  const [sort, setSort] = useState<CatalogSort>('rotation');
  const [selectedVector, setSelectedVector] = useState<VectorKey>('perros');
  const [vectorPage, setVectorPage] = useState(1);
  const [inventoryReviews, setInventoryReviews] = useState<Record<string, InventoryAlertReview>>({});
  const [inventoryReviewsLoaded, setInventoryReviewsLoaded] = useState(false);
  const [inventoryReviewLoadError, setInventoryReviewLoadError] = useState('');
  const [advancedMode, setAdvancedMode] = useState(() => localStorage.getItem('salice-products-advanced-v010') === 'enabled');
  const pageSize = 100;

  useEffect(() => {
    fetch('/api/inventory-alert-reviews')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error()))
      .then((payload: { reviews: InventoryAlertReview[] }) => setInventoryReviews(Object.fromEntries(payload.reviews.map((review) => [review.productId, review]))))
      .catch(() => setInventoryReviewLoadError('No se pudieron recuperar las revisiones de inventario. Las señales comerciales siguen visibles.'))
      .finally(() => setInventoryReviewsLoaded(true));
  }, []);

  useEffect(() => {
    if (tutorialVectorMode) setMode('vectors');
  }, [tutorialVectorMode]);

  useEffect(() => {
    localStorage.setItem('salice-products-advanced-v010', advancedMode ? 'enabled' : 'disabled');
    if (!advancedMode && mode === 'vectors') setMode('catalog');
  }, [advancedMode, mode]);

  useEffect(() => {
    if (comparisonRequest > 0) setMode('compare');
  }, [comparisonRequest]);

  useEffect(() => {
    if (!window.matchMedia('(max-width: 900px)').matches) return undefined;
    const frame = window.requestAnimationFrame(() => {
      productModeNavRef.current?.querySelector<HTMLElement>(':scope > .active')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mode]);

  useEffect(() => {
    const availableIds = new Set(products.map((product) => product.id));
    const validIds = comparisonProductIds.filter((id) => availableIds.has(id)).slice(0, 4);
    if (validIds.length !== comparisonProductIds.length || validIds.some((id, index) => id !== comparisonProductIds[index])) {
      onComparisonChange(validIds);
    }
  }, [comparisonProductIds, onComparisonChange, products]);

  useEffect(() => {
    if (focusProductId && products.some((product) => product.id === focusProductId)) {
      setSelectedId(focusProductId);
      if (mode !== 'compare' && mode !== 'demand' && mode !== 'prices' && mode !== 'opportunities') setMode('catalog');
    }
  }, [focusProductId, products]);

  useEffect(() => {
    if (!focusFamily) return;
    setFamily(focusFamily);
    setMode('catalog');
    setPage(1);
    onFocusFamilyConsumed?.();
  }, [focusFamily, onFocusFamilyConsumed]);

  const selected = products.find((product) => product.id === selectedId) || products[0];
  const families = useMemo(() => [...new Set(products.map((product) => product.family))].sort((a, b) => a.localeCompare(b, 'es')), [products]);
  const brands = useMemo(() => [...new Set(products.map((product) => product.brand).filter((value) => !value.startsWith('Sin ')))].sort((a, b) => a.localeCompare(b, 'es')), [products]);
  const lines = useMemo(() => [...new Set(products.map((product) => product.line).filter((value) => value && !value.startsWith('Sin ')))].sort((a, b) => a.localeCompare(b, 'es')), [products]);
  const groups = useMemo(() => [...new Set(products.map((product) => product.group).filter((value) => value && !value.startsWith('Sin ')))].sort((a, b) => a.localeCompare(b, 'es')), [products]);
  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const filtered = products
    .map((product, originalIndex) => ({ product, originalIndex, inventoryDecision: classifyInventoryProduct(product) }))
    .filter(({ product }) => `${product.name} ${product.description} ${product.family} ${product.subcategory} ${product.brand} ${product.line} ${product.commercialFamily} ${product.group} ${product.pack} ${productPresentationLabel(product)} ${product.sku}`.toLocaleLowerCase('es').includes(normalizedQuery))
    .filter(({ product }) => matchesMultiFilter(product.family, family))
    .filter(({ product }) => matchesMultiFilter(product.brand, brand))
    .filter(({ product }) => matchesMultiFilter(product.line, line))
    .filter(({ product }) => matchesMultiFilter(product.group, group))
    .filter(({ product }) => matchesMultiFilter(product.masterStatus, masterStatus))
    .filter(({ inventoryDecision }) => matchesMultiFilter(inventoryDecision.status, inventoryStatus))
    .filter(({ product }) => availability === 'all' || (availability === 'stock' ? productAvailableStock(product) > 0 : product.commercialStatus ? product.commercialStatus === 'commercializable' : productAvailableStock(product) > 0 && product.price > 0))
    .sort((left, right) => {
      const a = left.product;
      const b = right.product;
      if (sort === 'stock') return productAvailableStock(b) - productAvailableStock(a) || b.monthlyUnits - a.monthlyUnits;
      if (sort === 'price') return b.price - a.price || a.name.localeCompare(b.name, 'es');
      if (sort === 'sales') return b.sales90d - a.sales90d || b.monthlyUnits - a.monthlyUnits;
      if (sort === 'kilos') return (b.kiloDataStatus !== 'unavailable' ? b.kilos90d ?? 0 : -1) - (a.kiloDataStatus !== 'unavailable' ? a.kilos90d ?? 0 : -1) || b.sales90d - a.sales90d;
      if (sort === 'buyers') return b.clients90d - a.clients90d || b.sales90d - a.sales90d;
      if (sort === 'lastSale') return b.lastSaleAt.localeCompare(a.lastSaleAt) || b.sales90d - a.sales90d;
      if (sort === 'name') return a.name.localeCompare(b.name, 'es');
      if (sort === 'original') return left.originalIndex - right.originalIndex;
      return b.monthlyUnits - a.monthlyUnits || b.sales90d - a.sales90d || productAvailableStock(b) - productAvailableStock(a);
    })
    .map(({ product }) => product);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const ranking = useMemo(() => [...products].sort((a, b) => (
    b.vector[selectedVector] - a.vector[selectedVector]
    || b.monthlyUnits - a.monthlyUnits
    || a.name.localeCompare(b.name, 'es')
  )), [products, selectedVector]);
  const vectorPageSize = 50;
  const vectorPageCount = Math.max(1, Math.ceil(ranking.length / vectorPageSize));
  const currentVectorPage = Math.min(vectorPage, vectorPageCount);
  const visibleRanking = ranking.slice((currentVectorPage - 1) * vectorPageSize, currentVectorPage * vectorPageSize);

  const openProduct = (id: string) => {
    setSelectedId(id);
    setMode('catalog');
  };
  const savedFilters = { mode, query, family, brand, line, group, masterStatus, inventoryStatus, availability, sort, selectedVector, selectedProduct: selected.id };
  const applySaved = (saved: Record<string, string>) => {
    setMode(saved.mode === 'vectors' ? 'vectors' : saved.mode === 'compare' ? 'compare' : saved.mode === 'opportunities' ? 'opportunities' : saved.mode === 'prices' ? 'prices' : saved.mode === 'demand' ? 'demand' : saved.mode === 'catalog' ? 'catalog' : 'inventory');
    setQuery(saved.query ?? '');
    setFamily(saved.family ?? '');
    setBrand(saved.brand ?? '');
    setLine(saved.line ?? '');
    setGroup(saved.group ?? '');
    setMasterStatus(saved.masterStatus ?? '');
    setInventoryStatus(saved.inventoryStatus ?? '');
    setAvailability((saved.availability as typeof availability) || 'commercial');
    setSort((saved.sort as typeof sort) || 'rotation');
    if (vectorKeys.includes(saved.selectedVector as VectorKey)) setSelectedVector(saved.selectedVector as VectorKey);
    if (saved.selectedProduct && products.some((product) => product.id === saved.selectedProduct)) setSelectedId(saved.selectedProduct);
    setPage(1);
    setVectorPage(1);
  };

  if (!selected) return null;

  const selectMode = (nextMode: ProductMode) => {
    setMode(nextMode);
    analysisMenuRef.current?.removeAttribute('open');
  };
  const secondaryMode = mode === 'demand' || mode === 'prices' || mode === 'vectors';
  const secondaryModeLabel = mode === 'demand'
    ? 'Demanda y rotación'
    : mode === 'prices'
      ? 'Precios y evolución'
      : mode === 'vectors'
        ? 'Clasificación avanzada'
        : 'Más análisis';
  const catalogActiveFilterCount = [family, brand, line, group, masterStatus, inventoryStatus].filter(Boolean).length
    + (availability === 'commercial' ? 0 : 1)
    + (sort === 'rotation' ? 0 : 1);
  const selectCatalogProduct = (product: Product) => {
    setSelectedId(product.id);
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 900px)').matches) onOpenProduct(product);
  };

  const modeNavigation = <nav ref={productModeNavRef} className="product-mode-nav" aria-label="Secciones de Productos">
    <button className={mode === 'inventory' ? 'active' : ''} aria-current={mode === 'inventory' ? 'page' : undefined} onClick={() => selectMode('inventory')}>Inventario</button>
    <button className={mode === 'catalog' ? 'active' : ''} aria-current={mode === 'catalog' ? 'page' : undefined} onClick={() => selectMode('catalog')}>Catálogo</button>
    <button className={mode === 'opportunities' ? 'active' : ''} aria-current={mode === 'opportunities' ? 'page' : undefined} onClick={() => selectMode('opportunities')}>Oportunidades</button>
    <button className={mode === 'compare' ? 'active' : ''} aria-current={mode === 'compare' ? 'page' : undefined} onClick={() => selectMode('compare')}>Comparar <span className="product-nav-count">{comparisonProductIds.length}</span></button>
    <details ref={analysisMenuRef} className={`product-mode-more ${secondaryMode ? 'active' : ''}`}>
      <summary aria-current={secondaryMode ? 'page' : undefined}><BarChart3 size={14} /><span>{secondaryModeLabel}</span><ChevronDown size={14} /></summary>
      <div className="product-mode-menu">
        <span>Análisis del catálogo</span>
        <button className={mode === 'demand' ? 'active' : ''} onClick={() => selectMode('demand')}><strong>Demanda y rotación</strong><small>Movimiento, compradores y estabilidad</small></button>
        <button className={mode === 'prices' ? 'active' : ''} onClick={() => selectMode('prices')}><strong>Precios y evolución</strong><small>Referencia, efectivo e historia</small></button>
        <button className={`product-advanced-toggle ${advancedMode ? 'active' : ''}`} role="switch" aria-checked={advancedMode} onClick={() => setAdvancedMode((value) => !value)}><strong>Modo avanzado · {advancedMode ? 'activado' : 'desactivado'}</strong><small>Clasificación, evidencia y correcciones auditables</small></button>
        {advancedMode && <><span>Uso avanzado</span><button className={mode === 'vectors' ? 'active' : ''} onClick={() => selectMode('vectors')}><strong>Clasificación avanzada</strong><small>Dimensiones, evidencia y auditoría</small></button></>}
      </div>
    </details>
  </nav>;

  if (mode === 'inventory') return <div className="page-view products-workspace">{modeNavigation}<InventoryDecisionTray products={products} reviews={inventoryReviews} loadError={inventoryReviewLoadError} onReviewSaved={(review) => setInventoryReviews((current) => ({ ...current, [review.productId]: review }))} onOpenProduct={onOpenProduct} onOpenBrand={onOpenBrand} /></div>;

  if (mode === 'demand') return <div className="page-view products-workspace">{modeNavigation}<ProductDemandAnalysis products={products} onOpenProduct={onOpenProduct} onOpenBrand={onOpenBrand} onOpenFamily={(value) => { setFamily(value); setMode('catalog'); setPage(1); }} onOpenGroup={(value) => { setQuery(value); setMode('catalog'); setPage(1); }} /></div>;

  if (mode === 'prices') return <div className="page-view products-workspace">{modeNavigation}<ProductPriceAnalysis products={products} onOpenProduct={onOpenProduct} /></div>;

  if (mode === 'opportunities') return <div className="page-view products-workspace">{modeNavigation}<CommercialOpportunitiesWorkspace clients={clients} products={products} onOpenClient={onOpenClient} onOpenSeller={onOpenSeller} onOpenBrand={onOpenBrand} onOpenProduct={onOpenProduct} /></div>;

  if (mode === 'compare') return <div className="page-view products-workspace">{modeNavigation}<ProductComparisonWorkspace products={products} selectedIds={comparisonProductIds} onSelectionChange={onComparisonChange} onOpenProduct={onOpenProduct} onOpenBrand={onOpenBrand} /></div>;

  if (mode === 'vectors') {
    const matchingProducts = products.filter((product) => product.vector[selectedVector] > 0).length;
    return (
      <div className="page-view vector-explorer-page products-workspace" data-tour="vector-explorer">
        {modeNavigation}
        <header className="data-card vector-explorer-hero">
          <div><span className="section-kicker"><BarChart3 size={15} /> Modo avanzado</span><h2>Clasificación explicable de productos</h2><p>{number(vectorKeys.length)} atributos de edad, porte, especie, posicionamiento, uso, necesidades y sabores con respaldo auditable.</p></div>
        </header>
        <SavedViewsBar viewKey="products" filters={savedFilters} onApply={applySaved} />
        <div className="vector-explorer-layout">
          <section className="data-card vector-dimension-index">
            <div className="data-card-header"><div><span className="section-kicker"><ListFilter size={14} /> Atributos usados</span><h2>Grupos del perfil</h2></div><span className="count-badge">{number(vectorKeys.length)} atributos</span></div>
            <div className="vector-group-index">{VECTOR_GROUPS.map((group) => <section key={group.id}><header><strong>{group.label}</strong><small>{group.description}</small></header><div className="vector-dimension-grid">{group.keys.map((key) => {
              const matches = products.filter((product) => product.vector[key] > 0).length;
              return <button key={key} className={selectedVector === key ? 'active' : ''} onClick={() => { setSelectedVector(key); setVectorPage(1); }}><span><strong>{VECTOR_LABELS[key]}</strong><small>{VECTOR_DESCRIPTIONS[key]}</small></span><em>{matches}</em></button>;
            })}</div></section>)}</div>
          </section>
          <section className="data-card vector-ranking-card">
            <div className="data-card-header"><div><span className="section-kicker">Ranking completo · 100 → 0</span><h2>{VECTOR_LABELS[selectedVector]}</h2><p>{VECTOR_DESCRIPTIONS[selectedVector]}</p></div><span className="count-badge">{matchingProducts} con afinidad</span></div>
            <div className="vector-ranking-table-scroll">
              <div className="vector-ranking-head"><span>#</span><span>Producto</span><span>Familia</span><span>Afinidad</span><span>Rotación</span><span /></div>
              <div className="vector-ranking-list">
                {visibleRanking.map((product, index) => {
                  const score = product.vector[selectedVector];
                  const rank = (currentVectorPage - 1) * vectorPageSize + index + 1;
                  return <article key={product.id} className={score ? '' : 'zero-score'}><strong className="vector-rank-number">{rank}</strong><div className="vector-ranked-product"><button className="entity-link" onClick={() => openProduct(product.id)}>{product.name}</button><span>{product.sku} · <button className="entity-link inline-entity" onClick={() => onOpenBrand(product.brand)}>{product.brand}</button></span></div><span>{product.family}</span><div className="vector-ranking-score" title={product.vectorMeta.evidence[selectedVector]?.join(' · ') || 'Sin evidencia asignada'}><div><i style={{ width: `${score}%` }} /></div><strong>{score}%</strong></div><span>{product.monthlyUnits} u./mes</span><button className="icon-button" aria-label={`Ver ${product.name}`} onClick={() => openProduct(product.id)}><ChevronRight size={16} /></button></article>;
                })}
              </div>
            </div>
            <div className="table-pagination"><span>Mostrando {(currentVectorPage - 1) * vectorPageSize + 1}–{(currentVectorPage - 1) * vectorPageSize + visibleRanking.length} de {ranking.length}</span><div><button className="button secondary" disabled={currentVectorPage === 1} onClick={() => setVectorPage((value) => Math.max(1, value - 1))}>Anterior</button><strong>{currentVectorPage} / {vectorPageCount}</strong><button className="button secondary" disabled={currentVectorPage === vectorPageCount} onClick={() => setVectorPage((value) => Math.min(vectorPageCount, value + 1))}>Siguiente</button></div></div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page-view products-workspace">
      {modeNavigation}
      <div className="product-layout products-mode-body product-layout-v3">
      <section className="product-catalog data-card" data-tour="product-catalog">
        <div className="data-card-header stacked product-catalog-controls">
          <div><span className="section-kicker"><Boxes size={14} /> Catálogo operativo</span><h2>{number(filtered.length)} de {number(products.length)} productos</h2><p>Elegí un producto para consultar toda su información en la ficha de la derecha.</p></div>
          <label className="inline-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Buscar producto, SKU, marca o presentación…" /></label>
          <MobileFilterSheet title="Filtrar productos" description="Acotá el catálogo sin perder el listado de vista." activeCount={catalogActiveFilterCount}>
            <div className="product-filter-grid product-filter-grid-v3 product-filter-primary"><MultiSelectFilter label="Rubro" value={family} options={families} onChange={(value) => { setFamily(value); setPage(1); }} /><MultiSelectFilter label="Marca" value={brand} options={brands} onChange={(value) => { setBrand(value); setPage(1); }} /><SingleSelectFilter label="Disponibilidad" value={availability} options={[{ value: 'commercial', label: 'Comercializable observable' }, { value: 'stock', label: 'Disponible para vender' }, { value: 'all', label: 'Todo el catálogo operativo' }]} onChange={(value) => { setAvailability(value as typeof availability); setPage(1); }} /><SingleSelectFilter label="Orden" value={sort} options={[{ value: 'rotation', label: 'Mayor rotación' }, { value: 'sales', label: 'Mayor venta 90d' }, { value: 'kilos', label: 'Más kilos 90d' }, { value: 'buyers', label: 'Más compradores' }, { value: 'stock', label: 'Mayor disponibilidad' }, { value: 'price', label: 'Mayor precio' }, { value: 'lastSale', label: 'Venta más reciente' }, { value: 'name', label: 'Nombre A–Z' }, { value: 'original', label: 'Orden original' }]} onChange={(value) => { setSort(value as CatalogSort); setPage(1); }} /></div>
            <details className="product-more-filters"><summary><SlidersHorizontal size={14} /> Más filtros{[line, group, masterStatus, inventoryStatus].filter(Boolean).length ? ` · ${[line, group, masterStatus, inventoryStatus].filter(Boolean).length} activos` : ''}<ChevronDown size={14} /></summary><div className="product-filter-grid product-filter-grid-v3"><MultiSelectFilter label="Línea" value={line} options={lines} onChange={(value) => { setLine(value); setPage(1); }} /><MultiSelectFilter label="Grupo" value={group} options={groups} onChange={(value) => { setGroup(value); setPage(1); }} /><MultiSelectFilter label="Estado maestro" value={masterStatus} options={[{ value: 'active', label: 'Activo' }, { value: 'inactive', label: 'Inactivo' }, { value: 'unknown', label: 'Sin estado' }]} onChange={(value) => { setMasterStatus(value); setPage(1); }} /><MultiSelectFilter label="Inventario" value={inventoryStatus} options={[{ value: 'no_stock_with_demand', label: 'Sin disponibilidad con demanda' }, { value: 'critical_coverage', label: 'Cobertura crítica' }, { value: 'low_coverage', label: 'Cobertura baja' }, { value: 'adequate_coverage', label: 'Cobertura adecuada' }, { value: 'high_coverage', label: 'Cobertura alta' }, { value: 'stock_without_movement', label: 'Disponible sin movimiento' }, { value: 'new_or_insufficient_history', label: 'Sin historia suficiente' }, { value: 'insufficient_data', label: 'Datos insuficientes' }, { value: 'out_of_assortment', label: 'Fuera de surtido/inactivo' }]} onChange={(value) => { setInventoryStatus(value); setPage(1); }} /></div></details>
            <SavedViewsBar viewKey="products" filters={savedFilters} onApply={applySaved} />
          </MobileFilterSheet>
        </div>
        <div className="product-list">
          {visible.map((product) => <article key={product.id} role="button" tabIndex={0} className={`product-list-row ${product.id === selected.id ? 'active' : ''}`} onClick={() => selectCatalogProduct(product)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectCatalogProduct(product); } }}>
            <div className="product-thumb">{product.family === 'Higiene' ? 'HI' : product.family === 'Accesorios' ? 'AC' : product.vector.gatos > product.vector.perros ? 'GA' : 'PE'}</div>
            <div><strong>{product.name}</strong><span><button className="entity-link inline-entity" onClick={(event) => { event.stopPropagation(); onOpenBrand(product.brand); }}>{product.brand}</button> · {product.sku} · {productPresentationLabel(product)}</span><small>{number(product.monthlyUnits)} u./mes · {product.kiloDataStatus !== 'unavailable' ? `${number(product.kilos90d ?? 0, 2)} kg estimados/90d` : 'sin conversión a kilos'} · {number(product.clients90d)} compradores · última {product.lastSaleAt ? shortDate(product.lastSaleAt) : 'sin detalle'}</small></div>
            <div className="product-list-numbers"><strong title="Precio del producto">{product.price > 0 ? money(product.price) : 'Precio no informado'}</strong><span>{product.referencePricePerKg ? `${money(product.referencePricePerKg)}/kg propio` : 'Precio/kg no calculable'}</span><small>{product.competitorReferencePricePerKg ? `${money(product.competitorReferencePricePerKg)}/kg competencia` : 'Sin referencia competitiva'} · {money(product.sales90d, true)} / 90d</small></div>
            <ChevronRight size={17} />
          </article>)}
        </div>
        <div className="compact-pagination"><button disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><strong>{currentPage} / {pageCount}</strong><button disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Siguiente</button></div>
      </section>
      <section className="product-detail"><ProductPanel product={selected} products={products} clients={clients} snapshotDate={snapshotDate} inventoryReview={inventoryReviewsLoaded ? (inventoryReviews[selected.id] ?? null) : undefined} onOpenProduct={(product) => setSelectedId(product.id)} onCompareProduct={(product) => { if (!comparisonProductIds.includes(product.id) && comparisonProductIds.length < 4) onComparisonChange([...comparisonProductIds, product.id]); setMode('compare'); }} comparisonSelectedIds={comparisonProductIds} onOpenBrand={onOpenBrand} onOpenFamily={(value) => { setFamily(value); setMode('catalog'); setPage(1); }} onOpenClient={onOpenClient} onDataChanged={onDataChanged} /></section>
      </div>
    </div>
  );
}
