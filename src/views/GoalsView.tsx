import { useEffect, useMemo, useState } from "react";
import { Archive, Check, Clock3, CopyPlus, Database, FileDown, FileSpreadsheet, History, Plus, Save, Target, Trash2 } from "lucide-react";
import type { CommercialGoalRow, CommercialGoalsPayload, GeneralReportPayload } from "../../shared/models";
import { localizedEditableNumber } from "../../shared/localized-number";
import { SavedViewsBar } from "../components/SavedViewsBar";
import { SingleSelectFilter } from "../components/SingleSelectFilter";
import { SortButton } from "../components/SortButton";
import { money, number } from "../lib/format";
import { cycleSort, emptySort, sortItems } from "../lib/sorting";
type GoalSort = "product" | "seller" | "kilos" | "accounts" | "invoicing";
const monthLabel = (month: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
const metric = (value: number, unit: GeneralReportPayload["unit"]) => unit === "currency" ? money(value, true) : `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value)} kg`;
const optionalNumber = (value: string) => value.trim() === "" ? null : value;
function goalChangeLabel(type: CommercialGoalsPayload["changes"][number]["eventType"]) {
    return ({
        created: "Version created",
        row_created: "Goal added",
        row_updated: "Goal updated",
        row_deleted: "Goal deleted",
        activated: "Version activated",
    } as const)[type];
}
function EditableGoalRow({ row, versionId, sellers, products, onChanged, onDeleted }: {
    row: CommercialGoalRow;
    versionId: string;
    sellers: string[];
    products: string[];
    onChanged: () => void;
    onDeleted: () => void;
}) {
    const [product, setProduct] = useState(row.product);
    const [seller, setSeller] = useState(row.seller);
    const initialKilos = localizedEditableNumber(row.kilos);
    const initialAccounts = localizedEditableNumber(row.accounts, 0);
    const initialInvoicing = localizedEditableNumber(row.invoicing);
    const [kilos, setKilos] = useState(initialKilos);
    const [accounts, setAccounts] = useState(initialAccounts);
    const [invoicing, setInvoicing] = useState(initialInvoicing);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const changed = product !== row.product || seller !== row.seller || kilos !== initialKilos || accounts !== initialAccounts || invoicing !== initialInvoicing;
    const save = async () => {
        setSaving(true);
        setError("");
        const response = await fetch(`/api/admin/goals/versions/${versionId}/rows/${row.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ month: row.month, product, seller, kilos: optionalNumber(kilos), accounts: optionalNumber(accounts), invoicing: optionalNumber(invoicing), comment: "Edited from Goal Settings" }),
        });
        const payload = await response.json().catch(() => ({}));
        setSaving(false);
        if (!response.ok) {
            setError(payload.error ?? "The change could not be saved.");
            return;
        }
        onChanged();
    };
    const remove = async () => {
        if (!window.confirm("Delete this goal from the draft? The change will remain in the audit history."))
            return;
        const response = await fetch(`/api/admin/goals/versions/${versionId}/rows/${row.id}`, { method: "DELETE" });
        if (!response.ok) {
            setError("The row could not be deleted.");
            return;
        }
        onDeleted();
    };
    return <article className={changed ? "changed" : ""}><label><span>Product / view</span><input list="goal-products" value={product} onChange={(event) => setProduct(event.target.value)}/></label><label><span>Seller</span><input list="goal-sellers" value={seller} onChange={(event) => setSeller(event.target.value)}/></label><label><span>Kilos</span><input type="text" inputMode="decimal" value={kilos} onChange={(event) => setKilos(event.target.value)}/></label><label><span>Accounts</span><input type="text" inputMode="numeric" value={accounts} onChange={(event) => setAccounts(event.target.value)}/></label><label><span>Revenue</span><input type="text" inputMode="decimal" value={invoicing} onChange={(event) => setInvoicing(event.target.value)}/></label><div className="goal-row-actions"><button disabled={!changed || saving} title="Save row" onClick={save}><Save size={14}/></button><button title="Delete row" onClick={remove}><Trash2 size={14}/></button></div>{error && <small className="goal-row-error">{error}</small>}</article>;
}
export function GoalsView() {
    const [payload, setPayload] = useState<CommercialGoalsPayload | null>(null);
    const [versionId, setVersionId] = useState("");
    const [month, setMonth] = useState("");
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState(emptySort<GoalSort>());
    const [creating, setCreating] = useState(false);
    const [newVersionName, setNewVersionName] = useState("");
    const [adding, setAdding] = useState(false);
    const [newRow, setNewRow] = useState({ product: "", seller: "", kilos: "", accounts: "", invoicing: "" });
    const [reports, setReports] = useState<Array<{
        label: string;
        report: GeneralReportPayload;
    }> | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const load = (requestedVersion = versionId, requestedMonth = month) => {
        const queryParams = new URLSearchParams();
        if (requestedVersion)
            queryParams.set("versionId", requestedVersion);
        if (requestedMonth)
            queryParams.set("month", requestedMonth);
        setLoading(true);
        setError("");
        return fetch(`/api/admin/goals?${queryParams}`).then((response) => {
            if (!response.ok)
                return response.json().then((body) => Promise.reject(new Error(body.error ?? "Goals could not be loaded.")));
            return response.json();
        }).then((value: CommercialGoalsPayload) => {
            setPayload(value);
            setVersionId(value.selectedVersion.id);
            setMonth(value.selectedMonth);
            setLoading(false);
            return value;
        }).catch((cause: Error) => { setError(cause.message); setLoading(false); throw cause; });
    };
    useEffect(() => { load("", "").catch(() => undefined); }, []);
    useEffect(() => {
        if (!payload || payload.selectedVersion.status !== "active" || !payload.selectedMonth) {
            setReports(null);
            return;
        }
        Promise.all([
            ["Kilos goals", "core"], ["Strategic brands", "strategic"], ["Small retail", "autoservice"],
        ].map(async ([label, mode]) => {
            const response = await fetch(`/api/reports/general?${new URLSearchParams({ mode, month: payload.selectedMonth })}`);
            if (!response.ok)
                throw new Error("Attainment could not be calculated.");
            return { label, report: await response.json() as GeneralReportPayload };
        })).then(setReports).catch(() => setReports(null));
    }, [payload?.selectedVersion.id, payload?.selectedVersion.status, payload?.selectedMonth]);
    const changeVersion = (next: string) => { setVersionId(next); setMonth(""); load(next, "").catch(() => undefined); };
    const changeMonth = (next: string) => { setMonth(next); load(versionId, next).catch(() => undefined); };
    const createVersion = async () => {
        if (!payload || !newVersionName.trim())
            return;
        const response = await fetch("/api/admin/goals/versions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newVersionName, cloneFromId: payload.selectedVersion.id }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            setError(body.error ?? "The version could not be created.");
            return;
        }
        setCreating(false);
        setNewVersionName("");
        setVersionId(body.version.id);
        load(body.version.id, month).catch(() => undefined);
    };
    const activate = async () => {
        if (!payload || !window.confirm(`Activate \u201C${payload.selectedVersion.name}\u201D? The General Report will start using these goals and the current version will be archived.`))
            return;
        const response = await fetch(`/api/admin/goals/versions/${payload.selectedVersion.id}/activate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment: "Activation confirmed from goal administration." }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            setError(body.error ?? "The version could not be activated.");
            return;
        }
        load(payload.selectedVersion.id, month).catch(() => undefined);
    };
    const addRow = async () => {
        if (!payload)
            return;
        const response = await fetch(`/api/admin/goals/versions/${payload.selectedVersion.id}/rows`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month: payload.selectedMonth, product: newRow.product, seller: newRow.seller, kilos: optionalNumber(newRow.kilos), accounts: optionalNumber(newRow.accounts), invoicing: optionalNumber(newRow.invoicing), comment: "Goal added from Settings" }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            setError(body.error ?? "The goal could not be added.");
            return;
        }
        setAdding(false);
        setNewRow({ product: "", seller: "", kilos: "", accounts: "", invoicing: "" });
        load(versionId, month).catch(() => undefined);
    };
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    const visibleRows = useMemo(() => sortItems((payload?.rows ?? []).filter((row) => !normalizedQuery || `${row.product} ${row.seller}`.toLocaleLowerCase("es").includes(normalizedQuery)), sort, (row, key) => row[key]), [payload, normalizedQuery, sort]);
    const totals = visibleRows.reduce((sum, row) => ({ kilos: sum.kilos + Number(row.kilos ?? 0), accounts: sum.accounts + Number(row.accounts ?? 0), invoicing: sum.invoicing + Number(row.invoicing ?? 0) }), { kilos: 0, accounts: 0, invoicing: 0 });
    const direction = (key: GoalSort) => sort.key === key ? sort.direction : null;
    if (error && !payload)
        return <div className="page-view"><section className="data-card report-error"><Target size={22}/><div><h2>Goals unavailable</h2><p>{error}</p></div></section></div>;
    if (!payload)
        return <div className="page-view"><section className="data-card report-loading"><span /><h2>Preparing commercial goals…</h2><p>Loading the versioned plan and its audit trail.</p></section></div>;
    const draft = payload.selectedVersion.status === "draft";
    const versionOptions = payload.versions.map((version) => ({ value: version.id, label: `v${version.version} \u00B7 ${version.name} \u00B7 ${version.status === "active" ? "Active" : version.status === "draft" ? "Draft" : "Archived"}` }));
    const exportUrl = (format: "xlsx" | "pdf") => `/api/admin/goals/export?${new URLSearchParams({ versionId: payload.selectedVersion.id, month: payload.selectedMonth, format })}`;
    const savedFilters = { versionId: payload.selectedVersion.id, month: payload.selectedMonth, query, sortKey: sort.key ?? "", sortDirection: sort.direction ?? "" };
    const applySaved = (saved: Record<string, string>) => {
        setQuery(saved.query ?? "");
        setSort(saved.sortKey && (saved.sortDirection === "asc" || saved.sortDirection === "desc")
            ? { key: saved.sortKey as GoalSort, direction: saved.sortDirection }
            : emptySort<GoalSort>());
        load(saved.versionId || payload.selectedVersion.id, saved.month || payload.selectedMonth).catch(() => undefined);
    };
    return <div className={`page-view goals-page ${loading ? "is-loading" : ""}`} data-tour="goals-overview">
    <section className="data-card goals-header-card"><div className="data-card-header"><div><span className="section-kicker"><Target size={14}/> Versioned planning</span><h2>Versioned commercial goals</h2><p>Every edit occurs in a draft; only explicit activation changes the goals used by the General Report.</p></div><div className="admin-export-actions"><a className="button ghost compact" href={exportUrl("xlsx")}><FileSpreadsheet size={14}/> Excel</a><a className="button ghost compact" href={exportUrl("pdf")}><FileDown size={14}/> PDF</a></div></div><div className="goals-version-controls"><SingleSelectFilter label="Version" value={payload.selectedVersion.id} options={versionOptions} onChange={changeVersion}/><SingleSelectFilter label="Month" value={payload.selectedMonth} options={payload.months.map((value) => ({ value, label: monthLabel(value) }))} onChange={changeMonth}/><span className={`goal-version-status ${payload.selectedVersion.status}`}>{payload.selectedVersion.status === "active" ? <Check size={14}/> : payload.selectedVersion.status === "draft" ? <Clock3 size={14}/> : <Archive size={14}/>}{payload.selectedVersion.status === "active" ? "Active plan" : payload.selectedVersion.status === "draft" ? "Draft editable" : "Historical"}</span>{draft && <button className="button primary" onClick={activate}><Check size={15}/> Activate version</button>}<button className="button ghost" onClick={() => setCreating(true)}><CopyPlus size={15}/> New version</button></div>{creating && <div className="goal-create-version"><input autoFocus value={newVersionName} maxLength={120} placeholder="Example: August–December 2026 plan" onChange={(event) => setNewVersionName(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter")
                    createVersion();
                if (event.key === "Escape")
                    setCreating(false);
            }}/><button className="button primary compact" onClick={createVersion}>Create editable clone</button><button className="button ghost compact" onClick={() => setCreating(false)}>Cancel</button></div>}<div className="goal-version-note"><Database size={14}/><span><strong>{payload.selectedVersion.sourceLabel}</strong> · {payload.selectedVersion.rowCount} rows · created by {payload.selectedVersion.createdBy} the {new Intl.DateTimeFormat("en-GB").format(new Date(payload.selectedVersion.createdAt))}</span></div></section>
    <SavedViewsBar viewKey="goals" filters={savedFilters} onApply={applySaved}/>

    {reports && <div className="goal-compliance-grid">{reports.map(({ label, report }) => <article key={label}><small>{label}</small><strong>{metric(report.actual, report.unit)}</strong><span>of {metric(report.target, report.unit)}</span><b>{report.completion == null ? "No goal" : `${report.completion.toFixed(1)}%`}</b><div><i style={{ width: `${Math.min(100, report.completion ?? 0)}%` }}/></div></article>)}</div>}

    <section className="data-card goals-table-card"><div className="data-card-header"><div><span className="section-kicker"><Target size={14}/> {monthLabel(payload.selectedMonth)}</span><h2>Plan detail</h2><p>{draft ? "Edit rows and save each change. Everything is recorded before activation." : "This version is read-only to preserve its audit trail."}</p></div><div className="goal-table-actions"><label><input value={query} placeholder="Search products or sellers" onChange={(event) => setQuery(event.target.value)}/></label>{draft && <button className="button primary compact" onClick={() => setAdding(true)}><Plus size={14}/> Add goal</button>}</div></div><div className="goal-totals"><span><small>Kilos in visible rows</small><strong>{number(totals.kilos)}</strong></span><span><small>Accounts</small><strong>{number(totals.accounts)}</strong></span><span><small>Revenue</small><strong>{money(totals.invoicing, true)}</strong></span><span><small>Rows</small><strong>{number(visibleRows.length)}</strong></span></div><div className="goals-table"><header><SortButton label="Product / view" direction={direction("product")} onClick={() => setSort((state) => cycleSort(state, "product"))}/><SortButton label="Seller" direction={direction("seller")} onClick={() => setSort((state) => cycleSort(state, "seller"))}/><SortButton label="Kilos" direction={direction("kilos")} onClick={() => setSort((state) => cycleSort(state, "kilos"))}/><SortButton label="Accounts" direction={direction("accounts")} onClick={() => setSort((state) => cycleSort(state, "accounts"))}/><SortButton label="Revenue" direction={direction("invoicing")} onClick={() => setSort((state) => cycleSort(state, "invoicing"))}/><span /> </header>{adding && <article className="goal-new-row"><label><span>Product / view</span><input list="goal-products" value={newRow.product} onChange={(event) => setNewRow((current) => ({ ...current, product: event.target.value }))}/></label><label><span>Seller</span><input list="goal-sellers" value={newRow.seller} onChange={(event) => setNewRow((current) => ({ ...current, seller: event.target.value }))}/></label><label><span>Kilos</span><input type="text" inputMode="decimal" value={newRow.kilos} onChange={(event) => setNewRow((current) => ({ ...current, kilos: event.target.value }))}/></label><label><span>Accounts</span><input type="text" inputMode="numeric" value={newRow.accounts} onChange={(event) => setNewRow((current) => ({ ...current, accounts: event.target.value }))}/></label><label><span>Revenue</span><input type="text" inputMode="decimal" value={newRow.invoicing} onChange={(event) => setNewRow((current) => ({ ...current, invoicing: event.target.value }))}/></label><div className="goal-row-actions"><button title="Save" onClick={addRow}><Check size={14}/></button><button title="Cancel" onClick={() => setAdding(false)}><Trash2 size={14}/></button></div></article>}{draft ? visibleRows.map((row) => <EditableGoalRow key={row.id} row={row} versionId={payload.selectedVersion.id} sellers={payload.sellers} products={payload.products} onChanged={() => load(versionId, month).catch(() => undefined)} onDeleted={() => load(versionId, month).catch(() => undefined)}/>) : visibleRows.map((row) => <article className="readonly" key={row.id}><strong>{row.product || "Small retail / account"}</strong><span>{row.seller || "No seller"}</span><span>{row.kilos == null ? "\u2014" : number(row.kilos)}</span><span>{row.accounts == null ? "\u2014" : number(row.accounts)}</span><span>{row.invoicing == null ? "\u2014" : money(row.invoicing)}</span><span /></article>)}</div><datalist id="goal-products">{payload.products.map((value) => <option key={value} value={value}/>)}</datalist><datalist id="goal-sellers">{payload.sellers.map((value) => <option key={value} value={value}/>)}</datalist></section>

    <section className="data-card goal-history-card"><div className="data-card-header"><div><span className="section-kicker"><History size={14}/> Audit</span><h2>Version history</h2><p>Creations, edits, and activations are retained.</p></div><span className="count-badge">{payload.changes.length} events</span></div><div className="goal-history-list">{payload.changes.map((change) => <article key={change.id}><i className={change.eventType}/><div><strong>{goalChangeLabel(change.eventType)}</strong><span>{change.comment || change.entityKey}</span><small>{change.actor} · {new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short" }).format(new Date(change.createdAt))}</small></div></article>)}</div></section>
    {error && <div className="admin-inline-error">{error}</div>}
  </div>;
}
