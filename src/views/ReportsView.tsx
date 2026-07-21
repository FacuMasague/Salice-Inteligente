import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarRange, CheckCircle2, ChevronRight, Database, Gauge, Info, PackageCheck, Target, TrendingUp, Users } from "lucide-react";
import type { Client, DashboardData, GeneralPerformanceRow, GeneralReportMeta, GeneralReportMode, GeneralReportPayload } from "../../shared/models";
import { matchesMultiFilter } from "../../shared/multi-filter";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { SavedViewsBar } from "../components/SavedViewsBar";
import { SingleSelectFilter } from "../components/SingleSelectFilter";
import { SortButton } from "../components/SortButton";
import { clientPrimaryName, clientSecondaryName } from "../lib/client-name";
import { money, number } from "../lib/format";
import { cycleSort, emptySort, sortItems } from "../lib/sorting";
interface ReportsViewProps {
    data: DashboardData;
    onOpen: (client: Client) => void;
    onOpenSeller: (seller: string) => void;
    onOpenBrand: (brand: string) => void;
}
type PerformanceSortKey = "name" | "actual" | "target" | "completion" | "gap";
const modes: {
    id: GeneralReportMode;
    label: string;
    note: string;
}[] = [
    { id: "core", label: "Kilos goals", note: "Brands and categories top" },
    { id: "strategic", label: "Strategic brands", note: "Fawna, Juvenia, MaxPet and Pampa" },
    { id: "autoservice", label: "Small retail", note: "Revenue of Ana and Julieta" },
];
const monthLabel = (value: string, long = false) => new Intl.DateTimeFormat("en-GB", {
    month: long ? "long" : "short", year: "2-digit", timeZone: "UTC",
}).format(new Date(`${value}-01T12:00:00Z`)).replace(".", "");
const percent = (value: number | null, digits = 0) => value == null
    ? "No goal" : `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: digits }).format(value)}%`;
