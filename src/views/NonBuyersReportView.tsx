import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, ChevronDown, ChevronRight, Database, Filter, PackageSearch, RefreshCw, Search, Store, Users, X } from "lucide-react";
import type { Client, DashboardData, NonBuyerEntityRow, NonBuyerFilterKey, NonBuyerFilters, NonBuyerReportMeta, NonBuyerReportPayload, NonBuyerSellerRow } from "../../shared/models";
import { matchesMultiFilter } from "../../shared/multi-filter";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { SavedViewsBar } from "../components/SavedViewsBar";
import { SortButton } from "../components/SortButton";
import { clientPrimaryName, clientSecondaryName } from "../lib/client-name";
import { cycleSort, emptySort, sortItems } from "../lib/sorting";
type ReportView = "accounts" | "brands";
type SortKey = "id" | "name" | "seller" | "isNonBuyer30" | "daysSinceLastPurchase" | "lastPurchaseDate" | "averageKilos3Months" | "averageSales3Months";
const EMPTY_FILTERS: NonBuyerFilters = { productGroup: "", category: "", brand: "", seller: "" };
const FILTER_LABELS: Record<NonBuyerFilterKey, string> = { productGroup: "Group of items", category: "Category", brand: "Brand", seller: "Seller" };
const number = (value: number, digits = 0) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: digits }).format(value);
const money = (value: number) => `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(value)}`;
const percent = (value: number | null) => value == null ? "No baseline" : `${number(value, 1)}%`;
const shortDate = (value: string | null) => value ? value.split("-").reverse().join("/") : "No purchase";
const defaultDetailSort = (view: ReportView) => view === "brands"
    ? { key: "daysSinceLastPurchase" as SortKey, direction: "desc" as const }
    : emptySort<SortKey>();
