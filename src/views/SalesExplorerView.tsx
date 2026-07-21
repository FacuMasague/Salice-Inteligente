import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarRange, ChevronLeft, ChevronRight, Database, Download, FileSpreadsheet, Filter, Package, ReceiptText, Search, ShoppingCart, Users } from "lucide-react";
import type { Client, SalesExplorerClientRow, SalesExplorerDocumentRow, SalesExplorerFilters, SalesExplorerMeta, SalesExplorerPayload, SalesExplorerProductRow, } from "../../shared/models";
import { encodeMultiFilter } from "../../shared/multi-filter";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { SavedViewsBar } from "../components/SavedViewsBar";
import { SortButton } from "../components/SortButton";
import { clientPrimaryName, clientSecondaryName } from "../lib/client-name";
import { money, number, shortDate } from "../lib/format";
import { cycleSort, emptySort, sortItems } from "../lib/sorting";
type ExplorerTab = "periods" | "clients" | "products" | "documents";
type ClientSort = "name" | "seller" | "netAmount" | "kilos" | "documents" | "lastSaleAt";
type ProductSort = "name" | "brand" | "netAmount" | "kilos" | "clients" | "lastSaleAt";
type DocumentSort = "date" | "documentNumber" | "client" | "seller" | "netAmount";
interface SalesExplorerViewProps {
    clients: Client[];
    onOpenClient: (clientId: number) => void;
    onOpenProduct: (productId: string) => void;
    onOpenBrand: (brand: string) => void;
    onOpenInvoice: (invoiceId: string) => void;
}
const emptyFilters: SalesExplorerFilters = { from: "", to: "", seller: "", client: "", product: "", brand: "", category: "", channel: "", zone: "" };
const asRecord = (filters: SalesExplorerFilters): Record<string, string> => ({ ...filters });
const exact = (value: number, digits = 2) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: digits }).format(value);
function periodLabel(key: string) {
    if (key.length === 7)
        return new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${key}-01T12:00:00Z`)).replace(".", "");
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`)).replace(".", "");
}
function SalesTimeline({ report, onSelect }: {
    report: SalesExplorerPayload;
    onSelect: (from: string, to: string) => void;
}) {
    const [hovered, setHovered] = useState<number | null>(null);
    const width = 1100;
    const height = 300;
    const inset = { left: 72, right: 24, top: 24, bottom: 46 };
    const plotHeight = height - inset.top - inset.bottom;
    const plotWidth = width - inset.left - inset.right;
    const max = Math.max(1, ...report.timeline.map((row) => Math.abs(row.netAmount))) * 1.08;
    const step = plotWidth / Math.max(1, report.timeline.length);
    const barWidth = Math.max(3, Math.min(38, step * .66));
    const active = hovered == null ? null : report.timeline[hovered];
    return <div className="admin-chart-stage" onMouseLeave={() => setHovered(null)}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Net sales trend for the filtered period">
      {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}>
        <line x1={inset.left} x2={width - inset.right} y1={inset.top + plotHeight * (1 - ratio)} y2={inset.top + plotHeight * (1 - ratio)}/>
        <text x={inset.left - 10} y={inset.top + plotHeight * (1 - ratio) + 4} textAnchor="end">{money(max * ratio, true)}</text>
      </g>)}
      {report.timeline.map((row, index) => {
            const x = inset.left + step * index + step / 2;
            const barHeight = Math.abs(row.netAmount) / max * plotHeight;
            const visibleLabel = report.timeline.length <= 18 || index % Math.ceil(report.timeline.length / 14) === 0;
            return <g key={row.key} tabIndex={0} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} onMouseEnter={() => setHovered(index)} onClick={() => onSelect(row.from, row.to)} className="admin-chart-point">
          <rect className="hit" x={x - step / 2} y={inset.top} width={step} height={plotHeight}/>
          <rect className={row.netAmount < 0 ? "negative" : hovered === index ? "active" : ""} x={x - barWidth / 2} y={inset.top + plotHeight - barHeight} width={barWidth} height={Math.max(1, barHeight)} rx="4"/>
          {visibleLabel && <text x={x} y={height - 16} textAnchor="middle">{periodLabel(row.key)}</text>}
        </g>;
        })}
    </svg>
    {active && <aside className="admin-chart-tooltip">
      <strong>{periodLabel(active.key)}</strong><span>Net sales <b>{money(active.netAmount)}</b></span><span>Kilos <b>{exact(active.kilos, 3)}</b></span><span>Customers <b>{number(active.clients)}</b></span><small>Select the bar to drill into this period.</small>
    </aside>}
  </div>;
}
export function SalesExplorerView({ clients, onOpenClient, onOpenProduct, onOpenBrand, onOpenInvoice }: SalesExplorerViewProps) {
    const [meta, setMeta] = useState<SalesExplorerMeta | null>(null);
    const [report, setReport] = useState<SalesExplorerPayload | null>(null);
    const [filters, setFilters] = useState<SalesExplorerFilters>(emptyFilters);
    const [tab, setTab] = useState<ExplorerTab>("periods");
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [advanced, setAdvanced] = useState(false);
    const [clientSort, setClientSort] = useState(emptySort<ClientSort>());
    const [productSort, setProductSort] = useState(emptySort<ProductSort>());
    const [documentSort, setDocumentSort] = useState(emptySort<DocumentSort>());
    useEffect(() => {
        fetch("/api/admin/sales/meta").then((response) => {
            if (!response.ok)
                throw new Error("The sales explorer source could not be opened.");
            return response.json();
        }).then((payload: SalesExplorerMeta) => {
            setMeta(payload);
            const from = new Date(`${payload.maxDate}T12:00:00Z`);
            from.setUTCDate(from.getUTCDate() - 89);
            setFilters({ ...emptyFilters, from: from.toISOString().slice(0, 10) < payload.minDate ? payload.minDate : from.toISOString().slice(0, 10), to: payload.maxDate });
        }).catch((cause: Error) => { setError(cause.message); setLoading(false); });
    }, []);
    useEffect(() => {
        if (!meta || !filters.from || !filters.to)
            return;
        const controller = new AbortController();
        const query = new URLSearchParams({ ...filters, page: String(page), pageSize: "40" });
        setLoading(true);
        setError("");
        fetch(`/api/admin/sales?${query}`, { signal: controller.signal }).then((response) => {
            if (!response.ok)
                throw new Error("The sales explorer could not be calculated.");
            return response.json();
        }).then((payload: SalesExplorerPayload) => { setReport(payload); setLoading(false); }).catch((cause: Error) => {
            if (cause.name !== "AbortError") {
                setError(cause.message);
                setLoading(false);
            }
        });
        return () => controller.abort();
    }, [meta, filters, page]);
    const changeFilter = <Key extends keyof SalesExplorerFilters>(key: Key, value: SalesExplorerFilters[Key]) => {
        setFilters((current) => ({ ...current, [key]: value }));
        setPage(1);
    };
    const reset = () => {
        if (!meta)
            return;
        const from = new Date(`${meta.maxDate}T12:00:00Z`);
        from.setUTCDate(from.getUTCDate() - 89);
        setFilters({ ...emptyFilters, from: from.toISOString().slice(0, 10) < meta.minDate ? meta.minDate : from.toISOString().slice(0, 10), to: meta.maxDate });
        setPage(1);
        setTab("periods");
    };
    const selectPeriod = (from: string, to: string) => { setFilters((current) => ({ ...current, from, to })); setPage(1); setTab("clients"); };
    const drillClient = (clientId: number) => { changeFilter("client", encodeMultiFilter([String(clientId)])); setTab("documents"); };
    const drillProduct = (productId: string) => { changeFilter("product", encodeMultiFilter([productId])); setTab("documents"); };
    const exportUrl = (format: "csv" | "xlsx") => `/api/admin/sales/export?${new URLSearchParams({ ...filters, format })}`;
    const sortedClients = useMemo(() => sortItems(report?.clients ?? [], clientSort, (row, key) => row[key]), [report, clientSort]);
    const clientMap = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
    const sortedProducts = useMemo(() => sortItems(report?.products ?? [], productSort, (row, key) => row[key]), [report, productSort]);
    const sortedDocuments = useMemo(() => sortItems(report?.documents ?? [], documentSort, (row, key) => row[key]), [report, documentSort]);
    const applySaved = (saved: Record<string, string>) => { setFilters((current) => ({ ...current, ...saved })); setPage(1); };
    if (error && !report)
        return <div className="page-view"><section className="data-card report-error"><Database size={22}/><div><h2>Sales Explorer unavailable</h2><p>{error}</p></div></section></div>;
    if (!meta || !report)
        return <div className="page-view"><section className="data-card report-loading"><span /><h2>Preparing the Sales Explorer…</h2><p>Organizing movements, customers, products and documents.</p></section></div>;
    const metricCards = [
        { label: "Net sales", value: money(report.summary.netAmount, true), note: `${number(report.summary.documents)} documents`, icon: ShoppingCart },
        { label: "Kilos net", value: `${exact(report.summary.kilos, 1)} kg`, note: `${exact(report.summary.units)} units`, icon: Package },
        { label: "Buying customers", value: number(report.summary.clients), note: `${filters.from} \u2192 ${filters.to}`, icon: Users },
        { label: "Ticket average", value: report.summary.averageTicket == null ? "No baseline" : money(report.summary.averageTicket), note: "Net sales / documents", icon: ReceiptText },
        { label: "Sales per kilo", value: report.summary.averagePricePerKilo == null ? "No baseline" : `${money(report.summary.averagePricePerKilo)}/kg`, note: "Period ratio", icon: BarChart3 },
    ];
    return <div className={`page-view admin-sales-page ${loading ? "is-loading" : ""}`}>
    <section className="data-card admin-filter-card" data-tour="sales-explorer-overview">
      <div className="data-card-header"><div><span className="section-kicker"><Search size={14}/> Administrative exploration</span><h2>From sale to document</h2><p>All metrics and breakdowns use the same commercial universe and filters.</p></div><div className="admin-export-actions"><a className="button ghost compact" href={exportUrl("csv")}><Download size={14}/> CSV</a><a className="button ghost compact" href={exportUrl("xlsx")}><FileSpreadsheet size={14}/> Excel</a></div></div>
      <div className="admin-filter-grid primary"><label className="date-filter"><span>From</span><input type="date" min={meta.minDate} max={filters.to} value={filters.from} onChange={(event) => changeFilter("from", event.target.value)}/></label><label className="date-filter"><span>Through</span><input type="date" min={filters.from} max={meta.maxDate} value={filters.to} onChange={(event) => changeFilter("to", event.target.value)}/></label><MultiSelectFilter label="Seller" value={filters.seller} options={meta.options.sellers} onChange={(value) => changeFilter("seller", value)}/><MultiSelectFilter label="Customer" value={filters.client} options={meta.options.clients} onChange={(value) => changeFilter("client", value)}/></div>
      <button className="admin-more-filters" onClick={() => setAdvanced((current) => !current)}><Filter size={14}/> {advanced ? "Hide additional filters" : "Product, brand, category, channel and zone"} <ChevronRight size={14} className={advanced ? "rotated" : ""}/></button>
      {advanced && <div className="admin-filter-grid advanced"><MultiSelectFilter label="Product" value={filters.product} options={meta.options.products} onChange={(value) => changeFilter("product", value)}/><MultiSelectFilter label="Brand" value={filters.brand} options={meta.options.brands} onChange={(value) => changeFilter("brand", value)}/><MultiSelectFilter label="Category" value={filters.category} options={meta.options.categories} onChange={(value) => changeFilter("category", value)}/><MultiSelectFilter label="Channel" value={filters.channel} options={meta.options.channels} onChange={(value) => changeFilter("channel", value)}/><MultiSelectFilter label="Zone" value={filters.zone} options={meta.options.zones} onChange={(value) => changeFilter("zone", value)}/><button className="button ghost" onClick={reset}>Reset</button></div>}
      <SavedViewsBar viewKey="sales-explorer" filters={asRecord(filters)} onApply={applySaved}/>
    </section>

    <div className="admin-kpi-strip">{metricCards.map(({ label, value, note, icon: Icon }) => <button key={label} onClick={() => setTab("periods")}><span><Icon size={19}/></span><div><small>{label}</small><strong>{value}</strong><em>{note}</em></div></button>)}</div>

    <section className="data-card admin-drill-card">
      <div className="admin-drill-steps"><button className={tab === "periods" ? "active" : ""} onClick={() => setTab("periods")}><i>1</i> Period</button><ChevronRight size={14}/><button className={tab === "clients" ? "active" : ""} onClick={() => setTab("clients")}><i>2</i> Customer</button><span>or</span><button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}><i>2</i> Product</button><ChevronRight size={14}/><button className={tab === "documents" ? "active" : ""} onClick={() => setTab("documents")}><i>3</i> Document</button></div>

      {tab === "periods" && <><div className="data-card-header"><div><span className="section-kicker"><CalendarRange size={14}/> Trend</span><h2>Net sales by {report.timelineGrain === "day" ? "day" : "month"}</h2><p>Choose a bar to narrow the analysis to that period, then continue to customers or products.</p></div><span className="count-badge">{report.timeline.length} periods</span></div><SalesTimeline report={report} onSelect={selectPeriod}/></>}

      {tab === "clients" && <><div className="data-card-header"><div><span className="section-kicker"><Users size={14}/> Second level</span><h2>Customers that explain the period</h2><p>Select an account to filter its documents; the side action opens its complete profile.</p></div><span className="count-badge">Top {report.resultLimits.clients}</span></div><div className="admin-table clients"><header><SortButton label="Customer" direction={clientSort.key === "name" ? clientSort.direction : null} onClick={() => setClientSort((state) => cycleSort(state, "name"))}/><SortButton label="Seller" direction={clientSort.key === "seller" ? clientSort.direction : null} onClick={() => setClientSort((state) => cycleSort(state, "seller"))}/><SortButton label="Net sales" direction={clientSort.key === "netAmount" ? clientSort.direction : null} onClick={() => setClientSort((state) => cycleSort(state, "netAmount"))}/><SortButton label="Kilos" direction={clientSort.key === "kilos" ? clientSort.direction : null} onClick={() => setClientSort((state) => cycleSort(state, "kilos"))}/><SortButton label="Documents" direction={clientSort.key === "documents" ? clientSort.direction : null} onClick={() => setClientSort((state) => cycleSort(state, "documents"))}/><SortButton label="Last sale" direction={clientSort.key === "lastSaleAt" ? clientSort.direction : null} onClick={() => setClientSort((state) => cycleSort(state, "lastSaleAt"))}/></header>{sortedClients.map((row: SalesExplorerClientRow) => { const client = clientMap.get(row.clientId); return <article key={row.clientId}><button className="admin-drill-entity" onClick={() => drillClient(row.clientId)}><strong>{client ? clientPrimaryName(client) : row.name}</strong><small>{client && clientSecondaryName(client) ? `${clientSecondaryName(client)} \u00B7 ` : ""}ID {row.clientId} · {row.zone} · {exact(row.share, 1)}%</small></button><button className="entity-link" onClick={() => onOpenClient(row.clientId)}>{row.seller}</button><span>{money(row.netAmount)}</span><span>{exact(row.kilos, 2)}</span><span>{number(row.documents)}</span><span>{shortDate(row.lastSaleAt)}</span></article>; })}</div></>}

      {tab === "products" && <><div className="data-card-header"><div><span className="section-kicker"><Package size={14}/> Second level</span><h2>Products that explain the period</h2><p>Filter by a product to reach its documents, or open its profile from the name.</p></div><span className="count-badge">Top {report.resultLimits.products}</span></div><div className="admin-table products"><header><SortButton label="Product" direction={productSort.key === "name" ? productSort.direction : null} onClick={() => setProductSort((state) => cycleSort(state, "name"))}/><SortButton label="Brand" direction={productSort.key === "brand" ? productSort.direction : null} onClick={() => setProductSort((state) => cycleSort(state, "brand"))}/><SortButton label="Net sales" direction={productSort.key === "netAmount" ? productSort.direction : null} onClick={() => setProductSort((state) => cycleSort(state, "netAmount"))}/><SortButton label="Kilos" direction={productSort.key === "kilos" ? productSort.direction : null} onClick={() => setProductSort((state) => cycleSort(state, "kilos"))}/><SortButton label="Customers" direction={productSort.key === "clients" ? productSort.direction : null} onClick={() => setProductSort((state) => cycleSort(state, "clients"))}/><SortButton label="Last sale" direction={productSort.key === "lastSaleAt" ? productSort.direction : null} onClick={() => setProductSort((state) => cycleSort(state, "lastSaleAt"))}/></header>{sortedProducts.map((row: SalesExplorerProductRow) => <article key={row.productId}><button className="admin-drill-entity" onClick={() => drillProduct(row.productId)}><strong>{row.name}</strong><small>{row.productId} · {row.category} · {exact(row.share, 1)}%</small></button><button className="entity-link" onClick={() => onOpenBrand(row.brand)}>{row.brand}</button><span>{money(row.netAmount)}</span><span>{exact(row.kilos, 2)}</span><span>{number(row.clients)}</span><span>{shortDate(row.lastSaleAt)}</span></article>)}</div></>}

      {tab === "documents" && <><div className="data-card-header"><div><span className="section-kicker"><ReceiptText size={14}/> Last level</span><h2>Documents and items</h2><p>Open a document to review exact detail, status, and its PDF export.</p></div><span className="count-badge">{number(report.documentPagination.total)} documents</span></div><div className="admin-table documents"><header><SortButton label="Date" direction={documentSort.key === "date" ? documentSort.direction : null} onClick={() => setDocumentSort((state) => cycleSort(state, "date"))}/><SortButton label="Document" direction={documentSort.key === "documentNumber" ? documentSort.direction : null} onClick={() => setDocumentSort((state) => cycleSort(state, "documentNumber"))}/><SortButton label="Customer" direction={documentSort.key === "client" ? documentSort.direction : null} onClick={() => setDocumentSort((state) => cycleSort(state, "client"))}/><SortButton label="Seller" direction={documentSort.key === "seller" ? documentSort.direction : null} onClick={() => setDocumentSort((state) => cycleSort(state, "seller"))}/><SortButton label="Net sales" direction={documentSort.key === "netAmount" ? documentSort.direction : null} onClick={() => setDocumentSort((state) => cycleSort(state, "netAmount"))}/><span>Items</span></header>{sortedDocuments.map((row: SalesExplorerDocumentRow) => <button className="admin-document-row" key={row.key} onClick={() => onOpenInvoice(row.key)}><span>{shortDate(row.date)}</span><strong>{row.documentNumber}<small>{row.kind === "credit_note" ? "Credit note" : "Invoice"}</small></strong><span>{row.client}</span><span>{row.seller}</span><span className={row.netAmount < 0 ? "negative-value" : ""}>{money(row.netAmount)}</span><span>{number(row.items)}</span></button>)}</div><div className="admin-pagination"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={15}/> Previous</button><span>Page {number(report.documentPagination.page)} of {number(report.documentPagination.pages)}</span><button disabled={page >= report.documentPagination.pages} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight size={15}/></button></div></>}
    </section>

    <section className="general-source-note"><Database size={18}/><div><strong>Auditable source and cutoff</strong><span>{meta.sourceSystem}. Coverage {meta.minDate} → {meta.maxDate}; {number(meta.sourceDocumentCount)} source documents. Filters apply AND between dimensions and OR within each dimension.</span>{meta.unavailableDocumentCount > 0 && <small>{meta.unavailableDocumentCount} documents returned no detail and are never completed artificially.</small>}</div></section>
    {error && report && <div className="admin-inline-error">{error}</div>}
  </div>;
}
