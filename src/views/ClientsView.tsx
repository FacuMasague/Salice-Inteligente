import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Check, ChevronRight, EyeOff, Search, Users } from "lucide-react";
import type { Client, ClientTrendDirection, ClientTrendReview } from "../../shared/models";
import { decodeMultiFilter, matchesMultiFilter } from "../../shared/multi-filter";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { SavedViewsBar } from "../components/SavedViewsBar";
import { SingleSelectFilter } from "../components/SingleSelectFilter";
import { SortButton } from "../components/SortButton";
import { clientInitials, clientPrimaryName, clientSecondaryName } from "../lib/client-name";
import { creditTermLabel, money, number, paymentDelay, shortDate } from "../lib/format";
import { cycleSort, emptySort, sortItems } from "../lib/sorting";
type ClientSortKey = "client" | "status" | "zone" | "sales" | "risk" | "opportunity" | "term" | "visit";
export function ClientsView({ clients, query, onQuery, onOpen, onOpenSeller }: {
    clients: Client[];
    query: string;
    onQuery: (value: string) => void;
    onOpen: (client: Client) => void;
    onOpenSeller: (seller: string) => void;
}) {
    const pageSize = 50;
    const [page, setPage] = useState(1);
    const [commercialStatus, setCommercialStatus] = useState("active");
    const [portfolio, setPortfolio] = useState("");
    const [seller, setSeller] = useState("");
    const [risk, setRisk] = useState("");
    const [trend, setTrend] = useState("");
    const [sort, setSort] = useState<"priority" | "risk" | "opportunity" | "sales" | "growth" | "decline">("priority");
    const [tableSort, setTableSort] = useState(emptySort<ClientSortKey>());
    const [reviewedTrends, setReviewedTrends] = useState<Set<string>>(new Set());
    const [reviewPending, setReviewPending] = useState<number | null>(null);
    const [reviewError, setReviewError] = useState("");
    useEffect(() => {
        fetch("/api/client-trend-reviews")
            .then((response) => response.ok ? response.json() : Promise.reject(new Error("Review states could not be loaded.")))
            .then((payload: {
            reviews: ClientTrendReview[];
        }) => setReviewedTrends(new Set(payload.reviews.map((review) => `${review.direction}:${review.clientId}`))))
            .catch(() => setReviewError("Reviewed customers could not be loaded."));
    }, []);
    const trendMode: ClientTrendDirection | null = sort === "growth" || sort === "decline" ? sort : null;
    const reviewed = (clientId: number, direction = trendMode) => Boolean(direction && reviewedTrends.has(`${direction}:${clientId}`));
    const activeCount = clients.filter((client) => client.active).length;
    const inactiveCount = clients.length - activeCount;
    const sellers = useMemo(() => [...new Set(clients.filter((client) => client.active).map((client) => client.seller))].sort((a, b) => a.localeCompare(b, "en")), [clients]);
    const baseFiltered = clients
        .filter((client) => matchesMultiFilter(client.active ? "active" : "inactive", commercialStatus))
        .filter((client) => matchesMultiFilter(client.portfolioStatus, portfolio))
        .filter((client) => matchesMultiFilter(client.seller, seller))
        .filter((client) => matchesMultiFilter(client.collectionRisk >= 55 ? "high" : client.collectionRisk >= 25 ? "attention" : "low", risk))
        .filter((client) => matchesMultiFilter(client.salesDelta >= 30 ? "growth" : client.salesDelta <= -30 ? "decline" : "stable", trend))
        .filter((client) => trendMode === "growth" ? client.salesDelta >= 30 : trendMode === "decline" ? client.salesDelta <= -30 : true)
        .filter((client) => `${client.tradeName} ${client.name} ${client.reference} ${client.locality} ${client.zone} ${client.seller}`.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => trendMode && reviewed(a.id) !== reviewed(b.id) ? Number(reviewed(a.id)) - Number(reviewed(b.id))
        : sort === "growth" ? b.salesDelta - a.salesDelta
            : sort === "decline" ? a.salesDelta - b.salesDelta
                : sort === "risk" ? b.collectionRisk - a.collectionRisk
                    : sort === "opportunity" ? b.commercialOpportunity - a.commercialOpportunity
                        : sort === "sales" ? b.sales90d - a.sales90d
                            : b.visitPriority - a.visitPriority);
    const tableSorted = sortItems(baseFiltered, tableSort, (client, key) => {
        if (key === "client")
            return clientPrimaryName(client);
        if (key === "status")
            return client.active;
        if (key === "zone")
            return `${client.zone} ${client.seller}`;
        if (key === "sales")
            return client.sales90d;
        if (key === "risk")
            return client.collectionRisk;
        if (key === "opportunity")
            return client.commercialOpportunity;
        if (key === "term")
            return client.creditDays;
        return client.nextVisitAt;
    });
    const filtered = trendMode
        ? tableSorted.sort((left, right) => Number(reviewed(left.id)) - Number(reviewed(right.id)))
        : tableSorted;
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(page, pageCount);
    const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const direction = (key: ClientSortKey) => tableSort.key === key ? tableSort.direction : null;
    const ariaSort = (key: ClientSortKey): "ascending" | "descending" | "none" => direction(key) === "asc" ? "ascending" : direction(key) === "desc" ? "descending" : "none";
    const changeTableSort = (key: ClientSortKey) => { setTableSort((current) => cycleSort(current, key)); setPage(1); };
    const savedFilters = { query, commercialStatus, portfolio, seller, risk, trend, sort };
    const applySaved = (saved: Record<string, string>) => {
        onQuery(saved.query ?? "");
        setCommercialStatus(saved.commercialStatus ?? "active");
        setPortfolio(saved.portfolio ?? "");
        setSeller(saved.seller ?? "");
        setRisk(saved.risk ?? "");
        setTrend(saved.trend ?? "");
        setSort((saved.sort as typeof sort) || "priority");
        setPage(1);
    };
    const toggleReviewed = async (clientId: number) => {
        if (!trendMode || reviewPending != null)
            return;
        const key = `${trendMode}:${clientId}`;
        const nextReviewed = !reviewedTrends.has(key);
        setReviewError("");
        setReviewPending(clientId);
        setReviewedTrends((current) => {
            const next = new Set(current);
            if (nextReviewed)
                next.add(key);
            else
                next.delete(key);
            return next;
        });
        try {
            const response = await fetch(`/api/client-trend-reviews/${clientId}/${trendMode}`, {
                method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewed: nextReviewed }),
            });
            if (!response.ok)
                throw new Error("The review could not be saved.");
        }
        catch {
            setReviewedTrends((current) => {
                const next = new Set(current);
                if (nextReviewed)
                    next.delete(key);
                else
                    next.add(key);
                return next;
            });
            setReviewError("The customer review could not be saved.");
        }
        finally {
            setReviewPending(null);
        }
    };
    return (<div className="page-view clients-page">
      <div className="page-tools clients-page-tools">
        <label className="large-search"><Search size={18}/><input value={query} onChange={(event) => { onQuery(event.target.value); setPage(1); }} placeholder="Search customer, locality, zone, or seller…"/></label>
        <div className="client-filter-bar">
          <MultiSelectFilter label="Activity" value={commercialStatus} options={[{ value: "active", label: `Active (${activeCount})` }, { value: "inactive", label: `Inactive (${inactiveCount})` }]} onChange={(value) => { setCommercialStatus(value); setPage(1); }}/>
          <MultiSelectFilter label="Portfolio" value={portfolio} options={[{ value: "confirmed", label: "Confirmed" }, { value: "review", label: "Needs review" }]} onChange={(value) => { setPortfolio(value); setPage(1); }}/>
          <MultiSelectFilter label="Seller" value={seller} options={sellers} onChange={(value) => { setSeller(value); setPage(1); }}/>
          <MultiSelectFilter label="Risk" value={risk} options={[{ value: "high", label: "High \u00B7 55+" }, { value: "attention", label: "Attention \u00B7 25\u201354" }, { value: "low", label: "Low \u00B7 0\u201324" }]} onChange={(value) => { setRisk(value); setPage(1); }}/>
          <MultiSelectFilter label="Trend" value={trend} options={[{ value: "growth", label: "Growth 30%+" }, { value: "decline", label: "Decline 30%+" }, { value: "stable", label: "Stable \u00B7 under 30%" }]} onChange={(value) => { setTrend(value); setPage(1); }}/>
          <SingleSelectFilter label="Sort" value={sort} options={[{ value: "priority", label: "Visit priority" }, { value: "risk", label: "Collection risk" }, { value: "opportunity", label: "Commercial opportunity" }, { value: "sales", label: "90-day sales" }, { value: "growth", label: "Highest growth \u00B7 30%+" }, { value: "decline", label: "Largest decline \u00B7 30%+" }]} onChange={(value) => { setSort(value as typeof sort); setTableSort(emptySort<ClientSortKey>()); setPage(1); }}/>
        </div>
        <SavedViewsBar viewKey="clients" filters={savedFilters} onApply={applySaved}/>
      </div>
      <section className="data-card" data-tour="clients-directory">
        <div className="data-card-header"><div><span className="section-kicker">{decodeMultiFilter(commercialStatus).length === 1 && decodeMultiFilter(commercialStatus)[0] === "inactive" ? <EyeOff size={14}/> : <Users size={14}/>} Commercial portfolio</span><h2>{trendMode === "growth" ? "Customers with growth of 30% or more" : trendMode === "decline" ? "Customers with decline of 30% or more" : decodeMultiFilter(commercialStatus).length === 1 && decodeMultiFilter(commercialStatus)[0] === "active" ? "Active customers" : decodeMultiFilter(commercialStatus).length === 1 && decodeMultiFilter(commercialStatus)[0] === "inactive" ? "Inactive customer history" : "Complete customer universe"}</h2><p>{trendMode ? "Unreviewed items appear first; the check moves a customer to the end of this list." : "Collection risk and commercial opportunity are calculated separately."}</p>{reviewError && <small className="form-error">{reviewError}</small>}</div><span className="count-badge">{number(filtered.length)} results</span></div>
        <div className="table-wrap">
          <table className="data-table clients-data-table">
            <thead><tr><th aria-sort={ariaSort("client")}><SortButton label="Customer" direction={direction("client")} onClick={() => changeTableSort("client")}/></th><th aria-sort={ariaSort("status")}><SortButton label="Activity / portfolio" direction={direction("status")} onClick={() => changeTableSort("status")}/></th><th aria-sort={ariaSort("zone")}><SortButton label="Zone and seller" direction={direction("zone")} onClick={() => changeTableSort("zone")}/></th><th aria-sort={ariaSort("sales")}><SortButton label="90-day sales" direction={direction("sales")} onClick={() => changeTableSort("sales")}/></th><th aria-sort={ariaSort("risk")}><SortButton label="Collection" direction={direction("risk")} onClick={() => changeTableSort("risk")}/></th><th aria-sort={ariaSort("opportunity")}><SortButton label="Opportunity" direction={direction("opportunity")} onClick={() => changeTableSort("opportunity")}/></th><th aria-sort={ariaSort("term")}><SortButton label="Term / payment" direction={direction("term")} onClick={() => changeTableSort("term")}/></th><th aria-sort={ariaSort("visit")}><SortButton label="Suggested visit" direction={direction("visit")} onClick={() => changeTableSort("visit")}/></th><th>{trendMode ? "Reviewed" : ""}</th></tr></thead>
            <tbody>
              {visible.map((client) => (<tr key={client.id} className={`${client.active ? "" : "inactive-client-row"} ${trendMode && reviewed(client.id) ? "trend-reviewed-row" : ""}`} onClick={() => onOpen(client)}>
                  <td><div className="table-client client-legal-identity"><div className="mini-avatar">{clientInitials(client)}</div><div><strong>{clientPrimaryName(client)}</strong>{clientSecondaryName(client) && <span className="client-trade-name">{clientSecondaryName(client)}</span>}<span>{client.locality} · {client.segment}</span></div></div></td>
                  <td><span className={`source-status-badge ${client.active ? "active" : "inactive"}`}>{client.active ? "Active" : "Inactive"}</span><span className={`portfolio-badge ${client.portfolioStatus}`}>{client.portfolioStatus === "confirmed" ? "Confirmed" : "Review portfolio"}</span></td>
                  <td><strong className="normal-weight">{client.zone}</strong><button className="entity-link cell-sub" onClick={(event) => { event.stopPropagation(); onOpenSeller(client.seller); }}>{client.seller}</button></td>
                  <td><strong>{money(client.sales90d, true)}</strong><span title="Compares the latest 90 days with the immediately preceding 90 days" className={`cell-sub inline-delta ${client.salesDelta > 0 ? "positive" : client.salesDelta < 0 ? "negative" : ""}`}>{client.salesDelta > 0 ? <ArrowUpRight size={12}/> : client.salesDelta < 0 ? <ArrowDownRight size={12}/> : null}{client.salesDelta === 0 ? "no change vs prior 90 days" : `${client.salesDelta > 0 ? "+" : "-"}${Math.abs(client.salesDelta)}% vs prior 90 days`}</span></td>
                  <td>{client.active ? <><span className={`score-badge ${client.health}`}>{client.collectionRisk}</span><span className="cell-sub">{money(client.overdueOutstanding, true)} overdue</span></> : <span className="muted">—</span>}</td>
                  <td>{client.active ? <><span className="score-badge opportunity">{client.commercialOpportunity}</span><span className="cell-sub">priority P{client.visitPriority}</span></> : <span className="muted">—</span>}</td>
                  <td><strong>{creditTermLabel(client)}</strong><span className="cell-sub">{client.paymentSampleSize ? `${paymentDelay(client.avgPaymentDelayDays)} \u00B7 ${client.onTimePaymentRate}% on time` : client.paymentMethod}</span></td>
                  <td>{client.active ? <><strong>{shortDate(client.nextVisitAt)}</strong><span className="cell-sub">algorithmic date</span></> : <span className="muted">Outside agenda</span>}</td>
                  <td>{trendMode ? <button className={`trend-review-button ${reviewed(client.id) ? "active" : ""}`} aria-label={`${reviewed(client.id) ? "Mark as pending" : "Mark as reviewed"} a ${clientPrimaryName(client)}`} title={reviewed(client.id) ? "Return to pending" : "Mark as reviewed"} disabled={reviewPending === client.id} onClick={(event) => { event.stopPropagation(); toggleReviewed(client.id); }}><Check size={16}/></button> : <button className="icon-button"><ChevronRight size={17}/></button>}</td>
                </tr>))}
            </tbody>
          </table>
        </div>
        <div className="table-pagination"><span>Showing {number((currentPage - 1) * pageSize + (visible.length ? 1 : 0))}–{number((currentPage - 1) * pageSize + visible.length)} of {number(filtered.length)}</span><div><button className="button secondary" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><strong>{number(currentPage)} / {number(pageCount)}</strong><button className="button secondary" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button></div></div>
      </section>
    </div>);
}
