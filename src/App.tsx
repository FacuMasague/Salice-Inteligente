import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, Bell, Boxes, ChevronDown, ChevronRight, ChevronUp, CircleDollarSign, ClipboardCheck, Database, LayoutDashboard, Map, Menu, Package, PackageSearch, PawPrint, RefreshCw, Route, Search, Settings2, ShoppingBag, ShoppingBasket, Sparkles, Target, Users, WalletCards, X } from 'lucide-react';
import { VECTOR_LABELS, type Client, type DashboardData, type NotificationItem, type Product } from '../shared/models';
import type { DataHealthPayload } from '../shared/data-health';
import { ClientPanel } from './components/ClientPanel';
import { ProductPanel } from './components/ProductPanel';
import { TUTORIAL_STEPS, TutorialOverlay, type TutorialView } from './components/TutorialOverlay';
import type { ClientVisibility } from './views/MapDashboard';

const AgendaView = lazy(() => import('./views/AgendaView').then((module) => ({ default: module.AgendaView })));
const ClientsView = lazy(() => import('./views/ClientsView').then((module) => ({ default: module.ClientsView })));
const FinanceView = lazy(() => import('./views/FinanceView').then((module) => ({ default: module.FinanceView })));
const MapDashboard = lazy(() => import('./views/MapDashboard').then((module) => ({ default: module.MapDashboard })));
const ProductsView = lazy(() => import('./views/ProductsView').then((module) => ({ default: module.ProductsView })));
const ReportsView = lazy(() => import('./views/ReportsView').then((module) => ({ default: module.ReportsView })));
const RoutesView = lazy(() => import('./views/RoutesView').then((module) => ({ default: module.RoutesView })));
const SettingsView = lazy(() => import('./views/SettingsView').then((module) => ({ default: module.SettingsView })));
const SptReportView = lazy(() => import('./views/SptReportView').then((module) => ({ default: module.SptReportView })));
const CommercialSalesReportView = lazy(() => import('./views/CommercialSalesReportView').then((module) => ({ default: module.CommercialSalesReportView })));
const MarsReportView = lazy(() => import('./views/MarsReportView').then((module) => ({ default: module.MarsReportView })));
const NutriPetReportView = lazy(() => import('./views/NutriPetReportView').then((module) => ({ default: module.NutriPetReportView })));
const BairesReportView = lazy(() => import('./views/BairesReportView').then((module) => ({ default: module.BairesReportView })));
const NonBuyersReportView = lazy(() => import('./views/NonBuyersReportView').then((module) => ({ default: module.NonBuyersReportView })));
const PendingBalancesReportView = lazy(() => import('./views/PendingBalancesReportView').then((module) => ({ default: module.PendingBalancesReportView })));
const SellersView = lazy(() => import('./views/SellersView').then((module) => ({ default: module.SellersView })));
const SalesExplorerView = lazy(() => import('./views/SalesExplorerView').then((module) => ({ default: module.SalesExplorerView })));
const ReceivablesView = lazy(() => import('./views/ReceivablesView').then((module) => ({ default: module.ReceivablesView })));
const GoalsView = lazy(() => import('./views/GoalsView').then((module) => ({ default: module.GoalsView })));

type View = TutorialView;
type SidebarSection = 'operations' | 'administration' | 'reports' | 'system';

const viewSection: Record<View, SidebarSection> = {
  map: 'operations', agenda: 'operations', clients: 'operations', sellers: 'operations', finance: 'operations', products: 'operations', routes: 'operations',
  'sales-explorer': 'administration', receivables: 'administration', goals: 'administration',
  reports: 'reports', spt: 'reports', 'commercial-sales': 'reports', mars: 'reports', nutripet: 'reports', baires: 'reports', 'non-buyers': 'reports', 'pending-balances': 'reports',
  settings: 'system',
};

