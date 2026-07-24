import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, Bell, Boxes, ChevronDown, ChevronRight, ChevronUp, CircleDollarSign, ClipboardCheck, Database, LayoutDashboard, Map, Menu, Package, PackageSearch, PanelLeftClose, PanelLeftOpen, PawPrint, RefreshCw, Route, Search, Settings2, ShoppingBag, ShoppingBasket, Sparkles, Store, Target, Users, WalletCards, X } from 'lucide-react';
import { APP_VERSION, VECTOR_LABELS, type Client, type DashboardData, type NotificationItem, type Product } from '../shared/models';
import type { DataHealthPayload } from '../shared/data-health';
import { ClientPanel } from './components/ClientPanel';
import { DeliverySheetDetailDrawer } from './components/DeliverySheetDetailDrawer';
import { InvoiceDetailDrawer } from './components/InvoiceDetailDrawer';
import { ProductPanel } from './components/ProductPanel';
import { TUTORIAL_STEPS, TutorialOverlay, type TutorialView } from './components/TutorialOverlay';
import { clientPrimaryName, clientSecondaryName } from './lib/client-name';
import { number } from './lib/format';
import type { ClientVisibility } from './views/MapDashboard';

const AgendaView = lazy(() => import('./views/AgendaView').then((module) => ({ default: module.AgendaView })));
const ClientsView = lazy(() => import('./views/ClientsView').then((module) => ({ default: module.ClientsView })));
const FinanceView = lazy(() => import('./views/FinanceView').then((module) => ({ default: module.FinanceView })));
const MapDashboard = lazy(() => import('./views/MapDashboard').then((module) => ({ default: module.MapDashboard })));
const ProductsView = lazy(() => import('./views/ProductsView').then((module) => ({ default: module.ProductsView })));
const BrandsView = lazy(() => import('./views/BrandsView').then((module) => ({ default: module.BrandsView })));
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
  map: 'operations', clients: 'operations', sellers: 'operations', products: 'operations', brands: 'operations', routes: 'operations',
  finance: 'administration', agenda: 'administration', 'sales-explorer': 'administration', receivables: 'administration', goals: 'administration',
  reports: 'reports', spt: 'reports', 'commercial-sales': 'reports', mars: 'reports', nutripet: 'reports', baires: 'reports', 'non-buyers': 'reports', 'pending-balances': 'reports',
  settings: 'system',
};

const titles: Record<View, { title: string; subtitle: string }> = {
  map: { title: 'Pulso comercial', subtitle: 'Clientes, oportunidades y riesgo sobre el territorio' },
  agenda: { title: 'Bandeja comercial', subtitle: 'Señales, oportunidades, compromisos y notas de oficina' },
  clients: { title: 'Clientes', subtitle: 'Toda la cartera comercial en una sola vista' },
  sellers: { title: 'Vendedores y carteras', subtitle: 'Clientes activos, ventas, localidades y señales por responsable' },
  finance: { title: 'Cartera y cobranzas', subtitle: 'Vencimientos, saldos y comportamiento de pago' },
  products: { title: 'Inteligencia de producto', subtitle: 'Inventario, catálogo y oportunidades con análisis avanzados agrupados' },
  brands: { title: 'Marcas', subtitle: 'Productos, compra, stock y desempeño por marca' },
  routes: { title: 'Rutas de reparto', subtitle: 'Facturas, fojas y recorridos estimados desde la oficina' },
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
  { id: 'routes', label: 'Rutas', icon: Route },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'sellers', label: 'Vendedores', icon: Users },
  { id: 'products', label: 'Productos', icon: Boxes },
  { id: 'brands', label: 'Marcas', icon: Store },
];

