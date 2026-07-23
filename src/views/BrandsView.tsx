import { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, ChevronRight, PackageCheck, Search, Store, TrendingUp, Warehouse } from 'lucide-react';
import type { Product } from '../../shared/models';
import { matchesMultiFilter } from '../../shared/multi-filter';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { SingleSelectFilter } from '../components/SingleSelectFilter';
import { money, shortDate } from '../lib/format';

interface BrandSummary {
  name: string;
  products: Product[];
  productCount: number;
  activeProducts: number;
  commercialProducts: number;
  stock: number;
  units90d: number;
  monthlyUnits: number;
  sales90d: number;
  productClientReach: number;
  lastSaleAt: string;
  families: string[];
}

type BrandOrder = 'sales' | 'units' | 'stock' | 'products' | 'name';

function usefulBrand(value: string) {
  return value && !value.startsWith('Sin ') ? value : '';
}

function summarize(products: Product[]): BrandSummary[] {
  const grouped = new Map<string, Product[]>();
  for (const product of products) {
    const brand = usefulBrand(product.brand);
    if (!brand) continue;
    grouped.set(brand, [...(grouped.get(brand) ?? []), product]);
  }
  return [...grouped.entries()].map(([name, rows]) => ({
    name,
    products: rows,
    productCount: rows.length,
    activeProducts: rows.filter((product) => product.masterStatus === 'active').length,
    commercialProducts: rows.filter((product) => product.stock > 0 && product.price > 0).length,
    stock: rows.reduce((sum, product) => sum + product.stock, 0),
    units90d: rows.reduce((sum, product) => sum + product.units90d, 0),
    monthlyUnits: rows.reduce((sum, product) => sum + product.monthlyUnits, 0),
    sales90d: rows.reduce((sum, product) => sum + product.sales90d, 0),
    productClientReach: rows.reduce((sum, product) => sum + product.clients90d, 0),
    lastSaleAt: rows.map((product) => product.lastSaleAt).filter(Boolean).sort().at(-1) ?? '',
    families: [...new Set(rows.map((product) => product.family))].sort((a, b) => a.localeCompare(b, 'es')),
  }));
}

