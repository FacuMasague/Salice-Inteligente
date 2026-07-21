import { useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpen, CheckCircle2, ClipboardCheck, Database, HardDrive, Map, PlayCircle, Route, Search, ShieldCheck, Users, WalletCards } from "lucide-react";
import type { DashboardData } from "../../shared/models";
import type { DataHealthPayload } from "../../shared/data-health";
import type { MetricDefinition, ReportUniverseDefinition } from "../../shared/metrics";
import { SavedViewsBar } from "../components/SavedViewsBar";
import { longDate, number } from "../lib/format";
const lessons = [
    { icon: Map, title: "Operational Map", text: "KPIs, territory, clustering, and full customer profiles." },
    { icon: ClipboardCheck, title: "Commercial Activities", text: "Priorities, actions, outcomes, and payment promises." },
    { icon: Users, title: "Customers & Sellers", text: "Portfolios, risk, opportunity, trends, and ownership." },
    { icon: WalletCards, title: "Collections", text: "Aging, pending balance, due dates, and payment behavior." },
    { icon: BarChart3, title: "Reports", text: "Commercial status, sales performance, specialized portfolios, and dormant accounts." },
    { icon: BarChart3, title: "Products", text: "Availability, comparison, recommendations, and 33 vector dimensions." },
    { icon: Route, title: "Routes", text: "Corridors, workday limits, and visible assumptions." },
];
interface SystemStatus {
    storage: string;
    notes: number;
    activities: number;
    pendingPromises: number;
    pendingAgendaItems: number;
    receivableCases: number;
    savedViews: number;
    goalVersions: number;
    backups: number;
    operationalBackups: number;
}
interface MetricCatalogPayload {
    version: string;
    metrics: MetricDefinition[];
    universes: ReportUniverseDefinition[];
    principles: string[];
}
const freshnessLabels = { current: "Validated", attention: "Review", stale: "Stale", unknown: "No date" };
const sourceLabels = { healthy: "Consistent", attention: "Review", stale: "Stale", unavailable: "Unavailable" };
const metricUnitLabels: Record<MetricDefinition["unit"], string> = {
    ars: "ARS", kg: "kg", units: "units", clients: "customers", documents: "documents",
    days: "days", percent: "%", score: "score",
};
export function SettingsView({ data, dataHealth, tutorialCompleted, onStartTutorial }: {
    data: DashboardData;
    dataHealth: DataHealthPayload | null;
    tutorialCompleted: boolean;
    onStartTutorial: () => void;
}) {
    const [system, setSystem] = useState<SystemStatus | null>(null);
    const [catalog, setCatalog] = useState<MetricCatalogPayload | null>(null);
    const [metricQuery, setMetricQuery] = useState("");
    useEffect(() => { fetch("/api/system/status").then((response) => response.json()).then(setSystem).catch(() => setSystem(null)); }, []);
    useEffect(() => { fetch("/api/metrics/catalog").then((response) => response.json()).then(setCatalog).catch(() => setCatalog(null)); }, []);
    const active = data.clients.filter((client) => client.active).length;
    const inactive = data.clients.length - active;
    const confirmed = data.clients.filter((client) => client.active && client.portfolioStatus === "confirmed").length;
    const review = active - confirmed;
    const activeGeocoded = data.clients.filter((client) => client.active && client.coordinates).length;
    const geocodeRate = active ? Math.round(activeGeocoded / active * 100) : 0;
    const normalizedQuery = metricQuery.trim().toLocaleLowerCase("en");
    const visibleMetrics = useMemo(() => !catalog ? [] : catalog.metrics.filter((metric) => !normalizedQuery || `${metric.label} ${metric.description} ${metric.consumers.join(" ")}`.toLocaleLowerCase("en").includes(normalizedQuery)), [catalog, normalizedQuery]);
    return <div className="page-view settings-view">
    <section className="data-card settings-tutorial-card" data-tour="settings-tutorial">
      <div className="settings-tutorial-copy"><div className="settings-icon"><BookOpen size={28}/></div><div><span className="section-kicker">Guided tour · 25 steps</span><h2>Learn SMART Salice v1.0.0</h2><p>The tour covers operations, administration, goals, reports, brands, products, and routes. Only explicit workflow forms change local data.</p></div></div>
      <div className="settings-tutorial-action">{tutorialCompleted && <span><CheckCircle2 size={15}/> Completed on this device</span>}<button className="button primary large" onClick={onStartTutorial}><PlayCircle size={17}/> {tutorialCompleted ? "Repeat tour" : "Start tour"}</button></div>
    </section>

    <SavedViewsBar viewKey="settings" filters={{ metricQuery }} onApply={(saved) => setMetricQuery(saved.metricQuery ?? "")}/>

    <section className={`data-card data-health-card ${dataHealth?.overall ?? "unavailable"}`}>
      <div className="data-card-header"><div><span className="section-kicker"><Database size={14}/> Data status</span><h2>One validated local demo pack</h2><p>The snapshot, commercial analytics, pending balances, and operational workflows run without network access.</p></div><span className={`data-health-badge ${dataHealth?.freshness.level ?? "unknown"}`}>{dataHealth ? freshnessLabels[dataHealth.freshness.level] : "Checking\u2026"}</span></div>
      {dataHealth ? <><div className="data-source-grid">{dataHealth.sources.map((source) => <article key={source.id}><div><span className={`source-health-dot ${source.level}`}/><strong>{source.label}</strong><em>{sourceLabels[source.level]}</em></div><p>{source.detail}</p><small>{source.coverageFrom ? `Coverage ${source.coverageFrom} \u2192 ${source.coverageThrough}` : `Cutoff ${source.coverageThrough}`}</small></article>)}</div><div className="data-health-footer"><span><strong>{dataHealth.freshness.label}</strong></span>{dataHealth.quality && <span><ShieldCheck size={14}/> Audit {dataHealth.quality.passed}/{dataHealth.quality.total} · {dataHealth.quality.warnings} warnings</span>}</div></> : <p className="settings-card-copy">Consolidated status is unavailable, but the active local snapshot remains accessible.</p>}
    </section>

    <div className="settings-grid">
      <section className="data-card settings-card"><div className="data-card-header"><div><span className="section-kicker"><BookOpen size={14}/> Content</span><h2>What the tour covers</h2></div></div><div className="settings-lessons">{lessons.map(({ icon: Icon, title, text }, index) => <article key={title}><span>{index + 1}</span><Icon size={18}/><div><strong>{title}</strong><p>{text}</p></div></article>)}</div></section>

      <section className="data-card settings-card" data-tour="portfolio-rules"><div className="data-card-header"><div><span className="section-kicker"><ShieldCheck size={14}/> Customer universe</span><h2>Activity and portfolio review stay separate</h2></div><span className="count-badge">Conservative rule</span></div><div className="status-audit-summary"><div><strong>{number(confirmed)}</strong><span>active and confirmed</span></div><div className="review"><strong>{number(review)}</strong><span>active and awaiting review</span></div></div><p className="settings-card-copy">Uncertain accounts remain visible until a human confirms the assignment; the system never silently invents or excludes a mapping.</p><div className="settings-rule"><Database size={16}/><span>{number(inactive)} inactive accounts remain available for historical consultation.</span></div></section>

      <section className="data-card settings-card" data-tour="finance-rules"><div className="data-card-header"><div><span className="section-kicker"><WalletCards size={14}/> Financial semantics</span><h2>Metrics that do not mix concepts</h2></div></div><div className="rule-list"><p><strong>Invoice term</strong><span>Exact days from issue to first due date.</span></p><p><strong>Typical or mixed terms</strong><span>Small date shifts are grouped; a predominant option needs at least 60%.</span></p><p><strong>Payment vs due date</strong><span>Days before or after the contractual date and on-time rate.</span></p><p><strong>Pending balance</strong><span>Uses the amount still open; original amount remains a reference.</span></p><p><strong>Credit limit</strong><span>Utilization appears only when a positive, explicit limit exists.</span></p></div></section>

      <section className="data-card settings-card" data-tour="data-quality"><div className="data-card-header"><div><span className="section-kicker"><ShieldCheck size={14}/> Quality & coverage</span><h2>What the demo validates</h2></div><span className="count-badge">{longDate(data.meta.generatedAt)}</span></div><div className="coverage-list"><p><span>Active customer geocoding</span><strong>{geocodeRate}% · {number(activeGeocoded)} / {number(active)}</strong></p><p><span>Synthetic products</span><strong>{number(data.products.length)}</strong></p><p><span>Synthetic customers</span><strong>{number(data.clients.length)}</strong></p><p><span>Open documents</span><strong>{number(data.clients.flatMap((client) => client.invoices).filter((invoice) => invoice.outstanding > 0).length)}</strong></p><p><span>Explainable vector dimensions</span><strong>33</strong></p></div></section>

      <section className="data-card settings-card" data-tour="storage-rules"><div className="data-card-header"><div><span className="section-kicker"><HardDrive size={14}/> Local persistence</span><h2>Human activity stays separate from analytical facts</h2></div><span className="algorithm-pill">SQLite</span></div><p className="settings-card-copy">Notes, activities, tasks, follow-ups, saved views, and goals live in a dedicated local operational database.</p><div className="coverage-list"><p><span>Saved notes</span><strong>{system ? number(system.notes) : "Loading\u2026"}</strong></p><p><span>Recorded activities</span><strong>{system ? number(system.activities) : "Loading\u2026"}</strong></p><p><span>Pending promises</span><strong>{system ? number(system.pendingPromises) : "Loading\u2026"}</strong></p><p><span>Receivable cases</span><strong>{system ? number(system.receivableCases) : "Loading\u2026"}</strong></p><p><span>Saved filter views</span><strong>{system ? number(system.savedViews) : "Loading\u2026"}</strong></p><p><span>Goal versions</span><strong>{system ? number(system.goalVersions) : "Loading\u2026"}</strong></p></div></section>

      <section className="data-card settings-card settings-wide-card"><div className="data-card-header"><div><span className="section-kicker"><BarChart3 size={14}/> Explainable rules</span><h2>Three separate scores and product classification</h2></div><span className="algorithm-pill">Auditable</span></div><div className="score-definition-grid"><article><strong>C · Collection risk</strong><p>Due dates, age, amount, and payment behavior.</p></article><article><strong>O · Commercial opportunity</strong><p>Purchase recency, sales decline, recent inactivity, and assortment breadth.</p></article><article><strong>P · Visit priority</strong><p>58% collection risk + 42% opportunity. It is not presented as a prediction.</p></article><article><strong>Actions</strong><p>An action counts only when someone records it.</p></article><article><strong>Due promises</strong><p>Local commitments due on or before the selected date.</p></article><article><strong>Vector v2.1</strong><p>33 deterministic dimensions with evidence and confidence.</p></article></div></section>

      <section className="data-card settings-card settings-wide-card metric-catalog-card"><div className="data-card-header"><div><span className="section-kicker"><BookOpen size={14}/> Central catalog · {catalog ? `v${catalog.version}` : "loading"}</span><h2>Canonical metrics</h2><p>One shared definition prevents the same label from using different rules across screens.</p></div><label className="metric-search"><Search size={15}/><input value={metricQuery} onChange={(event) => setMetricQuery(event.target.value)} placeholder="Search metric or report" aria-label="Search metric catalog"/></label></div>{catalog ? <div className="metric-definition-list">{visibleMetrics.map((metric) => <details key={metric.id} className="metric-definition"><summary><div><strong>{metric.label}</strong><span>{metric.description}</span></div><em>{metricUnitLabels[metric.unit]}</em></summary><div className="metric-definition-body"><p><b>Definition</b><code>{metric.formula}</code></p><p><b>Source</b><span>{metric.source}</span></p><p><b>Grain</b><span>{metric.grain}</span></p><p><b>Date</b><span>{metric.dateBasis}</span></p><p><b>Used in</b><span>{metric.consumers.join(" \u00B7 ")}</span></p>{metric.caveats.length > 0 && <p><b>Caveats</b><span>{metric.caveats.join(" ")}</span></p>}</div></details>)}{!visibleMetrics.length && <p className="notification-empty">No matching metrics.</p>}</div> : <p className="settings-card-copy">The central catalog could not be loaded.</p>}</section>

      <section className="data-card settings-card settings-wide-card universe-catalog-card"><div className="data-card-header"><div><span className="section-kicker"><ShieldCheck size={14}/> Documented universes</span><h2>Every report preserves its scope</h2><p>Company, branch, exclusions, and time cutoff remain explicit.</p></div><span className="count-badge">{catalog?.universes.length ?? 0} universes</span></div><div className="universe-definition-grid">{catalog?.universes.map((universe) => <article key={universe.id}><div><strong>{universe.label}</strong><span>Company {universe.companies.join("/")} · branch {universe.branches.join("/") || "report-defined"}</span></div><p><b>Includes:</b> {universe.included.join(" ")}</p><p><b>Excludes:</b> {universe.excluded.length ? universe.excluded.join(" \u00B7 ") : "No additional exclusions."}</p><small>{universe.dateRule}</small></article>)}</div></section>
    </div>
  </div>;
}
