import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Boxes, ChevronRight, ListFilter, Search } from "lucide-react";
import { VECTOR_DESCRIPTIONS, VECTOR_GROUPS, VECTOR_LABELS, type Product, type VectorKey } from "../../shared/models";
import { matchesMultiFilter } from "../../shared/multi-filter";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { ProductPanel } from "../components/ProductPanel";
import { SavedViewsBar } from "../components/SavedViewsBar";
import { SingleSelectFilter } from "../components/SingleSelectFilter";
import { money, number } from "../lib/format";
const vectorKeys = Object.keys(VECTOR_LABELS) as VectorKey[];
export function ProductsView({ products, tutorialVectorMode = false, focusProductId = null, onOpenBrand }: {
    products: Product[];
    tutorialVectorMode?: boolean;
    focusProductId?: string | null;
    onOpenBrand: (brand: string) => void;
}) {
    const [mode, setMode] = useState<"catalog" | "vectors">("catalog");
    const [selectedId, setSelectedId] = useState(() => [...products].sort((a, b) => b.monthlyUnits - a.monthlyUnits)[0]?.id || "");
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [family, setFamily] = useState("");
    const [brand, setBrand] = useState("");
    const [availability, setAvailability] = useState<"commercial" | "stock" | "all">("commercial");
    const [sort, setSort] = useState<"rotation" | "stock" | "price" | "name">("rotation");
    const [selectedVector, setSelectedVector] = useState<VectorKey>("perros");
    const [vectorPage, setVectorPage] = useState(1);
    const pageSize = 100;
    useEffect(() => {
        if (tutorialVectorMode)
            setMode("vectors");
    }, [tutorialVectorMode]);
    useEffect(() => {
        if (focusProductId && products.some((product) => product.id === focusProductId)) {
            setSelectedId(focusProductId);
            setMode("catalog");
        }
    }, [focusProductId, products]);
    const selected = products.find((product) => product.id === selectedId) || products[0];
    const families = useMemo(() => [...new Set(products.map((product) => product.family))].sort((a, b) => a.localeCompare(b, "en")), [products]);
    const brands = useMemo(() => [...new Set(products.map((product) => product.brand).filter((value) => !value.startsWith("Unknown")))].sort((a, b) => a.localeCompare(b, "in")), [products]);
    const filtered = products
        .filter((product) => `${product.name} ${product.family} ${product.subcategory} ${product.brand} ${product.line} ${product.group} ${product.sku}`.toLowerCase().includes(query.toLowerCase()))
        .filter((product) => matchesMultiFilter(product.family, family))
        .filter((product) => matchesMultiFilter(product.brand, brand))
        .filter((product) => availability === "all" || (availability === "stock" ? product.stock > 0 : product.stock > 0 && product.price > 0))
        .sort((a, b) => sort === "stock" ? b.stock - a.stock
        : sort === "price" ? b.price - a.price
            : sort === "name" ? a.name.localeCompare(b.name, "en")
                : b.monthlyUnits - a.monthlyUnits || b.stock - a.stock);
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(page, pageCount);
    const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const ranking = useMemo(() => [...products].sort((a, b) => (b.vector[selectedVector] - a.vector[selectedVector]
        || b.monthlyUnits - a.monthlyUnits
        || a.name.localeCompare(b.name, "en"))), [products, selectedVector]);
    const vectorPageSize = 50;
    const vectorPageCount = Math.max(1, Math.ceil(ranking.length / vectorPageSize));
    const currentVectorPage = Math.min(vectorPage, vectorPageCount);
    const visibleRanking = ranking.slice((currentVectorPage - 1) * vectorPageSize, currentVectorPage * vectorPageSize);
    const openProduct = (id: string) => {
        setSelectedId(id);
        setMode("catalog");
    };
    const savedFilters = { mode, query, family, brand, availability, sort, selectedVector, selectedProduct: selected.id };
    const applySaved = (saved: Record<string, string>) => {
        setMode(saved.mode === "vectors" ? "vectors" : "catalog");
        setQuery(saved.query ?? "");
        setFamily(saved.family ?? "");
        setBrand(saved.brand ?? "");
        setAvailability((saved.availability as typeof availability) || "commercial");
        setSort((saved.sort as typeof sort) || "rotation");
        if (vectorKeys.includes(saved.selectedVector as VectorKey))
            setSelectedVector(saved.selectedVector as VectorKey);
        if (saved.selectedProduct && products.some((product) => product.id === saved.selectedProduct))
            setSelectedId(saved.selectedProduct);
        setPage(1);
        setVectorPage(1);
    };
    if (!selected)
        return null;
    if (mode === "vectors") {
        const matchingProducts = products.filter((product) => product.vector[selectedVector] > 0).length;
        return (<div className="page-view vector-explorer-page" data-tour="vector-explorer">
        <header className="data-card vector-explorer-hero">
          <div><span className="section-kicker"><BarChart3 size={15}/> Vector engine v2.1</span><h2>Explorer for {number(vectorKeys.length)} vectors</h2><p>Life stage, size, species, positioning, purpose, needs, and flavor remain separate and auditable.</p></div>
          <button className="button secondary" onClick={() => setMode("catalog")}><ArrowLeft size={16}/> Back to catalog</button>
        </header>
        <SavedViewsBar viewKey="products" filters={savedFilters} onApply={applySaved}/>
        <div className="vector-explorer-layout">
          <section className="data-card vector-dimension-index">
            <div className="data-card-header"><div><span className="section-kicker"><ListFilter size={14}/> Dimensions usadas</span><h2>Groups of the profile</h2></div><span className="count-badge">{number(vectorKeys.length)} vectors</span></div>
            <div className="vector-group-index">{VECTOR_GROUPS.map((group) => <section key={group.id}><header><strong>{group.label}</strong><small>{group.description}</small></header><div className="vector-dimension-grid">{group.keys.map((key) => {
                    const matches = products.filter((product) => product.vector[key] > 0).length;
                    return <button key={key} className={selectedVector === key ? "active" : ""} onClick={() => { setSelectedVector(key); setVectorPage(1); }}><span><strong>{VECTOR_LABELS[key]}</strong><small>{VECTOR_DESCRIPTIONS[key]}</small></span><em>{matches}</em></button>;
                })}</div></section>)}</div>
          </section>
          <section className="data-card vector-ranking-card">
            <div className="data-card-header"><div><span className="section-kicker">Complete ranking · 100 → 0</span><h2>{VECTOR_LABELS[selectedVector]}</h2><p>{VECTOR_DESCRIPTIONS[selectedVector]}</p></div><span className="count-badge">{matchingProducts} with affinity</span></div>
            <div className="vector-ranking-head"><span>#</span><span>Product</span><span>Family</span><span>Affinity</span><span>Turnover</span><span /></div>
            <div className="vector-ranking-list">
              {visibleRanking.map((product, index) => {
                const score = product.vector[selectedVector];
                const rank = (currentVectorPage - 1) * vectorPageSize + index + 1;
                return <article key={product.id} className={score ? "" : "zero-score"}><strong className="vector-rank-number">{rank}</strong><div className="vector-ranked-product"><button className="entity-link" onClick={() => openProduct(product.id)}>{product.name}</button><span>{product.sku} · <button className="entity-link inline-entity" onClick={() => onOpenBrand(product.brand)}>{product.brand}</button></span></div><span>{product.family}</span><div className="vector-ranking-score" title={product.vectorMeta.evidence[selectedVector]?.join(" \u00B7 ") || "No assigned evidence"}><div><i style={{ width: `${score}%` }}/></div><strong>{score}%</strong></div><span>{product.monthlyUnits} units/month</span><button className="icon-button" aria-label={`View ${product.name}`} onClick={() => openProduct(product.id)}><ChevronRight size={16}/></button></article>;
            })}
            </div>
            <div className="table-pagination"><span>Showing {(currentVectorPage - 1) * vectorPageSize + 1}–{(currentVectorPage - 1) * vectorPageSize + visibleRanking.length} of {ranking.length}</span><div><button className="button secondary" disabled={currentVectorPage === 1} onClick={() => setVectorPage((value) => Math.max(1, value - 1))}>Previous</button><strong>{currentVectorPage} / {vectorPageCount}</strong><button className="button secondary" disabled={currentVectorPage === vectorPageCount} onClick={() => setVectorPage((value) => Math.min(vectorPageCount, value + 1))}>Next</button></div></div>
          </section>
        </div>
      </div>);
    }
    return (<div className="page-view product-layout">
      <section className="product-catalog data-card" data-tour="product-catalog">
        <div className="data-card-header stacked"><div><span className="section-kicker"><Boxes size={14}/> Catalog</span><h2>{number(filtered.length)} of {number(products.length)} products</h2><p>Brand, line, and group come from the synthetic catalog; items without stock or price are hidden by default.</p></div><label className="inline-search"><Search size={16}/><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search product, brand, line, or SKU…"/></label><div className="product-filter-grid"><MultiSelectFilter label="Category" value={family} options={families} onChange={(value) => { setFamily(value); setPage(1); }}/><MultiSelectFilter label="Brand" value={brand} options={brands} onChange={(value) => { setBrand(value); setPage(1); }}/><SingleSelectFilter label="Availability" value={availability} options={[{ value: "commercial", label: "Stock and price" }, { value: "stock", label: "In stock" }, { value: "all", label: "Full catalog" }]} onChange={(value) => { setAvailability(value as typeof availability); setPage(1); }}/><SingleSelectFilter label="Sort" value={sort} options={[{ value: "rotation", label: "Highest turnover" }, { value: "stock", label: "Highest stock" }, { value: "price", label: "Highest price" }, { value: "name", label: "Name A\u2013Z" }]} onChange={(value) => setSort(value as typeof sort)}/></div><button className="button secondary vector-explorer-button" data-tour="vector-explorer-button" onClick={() => setMode("vectors")}><BarChart3 size={15}/> Explore {number(vectorKeys.length)} vectors</button></div>
        <SavedViewsBar viewKey="products" filters={savedFilters} onApply={applySaved}/>
        <div className="product-list">
          {visible.map((product) => <article key={product.id} role="button" tabIndex={0} className={`product-list-row ${product.id === selected.id ? "active" : ""}`} onClick={() => setSelectedId(product.id)} onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ")
                    setSelectedId(product.id);
            }}>
            <div className="product-thumb">{product.family === "Hygiene" ? "HY" : product.family === "Accessories" ? "AC" : product.vector.gatos > product.vector.perros ? "CA" : "DO"}</div>
            <div><strong>{product.name}</strong><span><button className="entity-link inline-entity" onClick={(event) => { event.stopPropagation(); onOpenBrand(product.brand); }}>{product.brand}</button> · {product.sku}</span></div>
            <div className="product-list-numbers"><strong>{product.price > 0 ? money(product.price) : "No price"}</strong><span className={product.stock < 30 ? "negative" : ""}>Available stock {product.stock}</span></div>
            <ChevronRight size={17}/>
          </article>)}
        </div>
        <div className="compact-pagination"><button disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><strong>{currentPage} / {pageCount}</strong><button disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button></div>
      </section>
      <section className="product-detail"><ProductPanel product={selected} products={products} onOpenProduct={(product) => setSelectedId(product.id)} onOpenBrand={onOpenBrand}/></section>
    </div>);
}
