import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Boxes, ChevronRight, GitCompareArrows, ListFilter, PackageSearch, Search, Sparkles } from 'lucide-react';
import { cosineSimilarity } from '../../shared/algorithms';
import { VECTOR_DESCRIPTIONS, VECTOR_LABELS, type Product, type VectorKey } from '../../shared/models';
import { money } from '../lib/format';

const vectorKeys = Object.keys(VECTOR_LABELS) as VectorKey[];

export function ProductsView({ products, tutorialVectorMode = false, focusProductId = null }: { products: Product[]; tutorialVectorMode?: boolean; focusProductId?: string | null }) {
  const [mode, setMode] = useState<'catalog' | 'vectors'>('catalog');
  const [selectedId, setSelectedId] = useState(() => [...products].sort((a, b) => b.monthlyUnits - a.monthlyUnits)[0]?.id || '');
  const [compareId, setCompareId] = useState(() => [...products].sort((a, b) => b.monthlyUnits - a.monthlyUnits)[1]?.id || '');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [family, setFamily] = useState('all');
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
  const compared = products.find((product) => product.id === compareId && product.id !== selected?.id)
    || products.find((product) => product.id !== selected?.id);
  const families = useMemo(() => [...new Set(products.map((product) => product.family))].sort((a, b) => a.localeCompare(b, 'es')), [products]);
  const filtered = products
    .filter((product) => `${product.name} ${product.family} ${product.brand} ${product.sku}`.toLowerCase().includes(query.toLowerCase()))
    .filter((product) => family === 'all' || product.family === family)
    .filter((product) => availability === 'all' || (availability === 'stock' ? product.stock > 0 : product.stock > 0 && product.price > 0))
    .sort((a, b) => sort === 'stock' ? b.stock - a.stock
      : sort === 'price' ? b.price - a.price
        : sort === 'name' ? a.name.localeCompare(b.name, 'es')
          : b.monthlyUnits - a.monthlyUnits || b.stock - a.stock);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const features = useMemo(() => selected ? (Object.entries(selected.vector) as [VectorKey, number][]).sort((a, b) => b[1] - a[1]).slice(0, 8) : [], [selected]);

  useEffect(() => {
    if (selected && compareId === selected.id) setCompareId(products.find((product) => product.id !== selected.id)?.id || '');
  }, [compareId, products, selected]);

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

  if (!selected || !compared) return null;

  if (mode === 'vectors') {
    const matchingProducts = products.filter((product) => product.vector[selectedVector] > 0).length;
    return (
      <div className="page-view vector-explorer-page" data-tour="vector-explorer">
        <header className="data-card vector-explorer-hero">
          <div><span className="section-kicker"><BarChart3 size={15} /> Motor vectorial</span><h2>Explorador de los 20 vectores</h2><p>Elegí una dimensión para ordenar todo el catálogo desde la mayor afinidad (100) hasta la menor (0).</p></div>
          <button className="button secondary" onClick={() => setMode('catalog')}><ArrowLeft size={16} /> Volver al catálogo</button>
        </header>
        <div className="vector-explorer-layout">
          <section className="data-card vector-dimension-index">
            <div className="data-card-header"><div><span className="section-kicker"><ListFilter size={14} /> Dimensiones usadas</span><h2>Todos los filtros</h2></div><span className="count-badge">20 vectores</span></div>
            <div className="vector-dimension-grid">
              {vectorKeys.map((key) => {
                const matches = products.filter((product) => product.vector[key] > 0).length;
                return <button key={key} className={selectedVector === key ? 'active' : ''} onClick={() => { setSelectedVector(key); setVectorPage(1); }}><span><strong>{VECTOR_LABELS[key]}</strong><small>{VECTOR_DESCRIPTIONS[key]}</small></span><em>{matches}</em></button>;
              })}
            </div>
          </section>
          <section className="data-card vector-ranking-card">
            <div className="data-card-header"><div><span className="section-kicker">Ranking completo · 100 → 0</span><h2>{VECTOR_LABELS[selectedVector]}</h2><p>{VECTOR_DESCRIPTIONS[selectedVector]}</p></div><span className="count-badge">{matchingProducts} con afinidad</span></div>
            <div className="vector-ranking-head"><span>#</span><span>Producto</span><span>Familia</span><span>Afinidad</span><span>Rotación</span><span /></div>
            <div className="vector-ranking-list">
              {visibleRanking.map((product, index) => {
                const score = product.vector[selectedVector];
                const rank = (currentVectorPage - 1) * vectorPageSize + index + 1;
                return <article key={product.id} className={score ? '' : 'zero-score'}><strong className="vector-rank-number">{rank}</strong><div className="vector-ranked-product"><strong>{product.name}</strong><span>{product.sku} · {product.pack}</span></div><span>{product.family}</span><div className="vector-ranking-score"><div><i style={{ width: `${score}%` }} /></div><strong>{score}</strong></div><span>{product.monthlyUnits} u./mes</span><button className="icon-button" aria-label={`Ver ${product.name}`} onClick={() => openProduct(product.id)}><ChevronRight size={16} /></button></article>;
              })}
            </div>
            <div className="table-pagination"><span>Mostrando {(currentVectorPage - 1) * vectorPageSize + 1}–{(currentVectorPage - 1) * vectorPageSize + visibleRanking.length} de {ranking.length}</span><div><button className="button secondary" disabled={currentVectorPage === 1} onClick={() => setVectorPage((value) => Math.max(1, value - 1))}>Anterior</button><strong>{currentVectorPage} / {vectorPageCount}</strong><button className="button secondary" disabled={currentVectorPage === vectorPageCount} onClick={() => setVectorPage((value) => Math.min(vectorPageCount, value + 1))}>Siguiente</button></div></div>
          </section>
        </div>
      </div>
    );
  }

  const similarity = Math.round(cosineSimilarity(selected.vector, compared.vector) * 100);
  return (
    <div className="page-view product-layout">
      <section className="product-catalog data-card" data-tour="product-catalog">
        <div className="data-card-header stacked"><div><span className="section-kicker"><Boxes size={14} /> Catálogo</span><h2>{filtered.length} de {products.length} productos</h2><p>Ordenado por señales comerciales; los artículos sin stock ni precio quedan ocultos por defecto.</p></div><label className="inline-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Buscar producto, marca o SKU…" /></label><div className="product-filter-grid"><label><span>Familia</span><select value={family} onChange={(event) => { setFamily(event.target.value); setPage(1); }}><option value="all">Todas</option>{families.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Disponibilidad</span><select value={availability} onChange={(event) => { setAvailability(event.target.value as typeof availability); setPage(1); }}><option value="commercial">Con stock y precio</option><option value="stock">Con stock</option><option value="all">Todo el catálogo</option></select></label><label><span>Orden</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="rotation">Mayor rotación</option><option value="stock">Mayor stock</option><option value="price">Mayor precio</option><option value="name">Nombre A–Z</option></select></label></div><button className="button secondary vector-explorer-button" data-tour="vector-explorer-button" onClick={() => setMode('vectors')}><BarChart3 size={15} /> Explorar 20 vectores</button></div>
        <div className="product-list">
          {visible.map((product) => <button key={product.id} className={`product-list-row ${product.id === selected.id ? 'active' : ''}`} onClick={() => setSelectedId(product.id)}>
            <div className="product-thumb">{product.family === 'Higiene' ? 'HI' : product.family === 'Accesorios' ? 'AC' : product.vector.gatos > product.vector.perros ? 'GA' : 'PE'}</div>
            <div><strong>{product.name}</strong><span>{product.sku} · {product.pack}</span></div>
            <div className="product-list-numbers"><strong>{product.price > 0 ? money(product.price) : 'Sin precio'}</strong><span className={product.stock < 30 ? 'negative' : ''}>Stock disp. {product.stock}</span></div>
            <ChevronRight size={17} />
          </button>)}
        </div>
        <div className="compact-pagination"><button disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><strong>{currentPage} / {pageCount}</strong><button disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Siguiente</button></div>
      </section>
      <section className="product-detail">
        <article className="data-card product-hero">
          <div className="product-hero-top"><div className="large-product-icon"><PackageSearch size={30} /></div><div className="product-hero-title"><span className="section-kicker">{selected.family} · {selected.sku}</span><h2>{selected.name}</h2><p>{selected.brand} · {selected.pack}</p></div><span className="algorithm-pill"><Sparkles size={13} /> Vector v1.1</span></div>
          <div className="product-metrics"><div><span>Precio ref. GESI</span><strong>{selected.price > 0 ? money(selected.price) : 'Sin dato'}</strong></div><div><span>Stock disponible</span><strong>{selected.stock} u.</strong></div><div><span>Rotación mensual</span><strong>{selected.monthlyUnits} u.</strong></div><div><span>Margen estimado</span><strong>{selected.margin == null ? 'No disponible' : `${selected.margin}%`}</strong></div></div>
        </article>
        <article className="data-card vector-card">
          <div className="data-card-header"><div><span className="section-kicker">Perfil del producto</span><h2>Vector de afinidad</h2></div><span className="count-badge">escala 0–100</span></div>
          <p className="section-description">La similitud se calcula con distancia coseno sobre 20 categorías. En v0.0.3 las recomendaciones ponderan el gasto —no unidades incompatibles— y aplican compatibilidad de especie.</p>
          <div className="vector-list">
            {features.map(([key, value]) => <div className="vector-row" key={key}><span>{VECTOR_LABELS[key]}</span><div className="vector-track"><i style={{ width: `${value}%` }} /></div><strong>{value}</strong></div>)}
          </div>
        </article>
        <article className="data-card comparison-card">
          <div className="data-card-header"><div><span className="section-kicker"><GitCompareArrows size={14} /> Comparador</span><h2>Similitud entre productos</h2></div><div className={`similarity-score ${similarity > 75 ? 'high' : ''}`}><strong>{similarity}%</strong><span>similitud</span></div></div>
          <label className="compare-select"><span>Comparar {selected.name} con</span><select value={compared.id} onChange={(event) => setCompareId(event.target.value)}>{products.filter((product) => product.id !== selected.id).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
          <div className="compare-legend"><span><i className="bar-a" /> {selected.name}</span><span><i className="bar-b" /> {compared.name}</span></div>
          <div className="compare-bars">
            {vectorKeys.filter((key) => selected.vector[key] || compared.vector[key]).slice(0, 6).map((key) => <div className="compare-row" key={key}><span>{VECTOR_LABELS[key]}</span><div><i className="bar-a" style={{ width: `${selected.vector[key]}%` }} /><i className="bar-b" style={{ width: `${compared.vector[key]}%` }} /></div></div>)}
          </div>
        </article>
      </section>
    </div>
  );
}
