import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BarChart3, Bell, Boxes, ChevronDown, ChevronRight, ChevronUp, CircleDollarSign, ClipboardCheck, Database, LayoutDashboard, Map, Menu, Package, PackageSearch, PawPrint, RefreshCw, Route, Search, Settings2, ShoppingBag, ShoppingBasket, Sparkles, Store, Target, Users, WalletCards, X } from "lucide-react";
import { APP_VERSION, VECTOR_LABELS, type Client, type DashboardData, type NotificationItem, type Product } from "../shared/models";
import type { DataHealthPayload } from "../shared/data-health";
import { ClientPanel } from "./components/ClientPanel";
import { InvoiceDetailDrawer } from "./components/InvoiceDetailDrawer";
import { ProductPanel } from "./components/ProductPanel";
import { TUTORIAL_STEPS, TutorialOverlay, type TutorialView } from "./components/TutorialOverlay";
import { clientPrimaryName, clientSecondaryName } from "./lib/client-name";
import { number } from "./lib/format";
import type { ClientVisibility } from "./views/MapDashboard";
const AgendaView = lazy(() => import("./views/AgendaView").then((module) => ({ default: module.AgendaView })));
const ClientsView = lazy(() => import("./views/ClientsView").then((module) => ({ default: module.ClientsView })));
const FinanceView = lazy(() => import("./views/FinanceView").then((module) => ({ default: module.FinanceView })));
const MapDashboard = lazy(() => import("./views/MapDashboard").then((module) => ({ default: module.MapDashboard })));
const ProductsView = lazy(() => import("./views/ProductsView").then((module) => ({ default: module.ProductsView })));
const BrandsView = lazy(() => import("./views/BrandsView").then((module) => ({ default: module.BrandsView })));
const ReportsView = lazy(() => import("./views/ReportsView").then((module) => ({ default: module.ReportsView })));
const RoutesView = lazy(() => import("./views/RoutesView").then((module) => ({ default: module.RoutesView })));
const SettingsView = lazy(() => import("./views/SettingsView").then((module) => ({ default: module.SettingsView })));
const SptReportView = lazy(() => import("./views/SptReportView").then((module) => ({ default: module.SptReportView })));
const CommercialSalesReportView = lazy(() => import("./views/CommercialSalesReportView").then((module) => ({ default: module.CommercialSalesReportView })));
const MarsReportView = lazy(() => import("./views/MarsReportView").then((module) => ({ default: module.MarsReportView })));
const NutriPetReportView = lazy(() => import("./views/NutriPetReportView").then((module) => ({ default: module.NutriPetReportView })));
const BairesReportView = lazy(() => import("./views/BairesReportView").then((module) => ({ default: module.BairesReportView })));
const NonBuyersReportView = lazy(() => import("./views/NonBuyersReportView").then((module) => ({ default: module.NonBuyersReportView })));
const PendingBalancesReportView = lazy(() => import("./views/PendingBalancesReportView").then((module) => ({ default: module.PendingBalancesReportView })));
const SellersView = lazy(() => import("./views/SellersView").then((module) => ({ default: module.SellersView })));
const SalesExplorerView = lazy(() => import("./views/SalesExplorerView").then((module) => ({ default: module.SalesExplorerView })));
const ReceivablesView = lazy(() => import("./views/ReceivablesView").then((module) => ({ default: module.ReceivablesView })));
const GoalsView = lazy(() => import("./views/GoalsView").then((module) => ({ default: module.GoalsView })));
type View = TutorialView;
type SidebarSection = "operations" | "administration" | "reports" | "system";
const viewSection: Record<View, SidebarSection> = {
    map: "operations", clients: "operations", sellers: "operations", finance: "operations", products: "operations", brands: "operations", routes: "operations",
    agenda: "administration", "sales-explorer": "administration", receivables: "administration", goals: "administration",
    reports: "reports", spt: "reports", "commercial-sales": "reports", mars: "reports", nutripet: "reports", baires: "reports", "non-buyers": "reports", "pending-balances": "reports",
    settings: "system",
};
const titles: Record<View, {
    title: string;
    subtitle: string;
}> = {
    map: { title: "Commercial Pulse", subtitle: "Customers, opportunities, and risk across the territory" },
    agenda: { title: "Commercial Activities", subtitle: "Plan and record visits, calls, and offers" },
    clients: { title: "Customers", subtitle: "The complete commercial portfolio in one view" },
    sellers: { title: "Sales Team", subtitle: "Portfolios, performance, collections, and priorities by owner" },
    finance: { title: "Portfolio & Collections", subtitle: "Due dates, balances, and payment behavior" },
    products: { title: "Product Intelligence", subtitle: "Explainable vectorized catalog for comparison and recommendations" },
    brands: { title: "Brands", subtitle: "Products, sales, stock, and performance by brand" },
    routes: { title: "Route Planning", subtitle: "Prioritized and explainable commercial routes" },
    "sales-explorer": { title: "Sales Explorer", subtitle: "Drill down from KPI to period, customer, product, and document" },
    receivables: { title: "Accounts Receivable", subtitle: "Open portfolio, owners, statuses, and administrative follow-up" },
    goals: { title: "Commercial Goals", subtitle: "Versioned planning, changes, and attainment" },
    reports: { title: "Commercial Plan Status", subtitle: "Targets, current results, and business performance" },
    spt: { title: "Sales Performance Tracker", subtitle: "Kilograms, trends, sellers, and period comparisons" },
    "commercial-sales": { title: "Commercial Sales", subtitle: "Net sales, trends, brands, and business mix" },
    mars: { title: "Orbit Nutrition", subtitle: "Volume, customers, and supplier commercial periods" },
    nutripet: { title: "Nova Pet", subtitle: "Volume, coverage, and monthly supplier trends" },
    baires: { title: "Harbor Portfolio", subtitle: "Volume, customers, and portfolio composition" },
    "non-buyers": { title: "Dormant Accounts", subtitle: "Recover customers and brands without recent purchases" },
    "pending-balances": { title: "Pending Balances", subtitle: "Open portfolio, due dates, and pressure on recent sales" },
    settings: { title: "System Guide", subtitle: "Tutorial, operating rules, and data quality" },
};
const nav: {
    id: View;
    label: string;
    icon: typeof Map;
}[] = [
    { id: "map", label: "Operational Map", icon: Map },
    { id: "routes", label: "Routes", icon: Route },
    { id: "clients", label: "Customers", icon: Users },
    { id: "sellers", label: "Sales Team", icon: Users },
    { id: "finance", label: "Portfolio", icon: CircleDollarSign },
    { id: "products", label: "Products", icon: Boxes },
    { id: "brands", label: "Brands", icon: Store },
];
function localizedDisclaimer(goal: DashboardData["meta"]) {
    if (!goal.disclaimer)
        return "";
    const coverageValues = [...new Set(Object.values(goal.coverage ?? {}).filter((value): value is number => typeof value === "number" && value >= 1000))]
        .sort((left, right) => right - left);
    return coverageValues.reduce((text, value) => text.replace(new RegExp(`\\b${value}\\b`, "g"), number(value)), goal.disclaimer);
}
export default function App() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [error, setError] = useState("");
    const [view, setView] = useState<View>("map");
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [clientProfileOpen, setClientProfileOpen] = useState(false);
    const [sellerFocus, setSellerFocus] = useState("");
    const [routeClientId, setRouteClientId] = useState<number | null>(null);
    const [clientQuery, setClientQuery] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarSections, setSidebarSections] = useState<Record<SidebarSection, boolean>>({ operations: true, administration: true, reports: true, system: true });
    const [mapClientVisibility, setMapClientVisibility] = useState<ClientVisibility>("active");
    const [tutorialStep, setTutorialStep] = useState<number | null>(null);
    const [tutorialCompleted, setTutorialCompleted] = useState(() => localStorage.getItem("salice-tutorial-v032") === "completed");
    const [globalQuery, setGlobalQuery] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [productFocusId, setProductFocusId] = useState<string | null>(null);
    const [productProfileOpen, setProductProfileOpen] = useState(false);
    const [brandFocus, setBrandFocus] = useState("");
    const [invoiceFocusId, setInvoiceFocusId] = useState<string | null>(null);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [dataHealth, setDataHealth] = useState<DataHealthPayload | null>(null);
    const searchInput = useRef<HTMLInputElement>(null);
    useEffect(() => {
        fetch("/api/dashboard")
            .then((response) => {
            if (!response.ok)
                throw new Error("The local data server did not respond");
            return response.json();
        })
            .then(setData)
            .catch((cause: Error) => setError(cause.message));
    }, []);
    const refreshDataHealth = () => {
        fetch("/api/system/data-health").then((response) => response.ok ? response.json() : null).then(setDataHealth).catch(() => setDataHealth(null));
    };
    useEffect(refreshDataHealth, []);
    const refreshNotifications = () => {
        fetch("/api/notifications").then((response) => response.json()).then((payload) => setNotifications(payload.items || [])).catch(() => setNotifications([]));
    };
    useEffect(refreshNotifications, []);
    useEffect(() => {
        const section = viewSection[view];
        setSidebarSections((current) => current[section] ? current : { ...current, [section]: true });
    }, [view]);
    useEffect(() => {
        const keydown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                setSearchOpen(true);
                requestAnimationFrame(() => searchInput.current?.focus());
            }
            if (event.key === "Escape") {
                setSearchOpen(false);
                setNotificationsOpen(false);
                setProductProfileOpen(false);
                setClientProfileOpen(false);
                setInvoiceFocusId(null);
            }
        };
        window.addEventListener("keydown", keydown);
        return () => window.removeEventListener("keydown", keydown);
    }, []);
    useEffect(() => {
        if (tutorialStep == null || !data)
            return;
        const step = TUTORIAL_STEPS[tutorialStep];
        setView(step.view);
        setSidebarOpen(false);
        if (step.target === "client-panel") {
            const tutorialClient = [...data.clients]
                .filter((client) => client.active && client.coordinates !== null)
                .sort((a, b) => b.visitPriority - a.visitPriority)[0];
            setMapClientVisibility("active");
            setSelectedId(tutorialClient?.id ?? null);
            setClientProfileOpen(false);
        }
        else {
            setSelectedId(null);
            setClientProfileOpen(false);
        }
    }, [data, tutorialStep]);
    const selected = useMemo(() => data?.clients.find((client) => client.id === selectedId) || null, [data, selectedId]);
    const selectedProduct = useMemo(() => data?.products.find((product) => product.id === productFocusId) || null, [data, productFocusId]);
    const activeClients = useMemo(() => data?.clients.filter((client) => client.active) ?? [], [data]);
    const openClient = (client: Client) => { setSelectedId(client.id); setClientProfileOpen(true); setProductProfileOpen(false); setInvoiceFocusId(null); setSearchOpen(false); setNotificationsOpen(false); };
    const openClientById = (clientId: number) => {
        const client = data?.clients.find((candidate) => candidate.id === clientId);
        if (client)
            openClient(client);
    };
    const openProduct = (value: Product | string) => {
        const product = typeof value === "string" ? data?.products.find((candidate) => candidate.id === value) : value;
        if (!product)
            return;
        setProductFocusId(product.id);
        setProductProfileOpen(true);
        setSearchOpen(false);
        setNotificationsOpen(false);
    };
    const openBrand = (brand: string) => {
        if (!brand || brand.startsWith("Unknown"))
            return;
        setBrandFocus(brand);
        setView("brands");
        setSelectedId(null);
        setClientProfileOpen(false);
        setProductProfileOpen(false);
        setSearchOpen(false);
        setNotificationsOpen(false);
    };
    const openProductCatalog = (product: Product) => { setProductFocusId(product.id); setProductProfileOpen(false); setClientProfileOpen(false); setSelectedId(null); setView("products"); };
    const openSeller = (seller: string) => {
        if (!seller || seller === "Unassigned")
            return;
        setSellerFocus(seller);
        setView("sellers");
        setSelectedId(null);
        setClientProfileOpen(false);
        setProductProfileOpen(false);
        setInvoiceFocusId(null);
        setSearchOpen(false);
        setNotificationsOpen(false);
    };
    const openInvoice = (invoiceId: string) => { setInvoiceFocusId(invoiceId); setSearchOpen(false); setNotificationsOpen(false); };
    const selectView = (next: View) => {
        setView(next);
        setSidebarOpen(false);
        setClientProfileOpen(false);
        setProductProfileOpen(false);
        if (next !== "map")
            setSelectedId(null);
    };
    const toggleSidebarSection = (section: SidebarSection) => setSidebarSections((current) => ({ ...current, [section]: !current[section] }));
    const planRoute = (clientId: number) => {
        if (!data?.clients.find((client) => client.id === clientId)?.active)
            return;
        setRouteClientId(clientId);
        setView("routes");
        setSelectedId(null);
        setClientProfileOpen(false);
    };
    const noteSaved = (clientId: number, note: string) => setData((current) => current ? ({ ...current, clients: current.clients.map((client) => client.id === clientId ? { ...client, note } : client) }) : current);
    const startTutorial = () => setTutorialStep(0);
    const finishTutorial = () => {
        localStorage.setItem("salice-tutorial-v032", "completed");
        setTutorialCompleted(true);
        setTutorialStep(null);
        setSelectedId(null);
        setView("settings");
    };
    const normalizedGlobalQuery = globalQuery.trim().toLowerCase();
    const clientResults = useMemo(() => !data || normalizedGlobalQuery.length < 2 ? [] : data.clients
        .filter((client) => `${client.tradeName} ${client.name} ${client.reference} ${client.locality} ${client.seller}`.toLowerCase().includes(normalizedGlobalQuery))
        .sort((a, b) => Number(b.active) - Number(a.active) || b.visitPriority - a.visitPriority)
        .slice(0, 6), [data, normalizedGlobalQuery]);
    const productResults = useMemo(() => !data || normalizedGlobalQuery.length < 2 ? [] : data.products
        .filter((product) => `${product.name} ${product.sku} ${product.brand} ${product.line} ${product.family} ${product.subcategory} ${product.group}`.toLowerCase().includes(normalizedGlobalQuery))
        .sort((a, b) => b.monthlyUnits - a.monthlyUnits)
        .slice(0, 5), [data, normalizedGlobalQuery]);
    const sellerResults = useMemo(() => !data || normalizedGlobalQuery.length < 2 ? [] : [...new Set(data.clients
            .filter((client) => client.active && client.seller !== "Unassigned" && client.seller.toLowerCase().includes(normalizedGlobalQuery))
            .map((client) => client.seller))].sort((a, b) => a.localeCompare(b, "in")).slice(0, 5), [data, normalizedGlobalQuery]);
    const brandResults = useMemo(() => !data || normalizedGlobalQuery.length < 2 ? [] : [...new Set(data.products
            .map((product) => product.brand)
            .filter((brand) => brand && !brand.startsWith("Unknown") && brand.toLowerCase().includes(normalizedGlobalQuery)))]
        .map((brand) => ({ brand, sales90d: data.products.filter((product) => product.brand === brand).reduce((sum, product) => sum + product.sales90d, 0) }))
        .sort((a, b) => b.sales90d - a.sales90d || a.brand.localeCompare(b.brand, "in")).slice(0, 5), [data, normalizedGlobalQuery]);
    const nextTutorialStep = () => {
        if (tutorialStep == null)
            return;
        if (tutorialStep === TUTORIAL_STEPS.length - 1)
            finishTutorial();
        else
            setTutorialStep(tutorialStep + 1);
    };
    if (error)
        return <main className="boot-screen"><div className="boot-logo">S</div><h1>SMART Salice could not open</h1><p>{error}. Run <code>pnpm run dev</code> and try again.</p><button className="button primary" onClick={() => location.reload()}><RefreshCw size={16}/> Retry</button></main>;
    if (!data)
        return <main className="boot-screen"><div className="boot-logo loading">S</div><h1>Preparing the operations center</h1><p>Loading customers, products, and accounts…</p></main>;
    const currentTitle = titles[view];
    const snapshotDate = new Date(data.meta.generatedAt);
    const snapshotDay = new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short" }).format(snapshotDate).replace(".", "");
    const snapshotTime = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(snapshotDate);
    const snapshotLabel = `${snapshotDay} \u00B7 ${snapshotTime}`;
    return (<div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand"><div className="brand-mark"><span>S</span></div><div className="brand-copy"><small>SMART</small><strong>Salice</strong></div><button className="mobile-close" aria-label="Close menu" onClick={() => setSidebarOpen(false)}><X size={19}/></button></div>
        <div className="sidebar-scroll">
          <button className="sidebar-section-label" aria-expanded={sidebarSections.operations} aria-controls="sidebar-operations" onClick={() => toggleSidebarSection("operations")}><span>Operations Center</span>{sidebarSections.operations ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</button>
          {sidebarSections.operations && <nav className="main-nav" id="sidebar-operations">
            {nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => selectView(item.id)}><Icon size={19}/><span>{item.label}</span>{item.id === "finance" && activeClients.some((client) => client.health === "critical") && <i>{activeClients.filter((client) => client.health === "critical").length}</i>}</button>; })}
          </nav>}
          <button className="sidebar-section-label lower" aria-expanded={sidebarSections.administration} aria-controls="sidebar-administration" onClick={() => toggleSidebarSection("administration")}><span>Administration</span>{sidebarSections.administration ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</button>
          {sidebarSections.administration && <nav className="main-nav" id="sidebar-administration"><button className={view === "sales-explorer" ? "active" : ""} onClick={() => selectView("sales-explorer")}><ShoppingBasket size={19}/><span>Sales Explorer</span></button><button className={view === "receivables" ? "active" : ""} onClick={() => selectView("receivables")}><WalletCards size={19}/><span>Accounts Receivable</span></button><button className={view === "agenda" ? "active" : ""} onClick={() => selectView("agenda")}><ClipboardCheck size={19}/><span>Commercial Activities</span></button><button className={view === "goals" ? "active" : ""} onClick={() => selectView("goals")}><Target size={19}/><span>Commercial Goals</span></button></nav>}
          <button className="sidebar-section-label lower" aria-expanded={sidebarSections.reports} aria-controls="sidebar-reports" onClick={() => toggleSidebarSection("reports")}><span>Reports</span>{sidebarSections.reports ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</button>
          {sidebarSections.reports && <nav className="main-nav" id="sidebar-reports"><button className={view === "reports" ? "active" : ""} onClick={() => selectView("reports")}><LayoutDashboard size={19}/><span>Commercial Plan Status</span></button><button className={view === "commercial-sales" ? "active" : ""} onClick={() => selectView("commercial-sales")}><ShoppingBasket size={19}/><span>Commercial Sales</span></button><button className={view === "spt" ? "active" : ""} onClick={() => selectView("spt")}><BarChart3 size={19}/><span>Sales Performance</span></button><button className={view === "pending-balances" ? "active" : ""} onClick={() => selectView("pending-balances")}><WalletCards size={19}/><span>Pending Balances</span></button><button className={view === "non-buyers" ? "active" : ""} onClick={() => selectView("non-buyers")}><PackageSearch size={19}/><span>Dormant Accounts</span></button><button className={view === "mars" ? "active" : ""} onClick={() => selectView("mars")}><PawPrint size={19}/><span>Orbit Nutrition</span></button><button className={view === "nutripet" ? "active" : ""} onClick={() => selectView("nutripet")}><ShoppingBag size={19}/><span>Nova Pet</span></button><button className={view === "baires" ? "active" : ""} onClick={() => selectView("baires")}><Package size={19}/><span>Harbor Portfolio</span></button></nav>}
          <button className="sidebar-section-label lower compact" aria-expanded={sidebarSections.system} aria-controls="sidebar-system" onClick={() => toggleSidebarSection("system")}><span>System</span>{sidebarSections.system ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</button>
          {sidebarSections.system && <nav className="main-nav muted-nav" id="sidebar-system"><button className={view === "settings" ? "active" : ""} onClick={() => selectView("settings")}><Settings2 size={19}/><span>System Guide</span></button></nav>}
          <div className="sidebar-insight"><div><Sparkles size={16}/><span>Explainable engine</span></div><strong>{number(data.products.length)} products</strong><p>vectorized across {number(Object.keys(VECTOR_LABELS).length)} dimensions</p></div>
        </div>
        <div className="sidebar-footer"><span className={`source-dot ${data.meta.source}`}/><div><strong>v{APP_VERSION} · SMART Salice</strong><small>Local synthetic demo</small></div></div>
      </aside>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)}/>}

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open menu" onClick={() => setSidebarOpen(true)}><Menu size={20}/></button>
          <div className="topbar-title"><h1>{currentTitle.title}</h1><p>{currentTitle.subtitle}</p></div>
          <div className="topbar-actions">
            <div className={`global-search ${searchOpen ? "open" : ""}`}><Search size={17}/><input ref={searchInput} value={globalQuery} onFocus={() => setSearchOpen(true)} onChange={(event) => setGlobalQuery(event.target.value)} placeholder="Search customers, sellers, brands, or products"/><kbd>⌘ K</kbd>
              {searchOpen && <div className="global-search-results">
                {normalizedGlobalQuery.length < 2 && <p>Enter at least 2 characters to search the full demo dataset.</p>}
                {!!clientResults.length && <><span className="search-result-label">Customers</span>{clientResults.map((client) => <button key={client.id} onMouseDown={(event) => event.preventDefault()} onClick={() => openClient(client)}><Users size={15}/><div><strong>{clientPrimaryName(client)}</strong><span>{clientSecondaryName(client) ? `${clientSecondaryName(client)} \u00B7 ` : ""}{client.locality} · {client.active ? "Active" : "Inactive"} · P{client.visitPriority}</span></div><ChevronRight size={15}/></button>)}</>}
                {!!sellerResults.length && <><span className="search-result-label">Sales Team</span>{sellerResults.map((seller) => <button key={seller} onMouseDown={(event) => event.preventDefault()} onClick={() => openSeller(seller)}><Users size={15}/><div><strong>{seller}</strong><span>Open portfolio and performance</span></div><ChevronRight size={15}/></button>)}</>}
                {!!brandResults.length && <><span className="search-result-label">Brands</span>{brandResults.map((item) => <button key={item.brand} onMouseDown={(event) => event.preventDefault()} onClick={() => openBrand(item.brand)}><Store size={15}/><div><strong>{item.brand}</strong><span>Open brand products and performance</span></div><ChevronRight size={15}/></button>)}</>}
                {!!productResults.length && <><span className="search-result-label">Products</span>{productResults.map((product) => <div className="global-product-search-result" key={product.id}><button onMouseDown={(event) => event.preventDefault()} onClick={() => openProduct(product)}><Package size={15}/><div><strong>{product.name}</strong><span>{product.sku} · stock {product.stock}</span></div><ChevronRight size={15}/></button><button className="global-search-brand-link" onMouseDown={(event) => event.preventDefault()} onClick={() => openBrand(product.brand)}><Store size={12}/><span>{product.brand}</span></button></div>)}</>}
                {normalizedGlobalQuery.length >= 2 && !clientResults.length && !sellerResults.length && !brandResults.length && !productResults.length && <p>No matches found.</p>}
              </div>}
            </div>
            <div className="sync-action-wrap"><div className={`sync-chip ${data.meta.source} freshness-${dataHealth?.freshness.level ?? "unknown"}`} title="Deterministic local data pack; no network connection is used"><Database size={14}/><div><strong>{dataHealth?.freshness.label ?? "Validated synthetic demo"}</strong><span>Cutoff · {snapshotLabel}</span></div></div></div>
            <div className="notification-wrap"><button className="notification-button" aria-label="Notifications" onClick={() => { setNotificationsOpen((value) => !value); setSearchOpen(false); }}><Bell size={18}/>{!!notifications.length && <i>{number(notifications.length)}</i>}</button>{notificationsOpen && <div className="notification-panel"><div><span className="section-kicker"><AlertTriangle size={14}/> Priority management</span><h3>Operational alerts</h3><p>Due promises and high-risk accounts at the demo cutoff.</p></div>{notifications.map((item) => {
                const client = data.clients.find((candidate) => candidate.id === item.clientId);
                return <button key={item.id} onClick={() => {
                        if (item.type.startsWith("promise")) {
                            setView("receivables");
                            setNotificationsOpen(false);
                        }
                        else if (client)
                            openClient(client);
                    }}><span className={`score-badge ${item.severity}`}>{item.type.startsWith("promise") ? "$" : client?.collectionRisk}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div><ChevronRight size={15}/></button>;
            })}{!notifications.length && <p className="notification-empty">No actionable alerts right now.</p>}<button className="notification-all" onClick={() => { setView("receivables"); setNotificationsOpen(false); }}>Open accounts receivable</button></div>}</div>
            <div className="user-avatar">FM</div>
          </div>
        </header>

        {data.meta.disclaimer && <div className="demo-banner"><Database size={15}/><span><strong>Synthetic demo data only.</strong> {localizedDisclaimer(data.meta)}</span></div>}

        <div className="view-container"><Suspense fallback={<div className="view-loading"><RefreshCw className="spin" size={21}/><strong>Opening module…</strong></div>}>
          {view === "map" && <MapDashboard clients={data.clients} products={data.products} selected={selected} onSelect={(client) => { setSelectedId(client?.id ?? null); setClientProfileOpen(false); }} onExpandClient={() => setClientProfileOpen(true)} onOpenSeller={openSeller} onOpenProduct={openProduct} onOpenInvoice={openInvoice} snapshotDate={data.meta.generatedAt} onPlanRoute={planRoute} onNoteSaved={noteSaved} clientVisibility={mapClientVisibility} onClientVisibilityChange={setMapClientVisibility}/>}
          {view === "agenda" && <AgendaView clients={data.clients} products={data.products} onOpen={openClient} onOpenSeller={openSeller} onOpenProduct={openProduct} onPlanRoute={planRoute} onOperationalChange={refreshNotifications}/>}
          {view === "clients" && <ClientsView clients={data.clients} query={clientQuery} onQuery={setClientQuery} onOpen={openClient} onOpenSeller={openSeller}/>}
          {view === "sellers" && <SellersView clients={data.clients} snapshotDate={data.meta.generatedAt} selectedSeller={sellerFocus} onSelectSeller={setSellerFocus} onOpenClient={openClient}/>}
          {view === "finance" && <FinanceView clients={data.clients} onOpen={openClient} onOpenSeller={openSeller} onOpenInvoice={openInvoice} snapshotDate={data.meta.generatedAt.slice(0, 10)}/>}
          {view === "products" && <ProductsView products={data.products} focusProductId={productFocusId} tutorialVectorMode={tutorialStep != null && TUTORIAL_STEPS[tutorialStep]?.target === "vector-explorer"} onOpenBrand={openBrand}/>}
          {view === "brands" && <BrandsView products={data.products} focusBrand={brandFocus} onOpenProduct={openProduct}/>}
          {view === "routes" && <RoutesView clients={activeClients} initialClientId={routeClientId} onOpenClient={openClient} onOpenSeller={openSeller}/>}
          {view === "sales-explorer" && <SalesExplorerView clients={data.clients} onOpenClient={openClientById} onOpenProduct={openProduct} onOpenBrand={openBrand} onOpenInvoice={openInvoice}/>}
          {view === "receivables" && <ReceivablesView dataClients={data.clients} onOpenClient={openClient} onOpenSeller={openSeller} onOpenInvoice={openInvoice}/>}
          {view === "goals" && <GoalsView />}
          {view === "reports" && <ReportsView data={data} onOpen={openClient} onOpenSeller={openSeller} onOpenBrand={openBrand}/>}
          {view === "spt" && <SptReportView onOpenSeller={openSeller}/>}
          {view === "commercial-sales" && <CommercialSalesReportView onOpenProduct={openProduct} onOpenBrand={openBrand}/>}
          {view === "mars" && <MarsReportView onOpenBrand={openBrand}/>}
          {view === "nutripet" && <NutriPetReportView onOpenProduct={openProduct} onOpenBrand={openBrand}/>}
          {view === "baires" && <BairesReportView onOpenBrand={openBrand}/>}
          {view === "non-buyers" && <NonBuyersReportView data={data} onOpen={openClient} onOpenSeller={openSeller} onOpenBrand={openBrand}/>}
          {view === "pending-balances" && <PendingBalancesReportView data={data} onOpen={openClient} onOpenSeller={openSeller}/>}
          {view === "settings" && <SettingsView data={data} dataHealth={dataHealth} tutorialCompleted={tutorialCompleted} onStartTutorial={startTutorial}/>}
        </Suspense></div>
      </main>
      {clientProfileOpen && selected && <div className="client-drawer-layer"><button className="client-drawer-backdrop" aria-label="Close customer profile" onClick={() => {
                setClientProfileOpen(false);
                if (view !== "map")
                    setSelectedId(null);
            }}/><ClientPanel mode="full" client={selected} products={data.products} snapshotDate={data.meta.generatedAt} onClose={() => {
                setClientProfileOpen(false);
                if (view !== "map")
                    setSelectedId(null);
            }} onOpenSeller={openSeller} onOpenProduct={openProduct} onOpenInvoice={openInvoice} onPlanRoute={planRoute} onNoteSaved={noteSaved}/></div>}
      {productProfileOpen && selectedProduct && <div className="product-drawer-layer"><button className="product-drawer-backdrop" aria-label="Close product profile" onClick={() => setProductProfileOpen(false)}/><ProductPanel mode="popup" product={selectedProduct} products={data.products} onClose={() => setProductProfileOpen(false)} onOpenProduct={openProduct} onOpenCatalog={openProductCatalog} onOpenBrand={openBrand}/></div>}
      {invoiceFocusId && <InvoiceDetailDrawer invoiceId={invoiceFocusId} onClose={() => setInvoiceFocusId(null)} onOpenClient={openClientById} onOpenSeller={openSeller}/>}
      {tutorialStep != null && <TutorialOverlay stepIndex={tutorialStep} onBack={() => setTutorialStep((value) => value == null ? null : Math.max(0, value - 1))} onNext={nextTutorialStep} onClose={() => setTutorialStep(null)}/>}
    </div>);
}