const titles: Record<View, { title: string; subtitle: string }> = {
  map: { title: 'Pulso comercial', subtitle: 'Clientes, oportunidades y riesgo sobre el territorio' },
  agenda: { title: 'Agenda operativa', subtitle: 'Prioridades, gestiones y compromisos del equipo comercial' },
  clients: { title: 'Clientes', subtitle: 'Toda la cartera comercial en una sola vista' },
  sellers: { title: 'Vendedores', subtitle: 'Carteras, desempeño, cobranza y prioridades por responsable' },
  finance: { title: 'Cartera y cobranzas', subtitle: 'Vencimientos, saldos y comportamiento de pago' },
  products: { title: 'Inteligencia de producto', subtitle: 'Catálogo vectorizado para comparar y recomendar' },
  routes: { title: 'Planificación de rutas', subtitle: 'Recorridos comerciales priorizados y explicables' },
  'sales-explorer': { title: 'Explorador de ventas', subtitle: 'Del indicador al período, cliente, producto y comprobante' },
  receivables: { title: 'Cuentas por cobrar', subtitle: 'Cartera, responsables, estados y seguimiento administrativo' },
  goals: { title: 'Objetivos comerciales', subtitle: 'Planificación propia, versiones, cambios y cumplimiento' },
  reports: { title: 'Reporte General', subtitle: 'Objetivos, resultados y estado comercial de Salice' },
  spt: { title: 'SPT Vol vs mes anterior', subtitle: 'Volumen en kilos, evolución, vendedores y comparación temporal' },
  'commercial-sales': { title: 'Ventas · Comercial', subtitle: 'Venta neta, evolución, marcas y composición del negocio' },
  mars: { title: 'Reporte Mars', subtitle: 'Volumen, clientes y períodos comerciales del proveedor Mars' },
  nutripet: { title: 'Reporte NutriPet', subtitle: 'Volumen, cobertura y evolución mensual del proveedor NutriPet' },
  baires: { title: 'Reporte Baires', subtitle: 'Volumen, clientes y composición de Baires SPT y Baires Masivo' },
  'non-buyers': { title: 'Cuentas no compradoras', subtitle: 'Recuperación de cuentas y marcas sin compra reciente' },
  'pending-balances': { title: 'Saldos Pendientes', subtitle: 'Cartera abierta, vencimientos y presión sobre ventas recientes' },
  settings: { title: 'Configuración', subtitle: 'Tutorial, reglas operativas y calidad de datos' },
};