function metric(value: number, unit: GeneralReportPayload["unit"], compact = false) {
    if (unit === "currency")
        return money(value, compact);
    if (compact && Math.abs(value) >= 1000000)
        return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value / 1000000)} M kg`;
    if (compact && Math.abs(value) >= 1000)
        return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value / 1000)} k kg`;
    return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value)} kg`;
}
function change(value: number, baseline: number) {
    if (!baseline)
        return null;
    return (value / baseline - 1) * 100;
}
function TrendChart({ report }: {
    report: GeneralReportPayload;
}) {
    const [hovered, setHovered] = useState<number | null>(null);
    const width = 980;
    const height = 330;
    const inset = { left: 54, right: 24, top: 24, bottom: 46 };
    const plotWidth = width - inset.left - inset.right;
    const plotHeight = height - inset.top - inset.bottom;
    const max = Math.max(...report.trend.flatMap((point) => [point.actual, point.target]), 1) * 1.12;
    const step = plotWidth / report.trend.length;
    const barWidth = Math.min(42, step * .54);
    const x = (index: number) => inset.left + step * index + step / 2;
    const y = (value: number) => inset.top + plotHeight - value / max * plotHeight;
    const targetLine = report.trend.map((point, index) => `${x(index)},${y(point.target)}`).join(" ");
    const active = hovered == null ? null : report.trend[hovered];
    return <div className="general-trend-stage" onMouseLeave={() => setHovered(null)}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly trend of actual results and goals">
      {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}>
        <line x1={inset.left} x2={width - inset.right} y1={inset.top + plotHeight * (1 - ratio)} y2={inset.top + plotHeight * (1 - ratio)} className="general-chart-grid"/>
        <text x={inset.left - 10} y={inset.top + plotHeight * (1 - ratio) + 4} textAnchor="end" className="general-axis-label">{metric(max * ratio, report.unit, true)}</text>
      </g>)}
      {report.trend.map((point, index) => <g key={point.month} tabIndex={0} aria-label={`${monthLabel(point.month, true)}. Actual ${metric(point.actual, report.unit)}. Goal ${metric(point.target, report.unit)}.`} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} onMouseEnter={() => setHovered(index)}>
        <rect x={x(index) - step / 2} y={inset.top} width={step} height={plotHeight} className={`general-chart-hit ${hovered === index ? "active" : ""}`}/>
        <rect x={x(index) - barWidth / 2} y={y(point.actual)} width={barWidth} height={Math.max(1, inset.top + plotHeight - y(point.actual))} rx="5" className={point.isPartial ? "general-chart-bar partial" : "general-chart-bar"}/>
        <text x={x(index)} y={height - 15} textAnchor="middle" className="general-month-label">{monthLabel(point.month)}</text>
      </g>)}
      <polyline points={targetLine} className="general-target-line"/>
      {report.trend.map((point, index) => <circle key={point.month} cx={x(index)} cy={y(point.target)} r={hovered === index ? 5.5 : 3.5} className="general-target-dot"/>)}
    </svg>
    {active && hovered != null && <aside className="general-chart-tooltip" style={{ left: `${Math.min(84, Math.max(8, x(hovered) / width * 100))}%` }}>
      <strong>{monthLabel(active.month, true)}{active.isPartial ? " \u00B7 partial" : ""}</strong>
      <span><i className="current"/>Actual <b>{metric(active.actual, report.unit)}</b></span>
      <span><i className="target"/>Goal <b>{metric(active.target, report.unit)}</b></span>
      <small>Attainment {percent(active.completion, 1)}</small>
    </aside>}
  </div>;
}
function PerformanceTable({ title, subtitle, rows, unit, onOpenName }: {
    title: string;
    subtitle: string;
    rows: GeneralPerformanceRow[];
    unit: GeneralReportPayload["unit"];
    onOpenName?: (name: string) => void;
}) {
    const [sort, setSort] = useState(emptySort<PerformanceSortKey>());
    const sorted = useMemo(() => sortItems(rows, sort, (row, key) => row[key]), [rows, sort]);
    const direction = (key: PerformanceSortKey) => sort.key === key ? sort.direction : null;
    return <section className="data-card general-table-card">
    <div className="data-card-header"><div><span className="section-kicker"><Users size={14}/> Breakdown</span><h2>{title}</h2><p>{subtitle}</p></div><span className="count-badge">{rows.length} rows</span></div>
    <div className="general-performance-table">
      <header><SortButton label="Name" direction={direction("name")} onClick={() => setSort((state) => cycleSort(state, "name"))}/><SortButton label="Actual" direction={direction("actual")} onClick={() => setSort((state) => cycleSort(state, "actual"))}/><SortButton label="Goal" direction={direction("target")} onClick={() => setSort((state) => cycleSort(state, "target"))}/><SortButton label="Attainment" direction={direction("completion")} onClick={() => setSort((state) => cycleSort(state, "completion"))}/><SortButton label="Difference" direction={direction("gap")} onClick={() => setSort((state) => cycleSort(state, "gap"))}/></header>
      {sorted.map((row) => <article key={row.name}>{onOpenName ? <button className="entity-link general-name-link" onClick={() => onOpenName(row.name)}>{row.name}<ChevronRight size={13}/></button> : <strong>{row.name}</strong>}<span>{metric(row.actual, unit)}</span><span>{row.target ? metric(row.target, unit) : "\u2014"}</span><span className={`general-completion ${row.completion != null && row.completion >= 100 ? "achieved" : ""}`}>{percent(row.completion, 1)}</span><span className={row.gap < 0 ? "pending" : "achieved-text"}>{row.target ? `${row.gap > 0 ? "+" : ""}${metric(row.gap, unit)}` : "\u2014"}</span></article>)}
      {!rows.length && <p className="report-empty">No data for this selection.</p>}
    </div>
  </section>;
}
export function ReportsView({ data, onOpen, onOpenSeller, onOpenBrand }: ReportsViewProps) {
    const [meta, setMeta] = useState<GeneralReportMeta | null>(null);
    const [report, setReport] = useState<GeneralReportPayload | null>(null);
    const [mode, setMode] = useState<GeneralReportMode>("core");
    const [month, setMonth] = useState("");
    const [seller, setSeller] = useState("");
    const [category, setCategory] = useState("");
    const [brand, setBrand] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        fetch("/api/reports/general/meta").then((response) => {
            if (!response.ok)
                throw new Error("The General Report source could not be opened.");
            return response.json();
        }).then((payload: GeneralReportMeta) => { setMeta(payload); setMonth(payload.latestMonth); }).catch((cause: Error) => { setError(cause.message); setLoading(false); });
    }, []);
    useEffect(() => {
        if (!meta || !month)
            return;
        const controller = new AbortController();
        const query = new URLSearchParams({ mode, month });
        if (seller)
            query.set("seller", seller);
        if (category && mode === "core")
            query.set("category", category);
        if (brand && mode !== "autoservice")
            query.set("brand", brand);
        setLoading(true);
        setError("");
        fetch(`/api/reports/general?${query}`, { signal: controller.signal }).then((response) => {
            if (!response.ok)
                throw new Error("The General Report could not be calculated.");
            return response.json();
        }).then((payload: GeneralReportPayload) => { setReport(payload); setLoading(false); }).catch((cause: Error) => {
            if (cause.name !== "AbortError") {
                setError(cause.message);
                setLoading(false);
            }
        });
        return () => controller.abort();
    }, [meta, mode, month, seller, category, brand]);
    const changeMode = (next: GeneralReportMode) => { setMode(next); setSeller(""); setCategory(""); setBrand(""); };
    const sellerOptions = mode === "autoservice" ? meta?.universe.autoserviceSellers ?? [] : meta?.options.sellers ?? [];
    const actualChangeMonth = report ? change(report.actual, report.previousMonthActual) : null;
    const actualChangeYear = report ? change(report.actual, report.previousYearActual) : null;
    const pulseClients = useMemo(() => data.clients.filter((client) => client.active && matchesMultiFilter(client.seller, seller)), [data.clients, seller]);
    const pulseSales = pulseClients.reduce((sum, client) => sum + client.sales90d, 0);
    const pulseOverdue = pulseClients.reduce((sum, client) => sum + client.overdueOutstanding, 0);
    const priority = [...pulseClients].sort((left, right) => right.visitPriority - left.visitPriority)[0];
    const breakdown = report?.brands.length ? report.brands : report?.categories ?? [];
    const savedFilters = { mode, month, seller, category, brand };
    const applySaved = (saved: Record<string, string>) => {
        setMode(modes.some((item) => item.id === saved.mode) ? saved.mode as GeneralReportMode : "core");
        setMonth(saved.month || meta?.latestMonth || "");
        setSeller(saved.seller || "");
        setCategory(saved.category || "");
        setBrand(saved.brand || "");
    };
    if (error && !report)
        return <div className="page-view"><section className="data-card report-error"><Info size={22}/><div><h2>General Report unavailable</h2><p>{error}</p></div></section></div>;
    if (!meta || !report)
        return <div className="page-view"><section className="data-card report-loading"><span /><h2>Preparing the General Report…</h2><p>Calculating results and goals from the reconciled sources.</p></section></div>;
    return <div className={`page-view general-report-page ${loading ? "is-loading" : ""}`}>
    <section className="data-card general-filter-card" data-tour="reports-overview">
      <div className="general-filter-heading"><span className="section-kicker"><Gauge size={14}/> Commercial plan</span><h2>Actual performance against the monthly plan</h2><p>Sales and goals come from separate local synthetic tables.</p></div>
      <div className="general-mode-switch">{modes.map((item) => <button key={item.id} className={mode === item.id ? "active" : ""} onClick={() => changeMode(item.id)}><strong>{item.label}</strong><small>{item.note}</small></button>)}</div>
      <div className="general-filters">
        <SingleSelectFilter label="Month" value={month} options={meta.months.map((item) => ({ value: item, label: monthLabel(item, true) }))} onChange={setMonth}/>
        <MultiSelectFilter label="Seller" value={seller} options={sellerOptions} onChange={setSeller}/>
        {mode === "core" && <MultiSelectFilter label="Category" value={category} options={meta.options.coreCategories} onChange={setCategory}/>}
        {mode !== "autoservice" && <MultiSelectFilter label="Brand" value={brand} options={mode === "strategic" ? meta.options.strategicBrands : meta.options.coreBrands} onChange={setBrand}/>}
      </div>
      <SavedViewsBar viewKey="reports" filters={savedFilters} onApply={applySaved}/>
    </section>

    <div className="general-kpis">
      <article><span className="general-kpi-icon green"><BarChart3 size={20}/></span><div><small>Actual result</small><strong>{metric(report.actual, report.unit, true)}</strong><em>Through {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(`${report.periodEnd}T12:00:00`))}</em></div></article>
      <article><span className="general-kpi-icon blue"><Target size={20}/></span><div><small>Monthly goal</small><strong>{metric(report.target, report.unit, true)}</strong><em>{monthLabel(report.selectedMonth, true)}</em></div></article>
      <article><span className="general-kpi-icon ochre"><Gauge size={20}/></span><div><small>Attainment</small><strong>{percent(report.completion, 1)}</strong><em>{report.target ? `${metric(Math.abs(report.gap), report.unit, true)} ${report.gap >= 0 ? "above target" : "pending"}` : "No goal loaded"}</em></div></article>
      <article><span className="general-kpi-icon green"><TrendingUp size={20}/></span><div><small>Linear projection</small><strong>{report.projection == null ? "Month closed" : metric(report.projection, report.unit, true)}</strong><em>{report.projectedCompletion == null ? `${report.daysInMonth} days complete` : `${percent(report.projectedCompletion, 1)} of the goal`}</em></div></article>
      <article><span className="general-kpi-icon blue"><Users size={20}/></span><div><small>Buying customers</small><strong>{number(report.clients)}</strong><em>{number(report.units)} units</em></div></article>
    </div>

    <div className="general-primary-grid">
      <section className="data-card general-goal-card">
        <div className="data-card-header"><div><span className="section-kicker"><Target size={14}/> Goal of the period</span><h2>{modes.find((item) => item.id === mode)?.label}</h2><p>{report.isPartial ? `${report.elapsedDays} of ${report.daysInMonth} days elapsed` : "Period complete"}</p></div><span className="general-goal-value">{metric(report.actual, report.unit)} / {metric(report.target, report.unit)}</span></div>
        <div className="general-goal-body">
          <div className="general-goal-track"><i style={{ width: `${Math.min(100, report.completion ?? 0)}%` }}/><b style={{ left: `${Math.min(100, report.elapsedDays / report.daysInMonth * 100)}%` }} title="Monthly progress calendar"/></div>
          <div className="general-goal-labels"><span>{metric(0, report.unit)}</span><span>Goal through day {metric(report.target * report.elapsedDays / report.daysInMonth, report.unit)}</span><span>{metric(report.target, report.unit)}</span></div>
          <div className="general-comparisons"><article><span>Versus previous month, same cutoff</span><strong className={actualChangeMonth != null && actualChangeMonth < 0 ? "pending" : ""}>{actualChangeMonth == null ? "No baseline" : `${actualChangeMonth >= 0 ? "+" : ""}${percent(actualChangeMonth, 1)}`}</strong><small>{metric(report.previousMonthActual, report.unit)} baseline</small></article><article><span>Versus previous year, same cutoff</span><strong className={actualChangeYear != null && actualChangeYear < 0 ? "pending" : ""}>{actualChangeYear == null ? "No baseline" : `${actualChangeYear >= 0 ? "+" : ""}${percent(actualChangeYear, 1)}`}</strong><small>{metric(report.previousYearActual, report.unit)} baseline</small></article></div>
        </div>
      </section>

      <section className="data-card general-pulse-card">
        <div className="data-card-header"><div><span className="section-kicker"><PackageCheck size={14}/> Operational context</span><h2>Portfolio pulse</h2><p>Complementary signals that do not alter the goal metric.</p></div></div>
        <div className="general-pulse-list"><article><span>Sales · last 90 days</span><strong>{money(pulseSales, true)}</strong></article><article><span>Current overdue balance</span><strong>{money(pulseOverdue, true)}</strong></article><article><span>Active customers</span><strong>{number(pulseClients.length)}</strong></article>{priority && <button onClick={() => onOpen(priority)}><span>Highest commercial priority</span><strong>{clientPrimaryName(priority)}</strong><small>{clientSecondaryName(priority) ? `${clientSecondaryName(priority)} \u00B7 ` : ""}P{priority.visitPriority} · {priority.seller}</small></button>}</div>
      </section>
    </div>

    <section className="data-card general-trend-card">
      <div className="data-card-header"><div><span className="section-kicker"><CalendarRange size={14}/> Trend</span><h2>Actual vs goal · 13 months</h2><p>The bars show actual results and the line shows the plan. Hover over any month to see exact values.</p></div><div className="general-chart-legend"><span><i className="current"/>Actual</span><span><i className="target"/>Goal</span></div></div>
      <TrendChart report={report}/>
    </section>

    <div className="general-detail-grid">
      <PerformanceTable title="Outcome by seller" subtitle="Each column cycles through ascending, descending, and original order." rows={report.sellers} unit={report.unit} onOpenName={onOpenSeller}/>
      <PerformanceTable title={report.brands.length ? "Outcome by brand" : "Composition by category"} subtitle={report.brands.length ? "Share and goals for the selected universe." : "Actual period composition; the plan is not allocated to this level."} rows={breakdown} unit={report.unit} onOpenName={report.brands.length ? onOpenBrand : undefined}/>
    </div>

    {mode === "core" && report.categories.length > 0 && <PerformanceTable title="Outcome by category" subtitle="Wet food, balanced food, and treats use the same report rules." rows={report.categories} unit={report.unit}/>}

    <section className="general-source-note">
      <Database size={18}/><div><strong>Separate, auditable sources</strong><span><b>Actuals:</b> {meta.sourceSystem}, with coverage through {new Intl.DateTimeFormat("en-US").format(new Date(`${meta.maxDate}T12:00:00`))}. <b>Goals:</b> {meta.targetSource.label}, captured on {new Intl.DateTimeFormat("en-US").format(new Date(`${meta.targetSource.capturedAt}T12:00:00`))}. Both are deterministic local synthetic sources.</span>{meta.unavailableDocumentCount > 0 && <small><Info size={13}/> {meta.unavailableDocumentCount} source documents have no detail and remain explicitly unavailable.</small>}</div>
    </section>
  </div>;
}
