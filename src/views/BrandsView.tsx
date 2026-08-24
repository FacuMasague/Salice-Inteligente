import { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, ChevronRight, Database, Info, PackageCheck, Search, Store, TrendingUp, Warehouse } from 'lucide-react';
import type { BrandAnalysisPayload, BrandAnalysisRow } from '../../shared/brand-analysis';
import type { Product } from '../../shared/models';
import { matchesMultiFilter } from '../../shared/multi-filter';
import { MobileFilterSheet } from '../components/MobileFilterSheet';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { SingleSelectFilter } from '../components/SingleSelectFilter';
import { compactDate, money, number } from '../lib/format';

interface BrandCatalogSummary {
  name: string;
  products: Product[];
  productCount: number;
  activeProducts: number;
  commercialProducts: number;
  stock: number;
  families: string[];
}

type BrandOrder = 'sales' | 'kilos' | 'units' | 'stock' | 'products' | 'name';
type ProductOrder = 'sales' | 'kilos' | 'units' | 'buyers' | 'stock' | 'name';

function summarize(products: Product[]): BrandCatalogSummary[] {
  const grouped = new Map<string, Product[]>();
  for (const product of products) {
    const name = product.brand?.trim();
    if (!name || name.startsWith('Sin ')) continue;
    grouped.set(name, [...(grouped.get(name) ?? []), product]);
  }
  return [...grouped.entries()].map(([name, rows]) => ({
    name,
    products: rows,
    productCount: rows.length,
    activeProducts: rows.filter((product) => product.masterStatus === 'active').length,
    commercialProducts: rows.filter((product) => product.commercialStatus === 'commercializable').length,
    stock: rows.reduce((sum, product) => sum + product.stock, 0),
    families: [...new Set(rows.map((product) => product.family))].sort((a, b) => a.localeCompare(b, 'es')),
  }));
}