export function BrandsView({ products, focusBrand = '', onOpenProduct }: {
  products: Product[];
  focusBrand?: string;
  onOpenProduct: (product: Product | string) => void;
}) {
  const allBrands = useMemo(() => summarize(products), [products]);
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('');
  const [availability, setAvailability] = useState('commercial');
  const [order, setOrder] = useState<BrandOrder>('sales');
  const [selectedName, setSelectedName] = useState(() => focusBrand || [...allBrands].sort((a, b) => b.sales90d - a.sales90d)[0]?.name || '');
  const [productQuery, setProductQuery] = useState('');
  const detailRef = useRef<HTMLElement>(null);

  const revealDetailWhenStacked = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 1180px)').matches) return;
    window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  useEffect(() => {
    if (focusBrand && allBrands.some((brand) => brand.name === focusBrand)) {
      setSelectedName(focusBrand);
      revealDetailWhenStacked();
    }
  }, [allBrands, focusBrand]);

  const families = useMemo(() => [...new Set(products.map((product) => product.family))].sort((a, b) => a.localeCompare(b, 'es')), [products]);
  const filtered = allBrands
    .filter((brand) => `${brand.name} ${brand.families.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((brand) => !family || brand.products.some((product) => matchesMultiFilter(product.family, family)))
    .filter((brand) => availability === 'all' || (availability === 'stock' ? brand.stock > 0 : brand.commercialProducts > 0))
    .sort((a, b) => order === 'units' ? b.units90d - a.units90d
      : order === 'stock' ? b.stock - a.stock
        : order === 'products' ? b.productCount - a.productCount
          : order === 'name' ? a.name.localeCompare(b.name, 'es')
            : b.sales90d - a.sales90d);
  const selected = allBrands.find((brand) => brand.name === selectedName) ?? filtered[0] ?? allBrands[0];
  const totalSales90d = allBrands.reduce((sum, brand) => sum + brand.sales90d, 0);
  const selectedProducts = selected ? [...selected.products]
    .filter((product) => `${product.name} ${product.sku} ${product.family} ${product.line}`.toLowerCase().includes(productQuery.trim().toLowerCase()))
    .sort((a, b) => b.sales90d - a.sales90d || b.units90d - a.units90d || a.name.localeCompare(b.name, 'es')) : [];
  const filters = { query, family, availability, order, productQuery, selectedBrand: selected?.name ?? '' };
  const applySaved = (saved: Record<string, string>) => {
    setQuery(saved.query ?? '');
    setFamily(saved.family ?? '');
    setAvailability(saved.availability ?? 'commercial');
    setOrder((saved.order as BrandOrder) || 'sales');
    setProductQuery(saved.productQuery ?? '');
    if (saved.selectedBrand && allBrands.some((brand) => brand.name === saved.selectedBrand)) setSelectedName(saved.selectedBrand);
  };

  if (!selected) return <div className="page-view"><section className="data-card empty-state"><Store size={28} /><h2>No hay marcas verificables</h2><p>GESI no entregó una marca utilizable para el catálogo actual.</p></section></div>;

  return <div className="page-view brand-page" data-tour="brands-directory">
    <section className="data-card brand-directory-card">
      <div className="data-card-header stacked"><div><span className="section-kicker"><Store size={14} /> Directorio de marcas</span><h2>{filtered.length} de {allBrands.length} marcas</h2><p>El catálogo y los importes provienen de GESI; no se completan marcas ausentes por inferencia.</p></div><label className="inline-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar marca o rubro…" /></label><div className="brand-filter-grid"><MultiSelectFilter label="Rubro" value={family} options={families} onChange={setFamily} /><SingleSelectFilter label="Disponibilidad" value={availability} options={[{ value: 'commercial', label: 'Con stock y precio' }, { value: 'stock', label: 'Con stock' }, { value: 'all', label: 'Todas' }]} onChange={setAvailability} /><SingleSelectFilter label="Orden" value={order} options={[{ value: 'sales', label: 'Mayor venta 90d' }, { value: 'units', label: 'Más unidades 90d' }, { value: 'stock', label: 'Mayor stock' }, { value: 'products', label: 'Más productos' }, { value: 'name', label: 'Nombre A–Z' }]} onChange={(value) => setOrder(value as BrandOrder)} /></div></div>
      <SavedViewsBar viewKey="brands" filters={filters} onApply={applySaved} />
      <div className="brand-directory-list">{filtered.map((brand) => <button key={brand.name} className={brand.name === selected.name ? 'active' : ''} onClick={() => { setSelectedName(brand.name); revealDetailWhenStacked(); }}><div className="brand-monogram">{brand.name.slice(0, 2).toUpperCase()}</div><span><strong>{brand.name}</strong><small>{brand.productCount} productos · {brand.families.slice(0, 2).join(' · ')}</small></span><span className="brand-row-metrics"><strong>{money(brand.sales90d, true)}</strong><small>{brand.units90d.toLocaleString('es-AR')} u. en 90d</small></span><ChevronRight size={16} /></button>)}</div>
    </section>
    <section ref={detailRef} className="brand-detail-column">
      <article className="data-card brand-hero"><div><span className="section-kicker"><Store size={14} /> Ficha de marca</span><h2>{selected.name}</h2><p>{selected.families.join(' · ') || 'Sin rubro informado'} · última venta {selected.lastSaleAt ? shortDate(selected.lastSaleAt) : 'sin fecha observable'}</p></div><div className="brand-share"><strong>{totalSales90d ? (selected.sales90d / totalSales90d * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 }) : '0'}%</strong><span>de la venta atribuida del catálogo en 90 días</span></div></article>
      <div className="brand-kpis"><article><TrendingUp size={18} /><span>Venta 90 días</span><strong>{money(selected.sales90d)}</strong><small>{money(selected.sales90d / 3, true)} promedio mensual</small></article><article><PackageCheck size={18} /><span>Unidades compradas</span><strong>{selected.units90d.toLocaleString('es-AR')}</strong><small>{selected.monthlyUnits.toLocaleString('es-AR')} u./mes de rotación</small></article><article><Boxes size={18} /><span>Productos</span><strong>{selected.productCount}</strong><small>{selected.commercialProducts} con stock y precio</small></article><article><Warehouse size={18} /><span>Stock disponible</span><strong>{selected.stock.toLocaleString('es-AR')}</strong><small>{selected.activeProducts} maestros activos</small></article></div>
      <section className="data-card brand-products-card"><div className="data-card-header"><div><span className="section-kicker"><Boxes size={14} /> Productos vendidos</span><h2>Qué se compra de {selected.name}</h2><p>Venta, unidades, compradores por producto, stock y precio de referencia GESI observados.</p></div><label className="inline-search compact"><Search size={15} /><input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Buscar producto…" /></label></div><div className="brand-product-table"><header><span>Producto</span><span>Venta 90d</span><span>Unidades 90d</span><span>Compradores</span><span>Stock</span><span>Ref. GESI</span><span /></header>{selectedProducts.map((product) => <article key={product.id}><button className="entity-link product-entity-link" onClick={() => onOpenProduct(product)}><strong>{product.name}</strong><small>{product.sku} · {product.family} · {product.line}</small></button><span>{money(product.sales90d, true)}</span><span>{product.units90d.toLocaleString('es-AR')}</span><span>{product.clients90d.toLocaleString('es-AR')}</span><span className={product.stock <= 0 ? 'negative' : ''}>{product.stock.toLocaleString('es-AR')}</span><span>{product.price > 0 ? money(product.price, true) : 'Sin precio'}</span><button className="icon-button" aria-label={`Abrir ${product.name}`} onClick={() => onOpenProduct(product)}><ChevronRight size={15} /></button></article>)}</div><footer className="brand-detail-note">“Compradores” cuenta clientes únicos por producto. La suma entre productos puede repetir un mismo cliente y no se presenta como cobertura única de la marca. El precio mostrado es referencia GESI, no el promedio efectivo facturado.</footer></section>
    </section>
  </div>;
}
