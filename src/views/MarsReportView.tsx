import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Building2, CalendarRange, ChevronDown, Database, Filter, PawPrint, RefreshCw, Scale, Store, TrendingDown, TrendingUp, Users, X } from "lucide-react";
import type { MarsBrandRow, MarsFilterKey, MarsFilters, MarsPeriodPoint, MarsReportMeta, MarsReportPayload } from "../../shared/models";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { SavedViewsBar } from "../components/SavedViewsBar";
import { SingleSelectFilter } from "../components/SingleSelectFilter";
import { SortButton } from "../components/SortButton";
import { cycleSort, emptySort, sortItems } from "../lib/sorting";
import { compactNumber, number } from "../lib/format";
const EMPTY_FILTERS: MarsFilters = {
    year: "", period: "", clientMode: "branch", branch: "", clientType: "",
    channelGroup: "", brand: "", subcategoryGroup: "",
};
const FILTER_LABELS: Record<MarsFilterKey, string> = {
    branch: "Branch",
    clientType: "Tipo of customer",
    channelGroup: "Channel of sales",
    brand: "Brand",
    subcategoryGroup: "Subcategory",
};
const kilos = (value: number, compact = false) => compact ? compactNumber(value) : number(value, 2);
const exactKilos = (value: number) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value);
const percent = (value: number | null, signed = false) => value == null
    ? "No baseline" : `${signed && value > 0 ? "+" : ""}${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value)}%`;
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" })
    .format(new Date(`${value}T12:00:00Z`)).replaceAll(".", "");
