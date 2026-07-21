import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Boxes, ChevronRight, ListFilter, Search } from 'lucide-react';
import { VECTOR_DESCRIPTIONS, VECTOR_GROUPS, VECTOR_LABELS, type Product, type VectorKey } from '../../shared/models';
import { matchesMultiFilter } from '../../shared/multi-filter';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { ProductPanel } from '../components/ProductPanel';
import { SingleSelectFilter } from '../components/SingleSelectFilter';
import { money } from '../lib/format';

const vectorKeys = Object.keys(VECTOR_LABELS) as VectorKey[];

export function ProductsView({ products, tutorialVectorMode = false, focusProductId = null }: { products: Product[]; tutorialVectorMode?: boolean; focusProductId?: string | null }) {
  const [mode, setMode] = useState<'catalog' | 'vectors'>('catalog');
  const [selectedId, setSelectedId] = useState(() => [...products].sort((a, b) => b.monthlyUnits - a.monthlyUnits)[0]?.id || '');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [family, setFamily] = useState('');
  const [brand, setBrand] = useState('');
  const [availability, setAvailability] = useState<'commercial' | 'stock' | 'all'>('commercial');
  const [sort, setSort] = useState<'rotation' | 'stock' | 'price' | 'name'>('rotation');
  const [selectedVector, setSelectedVector] = useState<VectorKey>('perros');
  const [vectorPage, setVectorPage] = useState(1);
  const pageSize = 100;

  useEffect(() => {
    if (tutorialVectorMode) setMode('vectors');
  }, [tutorialVectorMode]);

  useEffect(() => {
    if (focusProductId && products.some((product) => product.id === focusProductId)) {
      setSelectedId(focusProductId);
      setMode('catalog');
    }
  }, [focusProductId, products]);

  const selected = products.find((product) => product.id === selectedId) || products[0];
  const families = useMemo(() => [...new Set(products.map((product) => product.family))].sort((a, b) => a.localeCompare(b, 'es')), [products]);
  const brands = useMemo(() => [...new Set(products.map((product) => product.brand).filter((value) => !value.startsWith('Sin ')))].sort((a, b) => a.localeCompare(b, 'es')), [products]);
  const filtered = products
    .filter((product) => `${product.name} ${product.family} ${product.subcategory} ${product.brand} ${product.line} ${product.group} ${product.sku}`.toLowerCase().includes(query.toLowerCase()))
    .filter((product) => matchesMultiFilter(product.family, family))
    .filter((product) => matchesMultiFilter(product.brand, brand))
    .filter((product) => availability === 'all' || (availability === 'stock' ? product.stock > 0 : product.stock > 0 && product.price > 0))
    .sort((a, b) => sort === 'stock' ? b.stock - a.stock
      : sort === 'price' ? b.price - a.price
        : sort === 'name' ? a.name.localeCompare(b.name, 'es')
          : b.monthlyUnits - a.monthlyUnits || b.stock - a.stock);
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

  if (!selected) return null;

  if (mode === 'vectors') {
    const matchingProducts = products.filter((product) => product.vector[selectedVector] > 0).length;
    return (
      <div className="page-view vector-explorer-page" data-tour="vector-explorer">
        <header className="data-card vector-explorer-hero">
          <div><span className="section-kicker"><BarChart3 size={15} /> Motor vectorial v2.1</span><h2>Explorador de {vectorKeys.length} vectores</h2><p>Edad, porte, especie, posicionamiento, uso, necesidades y sabores se mantienen separados y auditables.</p></div>
          <button className="button secondary" onClick={() => setMode('catalog')}><ArrowLeft size={16} /> Volver al catálogo</button>
        </header>
        <div className="vector-explorer-layout">
          <section className="data-card vector-dimension-index">
            <div className="data-card-header"><div><span className="section-kicker"><ListFilter size={14} /> Dimensiones usadas</span><h2>Grupos del perfil</h2></div><span className="count-badge">{vectorKeys.length} vectores</span></div>
            <div className="vector-group-index">{VECTOR_GROUPS.map((group) => <section key={group.id}><header><strong>{group.label}</strong><small>{group.description}</small></header><div className="vector-dimension-grid">{group.keys.map((key) => {
              const matches = products.filter((product) => product.vector[key] > 0).length;
              return <button key={key} className={selectedVector === key ? 'active' : ''} onClick={() => { setSelectedVector(key); setVectorPage(1); }}><span><strong>{VECTOR_LABELS[key]}</strong><small>{VECTOR_DESCRIPTIONS[key]}</small></span><em>{matches}</em></button>;
            })}</div></section>)}</div>
          </section>
          <section className="data-card vector-ranking-card">
            <div className="data-card-header"><div><span className="section-kicker">Ranking completo · 100 → 0</span><h2>{VECTOR_LABELS[selectedVector]}</h2><p>{VECTOR_DESCRIPTIONS[selectedVector]}</p></div><span className="count-badge">{matchingProducts} con afinidad</span></div>
            <div className="vector-ranking-head"><span>#</span><span>Producto</span><span>Familia</span><span>Afinidad</span><span>Rotación</span><span /></div>
            <div className="vector-ranking-list">
              {visibleRanking.map((product, index) => {
                const score = product.vector[selectedVector];
                const rank = (currentVectorPage - 1) * vectorPageSize + index + 1;
                return <article key={product.id} className={score ? '' : 'zero-score'}><strong className="vector-rank-number">{rank}</strong><div className="vector-ranked-product"><button className="entity-link" onClick={() => openProduct(product.id)}>{product.name}</button><span>{product.sku} · {product.brand}</span></div><span>{product.family}</span><div className="vector-ranking-score" title={product.vectorMeta.evidence[selectedVector]?.join(' · ') || 'Sin evidencia asignada'}><div><i style={{ width: `${score}%` }} /></div><strong>{score}%</strong></div><span>{product.monthlyUnits} u./mes</span><button className="icon-button" aria-label={`Ver ${product.name}`} onClick={() => openProduct(product.id)}><ChevronRight size={16} /></button></article>;
              })}
            </div>
            <div className="table-pagination"><span>Mostrando {(currentVectorPage - 1) * vectorPageSize + 1}–{(currentVectorPage - 1) * vectorPageSize + visibleRanking.length} de {ranking.length}</span><div><button className="button secondary" disabled={currentVectorPage === 1} onClick={() => setVectorPage((value) => Math.max(1, value - 1))}>Anterior</button><strong>{currentVectorPage} / {vectorPageCount}</strong><button className="button secondary" disabled={currentVectorPage === vectorPageCount} onClick={() => setVectorPage((value) => Math.min(vectorPageCount, value + 1))}>Siguiente</button></div></div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page-view product-layout">
      <section className="product-catalog data-card" data-tour="product-catalog">
        <div className="data-card-header stacked"><div><span className="section-kicker"><Boxes size={14} /> Catálogo</span><h2>{filtered.length} de {products.length} productos</h2><p>Marca, línea y grupo provienen de sus maestros reales; los artículos sin stock ni precio quedan ocultos por defecto.</p></div><label className="inline-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Buscar producto, marca, línea o SKU…" /></label><div className="product-filter-grid"><MultiSelectFilter label="Rubro" value={family} options={families} onChange={(value) => { setFamily(value); setPage(1); }} /><MultiSelectFilter label="Marca" value={brand} options={brands} onChange={(value) => { setBrand(value); setPage(1); }} /><SingleSelectFilter label="Disponibilidad" value={availability} options={[{ value: 'commercial', label: 'Con stock y precio' }, { value: 'stock', label: 'Con stock' }, { value: 'all', label: 'Todo el catálogo' }]} onChange={(value) => { setAvailability(value as typeof availability); setPage(1); }} /><SingleSelectFilter label="Orden" value={sort} options={[{ value: 'rotation', label: 'Mayor rotación' }, { value: 'stock', label: 'Mayor stock' }, { value: 'price', label: 'Mayor precio' }, { value: 'name', label: 'Nombre A–Z' }]} onChange={(value) => setSort(value as typeof sort)} /></div><button className="button secondary vector-explorer-button" data-tour="vector-explorer-button" onClick={() => setMode('vectors')}><BarChart3 size={15} /> Explorar {vectorKeys.length} vectores</button></div>
        <div className="product-list">
          {visible.map((product) => <button key={product.id} className={`product-list-row ${product.id === selected.id ? 'active' : ''}`} onClick={() => setSelectedId(product.id)}>
            <div className="product-thumb">{product.family === 'Higiene' ? 'HI' : product.family === 'Accesorios' ? 'AC' : product.vector.gatos > product.vector.perros ? 'GA' : 'PE'}</div>
            <div><strong>{product.name}</strong><span>{product.brand} · {product.sku}</span></div>
            <div className="product-list-numbers"><strong>{product.price > 0 ? money(product.price) : 'Sin precio'}</strong><span className={product.stock < 30 ? 'negative' : ''}>Stock disp. {product.stock}</span></div>
            <ChevronRight size={17} />
          </button>)}
        </div>
        <div className="compact-pagination"><button disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><strong>{currentPage} / {pageCount}</strong><button disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Siguiente</button></div>
      </section>
      <section className="product-detail"><ProductPanel product={selected} products={products} onOpenProduct={(product) => setSelectedId(product.id)} /></section>
    </div>
  );
}
