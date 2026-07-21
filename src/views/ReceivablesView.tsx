import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, ClipboardList, Download, FileSpreadsheet, History, MessageSquareText, Pencil, ReceiptText, Save, Search, ShieldCheck, Trash2, UserRoundCheck, WalletCards, X, } from "lucide-react";
import type { Client, ReceivableCaseDetail, ReceivableCaseEvent, ReceivableCaseStatus, ReceivableDashboardFilters, ReceivableDashboardPayload, ReceivableDashboardRow, } from "../../shared/models";
import { localizedEditableNumber } from "../../shared/localized-number";
import { decodeMultiFilter, encodeMultiFilter } from "../../shared/multi-filter";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { SavedViewsBar } from "../components/SavedViewsBar";
import { SortButton } from "../components/SortButton";
import { clientPrimaryName, clientSecondaryName } from "../lib/client-name";
import { longDate, money, number, shortDate } from "../lib/format";
import { cycleSort, emptySort, sortItems } from "../lib/sorting";
type ReceivableSort = "name" | "seller" | "responsible" | "status" | "pendingBalance" | "overdueBalance" | "oldestOverdueDays" | "nextFollowUpAt";
interface ReceivablesViewProps {
    dataClients: Client[];
    onOpenClient: (client: Client) => void;
    onOpenSeller: (seller: string) => void;
    onOpenInvoice: (invoiceId: string) => void;
}
const statusLabels: Record<ReceivableCaseStatus, string> = {
    unmanaged: "Unmanaged",
    to_contact: "To contact",
    in_progress: "In follow-up",
    promise: "Promise recorded",
    disputed: "Under review",
    resolved: "Resolved internally",
};
const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));
const agingOptions = [
    { value: "overdue_90", label: "More than 90 days" }, { value: "overdue_61_90", label: "61\u201390 days" },
    { value: "overdue_31_60", label: "31\u201360 days" }, { value: "overdue_1_30", label: "1\u201330 days" },
    { value: "not_due", label: "Not yet due" },
];
const balanceOptions = [{ value: "overdue", label: "With overdue balance" }, { value: "not_due", label: "Not yet due only" }];
const emptyFilters: ReceivableDashboardFilters = { seller: "", paymentMethod: "", status: "", responsible: "", internalStatus: "", aging: "", query: "" };
const asRecord = (filters: ReceivableDashboardFilters): Record<string, string> => ({ ...filters });
const percent = (value: number) => `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value)}%`;
const documentCount = (value: number) => `${number(value)} ${value === 1 ? "document" : "documents"}`;
const argentinaToday = () => new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
function eventLabel(type: ReceivableCaseEvent["eventType"]) {
    return ({
        created: "Follow-up started", assignment: "Owner changed", status: "Status changed",
        follow_up: "Follow-up saved", promise: "Promise changed", comment: "Comment",
    } as const)[type];
}
function eventDescription(event: ReceivableCaseEvent) {
    if (event.comment)
        return event.comment;
    if (event.eventType === "assignment")
        return `${String(event.before?.responsible || "Unassigned")} \u2192 ${String(event.after?.responsible || "Unassigned")}`;
    if (event.eventType === "status") {
        const before = statusLabels[String(event.before?.status) as ReceivableCaseStatus] ?? "Unmanaged";
        const after = statusLabels[String(event.after?.status) as ReceivableCaseStatus] ?? "Unmanaged";
        return `${before} \u2192 ${after}`;
    }
    if (event.eventType === "follow_up" && event.after && Object.hasOwn(event.after, "status")) {
        const status = statusLabels[String(event.after.status) as ReceivableCaseStatus] ?? "Unmanaged";
        const responsible = String(event.after.responsible || "Unassigned");
        const next = event.after.nextFollowUpAt ? ` \u00B7 next ${longDate(String(event.after.nextFollowUpAt))}` : "";
        const promise = Number(event.after.promiseAmount ?? 0) > 0
            ? ` \u00B7 promise ${money(Number(event.after.promiseAmount))} for ${longDate(String(event.after.promiseDueAt || ""))}` : "";
        return `${status} \u00B7 ${responsible}${next}${promise}`;
    }
    if (event.eventType === "follow_up")
        return `${String(event.before?.nextFollowUpAt || "No date")} \u2192 ${String(event.after?.nextFollowUpAt || "No date")}`;
    if (event.eventType === "promise") {
        const amount = Number(event.after?.promiseAmount ?? 0);
        return amount ? `${money(amount)} for ${longDate(String(event.after?.promiseDueAt || ""))}` : "Promise removed from the follow-up";
    }
    return "Administrative follow-up created.";
}
function ReceivableDrawer({ row, detail, responsibles, onClose, onSaved, onOpenClient, onOpenInvoice }: {
    row: ReceivableDashboardRow;
    detail: ReceivableCaseDetail | null;
    responsibles: string[];
    onClose: () => void;
    onSaved: (detail: ReceivableCaseDetail) => void;
    onOpenClient: () => void;
    onOpenInvoice: (invoiceId: string) => void;
}) {
    const [responsible, setResponsible] = useState(row.workflow.responsible);
    const [status, setStatus] = useState<ReceivableCaseStatus>(row.workflow.status);
    const [nextFollowUpAt, setNextFollowUpAt] = useState(row.workflow.nextFollowUpAt ?? "");
    const [promiseAmount, setPromiseAmount] = useState(localizedEditableNumber(row.workflow.promiseAmount));
    const [promiseDueAt, setPromiseDueAt] = useState(row.workflow.promiseDueAt ?? "");
    const [comment, setComment] = useState("");
    const [saving, setSaving] = useState(false);
    const [deleteCandidate, setDeleteCandidate] = useState("");
    const [error, setError] = useState("");
    const save = async () => {
        setSaving(true);
        setError("");
        const response = await fetch(`/api/admin/receivables/${row.clientId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ responsible, status, nextFollowUpAt: nextFollowUpAt || null, promiseAmount, promiseDueAt, comment }),
        });
        const payload = await response.json().catch(() => ({}));
        setSaving(false);
        if (!response.ok) {
            setError(payload.error ?? "The follow-up could not be saved.");
            return;
        }
        setComment("");
        onSaved(payload.detail as ReceivableCaseDetail);
    };
    const removeEvent = async (eventId: string) => {
        if (deleteCandidate !== eventId) {
            setDeleteCandidate(eventId);
            return;
        }
        setError("");
        const response = await fetch(`/api/admin/receivables/${row.clientId}/events/${eventId}`, { method: "DELETE" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            setError(payload.error ?? "The follow-up could not be deleted.");
            return;
        }
        setDeleteCandidate("");
        onSaved(payload as ReceivableCaseDetail);
    };
    const historyEvents = detail?.events.filter((event) => event.eventType !== "status") ?? [];
    return <div className="admin-drawer-layer">
    <button className="admin-drawer-backdrop" aria-label="Close follow-up" onClick={onClose}/>
    <aside className="admin-drawer receivable-drawer">
      <header><div><span className="section-kicker"><WalletCards size={14}/> Administrative follow-up</span><h2>{clientPrimaryName(row)}</h2><p>{clientSecondaryName(row) ? `${clientSecondaryName(row)} \u00B7 ` : ""}ID {row.clientId} · {row.seller}</p></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={19}/></button></header>
      <div className="receivable-balance-hero"><div><small>Pending balance</small><strong>{money(row.pendingBalance)}</strong></div><div><small>Overdue balance</small><strong>{money(row.overdueBalance)}</strong></div><div><small>Maximum age</small><strong>{number(row.oldestOverdueDays)} days</strong></div><button className="entity-link" onClick={onOpenClient}>Open complete profile <ChevronRight size={14}/></button></div>

      <section className="receivable-workflow-form">
        <h3>Edit follow-up</h3>
        {status === "promise" && (!promiseAmount || !promiseDueAt) && <p className="promise-incomplete-note">This promise cannot appear as a payment commitment until its amount and date are added.</p>}
        <div className="form-grid">
          <label><span>Owner</span><input list={`responsibles-${row.clientId}`} value={responsible} maxLength={120} placeholder="Assign owner" onChange={(event) => setResponsible(event.target.value)}/><datalist id={`responsibles-${row.clientId}`}>{responsibles.map((value) => <option key={value} value={value}/>)}</datalist></label>
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as ReceivableCaseStatus)}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label><span>Next follow-up</span><input type="date" value={nextFollowUpAt} onChange={(event) => setNextFollowUpAt(event.target.value)}/></label>
          {status === "promise" && <><label><span>Promised amount</span><input type="text" inputMode="decimal" value={promiseAmount} placeholder="e.g. 125.000,50" onChange={(event) => setPromiseAmount(event.target.value)} required/></label><label><span>Promised date</span><input type="date" value={promiseDueAt} onChange={(event) => setPromiseDueAt(event.target.value)} required/></label></>}
        </div>
        <label className="full-field"><span>Follow-up comment</span><textarea value={comment} maxLength={2000} placeholder="What was discussed, what is missing, or why the status changed…" onChange={(event) => setComment(event.target.value)}/></label>
        {error && <small className="form-error">{error}</small>}
        <button className="button primary" disabled={saving} onClick={save}><Save size={15}/> {saving ? "Saving\u2026" : "Save follow-up"}</button>
        <p className="workflow-note">Amounts and balances come from the synthetic analytical snapshot. Internal changes are recorded with a date and owner.</p>
      </section>

      <section className="receivable-documents">
        <div className="drawer-section-title"><ReceiptText size={15}/><h3>Open documents</h3><span>{detail?.documents.length ?? row.openDocuments}</span></div>
        {detail?.documents.map((document) => <button className="receivable-document-row" key={document.documentId} onClick={() => onOpenInvoice(document.documentId)}><div><strong>{document.documentNumber}</strong><small>Issued {shortDate(document.issuedAt)} · due {shortDate(document.dueAt)}</small><small>{document.paymentMethod}</small></div><span className={document.status === "overdue" ? "overdue" : ""}>{document.status === "overdue" ? `${number(document.overdueDays)} d overdue` : "Not yet due"}</span><strong>{money(document.outstanding)}</strong><ChevronRight size={15}/></button>)}
        {!detail && <p className="drawer-loading">Loading documents…</p>}
      </section>

      <section className="receivable-history">
        <div className="drawer-section-title"><History size={15}/><h3>Follow-up history</h3><span>{historyEvents.filter((event) => !event.deletedAt).length}</span></div>
        {historyEvents.map((event) => <article key={event.id} className={event.deletedAt ? "deleted" : ""}><i className={event.eventType}/><div><strong>{eventLabel(event.eventType)}</strong><span>{eventDescription(event)}</span><small>{event.actor} · {new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.createdAt))}{event.deletedAt ? ` \u00B7 deleted by ${event.deletedBy}` : ""}</small></div>{!event.deletedAt && <button className={`history-delete ${deleteCandidate === event.id ? "confirm" : ""}`} title={deleteCandidate === event.id ? "Confirm deletion" : "Delete follow-up"} onClick={() => removeEvent(event.id)}>{deleteCandidate === event.id ? <><Trash2 size={13}/> Confirm</> : <Trash2 size={14}/>}</button>}</article>)}
        {detail && !historyEvents.length && <p className="drawer-empty">No follow-ups have been recorded yet.</p>}
      </section>
    </aside>
  </div>;
}
export function ReceivablesView({ dataClients, onOpenClient, onOpenSeller, onOpenInvoice }: ReceivablesViewProps) {
    const [filters, setFilters] = useState<ReceivableDashboardFilters>(emptyFilters);
    const [payload, setPayload] = useState<ReceivableDashboardPayload | null>(null);
    const [selected, setSelected] = useState<ReceivableDashboardRow | null>(null);
    const [detail, setDetail] = useState<ReceivableCaseDetail | null>(null);
    const [sort, setSort] = useState(emptySort<ReceivableSort>());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const reload = () => {
        const controller = new AbortController();
        setLoading(true);
        setError("");
        fetch(`/api/admin/receivables?${new URLSearchParams(asRecord(filters))}`, { signal: controller.signal }).then((response) => {
            if (!response.ok)
                throw new Error("The accounts-receivable workspace could not be opened.");
            return response.json();
        }).then((value: ReceivableDashboardPayload) => { setPayload(value); setLoading(false); }).catch((cause: Error) => {
            if (cause.name !== "AbortError") {
                setError(cause.message);
                setLoading(false);
            }
        });
        return controller;
    };
    useEffect(() => { const controller = reload(); return () => controller.abort(); }, [filters]);
    const changeFilter = <Key extends keyof ReceivableDashboardFilters>(key: Key, value: ReceivableDashboardFilters[Key]) => setFilters((current) => ({ ...current, [key]: value }));
    const openWorkflow = async (row: ReceivableDashboardRow) => {
        setSelected(row);
        setDetail(null);
        const response = await fetch(`/api/admin/receivables/${row.clientId}`);
        if (response.ok)
            setDetail(await response.json());
    };
    const saved = (nextDetail: ReceivableCaseDetail) => {
        setDetail(nextDetail);
        setSelected((current) => current && current.clientId === nextDetail.workflow.clientId ? { ...current, workflow: nextDetail.workflow } : current);
        reload();
    };
    const openProfile = (clientId: number) => {
        const client = dataClients.find((value) => value.id === clientId);
        if (client)
            onOpenClient(client);
    };
    const sorted = useMemo(() => sortItems(payload?.rows ?? [], sort, (row, key) => key === "responsible" ? row.workflow.responsible : key === "status" ? row.workflow.status : key === "nextFollowUpAt" ? row.workflow.nextFollowUpAt : row[key]), [payload, sort]);
    const direction = (key: ReceivableSort) => sort.key === key ? sort.direction : null;
    const exportUrl = (format: "csv" | "xlsx") => `/api/admin/receivables/export?${new URLSearchParams({ ...filters, format })}`;
    const applySaved = (savedFilters: Record<string, string>) => setFilters((current) => ({ ...current, ...savedFilters }));
    const today = argentinaToday();
    if (error && !payload)
        return <div className="page-view"><section className="data-card report-error"><AlertTriangle size={22}/><div><h2>Accounts Receivable unavailable</h2><p>{error}</p></div></section></div>;
    if (!payload)
        return <div className="page-view"><section className="data-card report-loading"><span /><h2>Consolidating the portfolio…</h2><p>Combining synthetic balances with local administrative follow-up.</p></section></div>;
    const activeStatuses = decodeMultiFilter(filters.internalStatus);
    const toggleStatus = (status: ReceivableCaseStatus) => changeFilter("internalStatus", activeStatuses.length === 1 && activeStatuses[0] === status ? "" : encodeMultiFilter([status]));
    return <div className={`page-view receivables-page ${loading ? "is-loading" : ""}`} data-tour="receivables-overview">
    <section className="data-card admin-filter-card">
      <div className="data-card-header"><div><span className="section-kicker"><WalletCards size={14}/> Administrative center</span><h2>Open receivables and pending work</h2><p>Balances come from the local synthetic analytical dataset; owners, promises, and follow-ups are separate human-entered information.</p></div><div className="admin-export-actions"><a className="button ghost compact" href={exportUrl("csv")}><Download size={14}/> CSV</a><a className="button ghost compact" href={exportUrl("xlsx")}><FileSpreadsheet size={14}/> Excel</a></div></div>
      <div className="receivable-filter-grid"><MultiSelectFilter label="Seller" value={filters.seller} options={payload.options.sellers} onChange={(value) => changeFilter("seller", value)}/><MultiSelectFilter label="Payment method" value={filters.paymentMethod} options={payload.options.paymentMethods} onChange={(value) => changeFilter("paymentMethod", value)}/><MultiSelectFilter label="Balance" value={filters.status} options={balanceOptions} onChange={(value) => changeFilter("status", value)}/><MultiSelectFilter label="Owner" value={filters.responsible} options={payload.options.responsibles} onChange={(value) => changeFilter("responsible", value)}/><MultiSelectFilter label="Internal status" value={filters.internalStatus} options={statusOptions} onChange={(value) => changeFilter("internalStatus", value)}/><MultiSelectFilter label="Aging" value={filters.aging} options={agingOptions} onChange={(value) => changeFilter("aging", value)}/><label className="admin-search-field"><Search size={15}/><input value={filters.query} placeholder="Customer, seller, or comment" onChange={(event) => changeFilter("query", event.target.value)}/></label><button className="button ghost" onClick={() => setFilters(emptyFilters)}>Reset</button></div>
      <SavedViewsBar viewKey="receivables" filters={asRecord(filters)} onApply={applySaved}/>
    </section>

    <div className="admin-kpi-strip receivable-kpis"><button><span><WalletCards size={19}/></span><div><small>Pending balance</small><strong>{money(payload.pendingBalance, true)}</strong><em>{documentCount(payload.openDocuments)}</em></div></button><button><span><AlertTriangle size={19}/></span><div><small>Overdue balance</small><strong>{money(payload.overdueBalance, true)}</strong><em>{percent(payload.overdueShare)} of the portfolio</em></div></button><button><span><CalendarClock size={19}/></span><div><small>Follow-ups due</small><strong>{number(payload.dueFollowUps)}</strong><em>Through today</em></div></button><button><span><UserRoundCheck size={19}/></span><div><small>Unmanaged</small><strong>{number(payload.unmanagedClients)}</strong><em>Of {number(payload.clientsWithBalance)} accounts</em></div></button><button><span><CheckCircle2 size={19}/></span><div><small>Customers overdue</small><strong>{number(payload.overdueClients)}</strong><em>{documentCount(payload.overdueDocuments)}</em></div></button></div>

    <div className="receivable-summary-grid">
      <section className="data-card"><div className="data-card-header"><div><span className="section-kicker"><CalendarClock size={14}/> Aging</span><h2>Composition of the portfolio</h2></div></div><div className="receivable-aging">{payload.aging.map((row) => <article key={row.key}><div><strong>{row.label}</strong><span>{documentCount(row.documents)}</span></div><div className="aging-track"><i style={{ width: `${Math.min(100, row.share)}%` }}/></div><b>{money(row.amount)}</b></article>)}</div></section>
      <section className="data-card"><div className="data-card-header"><div><span className="section-kicker"><ClipboardList size={14}/> Internal workflow</span><h2>Filter by status</h2><p>Choose a status to filter the work queue.</p></div></div><div className="receivable-status-grid">{payload.statusBreakdown.map((row) => <button key={row.status} className={`${row.status} ${activeStatuses.includes(row.status) ? "active" : ""}`} aria-pressed={activeStatuses.includes(row.status)} onClick={() => toggleStatus(row.status)}><span>{statusLabels[row.status]}</span><strong>{number(row.clients)}</strong><small>{money(row.amount, true)}</small></button>)}</div></section>
    </div>

    <section className="data-card receivable-table-card"><div className="data-card-header"><div><span className="section-kicker"><MessageSquareText size={14}/> Work queue</span><h2>Accounts Receivable</h2><p>The company name opens the customer; the pencil edits the follow-up.</p></div><span className="count-badge">{number(payload.rows.length)} accounts</span></div><div className="admin-table receivables"><header><SortButton label="Customer" direction={direction("name")} onClick={() => setSort((state) => cycleSort(state, "name"))}/><SortButton label="Seller" direction={direction("seller")} onClick={() => setSort((state) => cycleSort(state, "seller"))}/><SortButton label="Owner / status" direction={direction("responsible")} onClick={() => setSort((state) => cycleSort(state, "responsible"))}/><SortButton label="Pending" direction={direction("pendingBalance")} onClick={() => setSort((state) => cycleSort(state, "pendingBalance"))}/><SortButton label="Overdue" direction={direction("overdueBalance")} onClick={() => setSort((state) => cycleSort(state, "overdueBalance"))}/><SortButton label="Aging" direction={direction("oldestOverdueDays")} onClick={() => setSort((state) => cycleSort(state, "oldestOverdueDays"))}/><SortButton label="Next follow-up" direction={direction("nextFollowUpAt")} onClick={() => setSort((state) => cycleSort(state, "nextFollowUpAt"))}/><span>Edit</span></header>{sorted.map((row) => <article key={row.clientId} className={row.workflow.nextFollowUpAt && row.workflow.nextFollowUpAt <= today && row.workflow.status !== "resolved" ? "follow-up-due" : ""}><button className="admin-drill-entity" onClick={() => openProfile(row.clientId)}><strong>{clientPrimaryName(row)}</strong><small>{clientSecondaryName(row) ? `${clientSecondaryName(row)} \u00B7 ` : ""}ID {row.clientId} · {row.paymentMethod} · {documentCount(row.openDocuments)}</small></button><button className="entity-link" onClick={() => onOpenSeller(row.seller)}>{row.seller}</button><div className="workflow-cell"><strong>{row.workflow.responsible || "Unassigned"}</strong><span className={`status-pill ${row.workflow.status}`}>{statusLabels[row.workflow.status]}</span>{row.workflow.status === "promise" && row.workflow.promiseAmount && <small>{money(row.workflow.promiseAmount)} · {longDate(row.workflow.promiseDueAt ?? "")}</small>}{row.workflow.status === "promise" && !row.workflow.promiseAmount && <small className="promise-incomplete-inline">Add amount and date</small>}{row.workflow.lastComment && <small>{row.workflow.lastComment}</small>}</div><span>{money(row.pendingBalance)}</span><span className="overdue-value">{money(row.overdueBalance)}<small>{percent(row.overdueShare)}</small></span><span>{row.oldestOverdueDays ? `${number(row.oldestOverdueDays)} days` : "Not yet due"}</span><span>{row.workflow.nextFollowUpAt ? longDate(row.workflow.nextFollowUpAt) : "No date"}</span><button className="icon-button edit-workflow-button" aria-label={`Edit follow-up of ${clientPrimaryName(row)}`} onClick={() => openWorkflow(row)}><Pencil size={15}/></button></article>)}</div></section>
    <section className="general-source-note"><ShieldCheck size={18}/><div><strong>Separation of responsibilities</strong><span>Amounts and due dates come from the synthetic local snapshot dated {payload.sourceMaxDate}. The internal workflow lives in `operations.sqlite` and remains separate from regenerated analytics.</span><small>“Resolved internally” closes only the local follow-up; it does not alter the analytical balance.</small></div></section>
    {selected && <ReceivableDrawer key={selected.clientId} row={selected} detail={detail} responsibles={payload.options.responsibles} onClose={() => { setSelected(null); setDetail(null); }} onSaved={saved} onOpenClient={() => { const clientId = selected.clientId; setSelected(null); setDetail(null); openProfile(clientId); }} onOpenInvoice={onOpenInvoice}/>}
  </div>;
}
