import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BarChart3, CalendarRange, ChevronDown, ChevronRight, Database, Filter, Gauge, PackageOpen, RefreshCw, Scale, Search, TrendingDown, TrendingUp, Users, X } from "lucide-react";
import type { SptBreakdownRow, SptFilterKey, SptFilters, SptReportMeta, SptReportPayload } from "../../shared/models";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { SavedViewsBar } from "../components/SavedViewsBar";
import { SingleSelectFilter } from "../components/SingleSelectFilter";
import { SortButton } from "../components/SortButton";
import { compactNumber, money, number } from "../lib/format";
import { cycleSort, emptySort, sortItems } from "../lib/sorting";
type ReportTab = "summary" | "sellers" | "quarters";
const EMPTY_FILTERS: SptFilters = {
    month: "", seller: "", brand: "", productGroup: "", channel: "", product: "", client: "",
    line: "", category: "", subcategory: "", clientType: "", grouping: "", locality: "",
};
const FILTER_LABELS: Record<SptFilterKey, string> = {
    seller: "Seller", brand: "Brand", productGroup: "Group of item", channel: "Channel",
    product: "Product", client: "Customer", line: "Line", category: "Category",
    subcategory: "Subcategory", clientType: "Tipo of customer", grouping: "Grouping", locality: "Locality",
};
const kilos = (value: number, compact = false) => compact ? compactNumber(value) : number(value, 1);
const exactKilos = (value: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(value);
const monthLabel = (value: string, long = false) => {
    if (!value)
        return "No date";
    const [year, month] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("en-GB", { month: long ? "long" : "short", year: long ? "numeric" : "2-digit" })
        .format(new Date(year, month - 1, 1)).replace(".", "");
};
const ratio = (current: number, previous: number) => previous ? current / previous * 100 : null;
const variation = (current: number, previous: number) => previous ? (current - previous) / previous * 100 : null;
const signedPercent = (value: number | null) => value == null ? "No baseline" : `${value >= 0 ? "+" : ""}${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value)}%`;
function SelectFilter({ label, value, options, onChange }: {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
}) {
    return <MultiSelectFilter label={label} value={value} options={options} onChange={onChange}/>;
}
function DailyComparison({ report }: {
    report: SptReportPayload;
}) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const width = 820;
    const [height, setHeight] = useState(300);
    const inset = { x: 46, y: 22, bottom: 31 };
    useEffect(() => {
        const stage = stageRef.current;
        if (!stage)
            return;
        const resize = () => {
            const bounds = stage.getBoundingClientRect();
            if (bounds.width > 0 && bounds.height > 0) {
                setHeight(Math.max(220, Math.round(width * bounds.height / bounds.width)));
            }
        };
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(stage);
        return () => observer.disconnect();
    }, []);
    const cumulative = (key: "current" | "previousMonth" | "previousYear") => {
        let total = 0;
        return report.daily.map((point) => { total += point[key]; return total; });
    };
    type DailyMetricKey = "current" | "previousMonth" | "previousYear";
    const series: {
        key: DailyMetricKey;
        label: string;
        color: string;
        values: number[];
    }[] = [
        { key: "current", label: monthLabel(report.selectedMonth, true), color: "#32745b", values: cumulative("current") },
        { key: "previousMonth", label: "Previous month", color: "#d88b2e", values: cumulative("previousMonth") },
        { key: "previousYear", label: "Previous year", color: "#6484a0", values: cumulative("previousYear") },
    ];
    const max = Math.max(1, ...series.flatMap((item) => item.values));
    const x = (index: number) => inset.x + index * ((width - inset.x * 2) / Math.max(1, report.daily.length - 1));
    const y = (value: number) => height - inset.bottom - value / max * (height - inset.y - inset.bottom);
    const hoveredPoint = hoveredIndex == null ? null : report.daily[hoveredIndex];
    return <div className="spt-line-chart">
    <div className="spt-chart-legend">{series.map((item) => <span key={item.key}><i style={{ background: item.color }}/>{item.label}</span>)}</div>
    <div className="spt-line-chart-stage" ref={stageRef}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cumulative kilos by day compared with the previous month and year" onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const pointerX = (event.clientX - bounds.left) / bounds.width * width;
            const index = Math.round((pointerX - inset.x) / Math.max(1, width - inset.x * 2) * Math.max(1, report.daily.length - 1));
            setHoveredIndex(Math.max(0, Math.min(report.daily.length - 1, index)));
        }} onPointerLeave={() => setHoveredIndex(null)}>
        {[0, .25, .5, .75, 1].map((tick) => <g key={tick}><line x1={inset.x} x2={width - inset.x} y1={y(max * tick)} y2={y(max * tick)} className="spt-grid-line"/><text x={inset.x - 7} y={y(max * tick) + 3} textAnchor="end">{kilos(max * tick, true)}</text></g>)}
        {series.map((item) => <polyline key={item.key} points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(" ")} fill="none" stroke={item.color} strokeWidth={item.key === "current" ? 3 : 2} strokeDasharray={item.key === "current" ? undefined : "5 4"} strokeLinejoin="round" strokeLinecap="round"/>)}
        {hoveredIndex != null && <g className="spt-hover-guide"><line x1={x(hoveredIndex)} x2={x(hoveredIndex)} y1={inset.y} y2={height - inset.bottom}/>{series.map((item) => <circle key={item.key} cx={x(hoveredIndex)} cy={y(item.values[hoveredIndex])} r={4} fill="white" stroke={item.color} strokeWidth={2.5}/>)}</g>}
        {report.daily.map((point, index) => (point.day === 1 || point.day % 3 === 0 || point.day === report.cutoffDay) && <text key={point.day} x={x(index)} y={height - 7} textAnchor="middle">{point.day}</text>)}
      </svg>
      {hoveredPoint && hoveredIndex != null && <aside className={`spt-chart-tooltip ${hoveredIndex < 3 ? "align-start" : hoveredIndex > report.daily.length - 4 ? "align-end" : ""}`} style={{ left: `${x(hoveredIndex) / width * 100}%` }} aria-live="polite">
        <strong>Day {hoveredPoint.day}</strong>
        {series.map((item) => <div key={item.key}><i style={{ background: item.color }}/><span><b>{item.label}</b><em>{exactKilos(item.values[hoveredIndex])} kg cumulative</em><small>{exactKilos(hoveredPoint[item.key])} kg of the day</small></span></div>)}
      </aside>}
    </div>
  </div>;
}
function MonthlyChart({ report }: {
    report: SptReportPayload;
}) {
    const [hovered, setHovered] = useState<number | null>(null);
    const width = 900;
    const height = 285;
    const inset = { left: 58, right: 18, top: 20, bottom: 42 };
    const max = Math.max(1, ...report.monthly.map((row) => row.kilos));
    const chartWidth = width - inset.left - inset.right;
    const chartHeight = height - inset.top - inset.bottom;
    const step = chartWidth / report.monthly.length;
    const x = (index: number) => inset.left + step * index + step / 2;
    const y = (value: number) => inset.top + chartHeight - value / max * chartHeight;
    const hoveredRow = hovered == null ? null : report.monthly[hovered];
    return <div className="commercial-evolution-stage spt-history-stage" onMouseLeave={() => setHovered(null)}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly SPT kilo trend">
      {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={inset.left} x2={width - inset.right} y1={y(max * ratio)} y2={y(max * ratio)} className="commercial-grid-line"/>{ratio > 0 && <text x={inset.left - 9} y={y(max * ratio) + 4} textAnchor="end">{kilos(max * ratio, true)} kg</text>}</g>)}
      {report.monthly.map((row, index) => {
            const barWidth = Math.min(42, step * .58);
            const barHeight = Math.max(1, chartHeight - (y(row.kilos) - inset.top));
            return <g key={row.month} className="commercial-chart-hit" tabIndex={0} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} aria-label={`${monthLabel(row.month, true)}: ${exactKilos(row.kilos)} kilos`}>
          <rect x={x(index) - step / 2} y={inset.top} width={step} height={chartHeight} fill="transparent"/>
          <rect x={x(index) - barWidth / 2} y={y(row.kilos)} width={barWidth} height={barHeight} rx="5" className="commercial-current-bar"/>
          <text x={x(index)} y={height - 14} textAnchor="middle">{monthLabel(row.month)}</text>
        </g>;
        })}
      {hovered != null && <line x1={x(hovered)} x2={x(hovered)} y1={inset.top} y2={inset.top + chartHeight} className="commercial-hover-line"/>}
    </svg>
    {hoveredRow && hovered != null && <aside className={`commercial-chart-tooltip spt-history-tooltip ${hovered < 2 ? "align-start" : hovered > report.monthly.length - 3 ? "align-end" : ""}`} style={{ left: `${x(hovered) / width * 100}%` }}>
      <strong>{monthLabel(hoveredRow.month, true)}</strong>
      <span><i style={{ background: "#78a48f" }}/><div><small>Volume SPT</small><b>{exactKilos(hoveredRow.kilos)} kg</b></div></span>
      <div className="spt-history-tooltip-details"><span>{number(hoveredRow.clients)} customers</span><span>{number(hoveredRow.units)} units</span><span>{money(hoveredRow.netAmount)} net</span></div>
    </aside>}
  </div>;
}
function Breakdown({ rows, title }: {
    rows: SptBreakdownRow[];
    title: string;
}) {
    const max = Math.max(1, ...rows.map((row) => row.kilos));
    return <div className="spt-breakdown"><div className="spt-breakdown-head"><span>{title}</span><span>Kilos</span></div>{rows.slice(0, 12).map((row) => <article key={row.label}><div><strong>{row.label}</strong><span><i style={{ width: `${row.kilos / max * 100}%` }}/></span></div><b>{kilos(row.kilos)}</b><small>{number(row.clients)} customers</small></article>)}</div>;
}
function DailyTable({ report }: {
    report: SptReportPayload;
}) {
    type DailySortKey = "day" | "current" | "previousMonth" | "previousYear";
    const [sort, setSort] = useState(emptySort<DailySortKey>());
    const rows = sortItems(report.daily, sort, (row, key) => row[key]);
    const totals = report.daily.reduce((sum, row) => ({
        current: sum.current + row.current,
        previousMonth: sum.previousMonth + row.previousMonth,
        previousYear: sum.previousYear + row.previousYear,
    }), { current: 0, previousMonth: 0, previousYear: 0 });
    const direction = (key: DailySortKey) => sort.key === key ? sort.direction : null;
    const changeSort = (key: DailySortKey) => setSort((current) => cycleSort(current, key));
    return <div className="spt-daily-table"><header><span><SortButton label="Day" direction={direction("day")} onClick={() => changeSort("day")}/></span><span><SortButton label={monthLabel(report.selectedMonth)} direction={direction("current")} onClick={() => changeSort("current")}/></span><span><SortButton label="Previous month" direction={direction("previousMonth")} onClick={() => changeSort("previousMonth")}/></span><span><SortButton label="Previous year" direction={direction("previousYear")} onClick={() => changeSort("previousYear")}/></span></header>{rows.map((row) => <article key={row.day}><strong>{row.day}</strong><span>{kilos(row.current)}</span><span>{kilos(row.previousMonth)}</span><span>{kilos(row.previousYear)}</span></article>)}<footer><strong>Total</strong><span>{exactKilos(totals.current)}</span><span>{exactKilos(totals.previousMonth)}</span><span>{exactKilos(totals.previousYear)}</span></footer></div>;
}
function SellerTab({ report, onOpenSeller }: {
    report: SptReportPayload;
    onOpenSeller: (seller: string) => void;
}) {
    type SellerSortKey = "label" | "kilos" | "clients" | "units" | "netAmount";
    const [sort, setSort] = useState(emptySort<SellerSortKey>());
    const rows = sortItems(report.sellers, sort, (row, key) => row[key]);
    const max = Math.max(1, ...report.sellers.map((row) => row.kilos));
    const direction = (key: SellerSortKey) => sort.key === key ? sort.direction : null;
    const changeSort = (key: SellerSortKey) => setSort((current) => cycleSort(current, key));
    return <section className="data-card spt-seller-card"><div className="data-card-header"><div><span className="section-kicker"><Users size={14}/> Sellers</span><h2>Volume and coverage commercial</h2><p>Usa the universe commercial expanded definido for the analysis of sellers.</p></div><span className="count-badge">{report.sellers.length} sellers</span></div>
    <div className="spt-seller-head"><SortButton label="Seller" direction={direction("label")} onClick={() => changeSort("label")}/><SortButton label="Volume" direction={direction("kilos")} onClick={() => changeSort("kilos")}/><SortButton label="Customers" direction={direction("clients")} onClick={() => changeSort("clients")}/><SortButton label="Units" direction={direction("units")} onClick={() => changeSort("units")}/><SortButton label="Amount net" direction={direction("netAmount")} onClick={() => changeSort("netAmount")}/></div>
    <div className="spt-seller-list">{rows.map((row) => <article key={row.label}><button className="entity-link" onClick={() => onOpenSeller(row.label)}>{row.label}<ChevronRight size={13}/></button><div><b>{kilos(row.kilos)} kg</b><i><span style={{ width: `${row.kilos / max * 100}%` }}/></i></div><span>{number(row.clients)}</span><span>{number(row.units)}</span><span>{money(row.netAmount, true)}</span></article>)}</div>
  </section>;
}
function QuarterTab({ report }: {
    report: SptReportPayload;
}) {
    const selectedYear = Number(report.selectedMonth.slice(0, 4));
    const currentQuarter = Math.floor((Number(report.selectedMonth.slice(5, 7)) - 1) / 3) + 1;
    const max = Math.max(1, ...report.quarters.flatMap((row) => [row.current, row.previousYear]));
    return <section className="data-card spt-quarter-card"><div className="data-card-header"><div><span className="section-kicker"><CalendarRange size={14}/> Quarter</span><h2>Quarterly volume versus the previous year</h2><p>The current quarter uses the same cutoff day for both years and the same reconciled universe.</p></div><div className="spt-chart-legend"><span><i className="green"/>{selectedYear}</span><span><i className="blue"/>{selectedYear - 1}</span></div></div>
    <div className="spt-quarter-grid">{report.quarters.map((row) => <article key={row.quarter}><h3>Q{row.quarter}</h3><div><span className="current" style={{ height: `${row.current / max * 100}%` }}><i>{kilos(row.current, true)}</i></span><span className="previous" style={{ height: `${row.previousYear / max * 100}%` }}><i>{kilos(row.previousYear, true)}</i></span></div><p>{row.quarter > currentQuarter ? "Not started" : `${signedPercent(variation(row.current, row.previousYear))} year-over-year`}</p></article>)}</div>
  </section>;
}
export function SptReportView({ onOpenSeller }: {
    onOpenSeller: (seller: string) => void;
}) {
    const [meta, setMeta] = useState<SptReportMeta | null>(null);
    const [filters, setFilters] = useState<SptFilters>(EMPTY_FILTERS);
    const [report, setReport] = useState<SptReportPayload | null>(null);
    const [tab, setTab] = useState<ReportTab>("summary");
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        fetch("/api/reports/spt/meta").then(async (response) => {
            const payload = await response.json();
            if (!response.ok)
                throw new Error(payload.error || "Sales Performance metadata could not be opened");
            return payload as SptReportMeta;
        }).then((payload) => { setMeta(payload); setFilters({ ...EMPTY_FILTERS, month: payload.latestMonth }); }).catch((cause: Error) => { setError(cause.message); setLoading(false); });
    }, []);
    useEffect(() => {
        if (!meta || !filters.month)
            return;
        const controller = new AbortController();
        setLoading(true);
        setError("");
        const parameters = new URLSearchParams();
        for (const [key, value] of Object.entries(filters))
            if (value)
                parameters.set(key, value);
        parameters.set("page", tab === "summary" ? "main" : tab);
        fetch(`/api/reports/spt?${parameters}`, { signal: controller.signal }).then(async (response) => {
            const payload = await response.json();
            if (!response.ok)
                throw new Error(payload.error || "The report could not be calculated");
            return payload as SptReportPayload;
        }).then(setReport).catch((cause: Error) => {
            if (cause.name !== "AbortError")
                setError(cause.message);
        }).finally(() => {
            if (!controller.signal.aborted)
                setLoading(false);
        });
        return () => controller.abort();
    }, [filters, meta, tab]);
    const activeFilterCount = useMemo(() => (Object.entries(filters) as [
        keyof SptFilters,
        string
    ][]).filter(([key, value]) => key !== "month" && value).length, [filters]);
    const update = (key: keyof SptFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
    if (!meta && loading)
        return <div className="page-view spt-page"><div className="spt-loading"><RefreshCw className="spin" size={24}/><strong>Preparing Sales Performance</strong><span>Reading the deterministic local commercial dataset…</span></div></div>;
    if (!meta || (!report && error))
        return <div className="page-view spt-page"><div className="spt-loading error"><Database size={24}/><strong>Could not open Sales Performance</strong><span>{error}</span></div></div>;
    if (!report)
        return <div className="page-view spt-page"><div className="spt-loading"><RefreshCw className="spin" size={24}/><strong>Calculating comparisons</strong></div></div>;
    const previousRatio = ratio(report.current.kilos, report.previousMonth.kilos);
    const yearRatio = ratio(report.current.kilos, report.previousYear.kilos);
    const ytdRatio = ratio(report.ytd.kilos, report.previousYtd.kilos);
    const selectedMonthLong = monthLabel(report.selectedMonth, true);
    const requiredHistoricalStart = `${Number(report.selectedMonth.slice(0, 4)) - 1}-01-01`;
    const incompleteHistoricalCoverage = meta.coverageFrom > requiredHistoricalStart;
    const unavailableDocumentRate = meta.sourceDocumentCount
        ? meta.unavailableDocumentCount / (meta.sourceDocumentCount + meta.unavailableDocumentCount) * 100
        : 0;
    const selectKeys: SptFilterKey[] = ["seller", "brand", "productGroup", "channel", "line", "category", "subcategory", "clientType", "grouping", "locality"];
    const savedFilters = { ...filters, tab };
    const applySaved = (saved: Record<string, string>) => {
        setFilters(Object.fromEntries(Object.keys(EMPTY_FILTERS).map((key) => [key, saved[key] ?? (key === "month" ? meta.latestMonth : "")])) as unknown as SptFilters);
        setTab(["summary", "sellers", "quarters"].includes(saved.tab) ? saved.tab as ReportTab : "summary");
    };
    return <div className="page-view spt-page">
    <section className="data-card spt-filter-card" data-tour="spt-overview">
      <div className="spt-filter-intro"><span className="section-kicker"><Filter size={14}/> Reconciled sales universe</span><h2>Sales volume · {selectedMonthLong}</h2><p>Historical rules are recalculated from local signed invoice and credit-note rows.</p></div>
      <div className="spt-filter-primary"><SingleSelectFilter label="Month" value={filters.month} options={meta.months.map((month) => ({ value: month, label: monthLabel(month, true) }))} onChange={(value) => update("month", value)}/><SelectFilter label="Seller" value={filters.seller} options={meta.options.seller} onChange={(value) => update("seller", value)}/><SelectFilter label="Channel" value={filters.channel} options={meta.options.channel} onChange={(value) => update("channel", value)}/><button className={`button secondary spt-more-button ${activeFilterCount ? "active" : ""}`} onClick={() => setExpanded((value) => !value)}><Filter size={14}/> More filters {activeFilterCount ? `(${activeFilterCount})` : ""}<ChevronDown size={13}/></button></div>
      {expanded && <div className="spt-filter-expanded">{selectKeys.filter((key) => key !== "seller" && key !== "channel").map((key) => <SelectFilter key={key} label={FILTER_LABELS[key]} value={filters[key]} options={meta.options[key]} onChange={(value) => update(key, value)}/>)}<SelectFilter label="Product" value={filters.product} options={meta.options.product} onChange={(value) => update("product", value)}/><SelectFilter label="Customer" value={filters.client} options={meta.options.client} onChange={(value) => update("client", value)}/><button className="button secondary" onClick={() => setFilters({ ...EMPTY_FILTERS, month: meta.latestMonth })}><X size={14}/> Reset universe</button></div>}
      <SavedViewsBar viewKey="spt" filters={savedFilters} onApply={applySaved}/>
      {loading && <div className="spt-filter-loading"><RefreshCw className="spin" size={13}/> Recalculating</div>}
    </section>

    {incompleteHistoricalCoverage
            ? <section className="spt-coverage-warning"><AlertTriangle size={17}/><div><strong>Earlier comparison unavailable</strong><span>Synthetic coverage begins on {meta.coverageFrom}; periods before that date are shown as unavailable, never as zero.</span></div></section>
            : <section className="spt-coverage-warning is-complete"><Database size={17}/><div><strong>Comparable history included</strong><span>Synthetic coverage begins on {meta.coverageFrom}. Missing document details: {number(meta.unavailableDocumentCount)} of {number(meta.sourceDocumentCount + meta.unavailableDocumentCount)} ({number(unavailableDocumentRate)}%).</span></div></section>}

    <div className="spt-tabs"><button className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}><Gauge size={15}/> Summary monthly</button><button className={tab === "sellers" ? "active" : ""} onClick={() => setTab("sellers")}><Users size={15}/> Sellers</button><button className={tab === "quarters" ? "active" : ""} onClick={() => setTab("quarters")}><CalendarRange size={15}/> Quarter</button></div>

    <div className="spt-kpis">
      <article><span className="spt-kpi-icon green"><Scale size={18}/></span><div><small>Kilos MTD</small><strong>{kilos(report.current.kilos)} kg</strong><em>1–{report.cutoffDay} {selectedMonthLong}</em></div></article>
      <article><span className={`spt-kpi-icon ${previousRatio != null && previousRatio >= 100 ? "green" : "red"}`}>{previousRatio != null && previousRatio >= 100 ? <TrendingUp size={18}/> : <TrendingDown size={18}/>}</span><div><small>Vs previous month</small><strong>{previousRatio == null ? "No baseline" : `${kilos(previousRatio)}%`}</strong><em>{signedPercent(variation(report.current.kilos, report.previousMonth.kilos))} · same number of days</em></div></article>
      <article><span className={`spt-kpi-icon ${yearRatio != null && yearRatio >= 100 ? "green" : "blue"}`}><BarChart3 size={18}/></span><div><small>Vs previous year</small><strong>{incompleteHistoricalCoverage ? "No coverage" : yearRatio == null ? "No baseline" : `${kilos(yearRatio)}%`}</strong><em>{incompleteHistoricalCoverage ? "Historical comparison unavailable" : `${signedPercent(variation(report.current.kilos, report.previousYear.kilos))} year-over-year`}</em></div></article>
      <article><span className="spt-kpi-icon blue"><Users size={18}/></span><div><small>Customers</small><strong>{number(report.current.clients)}</strong><em>customers distinct in the period</em></div></article>
      <article><span className="spt-kpi-icon ochre"><PackageOpen size={18}/></span><div><small>Three-month average</small><strong>{kilos(report.averageLast3MonthsKilos)} kg</strong><em>three previous complete months</em></div></article>
      <article><span className={`spt-kpi-icon ${ytdRatio != null && ytdRatio >= 100 ? "green" : "red"}`}><CalendarRange size={18}/></span><div><small>YTD vs previous year</small><strong>{incompleteHistoricalCoverage ? "No coverage" : ytdRatio == null ? "No baseline" : `${kilos(ytdRatio)}%`}</strong><em>{incompleteHistoricalCoverage ? "Historical comparison unavailable" : `${signedPercent(variation(report.ytd.kilos, report.previousYtd.kilos))} cumulative`}</em></div></article>
    </div>

    {tab === "summary" && <>
      <div className="spt-summary-grid"><section className="data-card"><div className="data-card-header"><div><span className="section-kicker"><TrendingUp size={14}/> Monthly progress</span><h2>Kilos cumulative by day</h2><p>Equivalent comparison through day {report.cutoffDay}.</p></div><span className="count-badge">{money(report.current.netAmount, true)} net</span></div><DailyComparison report={report}/></section><section className="data-card"><div className="data-card-header"><div><span className="section-kicker"><PackageOpen size={14}/> Mix</span><h2>Product groups</h2></div></div><Breakdown rows={report.productGroups} title="Group"/></section></div>
      <section className="data-card spt-monthly-card"><div className="data-card-header"><div><span className="section-kicker"><BarChart3 size={14}/> History</span><h2>Trend of kilos by month</h2><p>Thirteen months of sales volume; the current month is marked partial when applicable.</p></div><div className="commercial-legend"><span><i className="current"/>Kilos SPT</span></div></div><MonthlyChart report={report}/></section>
      <section className="data-card spt-daily-card"><div className="data-card-header"><div><span className="section-kicker"><CalendarRange size={14}/> Daily detail</span><h2>Volume by day</h2><p>Daily kilos without accumulation, supporting the comparison.</p></div></div><DailyTable report={report}/></section>
    </>}
    {tab === "sellers" && <SellerTab report={report} onOpenSeller={onOpenSeller}/>}
    {tab === "quarters" && <QuarterTab report={report}/>}

    <section className="spt-source-note"><Database size={15}/><div><strong>{meta.sourceSystem}</strong><span>{number(meta.rowCount)} signed movements · coverage {meta.coverageFrom} to {meta.maxDate}. Product, channel, category, customer, and seller filters all use the same local synthetic universe.</span></div></section>
  </div>;
}
