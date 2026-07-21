import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CalendarRange, ChevronDown, ChevronRight, Database, Filter, PackageSearch, RefreshCw, Scale, ShoppingBag, TrendingDown, TrendingUp, Users, X } from "lucide-react";
import type { NutriPetBrandRow, NutriPetFilterKey, NutriPetFilters, NutriPetMonthlyPoint, NutriPetProductRow, NutriPetReportMeta, NutriPetReportPayload } from "../../shared/models";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { SavedViewsBar } from "../components/SavedViewsBar";
import { SingleSelectFilter } from "../components/SingleSelectFilter";
import { SortButton } from "../components/SortButton";
import { compactNumber, money as formatMoney, number } from "../lib/format";
import { cycleSort, emptySort, sortItems } from "../lib/sorting";
const EMPTY_FILTERS: NutriPetFilters = {
    year: "", month: "", channelGroup: "Specialty", brand: "", product: "", line: "", client: "", grouping: "", category: "",
};
const FILTER_LABELS: Record<NutriPetFilterKey, string> = {
    channelGroup: "Channel of sales", brand: "Brand", product: "Product", line: "Line", client: "Customer", grouping: "Grouping", category: "Category",
};
const kilos = (value: number, compact = false) => compact ? compactNumber(value) : number(value, 2);
const exactKilos = (value: number) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value);
const money = (value: number) => formatMoney(value, true);
const percent = (value: number | null, signed = false) => value == null
    ? "No baseline" : `${signed && value > 0 ? "+" : ""}${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value)}%`;
const variation = (current: number, previous: number) => previous ? (current - previous) / previous * 100 : null;
const monthLabel = (value: string, long = false) => new Intl.DateTimeFormat("en-GB", { month: long ? "long" : "short", year: "2-digit" })
    .format(new Date(`${value}-15T12:00:00Z`)).replaceAll(".", "");
const monthName = (value: string) => new Intl.DateTimeFormat("en-GB", { month: "long" })
    .format(new Date(`2026-${value}-15T12:00:00Z`)).replaceAll(".", "");