const nav: { id: View; label: string; icon: typeof Map }[] = [
  { id: 'map', label: 'Mapa operativo', icon: Map },
  { id: 'agenda', label: 'Agenda', icon: ClipboardCheck },
  { id: 'routes', label: 'Rutas', icon: Route },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'sellers', label: 'Vendedores', icon: Users },
  { id: 'finance', label: 'Cartera', icon: CircleDollarSign },
  { id: 'products', label: 'Productos', icon: Boxes },
];

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('map');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [clientProfileOpen, setClientProfileOpen] = useState(false);
  const [sellerFocus, setSellerFocus] = useState('');
  const [routeClientId, setRouteClientId] = useState<number | null>(null);
  const [clientQuery, setClientQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarSections, setSidebarSections] = useState<Record<SidebarSection, boolean>>({ operations: true, administration: true, reports: true, system: true });
  const [mapClientVisibility, setMapClientVisibility] = useState<ClientVisibility>('active');
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [tutorialCompleted, setTutorialCompleted] = useState(() => localStorage.getItem('salice-tutorial-v032') === 'completed');
  const [globalQuery, setGlobalQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [productFocusId, setProductFocusId] = useState<string | null>(null);
  const [productProfileOpen, setProductProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [dataHealth, setDataHealth] = useState<DataHealthPayload | null>(null);
  const [reloadingData, setReloadingData] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((response) => {
        if (!response.ok) throw new Error('El servidor de datos no respondió');
        return response.json();
      })
      .then(setData)
      .catch((cause: Error) => setError(cause.message));
  }, []);

  const refreshDataHealth = () => {
    fetch('/api/system/data-health').then((response) => response.ok ? response.json() : null).then(setDataHealth).catch(() => setDataHealth(null));
  };

  useEffect(refreshDataHealth, []);

  const reloadLocalData = async () => {
    if (reloadingData) return;
    setReloadingData(true);
    try {
      const [dashboardResponse, healthResponse] = await Promise.all([
        fetch('/api/dashboard', { cache: 'no-store' }),
        fetch('/api/system/data-health', { cache: 'no-store' }),
      ]);
      if (!dashboardResponse.ok) throw new Error('No se pudo releer el snapshot');
      setData(await dashboardResponse.json());
      if (healthResponse.ok) setDataHealth(await healthResponse.json());
    } catch (cause) {
      console.error(cause);
    } finally {
      setReloadingData(false);
    }
  };

  const refreshNotifications = () => {
    fetch('/api/notifications').then((response) => response.json()).then((payload) => setNotifications(payload.items || [])).catch(() => setNotifications([]));
  };

  useEffect(refreshNotifications, []);

  useEffect(() => {
    const section = viewSection[view];
    setSidebarSections((current) => current[section] ? current : { ...current, [section]: true });
  }, [view]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchInput.current?.focus());
      }
      if (event.key === 'Escape') { setSearchOpen(false); setNotificationsOpen(false); setProductProfileOpen(false); setClientProfileOpen(false); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);

  useEffect(() => {
    if (tutorialStep == null || !data) return;
    const step = TUTORIAL_STEPS[tutorialStep];
    setView(step.view);
    setSidebarOpen(false);
    if (step.target === 'client-panel') {
      const tutorialClient = [...data.clients]
        .filter((client) => client.active && client.coordinates !== null)
        .sort((a, b) => b.visitPriority - a.visitPriority)[0];
      setMapClientVisibility('active');
      setSelectedId(tutorialClient?.id ?? null);
      setClientProfileOpen(false);
    } else {
      setSelectedId(null);
      setClientProfileOpen(false);
    }
  }, [data, tutorialStep]);

  const selected = useMemo(() => data?.clients.find((client) => client.id === selectedId) || null, [data, selectedId]);
  const selectedProduct = useMemo(() => data?.products.find((product) => product.id === productFocusId) || null, [data, productFocusId]);
  const activeClients = useMemo(() => data?.clients.filter((client) => client.active) ?? [], [data]);
  const openClient = (client: Client) => { setSelectedId(client.id); setClientProfileOpen(true); setProductProfileOpen(false); setSearchOpen(false); setNotificationsOpen(false); };
  const openClientById = (clientId: number) => { const client = data?.clients.find((candidate) => candidate.id === clientId); if (client) openClient(client); };
  const openProduct = (value: Product | string) => { const product = typeof value === 'string' ? data?.products.find((candidate) => candidate.id === value) : value; if (!product) return; setProductFocusId(product.id); setProductProfileOpen(true); setSearchOpen(false); setNotificationsOpen(false); };
  const openProductCatalog = (product: Product) => { setProductFocusId(product.id); setProductProfileOpen(false); setClientProfileOpen(false); setSelectedId(null); setView('products'); };
  const openSeller = (seller: string) => { if (!seller || seller === 'Sin vendedor') return; setSellerFocus(seller); setView('sellers'); setSelectedId(null); setClientProfileOpen(false); setProductProfileOpen(false); setSearchOpen(false); setNotificationsOpen(false); };
  const selectView = (next: View) => { setView(next); setSidebarOpen(false); setClientProfileOpen(false); setProductProfileOpen(false); if (next !== 'map') setSelectedId(null); };
  const toggleSidebarSection = (section: SidebarSection) => setSidebarSections((current) => ({ ...current, [section]: !current[section] }));
  const planRoute = (clientId: number) => { if (!data?.clients.find((client) => client.id === clientId)?.active) return; setRouteClientId(clientId); setView('routes'); setSelectedId(null); setClientProfileOpen(false); };
  const noteSaved = (clientId: number, note: string) => setData((current) => current ? ({ ...current, clients: current.clients.map((client) => client.id === clientId ? { ...client, note } : client) }) : current);
  const startTutorial = () => setTutorialStep(0);
  const finishTutorial = () => {
    localStorage.setItem('salice-tutorial-v032', 'completed');
    setTutorialCompleted(true);
    setTutorialStep(null);
    setSelectedId(null);
    setView('settings');
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
    .filter((client) => client.active && client.seller !== 'Sin vendedor' && client.seller.toLowerCase().includes(normalizedGlobalQuery))
    .map((client) => client.seller))].sort((a, b) => a.localeCompare(b, 'es')).slice(0, 5), [data, normalizedGlobalQuery]);
  const nextTutorialStep = () => {
    if (tutorialStep == null) return;
    if (tutorialStep === TUTORIAL_STEPS.length - 1) finishTutorial();
    else setTutorialStep(tutorialStep + 1);
  };

  if (error) return <main className="boot-screen"><div className="boot-logo">S</div><h1>No pudimos abrir Salice Inteligente</h1><p>{error}. Ejecutá <code>pnpm run dev</code> y volvé a intentar.</p><button className="button primary" onClick={() => location.reload()}><RefreshCw size={16} /> Reintentar</button></main>;
  if (!data) return <main className="boot-screen"><div className="boot-logo loading">S</div><h1>Preparando el centro operativo</h1><p>Cargando clientes, productos y cuenta corriente…</p></main>;

  const currentTitle = titles[view];
  const snapshotDate = new Date(data.meta.generatedAt);
  const snapshotDay = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(snapshotDate).replace('.', '');
  const snapshotTime = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(snapshotDate);
  const snapshotLabel = `${snapshotDay} · ${snapshotTime}`;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark"><span>S</span></div><div><strong>SALICE</strong><small>INTELIGENTE</small></div><button className="mobile-close" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)}><X size={19} /></button></div>
        <div className="sidebar-scroll">
          <button className="sidebar-section-label" aria-expanded={sidebarSections.operations} aria-controls="sidebar-operations" onClick={() => toggleSidebarSection('operations')}><span>Centro operativo</span>{sidebarSections.operations ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          {sidebarSections.operations && <nav className="main-nav" id="sidebar-operations">
            {nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => selectView(item.id)}><Icon size={19} /><span>{item.label}</span>{item.id === 'finance' && activeClients.some((client) => client.health === 'critical') && <i>{activeClients.filter((client) => client.health === 'critical').length}</i>}</button>; })}
          </nav>}
          <button className="sidebar-section-label lower" aria-expanded={sidebarSections.administration} aria-controls="sidebar-administration" onClick={() => toggleSidebarSection('administration')}><span>Administración</span>{sidebarSections.administration ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          {sidebarSections.administration && <nav className="main-nav" id="sidebar-administration"><button className={view === 'sales-explorer' ? 'active' : ''} onClick={() => selectView('sales-explorer')}><ShoppingBasket size={19} /><span>Explorador de ventas</span></button><button className={view === 'receivables' ? 'active' : ''} onClick={() => selectView('receivables')}><WalletCards size={19} /><span>Cuentas por cobrar</span></button><button className={view === 'goals' ? 'active' : ''} onClick={() => selectView('goals')}><Target size={19} /><span>Objetivos comerciales</span></button></nav>}
          <button className="sidebar-section-label lower" aria-expanded={sidebarSections.reports} aria-controls="sidebar-reports" onClick={() => toggleSidebarSection('reports')}><span>Reportes</span>{sidebarSections.reports ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          {sidebarSections.reports && <nav className="main-nav" id="sidebar-reports"><button className={view === 'reports' ? 'active' : ''} onClick={() => selectView('reports')}><LayoutDashboard size={19} /><span>Reporte General</span></button><button className={view === 'commercial-sales' ? 'active' : ''} onClick={() => selectView('commercial-sales')}><ShoppingBasket size={19} /><span>Ventas · Comercial</span></button><button className={view === 'spt' ? 'active' : ''} onClick={() => selectView('spt')}><BarChart3 size={19} /><span>SPT Vol vs mes anterior</span></button><button className={view === 'pending-balances' ? 'active' : ''} onClick={() => selectView('pending-balances')}><WalletCards size={19} /><span>Saldos Pendientes</span></button><button className={view === 'non-buyers' ? 'active' : ''} onClick={() => selectView('non-buyers')}><PackageSearch size={19} /><span>Cuentas no compradoras</span></button><button className={view === 'mars' ? 'active' : ''} onClick={() => selectView('mars')}><PawPrint size={19} /><span>Reporte Mars</span></button><button className={view === 'nutripet' ? 'active' : ''} onClick={() => selectView('nutripet')}><ShoppingBag size={19} /><span>Reporte NutriPet</span></button><button className={view === 'baires' ? 'active' : ''} onClick={() => selectView('baires')}><Package size={19} /><span>Reporte Baires</span></button></nav>}
          <button className="sidebar-section-label lower compact" aria-expanded={sidebarSections.system} aria-controls="sidebar-system" onClick={() => toggleSidebarSection('system')}><span>Sistema</span>{sidebarSections.system ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          {sidebarSections.system && <nav className="main-nav muted-nav" id="sidebar-system"><button className={view === 'settings' ? 'active' : ''} onClick={() => selectView('settings')}><Settings2 size={19} /><span>Configuración</span></button></nav>}
          <div className="sidebar-insight"><div><Sparkles size={16} /><span>Motor activo</span></div><strong>{data.products.length} productos</strong><p>vectorizados en {Object.keys(VECTOR_LABELS).length} dimensiones</p></div>
        </div>
        <div className="sidebar-footer"><span className={`source-dot ${data.meta.source}`} /><div><strong>v{data.meta.version} · {data.meta.sourceLabel}</strong><small>{data.meta.source === 'demo' ? 'Esperando URL de GESI' : 'Snapshot conectado'}</small></div></div>
      </aside>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Abrir menú" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="topbar-title"><h1>{currentTitle.title}</h1><p>{currentTitle.subtitle}</p></div>
          <div className="topbar-actions">
            <div className={`global-search ${searchOpen ? 'open' : ''}`}><Search size={17} /><input ref={searchInput} value={globalQuery} onFocus={() => setSearchOpen(true)} onChange={(event) => setGlobalQuery(event.target.value)} placeholder="Buscar cliente, vendedor o producto" /><kbd>⌘ K</kbd>
              {searchOpen && <div className="global-search-results">
                {normalizedGlobalQuery.length < 2 && <p>Escribí al menos 2 caracteres para buscar en toda la base.</p>}
                {!!clientResults.length && <><span className="search-result-label">Clientes</span>{clientResults.map((client) => <button key={client.id} onMouseDown={(event) => event.preventDefault()} onClick={() => openClient(client)}><Users size={15} /><div><strong>{client.tradeName}</strong><span>{client.locality} · {client.active ? 'Activo' : 'Inactivo'} · P{client.visitPriority}</span></div><ChevronRight size={15} /></button>)}</>}
                {!!sellerResults.length && <><span className="search-result-label">Vendedores</span>{sellerResults.map((seller) => <button key={seller} onMouseDown={(event) => event.preventDefault()} onClick={() => openSeller(seller)}><Users size={15} /><div><strong>{seller}</strong><span>Abrir cartera y desempeño</span></div><ChevronRight size={15} /></button>)}</>}
                {!!productResults.length && <><span className="search-result-label">Productos</span>{productResults.map((product) => <button key={product.id} onMouseDown={(event) => event.preventDefault()} onClick={() => openProduct(product)}><Package size={15} /><div><strong>{product.name}</strong><span>{product.brand} · stock {product.stock}</span></div><ChevronRight size={15} /></button>)}</>}
                {normalizedGlobalQuery.length >= 2 && !clientResults.length && !sellerResults.length && !productResults.length && <p>No encontramos coincidencias.</p>}
              </div>}
            </div>
            <button className={`sync-chip ${data.meta.source} freshness-${dataHealth?.freshness.level ?? 'unknown'}`} onClick={reloadLocalData} title="Releer el último snapshot validado del servidor"><Database size={14} /><div><strong>{reloadingData ? 'Releyendo datos…' : dataHealth?.freshness.label ?? (data.meta.source === 'demo' ? 'Modo demo' : 'Snapshot validado')}</strong><span>Foto · {snapshotLabel}</span></div>{reloadingData && <RefreshCw className="spin" size={14} />}</button>
            <div className="notification-wrap"><button className="notification-button" aria-label="Notificaciones" onClick={() => { setNotificationsOpen((value) => !value); setSearchOpen(false); }}><Bell size={18} />{!!notifications.length && <i>{notifications.length}</i>}</button>{notificationsOpen && <div className="notification-panel"><div><span className="section-kicker"><AlertTriangle size={14} /> Gestión prioritaria</span><h3>Alertas operativas</h3><p>Promesas exigibles y riesgos altos de la foto actual.</p></div>{notifications.map((item) => { const client = data.clients.find((candidate) => candidate.id === item.clientId); return <button key={item.id} onClick={() => { if (item.type.startsWith('promise')) { setView('agenda'); setNotificationsOpen(false); } else if (client) openClient(client); }}><span className={`score-badge ${item.severity}`}>{item.type.startsWith('promise') ? '$' : client?.collectionRisk}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div><ChevronRight size={15} /></button>; })}{!notifications.length && <p className="notification-empty">No hay alertas accionables en este momento.</p>}<button className="notification-all" onClick={() => { setView('agenda'); setNotificationsOpen(false); }}>Abrir agenda operativa</button></div>}</div>
            <div className="user-avatar">FM</div>
          </div>
        </header>

        {data.meta.disclaimer && <div className={`demo-banner ${data.meta.source === 'gesi' ? 'connected' : ''}`}><Database size={15} /><span><strong>{data.meta.source === 'demo' ? 'Prototipo con datos demostrativos.' : 'Snapshot real de Salice.'}</strong> {data.meta.disclaimer}</span></div>}

        <div className="view-container"><Suspense fallback={<div className="view-loading"><RefreshCw className="spin" size={21} /><strong>Abriendo módulo…</strong></div>}>
          {view === 'map' && <MapDashboard clients={data.clients} products={data.products} selected={selected} onSelect={(client) => { setSelectedId(client?.id ?? null); setClientProfileOpen(false); }} onExpandClient={() => setClientProfileOpen(true)} onOpenSeller={openSeller} onOpenProduct={openProduct} snapshotDate={data.meta.generatedAt} onPlanRoute={planRoute} onNoteSaved={noteSaved} clientVisibility={mapClientVisibility} onClientVisibilityChange={setMapClientVisibility} />}
          {view === 'agenda' && <AgendaView clients={data.clients} products={data.products} onOpen={openClient} onOpenSeller={openSeller} onOpenProduct={openProduct} onPlanRoute={planRoute} onOperationalChange={refreshNotifications} />}
          {view === 'clients' && <ClientsView clients={data.clients} query={clientQuery} onQuery={setClientQuery} onOpen={openClient} onOpenSeller={openSeller} />}
          {view === 'sellers' && <SellersView clients={data.clients} snapshotDate={data.meta.generatedAt} selectedSeller={sellerFocus} onSelectSeller={setSellerFocus} onOpenClient={openClient} />}
          {view === 'finance' && <FinanceView clients={data.clients} onOpen={openClient} onOpenSeller={openSeller} snapshotDate={data.meta.generatedAt.slice(0, 10)} />}
          {view === 'products' && <ProductsView products={data.products} focusProductId={productFocusId} tutorialVectorMode={tutorialStep != null && TUTORIAL_STEPS[tutorialStep]?.target === 'vector-explorer'} />}
          {view === 'routes' && <RoutesView clients={activeClients} initialClientId={routeClientId} onOpenClient={openClient} onOpenSeller={openSeller} />}
          {view === 'sales-explorer' && <SalesExplorerView onOpenClient={openClientById} onOpenProduct={openProduct} />}
          {view === 'receivables' && <ReceivablesView dataClients={data.clients} onOpenClient={openClient} />}
          {view === 'goals' && <GoalsView />}
          {view === 'reports' && <ReportsView data={data} onOpen={openClient} onOpenSeller={openSeller} />}
          {view === 'spt' && <SptReportView onOpenSeller={openSeller} />}
          {view === 'commercial-sales' && <CommercialSalesReportView onOpenProduct={openProduct} />}
          {view === 'mars' && <MarsReportView />}
          {view === 'nutripet' && <NutriPetReportView onOpenProduct={openProduct} />}
          {view === 'baires' && <BairesReportView />}
          {view === 'non-buyers' && <NonBuyersReportView data={data} onOpen={openClient} onOpenSeller={openSeller} />}
          {view === 'pending-balances' && <PendingBalancesReportView data={data} onOpen={openClient} onOpenSeller={openSeller} />}
          {view === 'settings' && <SettingsView data={data} dataHealth={dataHealth} tutorialCompleted={tutorialCompleted} onStartTutorial={startTutorial} />}
        </Suspense></div>
      </main>
      {clientProfileOpen && selected && <div className="client-drawer-layer"><button className="client-drawer-backdrop" aria-label="Cerrar ficha" onClick={() => { setClientProfileOpen(false); if (view !== 'map') setSelectedId(null); }} /><ClientPanel mode="full" client={selected} products={data.products} snapshotDate={data.meta.generatedAt} onClose={() => { setClientProfileOpen(false); if (view !== 'map') setSelectedId(null); }} onOpenSeller={openSeller} onOpenProduct={openProduct} onPlanRoute={planRoute} onNoteSaved={noteSaved} /></div>}
      {productProfileOpen && selectedProduct && <div className="product-drawer-layer"><button className="product-drawer-backdrop" aria-label="Cerrar ficha de producto" onClick={() => setProductProfileOpen(false)} /><ProductPanel mode="popup" product={selectedProduct} products={data.products} onClose={() => setProductProfileOpen(false)} onOpenProduct={openProduct} onOpenCatalog={openProductCatalog} /></div>}
      {tutorialStep != null && <TutorialOverlay stepIndex={tutorialStep} onBack={() => setTutorialStep((value) => value == null ? null : Math.max(0, value - 1))} onNext={nextTutorialStep} onClose={() => setTutorialStep(null)} />}
    </div>
  );
}
