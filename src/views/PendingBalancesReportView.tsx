import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, ChevronRight, CircleDollarSign, Database, Filter, RefreshCw, Search, Store, TrendingUp, Users, WalletCards } from "lucide-react";
import type { Client, DashboardData, PendingBalanceClientRow, PendingBalanceFilters, PendingBalanceReportMeta, PendingBalanceReportPayload, PendingBalanceSellerRow, } from "../../shared/models";
import { decodeMultiFilter } from "../../shared/multi-filter";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { SavedViewsBar } from "../components/SavedViewsBar";
import { SortButton } from "../components/SortButton";
import { clientPrimaryName, clientSecondaryName } from "../lib/client-name";
import { money, number } from "../lib/format";
import { cycleSort, emptySort, sortItems } from "../lib/sorting";
type ReportView = "sellers" | "clients";
type SellerSortKey = "seller" | "clients" | "overdueClients" | "pendingBalance" | "overdueBalance" | "overdueShare" | "sales30";
type ClientSortKey = "name" | "seller" | "earliestDue" | "overdueBalance" | "pendingBalance" | "creditTermAverageDays" | "overdueShare" | "sales30" | "overdueToSales30";
const EMPTY_FILTERS: PendingBalanceFilters = { seller: "", paymentMethod: "", status: "all" };
const percent = (value: number | null, digits = 0) => value == null ? "No sales 30d" : `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: digits }).format(value)}%`;
const shortDate = (value: string | null) => value ? value.split("-").reverse().join("/") : "No due date";
function SellerChart({ rows, selected, onSelect }: {
    rows: PendingBalanceSellerRow[];
    selected: string;
    onSelect: (seller: string) => void;
}) {
    const max = Math.max(1, ...rows.map((row) => row.pendingBalance));
    const selectedSellers = decodeMultiFilter(selected);
    return <div className="pending-seller-chart">{rows.map((row) => <button key={row.seller} className={selectedSellers.includes(row.seller) ? "selected" : ""} onClick={() => onSelect(selectedSellers.length === 1 && selectedSellers[0] === row.seller ? "" : row.seller)} aria-label={`${row.seller}: ${money(row.pendingBalance)} pending, ${money(row.overdueBalance)} overdue`}>
    <strong>{row.seller}</strong><div><span style={{ width: `${row.pendingBalance / max * 100}%` }}><i style={{ width: `${Math.min(100, row.overdueShare)}%` }}/></span></div><b>{money(row.pendingBalance, true)}</b><aside><strong>{row.seller}</strong><span>Overdue <b>{money(row.overdueBalance)}</b></span><span>Pending <b>{money(row.pendingBalance)}</b></span><small>{percent(row.overdueShare, 1)} overdue · {row.overdueClients} customers</small></aside>
  </button>)}</div>;
}
function SellerTable({ rows, onOpenSeller }: {
    rows: PendingBalanceSellerRow[];
    onOpenSeller: (seller: string) => void;
}) {
    const [sort, setSort] = useState(emptySort<SellerSortKey>());
    const sorted = sortItems(rows, sort, (row, key) => row[key]);
    const direction = (key: SellerSortKey) => sort.key === key ? sort.direction : null;
    const change = (key: SellerSortKey) => setSort((current) => cycleSort(current, key));
    return <div className="pending-seller-table"><header><SortButton label="Seller" direction={direction("seller")} onClick={() => change("seller")}/><SortButton label="Customers" direction={direction("clients")} onClick={() => change("clients")}/><SortButton label="Customers overdue" direction={direction("overdueClients")} onClick={() => change("overdueClients")}/><SortButton label="Pending balance" direction={direction("pendingBalance")} onClick={() => change("pendingBalance")}/><SortButton label="Overdue balance" direction={direction("overdueBalance")} onClick={() => change("overdueBalance")}/><SortButton label="Overdue / pending" direction={direction("overdueShare")} onClick={() => change("overdueShare")}/><SortButton label="Sales 30d" direction={direction("sales30")} onClick={() => change("sales30")}/></header>{sorted.map((row) => <article key={row.seller}><button className="entity-link" onClick={() => onOpenSeller(row.seller)}>{row.seller}<ChevronRight size={13}/></button><span>{number(row.clients)}</span><span>{number(row.overdueClients)}</span><span>{money(row.pendingBalance)}</span><span className={row.overdueBalance > 0 ? "pending" : ""}>{money(row.overdueBalance)}</span><span className="pending-ratio">{percent(row.overdueShare, 1)}</span><span>{money(row.sales30)}</span></article>)}</div>;
}
function ClientTable({ rows, clients, onOpen, onOpenSeller }: {
    rows: PendingBalanceClientRow[];
    clients: DashboardData["clients"];
    onOpen: (client: Client) => void;
    onOpenSeller: (seller: string) => void;
}) {
    const [sort, setSort] = useState(emptySort<ClientSortKey>());
    const [visible, setVisible] = useState(100);
    useEffect(() => { setVisible(100); }, [rows]);
    const sorted = sortItems(rows, sort, (row, key) => row[key]);
    const direction = (key: ClientSortKey) => sort.key === key ? sort.direction : null;
    const change = (key: ClientSortKey) => setSort((current) => cycleSort(current, key));
    const clientMap = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
    return <><div className="pending-client-table"><header><SortButton label="Customer" direction={direction("name")} onClick={() => change("name")}/><SortButton label="Seller" direction={direction("seller")} onClick={() => change("seller")}/><SortButton label="Due date" direction={direction("earliestDue")} onClick={() => change("earliestDue")}/><SortButton label="Overdue balance" direction={direction("overdueBalance")} onClick={() => change("overdueBalance")}/><SortButton label="Pending balance" direction={direction("pendingBalance")} onClick={() => change("pendingBalance")}/><SortButton label="Method / days CC" direction={direction("creditTermAverageDays")} onClick={() => change("creditTermAverageDays")}/><SortButton label="Overdue / pending" direction={direction("overdueShare")} onClick={() => change("overdueShare")}/><SortButton label="Sales 30d" direction={direction("sales30")} onClick={() => change("sales30")}/><SortButton label="Overdue / sales 30d" direction={direction("overdueToSales30")} onClick={() => change("overdueToSales30")}/><span>Profile</span></header>{sorted.slice(0, visible).map((row) => {
            const client = clientMap.get(row.clientId);
            return <article key={row.clientId} className={client ? "clickable" : ""} onClick={() => client && onOpen(client)}><div><strong>{clientPrimaryName(row)}</strong><small>{clientSecondaryName(row) ? `${clientSecondaryName(row)} \u00B7 ` : `ID ${row.clientId} \u00B7 `}{row.active ? "Active" : "Inactive"}</small></div><button className="entity-link" onClick={(event) => { event.stopPropagation(); onOpenSeller(row.seller); }}>{row.seller}</button><span>{shortDate(row.earliestDue)}</span><span className={row.overdueBalance > 0 ? "pending" : ""}>{money(row.overdueBalance)}</span><span>{money(row.pendingBalance)}</span><div><strong>{row.paymentMethod}</strong><small>{row.creditTermAverageDays == null ? "Term no sample" : `${number(Math.round(row.creditTermAverageDays))} days average`}</small></div><span className="pending-ratio">{percent(row.overdueShare, 1)}</span><span>{money(row.sales30)}</span><span className={row.overdueToSales30 == null && row.overdueBalance > 0 ? "no-sales" : ""}>{row.overdueBalance <= 0 ? "0%" : percent(row.overdueToSales30, 1)}</span><button disabled={!client} onClick={(event) => {
                    event.stopPropagation();
                    if (client)
                        onOpen(client);
                }} aria-label={`Open profile of ${clientPrimaryName(row)}`}><ChevronRight size={15}/></button></article>;
        })}</div>{visible < sorted.length && <button className="button secondary pending-more" onClick={() => setVisible((value) => value + 100)}>Show 100 customers more</button>}</>;
}
export function PendingBalancesReportView({ data, onOpen, onOpenSeller }: {
    data: DashboardData;
    onOpen: (client: Client) => void;
    onOpenSeller: (seller: string) => void;
}) {
    const [meta, setMeta] = useState<PendingBalanceReportMeta | null>(null);
    const [report, setReport] = useState<PendingBalanceReportPayload | null>(null);
    const [filters, setFilters] = useState<PendingBalanceFilters>(EMPTY_FILTERS);
    const [view, setView] = useState<ReportView>("sellers");
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        fetch("/api/reports/pending-balances/meta").then(async (response) => {
            const payload = await response.json();
            if (!response.ok)
                throw new Error(payload.error || "Report metadata could not be opened");
            return payload as PendingBalanceReportMeta;
        }).then(setMeta).catch((cause: Error) => { setError(cause.message); setLoading(false); });
    }, []);
    useEffect(() => {
        if (!meta)
            return;
        const controller = new AbortController();
        const parameters = new URLSearchParams();
        if (filters.seller)
            parameters.set("seller", filters.seller);
        if (filters.paymentMethod)
            parameters.set("paymentMethod", filters.paymentMethod);
        if (filters.status && filters.status !== "all")
            parameters.set("status", filters.status);
        setLoading(true);
        setError("");
        fetch(`/api/reports/pending-balances?${parameters}`, { signal: controller.signal }).then(async (response) => {
            const payload = await response.json();
            if (!response.ok)
                throw new Error(payload.error || "The report could not be calculated");
            return payload as PendingBalanceReportPayload;
        }).then(setReport).catch((cause: Error) => {
            if (cause.name !== "AbortError")
                setError(cause.message);
        }).finally(() => {
            if (!controller.signal.aborted)
                setLoading(false);
        });
        return () => controller.abort();
    }, [filters, meta]);
    const update = <Key extends keyof PendingBalanceFilters>(key: Key, value: PendingBalanceFilters[Key]) => setFilters((current) => ({ ...current, [key]: value }));
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    const clients = useMemo(() => (report?.clients ?? []).filter((row) => !normalizedQuery || `${row.clientId} ${row.name} ${row.tradeName} ${row.seller} ${row.paymentMethod}`.toLocaleLowerCase("es").includes(normalizedQuery)), [normalizedQuery, report?.clients]);
    if (!meta && loading)
        return <div className="page-view pending-page"><div className="spt-loading"><RefreshCw className="spin" size={24}/><strong>Preparing Pending Balances</strong><span>Reconciling synthetic balances, due dates, and 30-day sales…</span></div></div>;
    if (!meta || (!report && error))
        return <div className="page-view pending-page"><div className="spt-loading error"><Database size={24}/><strong>Could not open Pending Balances</strong><span>{error}</span></div></div>;
    if (!report)
        return <div className="page-view pending-page"><div className="spt-loading"><RefreshCw className="spin" size={24}/><strong>Calculating pending balances</strong></div></div>;
    const maxAging = Math.max(1, ...report.aging.map((row) => row.amount));
    const savedFilters = { ...filters, view, query };
    const applySaved = (saved: Record<string, string>) => {
        setFilters({ seller: saved.seller || "", paymentMethod: saved.paymentMethod || "", status: saved.status || "all" });
        setView(saved.view === "clients" ? "clients" : "sellers");
        setQuery(saved.query ?? "");
    };
    return <div className={`page-view pending-page ${loading ? "is-loading" : ""}`}>
    <section className="data-card pending-filter-card" data-tour="pending-balances-overview"><div className="pending-filter-heading"><div><span className="section-kicker"><WalletCards size={14}/> Pending Balances</span><h2>Open portfolio · cutoff {shortDate(report.sourceMaxDate)}</h2><p>Open debit documents, due dates, and rolling gross sales from {shortDate(report.salesWindowFrom)}.</p></div><div className="pending-view-switch" role="tablist" aria-label="Report view"><button role="tab" aria-selected={view === "sellers"} className={view === "sellers" ? "active" : ""} onClick={() => setView("sellers")}><Users size={15}/> Sellers</button><button role="tab" aria-selected={view === "clients"} className={view === "clients" ? "active" : ""} onClick={() => setView("clients")}><Store size={15}/> Customers</button></div></div><div className="pending-filters"><MultiSelectFilter label="Seller" value={filters.seller} options={meta.options.sellers} onChange={(value) => update("seller", value)}/><MultiSelectFilter label="Payment method" value={filters.paymentMethod} options={meta.options.paymentMethods} onChange={(value) => update("paymentMethod", value)}/><MultiSelectFilter label="Balance status" value={filters.status === "all" ? "" : filters.status} options={[{ value: "overdue", label: "With overdue balance" }, { value: "not_due", label: "Not yet due only" }]} onChange={(value) => update("status", value)}/><button className="button secondary" onClick={() => setFilters(EMPTY_FILTERS)}><Filter size={14}/> Reset</button></div><SavedViewsBar viewKey="pending-balances" filters={savedFilters} onApply={applySaved}/>{loading && <div className="nutripet-filter-loading"><RefreshCw className="spin" size={13}/> Recalculating</div>}</section>

    <div className="pending-kpis"><article><span className="pending-kpi-icon green"><CircleDollarSign size={20}/></span><div><small>Pending balance</small><strong>{money(report.pendingBalance, true)}</strong><em>{number(report.clientsWithBalance)} customers with an open balance</em></div></article><article><span className="pending-kpi-icon ochre"><CalendarClock size={20}/></span><div><small>Overdue balance</small><strong>{money(report.overdueBalance, true)}</strong><em>{number(report.overdueDocuments)} overdue documents</em></div></article><article><span className="pending-kpi-icon blue"><WalletCards size={20}/></span><div><small>Overdue / pending</small><strong>{percent(report.overdueShare, 1)}</strong><em>{number(report.overdueClients)} customers affected</em></div></article><article><span className="pending-kpi-icon green"><TrendingUp size={20}/></span><div><small>Gross sales · 30d</small><strong>{money(report.sales30, true)}</strong><em>{shortDate(report.salesWindowFrom)}–{shortDate(report.sourceMaxDate)}</em></div></article><article><span className="pending-kpi-icon blue"><Users size={20}/></span><div><small>Overdue / sales 30d</small><strong>{percent(report.overdueToSales30, 1)}</strong><em>collection pressure relative to recent sales</em></div></article></div>

    <div className="pending-main-grid"><section className="data-card pending-seller-card"><div className="data-card-header"><div><span className="section-kicker"><Users size={14}/> Owners</span><h2>Pending balance by seller</h2><p>The dark segment is overdue. Select a bar to filter the entire screen.</p></div><span className="count-badge">{report.sellers.length} {report.sellers.length === 1 ? "seller" : "sellers"}</span></div><SellerChart rows={report.sellers} selected={filters.seller} onSelect={(seller) => update("seller", seller)}/></section><section className="data-card pending-aging-card"><div className="data-card-header"><div><span className="section-kicker"><CalendarClock size={14}/> Aging</span><h2>Documents by due date</h2><p>Invoices and debit notes that remain open.</p></div></div><div className="pending-aging-list">{report.aging.map((row) => <article key={row.key}><div><strong>{row.label}</strong><small>{row.documents} documents · {percent(row.share, 1)}</small></div><span><i style={{ width: `${row.amount / maxAging * 100}%` }}/></span><b>{money(row.amount, true)}</b></article>)}</div></section></div>

    {view === "sellers" ? <section className="data-card pending-detail-card"><div className="data-card-header"><div><span className="section-kicker"><Users size={14}/> Summary</span><h2>Portfolio by seller</h2><p>Balance, overdue amount, and recent sales use the same universe.</p></div></div><SellerTable rows={report.sellers} onOpenSeller={onOpenSeller}/></section> : <section className="data-card pending-detail-card"><div className="data-card-header"><div><span className="section-kicker"><Store size={14}/> Operational detail</span><h2>Customers with a pending balance</h2><p>The profile retains individual documents and collection activities.</p></div><span className="count-badge">{number(clients.length)} of {number(report.clients.length)}</span></div><div className="pending-table-tools"><label><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer, ID, seller, or payment method"/></label></div><ClientTable rows={clients} clients={data.clients} onOpen={onOpen} onOpenSeller={onOpenSeller}/></section>}

    <section className="pending-definition-note"><AlertCircle size={17}/><div><strong>Clear definitions, never “Infinity”</strong><span><b>Pending balance</b> sums invoices and debit notes that remain open with a valid due date. <b>Overdue balance</b> uses the portion whose first due date has passed. <b>Average credit days</b> averages issue → due date of those documents. When there are no sales in 30 days, overdue-to-sales is shown as “No sales 30d”.</span><small>Receipts and unapplied credit notes are not counted as debt, so the document portfolio may differ from a net account balance.</small></div></section>
    <section className="pending-source-note"><Database size={16}/><div><strong>{meta.sourceSystem}</strong><span>{number(meta.clientCount)} fictional customers · {number(meta.documentCount)} open documents with valid due dates · visible sellers: {meta.options.sellers.join(", ")}. Synthetic snapshot dated {shortDate(meta.asOfDate)}.</span></div></section>
  </div>;
}
