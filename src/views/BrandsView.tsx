import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, ChevronRight, PackageCheck, Search, Store, TrendingUp, Warehouse } from "lucide-react";
import type { Product } from "../../shared/models";
import { matchesMultiFilter } from "../../shared/multi-filter";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { SavedViewsBar } from "../components/SavedViewsBar";
import { SingleSelectFilter } from "../components/SingleSelectFilter";
import { money, shortDate } from "../lib/format";
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
type BrandOrder = "sales" | "units" | "stock" | "products" | "name";
function usefulBrand(value: string) {
    return value && !value.startsWith("Unknown") ? value : "";
}
function summarize(products: Product[]): BrandSummary[] {
    const grouped = new Map<string, Product[]>();
    for (const product of products) {
        const brand = usefulBrand(product.brand);
        if (!brand)
            continue;
        grouped.set(brand, [...(grouped.get(brand) ?? []), product]);
    }
    return [...grouped.entries()].map(([name, rows]) => ({
        name,
        products: rows,
        productCount: rows.length,
        activeProducts: rows.filter((product) => product.masterStatus === "active").length,
        commercialProducts: rows.filter((product) => product.stock > 0 && product.price > 0).length,
        stock: rows.reduce((sum, product) => sum + product.stock, 0),
        units90d: rows.reduce((sum, product) => sum + product.units90d, 0),
        monthlyUnits: rows.reduce((sum, product) => sum + product.monthlyUnits, 0),
        sales90d: rows.reduce((sum, product) => sum + product.sales90d, 0),
        productClientReach: rows.reduce((sum, product) => sum + product.clients90d, 0),
        lastSaleAt: rows.map((product) => product.lastSaleAt).filter(Boolean).sort().at(-1) ?? "",
        families: [...new Set(rows.map((product) => product.family))].sort((a, b) => a.localeCompare(b, "en")),
    }));
}
export function BrandsView({ products, focusBrand = "", onOpenProduct }: {
    products: Product[];
    focusBrand?: string;
    onOpenProduct: (product: Product | string) => void;
}) {
    const allBrands = useMemo(() => summarize(products), [products]);
    const [query, setQuery] = useState("");
    const [family, setFamily] = useState("");
    const [availability, setAvailability] = useState("commercial");
    const [order, setOrder] = useState<BrandOrder>("sales");
    const [selectedName, setSelectedName] = useState(() => focusBrand || [...allBrands].sort((a, b) => b.sales90d - a.sales90d)[0]?.name || "");
    const [productQuery, setProductQuery] = useState("");
    const detailRef = useRef<HTMLElement>(null);
    const revealDetailWhenStacked = () => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function" || !window.matchMedia("(max-width: 1180px)").matches)
            return;
        window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    useEffect(() => {
        if (focusBrand && allBrands.some((brand) => brand.name === focusBrand)) {
            setSelectedName(focusBrand);
            revealDetailWhenStacked();
        }
    }, [allBrands, focusBrand]);
    const families = useMemo(() => [...new Set(products.map((product) => product.family))].sort((a, b) => a.localeCompare(b, "en")), [products]);
    const filtered = allBrands
        .filter((brand) => `${brand.name} ${brand.families.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()))
        .filter((brand) => !family || brand.products.some((product) => matchesMultiFilter(product.family, family)))
        .filter((brand) => availability === "all" || (availability === "stock" ? brand.stock > 0 : brand.commercialProducts > 0))
        .sort((a, b) => order === "units" ? b.units90d - a.units90d
        : order === "stock" ? b.stock - a.stock
            : order === "products" ? b.productCount - a.productCount
                : order === "name" ? a.name.localeCompare(b.name, "en")
                    : b.sales90d - a.sales90d);
    const selected = allBrands.find((brand) => brand.name === selectedName) ?? filtered[0] ?? allBrands[0];
    const totalSales90d = allBrands.reduce((sum, brand) => sum + brand.sales90d, 0);
    const selectedProducts = selected ? [...selected.products]
        .filter((product) => `${product.name} ${product.sku} ${product.family} ${product.line}`.toLowerCase().includes(productQuery.trim().toLowerCase()))
        .sort((a, b) => b.sales90d - a.sales90d || b.units90d - a.units90d || a.name.localeCompare(b.name, "en")) : [];
    const filters = { query, family, availability, order, productQuery, selectedBrand: selected?.name ?? "" };
    const applySaved = (saved: Record<string, string>) => {
        setQuery(saved.query ?? "");
        setFamily(saved.family ?? "");
        setAvailability(saved.availability ?? "commercial");
        setOrder((saved.order as BrandOrder) || "sales");
        setProductQuery(saved.productQuery ?? "");
        if (saved.selectedBrand && allBrands.some((brand) => brand.name === saved.selectedBrand))
            setSelectedName(saved.selectedBrand);
    };
    if (!selected)
        return <div className="page-view"><section className="data-card empty-state"><Store size={28}/><h2>No brands available</h2><p>The synthetic catalog has no usable brand values.</p></section></div>;
    return <div className="page-view brand-page" data-tour="brands-directory">
    <section className="data-card brand-directory-card">
      <div className="data-card-header stacked"><div><span className="section-kicker"><Store size={14}/> Brand directory</span><h2>{filtered.length} of {allBrands.length} brands</h2><p>Catalog values and amounts come from the deterministic synthetic dataset; missing brands are never inferred.</p></div><label className="inline-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search brand or category…"/></label><div className="brand-filter-grid"><MultiSelectFilter label="Category" value={family} options={families} onChange={setFamily}/><SingleSelectFilter label="Availability" value={availability} options={[{ value: "commercial", label: "Stock and price" }, { value: "stock", label: "In stock" }, { value: "all", label: "All" }]} onChange={setAvailability}/><SingleSelectFilter label="Sort" value={order} options={[{ value: "sales", label: "Highest 90-day sales" }, { value: "units", label: "Most 90-day units" }, { value: "stock", label: "Highest stock" }, { value: "products", label: "Most products" }, { value: "name", label: "Name A\u2013Z" }]} onChange={(value) => setOrder(value as BrandOrder)}/></div></div>
      <SavedViewsBar viewKey="brands" filters={filters} onApply={applySaved}/>
      <div className="brand-directory-list">{filtered.map((brand) => <button key={brand.name} className={brand.name === selected.name ? "active" : ""} onClick={() => { setSelectedName(brand.name); revealDetailWhenStacked(); }}><div className="brand-monogram">{brand.name.slice(0, 2).toUpperCase()}</div><span><strong>{brand.name}</strong><small>{brand.productCount} products · {brand.families.slice(0, 2).join(" \u00B7 ")}</small></span><span className="brand-row-metrics"><strong>{money(brand.sales90d, true)}</strong><small>{brand.units90d.toLocaleString("es-AR")} units in 90d</small></span><ChevronRight size={16}/></button>)}</div>
    </section>
    <section ref={detailRef} className="brand-detail-column">
      <article className="data-card brand-hero"><div><span className="section-kicker"><Store size={14}/> Brand profile</span><h2>{selected.name}</h2><p>{selected.families.join(" \u00B7 ") || "Category unavailable"} · last sale {selected.lastSaleAt ? shortDate(selected.lastSaleAt) : "no observable date"}</p></div><div className="brand-share"><strong>{totalSales90d ? (selected.sales90d / totalSales90d * 100).toLocaleString("en-US", { maximumFractionDigits: 1 }) : "0"}%</strong><span>of attributed catalog sales in 90 days</span></div></article>
      <div className="brand-kpis"><article><TrendingUp size={18}/><span>90-day sales</span><strong>{money(selected.sales90d)}</strong><small>{money(selected.sales90d / 3, true)} monthly average</small></article><article><PackageCheck size={18}/><span>Purchased units</span><strong>{selected.units90d.toLocaleString("en-US")}</strong><small>{selected.monthlyUnits.toLocaleString("en-US")} units/month turnover</small></article><article><Boxes size={18}/><span>Products</span><strong>{selected.productCount}</strong><small>{selected.commercialProducts} with stock and price</small></article><article><Warehouse size={18}/><span>Available stock</span><strong>{selected.stock.toLocaleString("en-US")}</strong><small>{selected.activeProducts} active catalog items</small></article></div>
      <section className="data-card brand-products-card"><div className="data-card-header"><div><span className="section-kicker"><Boxes size={14}/> Sold products</span><h2>What customers buy from {selected.name}</h2><p>Observed sales, units, product buyers, stock, and reference price.</p></div><label className="inline-search compact"><Search size={15}/><input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Search product…"/></label></div><div className="brand-product-table"><header><span>Product</span><span>90-day sales</span><span>90-day units</span><span>Buyers</span><span>Stock</span><span>Price</span><span /></header>{selectedProducts.map((product) => <article key={product.id}><button className="entity-link product-entity-link" onClick={() => onOpenProduct(product)}><strong>{product.name}</strong><small>{product.sku} · {product.family} · {product.line}</small></button><span>{money(product.sales90d, true)}</span><span>{product.units90d.toLocaleString("en-US")}</span><span>{product.clients90d.toLocaleString("en-US")}</span><span className={product.stock <= 0 ? "negative" : ""}>{product.stock.toLocaleString("en-US")}</span><span>{product.price > 0 ? money(product.price, true) : "No price"}</span><button className="icon-button" aria-label={`Open ${product.name}`} onClick={() => onOpenProduct(product)}><ChevronRight size={15}/></button></article>)}</div><footer className="brand-detail-note">“Buyers” counts unique customers per product. Totals may repeat a customer across products and are not presented as unique brand coverage.</footer></section>
    </section>
  </div>;
}