function SelectFilter({ label, value, options, onChange }: {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
}) {
    return <MultiSelectFilter label={label} value={value} options={options} onChange={onChange}/>;
}
function SellerBars({ rows, entityLabel }: {
    rows: NonBuyerSellerRow[];
    entityLabel: string;
}) {
    const max = Math.max(1, ...rows.map((row) => row.nonBuyers30));
    return <div className="nonbuyer-seller-bars">{rows.map((row) => <article key={row.seller} tabIndex={0} aria-label={`${row.seller}: ${row.nonBuyers30} ${entityLabel} no purchase in 30 days, ${percent(row.rate)} of its universe`}><strong>{row.seller}</strong><div><span style={{ width: `${row.nonBuyers30 / max * 100}%` }}/></div><b>{number(row.nonBuyers30)}</b><aside><strong>{row.seller}</strong><span>{number(row.nonBuyers30)} no purchase</span><small>{number(row.universe90)} in universe 90d · {percent(row.rate)}</small></aside></article>)}</div>;
}
function StatusBadge({ row }: {
    row: NonBuyerEntityRow;
}) {
    if (row.isNonBuyer30)
        return <span className="nonbuyer-status attention">No purchase 30d</span>;
    return <span className="nonbuyer-status current">Purchased in 30d</span>;
}
function RecencyBadge({ days }: {
    days: number | null;
}) {
    const className = days == null ? "unknown" : days <= 30 ? "recent" : days <= 90 ? "attention" : "stale";
    return <span className={`nonbuyer-recency ${className}`}>{days == null ? "\u2014" : number(days)}</span>;
}
function DetailTable({ rows, view, clients, onOpen, onOpenSeller, onOpenBrand }: {
    rows: NonBuyerEntityRow[];
    view: ReportView;
    clients: DashboardData["clients"];
    onOpen: (client: Client) => void;
    onOpenSeller: (seller: string) => void;
    onOpenBrand: (brand: string) => void;
}) {
    const [sort, setSort] = useState(() => defaultDetailSort(view));
    const [visibleCount, setVisibleCount] = useState(100);
    useEffect(() => { setVisibleCount(100); }, [rows, view]);
    useEffect(() => { setSort(defaultDetailSort(view)); }, [view]);
    const sorted = sortItems(rows, sort, (row, key) => row[key]);
    const direction = (key: SortKey) => sort.key === key ? sort.direction : null;
    const change = (key: SortKey) => setSort((current) => cycleSort(current, key));
    const visible = sorted.slice(0, visibleCount);
    const clientMap = new Map(clients.map((client) => [client.id, client]));
    return <><div className={`nonbuyer-table ${view === "brands" ? "brand-mode" : ""}`}><header>{view === "accounts" && <SortButton label="ID" direction={direction("id")} onClick={() => change("id")}/>}<SortButton label={view === "accounts" ? "Account" : "Brand"} direction={direction("name")} onClick={() => change("name")}/>{view === "accounts" && <SortButton label="Seller" direction={direction("seller")} onClick={() => change("seller")}/>}<SortButton label="Status" direction={direction("isNonBuyer30")} onClick={() => change("isNonBuyer30")}/><SortButton label="Days" direction={direction("daysSinceLastPurchase")} onClick={() => change("daysSinceLastPurchase")}/><SortButton label="Last purchase" direction={direction("lastPurchaseDate")} onClick={() => change("lastPurchaseDate")}/><SortButton label="Avg. kg · 3 months" direction={direction("averageKilos3Months")} onClick={() => change("averageKilos3Months")}/><SortButton label="Avg. sales · 3 months" direction={direction("averageSales3Months")} onClick={() => change("averageSales3Months")}/></header>{visible.map((row) => {
            const client = row.clientId == null ? null : clientMap.get(row.clientId);
            return <article key={row.id} className={view === "accounts" && client ? "clickable" : ""} onClick={() => {
                    if (view === "accounts" && client)
                        onOpen(client);
                }}>{view === "accounts" && <span className="nonbuyer-id">{row.clientId}</span>}{view === "brands" ? <button className="entity-link" onClick={() => onOpenBrand(row.name)}>{row.name}</button> : <strong>{client ? clientPrimaryName(client) : row.name}{client && clientSecondaryName(client) && <small className="client-trade-name">{clientSecondaryName(client)}</small>}</strong>}{view === "accounts" && <button className="entity-link" onClick={(event) => { event.stopPropagation(); onOpenSeller(row.seller); }}>{row.seller}<ChevronRight size={12}/></button>}<StatusBadge row={row}/><RecencyBadge days={row.daysSinceLastPurchase}/><span>{shortDate(row.lastPurchaseDate)}</span><span>{number(row.averageKilos3Months, 1)} kg</span><span>{money(row.averageSales3Months)}</span></article>;
        })}</div>{visible.length < sorted.length && <button className="button secondary nonbuyer-more-rows" onClick={() => setVisibleCount((count) => count + 100)}>Show 100 rows more</button>}</>;
}
export function NonBuyersReportView({ data, onOpen, onOpenSeller, onOpenBrand }: {
    data: DashboardData;
    onOpen: (client: Client) => void;
    onOpenSeller: (seller: string) => void;
    onOpenBrand: (brand: string) => void;
}) {
    const [meta, setMeta] = useState<NonBuyerReportMeta | null>(null);
    const [report, setReport] = useState<NonBuyerReportPayload | null>(null);
    const [filters, setFilters] = useState<NonBuyerFilters>(EMPTY_FILTERS);
    const [view, setView] = useState<ReportView>("accounts");
    const [statusMode, setStatusMode] = useState("");
    const [query, setQuery] = useState("");
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        fetch("/api/reports/non-buyers/meta").then(async (response) => {
            const payload = await response.json();
            if (!response.ok)
                throw new Error(payload.error || "Report metadata could not be opened");
            return payload as NonBuyerReportMeta;
        }).then(setMeta).catch((cause: Error) => { setError(cause.message); setLoading(false); });
    }, []);
    useEffect(() => {
        if (!meta)
            return;
        const controller = new AbortController();
        const parameters = new URLSearchParams();
        for (const [key, value] of Object.entries(filters))
            if (value)
                parameters.set(key, value);
        setLoading(true);
        setError("");
        fetch(`/api/reports/non-buyers?${parameters}`, { signal: controller.signal }).then(async (response) => {
            const payload = await response.json();
            if (!response.ok)
                throw new Error(payload.error || "The report could not be calculated");
            return payload as NonBuyerReportPayload;
        }).then(setReport).catch((cause: Error) => {
            if (cause.name !== "AbortError")
                setError(cause.message);
        }).finally(() => {
            if (!controller.signal.aborted)
                setLoading(false);
        });
        return () => controller.abort();
    }, [filters, meta]);
    const activeFilterCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);
    const sourceRows = view === "accounts" ? report?.accounts ?? [] : report?.brands ?? [];
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    const filteredRows = useMemo(() => sourceRows.filter((row) => {
        if (!matchesMultiFilter(row.isNonBuyer30 ? "non-buyers" : "buyers", statusMode))
            return false;
        if (!normalizedQuery)
            return true;
        return `${row.id} ${row.name} ${row.seller}`.toLocaleLowerCase("es").includes(normalizedQuery);
    }), [normalizedQuery, sourceRows, statusMode]);
    const update = (key: NonBuyerFilterKey, value: string) => setFilters((current) => ({ ...current, [key]: value }));
    const selectView = (next: ReportView) => { setView(next); setStatusMode(""); setQuery(""); };
    if (!meta && loading)
        return <div className="page-view nonbuyer-page"><div className="spt-loading"><RefreshCw className="spin" size={24}/><strong>Preparing dormant accounts</strong><span>Reconstructing 30-, 90-, and 180-day windows from local synthetic data…</span></div></div>;
    if (!meta || (!report && error))
        return <div className="page-view nonbuyer-page"><div className="spt-loading error"><Database size={24}/><strong>Could not open Dormant Accounts</strong><span>{error}</span></div></div>;
    if (!report)
        return <div className="page-view nonbuyer-page"><div className="spt-loading"><RefreshCw className="spin" size={24}/><strong>Calculating dormant accounts</strong></div></div>;
    const summary = view === "accounts" ? report.accountsSummary : report.brandsSummary;
    const sellers = view === "accounts" ? report.accountSellers : report.brandSellers;
    const entityPlural = view === "accounts" ? "accounts" : "brands";
    const savedFilters = { ...filters, view, statusMode, query };
    const applySaved = (saved: Record<string, string>) => {
        setFilters({ productGroup: saved.productGroup || "", category: saved.category || "", brand: saved.brand || "", seller: saved.seller || "" });
        setView(saved.view === "brands" ? "brands" : "accounts");
        setStatusMode(saved.statusMode || "");
        setQuery(saved.query ?? "");
    };
    return <div className="page-view nonbuyer-page">
    <section className="data-card nonbuyer-filter-card" data-tour="non-buyers-overview"><div className="nonbuyer-filter-heading"><div><span className="section-kicker"><PackageSearch size={14}/> Dormant accounts</span><h2>Commercial recovery · cutoff {shortDate(report.sourceMaxDate)}</h2><p>Finds accounts and brands with activity in 180 days but no positive net sales in the latest 30 days.</p></div><div className="nonbuyer-view-switch" role="tablist" aria-label="Report view"><button role="tab" aria-selected={view === "accounts"} className={view === "accounts" ? "active" : ""} onClick={() => selectView("accounts")}><Users size={16}/> Accounts</button><button role="tab" aria-selected={view === "brands"} className={view === "brands" ? "active" : ""} onClick={() => selectView("brands")}><Store size={16}/> Brands</button></div></div><div className="nonbuyer-filter-controls"><SelectFilter label={FILTER_LABELS.seller} value={filters.seller} options={meta.options.seller} onChange={(value) => update("seller", value)}/><SelectFilter label={FILTER_LABELS.productGroup} value={filters.productGroup} options={meta.options.productGroup} onChange={(value) => update("productGroup", value)}/><button className={`button secondary nonbuyer-more-button ${activeFilterCount ? "active" : ""}`} onClick={() => setExpanded((value) => !value)}><Filter size={14}/> More filters {activeFilterCount ? `(${activeFilterCount})` : ""}<ChevronDown size={13}/></button></div>{expanded && <div className="nonbuyer-filter-expanded"><SelectFilter label={FILTER_LABELS.category} value={filters.category} options={meta.options.category} onChange={(value) => update("category", value)}/><SelectFilter label={FILTER_LABELS.brand} value={filters.brand} options={meta.options.brand} onChange={(value) => update("brand", value)}/><label className="nonbuyer-unavailable-filter"><span>Commercial agreements</span><div>Not modeled in this synthetic demo</div></label><button className="button secondary" onClick={() => setFilters(EMPTY_FILTERS)}><X size={14}/> Reset</button></div>}<SavedViewsBar viewKey="non-buyers" filters={savedFilters} onApply={applySaved}/>{loading && <div className="nutripet-filter-loading"><RefreshCw className="spin" size={13}/> Recalculating</div>}</section>

    <section className="nonbuyer-period-note"><AlertCircle size={17}/><div><strong>Rolling windows from the synthetic snapshot</strong><span>No purchase: {shortDate(report.windows.from30)}–{shortDate(report.windows.through)} · Universe: sales positive from {shortDate(report.windows.from180)} · Averages: {shortDate(report.windows.averageFrom)}–{shortDate(report.windows.averageThrough)}.</span></div></section>

    <div className="nonbuyer-kpis"><article><span className="nonbuyer-kpi-icon ochre"><PackageSearch size={20}/></span><div><small>{view === "accounts" ? "Accounts" : "Brands"} no purchase · 30d</small><strong>{number(summary.nonBuyers30)}</strong><em>positive activity in the previous 180 days</em></div></article><article><span className="nonbuyer-kpi-icon blue"><BarChart3 size={20}/></span><div><small>% no purchase</small><strong>{percent(summary.rate)}</strong><em>from universe purchasing of 90 days</em></div></article><article><span className="nonbuyer-kpi-icon green"><Users size={20}/></span><div><small>Universe · 90d</small><strong>{number(summary.universe90)}</strong><em>{number(summary.universe180)} with purchase in 180 days</em></div></article><article><span className="nonbuyer-kpi-icon green"><Store size={20}/></span><div><small>Purchased · 30d</small><strong>{number(summary.buyers30)}</strong><em>positive net amount in the window</em></div></article></div>

    <div className="nonbuyer-main-grid"><section className="data-card nonbuyer-seller-card"><div className="data-card-header"><div><span className="section-kicker"><BarChart3 size={14}/> Owners</span><h2>{view === "accounts" ? "Accounts" : "Brands"} without a recent purchase by seller</h2><p>Hover or focus a bar to see the universe and rate.</p></div></div><SellerBars rows={sellers} entityLabel={entityPlural}/></section><section className="data-card nonbuyer-definition-card"><div className="data-card-header"><div><span className="section-kicker"><Database size={14}/> Definition</span><h2>How it is calculated</h2></div></div><ol><li><b>180-day universe</b><span>{entityPlural} with positive net sales from {shortDate(report.windows.from180)}.</span></li><li><b>No purchase in 30 days</b><span>The entity belongs to the universe but has no positive net sales from {shortDate(report.windows.from30)}.</span></li><li><b>Rate</b><span>Entities without a 30-day purchase divided by the 90-day purchasing universe.</span></li></ol><p>Credit notes reduce net sales in the same signed movement universe.</p></section></div>

    <section className="data-card nonbuyer-detail-card"><div className="data-card-header nonbuyer-detail-header"><div><span className="section-kicker"><Users size={14}/> Operational detail</span><h2>{view === "accounts" ? "Accounts in the 180-day universe" : "Brands in the 180-day universe"}</h2><p>Monthly averages from the last three complete calendar months.</p></div><span className="count-badge">{number(filteredRows.length)} of {number(sourceRows.length)}</span></div><div className="nonbuyer-table-tools"><label><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={view === "accounts" ? "Search ID, account, or seller" : "Search brands"}/></label><MultiSelectFilter label="Purchase status" value={statusMode} options={[{ value: "non-buyers", label: "No purchase 30d" }, { value: "buyers", label: "Purchased in 30d" }]} onChange={setStatusMode}/></div><DetailTable rows={filteredRows} view={view} clients={data.clients} onOpen={onOpen} onOpenSeller={onOpenSeller} onOpenBrand={onOpenBrand}/></section>

    <section className="nutripet-source-note"><Database size={16}/><div><strong>{meta.sourceSystem}</strong><span>{number(meta.rowCount)} eligible fictional movements · coverage {meta.coverageFrom} to {meta.maxDate}. Only active synthetic customers enter the dormant-account universe.</span></div></section>
  </div>;
}