const monthNumericLabel = (value: string) => `${value.slice(5, 7)}/${value.slice(2, 4)}`;
function SelectFilter({ label, value, options, onChange }: {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
}) {
    return <MultiSelectFilter label={label} value={value} options={options} onChange={onChange}/>;
}
function EvolutionChart({ report }: {
    report: NutriPetReportPayload;
}) {
    const [hovered, setHovered] = useState<number | null>(null);
    const width = 920;
    const height = 310;
    const inset = { left: 63, right: 64, top: 23, bottom: 42 };
    const chartWidth = width - inset.left - inset.right;
    const chartHeight = height - inset.top - inset.bottom;
    const maxKilos = Math.max(1, ...report.monthly.map((row) => row.kilos));
    const minKilos = Math.min(0, ...report.monthly.map((row) => row.kilos));
    const kiloRange = Math.max(1, maxKilos - minKilos);
    const ratios = report.monthly.flatMap((row) => row.ytdVsPreviousYear == null ? [] : [row.ytdVsPreviousYear]);
    const minRatio = Math.min(0, ...ratios);
    const maxRatio = Math.max(120, ...ratios);
    const ratioRange = Math.max(1, maxRatio - minRatio);
    const step = chartWidth / Math.max(1, report.monthly.length);
    const x = (index: number) => inset.left + step * index + step / 2;
    const yKilos = (value: number) => inset.top + chartHeight - (value - minKilos) / kiloRange * chartHeight;
    const yRatio = (value: number) => inset.top + chartHeight - (value - minRatio) / ratioRange * chartHeight;
    const zeroY = yKilos(0);
    const linePoints = report.monthly.flatMap((row, index) => row.ytdVsPreviousYear == null ? [] : [`${x(index)},${yRatio(row.ytdVsPreviousYear)}`]).join(" ");
    const hoveredRow = hovered == null ? null : report.monthly[hovered];
    return <div className="nutripet-chart-stage" onMouseLeave={() => setHovered(null)}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Nova Pet volume over the last thirteen months and cumulative versus the previous year">
      {[0, .25, .5, .75, 1].map((ratioValue) => {
            const value = minKilos + kiloRange * ratioValue;
            return <g key={ratioValue}><line x1={inset.left} x2={width - inset.right} y1={yKilos(value)} y2={yKilos(value)} className="nutripet-grid-line"/>{ratioValue > 0 && <text x={inset.left - 10} y={yKilos(value) + 4} textAnchor="end">{kilos(value, true)}</text>}</g>;
        })}
      {[0, 100].map((value) => <text key={value} x={width - inset.right + 9} y={yRatio(value) + 4}>{value}%</text>)}
      <line x1={inset.left} x2={width - inset.right} y1={zeroY} y2={zeroY} className="nutripet-zero-line"/>
      {report.monthly.map((row, index) => {
            const barWidth = Math.min(43, step * .62);
            const barY = row.kilos >= 0 ? yKilos(row.kilos) : zeroY;
            const barHeight = Math.max(1, Math.abs(zeroY - yKilos(row.kilos)));
            return <g key={row.month} className="nutripet-chart-hit" tabIndex={0} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} aria-label={`${monthLabel(row.month, true)}: ${exactKilos(row.kilos)} kilos`}>
          <rect x={x(index) - step / 2} y={inset.top} width={step} height={chartHeight} fill="transparent"/>
          <rect x={x(index) - barWidth / 2} y={barY} width={barWidth} height={barHeight} rx="5" className={row.isPartial ? "nutripet-volume-bar partial" : row.kilos < 0 ? "nutripet-volume-bar negative" : "nutripet-volume-bar"}/>
          <text x={x(index)} y={height - 13} textAnchor="middle">{monthLabel(row.month)}</text>
        </g>;
        })}
      {linePoints && <polyline points={linePoints} className="nutripet-ratio-line"/>}
      {report.monthly.map((row, index) => row.ytdVsPreviousYear == null ? null : <circle key={row.month} cx={x(index)} cy={yRatio(row.ytdVsPreviousYear)} r={hovered === index ? 5 : 3.8} className="nutripet-ratio-dot"/>)}
      {hovered != null && <line x1={x(hovered)} x2={x(hovered)} y1={inset.top} y2={inset.top + chartHeight} className="nutripet-hover-line"/>}
    </svg>
    {hoveredRow && hovered != null && <aside className={`nutripet-chart-tooltip ${hovered < 2 ? "align-start" : hovered > report.monthly.length - 3 ? "align-end" : ""}`} style={{ left: `${x(hovered) / width * 100}%` }}>
      <strong>{monthLabel(hoveredRow.month, true)}{hoveredRow.isPartial ? " \u00B7 partial" : ""}</strong>
      <span><i className="volume"/><div><small>Volume</small><b>{exactKilos(hoveredRow.kilos)} kg</b></div></span>
      <span><i className="ratio"/><div><small>YTD vs previous year</small><b>{percent(hoveredRow.ytdVsPreviousYear)}</b></div></span>
      <div><span>{number(hoveredRow.clients)} customers</span><span>{percent(hoveredRow.vsPreviousMonth == null ? null : hoveredRow.vsPreviousMonth - 100, true)} vs previous month</span><span>{percent(hoveredRow.vsPreviousYear == null ? null : hoveredRow.vsPreviousYear - 100, true)} vs previous year</span></div>
    </aside>}
  </div>;
}
function ClientChart({ rows }: {
    rows: NutriPetMonthlyPoint[];
}) {
    const [hovered, setHovered] = useState<number | null>(null);
    const data = rows.slice(-12);
    const svgRef = useRef<SVGSVGElement>(null);
    const [width, setWidth] = useState(520);
    const height = 310;
    const inset = { left: 45, right: 18, top: 21, bottom: 38 };
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg)
            return;
        const updateWidth = () => setWidth(Math.max(320, Math.round(svg.getBoundingClientRect().width)));
        const observer = new ResizeObserver(updateWidth);
        observer.observe(svg);
        updateWidth();
        return () => observer.disconnect();
    }, []);
    const max = Math.max(1, ...data.map((row) => row.clients));
    const chartWidth = width - inset.left - inset.right;
    const chartHeight = height - inset.top - inset.bottom;
    const step = chartWidth / Math.max(1, data.length - 1);
    const x = (index: number) => inset.left + (data.length === 1 ? chartWidth / 2 : step * index);
    const y = (value: number) => inset.top + chartHeight - value / max * chartHeight;
    const points = data.map((row, index) => `${x(index)},${y(row.clients)}`).join(" ");
    const hoveredRow = hovered == null ? null : data[hovered];
    return <div className="nutripet-client-stage" onMouseLeave={() => setHovered(null)}>
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Nova Pet customers by month">
      {[0, .5, 1].map((ratioValue) => <g key={ratioValue}><line x1={inset.left} x2={width - inset.right} y1={y(max * ratioValue)} y2={y(max * ratioValue)} className="nutripet-grid-line"/>{ratioValue > 0 && <text x={inset.left - 8} y={y(max * ratioValue) + 4} textAnchor="end">{Math.round(max * ratioValue)}</text>}</g>)}
      <polyline points={points} className="nutripet-client-line"/>
      {data.map((row, index) => <g key={row.month} className="nutripet-chart-hit" tabIndex={0} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)}><circle cx={x(index)} cy={y(row.clients)} r={hovered === index ? 6 : 4.5} className={row.isPartial ? "nutripet-client-dot partial" : "nutripet-client-dot"}/><text x={x(index)} y={height - 12} textAnchor="middle">{monthNumericLabel(row.month)}</text></g>)}
      {hovered != null && <line x1={x(hovered)} x2={x(hovered)} y1={inset.top} y2={inset.top + chartHeight} className="nutripet-hover-line"/>}
    </svg>
    {hoveredRow && hovered != null && <aside className={`nutripet-client-tooltip ${hovered < 2 ? "align-start" : hovered > data.length - 3 ? "align-end" : ""}`} style={{ left: `${x(hovered) / width * 100}%` }}><strong>{monthLabel(hoveredRow.month, true)}</strong><b>{number(hoveredRow.clients)}</b><span>customers unique</span><small>{exactKilos(hoveredRow.kilos)} kg</small></aside>}
  </div>;
}
function QuarterChart({ report }: {
    report: NutriPetReportPayload;
}) {
    const max = Math.max(1, ...report.quarters.map((row) => row.kilos));
    return <div className="nutripet-quarter-grid">{report.quarters.map((row) => <article key={row.quarter}><div><span className={row.isPartial ? "partial" : ""} style={{ height: `${Math.max(2, Math.abs(row.kilos) / max * 100)}%` }}><i>{kilos(row.kilos, true)}</i></span></div><h3>{row.quarter}</h3><p>{number(row.clients)} customers{row.isPartial ? " \u00B7 partial" : ""}</p></article>)}</div>;
}
function BrandTable({ rows, onOpenBrand }: {
    rows: NutriPetBrandRow[];
    onOpenBrand: (brand: string) => void;
}) {
    type SortKey = "brand" | "kilos" | "clients" | "share" | "previousYearKilos" | "variation";
    const [sort, setSort] = useState(emptySort<SortKey>());
    const sorted = sortItems(rows, sort, (row, key) => row[key]);
    const direction = (key: SortKey) => sort.key === key ? sort.direction : null;
    const change = (key: SortKey) => setSort((current) => cycleSort(current, key));
    return <div className="nutripet-brand-table"><header><SortButton label="Brand" direction={direction("brand")} onClick={() => change("brand")}/><SortButton label="Kilos" direction={direction("kilos")} onClick={() => change("kilos")}/><SortButton label="Customers" direction={direction("clients")} onClick={() => change("clients")}/><SortButton label="Share" direction={direction("share")} onClick={() => change("share")}/><SortButton label="Year previous comparable" direction={direction("previousYearKilos")} onClick={() => change("previousYearKilos")}/><SortButton label="Change" direction={direction("variation")} onClick={() => change("variation")}/></header>{sorted.map((row) => <article key={row.brand}><button className="entity-link" onClick={() => onOpenBrand(row.brand)}>{row.brand}</button><span>{exactKilos(row.kilos)}</span><span>{number(row.clients)}</span><span>{percent(row.share)}</span><span>{exactKilos(row.previousYearKilos)}</span><span className={row.variation != null && row.variation >= 0 ? "positive" : "negative"}>{percent(row.variation, true)}</span></article>)}</div>;
}
function ProductTable({ rows, onOpenProduct, onOpenBrand }: {
    rows: NutriPetProductRow[];
    onOpenProduct: (productId: string) => void;
    onOpenBrand: (brand: string) => void;
}) {
    type SortKey = "product" | "brand" | "kilos" | "clients" | "units" | "share";
    const [sort, setSort] = useState(emptySort<SortKey>());
    const sorted = sortItems(rows, sort, (row, key) => row[key]);
    const direction = (key: SortKey) => sort.key === key ? sort.direction : null;
    const change = (key: SortKey) => setSort((current) => cycleSort(current, key));
    return <div className="nutripet-product-table"><header><SortButton label="Product" direction={direction("product")} onClick={() => change("product")}/><SortButton label="Brand" direction={direction("brand")} onClick={() => change("brand")}/><SortButton label="Kilos" direction={direction("kilos")} onClick={() => change("kilos")}/><SortButton label="Customers" direction={direction("clients")} onClick={() => change("clients")}/><SortButton label="Units" direction={direction("units")} onClick={() => change("units")}/><SortButton label="Share" direction={direction("share")} onClick={() => change("share")}/></header>{sorted.map((row) => <article key={`${row.productId}:${row.brand}`}><button className="entity-link product-entity-link" onClick={() => onOpenProduct(row.productId)}>{row.product}<ChevronRight size={12}/></button><button className="entity-link" onClick={() => onOpenBrand(row.brand)}>{row.brand}</button><span>{exactKilos(row.kilos)}</span><span>{number(row.clients)}</span><span>{number(row.units)}</span><span>{percent(row.share)}</span></article>)}</div>;
}
export function NutriPetReportView({ onOpenProduct, onOpenBrand }: {
    onOpenProduct: (productId: string) => void;
    onOpenBrand: (brand: string) => void;
}) {
    const [meta, setMeta] = useState<NutriPetReportMeta | null>(null);
    const [filters, setFilters] = useState<NutriPetFilters>(EMPTY_FILTERS);
    const [report, setReport] = useState<NutriPetReportPayload | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        fetch("/api/reports/nutripet/meta").then(async (response) => {
            const payload = await response.json();
            if (!response.ok)
                throw new Error(payload.error || "Nova Pet metadata could not be opened");
            return payload as NutriPetReportMeta;
        }).then((payload) => {
            setMeta(payload);
            setFilters({ ...EMPTY_FILTERS, year: payload.latestYear, month: payload.latestMonth.slice(5, 7) });
        }).catch((cause: Error) => { setError(cause.message); setLoading(false); });
    }, []);
    useEffect(() => {
        if (!meta || !filters.year || !filters.month)
            return;
        const controller = new AbortController();
        const parameters = new URLSearchParams();
        for (const [key, value] of Object.entries(filters))
            if (value)
                parameters.set(key, value);
        setLoading(true);
        setError("");
        fetch(`/api/reports/nutripet?${parameters}`, { signal: controller.signal }).then(async (response) => {
            const payload = await response.json();
            if (!response.ok)
                throw new Error(payload.error || "Nova Pet could not be calculated");
            return payload as NutriPetReportPayload;
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
        keyof NutriPetFilters,
        string
    ][]).filter(([key, value]) => !["year", "month"].includes(key) && value && !(key === "channelGroup" && value === "Specialty")).length, [filters]);
    const update = (key: keyof NutriPetFilters, value: string) => setFilters((current) => {
        if (key === "year" && meta) {
            const available = meta.monthsByYear[value] ?? [];
            return { ...current, year: value, month: available.includes(current.month) ? current.month : available.at(-1) ?? current.month };
        }
        return { ...current, [key]: value };
    });
    if (!meta && loading)
        return <div className="page-view nutripet-page"><div className="spt-loading"><RefreshCw className="spin" size={24}/><strong>Preparing Nova Pet</strong><span>Reconstructing sales, customers, and comparisons from local synthetic data…</span></div></div>;
    if (!meta || (!report && error))
        return <div className="page-view nutripet-page"><div className="spt-loading error"><Database size={24}/><strong>Could not open Nova Pet</strong><span>{error}</span></div></div>;
    if (!report)
        return <div className="page-view nutripet-page"><div className="spt-loading"><RefreshCw className="spin" size={24}/><strong>Calculating Nova Pet</strong></div></div>;
    const currentVsPrevious = variation(report.current.kilos, report.previousMonth.kilos);
    const currentVsYear = variation(report.current.kilos, report.previousYear.kilos);
    const ytdVsYear = variation(report.ytd.kilos, report.previousYtd.kilos);
    const clientYtdVariation = variation(report.ytd.clients, report.previousYtd.clients);
    const filterKeys: NutriPetFilterKey[] = ["brand", "product", "line", "client", "grouping", "category"];
    const reset = () => setFilters({ ...EMPTY_FILTERS, year: meta.latestYear, month: meta.latestMonth.slice(5, 7) });
    const applySaved = (saved: Record<string, string>) => setFilters({
        year: saved.year || meta.latestYear, month: saved.month || meta.latestMonth.slice(5, 7),
        channelGroup: saved.channelGroup ?? "Specialty", brand: saved.brand || "", product: saved.product || "",
        line: saved.line || "", client: saved.client || "", grouping: saved.grouping || "", category: saved.category || "",
    });
    return <div className="page-view nutripet-page">
    <section className="data-card nutripet-filter-card" data-tour="nutripet-overview">
      <div className="nutripet-filter-copy"><span className="section-kicker"><ShoppingBag size={14}/> Nova Pet</span><h2>Supplier coverage · {monthLabel(report.selectedMonth, true)}</h2><p>Volume and coverage for a fictional supplier, calculated from local synthetic invoices and credit notes.</p></div>
      <div className="nutripet-filter-controls"><SingleSelectFilter label="Year" value={filters.year} options={meta.years} onChange={(value) => update("year", value)}/><SingleSelectFilter label="Month" value={filters.month} options={(meta.monthsByYear[filters.year] ?? []).map((month) => ({ value: month, label: monthName(month) }))} onChange={(value) => update("month", value)}/><SelectFilter label={FILTER_LABELS.channelGroup} value={filters.channelGroup} options={meta.options.channelGroup} onChange={(value) => update("channelGroup", value)}/><button className={`button secondary nutripet-more-button ${activeFilterCount ? "active" : ""}`} onClick={() => setExpanded((value) => !value)}><Filter size={14}/> More filters {activeFilterCount ? `(${activeFilterCount})` : ""}<ChevronDown size={13}/></button></div>
      {expanded && <div className="nutripet-filter-expanded">{filterKeys.map((key) => <SelectFilter key={key} label={FILTER_LABELS[key]} value={filters[key]} options={meta.options[key]} onChange={(value) => update(key, value)}/>)}<button className="button secondary" onClick={reset}><X size={14}/> Reset</button></div>}
      <SavedViewsBar viewKey="nutripet" filters={{ ...filters }} onApply={applySaved}/>
      {loading && <div className="nutripet-filter-loading"><RefreshCw className="spin" size={13}/> Recalculating</div>}
    </section>

    <section className={`nutripet-period-note ${report.isPartial ? "partial" : ""}`}><CalendarRange size={17}/><div><strong>{monthLabel(report.selectedMonth, true)} · cutoff {report.periodEnd.split("-").reverse().join("/")}</strong><span>{report.isPartial ? `Month in progress: ${report.elapsedDays} days. Previous month, previous year, and YTD use the same cutoff day.` : "Complete month. Comparisons use equivalent calendar periods."}</span></div></section>

    <div className="nutripet-kpis">
      <article><span className="nutripet-kpi-icon green"><Scale size={20}/></span><div><small>Total kilos</small><strong>{kilos(report.current.kilos)} kg</strong><em>{number(report.current.clients)} customers · {money(report.current.netAmount)}</em></div></article>
      <article><span className={`nutripet-kpi-icon ${currentVsPrevious != null && currentVsPrevious >= 0 ? "green" : "ochre"}`}>{currentVsPrevious != null && currentVsPrevious >= 0 ? <TrendingUp size={20}/> : <TrendingDown size={20}/>}</span><div><small>Comparable previous month</small><strong>{kilos(report.previousMonth.kilos)} kg</strong><em>{percent(currentVsPrevious, true)}</em></div></article>
      <article><span className="nutripet-kpi-icon blue"><BarChart3 size={20}/></span><div><small>Same month, previous year</small><strong>{kilos(report.previousYear.kilos)} kg</strong><em>{percent(currentVsYear, true)}</em></div></article>
      <article><span className="nutripet-kpi-icon green"><CalendarRange size={20}/></span><div><small>Volume YTD</small><strong>{kilos(report.ytd.kilos)} kg</strong><em>{percent(ytdVsYear, true)} vs previous year</em></div></article>
      <article><span className="nutripet-kpi-icon blue"><Users size={20}/></span><div><small>Customers this month</small><strong>{number(report.current.clients)}</strong><em>{number(report.current.units)} units</em></div></article>
      <article><span className="nutripet-kpi-icon ochre"><Users size={20}/></span><div><small>Customers YTD</small><strong>{number(report.ytd.clients)}</strong><em>{percent(clientYtdVariation, true)} · {number(report.previousYtd.clients)} LY</em></div></article>
    </div>

    <div className="nutripet-main-grid"><section className="data-card nutripet-evolution-card"><div className="data-card-header"><div><span className="section-kicker"><TrendingUp size={14}/> Trend</span><h2>Volume and cumulative year-over-year</h2><p>Last 13 available months. Bars show kilos and the line shows YTD versus the previous year.</p></div><div className="nutripet-legend"><span><i />Volume</span><span><i className="ratio"/>YTD vs LY</span><span><i className="partial"/>Partial month</span></div></div><EvolutionChart report={report}/></section><section className="data-card nutripet-client-card"><div className="data-card-header"><div><span className="section-kicker"><Users size={14}/> Coverage</span><h2>Customers by month</h2><p>Each customer ID is counted once per month.</p></div></div><ClientChart rows={report.monthly}/></section></div>

    <div className="nutripet-secondary-grid"><section className="data-card nutripet-quarter-card"><div className="data-card-header"><div><span className="section-kicker"><CalendarRange size={14}/> Quarters</span><h2>Volume by quarter · {filters.year}</h2><p>The selected month does not limit this annual view.</p></div></div><QuarterChart report={report}/></section><section className="data-card nutripet-brand-card"><div className="data-card-header"><div><span className="section-kicker"><ShoppingBag size={14}/> Brands</span><h2>Selected-month mix</h2><p>Volume compared with the same previous-year cutoff.</p></div><span className="count-badge">{number(report.brands.length)} brands</span></div><BrandTable rows={report.brands} onOpenBrand={onOpenBrand}/></section></div>

    <section className="data-card nutripet-product-card"><div className="data-card-header"><div><span className="section-kicker"><PackageSearch size={14}/> Auditable detail</span><h2>Products in the selected month</h2><p>Select any header to cycle through ascending, descending, and original order.</p></div><span className="count-badge">{number(report.products.length)} products</span></div><ProductTable rows={report.products} onOpenProduct={onOpenProduct} onOpenBrand={onOpenBrand}/></section>

    <section className="nutripet-source-note"><Database size={16}/><div><strong>{meta.sourceSystem}</strong><span>{number(meta.rowCount)} fictional Nova Pet movements · coverage {meta.coverageFrom} to {meta.maxDate}. All supplier, customer, product, and document details are synthetic.</span></div></section>
  </div>;
}