function localizedDisclaimer(meta: DashboardData['meta']) {
  if (!meta.disclaimer) return '';
  const coverageValues = [...new Set(Object.values(meta.coverage ?? {}).filter((value): value is number => typeof value === 'number' && value >= 1000))]
    .sort((left, right) => right - left);
  return coverageValues.reduce((text, value) => text.replace(new RegExp(`\\b${value}\\b`, 'g'), number(value)), meta.disclaimer);
}

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarSections, setSidebarSections] = useState<Record<SidebarSection, boolean>>({ operations: true, administration: true, reports: true, system: true });
  const [mapClientVisibility, setMapClientVisibility] = useState<ClientVisibility>('active');
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [tutorialCompleted, setTutorialCompleted] = useState(() => localStorage.getItem('salice-tutorial-v070') === 'completed');
  const [globalQuery, setGlobalQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [productFocusId, setProductFocusId] = useState<string | null>(null);
  const [productFamilyFocus, setProductFamilyFocus] = useState('');
  const [productProfileOpen, setProductProfileOpen] = useState(false);
  const [productComparisonIds, setProductComparisonIds] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('salice-product-comparison-v055') ?? '[]');
      return Array.isArray(stored) ? [...new Set(stored.map(String))].slice(0, 4) : [];
    } catch { return []; }
  });
  const [productComparisonRequest, setProductComparisonRequest] = useState(0);
  const [brandFocus, setBrandFocus] = useState('');
  const [invoiceFocusId, setInvoiceFocusId] = useState<string | null>(null);
  const [sheetFocusId, setSheetFocusId] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [dataHealth, setDataHealth] = useState<DataHealthPayload | null>(null);
  const [reloadingData, setReloadingData] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState<{ tone: 'working' | 'success' | 'error'; message: string } | null>(null);
  const refreshPollTimer = useRef<number | null>(null);
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

  const reloadLocalData = async (force = false) => {
    if (reloadingData && !force) return;
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

  useEffect(() => () => { if (refreshPollTimer.current != null) window.clearTimeout(refreshPollTimer.current); }, []);

  const refreshFromGesi = async () => {
    if (reloadingData || dataHealth?.refresh.current) return;
    setReloadingData(true);
    setRefreshFeedback({ tone: 'working', message: 'Iniciando actualización desde GESI…' });
    let requestedAt = Date.now();
    try {
      const response = await fetch('/api/system/refresh', { method: 'POST' });
      const payload = await response.json().catch(() => ({})) as { error?: string; startedAt?: string | null; refresh?: { startedAt?: string } | null };
      if (!response.ok && response.status !== 409) throw new Error(payload.error ?? 'No se pudo iniciar la actualización.');
      const attachedStart = payload.startedAt ?? payload.refresh?.startedAt;
      if (attachedStart && Number.isFinite(new Date(attachedStart).getTime())) requestedAt = new Date(attachedStart).getTime();
      const poll = async (): Promise<void> => {
        const [healthResponse, processResponse] = await Promise.all([
          fetch('/api/system/data-health', { cache: 'no-store' }),
          fetch('/api/system/refresh', { cache: 'no-store' }),
        ]);
        if (!healthResponse.ok) throw new Error('No se pudo consultar el avance de la actualización.');
        const health = await healthResponse.json() as DataHealthPayload;
        const processStatus = processResponse.ok
          ? await processResponse.json() as { running?: boolean; lastExit?: { code: number | null; signal: string | null } | null }
          : null;
        setDataHealth(health);
        if (health.refresh.current) {
          setRefreshFeedback({ tone: 'working', message: `Actualizando GESI · ${health.refresh.current.stage}` });
          refreshPollTimer.current = window.setTimeout(() => { poll().catch(finishWithError); }, 3000);
          return;
        }
        const attempt = health.refresh.lastAttempt;
        if (!attempt || new Date(attempt.startedAt).getTime() < requestedAt - 5000) {
          if (processStatus && !processStatus.running) {
            const exit = processStatus.lastExit;
            throw new Error(exit?.signal
              ? `La actualización no pudo iniciarse o terminó por la señal ${exit.signal}.`
              : `La actualización no pudo iniciarse${exit?.code != null ? ` (código ${exit.code})` : ''}.`);
          }
          refreshPollTimer.current = window.setTimeout(() => { poll().catch(finishWithError); }, 1500);
          return;
        }
        if (attempt.status === 'failed') throw new Error(`La actualización falló en ${attempt.stage}: ${attempt.error ?? 'sin detalle'}`);
        await reloadLocalData(true);
        refreshNotifications();
        setRefreshFeedback({ tone: 'success', message: 'Actualización completada y publicada.' });
        setReloadingData(false);
        window.setTimeout(() => setRefreshFeedback(null), 7000);
      };
      const finishWithError = (cause: unknown) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        setReloadingData(false);
        setRefreshFeedback({ tone: 'error', message });
      };
      await poll();
    } catch (cause) {
      setReloadingData(false);
      setRefreshFeedback({ tone: 'error', message: cause instanceof Error ? cause.message : String(cause) });
    }
  };

  const refreshNotifications = () => {
    fetch('/api/notifications').then((response) => response.json()).then((payload) => setNotifications(payload.items || [])).catch(() => setNotifications([]));
  };

  useEffect(refreshNotifications, []);

  useEffect(() => {
    localStorage.setItem('salice-product-comparison-v055', JSON.stringify(productComparisonIds));
  }, [productComparisonIds]);

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
      if (event.key === 'Escape') { setSearchOpen(false); setNotificationsOpen(false); setProductProfileOpen(false); setClientProfileOpen(false); setInvoiceFocusId(null); setSheetFocusId(null); }
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
  const openClient = (client: Client) => { setSelectedId(client.id); setClientProfileOpen(true); setProductProfileOpen(false); setInvoiceFocusId(null); setSheetFocusId(null); setSearchOpen(false); setNotificationsOpen(false); };
  const openClientById = (clientId: number) => { const client = data?.clients.find((candidate) => candidate.id === clientId); if (client) openClient(client); };
  const openProduct = (value: Product | string) => { const product = typeof value === 'string' ? data?.products.find((candidate) => candidate.id === value) : value; if (!product) return; setProductFocusId(product.id); setProductProfileOpen(true); setSearchOpen(false); setNotificationsOpen(false); };
  const addProductToComparison = (product: Product) => {
    setProductComparisonIds((current) => current.includes(product.id) ? current : current.length < 4 ? [...current, product.id] : current);
    setProductFocusId(null);
    setProductProfileOpen(false);
    setClientProfileOpen(false);
    setView('products');
    setProductComparisonRequest((current) => current + 1);
  };
  const openBrand = (brand: string) => { if (!brand || brand.startsWith('Sin ')) return; setBrandFocus(brand); setView('brands'); setSelectedId(null); setClientProfileOpen(false); setProductProfileOpen(false); setSearchOpen(false); setNotificationsOpen(false); };
  const openProductCatalog = (product: Product) => { setProductFocusId(product.id); setProductProfileOpen(false); setClientProfileOpen(false); setSelectedId(null); setView('products'); };
  const openProductFamily = (family: string) => { if (!family || family.startsWith('Sin ')) return; setProductFamilyFocus(family); setProductProfileOpen(false); setClientProfileOpen(false); setSelectedId(null); setView('products'); };
  const openSeller = (seller: string) => { if (!seller || seller === 'Sin vendedor') return; setSellerFocus(seller); setView('sellers'); setSelectedId(null); setClientProfileOpen(false); setProductProfileOpen(false); setInvoiceFocusId(null); setSheetFocusId(null); setSearchOpen(false); setNotificationsOpen(false); };
  const openInvoice = (invoiceId: string) => { setInvoiceFocusId(invoiceId); setSheetFocusId(null); setSearchOpen(false); setNotificationsOpen(false); };
  const openSheet = (sheetId: number) => { if (!data?.logistics.sheets.some((sheet) => sheet.id === sheetId)) return; setSheetFocusId(sheetId); setInvoiceFocusId(null); setSearchOpen(false); setNotificationsOpen(false); };
  const selectView = (next: View) => { setView(next); setSidebarOpen(false); setClientProfileOpen(false); setProductProfileOpen(false); setInvoiceFocusId(null); setSheetFocusId(null); if (next !== 'map') setSelectedId(null); };
  const toggleSidebarSection = (section: SidebarSection) => setSidebarSections((current) => ({ ...current, [section]: !current[section] }));
  const planRoute = (clientId: number) => { if (!data?.clients.find((client) => client.id === clientId)?.active) return; setRouteClientId(clientId); setView('routes'); setSelectedId(null); setClientProfileOpen(false); };
  const noteSaved = (clientId: number, note: string) => setData((current) => current ? ({ ...current, clients: current.clients.map((client) => client.id === clientId ? { ...client, note } : client) }) : current);
  const startTutorial = () => setTutorialStep(0);
  const finishTutorial = () => {
    localStorage.setItem('salice-tutorial-v070', 'completed');
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
  const brandResults = useMemo(() => !data || normalizedGlobalQuery.length < 2 ? [] : [...new Set(data.products
    .map((product) => product.brand)
    .filter((brand) => brand && !brand.startsWith('Sin ') && brand.toLowerCase().includes(normalizedGlobalQuery)))]
    .map((brand) => ({ brand, sales90d: data.products.filter((product) => product.brand === brand).reduce((sum, product) => sum + product.sales90d, 0) }))
    .sort((a, b) => b.sales90d - a.sales90d || a.brand.localeCompare(b.brand, 'es')).slice(0, 5), [data, normalizedGlobalQuery]);
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
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="brand"><div className="brand-mark"><span>S</span></div><div><strong>SALICE</strong><small>INTELIGENTE</small></div><button className="mobile-close" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)}><X size={19} /></button></div>
        <div className="sidebar-scroll">
          <button className="sidebar-section-label" aria-expanded={sidebarSections.operations} aria-controls="sidebar-operations" onClick={() => toggleSidebarSection('operations')}><span>Centro operativo</span>{sidebarSections.operations ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          {sidebarSections.operations && <nav className="main-nav" id="sidebar-operations">
            {nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => selectView(item.id)}><Icon size={19} /><span>{item.label}</span>{item.id === 'finance' && activeClients.some((client) => client.health === 'critical') && <i>{activeClients.filter((client) => client.health === 'critical').length}</i>}</button>; })}
          </nav>}
          <button className="sidebar-section-label lower" aria-expanded={sidebarSections.administration} aria-controls="sidebar-administration" onClick={() => toggleSidebarSection('administration')}><span>Administración</span>{sidebarSections.administration ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          {sidebarSections.administration && <nav className="main-nav" id="sidebar-administration"><button className={view === 'sales-explorer' ? 'active' : ''} onClick={() => selectView('sales-explorer')}><ShoppingBasket size={19} /><span>Explorador de ventas</span></button><button className={view === 'finance' ? 'active' : ''} onClick={() => selectView('finance')}><CircleDollarSign size={19} /><span>Cartera</span>{activeClients.some((client) => client.health === 'critical') && <i>{activeClients.filter((client) => client.health === 'critical').length}</i>}</button><button className={view === 'receivables' ? 'active' : ''} onClick={() => selectView('receivables')}><WalletCards size={19} /><span>Cuentas por cobrar</span></button><button className={view === 'agenda' ? 'active' : ''} onClick={() => selectView('agenda')}><ClipboardCheck size={19} /><span>Bandeja comercial</span></button><button className={view === 'goals' ? 'active' : ''} onClick={() => selectView('goals')}><Target size={19} /><span>Objetivos comerciales</span></button></nav>}
          <button className="sidebar-section-label lower" aria-expanded={sidebarSections.reports} aria-controls="sidebar-reports" onClick={() => toggleSidebarSection('reports')}><span>Reportes</span>{sidebarSections.reports ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          {sidebarSections.reports && <nav className="main-nav" id="sidebar-reports"><button className={view === 'reports' ? 'active' : ''} onClick={() => selectView('reports')}><LayoutDashboard size={19} /><span>Reporte General</span></button><button className={view === 'commercial-sales' ? 'active' : ''} onClick={() => selectView('commercial-sales')}><ShoppingBasket size={19} /><span>Ventas · Comercial</span></button><button className={view === 'spt' ? 'active' : ''} onClick={() => selectView('spt')}><BarChart3 size={19} /><span>SPT Vol vs mes anterior</span></button><button className={view === 'pending-balances' ? 'active' : ''} onClick={() => selectView('pending-balances')}><WalletCards size={19} /><span>Saldos Pendientes</span></button><button className={view === 'non-buyers' ? 'active' : ''} onClick={() => selectView('non-buyers')}><PackageSearch size={19} /><span>Cuentas no compradoras</span></button><button className={view === 'mars' ? 'active' : ''} onClick={() => selectView('mars')}><PawPrint size={19} /><span>Reporte Mars</span></button><button className={view === 'nutripet' ? 'active' : ''} onClick={() => selectView('nutripet')}><ShoppingBag size={19} /><span>Reporte NutriPet</span></button><button className={view === 'baires' ? 'active' : ''} onClick={() => selectView('baires')}><Package size={19} /><span>Reporte Baires</span></button></nav>}
          <button className="sidebar-section-label lower compact" aria-expanded={sidebarSections.system} aria-controls="sidebar-system" onClick={() => toggleSidebarSection('system')}><span>Sistema</span>{sidebarSections.system ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          {sidebarSections.system && <nav className="main-nav muted-nav" id="sidebar-system"><button className={view === 'settings' ? 'active' : ''} onClick={() => selectView('settings')}><Settings2 size={19} /><span>Configuración</span></button></nav>}
          <div className="sidebar-insight"><div><Sparkles size={16} /><span>Motor activo</span></div><strong>{number(data.products.length)} productos</strong><p>vectorizados en {number(Object.keys(VECTOR_LABELS).length)} dimensiones</p></div>
        </div>
        <div className="sidebar-footer"><span className={`source-dot ${data.meta.source}`} /><div><strong>v{APP_VERSION} · {data.meta.sourceLabel}</strong><small>{data.meta.source === 'demo' ? 'Esperando URL de GESI' : 'Snapshot conectado'}</small></div></div>
      </aside>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Abrir menú" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <button className="desktop-sidebar-toggle" aria-label={sidebarCollapsed ? 'Mostrar menú lateral' : 'Ocultar menú lateral'} title={sidebarCollapsed ? 'Mostrar menú lateral' : 'Ocultar menú lateral'} aria-pressed={sidebarCollapsed} onClick={() => setSidebarCollapsed((current) => !current)}>{sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</button>
          <div className="topbar-title"><h1>{currentTitle.title}</h1><p>{currentTitle.subtitle}</p></div>
          <div className="topbar-actions">
            <div className={`global-search ${searchOpen ? 'open' : ''}`}><Search size={17} /><input ref={searchInput} value={globalQuery} onFocus={() => setSearchOpen(true)} onChange={(event) => setGlobalQuery(event.target.value)} placeholder="Buscar cliente, vendedor, marca o producto" /><kbd>⌘ K</kbd>
              {searchOpen && <div className="global-search-results">
                {normalizedGlobalQuery.length < 2 && <p>Escribí al menos 2 caracteres para buscar en toda la base.</p>}
                {!!clientResults.length && <><span className="search-result-label">Clientes</span>{clientResults.map((client) => <button key={client.id} onMouseDown={(event) => event.preventDefault()} onClick={() => openClient(client)}><Users size={15} /><div><strong>{clientPrimaryName(client)}</strong><span>{clientSecondaryName(client) ? `${clientSecondaryName(client)} · ` : ''}{client.locality} · {client.active ? 'Activo' : 'Inactivo'} · P{client.visitPriority}</span></div><ChevronRight size={15} /></button>)}</>}
                {!!sellerResults.length && <><span className="search-result-label">Vendedores</span>{sellerResults.map((seller) => <button key={seller} onMouseDown={(event) => event.preventDefault()} onClick={() => openSeller(seller)}><Users size={15} /><div><strong>{seller}</strong><span>Abrir cartera y desempeño</span></div><ChevronRight size={15} /></button>)}</>}
                {!!brandResults.length && <><span className="search-result-label">Marcas</span>{brandResults.map((item) => <button key={item.brand} onMouseDown={(event) => event.preventDefault()} onClick={() => openBrand(item.brand)}><Store size={15} /><div><strong>{item.brand}</strong><span>Abrir productos y desempeño de la marca</span></div><ChevronRight size={15} /></button>)}</>}
                {!!productResults.length && <><span className="search-result-label">Productos</span>{productResults.map((product) => <div className="global-product-search-result" key={product.id}><button onMouseDown={(event) => event.preventDefault()} onClick={() => openProduct(product)}><Package size={15} /><div><strong>{product.name}</strong><span>{product.sku} · stock {product.stock}</span></div><ChevronRight size={15} /></button><button className="global-search-brand-link" onMouseDown={(event) => event.preventDefault()} onClick={() => openBrand(product.brand)}><Store size={12} /><span>{product.brand}</span></button></div>)}</>}
                {normalizedGlobalQuery.length >= 2 && !clientResults.length && !sellerResults.length && !brandResults.length && !productResults.length && <p>No encontramos coincidencias.</p>}
              </div>}
            </div>
            <div className="sync-action-wrap"><button className={`sync-chip ${data.meta.source} freshness-${dataHealth?.freshness.level ?? 'unknown'}`} disabled={reloadingData || Boolean(dataHealth?.refresh.current)} onClick={refreshFromGesi} title="Capturar GESI ahora, auditar el paquete y publicarlo sólo si es válido"><Database size={14} /><div><strong>{reloadingData || dataHealth?.refresh.current ? `Actualizando · ${dataHealth?.refresh.current?.stage ?? 'iniciando'}` : dataHealth?.freshness.label ?? (data.meta.source === 'demo' ? 'Modo demo' : 'Snapshot validado')}</strong><span>Foto · {snapshotLabel}</span></div>{(reloadingData || dataHealth?.refresh.current) && <RefreshCw className="spin" size={14} />}</button>{refreshFeedback && <div className={`sync-feedback ${refreshFeedback.tone}`}>{refreshFeedback.message}</div>}</div>
            <div className="notification-wrap"><button className="notification-button" aria-label="Notificaciones" onClick={() => { setNotificationsOpen((value) => !value); setSearchOpen(false); }}><Bell size={18} />{!!notifications.length && <i>{number(notifications.length)}</i>}</button>{notificationsOpen && <div className="notification-panel"><div><span className="section-kicker"><AlertTriangle size={14} /> Gestión prioritaria</span><h3>Alertas operativas</h3><p>Promesas exigibles y riesgos altos de la foto actual.</p></div>{notifications.map((item) => { const client = data.clients.find((candidate) => candidate.id === item.clientId); return <button key={item.id} onClick={() => { if (item.type.startsWith('promise')) { setView('receivables'); setNotificationsOpen(false); } else if (client) openClient(client); }}><span className={`score-badge ${item.severity}`}>{item.type.startsWith('promise') ? '$' : client?.collectionRisk}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div><ChevronRight size={15} /></button>; })}{!notifications.length && <p className="notification-empty">No hay alertas accionables en este momento.</p>}<button className="notification-all" onClick={() => { setView('receivables'); setNotificationsOpen(false); }}>Abrir cuentas por cobrar</button></div>}</div>
            <div className="user-avatar">FM</div>
          </div>
        </header>

        {data.meta.disclaimer && <div className={`demo-banner ${data.meta.source === 'gesi' ? 'connected' : ''}`}><Database size={15} /><span><strong>{data.meta.source === 'demo' ? 'Prototipo con datos demostrativos.' : 'Snapshot real de Salice.'}</strong> {localizedDisclaimer(data.meta)}</span></div>}

        <div className="view-container"><Suspense fallback={<div className="view-loading"><RefreshCw className="spin" size={21} /><strong>Abriendo módulo…</strong></div>}>
          {view === 'map' && <MapDashboard clients={data.clients} products={data.products} logistics={data.logistics} selected={selected} onSelect={(client) => { setSelectedId(client?.id ?? null); setClientProfileOpen(false); }} onExpandClient={() => setClientProfileOpen(true)} onOpenSeller={openSeller} onOpenProduct={openProduct} onOpenInvoice={openInvoice} snapshotDate={data.meta.generatedAt} onPlanRoute={planRoute} onNoteSaved={noteSaved} clientVisibility={mapClientVisibility} onClientVisibilityChange={setMapClientVisibility} />}
          {view === 'agenda' && <AgendaView clients={data.clients} products={data.products} onOpen={openClient} onOpenSeller={openSeller} onOpenProduct={openProduct} onPlanRoute={planRoute} onOpenReceivables={() => setView('receivables')} onOperationalChange={refreshNotifications} />}
          {view === 'clients' && <ClientsView clients={data.clients} query={clientQuery} onQuery={setClientQuery} onOpen={openClient} onOpenSeller={openSeller} />}
          {view === 'sellers' && <SellersView clients={data.clients} snapshotDate={data.meta.generatedAt} selectedSeller={sellerFocus} onSelectSeller={setSellerFocus} onOpenClient={openClient} />}
          {view === 'finance' && <FinanceView clients={data.clients} onOpen={openClient} onOpenSeller={openSeller} onOpenInvoice={openInvoice} snapshotDate={data.meta.generatedAt.slice(0, 10)} />}
          {view === 'products' && <ProductsView products={data.products} clients={data.clients} snapshotDate={data.meta.generatedAt} focusProductId={productFocusId} focusFamily={productFamilyFocus} comparisonProductIds={productComparisonIds} comparisonRequest={productComparisonRequest} onComparisonChange={setProductComparisonIds} onFocusFamilyConsumed={() => setProductFamilyFocus('')} tutorialVectorMode={tutorialStep != null && TUTORIAL_STEPS[tutorialStep]?.target === 'vector-explorer'} onOpenProduct={openProduct} onOpenBrand={openBrand} onOpenClient={openClient} onOpenSeller={openSeller} onDataChanged={() => reloadLocalData(true)} />}
          {view === 'brands' && <BrandsView products={data.products} focusBrand={brandFocus} onOpenProduct={openProduct} />}
          {view === 'routes' && <RoutesView clients={data.clients} logistics={data.logistics} initialClientId={routeClientId} onOpenClient={openClient} onOpenInvoice={openInvoice} onOpenSheet={openSheet} />}
          {view === 'sales-explorer' && <SalesExplorerView clients={data.clients} onOpenClient={openClientById} onOpenProduct={openProduct} onOpenBrand={openBrand} onOpenInvoice={openInvoice} />}
          {view === 'receivables' && <ReceivablesView dataClients={data.clients} onOpenClient={openClient} onOpenSeller={openSeller} onOpenInvoice={openInvoice} />}
          {view === 'goals' && <GoalsView />}
          {view === 'reports' && <ReportsView data={data} onOpen={openClient} onOpenSeller={openSeller} onOpenBrand={openBrand} />}
          {view === 'spt' && <SptReportView onOpenSeller={openSeller} />}
          {view === 'commercial-sales' && <CommercialSalesReportView onOpenProduct={openProduct} onOpenBrand={openBrand} />}
          {view === 'mars' && <MarsReportView onOpenBrand={openBrand} />}
          {view === 'nutripet' && <NutriPetReportView onOpenProduct={openProduct} onOpenBrand={openBrand} />}
          {view === 'baires' && <BairesReportView onOpenBrand={openBrand} />}
          {view === 'non-buyers' && <NonBuyersReportView data={data} onOpen={openClient} onOpenSeller={openSeller} onOpenBrand={openBrand} />}
          {view === 'pending-balances' && <PendingBalancesReportView data={data} onOpen={openClient} onOpenSeller={openSeller} />}
          {view === 'settings' && <SettingsView data={data} dataHealth={dataHealth} tutorialCompleted={tutorialCompleted} onStartTutorial={startTutorial} />}
        </Suspense></div>
      </main>
      {clientProfileOpen && selected && <div className="client-drawer-layer"><button className="client-drawer-backdrop" aria-label="Cerrar ficha" onClick={() => { setClientProfileOpen(false); if (view !== 'map') setSelectedId(null); }} /><ClientPanel mode="full" client={selected} products={data.products} logistics={data.logistics} snapshotDate={data.meta.generatedAt} onClose={() => { setClientProfileOpen(false); if (view !== 'map') setSelectedId(null); }} onOpenSeller={openSeller} onOpenProduct={openProduct} onOpenBrand={openBrand} onOpenInvoice={openInvoice} onPlanRoute={planRoute} onNoteSaved={noteSaved} /></div>}
      {productProfileOpen && selectedProduct && <div className="product-drawer-layer"><button className="product-drawer-backdrop" aria-label="Cerrar ficha de producto" onClick={() => setProductProfileOpen(false)} /><ProductPanel mode="popup" product={selectedProduct} products={data.products} clients={data.clients} snapshotDate={data.meta.generatedAt} onClose={() => setProductProfileOpen(false)} onOpenProduct={openProduct} onCompareProduct={addProductToComparison} comparisonSelectedIds={productComparisonIds} onOpenCatalog={openProductCatalog} onOpenBrand={openBrand} onOpenFamily={openProductFamily} onOpenClient={openClient} onDataChanged={() => reloadLocalData(true)} /></div>}
      {invoiceFocusId && <InvoiceDetailDrawer invoiceId={invoiceFocusId} logistics={data.logistics} onClose={() => setInvoiceFocusId(null)} onOpenClient={openClientById} onOpenSeller={openSeller} onOpenSheet={openSheet} />}
      {sheetFocusId != null && data.logistics.sheets.find((sheet) => sheet.id === sheetFocusId) && <DeliverySheetDetailDrawer
        sheet={data.logistics.sheets.find((sheet) => sheet.id === sheetFocusId)!}
        logistics={data.logistics}
        clients={data.clients}
        onClose={() => setSheetFocusId(null)}
        onOpenClient={openClientById}
        onOpenInvoice={openInvoice}
      />}
      {tutorialStep != null && <TutorialOverlay stepIndex={tutorialStep} onBack={() => setTutorialStep((value) => value == null ? null : Math.max(0, value - 1))} onNext={nextTutorialStep} onClose={() => setTutorialStep(null)} />}
    </div>
  );
}