export function BrandsView({ products, focusBrand = '', onOpenProduct }: {
  products: Product[];
  focusBrand?: string;
  onOpenProduct: (product: Product | string) => void;
}) {
  const catalogBrands = useMemo(() => summarize(products), [products]);
  const [analysis, setAnalysis] = useState<BrandAnalysisPayload | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('');
  const [availability, setAvailability] = useState('commercial');
  const [order, setOrder] = useState<BrandOrder>('sales');
  const [selectedName, setSelectedName] = useState(() => focusBrand || '');
  const [productQuery, setProductQuery] = useState('');
  const [productGroup, setProductGroup] = useState('');
  const [productFamily, setProductFamily] = useState('');
  const [productLine, setProductLine] = useState('');
  const [productAvailability, setProductAvailability] = useState('all');
  const [productStatus, setProductStatus] = useState('');
  const [productOrder, setProductOrder] = useState<ProductOrder>('sales');
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/brands/analysis', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'No se pudo calcular la participación por marca.');
        return response.json() as Promise<BrandAnalysisPayload>;
      })
      .then(setAnalysis)
      .catch((cause) => { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setAnalysisError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, []);

  const analysisByBrand = useMemo(() => new Map((analysis?.brands ?? []).map((brand) => [brand.name, brand])), [analysis]);
  const revealDetailWhenStacked = () => {
    if (typeof window === 'undefined' || !window.matchMedia?.('(max-width: 1180px)').matches) return;
    window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  useEffect(() => {
    if (focusBrand && catalogBrands.some((brand) => brand.name === focusBrand)) {
      setSelectedName(focusBrand);
      revealDetailWhenStacked();
    }
  }, [catalogBrands, focusBrand]);

  const families = useMemo(() => [...new Set(products.map((product) => product.family))].sort((a, b) => a.localeCompare(b, 'es')), [products]);
  const filtered = catalogBrands
    .filter((brand) => `${brand.name} ${brand.families.join(' ')}`.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')))
    .filter((brand) => !family || brand.products.some((product) => matchesMultiFilter(product.family, family)))
    .filter((brand) => availability === 'all' || (availability === 'stock' ? brand.stock > 0 : brand.commercialProducts > 0))
    .sort((a, b) => {
      const aa = analysisByBrand.get(a.name);
      const bb = analysisByBrand.get(b.name);
      if (order === 'kilos') return (bb?.kilos ?? 0) - (aa?.kilos ?? 0);
      if (order === 'units') return (bb?.units ?? 0) - (aa?.units ?? 0);
      if (order === 'stock') return b.stock - a.stock;
      if (order === 'products') return b.productCount - a.productCount;
      if (order === 'name') return a.name.localeCompare(b.name, 'es');
      return (bb?.netAmount ?? 0) - (aa?.netAmount ?? 0);
    });
  const selected = catalogBrands.find((brand) => brand.name === selectedName) ?? filtered[0] ?? catalogBrands[0];
  const commercial: BrandAnalysisRow | undefined = selected ? analysisByBrand.get(selected.name) : undefined;
  const productMetrics = new Map((commercial?.products ?? []).map((product) => [product.productId, product]));
  const productGroups = [...new Set((selected?.products ?? []).map((product) => product.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const productFamilies = [...new Set((selected?.products ?? []).map((product) => product.family).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const productLines = [...new Set((selected?.products ?? []).map((product) => product.line).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const selectedProducts = selected ? [...selected.products]
    .filter((product) => `${product.name} ${product.sku} ${product.family} ${product.group} ${product.line}`.toLocaleLowerCase('es').includes(productQuery.trim().toLocaleLowerCase('es')))
    .filter((product) => matchesMultiFilter(product.group, productGroup))
    .filter((product) => matchesMultiFilter(product.family, productFamily))
    .filter((product) => matchesMultiFilter(product.line, productLine))
    .filter((product) => matchesMultiFilter(product.masterStatus, productStatus))
    .filter((product) => productAvailability === 'all' || (productAvailability === 'stock' ? product.stock > 0 : product.commercialStatus === 'commercializable'))
    .sort((a, b) => {
      const aa = productMetrics.get(a.id);
      const bb = productMetrics.get(b.id);
      if (productOrder === 'kilos') return (bb?.kilos ?? 0) - (aa?.kilos ?? 0);
      if (productOrder === 'units') return (bb?.units ?? 0) - (aa?.units ?? 0);
      if (productOrder === 'buyers') return (bb?.buyers ?? 0) - (aa?.buyers ?? 0);
      if (productOrder === 'stock') return b.stock - a.stock;
      if (productOrder === 'name') return a.name.localeCompare(b.name, 'es');
      return (bb?.netAmount ?? 0) - (aa?.netAmount ?? 0);
    }) : [];
  const filters = { query, family, availability, order, productQuery, productGroup, productFamily, productLine, productAvailability, productStatus, productOrder, selectedBrand: selected?.name ?? '' };
  const applySaved = (saved: Record<string, string>) => {
    setQuery(saved.query ?? ''); setFamily(saved.family ?? ''); setAvailability(saved.availability ?? 'commercial');
    setOrder((saved.order as BrandOrder) || 'sales'); setProductQuery(saved.productQuery ?? '');
    setProductGroup(saved.productGroup ?? ''); setProductFamily(saved.productFamily ?? ''); setProductLine(saved.productLine ?? '');
    setProductAvailability(saved.productAvailability ?? 'all'); setProductStatus(saved.productStatus ?? '');
    setProductOrder((saved.productOrder as ProductOrder) || 'sales');
    if (saved.selectedBrand && catalogBrands.some((brand) => brand.name === saved.selectedBrand)) setSelectedName(saved.selectedBrand);
  };
  const directoryActiveFilterCount = (family ? 1 : 0) + (availability === 'commercial' ? 0 : 1) + (order === 'sales' ? 0 : 1);
  const productActiveFilterCount = [productGroup, productFamily, productLine, productStatus].filter(Boolean).length
    + (productAvailability === 'all' ? 0 : 1)
    + (productOrder === 'sales' ? 0 : 1);

  if (!selected) return <div className="page-view"><section className="data-card empty-state"><Store size={28} /><h2>No hay marcas disponibles</h2><p>Los productos del catálogo actual no tienen una marca utilizable.</p></section></div>;
  return <div className="page-view brand-page" data-tour="brands-directory">
    <section className="data-card brand-directory-card">
      <div className="data-card-header stacked"><div><span className="section-kicker"><Store size={14} /> Directorio de marcas</span><h2>{filtered.length} de {catalogBrands.length} marcas</h2><p>Venta, kilos, productos y stock reunidos por marca.</p></div><label className="inline-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar marca o rubro…" /></label><MobileFilterSheet title="Filtrar marcas" description="Ajustá el directorio y recuperá tus vistas guardadas." activeCount={directoryActiveFilterCount}><div className="brand-filter-grid"><MultiSelectFilter label="Rubro" value={family} options={families} onChange={setFamily} /><SingleSelectFilter label="Disponibilidad" value={availability} options={[{ value: 'commercial', label: 'Comercializables' }, { value: 'stock', label: 'Con stock' }, { value: 'all', label: 'Todas' }]} onChange={setAvailability} /><SingleSelectFilter label="Orden" value={order} options={[{ value: 'sales', label: 'Mayor venta neta' }, { value: 'kilos', label: 'Más kilos' }, { value: 'units', label: 'Más unidades' }, { value: 'stock', label: 'Mayor stock' }, { value: 'products', label: 'Más productos' }, { value: 'name', label: 'Nombre A–Z' }]} onChange={(value) => setOrder(value as BrandOrder)} /></div><SavedViewsBar viewKey="brands" filters={filters} onApply={applySaved} /></MobileFilterSheet></div>
      <div className="brand-directory-list">{filtered.map((brand) => { const metrics = analysisByBrand.get(brand.name); return <button key={brand.name} className={brand.name === selected.name ? 'active' : ''} onClick={() => { setSelectedName(brand.name); revealDetailWhenStacked(); }}><div className="brand-monogram">{brand.name.slice(0, 2).toUpperCase()}</div><span><strong>{brand.name}</strong><small>{brand.productCount} productos · {brand.families.slice(0, 2).join(' · ')}</small></span><span className="brand-row-metrics"><strong>{metrics ? money(metrics.netAmount, true) : 'Sin detalle'}</strong><small>{metrics ? `${number(metrics.kilos, 2)} kg · 90d` : 'Base comercial no disponible'}</small></span><ChevronRight size={16} /></button>; })}</div>
    </section>
    <section ref={detailRef} className="brand-detail-column">
      <article className="data-card brand-hero"><div><span className="section-kicker"><Store size={14} /> Ficha de marca · 90 días</span><h2>{selected.name}</h2><p>{analysis ? `${compactDate(analysis.range.from)} → ${compactDate(analysis.range.through)}` : 'Calculando período comercial…'}</p></div><div className="brand-share"><strong>{commercial ? `${number(commercial.salesSharePercent, 2)}%` : '—'}</strong><span>de la venta neta total</span><strong>{commercial ? `${number(commercial.kiloSharePercent, 2)}%` : '—'}</strong><span>de los kilos totales</span></div></article>
      {analysisError && <div className="data-card demand-coverage-note attention"><Info size={17} /><div><strong>No se pudo abrir el análisis comercial de marcas</strong><span>{analysisError}</span></div></div>}
      {analysis && (analysis.unavailableDocumentCount > 0 || analysis.productsWithoutKiloConversion > 0) && <div className="data-card demand-coverage-note attention"><Info size={17} /><div><strong>Cobertura comercial parcial</strong><span>{analysis.unavailableDocumentCount > 0 ? `${number(analysis.unavailableDocumentCount)} comprobantes sin detalle no pueden atribuirse a una marca. ` : ''}{analysis.productsWithoutKiloConversion > 0 ? `${number(analysis.productsWithoutKiloConversion)} productos vendidos no tienen una presentación convertible a kilos.` : ''}</span></div></div>}
      <div className="brand-kpis"><article><TrendingUp size={18} /><span>Venta neta · 90 días</span><strong>{commercial ? money(commercial.netAmount) : '—'}</strong><small>facturas menos notas de crédito</small></article><article><PackageCheck size={18} /><span>Kilos netos estimados · 90 días</span><strong>{commercial ? `${number(commercial.kilos, 2)} kg` : '—'}</strong><small>{commercial ? `${number(commercial.units, 2)} unidades netas × presentación` : 'Sin detalle comercial'}</small></article><article><Boxes size={18} /><span>Productos</span><strong>{selected.productCount}</strong><small>{selected.commercialProducts} comercializables</small></article><article><Warehouse size={18} /><span>Stock disponible</span><strong>{number(selected.stock)}</strong><small>{selected.activeProducts} maestros activos</small></article></div>
      <section className="data-card brand-products-card"><div className="data-card-header stacked"><div><span className="section-kicker"><Boxes size={14} /> Productos de la marca</span><h2>{selectedProducts.length} productos visibles</h2><p>Los filtros actúan sobre el listado de la marca seleccionada.</p></div><label className="inline-search compact"><Search size={15} /><input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Buscar producto…" /></label><MobileFilterSheet title="Filtrar productos de la marca" description="Los filtros se aplican sólo a la marca seleccionada." activeCount={productActiveFilterCount}><div className="brand-filter-grid"><MultiSelectFilter label="Grupo" value={productGroup} options={productGroups} onChange={setProductGroup} /><MultiSelectFilter label="Rubro" value={productFamily} options={productFamilies} onChange={setProductFamily} /><MultiSelectFilter label="Línea" value={productLine} options={productLines} onChange={setProductLine} /><SingleSelectFilter label="Disponibilidad" value={productAvailability} options={[{ value: 'all', label: 'Todos' }, { value: 'stock', label: 'Con stock' }, { value: 'commercial', label: 'Comercializables' }]} onChange={setProductAvailability} /><MultiSelectFilter label="Estado maestro" value={productStatus} options={[{ value: 'active', label: 'Activo' }, { value: 'inactive', label: 'Inactivo' }, { value: 'unknown', label: 'Sin estado' }]} onChange={setProductStatus} /><SingleSelectFilter label="Orden" value={productOrder} options={[{ value: 'sales', label: 'Mayor venta' }, { value: 'kilos', label: 'Más kilos' }, { value: 'units', label: 'Más unidades' }, { value: 'buyers', label: 'Más compradores' }, { value: 'stock', label: 'Mayor stock' }, { value: 'name', label: 'Nombre A–Z' }]} onChange={(value) => setProductOrder(value as ProductOrder)} /></div></MobileFilterSheet></div><div className="brand-product-table"><header><span>Producto</span><span>Venta neta</span><span>Kilos</span><span>Unidades</span><span>Compradores</span><span>Stock</span><span /></header>{selectedProducts.map((product) => { const metrics = productMetrics.get(product.id); return <article key={product.id}><button className="entity-link product-entity-link" onClick={() => onOpenProduct(product)}><strong>{product.name}</strong><small>{product.sku} · {product.family} · {product.group} · {product.line}</small></button><span>{metrics ? money(metrics.netAmount, true) : '—'}</span><span>{metrics ? number(metrics.kilos, 2) : '—'}</span><span>{metrics ? number(metrics.units, 2) : '—'}</span><span>{metrics ? number(metrics.buyers) : '—'}</span><span className={product.stock <= 0 ? 'negative' : ''}>{number(product.stock)}</span><button className="icon-button" aria-label={`Abrir ${product.name}`} onClick={() => onOpenProduct(product)}><ChevronRight size={15} /></button></article>; })}</div></section>
      <details className="business-report-source-note"><summary><Database size={15} /> Información técnica de Marcas</summary><div><strong>Cómo se calculan las participaciones</strong><span>“Compradores” cuenta clientes únicos por producto. Los porcentajes incluyen “Sin marca informada” en el total y no se recalculan al filtrar los productos de la marca. La venta neta considera facturas menos notas de crédito.</span></div></details>
    </section>
  </div>;
}
