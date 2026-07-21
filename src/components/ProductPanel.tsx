import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Boxes, CalendarDays, CheckCircle2, ChevronRight, GitCompareArrows, Info, PackageSearch, Sparkles, TrendingUp, Users, X, } from "lucide-react";
import { compareProductsV2 } from "../../shared/product-vectors";
import { VECTOR_GROUPS, VECTOR_LABELS, type Product, type VectorKey } from "../../shared/models";
import { money, shortDate } from "../lib/format";
const vectorKeys = Object.keys(VECTOR_LABELS) as VectorKey[];
interface ProductPanelProps {
    product: Product;
    products: Product[];
    mode?: "embedded" | "popup";
    onClose?: () => void;
    onOpenProduct?: (product: Product) => void;
    onOpenCatalog?: (product: Product) => void;
    onOpenBrand?: (brand: string) => void;
}
const useful = (value: string) => value && !value.toLowerCase().startsWith("unknown") ? value : "Not provided";
function coverageCopy(product: Product) {
    if (product.stock <= 0)
        return { tone: "critical", title: "Out of stock", detail: product.monthlyUnits > 0 ? `Recent turnover averaged ${product.monthlyUnits} units per month.` : "No observable turnover in the last 90 days." };
    if (product.stockCoverageMonths == null)
        return { tone: "neutral", title: "In stock, no recent demand", detail: "The 90-day history is insufficient to estimate coverage." };
    if (product.stockCoverageMonths < .7)
        return { tone: "attention", title: "Tight coverage", detail: `Stock covers approximately ${product.stockCoverageMonths.toLocaleString("en-US")} months of recent demand.` };
    if (product.stockCoverageMonths > 4)
        return { tone: "neutral", title: "High coverage", detail: `Stock covers approximately ${product.stockCoverageMonths.toLocaleString("en-US")} months of recent demand.` };
    return { tone: "healthy", title: "Coverage aligned with recent demand", detail: `Approximately ${product.stockCoverageMonths.toLocaleString("en-US")} months at the last 90 days' pace.` };
}
function confidenceLabel(value: number) {
    if (value >= 85)
        return "Strong profile";
    if (value >= 65)
        return "Good profile";
    if (value >= 45)
        return "Partial profile";
    return "Limited profile";
}
function pricePositionLabel(product: Product) {
    if (!product.referencePricePerKg)
        return "No comparable package";
    if (product.pricePosition === "budget")
        return "Lower price/kg among peers";
    if (product.pricePosition === "premium")
        return "Higher price/kg among peers";
    if (product.pricePosition === "market")
        return "Market-range price/kg";
    return "Insufficient comparable cohort";
}
export function ProductPanel({ product, products, mode = "embedded", onClose, onOpenProduct, onOpenCatalog, onOpenBrand }: ProductPanelProps) {
    const nearest = useMemo(() => products
        .filter((candidate) => candidate.id !== product.id)
        .map((candidate) => ({ product: candidate, comparison: compareProductsV2(product, candidate) }))
        .sort((left, right) => right.comparison.score - left.comparison.score || right.product.monthlyUnits - left.product.monthlyUnits)
        .slice(0, 6), [product, products]);
    const [compareId, setCompareId] = useState(nearest[0]?.product.id ?? "");
    useEffect(() => setCompareId(nearest[0]?.product.id ?? ""), [product.id, nearest]);
    const compared = products.find((candidate) => candidate.id === compareId && candidate.id !== product.id) ?? nearest[0]?.product;
    const comparison = compared ? compareProductsV2(product, compared) : null;
    const features = useMemo(() => (Object.entries(product.vector) as [
        VectorKey,
        number
    ][])
        .filter(([, value]) => value > 0)
        .sort((left, right) => right[1] - left[1]), [product]);
    const featureValues = useMemo(() => new Map(features), [features]);
    const stockCoverage = coverageCopy(product);
    const statusLabel = product.masterStatus === "active" ? "Active catalog item" : product.masterStatus === "inactive" ? "Inactive catalog item" : "Status unavailable";
    return (<section className={`product-profile ${mode}`} aria-label={`${product.name} profile`}>
      {mode === "popup" && <div className="product-profile-actions">{onOpenCatalog && <button className="button secondary" onClick={() => onOpenCatalog(product)}><ArrowUpRight size={15}/> Open in Products</button>}<button className="icon-button" aria-label="Close product profile" onClick={onClose}><X size={18}/></button></div>}
      <div className="product-profile-scroll">
        <article className="data-card product-hero product-profile-hero">
          <div className="product-hero-top">
            <div className="large-product-icon"><PackageSearch size={30}/></div>
            <div className="product-hero-title"><span className="section-kicker">{product.family} · {product.sku}</span><h2>{product.name}</h2><p><button className="entity-link" onClick={() => onOpenBrand?.(product.brand)}>{useful(product.brand)}</button> · {product.pack}</p></div>
            <div className="product-profile-badges"><span className={`master-status ${product.masterStatus}`}>{statusLabel}</span><span className="algorithm-pill"><Sparkles size={13}/> Vector v2.1</span></div>
          </div>
          {!!product.description && product.description !== product.name && <p className="product-description">{product.description}</p>}
          <div className="product-metrics product-metrics-v2">
            <div><span>Reference price</span><strong>{product.price > 0 ? money(product.price) : "No value"}</strong><small>{product.referencePricePerKg ? `${money(product.referencePricePerKg)}/kg \u00B7 ${pricePositionLabel(product)}` : pricePositionLabel(product)}</small></div>
            <div><span>Available stock</span><strong>{product.stock.toLocaleString("en-US")} {product.unit.toLowerCase()}</strong><small>{product.stockCoverageMonths == null ? "Coverage unavailable" : `${product.stockCoverageMonths.toLocaleString("en-US")} estimated months`}</small></div>
            <div><span>Monthly turnover</span><strong>{product.monthlyUnits.toLocaleString("en-US")} units</strong><small>{product.units90d.toLocaleString("en-US")} units in 90 days</small></div>
            <div><span>Attributed sales · 90 days</span><strong>{money(product.sales90d, true)}</strong><small>{product.clients90d.toLocaleString("en-US")} buying customers</small></div>
            <div><span>Last observed sale</span><strong>{product.lastSaleAt ? shortDate(product.lastSaleAt) : "No detail"}</strong><small>Within the generated history</small></div>
          </div>
          <div className={`product-stock-callout ${stockCoverage.tone}`}><TrendingUp size={17}/><div><strong>{stockCoverage.title}</strong><span>{stockCoverage.detail}</span></div></div>
        </article>

        <div className="product-profile-grid">
          <article className="data-card product-classification-card">
            <div className="data-card-header"><div><span className="section-kicker"><Boxes size={14}/> Commercial classification</span><h2>How the synthetic catalog is organized</h2></div></div>
            <div className="product-classification-grid">
              <div><span>Brand</span><button className="entity-link" onClick={() => onOpenBrand?.(product.brand)}><strong>{useful(product.brand)}</strong></button></div><div><span>Line</span><strong>{useful(product.line)}</strong></div>
              <div><span>Category</span><strong>{useful(product.family)}</strong></div><div><span>Subcategory</span><strong>{useful(product.subcategory)}</strong></div>
              <div><span>Commercial family</span><strong>{useful(product.commercialFamily)}</strong></div><div><span>Group</span><strong>{useful(product.group)}</strong></div>
              <div><span>Unit</span><strong>{product.unit}</strong></div><div><span>Units per case</span><strong>{product.unitsPerCase ?? "Not provided"}</strong></div>
            </div>
          </article>

          <article className="data-card vector-card product-vector-v2">
            <div className="data-card-header"><div><span className="section-kicker"><Sparkles size={14}/> Affinity profile</span><h2>{vectorKeys.length} explainable dimensions</h2></div><div className="vector-confidence"><strong>{product.vectorMeta.confidence}%</strong><span>{confidenceLabel(product.vectorMeta.confidence)}</span></div></div>
            <p className="section-description">Each percentage requires evidence in the synthetic product name or classification. Zero means no evidence was found, not that the attribute is impossible.</p>
            <div className="vector-list-v2">
              {VECTOR_GROUPS.map((group) => {
            const groupFeatures = group.keys.filter((key) => featureValues.has(key));
            return groupFeatures.length ? <section className="vector-group-v21" key={group.id}><h3>{group.label}</h3>{groupFeatures.map((key) => { const value = featureValues.get(key) ?? 0; return <div className="vector-row-v2" key={key}><div><span>{VECTOR_LABELS[key]}</span><small>{product.vectorMeta.evidence[key]?.[0] ?? "Signal derived from the available classification"}</small></div><div className="vector-track"><i style={{ width: `${value}%` }}/></div><strong>{value}%</strong></div>; })}</section> : null;
        })}
              {!features.length && <div className="product-vector-empty"><Info size={18}/><p>There is insufficient evidence to assign affinities. The item remains visible without invented values.</p></div>}
            </div>
            <footer className="vector-quality-note"><CheckCircle2 size={14}/><span>Descriptive-source coverage: {product.vectorMeta.sourceCoverage}% · profile quality: {product.vectorMeta.confidence}%.</span></footer>
          </article>
        </div>

        {compared && comparison && <article className="data-card comparison-card product-comparison-v2">
          <div className="data-card-header"><div><span className="section-kicker"><GitCompareArrows size={14}/> Comparator v2.1</span><h2>Product similarity</h2></div><div className={`similarity-score ${comparison.score >= 75 ? "high" : ""}`}><strong>{comparison.score}%</strong><span>similarity</span></div></div>
          <label className="compare-select"><span>Compare with</span><select value={compared.id} onChange={(event) => setCompareId(event.target.value)}>{products.filter((candidate) => candidate.id !== product.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
          <div className="similarity-explanation"><div><span>Weighted vector profile</span><strong>{comparison.vectorScore}%</strong><small>Species, life stage, and product type carry the greatest weight.</small></div><div><span>Commercial classification</span><strong>{comparison.taxonomyScore}%</strong><small>Category, subcategory, brand, line, family, and group.</small></div><div><span>Comparison confidence</span><strong>{comparison.confidence}%</strong><small>Limited by the profile with lower evidence coverage.</small></div></div>
          <div className="compare-legend"><span><i className="bar-a"/> {product.name}</span><span><i className="bar-b"/> {compared.name}</span></div>
          <div className="compare-bars">{vectorKeys.filter((key) => product.vector[key] || compared.vector[key]).slice(0, 12).map((key) => <div className="compare-row" key={key}><span>{VECTOR_LABELS[key]}</span><div><i className="bar-a" style={{ width: `${product.vector[key]}%` }}/><i className="bar-b" style={{ width: `${compared.vector[key]}%` }}/></div></div>)}</div>
          <div className="comparison-reasons"><p><strong>Matches</strong>{comparison.matches.length ? comparison.matches.join(" \u00B7 ") : "No strong documented matches"}</p><p><strong>Differences</strong>{comparison.differences.length ? comparison.differences.join(" \u00B7 ") : "No strong vector differences"}</p></div>
        </article>}

        <article className="data-card closest-products-card">
          <div className="data-card-header"><div><span className="section-kicker"><Users size={14}/> Nearby alternatives</span><h2>Most similar products</h2><p>Ranking recalculated by comparator v2.1.</p></div></div>
          <div className="closest-product-list">{nearest.map((item, index) => <article key={item.product.id}><button className="closest-product-main" onClick={() => onOpenProduct?.(item.product)}><span>{index + 1}</span><div><strong>{item.product.name}</strong><small>{item.product.family}</small></div><em>{item.comparison.score}%</em><ChevronRight size={15}/></button><button className="entity-link closest-product-brand" onClick={() => onOpenBrand?.(item.product.brand)}>{useful(item.product.brand)}</button></article>)}</div>
        </article>

        <div className="product-data-note"><CalendarDays size={14}/><span>Stock, price, sales, customers, and last sale use the visible synthetic cutoff. Coverage is current stock ÷ average 90-day turnover.</span></div>
      </div>
    </section>);
}
