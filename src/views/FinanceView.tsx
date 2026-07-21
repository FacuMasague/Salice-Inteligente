import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, CircleDollarSign, Search } from "lucide-react";
import type { Client, Invoice } from "../../shared/models";
import { decodeMultiFilter, encodeMultiFilter, matchesMultiFilter } from "../../shared/multi-filter";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { SavedViewsBar } from "../components/SavedViewsBar";
import { SortButton } from "../components/SortButton";
import { clientPrimaryName, clientSecondaryName } from "../lib/client-name";
import { compactDate, creditTermDetail, creditTermLabel, money, number, paymentDelay } from "../lib/format";
import { cycleSort, emptySort, sortItems } from "../lib/sorting";
interface InvoiceWithClient extends Invoice {
    client: Client;
    overdueDays: number;
    daysToDue: number;
}
type Aging = "due_0_7" | "due_8_30" | "due_31_60" | "due_61_plus" | "overdue_1_7" | "overdue_8_30" | "overdue_31_90" | "overdue_91_plus";
type FinanceSortKey = "status" | "client" | "invoice" | "issuedAt" | "dueAt" | "term" | "outstanding" | "age" | "behavior" | "risk";
const daysBetween = (from: string, to: string) => Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000);
export function FinanceView({ clients, onOpen, onOpenSeller, onOpenInvoice, snapshotDate }: {
    clients: Client[];
    onOpen: (client: Client) => void;
    onOpenSeller: (seller: string) => void;
    onOpenInvoice: (invoiceId: string) => void;
    snapshotDate: string;
}) {
    const pageSize = 50;
    const [page, setPage] = useState(1);
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState("");
    const [seller, setSeller] = useState("");
    const [portfolio, setPortfolio] = useState("");
    const [aging, setAging] = useState("");
    const [creditTerm, setCreditTerm] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("");
    const [tableSort, setTableSort] = useState(emptySort<FinanceSortKey>());
    const activeClients = useMemo(() => clients.filter((client) => client.active), [clients]);
    const sellers = useMemo(() => [...new Set(activeClients.map((client) => client.seller))].sort((a, b) => a.localeCompare(b, "en")), [activeClients]);
    const paymentMethods = useMemo(() => [...new Set(activeClients.flatMap((client) => client.invoices.map((invoice) => invoice.paymentMethod || client.paymentMethod)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en")), [activeClients]);
    const invoices: InvoiceWithClient[] = activeClients.flatMap((client) => client.invoices
        .filter((invoice) => invoice.outstanding > 0)
        .map((invoice) => {
        const daysToDue = daysBetween(snapshotDate, invoice.dueAt);
        return { ...invoice, client, daysToDue, overdueDays: Math.max(0, -daysToDue) };
    }));
    const agingKey = (invoice: InvoiceWithClient): Aging => invoice.daysToDue >= 0
        ? invoice.daysToDue <= 7 ? "due_0_7" : invoice.daysToDue <= 30 ? "due_8_30" : invoice.daysToDue <= 60 ? "due_31_60" : "due_61_plus"
        : invoice.overdueDays <= 7 ? "overdue_1_7" : invoice.overdueDays <= 30 ? "overdue_8_30" : invoice.overdueDays <= 90 ? "overdue_31_90" : "overdue_91_plus";
    const matchesAging = (invoice: InvoiceWithClient) => matchesMultiFilter(agingKey(invoice), aging);
    const baseFiltered = invoices
        .filter((invoice) => matchesMultiFilter(invoice.status, status))
        .filter((invoice) => matchesMultiFilter(invoice.client.seller, seller))
        .filter((invoice) => matchesMultiFilter(invoice.client.portfolioStatus, portfolio))
        .filter((invoice) => matchesMultiFilter(invoice.client.creditTermStatus, creditTerm))
        .filter((invoice) => matchesMultiFilter(invoice.paymentMethod || invoice.client.paymentMethod, paymentMethod))
        .filter((invoice) => `${invoice.client.name} ${invoice.client.tradeName} ${invoice.client.reference} ${invoice.number} ${invoice.client.seller} ${invoice.paymentMethod || invoice.client.paymentMethod}`.toLowerCase().includes(query.trim().toLowerCase()));
    const originallySorted = baseFiltered
        .filter(matchesAging)
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || b.outstanding - a.outstanding);
    const filtered = sortItems(originallySorted, tableSort, (invoice, key) => {
        if (key === "status")
            return invoice.status === "open" ? 0 : invoice.status === "due_soon" ? 1 : 2;
        if (key === "client")
            return clientPrimaryName(invoice.client);
        if (key === "invoice")
            return invoice.number;
        if (key === "issuedAt")
            return invoice.issuedAt;
        if (key === "dueAt")
            return invoice.dueAt;
        if (key === "term")
            return invoice.creditTermDays;
        if (key === "outstanding")
            return invoice.outstanding;
        if (key === "age")
            return -invoice.daysToDue;
        if (key === "behavior")
            return invoice.client.avgPaymentDelayDays;
        return invoice.client.collectionRisk;
    });
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(page, pageCount);
    const visibleInvoices = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const overdue = filtered.filter((invoice) => invoice.status === "overdue");
    const dueSoon = filtered.filter((invoice) => invoice.status === "due_soon");
    const total = filtered.reduce((sum, invoice) => sum + invoice.outstanding, 0);
    const behaviorClients = [...new Map(filtered.map((invoice) => [invoice.client.id, invoice.client])).values()];
    const paymentSamples = behaviorClients.reduce((sum, client) => sum + client.paymentSampleSize, 0);
    const onTimeRate = paymentSamples ? Math.round(behaviorClients.reduce((sum, client) => sum + client.onTimePaymentRate * client.paymentSampleSize, 0) / paymentSamples) : 0;
    const agingBands = [
        { key: "due_0_7" as Aging, group: "due" as const, label: "Due today\u20137 days" },
        { key: "due_8_30" as Aging, group: "due" as const, label: "Due in 8\u201330 days" },
        { key: "due_31_60" as Aging, group: "due" as const, label: "Due in 31\u201360 days" },
        { key: "due_61_plus" as Aging, group: "due" as const, label: "Due in more than 60 days" },
        { key: "overdue_1_7" as Aging, group: "overdue" as const, label: "Overdue 1\u20137 days" },
        { key: "overdue_8_30" as Aging, group: "overdue" as const, label: "Overdue 8\u201330 days" },
        { key: "overdue_31_90" as Aging, group: "overdue" as const, label: "Overdue 31\u201390 days" },
        { key: "overdue_91_plus" as Aging, group: "overdue" as const, label: "Overdue more than 90 days" },
    ].map((band) => {
        const matches = baseFiltered.filter((invoice) => agingKey(invoice) === band.key);
        return { ...band, count: matches.length, amount: matches.reduce((sum, invoice) => sum + invoice.outstanding, 0) };
    });
    const dueBands = agingBands.filter((band) => band.group === "due");
    const overdueBands = agingBands.filter((band) => band.group === "overdue");
    const maxDueAmount = Math.max(...dueBands.map((band) => band.amount), 1);
    const maxOverdueAmount = Math.max(...overdueBands.map((band) => band.amount), 1);
    const resetPage = () => setPage(1);
    const direction = (key: FinanceSortKey) => tableSort.key === key ? tableSort.direction : null;
    const ariaSort = (key: FinanceSortKey): "ascending" | "descending" | "none" => direction(key) === "asc" ? "ascending" : direction(key) === "desc" ? "descending" : "none";
    const changeTableSort = (key: FinanceSortKey) => { setTableSort((current) => cycleSort(current, key)); resetPage(); };
    const toggleAging = (key: Aging) => {
        const selected = decodeMultiFilter(aging);
        setAging(encodeMultiFilter(selected.includes(key) ? selected.filter((value) => value !== key) : [...selected, key]));
        resetPage();
    };
    const savedFilters = { query, status, seller, portfolio, aging, creditTerm, paymentMethod };
    const applySaved = (saved: Record<string, string>) => {
        setQuery(saved.query ?? "");
        setStatus(saved.status ?? "");
        setSeller(saved.seller ?? "");
        setPortfolio(saved.portfolio ?? "");
        setAging(saved.aging ?? "");
        setCreditTerm(saved.creditTerm ?? "");
        setPaymentMethod(saved.paymentMethod ?? "");
        resetPage();
    };
    return (<div className="page-view finance-page">
      <div className="finance-summary" data-tour="finance-summary">
        <article className="summary-card danger"><AlertTriangle size={21}/><div><span>Filtered overdue</span><strong>{money(overdue.reduce((sum, item) => sum + item.outstanding, 0), true)}</strong><small>{number(overdue.length)} documents</small></div></article>
        <article className="summary-card warning"><CalendarClock size={21}/><div><span>Due in 7 days</span><strong>{money(dueSoon.reduce((sum, item) => sum + item.outstanding, 0), true)}</strong><small>{number(dueSoon.length)} documents</small></div></article>
        <article className="summary-card"><CircleDollarSign size={21}/><div><span>Filtered open portfolio</span><strong>{money(total, true)}</strong><small>{number(filtered.length)} documents</small></div></article>
        <article className="summary-card success"><CheckCircle2 size={21}/><div><span>On-time payments</span><strong>{paymentSamples ? `${onTimeRate}%` : "No data"}</strong><small>{number(paymentSamples)} invoices with reconciled due dates</small></div></article>
      </div>

      <div className="finance-filter-bar">
        <label className="large-search"><Search size={17}/><input value={query} onChange={(event) => { setQuery(event.target.value); resetPage(); }} placeholder="Search customer or document…"/></label>
        <MultiSelectFilter label="Status" value={status} options={[{ value: "overdue", label: "Overdue" }, { value: "due_soon", label: "Due soon" }, { value: "open", label: "Open" }]} onChange={(value) => { setStatus(value); resetPage(); }}/>
        <MultiSelectFilter label="Due date" value={aging} options={agingBands.map((band) => ({ value: band.key, label: band.label }))} onChange={(value) => { setAging(value); resetPage(); }}/>
        <MultiSelectFilter label="Seller" value={seller} options={sellers} onChange={(value) => { setSeller(value); resetPage(); }}/>
        <MultiSelectFilter label="Portfolio" value={portfolio} options={[{ value: "confirmed", label: "Confirmed" }, { value: "review", label: "Needs review" }]} onChange={(value) => { setPortfolio(value); resetPage(); }}/>
        <MultiSelectFilter label="Observed term" value={creditTerm} options={[{ value: "consistent", label: "Consistent" }, { value: "predominant", label: "Predominant" }, { value: "mixed", label: "Mixed terms" }, { value: "single", label: "One invoice" }, { value: "unavailable", label: "No sample" }]} onChange={(value) => { setCreditTerm(value); resetPage(); }}/>
        <MultiSelectFilter label="Payment method invoice" value={paymentMethod} options={paymentMethods} onChange={(value) => { setPaymentMethod(value); resetPage(); }}/>
      </div>
      <SavedViewsBar viewKey="finance" filters={savedFilters} onApply={applySaved}/>

      <section className="data-card aging-card">
        <div className="data-card-header"><div><span className="section-kicker">Account due dates</span><h2>Before and after due date</h2><p>Combine multiple bands. Time remaining appears first, followed by overdue age.</p></div><button className="button secondary" onClick={() => setAging("")}>View all</button></div>
        <div className="aging-section due"><div className="aging-section-title"><strong>Time until due</strong><span>Documents not yet due</span></div><div className="aging-bars">{dueBands.map((band) => <button key={band.key} className={decodeMultiFilter(aging).includes(band.key) ? "active" : ""} aria-pressed={decodeMultiFilter(aging).includes(band.key)} onClick={() => toggleAging(band.key)}><span>{band.label}</span><div><i style={{ width: `${band.amount / maxDueAmount * 100}%` }}/></div><strong>{money(band.amount, true)}</strong><small>{number(band.count)} docs</small></button>)}</div></div>
        <div className="aging-section overdue"><div className="aging-section-title"><strong>Time since due date</strong><span>Documents requiring collection</span></div><div className="aging-bars">{overdueBands.map((band) => <button key={band.key} className={decodeMultiFilter(aging).includes(band.key) ? "active" : ""} aria-pressed={decodeMultiFilter(aging).includes(band.key)} onClick={() => toggleAging(band.key)}><span>{band.label}</span><div><i style={{ width: `${band.amount / maxOverdueAmount * 100}%` }}/></div><strong>{money(band.amount, true)}</strong><small>{number(band.count)} docs.</small></button>)}</div></div>
      </section>

      <section className="data-card">
        <div className="data-card-header"><div><span className="section-kicker">Current account</span><h2>Collections queue</h2><p>The displayed balance is the document’s current outstanding amount, not its original amount.</p></div><span className="count-badge">{number(filtered.length)} results</span></div>
        <div className="table-wrap">
          <table className="data-table finance-table">
            <thead><tr><th aria-sort={ariaSort("status")}><SortButton label="Status" direction={direction("status")} onClick={() => changeTableSort("status")}/></th><th aria-sort={ariaSort("client")}><SortButton label="Customer" direction={direction("client")} onClick={() => changeTableSort("client")}/></th><th aria-sort={ariaSort("invoice")}><SortButton label="Document" direction={direction("invoice")} onClick={() => changeTableSort("invoice")}/></th><th aria-sort={ariaSort("issuedAt")}><SortButton label="Purchase / issue" direction={direction("issuedAt")} onClick={() => changeTableSort("issuedAt")}/></th><th aria-sort={ariaSort("dueAt")}><SortButton label="Due date" direction={direction("dueAt")} onClick={() => changeTableSort("dueAt")}/></th><th aria-sort={ariaSort("term")}><SortButton label="Invoice term" direction={direction("term")} onClick={() => changeTableSort("term")}/></th><th aria-sort={ariaSort("outstanding")}><SortButton label="Pending balance" direction={direction("outstanding")} onClick={() => changeTableSort("outstanding")}/></th><th aria-sort={ariaSort("age")}><SortButton label="Age" direction={direction("age")} onClick={() => changeTableSort("age")}/></th><th aria-sort={ariaSort("behavior")}><SortButton label="Account / behavior" direction={direction("behavior")} onClick={() => changeTableSort("behavior")}/></th><th aria-sort={ariaSort("risk")}><SortButton label="Risk" direction={direction("risk")} onClick={() => changeTableSort("risk")}/></th><th /></tr></thead>
            <tbody>
              {visibleInvoices.map((invoice) => <tr key={invoice.id} onClick={() => onOpenInvoice(invoice.id)}>
                <td><span className={`invoice-pill ${invoice.status}`}>{invoice.status === "overdue" ? "Overdue" : invoice.status === "due_soon" ? "Due soon" : "Open"}</span></td>
                <td><button className="entity-link" onClick={(event) => { event.stopPropagation(); onOpen(invoice.client); }}><strong>{clientPrimaryName(invoice.client)}</strong></button>{clientSecondaryName(invoice.client) && <span className="cell-sub client-trade-name">{clientSecondaryName(invoice.client)}</span>}<span className="cell-sub"><button className="entity-link" onClick={(event) => { event.stopPropagation(); onOpenSeller(invoice.client.seller); }}>{invoice.client.seller}</button> · {invoice.client.active ? "Active" : "Inactive"}</span></td>
                <td><strong className="normal-weight">{invoice.number}</strong></td>
                <td>{compactDate(invoice.issuedAt)}</td><td><strong>{compactDate(invoice.dueAt)}</strong></td>
                <td><strong>{invoice.creditTermDays != null ? `${invoice.creditTermDays} days` : "No data"}</strong><span className="cell-sub">purchase/issue → due date</span></td>
                <td><strong>{money(invoice.outstanding)}</strong><span className="cell-sub">original {money(invoice.amount, true)}</span></td>
                <td><strong>{invoice.daysToDue >= 0 ? invoice.daysToDue === 0 ? "Due today" : `${number(invoice.daysToDue)} days until due` : `${number(invoice.overdueDays)} days overdue`}</strong></td>
                <td title={creditTermDetail(invoice.client)}><strong>{creditTermLabel(invoice.client)}</strong><span className="cell-sub">{invoice.paymentMethod || "Payment terms unavailable"}</span><span className="cell-sub">{invoice.client.paymentSampleSize ? `${paymentDelay(invoice.client.avgPaymentDelayDays)} \u00B7 ${invoice.client.onTimePaymentRate}% on time` : "no reconciled sample"}</span></td>
                <td><span className={`score-badge ${invoice.client.health}`}>{invoice.client.collectionRisk}</span></td>
                <td><button className="icon-button" aria-label={`Open ${clientPrimaryName(invoice.client)}`}><ChevronRight size={17}/></button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="table-pagination"><span>Showing {number((currentPage - 1) * pageSize + (visibleInvoices.length ? 1 : 0))}–{number((currentPage - 1) * pageSize + visibleInvoices.length)} of {number(filtered.length)}</span><div><button className="button secondary" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><strong>{number(currentPage)} / {number(pageCount)}</strong><button className="button secondary" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button></div></div>
      </section>
    </div>);
}
