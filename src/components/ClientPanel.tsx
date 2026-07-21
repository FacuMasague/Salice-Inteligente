import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CalendarDays, Check, ChevronRight, CircleDollarSign, ClipboardCheck, Clock3, Mail, MapPin, Maximize2, Package, Phone, Route, Save, Sparkles, TrendingDown, TrendingUp, WalletCards, X } from "lucide-react";
import type { Client, CommercialActivity, PaymentPromise, Product, ReceivableCaseEvent, Recommendation } from "../../shared/models";
import { clientInitials, clientPrimaryName, clientSecondaryName } from "../lib/client-name";
import { compactDate, creditTermDetail, creditTermLabel, longDate, money, paymentDelay, shortDate } from "../lib/format";
const healthLabel = { healthy: "Low risk", attention: "Attention", critical: "High risk" } as const;
const invoiceLabel = { paid: "Paid", open: "Open", due_soon: "Due soon", overdue: "Overdue" } as const;
interface ClientPanelProps {
    client: Client;
    products: Product[];
    onClose: () => void;
    onPlanRoute: (clientId: number) => void;
    onNoteSaved: (clientId: number, note: string) => void;
    mode?: "compact" | "full";
    snapshotDate?: string;
    onExpand?: () => void;
    onOpenSeller?: (seller: string) => void;
    onOpenProduct?: (product: Product) => void;
    onOpenInvoice?: (invoiceId: string) => void;
}
const receivableEventLabels: Record<ReceivableCaseEvent["eventType"], string> = {
    created: "Follow-up started", assignment: "Owner assigned", status: "Status updated",
    follow_up: "Follow-up saved", promise: "Promise recorded", comment: "Collection comment",
};
function ClientProfileCharts({ client, snapshotDate }: {
    client: Client;
    snapshotDate: string;
}) {
    const anchor = new Date(snapshotDate);
    const monthLabels = Array.from({ length: 6 }, (_, index) => new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
        .format(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 5 + index, 1))).replace(".", ""));
    const maxSales = Math.max(1, ...client.salesTrend);
    const delays = client.paymentDelayTrend;
    const maxDelay = Math.max(1, ...delays.map((value) => Math.abs(value)));
    return <section className="client-profile-analytics">
    <div className="client-financial-kpis">
      <article><span>Average payment from issue</span><strong>{client.paymentSampleSize ? `${client.avgPaymentDays} days` : "No sample"}</strong><small>{client.paymentSampleSize} reconciled invoices</small></article>
      <article><span>Payment vs due date</span><strong>{client.paymentSampleSize ? paymentDelay(client.avgPaymentDelayDays) : "No sample"}</strong><small>{client.onTimePaymentRate}% paid on time</small></article>
      <article><span>Typical account term</span><strong>{creditTermLabel(client)}</strong><small>{client.creditTermSampleSize ? `${client.creditTermSampleSize} observed invoices` : client.paymentMethod}</small></article>
      <article><span>Current overdue balance</span><strong>{money(client.overdueOutstanding, true)}</strong><small>{client.oldestOverdueDays ? `${client.oldestOverdueDays} days maximum age` : "No overdue documents"}</small></article>
    </div>
    <div className="client-profile-chart-grid">
      <article className="client-profile-chart"><header><div><span className="section-kicker"><BarChart3 size={14}/> Commercial trend</span><h3>Monthly purchases · 6 months</h3></div><strong>{money(client.salesTrend.reduce((sum, value) => sum + value, 0), true)}</strong></header><div className="client-sales-bars">{client.salesTrend.map((value, index) => <div key={`${monthLabels[index]}-${index}`} title={`${monthLabels[index]}: ${money(value)}`}><span><i style={{ height: `${Math.max(2, value / maxSales * 100)}%` }}/></span><strong>{monthLabels[index]}</strong><small>{money(value, true)}</small></div>)}</div></article>
      <article className="client-profile-chart"><header><div><span className="section-kicker"><Clock3 size={14}/> Payment behavior</span><h3>Days vs due date · latest invoices</h3></div><strong>{client.paymentSampleSize ? paymentDelay(client.avgPaymentDelayDays) : "No sample"}</strong></header>{delays.length ? <div className="client-delay-chart">{delays.map((value, index) => <div key={`${value}-${index}`} title={`${value > 0 ? `${value} days late` : value < 0 ? `${Math.abs(value)} days early` : "On time"}`}><span className="delay-positive"><i style={{ height: value > 0 ? `${Math.max(3, value / maxDelay * 100)}%` : 0 }}/></span><b /><span className="delay-negative"><i style={{ height: value < 0 ? `${Math.max(3, Math.abs(value) / maxDelay * 100)}%` : 0 }}/></span><small>{index + 1}</small></div>)}</div> : <div className="client-chart-empty">Not enough reconciled payments to draw a trend.</div>}<footer><span><i className="early"/>Before due date</span><span><i className="late"/>After due date</span></footer></article>
    </div>
  </section>;
}
export function ClientPanel({ client, products, onClose, onPlanRoute, onNoteSaved, mode = "compact", snapshotDate = new Date().toISOString(), onExpand, onOpenSeller, onOpenProduct, onOpenInvoice }: ClientPanelProps) {
    const [tab, setTab] = useState<"summary" | "purchases" | "account" | "operations">("summary");
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [recommendationLoading, setRecommendationLoading] = useState(false);
    const [recommendationError, setRecommendationError] = useState("");
    const [note, setNote] = useState(client.note);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [activities, setActivities] = useState<CommercialActivity[]>([]);
    const [promises, setPromises] = useState<PaymentPromise[]>([]);
    const [receivableEvents, setReceivableEvents] = useState<ReceivableCaseEvent[]>([]);
    useEffect(() => {
        setTab("summary");
        setNote(client.note);
        setSaved(false);
        setRecommendations([]);
        setRecommendationError("");
        setActivities([]);
        setPromises([]);
        setReceivableEvents([]);
        const controller = new AbortController();
        fetch(`/api/clients/${client.id}/operations`, { signal: controller.signal })
            .then((response) => response.json())
            .then((payload) => { setActivities(payload.activities || []); setPromises(payload.promises || []); setReceivableEvents(payload.receivableEvents || []); })
            .catch((error: Error) => {
            if (error.name !== "AbortError") {
                setActivities([]);
                setPromises([]);
                setReceivableEvents([]);
            }
        });
        if (!client.active) {
            setRecommendationLoading(false);
            return () => controller.abort();
        }
        setRecommendationLoading(true);
        fetch(`/api/clients/${client.id}/recommendations`, { signal: controller.signal })
            .then((response) => {
            if (!response.ok)
                throw new Error("Recommendations could not be calculated");
            return response.json();
        })
            .then((payload) => setRecommendations(payload.recommendations || []))
            .catch((error: Error) => {
            if (error.name !== "AbortError")
                setRecommendationError("Recommendations could not be calculated.");
        })
            .finally(() => {
            if (!controller.signal.aborted)
                setRecommendationLoading(false);
        });
        return () => controller.abort();
    }, [client.id, client.active]);
    const purchased = useMemo(() => {
        const grouped = new Map<string, {
            product: Product;
            quantity: number;
            total: number;
            lastDate: string;
        }>();
        client.purchases.forEach((purchase) => {
            const product = products.find((item) => item.id === purchase.productId);
            if (!product)
                return;
            const current = grouped.get(product.id) || { product, quantity: 0, total: 0, lastDate: purchase.date };
            current.quantity += purchase.quantity;
            current.total += purchase.total;
            if (purchase.date > current.lastDate)
                current.lastDate = purchase.date;
            grouped.set(product.id, current);
        });
        return [...grouped.values()].sort((a, b) => b.total - a.total);
    }, [client.purchases, products]);
    const saveNote = async () => {
        setSaving(true);
        setSaved(false);
        setSaveError("");
        try {
            const response = await fetch(`/api/clients/${client.id}/note`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ note }),
            });
            if (!response.ok)
                throw new Error("The note could not be saved");
            onNoteSaved(client.id, note);
            setSaved(true);
        }
        catch {
            setSaveError("The note could not be saved. The previous note remains intact.");
        }
        finally {
            setSaving(false);
        }
    };
    const utilization = client.creditLimit ? Math.round(Math.max(0, client.balance) / client.creditLimit * 100) : 0;
    const openInvoices = client.invoices.filter((invoice) => invoice.outstanding > 0);
    const activeReceivableEvents = receivableEvents.filter((event) => !event.deletedAt && event.eventType !== "status");
    return (<aside className={`client-panel ${mode === "full" ? "client-profile" : "client-panel-compact"}`} data-tour="client-panel" aria-label={`${clientPrimaryName(client)} profile`}>
      <div className="client-panel-header">
        <div className="client-panel-actions">{mode === "compact" && onExpand && <button className="icon-button" onClick={onExpand} aria-label="Expand full profile" title="Open full profile"><Maximize2 size={17}/></button>}<button className="icon-button" onClick={onClose} aria-label="Close profile"><X size={18}/></button></div>
        <div className="client-avatar">{clientInitials(client)}</div>
        <div className="client-title-block">
          <div className="eyebrow">{client.reference} · {client.segment}</div>
          <h2>{clientPrimaryName(client)}</h2>
          {clientSecondaryName(client) && <span className="client-profile-trade-name">{clientSecondaryName(client)}</span>}
          <p><MapPin size={14}/> {client.address}, {client.locality}</p>
        </div>
        <div className="client-header-statuses"><span className={`source-status-badge ${client.active ? "active" : "inactive"}`}>{client.active ? "Active" : "Inactive"}</span><span className={`portfolio-badge ${client.portfolioStatus}`}>{client.portfolioStatus === "confirmed" ? "Portfolio confirmed" : "Review portfolio"}</span>{client.active && <span className={`health-badge ${client.health}`}>{healthLabel[client.health]}</span>}</div>
      </div>

      <div className="client-contact-row">
        {client.phone ? <a href={`tel:${client.phone}`}><Phone size={15}/> {client.phone}</a> : <span><Phone size={15}/> No phone</span>}
        {client.email ? <a href={`mailto:${client.email}`}><Mail size={15}/> Email</a> : <span><Mail size={15}/> No email</span>}
        {onOpenSeller ? <button className="client-seller-link" onClick={() => onOpenSeller(client.seller)}><span className="seller-dot"/> {client.seller}<ChevronRight size={13}/></button> : <span><span className="seller-dot"/> {client.seller}</span>}
      </div>

      <div className="panel-tabs" role="tablist">
        <button className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>Summary</button>
        <button className={tab === "purchases" ? "active" : ""} onClick={() => setTab("purchases")}>Purchases</button>
        <button className={tab === "account" ? "active" : ""} onClick={() => setTab("account")}>Account</button>
        <button className={tab === "operations" ? "active" : ""} onClick={() => setTab("operations")}>Activities</button>
      </div>

      <div className="client-panel-body">
        {tab === "summary" && (<>
            {!client.active && <div className="inactive-client-notice"><AlertTriangle size={19}/><div><strong>Outside the active portfolio</strong><span>Retained for historical consultation; last catalog status update: {longDate(client.statusUpdatedAt)}.</span></div></div>}
            {client.active && client.portfolioStatus === "review" && <div className="portfolio-review-notice"><AlertTriangle size={18}/><div><strong>Portfolio membership needs review</strong><span>The account remains visible until a human confirms the portfolio assignment.</span></div></div>}
            {client.salesBlocked && <div className="sales-block-notice"><AlertTriangle size={18}/><div><strong>Sales hold recorded</strong><span>Validate the operational reason before accepting an order.</span></div></div>}
            <section className="metric-grid three">
              <article className="mini-metric">
                <span>90-day sales</span>
                <strong>{money(client.sales90d, true)}</strong>
                <small className={client.salesDelta >= 0 ? "positive" : "negative"}>
                  {client.salesDelta >= 0 ? <TrendingUp size={13}/> : <TrendingDown size={13}/>} {Math.abs(client.salesDelta)}% vs previous period
                </small>
              </article>
              <article className="mini-metric">
                <span>Collection risk</span>
                <strong>C{client.collectionRisk}</strong>
                <small>{money(client.overdueOutstanding, true)} overdue · {client.oldestOverdueDays || 0} days max</small>
              </article>
              <article className="mini-metric">
                <span>Commercial opportunity</span>
                <strong>O{client.commercialOpportunity}</strong>
                <small>P{client.visitPriority} combined priority</small>
              </article>
            </section>

            {mode === "full" && <ClientProfileCharts client={client} snapshotDate={snapshotDate}/>}

            {client.active && client.health !== "healthy" && (<div className={`attention-card ${client.health}`}>
                <AlertTriangle size={19}/>
                <div>
                  <strong>{client.health === "critical" ? "Review collections before selling" : "Collection follow-up recommended"}</strong>
                  <span>{openInvoices.some((invoice) => invoice.status === "overdue") ? `${money(client.overdueOutstanding)} is overdue; the oldest item is ${client.oldestOverdueDays} days old.` : "Upcoming due dates or payment behavior require follow-up."}</span>
                </div>
              </div>)}

            {client.active ? <section className="panel-section">
              <div className="section-title-row">
                <div><span className="section-kicker"><Sparkles size={14}/> Opportunity engine</span><h3>What to offer next</h3></div>
                <span className="algorithm-pill">Explainable</span>
              </div>
              <p className="section-description">Vector affinity, adoption among peer accounts, territory, and turnover. Spend weighting prevents incompatible units from being mixed.</p>
              <div className="recommendation-list">
                {recommendationLoading && <p className="section-description">Calculating recommendations…</p>}
                {recommendationError && <p className="form-error">{recommendationError}</p>}
                {recommendations.slice(0, 3).map((recommendation) => (<article className="recommendation-card" key={recommendation.product.id}>
                    <div className="product-icon"><Package size={18}/></div>
                    <div className="recommendation-copy">
                      <button className="entity-link product-entity-link" onClick={() => onOpenProduct?.(recommendation.product)}>{recommendation.product.name}<ChevronRight size={12}/></button>
                      <span>{recommendation.reason}</span>
                      <small>{recommendation.product.price > 0 ? money(recommendation.product.price) : "No price"} · Stock {recommendation.product.stock} · <span className={`confidence ${recommendation.confidence}`}>{recommendation.confidence === "reliable" ? "Reliable" : recommendation.confidence === "exploratory" ? "Exploratory" : "Insufficient data"}</span></small>
                    </div>
                    <div className="score-ring" style={{ "--score": recommendation.score } as React.CSSProperties}>
                      <span>{recommendation.score}</span>
                    </div>
                  </article>))}
              </div>
            </section> : <section className="panel-section"><div className="section-title-row"><div><span className="section-kicker"><Sparkles size={14}/> Opportunity engine</span><h3>Recommendations paused</h3></div></div><p className="section-description inactive-recommendation-copy">Inactive customers do not participate in comparisons, recommendations, or routes. Their purchase and account history remains available.</p></section>}

            <section className="panel-section next-action">
              <div className="section-title-row">
                <div><span className="section-kicker"><CalendarDays size={14}/> {client.active ? "Next action" : "Internal record"}</span><h3>{client.active ? `Visit \u00B7 ${longDate(client.nextVisitAt)}` : "Historical customer notes"}</h3></div>
                {client.active && <strong className="priority-number">P{client.visitPriority}</strong>}
              </div>
              <textarea value={note} onChange={(event) => { setNote(event.target.value); setSaved(false); }} maxLength={500} aria-label="Note for the next action"/>
              {saveError && <p className="form-error">{saveError}</p>}
              <div className="action-row">
                <button className="button secondary" onClick={saveNote} disabled={saving || note === client.note}>
                  {saved ? <Check size={15}/> : <Save size={15}/>} {saved ? "Saved" : saving ? "Saving\u2026" : "Save note"}
                </button>
                {client.active && <button className="button primary" onClick={() => onPlanRoute(client.id)}><Route size={15}/> Add to route</button>}
              </div>
            </section>
          </>)}

        {tab === "purchases" && (<section className="panel-section first">
            <div className="section-title-row"><div><span className="section-kicker">Last 90 days</span><h3>Purchase mix</h3></div><strong>{purchased.length} products</strong></div>
            <div className="purchase-list">
              {!purchased.length && <p className="section-description">No product detail in the 90-day window.</p>}
              {purchased.map((item, index) => (<article key={item.product.id} className="purchase-row">
                  <span className="purchase-rank">{index + 1}</span>
                  <div className="purchase-copy"><button className="entity-link product-entity-link" onClick={() => onOpenProduct?.(item.product)}>{item.product.name}<ChevronRight size={12}/></button><span>{item.quantity} units · last purchase {shortDate(item.lastDate)}</span></div>
                  <strong>{money(item.total, true)}</strong>
                </article>))}
            </div>
          </section>)}

        {tab === "account" && (<>
            <section className="credit-card panel-section first">
              <div className="credit-top"><span>Configured payment terms</span><strong>{client.paymentMethod}</strong></div>
              {client.creditLimit > 0 && <><div className="credit-track"><span style={{ width: `${Math.min(100, utilization)}%` }}/></div><div className="credit-values"><span>Net account balance {money(client.balance)}</span><span>Limit {money(client.creditLimit)} · use {utilization}%</span></div></>}
              {!client.creditLimit && <div className="credit-values no-limit"><span>Net account balance {money(client.balance)}</span><span>No credit limit is available; utilization is not calculated</span></div>}
            </section>
            <section className={`observed-term-card panel-section ${client.creditTermStatus}`}>
              <div className="section-title-row"><div><span className="section-kicker"><CalendarDays size={14}/> Observed term</span><h3>{creditTermLabel(client)}</h3></div><span className={`term-status ${client.creditTermStatus}`}>{client.creditTermStatus === "mixed" ? "Mixed" : client.creditTermStatus === "predominant" ? `${client.creditTermDominantShare}%` : client.creditTermSampleSize ? `n=${client.creditTermSampleSize}` : "No sample"}</span></div>
              <p>{creditTermDetail(client)}</p>
              {client.creditTermOptions.length > 1 && <div className="term-option-list">{client.creditTermOptions.slice(0, 5).map((option) => <span key={`${option.days}-${option.minDays}-${option.maxDays}`}><strong>{option.days} d</strong>{option.minDays !== option.maxDays && <small>{option.minDays}–{option.maxDays} exact</small>}<em>{option.invoiceCount} inv. · {option.share}%</em></span>)}</div>}
              <small className="term-rule-note">Calculated from issue to due date. Alerts always use each invoice's exact date, even when terms differ.</small>
            </section>
            <section className="panel-section">
              <div className="section-title-row"><div><span className="section-kicker"><WalletCards size={14}/> Documents</span><h3>Account history</h3></div></div>
              <div className="invoice-list">
                {!client.invoices.length && <p className="section-description">No pending documents or reconciled payments in the analyzed window.</p>}
                {client.invoices.map((invoice) => (<button className="invoice-row" key={invoice.id} onClick={() => onOpenInvoice?.(invoice.id)} disabled={!onOpenInvoice}>
                    <div className={`invoice-status-dot ${invoice.status}`}/>
                    <div className="invoice-copy">
                      <strong>{invoice.number}</strong>
                      <span>Issued {compactDate(invoice.issuedAt)} · due {compactDate(invoice.dueAt)}{invoice.creditTermDays != null ? ` \u00B7 term ${invoice.creditTermDays} d` : ""}</span>
                      <small>{invoice.paymentMethod || "Payment terms unavailable"}</small>
                      {invoice.paidAt && <small><Check size={12}/> Paid {compactDate(invoice.paidAt)}</small>}
                    </div>
                    <div className="invoice-amount"><strong>{money(invoice.outstanding > 0 ? invoice.outstanding : invoice.amount)}</strong><span className={`status-text ${invoice.status}`}>{invoiceLabel[invoice.status]}{invoice.outstanding > 0 && invoice.outstanding !== invoice.amount ? " \u00B7 balance" : ""}</span></div>
                    <ChevronRight size={15}/>
                  </button>))}
              </div>
            </section>
            <div className="payment-behavior">
              <Clock3 size={18}/>
              <div><strong>Payment behavior vs due date</strong><span>{client.paymentSampleSize ? `Average payment ${paymentDelay(client.avgPaymentDelayDays)} \u00B7 ${client.onTimePaymentRate}% on time across ${client.paymentSampleSize} reconciled invoices. Total time from issue: ${client.avgPaymentDays} days.` : "No invoices with reconciled due dates and payments in the last 365 days."}</span></div>
              <ChevronRight size={17}/>
            </div>
          </>)}

        {tab === "operations" && (<>
            <section className="panel-section first">
              <div className="section-title-row"><div><span className="section-kicker"><WalletCards size={14}/> Accounts receivable</span><h3>Administrative follow-ups</h3></div><span className="count-badge">{activeReceivableEvents.length}</span></div>
              {!activeReceivableEvents.length && <p className="section-description">No accounts-receivable follow-ups have been saved yet.</p>}
              <div className="panel-operation-list receivable-events">{activeReceivableEvents.map((event) => <article key={event.id}><span>{receivableEventLabels[event.eventType]}</span><div><strong>{event.comment || receivableEventLabels[event.eventType]}</strong><small>{longDate(event.createdAt)} · {event.actor}</small></div></article>)}</div>
            </section>
            <section className="panel-section first">
              <div className="section-title-row"><div><span className="section-kicker"><ClipboardCheck size={14}/> Local activity</span><h3>Recorded actions</h3></div><span className="count-badge">{activities.length}</span></div>
              {!activities.length && <p className="section-description">No visits, calls, collections, or offers saved for this customer yet.</p>}
              <div className="panel-operation-list">{activities.map((activity) => <article key={activity.id}><span>{activity.type === "visit" ? "Visit" : activity.type === "call" ? "Call" : activity.type === "collection" ? "Collection" : "Offer"}</span><div><strong>{activity.outcome === "sale" ? "Sale completed" : activity.outcome === "promise" ? "Payment promise" : activity.outcome === "no_contact" ? "No contact" : activity.outcome === "rescheduled" ? "Rescheduled" : activity.outcome === "no_interest" ? "No interest for now" : "Completed"}</strong><small>{longDate(activity.occurredAt)}{activity.note ? ` \u00B7 ${activity.note}` : ""}</small></div>{activity.amount != null && <strong>{money(activity.amount, true)}</strong>}</article>)}</div>
            </section>
            <section className="panel-section">
              <div className="section-title-row"><div><span className="section-kicker"><CircleDollarSign size={14}/> Commitments</span><h3>Payment promises</h3></div><span className="count-badge">{promises.filter((promise) => promise.status === "pending").length} pending</span></div>
              {!promises.length && <p className="section-description">No locally recorded payment promises.</p>}
              <div className="panel-promise-list">{promises.map((promise) => <article className={promise.status} key={promise.id}><span><CircleDollarSign size={14}/></span><div><strong>{money(promise.amount)} · {promise.status === "pending" ? "Pending" : promise.status === "kept" ? "Kept" : promise.status === "broken" ? "Broken" : "Cancelled"}</strong><small>Promised date {longDate(promise.dueAt)}{promise.note ? ` \u00B7 ${promise.note}` : ""}</small></div></article>)}</div>
            </section>
            <p className="operations-disclaimer">Source: local human-entered SMART Salice records. They remain separate from synthetic analytical facts.</p>
          </>)}
      </div>
    </aside>);
}