const variation = (current: number, previous: number) => previous ? (current - previous) / previous * 100 : null;
function SelectFilter({ label, value, options, onChange }: {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
}) {
    return <MultiSelectFilter label={label} value={value} options={options} onChange={onChange}/>;
}
function VolumeChart({ report }: {
    report: MarsReportPayload;
}) {
    const [hovered, setHovered] = useState<number | null>(null);
    const width = 920;
    const height = 315;
    const inset = { left: 62, right: 62, top: 24, bottom: 43 };
    const chartWidth = width - inset.left - inset.right;
    const chartHeight = height - inset.top - inset.bottom;
    const maxKilos = Math.max(1, ...report.periods.map((row) => row.kilos));
    const maxRatio = Math.max(120, ...report.periods.map((row) => row.ytdVsPreviousYear ?? 0));
    const step = chartWidth / Math.max(1, report.periods.length);
    const x = (index: number) => inset.left + step * index + step / 2;
    const yKilos = (value: number) => inset.top + chartHeight - value / maxKilos * chartHeight;
    const yRatio = (value: number) => inset.top + chartHeight - value / maxRatio * chartHeight;
    const linePoints = report.periods.map((row, index) => `${x(index)},${yRatio(row.ytdVsPreviousYear ?? 0)}`).join(" ");
    const hoveredRow = hovered == null ? null : report.periods[hovered];
    return <div className="mars-chart-stage" onMouseLeave={() => setHovered(null)}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Orbit Nutrition volume by period with cumulative previous-year comparison">
      {[0, .25, .5, .75, 1].map((ratioValue) => <g key={ratioValue}><line x1={inset.left} x2={width - inset.right} y1={yKilos(maxKilos * ratioValue)} y2={yKilos(maxKilos * ratioValue)} className="mars-grid-line"/>{ratioValue > 0 && <text x={inset.left - 10} y={yKilos(maxKilos * ratioValue) + 4} textAnchor="end">{kilos(maxKilos * ratioValue, true)}</text>}</g>)}
      {[0, 50, 100].map((ratioValue) => <text key={ratioValue} x={width - inset.right + 10} y={yRatio(ratioValue) + 4}>{ratioValue}%</text>)}
      {report.periods.map((row, index) => {
            const barWidth = Math.min(47, step * .58);
            const barHeight = Math.max(1, inset.top + chartHeight - yKilos(row.kilos));
            return <g key={row.label} className="mars-chart-hit" tabIndex={0} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} aria-label={`${row.label}: ${exactKilos(row.kilos)} kilos`}>
          <rect x={x(index) - step / 2} y={inset.top} width={step} height={chartHeight} fill="transparent"/>
          <rect x={x(index) - barWidth / 2} y={yKilos(row.kilos)} width={barWidth} height={barHeight} rx="5" className={row.isPartial ? "mars-volume-bar partial" : "mars-volume-bar"}/>
          <text x={x(index)} y={height - 14} textAnchor="middle">{row.label}</text>
        </g>;
        })}
      <polyline points={linePoints} className="mars-ratio-line"/>
      {report.periods.map((row, index) => <circle key={row.label} cx={x(index)} cy={yRatio(row.ytdVsPreviousYear ?? 0)} r={hovered === index ? 5 : 3.8} className="mars-ratio-dot"/>)}
      {hovered != null && <line x1={x(hovered)} x2={x(hovered)} y1={inset.top} y2={inset.top + chartHeight} className="mars-hover-line"/>}
    </svg>
    {hoveredRow && hovered != null && <aside className={`mars-chart-tooltip ${hovered < 2 ? "align-start" : hovered > report.periods.length - 3 ? "align-end" : ""}`} style={{ left: `${x(hovered) / width * 100}%` }}>
      <strong>{hoveredRow.label} · {dateLabel(hoveredRow.start)}–{dateLabel(hoveredRow.end)}{hoveredRow.isPartial ? " \u00B7 partial" : ""}</strong>
      <span><i className="volume"/><div><small>Volume</small><b>{exactKilos(hoveredRow.kilos)} kg</b></div></span>
      <span><i className="ratio"/><div><small>YTD vs previous year</small><b>{percent(hoveredRow.ytdVsPreviousYear)}</b></div></span>
      <div className="mars-tooltip-grid"><span>{number(hoveredRow.clients)} {report.filters.clientMode === "branch" ? "branches" : "accounts"}</span><span>{percent(hoveredRow.vsPreviousYear)} vs LY</span><span>{percent(hoveredRow.vsPreviousPeriod)} vs period previous</span></div>
    </aside>}
  </div>;
}
function ClientChart({ report }: {
    report: MarsReportPayload;
}) {
    const [hovered, setHovered] = useState<number | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [width, setWidth] = useState(500);
    const height = 315;
    const inset = { left: 48, right: 18, top: 22, bottom: 38 };
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
    const max = Math.max(1, ...report.periods.map((row) => row.clients));
    const chartWidth = width - inset.left - inset.right;
    const chartHeight = height - inset.top - inset.bottom;
    const step = chartWidth / Math.max(1, report.periods.length - 1);
    const x = (index: number) => inset.left + (report.periods.length === 1 ? chartWidth / 2 : step * index);
    const y = (value: number) => inset.top + chartHeight - value / max * chartHeight;
    const points = report.periods.map((row, index) => `${x(index)},${y(row.clients)}`).join(" ");
    const hoveredRow = hovered == null ? null : report.periods[hovered];
    return <div className="mars-client-chart" onMouseLeave={() => setHovered(null)}>
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Orbit Nutrition customers by period">
      {[0, .5, 1].map((ratioValue) => <g key={ratioValue}><line x1={inset.left} x2={width - inset.right} y1={y(max * ratioValue)} y2={y(max * ratioValue)} className="mars-grid-line"/>{ratioValue > 0 && <text x={inset.left - 8} y={y(max * ratioValue) + 4} textAnchor="end">{Math.round(max * ratioValue)}</text>}</g>)}
      <polyline points={points} className="mars-client-line"/>
      {report.periods.map((row, index) => <g key={row.label} className="mars-chart-hit" tabIndex={0} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)}><circle cx={x(index)} cy={y(row.clients)} r={hovered === index ? 6 : 4.5} className={row.isPartial ? "mars-client-dot partial" : "mars-client-dot"}/><text x={x(index)} y={height - 12} textAnchor="middle">{row.label}</text></g>)}
      {hovered != null && <line x1={x(hovered)} x2={x(hovered)} y1={inset.top} y2={inset.top + chartHeight} className="mars-hover-line"/>}
    </svg>
    {hoveredRow && hovered != null && <aside className={`mars-client-tooltip ${hovered < 2 ? "align-start" : hovered > report.periods.length - 3 ? "align-end" : ""}`} style={{ left: `${x(hovered) / width * 100}%` }}><strong>{hoveredRow.label}</strong><b>{number(hoveredRow.clients)}</b><span>{report.filters.clientMode === "branch" ? "customer branches" : "unique accounts"}</span><small>{number(hoveredRow.accounts)} accounts · {number(hoveredRow.clientBranches)} branches</small></aside>}
  </div>;
}
function QuarterChart({ report }: {
    report: MarsReportPayload;
}) {
    const max = Math.max(1, ...report.quarters.flatMap((row) => [row.kilos, row.previousYearKilos]));
    return <div className="mars-quarter-grid">{report.quarters.map((row) => <article key={row.quarter}><div><span className="current" style={{ height: `${row.kilos / max * 100}%` }}><i>{kilos(row.kilos, true)}</i></span><span className="previous" style={{ height: `${row.previousYearKilos / max * 100}%` }}><i>{kilos(row.previousYearKilos, true)}</i></span></div><h3>{row.quarter}</h3><p>{percent(variation(row.kilos, row.previousYearKilos), true)}</p></article>)}</div>;
}
function BrandTable({ rows, onOpenBrand }: {
    rows: MarsBrandRow[];
    onOpenBrand: (brand: string) => void;
}) {
    type SortKey = "brand" | "kilos" | "clients" | "share" | "previousYearKilos" | "variation";
    const [sort, setSort] = useState(emptySort<SortKey>());
    const sorted = sortItems(rows, sort, (row, key) => row[key]);
    const direction = (key: SortKey) => sort.key === key ? sort.direction : null;
    const changeSort = (key: SortKey) => setSort((current) => cycleSort(current, key));
    return <div className="mars-brand-table"><header><SortButton label="Brand" direction={direction("brand")} onClick={() => changeSort("brand")}/><SortButton label="Kilos" direction={direction("kilos")} onClick={() => changeSort("kilos")}/><SortButton label="Customers" direction={direction("clients")} onClick={() => changeSort("clients")}/><SortButton label="Share" direction={direction("share")} onClick={() => changeSort("share")}/><SortButton label="Year previous comparable" direction={direction("previousYearKilos")} onClick={() => changeSort("previousYearKilos")}/><SortButton label="Change" direction={direction("variation")} onClick={() => changeSort("variation")}/></header>{sorted.map((row) => <article key={row.brand}><button className="entity-link" onClick={() => onOpenBrand(row.brand)}>{row.brand}</button><span>{exactKilos(row.kilos)} kg</span><span>{number(row.clients)}</span><span>{percent(row.share)}</span><span>{exactKilos(row.previousYearKilos)} kg</span><span className={row.variation != null && row.variation >= 0 ? "positive" : "negative"}>{percent(row.variation, true)}</span></article>)}</div>;
}
function PeriodTable({ rows, mode }: {
    rows: MarsPeriodPoint[];
    mode: MarsFilters["clientMode"];
}) {
    type SortKey = "period" | "kilos" | "clients" | "previousYearKilos" | "vsPreviousYear" | "ytdKilos" | "ytdVsPreviousYear";
    const [sort, setSort] = useState(emptySort<SortKey>());
    const sorted = sortItems(rows, sort, (row, key) => row[key]);
    const direction = (key: SortKey) => sort.key === key ? sort.direction : null;
    const changeSort = (key: SortKey) => setSort((current) => cycleSort(current, key));
    return <div className="mars-period-table"><header><SortButton label="Period" direction={direction("period")} onClick={() => changeSort("period")}/><SortButton label="Kilos" direction={direction("kilos")} onClick={() => changeSort("kilos")}/><SortButton label={mode === "branch" ? "Branches" : "Accounts"} direction={direction("clients")} onClick={() => changeSort("clients")}/><SortButton label="LY comparable" direction={direction("previousYearKilos")} onClick={() => changeSort("previousYearKilos")}/><SortButton label="Vs LY" direction={direction("vsPreviousYear")} onClick={() => changeSort("vsPreviousYear")}/><SortButton label="YTD" direction={direction("ytdKilos")} onClick={() => changeSort("ytdKilos")}/><SortButton label="YTD vs LY" direction={direction("ytdVsPreviousYear")} onClick={() => changeSort("ytdVsPreviousYear")}/></header>{sorted.map((row) => <article key={row.label}><strong>{row.label}<small>{dateLabel(row.start)}–{dateLabel(row.end)}{row.isPartial ? " \u00B7 partial" : ""}</small></strong><span>{exactKilos(row.kilos)}</span><span>{number(row.clients)}</span><span>{exactKilos(row.previousYearKilos)}</span><span>{percent(row.vsPreviousYear)}</span><span>{exactKilos(row.ytdKilos)}</span><span>{percent(row.ytdVsPreviousYear)}</span></article>)}</div>;
}
export function MarsReportView({ onOpenBrand }: {
    onOpenBrand: (brand: string) => void;
}) {
    const [meta, setMeta] = useState<MarsReportMeta | null>(null);
    const [filters, setFilters] = useState<MarsFilters>(EMPTY_FILTERS);
    const [report, setReport] = useState<MarsReportPayload | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        fetch("/api/reports/mars/meta").then(async (response) => {
            const payload = await response.json();
            if (!response.ok)
                throw new Error(payload.error || "Orbit Nutrition report metadata could not be opened");
            return payload as MarsReportMeta;
        }).then((payload) => {
            setMeta(payload);
            setFilters({ ...EMPTY_FILTERS, year: payload.latestYear, period: payload.latestPeriod });
        }).catch((cause: Error) => { setError(cause.message); setLoading(false); });
    }, []);
    useEffect(() => {
        if (!meta || !filters.year || !filters.period)
            return;
        const controller = new AbortController();
        const parameters = new URLSearchParams();
        for (const [key, value] of Object.entries(filters))
            if (value)
                parameters.set(key, value);
        setLoading(true);
        setError("");
        fetch(`/api/reports/mars?${parameters}`, { signal: controller.signal }).then(async (response) => {
            const payload = await response.json();
            if (!response.ok)
                throw new Error(payload.error || "The Orbit Nutrition report could not be calculated");
            return payload as MarsReportPayload;
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
        keyof MarsFilters,
        string
    ][]).filter(([key, value]) => !["year", "period", "clientMode"].includes(key) && value).length, [filters]);
    const update = (key: keyof MarsFilters, value: string) => setFilters((current) => {
        if (key === "year" && meta)
            return { ...current, year: value, period: meta.periods[value]?.at(-1)?.label ?? current.period };
        return { ...current, [key]: value };
    });
    if (!meta && loading)
        return <div className="page-view mars-page"><div className="spt-loading"><RefreshCw className="spin" size={24}/><strong>Preparing Orbit Nutrition</strong><span>Reconstructing supplier periods from the local synthetic dataset…</span></div></div>;
    if (!meta || (!report && error))
        return <div className="page-view mars-page"><div className="spt-loading error"><Database size={24}/><strong>Could not open Orbit Nutrition</strong><span>{error}</span></div></div>;
    if (!report)
        return <div className="page-view mars-page"><div className="spt-loading"><RefreshCw className="spin" size={24}/><strong>Calculating Orbit Nutrition periods</strong></div></div>;
    const clientTerm = report.filters.clientMode === "branch" ? "customer branches" : "unique accounts";
    const priorPeriod = report.selected.period === 1 ? "P13 of the previous year" : `P${String(report.selected.period - 1).padStart(2, "0")}`;
    const currentVsPrevious = variation(report.current.kilos, report.previousPeriod.kilos);
    const currentVsYear = variation(report.current.kilos, report.previousYear.kilos);
    const ytdClientVariation = variation(report.ytd.clients, report.previousYtd.clients);
    const filterKeys: MarsFilterKey[] = ["branch", "clientType", "channelGroup", "brand", "subcategoryGroup"];
    const reset = () => setFilters({ ...EMPTY_FILTERS, year: meta.latestYear, period: meta.latestPeriod, clientMode: filters.clientMode });
    const applySaved = (saved: Record<string, string>) => setFilters({
        year: saved.year || meta.latestYear, period: saved.period || meta.latestPeriod,
        clientMode: saved.clientMode === "account" ? "account" : "branch", branch: saved.branch || "",
        clientType: saved.clientType || "", channelGroup: saved.channelGroup || "", brand: saved.brand || "", subcategoryGroup: saved.subcategoryGroup || "",
    });
    return <div className="page-view mars-page">
    <section className="data-card mars-filter-card" data-tour="mars-overview">
      <div className="mars-filter-copy"><span className="section-kicker"><PawPrint size={14}/> Orbit Nutrition</span><h2>Supplier performance · {report.filters.year} {report.filters.period}</h2><p>Four-week supplier periods calculated from local synthetic invoices and credit notes.</p><div className="mars-mode-tabs" role="group" aria-label="Customer counting method"><button className={filters.clientMode === "branch" ? "active" : ""} onClick={() => update("clientMode", "branch")}><Store size={14}/> By branch</button><button className={filters.clientMode === "account" ? "active" : ""} onClick={() => update("clientMode", "account")}><Building2 size={14}/> By account</button></div></div>
      <div className="mars-filter-controls"><SingleSelectFilter label="Orbit year" value={filters.year} options={meta.years} onChange={(value) => update("year", value)}/><SingleSelectFilter label="Orbit period" value={filters.period} options={(meta.periods[filters.year] ?? []).map((period) => period.label)} onChange={(value) => update("period", value)}/><SelectFilter label={FILTER_LABELS.branch} value={filters.branch} options={meta.options.branch} onChange={(value) => update("branch", value)}/><button className={`button secondary mars-more-button ${activeFilterCount ? "active" : ""}`} onClick={() => setExpanded((value) => !value)}><Filter size={14}/> More filters {activeFilterCount ? `(${activeFilterCount})` : ""}<ChevronDown size={13}/></button></div>
      {expanded && <div className="mars-filter-expanded">{filterKeys.filter((key) => key !== "branch").map((key) => <SelectFilter key={key} label={FILTER_LABELS[key]} value={filters[key]} options={meta.options[key]} onChange={(value) => update(key, value)}/>)}<button className="button secondary" disabled={!activeFilterCount} onClick={reset}><X size={14}/> Reset</button></div>}
      <SavedViewsBar viewKey="mars" filters={{ ...filters }} onApply={applySaved}/>
      {loading && <div className="mars-filter-loading"><RefreshCw className="spin" size={13}/> Recalculating</div>}
    </section>

    <section className={`mars-period-note ${report.isPartial ? "partial" : ""}`}><CalendarRange size={17}/><div><strong>{report.selected.label} · {dateLabel(report.selected.start)} to {dateLabel(report.isPartial ? report.sourceMaxDate : report.selected.end)}</strong><span>{report.isPartial ? `Period in progress: ${report.elapsedDays} of ${report.selected.days} days. The comparisons YTD and by brand use the same number of days of the previous year.` : `Complete period: ${report.selected.days} days.`}</span></div></section>

    <div className="mars-kpis">
      <article><span className="mars-kpi-icon green"><Scale size={20}/></span><div><small>Total kilos</small><strong>{kilos(report.current.kilos)} kg</strong><em>{report.isPartial ? "partial cutoff" : "period complete"}</em></div></article>
      <article><span className={`mars-kpi-icon ${currentVsPrevious != null && currentVsPrevious >= 0 ? "green" : "blue"}`}>{currentVsPrevious != null && currentVsPrevious >= 0 ? <TrendingUp size={20}/> : <TrendingDown size={20}/>}</span><div><small>{priorPeriod}</small><strong>{kilos(report.previousPeriod.kilos)} kg</strong><em>{percent(currentVsPrevious, true)} vs period selected</em></div></article>
      <article><span className={`mars-kpi-icon ${currentVsYear != null && currentVsYear >= 0 ? "green" : "blue"}`}><BarChart3 size={20}/></span><div><small>Same period {report.selected.year - 1}</small><strong>{kilos(report.previousYear.kilos)} kg</strong><em>{report.isPartial ? "complete-period baseline" : `${percent(currentVsYear, true)} year-over-year`}</em></div></article>
      <article><span className="mars-kpi-icon navy"><Users size={20}/></span><div><small>{clientTerm}</small><strong>{number(report.current.clients)}</strong><em>{number(report.current.accounts)} accounts · {number(report.current.clientBranches)} branches</em></div></article>
      <article><span className="mars-kpi-icon green"><CalendarRange size={20}/></span><div><small>{clientTerm} YTD</small><strong>{number(report.ytd.clients)}</strong><em>P01–{report.selected.label}</em></div></article>
      <article><span className={`mars-kpi-icon ${ytdClientVariation != null && ytdClientVariation >= 0 ? "green" : "blue"}`}><Users size={20}/></span><div><small>Previous-year YTD</small><strong>{number(report.previousYtd.clients)}</strong><em>{percent(ytdClientVariation, true)} · cutoff equivalent</em></div></article>
    </div>

    <div className="mars-main-grid"><section className="data-card mars-volume-card"><div className="data-card-header"><div><span className="section-kicker"><TrendingUp size={14}/> Trend</span><h2>Volume by period and cumulative YTD</h2><p>Bars show kilos; the line compares cumulative YTD with the same previous-year cutoff.</p></div><div className="mars-legend"><span><i className="volume"/>Volume</span><span><i className="ratio"/>YTD vs LY</span><span><i className="partial"/>Partial period</span></div></div><VolumeChart report={report}/></section><section className="data-card mars-client-card"><div className="data-card-header"><div><span className="section-kicker"><Users size={14}/> Coverage</span><h2>Customers by period</h2><p>{filters.clientMode === "branch" ? "An account may include more than one delivery branch." : "Each customer ID is counted once."}</p></div></div><ClientChart report={report}/></section></div>

    <div className="mars-secondary-grid"><section className="data-card mars-quarter-card"><div className="data-card-header"><div><span className="section-kicker"><CalendarRange size={14}/> Orbit quarter</span><h2>Cumulative volume by quarter</h2><p>Current versus the comparable previous year.</p></div><div className="mars-legend"><span><i className="volume"/>{report.selected.year}</span><span><i className="prior"/>{report.selected.year - 1}</span></div></div><QuarterChart report={report}/></section><section className="data-card mars-brand-card"><div className="data-card-header"><div><span className="section-kicker"><PawPrint size={14}/> Brands</span><h2>Selected-period mix</h2><p>Comparison with the same number of days in the previous year.</p></div><span className="count-badge">{number(report.brands.length)} brands</span></div><BrandTable rows={report.brands} onOpenBrand={onOpenBrand}/></section></div>

    <section className="data-card mars-period-card"><div className="data-card-header"><div><span className="section-kicker"><Database size={14}/> Auditable detail</span><h2>Orbit periods {report.selected.year}</h2><p>Select a header to cycle through ascending, descending, and original order.</p></div></div><PeriodTable rows={report.periods} mode={filters.clientMode}/></section>

    <section className="mars-source-note"><Database size={16}/><div><strong>{meta.sourceSystem}</strong><span>{number(meta.rowCount)} fictional supplier movements · coverage {meta.coverageFrom} to {meta.maxDate}. All customer types, accounts, products, and document details are synthetic.</span></div></section>
  </div>;
}
