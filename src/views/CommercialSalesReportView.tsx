import { useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronDown, ChevronRight, CircleDollarSign, Database, Filter, PackageOpen, RefreshCw, Scale, ShoppingBasket, Store, TrendingDown, TrendingUp, X } from "lucide-react";
import type { CommercialSalesBrandRow, CommercialSalesFilterKey, CommercialSalesFilters, CommercialSalesMixRow, CommercialSalesReportMeta, CommercialSalesReportPayload, } from "../../shared/models";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { SavedViewsBar } from "../components/SavedViewsBar";
import { SingleSelectFilter } from "../components/SingleSelectFilter";
import { SortButton } from "../components/SortButton";
import { compactNumber, money, number } from "../lib/format";
import { cycleSort, emptySort, sortItems } from "../lib/sorting";
const EMPTY_FILTERS: CommercialSalesFilters = { periodMode: "month", month: "", year: "", seller: "", category: "", brand: "", productGroup: "" };
const FILTER_LABELS: Record<CommercialSalesFilterKey, string> = {
    seller: "Seller",
    category: "Category",
    brand: "Brand",
    productGroup: "Group of item",
};
const MIX_COLORS: Record<CommercialSalesMixRow["label"], string> = {
    Balanceado: "#397a60",
    Autoservicio: "#d78a2d",
    Drovet: "#6687a4",
    Sanitarios: "#9b6f9f",
    Otros: "#b9c2bc",
};
const monthLabel = (value: string, long = false) => {
    const [year, month] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("en-GB", { month: long ? "long" : "short", year: long ? "numeric" : "2-digit" })
        .format(new Date(year, month - 1, 1)).replace(".", "");
};
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`)).replaceAll(".", "");
const kilos = (value: number, compact = false) => compact ? compactNumber(value) : number(value, 1);
const price = (value: number | null) => value == null ? "No baseline" : money(value);
const percent = (value: number | null, signed = false) => value == null
    ? "No baseline" : `${signed && value > 0 ? "+" : ""}${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value)}%`;
function SelectFilter({ label, value, options, onChange }: {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
}) {
    return <MultiSelectFilter label={label} value={value} options={options} onChange={onChange}/>;
}
function EvolutionChart({ report }: {
    report: CommercialSalesReportPayload;
}) {
    const [hovered, setHovered] = useState<number | null>(null);
    const width = 820;
    const height = 285;
    const inset = { left: 56, right: 18, top: 20, bottom: 42 };
    const max = Math.max(1, ...report.monthly.flatMap((row) => [row.current, row.previousYear]));
    const chartWidth = width - inset.left - inset.right;
    const chartHeight = height - inset.top - inset.bottom;
    const step = chartWidth / report.monthly.length;
    const x = (index: number) => inset.left + step * index + step / 2;
    const y = (value: number) => inset.top + chartHeight - value / max * chartHeight;
    const line = report.monthly.map((row, index) => `${x(index)},${y(row.previousYear)}`).join(" ");
    const hoveredRow = hovered == null ? null : report.monthly[hovered];
    return <div className="commercial-evolution-stage" onMouseLeave={() => setHovered(null)}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Net sales trend ${report.periodMode === "year" ? `during ${report.selectedPeriod}` : "by month"}`}>
      {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={inset.left} x2={width - inset.right} y1={y(max * ratio)} y2={y(max * ratio)} className="commercial-grid-line"/>{ratio > 0 && <text x={inset.left - 9} y={y(max * ratio) + 4} textAnchor="end">{money(max * ratio, true)}</text>}</g>)}
      {report.monthly.map((row, index) => {
            const barWidth = Math.min(50, step * .56);
            const barHeight = Math.max(1, chartHeight - (y(row.current) - inset.top));
            return <g key={row.month} className="commercial-chart-hit" tabIndex={0} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)}>
          <rect x={x(index) - step / 2} y={inset.top} width={step} height={chartHeight} fill="transparent"/>
          <rect x={x(index) - barWidth / 2} y={y(row.current)} width={barWidth} height={barHeight} rx="5" className="commercial-current-bar"/>
          <text x={x(index)} y={height - 14} textAnchor="middle">{monthLabel(row.month)}</text>
        </g>;
        })}
      {report.comparisonAvailable && <polyline points={line} className="commercial-prior-line"/>}
      {report.comparisonAvailable && report.monthly.map((row, index) => <circle key={row.month} cx={x(index)} cy={y(row.previousYear)} r={hovered === index ? 5 : 3.5} className="commercial-prior-dot"/>)}
      {hovered != null && <line x1={x(hovered)} x2={x(hovered)} y1={inset.top} y2={inset.top + chartHeight} className="commercial-hover-line"/>}
    </svg>
    {hoveredRow && hovered != null && <aside className={`commercial-chart-tooltip ${hovered < 2 ? "align-start" : hovered > report.monthly.length - 3 ? "align-end" : ""}`} style={{ left: `${x(hovered) / width * 100}%` }}>
      <strong>{monthLabel(hoveredRow.month, true)}</strong>
      <span><i style={{ background: "#397a60" }}/><div><small>Net sales</small><b>{money(hoveredRow.current)}</b></div></span>
      {report.comparisonAvailable && <span><i style={{ background: "#6687a4" }}/><div><small>Previous year</small><b>{money(hoveredRow.previousYear)}</b></div></span>}
      <em>{report.comparisonAvailable ? `${percent(hoveredRow.previousYear ? (hoveredRow.current - hoveredRow.previousYear) / hoveredRow.previousYear * 100 : null, true)} year-over-year` : "No previous-year coverage"}</em>
    </aside>}
  </div>;
}
function MixChart({ rows }: {
    rows: CommercialSalesMixRow[];
}) {
    const [hovered, setHovered] = useState<CommercialSalesMixRow["label"] | null>(null);
    const radius = 62;
    const circumference = Math.PI * radius * 2;
    let offset = 0;
    const total = rows.reduce((sum, row) => sum + row.netAmount, 0);
    return <div className="commercial-mix">
    <div className="commercial-donut-wrap">
      <svg viewBox="0 0 180 180" role="img" aria-label="Net sales composition">
        <circle cx="90" cy="90" r={radius} className="commercial-donut-track"/>
        {rows.map((row) => {
            const length = circumference * row.share / 100;
            const currentOffset = offset;
            offset += length;
            return <circle key={row.label} cx="90" cy="90" r={radius} fill="none" stroke={MIX_COLORS[row.label]} strokeWidth={hovered === row.label ? 24 : 20} strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-currentOffset} className="commercial-donut-slice" tabIndex={0} onMouseEnter={() => setHovered(row.label)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(row.label)} onBlur={() => setHovered(null)}><title>{row.label}: {money(row.netAmount)} ({percent(row.share)})</title></circle>;
        })}
      </svg>
      <div><strong>{money(total, true)}</strong><span>sales net</span></div>
    </div>
    <div className="commercial-mix-list">{rows.map((row) => <article key={row.label} className={hovered === row.label ? "active" : ""} onMouseEnter={() => setHovered(row.label)} onMouseLeave={() => setHovered(null)}><i style={{ background: MIX_COLORS[row.label] }}/><div><strong>{row.label}</strong><span>{number(row.clients)} customers · {kilos(row.kilos, true)} kg</span></div><b>{percent(row.share)}</b><em>{money(row.netAmount, true)}</em></article>)}</div>
  </div>;
}
function BrandTable({ report, onOpenProduct, onOpenBrand }: {
    report: CommercialSalesReportPayload;
    onOpenProduct: (productId: string) => void;
    onOpenBrand: (brand: string) => void;
}) {
    type SortKey = "brand" | "kilos" | "averagePricePerKilo" | "kiloShare" | "netAmount" | "salesShare" | "averageDailySales";
    const [sort, setSort] = useState(emptySort<SortKey>());
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const rows = sortItems(report.brands, sort, (row, key) => row[key]);
    const direction = (key: SortKey) => sort.key === key ? sort.direction : null;
    const changeSort = (key: SortKey) => setSort((current) => cycleSort(current, key));
    const toggle = (brand: string) => setExpanded((current) => {
        const next = new Set(current);
        if (next.has(brand))
            next.delete(brand);
        else
            next.add(brand);
        return next;
    });
    return <div className="commercial-brand-table">
    <header><SortButton label="Brand / product" direction={direction("brand")} onClick={() => changeSort("brand")}/><SortButton label="Kilos" direction={direction("kilos")} onClick={() => changeSort("kilos")}/><SortButton label="Avg. price / kg" direction={direction("averagePricePerKilo")} onClick={() => changeSort("averagePricePerKilo")}/><SortButton label="% kilos" direction={direction("kiloShare")} onClick={() => changeSort("kiloShare")}/><SortButton label="Net sales" direction={direction("netAmount")} onClick={() => changeSort("netAmount")}/><SortButton label="% sales" direction={direction("salesShare")} onClick={() => changeSort("salesShare")}/><SortButton label="Average daily sales" direction={direction("averageDailySales")} onClick={() => changeSort("averageDailySales")}/></header>
    <div>{rows.map((row) => <div className="commercial-brand-group" key={row.brand}>
      <div className="commercial-brand-row" aria-expanded={expanded.has(row.brand)}><span><button className="icon-button" aria-label={`${expanded.has(row.brand) ? "Hide" : "Show"} products of ${row.brand}`} onClick={() => toggle(row.brand)}><ChevronRight size={15}/></button><button className="entity-link" onClick={() => onOpenBrand(row.brand)}>{row.brand}</button><small>{number(row.products.length)} products · {number(row.clients)} customers</small></span><strong>{kilos(row.kilos)}</strong><strong>{price(row.averagePricePerKilo)}</strong><strong>{percent(row.kiloShare)}</strong><strong>{money(row.netAmount)}</strong><strong>{percent(row.salesShare)}</strong><strong>{money(row.averageDailySales)}</strong></div>
      {expanded.has(row.brand) && <div className="commercial-product-rows">{row.products.map((product) => <article key={product.productId}><span><button className="entity-link product-entity-link" onClick={() => onOpenProduct(product.productId)}>{product.product}<ChevronRight size={12}/></button><small>{product.productId} · {number(product.clients)} customers</small></span><strong>{kilos(product.kilos)}</strong><strong>{price(product.averagePricePerKilo)}</strong><strong>{percent(row.kilos ? product.kilos / row.kilos * 100 : 0)}</strong><strong>{money(product.netAmount)}</strong><strong>{percent(row.netAmount ? product.netAmount / row.netAmount * 100 : 0)}</strong><strong>{money(product.netAmount / report.elapsedDays)}</strong></article>)}</div>}
    </div>)}</div>
    <footer><strong>Total</strong><strong>{kilos(report.brandTotal.kilos)}</strong><strong>{price(report.brandTotal.averagePricePerKilo)}</strong><strong>100%</strong><strong>{money(report.brandTotal.netAmount)}</strong><strong>100%</strong><strong>{money(report.brandTotal.averageDailySales)}</strong></footer>
  </div>;
}
export function CommercialSalesReportView({ onOpenProduct, onOpenBrand }: {
    onOpenProduct: (productId: string) => void;
    onOpenBrand: (brand: string) => void;
}) {
    const [meta, setMeta] = useState<CommercialSalesReportMeta | null>(null);
    const [filters, setFilters] = useState<CommercialSalesFilters>(EMPTY_FILTERS);
    const [report, setReport] = useState<CommercialSalesReportPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        fetch("/api/reports/commercial-sales/meta").then(async (response) => {
            const payload = await response.json();
            if (!response.ok)
                throw new Error(payload.error || "Report metadata could not be opened commercial");
            return payload as CommercialSalesReportMeta;
        }).then((payload) => { setMeta(payload); setFilters({ ...EMPTY_FILTERS, month: payload.latestMonth, year: payload.latestYear }); }).catch((cause: Error) => { setError(cause.message); setLoading(false); });
    }, []);
    useEffect(() => {
        if (!meta || !filters.month)
            return;
        const controller = new AbortController();
        const parameters = new URLSearchParams();
        for (const [key, value] of Object.entries(filters))
            if (value)
                parameters.set(key, value);
        setLoading(true);
        setError("");
        fetch(`/api/reports/commercial-sales?${parameters}`, { signal: controller.signal }).then(async (response) => {
            const payload = await response.json();
            if (!response.ok)
                throw new Error(payload.error || "The report could not be calculated commercial");
            return payload as CommercialSalesReportPayload;
        }).then(setReport).catch((cause: Error) => {
            if (cause.name !== "AbortError")
                setError(cause.message);
        }).finally(() => {
            if (!controller.signal.aborted)
                setLoading(false);
        });
        return () => controller.abort();
    }, [filters, meta]);
    const activeFilterCount = useMemo(() => (Object.entries(filters) as [
        keyof CommercialSalesFilters,
        string
    ][]).filter(([key, value]) => !["periodMode", "month", "year"].includes(key) && value).length, [filters]);
    const update = (key: keyof CommercialSalesFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
    if (!meta && loading)
        return <div className="page-view commercial-page"><div className="spt-loading"><RefreshCw className="spin" size={24}/><strong>Preparing Commercial Sales</strong><span>Reading the deterministic local commercial dataset…</span></div></div>;
    if (!meta || (!report && error))
        return <div className="page-view commercial-page"><div className="spt-loading error"><Database size={24}/><strong>Could not open Commercial Sales</strong><span>{error}</span></div></div>;
    if (!report)
        return <div className="page-view commercial-page"><div className="spt-loading"><RefreshCw className="spin" size={24}/><strong>Calculating commercial metrics</strong></div></div>;
    const hasComparison = report.comparisonAvailable && report.comparison.netAmount !== 0;
    const positive = hasComparison && report.variation != null && report.variation >= 0;
    const periodTitle = report.periodMode === "year" ? report.selectedPeriod : monthLabel(report.selectedPeriod, true);
    const comparisonTitle = report.periodMode === "year" ? "Same period previous year" : "Same period previous month";
    const differenceTitle = report.periodMode === "year" ? "Difference vs previous year" : "Difference vs previous month";
    const comparisonLegend = report.periodMode === "year" ? String(Number(report.selectedPeriod) - 1) : "Previous year";
    const resetFilters = () => setFilters({ ...EMPTY_FILTERS, periodMode: filters.periodMode, month: meta.latestMonth, year: meta.latestYear });
    const filterKeys: CommercialSalesFilterKey[] = ["seller", "category", "brand", "productGroup"];
    const applySaved = (saved: Record<string, string>) => setFilters({
        periodMode: saved.periodMode === "year" ? "year" : "month",
        month: saved.month || meta.latestMonth,
        year: saved.year || meta.latestYear,
        seller: saved.seller || "", category: saved.category || "", brand: saved.brand || "", productGroup: saved.productGroup || "",
    });
    return <div className="page-view commercial-page">
    <section className="data-card commercial-filter-card" data-tour="commercial-sales-overview">
      <div><span className="section-kicker"><Filter size={14}/> Commercial Sales</span><h2>Net sales · {periodTitle}</h2><p>{report.periodMode === "year" ? `Annual view from ${dateLabel(report.periodStart)} to ${dateLabel(report.periodEnd)}.` : "Monthly view"} calculated from local synthetic invoices and credit notes.</p><div className="commercial-period-tabs" role="group" aria-label="Frequency of the report"><button type="button" className={filters.periodMode === "month" ? "active" : ""} aria-pressed={filters.periodMode === "month"} onClick={() => update("periodMode", "month")}>Monthly</button><button type="button" className={filters.periodMode === "year" ? "active" : ""} aria-pressed={filters.periodMode === "year"} onClick={() => update("periodMode", "year")}>Annual</button></div></div>
      <div className="commercial-filters"><SingleSelectFilter label={filters.periodMode === "year" ? "Year" : "Month"} value={filters.periodMode === "year" ? filters.year : filters.month} options={filters.periodMode === "year" ? meta.years : meta.months.map((month) => ({ value: month, label: monthLabel(month, true) }))} onChange={(value) => update(filters.periodMode === "year" ? "year" : "month", value)}/>{filterKeys.map((key) => <SelectFilter key={key} label={FILTER_LABELS[key]} value={filters[key]} options={meta.options[key]} onChange={(value) => update(key, value)}/>)}<button className="button secondary" disabled={!activeFilterCount} onClick={resetFilters}><X size={14}/> Clear {activeFilterCount ? `(${activeFilterCount})` : ""}</button></div>
      <SavedViewsBar viewKey="commercial-sales" filters={{ ...filters }} onApply={applySaved}/>
      {loading && <div className="commercial-filter-loading"><RefreshCw className="spin" size={13}/> Recalculating</div>}
    </section>

    <div className="commercial-main-kpis">
      <article><span className="commercial-kpi-icon green"><CircleDollarSign size={21}/></span><div><small>Net sales</small><strong>{money(report.current.netAmount, true)}</strong><em>{dateLabel(report.periodStart)}–{dateLabel(report.periodEnd)} · {number(report.elapsedDays)} days</em></div></article>
      <article><span className="commercial-kpi-icon blue"><BarChart3 size={21}/></span><div><small>{comparisonTitle}</small><strong>{report.comparisonAvailable ? money(report.comparison.netAmount, true) : "No coverage"}</strong><em>{report.comparisonAvailable ? `${dateLabel(report.comparisonStart)}\u2013${dateLabel(report.comparisonEnd)}` : `Synthetic coverage starts on ${meta.coverageFrom}`}</em></div></article>
      <article className={!hasComparison ? "" : positive ? "positive" : "negative"}><span className={`commercial-kpi-icon ${!hasComparison ? "blue" : positive ? "green" : "red"}`}>{!hasComparison ? <BarChart3 size={21}/> : positive ? <TrendingUp size={21}/> : <TrendingDown size={21}/>}</span><div><small>{differenceTitle}</small><strong>{hasComparison ? `${report.difference >= 0 ? "+" : ""}${money(report.difference, true)}` : "No baseline"}</strong><em>{hasComparison ? percent(report.variation, true) : "Previous period outside coverage"}</em></div></article>
    </div>

    <div className="commercial-segment-kpis">
      <article><span className="commercial-kpi-icon green"><Scale size={19}/></span><div><small>Balanced food</small><strong>{money(report.segments.balanceado.netAmount, true)}</strong><em>{kilos(report.segments.balanceado.kilos, true)} kg · {number(report.segments.balanceado.clients)} customers</em></div></article>
      <article><span className="commercial-kpi-icon blue"><PackageOpen size={19}/></span><div><small>Specialty portfolio</small><strong>{money(report.segments.drovet.netAmount, true)}</strong><em>{kilos(report.segments.drovet.kilos, true)} kg · {number(report.segments.drovet.clients)} customers</em></div></article>
      <article><span className="commercial-kpi-icon purple"><ShoppingBasket size={19}/></span><div><small>Care products and accessories</small><strong>{money(report.segments.sanitarios.netAmount, true)}</strong><em>{kilos(report.segments.sanitarios.kilos, true)} kg · {number(report.segments.sanitarios.clients)} customers</em></div></article>
      <article><span className="commercial-kpi-icon ochre"><Store size={19}/></span><div><small>Small retail</small><strong>{money(report.segments.autoservicio.netAmount, true)}</strong><em>{kilos(report.segments.autoservicio.kilos, true)} kg · {number(report.segments.autoservicio.clients)} customers</em></div></article>
    </div>

    <div className="commercial-chart-grid">
      <section className="data-card commercial-evolution-card"><div className="data-card-header"><div><span className="section-kicker"><TrendingUp size={14}/> Trend</span><h2>{report.periodMode === "year" ? `Trend of ${report.selectedPeriod} by month` : "Trend of $ by month"}</h2><p>{report.periodMode === "year" ? `Monthly net sales in ${report.selectedPeriod} versus ${Number(report.selectedPeriod) - 1}.` : "Seven months of net sales versus the same months of the previous year."}</p></div><div className="commercial-legend"><span><i className="current"/>Net sales</span>{report.comparisonAvailable && <span><i className="prior"/>{comparisonLegend}</span>}</div></div><EvolutionChart report={report}/></section>
      <section className="data-card commercial-mix-card"><div className="data-card-header"><div><span className="section-kicker"><PackageOpen size={14}/> Composition</span><h2>Net sales by negocio</h2><p>Small Retail is shown as its own business line.</p></div></div><MixChart rows={report.mix}/></section>
    </div>

    <section className="data-card commercial-brand-card"><div className="data-card-header"><div><span className="section-kicker"><ShoppingBasket size={14}/> Commercial detail</span><h2>Total kilos and average price by brand</h2><p>The matrix covers food and treat categories. Expand a brand to inspect products, or open its profile from the name.</p></div><span className="count-badge">{number(report.brands.length)} brands</span></div><BrandTable report={report} onOpenProduct={onOpenProduct} onOpenBrand={onOpenBrand}/></section>

    <section className="commercial-source-note"><Database size={16}/><div><strong>{meta.sourceSystem}</strong><span>{number(meta.rowCount)} signed fictional movements · coverage {meta.coverageFrom} to {meta.maxDate}. Internal demo movements are excluded by the centralized report universe.</span></div></section>
  </div>;
}
