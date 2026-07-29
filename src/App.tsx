import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bell, Boxes, ChevronDown, ChevronRight, ChevronUp, CircleDollarSign, ClipboardCheck, Database, HelpCircle, LayoutDashboard, Map, Menu, Package, PanelLeftClose, PanelLeftOpen, RefreshCw, Route, Search, Settings2, ShoppingBasket, Store, Users, WalletCards, X } from 'lucide-react';
import { type Client, type DashboardData, type NotificationItem, type Product, type ReceivableDashboardFilters, type SalesExplorerFilters } from '../shared/models';
import { encodeMultiFilter } from '../shared/multi-filter';
import type { DataHealthPayload } from '../shared/data-health';
import { ClientPanel } from './components/ClientPanel';
import { DeliverySheetDetailDrawer } from './components/DeliverySheetDetailDrawer';
import { InvoiceDetailDrawer } from './components/InvoiceDetailDrawer';
import { ProductPanel } from './components/ProductPanel';
import { TUTORIALS, TutorialOverlay, type TutorialSection, type TutorialView } from './components/TutorialOverlay';
import { clientPrimaryName, clientSecondaryName } from './lib/client-name';
import { number } from './lib/format';
import { isReportViewId, parseRecentReports, rememberRecentReport, type ReportViewId } from './lib/report-center';
import { replaceViewInLocation, reportViewFromLocation } from './lib/report-links';
import { PREFERENCES_CHANGED_EVENT, readPreferences, type AppPreferences } from './lib/preferences';
import type { ClientVisibility } from './views/MapDashboard';

const AgendaView = lazy(() => import('./views/AgendaView').then((module) => ({ default: module.AgendaView })));
const ClientsView = lazy(() => import('./views/ClientsView').then((module) => ({ default: module.ClientsView })));
const FinanceView = lazy(() => import('./views/FinanceView').then((module) => ({ default: module.FinanceView })));
const MapDashboard = lazy(() => import('./views/MapDashboard').then((module) => ({ default: module.MapDashboard })));
const ProductsView = lazy(() => import('./views/ProductsView').then((module) => ({ default: module.ProductsView })));
const BrandsView = lazy(() => import('./views/BrandsView').then((module) => ({ default: module.BrandsView })));
const ReportsView = lazy(() => import('./views/ReportsView').then((module) => ({ default: module.ReportsView })));
const ReportsHubView = lazy(() => import('./views/ReportsHubView').then((module) => ({ default: module.ReportsHubView })));
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

type View = TutorialView | 'report-center';
type SidebarSection = 'operations' | 'administration' | 'reports' | 'system';

const viewSection: Record<View, SidebarSection> = {
  map: 'operations', clients: 'operations', sellers: 'operations', products: 'operations', brands: 'operations', routes: 'operations',
  finance: 'administration', agenda: 'administration', 'sales-explorer': 'administration', receivables: 'administration',
  'report-center': 'reports', reports: 'reports', spt: 'reports', 'commercial-sales': 'reports', mars: 'reports', nutripet: 'reports', baires: 'reports', 'non-buyers': 'reports', 'pending-balances': 'reports',
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
  'report-center': { title: 'Reportes', subtitle: 'Accesos organizados por finalidad y cobertura' },
  reports: { title: 'Reporte General', subtitle: 'Objetivos, resultados y estado comercial de Salice' },
  spt: { title: 'Volumen SPT', subtitle: 'Kilos, evolución, vendedores y comparación entre períodos' },
  'commercial-sales': { title: 'Ventas y composición', subtitle: 'Venta neta, evolución, marcas y composición del negocio' },
  mars: { title: 'Mars · desempeño comercial', subtitle: 'Volumen, clientes y períodos comerciales del proveedor Mars' },
  nutripet: { title: 'NutriPet · desempeño comercial', subtitle: 'Volumen, cobertura y evolución mensual del proveedor NutriPet' },
  baires: { title: 'Baires · desempeño comercial', subtitle: 'Volumen, clientes y composición de Baires SPT y Baires Masivo' },
  'non-buyers': { title: 'Cuentas no compradoras', subtitle: 'Recuperación de cuentas y marcas sin compra reciente' },
  'pending-balances': { title: 'Saldos pendientes', subtitle: 'Cartera abierta, vencimientos y presión sobre ventas recientes' },
  settings: { title: 'Configuración', subtitle: 'Preferencias, IA, datos, ayuda y diagnóstico' },
};

const nav: { id: View; label: string; icon: typeof Map }[] = [
  { id: 'map', label: 'Mapa operativo', icon: Map },
  { id: 'routes', label: 'Rutas', icon: Route },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'sellers', label: 'Vendedores', icon: Users },
  { id: 'products', label: 'Productos', icon: Boxes },
  { id: 'brands', label: 'Marcas', icon: Store },
];

const contextualHelp: Record<View, { purpose: string; tips: string[] }> = {
  map: { purpose: 'Ubicá clientes y detectá prioridades comerciales sobre el territorio.', tips: ['Usá “Ubicaciones corregidas” para auditar ajustes.', 'Abrí una ficha antes de planificar una ruta.'] },
  routes: { purpose: 'Armá recorridos con clientes cuya ubicación es suficientemente confiable.', tips: ['Los puntos aproximados quedan excluidos por seguridad.', 'La distancia y el tiempo son estimaciones para planificación.'] },
  clients: { purpose: 'Buscá y filtrá toda la cartera desde una lista única.', tips: ['Abrí la ficha para ver compras, cobranzas y notas.', 'Combiná filtros y guardá las vistas que repetís.'] },
  sellers: { purpose: 'Compará carteras y abrí el detalle de cada responsable.', tips: ['Las señales priorizan revisión; no reemplazan criterio comercial.', 'El corte coincide con la actualización visible.'] },
  products: { purpose: 'Revisá catálogo, disponibilidad y oportunidades por producto.', tips: ['Las herramientas de clasificación están dentro del modo avanzado.', 'Una señal incompleta se muestra como tal y no se completa artificialmente.'] },
  brands: { purpose: 'Analizá venta, compra y disponibilidad agrupadas por marca.', tips: ['Abrí cualquier producto para revisar su ficha completa.', 'Los importes usan el mismo corte que el resto del programa.'] },
  finance: { purpose: 'Priorizá vencimientos, saldos y comportamiento de pago.', tips: ['Saldo abierto y monto original son conceptos distintos.', 'Las alertas no ocultan documentos de bajo importe.'] },
  agenda: { purpose: 'Concentrá oportunidades, compromisos y tareas de oficina.', tips: ['La explicación con IA es complementaria.', 'Las gestiones humanas quedan separadas de los datos comerciales.'] },
  'sales-explorer': { purpose: 'Pasá de un indicador al comprobante que lo explica.', tips: ['Podés combinar varias opciones dentro de un mismo filtro.', 'La información técnica permanece plegada.'] },
  receivables: { purpose: 'Administrá casos de cobranza sin alterar los documentos fuente.', tips: ['Registrá seguimiento y promesas con contexto.', 'Abrí la factura para verificar vencimientos e importes.'] },
  'report-center': { purpose: 'Elegí el reporte según la decisión que necesitás tomar.', tips: ['Favoritos y recientes aceleran accesos repetidos.', 'Cada reporte documenta su período y alcance.'] },
  reports: { purpose: 'Leé primero el resultado general y después profundizá.', tips: ['“Cómo se calcula” contiene metodología y universo.', 'La asistencia con IA no modifica las cifras.'] },
  spt: { purpose: 'Compará volumen SPT entre períodos equivalentes.', tips: ['Revisá el período elegido antes de interpretar la variación.', 'La exportación conserva filtros y corte.'] },
  'commercial-sales': { purpose: 'Analizá venta neta y composición comercial.', tips: ['Usá el explorador para llegar al comprobante.', 'Compará siempre períodos completos equivalentes.'] },
  mars: { purpose: 'Revisá volumen, clientes y evolución comercial de Mars.', tips: ['El reporte mantiene un universo documentado.', 'La IA se oculta si no supera los controles de calidad.'] },
  nutripet: { purpose: 'Revisá cobertura y evolución mensual de NutriPet.', tips: ['Abrí marcas o productos para profundizar.', 'Las cifras determinísticas siguen disponibles sin IA.'] },
  baires: { purpose: 'Compará Baires SPT y Baires Masivo con el mismo corte.', tips: ['Verificá la composición antes de atribuir una variación.', 'Las exportaciones usan los filtros visibles.'] },
  'non-buyers': { purpose: 'Detectá cuentas recuperables y marcas sin compra reciente.', tips: ['La ausencia se calcula sobre el período elegido.', 'Abrí el cliente antes de iniciar una gestión.'] },
  'pending-balances': { purpose: 'Dimensioná cartera abierta y presión sobre ventas recientes.', tips: ['Vencido y pendiente no significan lo mismo.', 'Podés continuar la gestión en Cuentas por cobrar.'] },
  settings: { purpose: 'Ajustá la experiencia y consultá datos, IA, ayuda y diagnóstico.', tips: ['La información técnica está separada del uso cotidiano.', 'Los cambios de apariencia se guardan en este navegador.'] },
};

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>(() => {
    const linked = reportViewFromLocation();
    return linked && isReportViewId(linked) ? linked : 'map';
  });
  const [salesExplorerRequest, setSalesExplorerRequest] = useState<{ id: number; filters: Partial<SalesExplorerFilters> } | null>(null);
  const [receivablesRequest, setReceivablesRequest] = useState<{ id: number; filters: Partial<ReceivableDashboardFilters> } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [clientProfileOpen, setClientProfileOpen] = useState(false);
  const [sellerFocus, setSellerFocus] = useState('');
  const [routeClientId, setRouteClientId] = useState<number | null>(null);
  const [clientQuery, setClientQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarSections, setSidebarSections] = useState<Record<SidebarSection, boolean>>({ operations: true, administration: true, reports: true, system: true });
  const [mapClientVisibility, setMapClientVisibility] = useState<ClientVisibility>('active');
  const [tutorial, setTutorial] = useState<{ section: TutorialSection; stepIndex: number } | null>(null);
  const [tutorialCompleted, setTutorialCompleted] = useState<Record<TutorialSection, boolean>>(() => ({
    operations: localStorage.getItem('salice-tutorial-v010-operations') === 'completed',
    administration: localStorage.getItem('salice-tutorial-v010-administration') === 'completed',
    reports: localStorage.getItem('salice-tutorial-v010-reports') === 'completed',
  }));
  const [globalQuery, setGlobalQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [preferences, setPreferences] = useState<AppPreferences>(() => readPreferences());
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
      if (!dashboardResponse.ok) throw new Error('No se pudieron releer los datos');
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
    setRefreshFeedback({ tone: 'working', message: 'Iniciando actualización de datos…' });
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
          setRefreshFeedback({ tone: 'working', message: `Actualizando datos · ${health.refresh.current.stage}` });
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
    const update = (event: Event) => setPreferences((event as CustomEvent<AppPreferences>).detail ?? readPreferences());
    window.addEventListener(PREFERENCES_CHANGED_EVENT, update);
    return () => window.removeEventListener(PREFERENCES_CHANGED_EVENT, update);
  }, []);

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
      if (event.key === 'Escape') { setSearchOpen(false); setNotificationsOpen(false); setHelpOpen(false); setProductProfileOpen(false); setClientProfileOpen(false); setInvoiceFocusId(null); setSheetFocusId(null); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);

  useEffect(() => {
    if (!tutorial || !data) return;
    const step = TUTORIALS[tutorial.section].steps[tutorial.stepIndex];
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
  }, [data, tutorial]);

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
  const selectView = (next: View) => {
    if (isReportViewId(next)) {
      const recent = rememberRecentReport(parseRecentReports(localStorage.getItem('salice-report-recents-v080')), next);
      localStorage.setItem('salice-report-recents-v080', JSON.stringify(recent));
    }
    setView(next);
    replaceViewInLocation(next);
    setSidebarOpen(false);
    setClientProfileOpen(false);
    setProductProfileOpen(false);
    setInvoiceFocusId(null);
    setSheetFocusId(null);
    if (next !== 'map') setSelectedId(null);
  };
  const openSalesExplorer = (filters: Partial<SalesExplorerFilters>) => {
    setSalesExplorerRequest({ id: Date.now(), filters });
    selectView('sales-explorer');
  };
  const openReceivables = ({ seller = '', clientId }: { seller?: string; clientId?: number }) => {
    setReceivablesRequest({
      id: Date.now(),
      filters: {
        seller: seller ? encodeMultiFilter([seller]) : '',
        query: clientId == null ? '' : String(clientId),
      },
    });
    selectView('receivables');
  };
  const toggleSidebarSection = (section: SidebarSection) => setSidebarSections((current) => ({ ...current, [section]: !current[section] }));
  const planRoute = (clientId: number) => {
    const client = data?.clients.find((candidate) => candidate.id === clientId);
    if (!client?.active || !client.coordinates || client.locationPrecision === 'locality') return;
    setRouteClientId(clientId);
    setView('routes');
    setSelectedId(null);
    setClientProfileOpen(false);
  };
  const noteSaved = (clientId: number, note: string) => setData((current) => current ? ({ ...current, clients: current.clients.map((client) => client.id === clientId ? { ...client, note } : client) }) : current);
  const startTutorial = (section: TutorialSection) => setTutorial({ section, stepIndex: 0 });
  const finishTutorial = () => {
    if (!tutorial) return;
    localStorage.setItem(`salice-tutorial-v010-${tutorial.section}`, 'completed');
    setTutorialCompleted((current) => ({ ...current, [tutorial.section]: true }));
    setTutorial(null);
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
    if (!tutorial) return;
    if (tutorial.stepIndex === TUTORIALS[tutorial.section].steps.length - 1) finishTutorial();
    else setTutorial((current) => current ? { ...current, stepIndex: current.stepIndex + 1 } : null);
  };

  if (error) return <main className="boot-screen"><img className="boot-logo" src="/salice-logo.png" alt="Salice" /><h1>No pudimos abrir Salice Inteligente</h1><p>{error}. Verificá que el servicio de datos esté disponible y volvé a intentar.</p><button className="button primary" onClick={() => location.reload()}><RefreshCw size={16} /> Reintentar</button></main>;
  if (!data) return <main className="boot-screen"><img className="boot-logo loading" src="/salice-logo.png" alt="Salice" /><h1>Preparando el centro operativo</h1><p>Cargando clientes, productos y cuenta corriente…</p></main>;

  const currentTitle = titles[view];
  const snapshotDate = new Date(data.meta.generatedAt);
  const snapshotDay = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(snapshotDate).replace('.', '');
  const snapshotTime = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(snapshotDate);
  const snapshotLabel = `${snapshotDay} · ${snapshotTime}`;
  return (
    <div className={`app-shell density-${preferences.density}`}>
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="brand"><div className="brand-mark"><img src="/salice-isotipo.png" alt="" /></div><div><strong>SALICE</strong><small>INTELIGENTE</small></div><button className="mobile-close" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)}><X size={19} /></button></div>
        <div className="sidebar-scroll">
          <button className="sidebar-section-label" aria-expanded={sidebarSections.operations} aria-controls="sidebar-operations" onClick={() => toggleSidebarSection('operations')}><span>Centro operativo</span>{sidebarSections.operations ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          {sidebarSections.operations && <nav className="main-nav" id="sidebar-operations">
            {nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => selectView(item.id)}><Icon size={19} /><span>{item.label}</span>{item.id === 'finance' && activeClients.some((client) => client.health === 'critical') && <i>{activeClients.filter((client) => client.health === 'critical').length}</i>}</button>; })}
          </nav>}
          <button className="sidebar-section-label lower" aria-expanded={sidebarSections.administration} aria-controls="sidebar-administration" onClick={() => toggleSidebarSection('administration')}><span>Administración</span>{sidebarSections.administration ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          {sidebarSections.administration && <nav className="main-nav" id="sidebar-administration"><button className={view === 'sales-explorer' ? 'active' : ''} onClick={() => selectView('sales-explorer')}><ShoppingBasket size={19} /><span>Explorador de ventas</span></button><button className={view === 'finance' ? 'active' : ''} onClick={() => selectView('finance')}><CircleDollarSign size={19} /><span>Cartera</span>{activeClients.some((client) => client.health === 'critical') && <i>{activeClients.filter((client) => client.health === 'critical').length}</i>}</button><button className={view === 'receivables' ? 'active' : ''} onClick={() => selectView('receivables')}><WalletCards size={19} /><span>Cuentas por cobrar</span></button><button className={view === 'agenda' ? 'active' : ''} onClick={() => selectView('agenda')}><ClipboardCheck size={19} /><span>Bandeja comercial</span></button></nav>}
          <button className="sidebar-section-label lower" aria-expanded={sidebarSections.reports} aria-controls="sidebar-reports" onClick={() => toggleSidebarSection('reports')}><span>Reportes</span>{sidebarSections.reports ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          {sidebarSections.reports && <nav className="main-nav" id="sidebar-reports"><button className={viewSection[view] === 'reports' ? 'active' : ''} onClick={() => selectView('report-center')}><LayoutDashboard size={19} /><span>Reportes</span></button></nav>}
          <button className="sidebar-section-label lower compact" aria-expanded={sidebarSections.system} aria-controls="sidebar-system" onClick={() => toggleSidebarSection('system')}><span>Sistema</span>{sidebarSections.system ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          {sidebarSections.system && <nav className="main-nav muted-nav" id="sidebar-system"><button className={view === 'settings' ? 'active' : ''} onClick={() => selectView('settings')}><Settings2 size={19} /><span>Configuración</span></button></nav>}
        </div>
        <div className="sidebar-footer"><span className={`source-dot ${data.meta.source}`} /><div><strong>Datos disponibles</strong><small>{data.meta.source === 'demo' ? 'Información demostrativa' : `Actualizados · ${snapshotLabel}`}</small></div></div>
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
                {!!clientResults.length && <><span className="search-result-label">Clientes</span>{clientResults.map((client) => <button key={client.id} onMouseDown={(event) => event.preventDefault()} onClick={() => openClient(client)}><Users size={15} /><div><strong>{clientPrimaryName(client)}</strong><span>{clientSecondaryName(client) ? `${clientSecondaryName(client)} · ` : ''}{client.locality} · {client.active ? 'Activo' : 'Inactivo'} · prioridad {client.visitPriority}</span></div><ChevronRight size={15} /></button>)}</>}
                {!!sellerResults.length && <><span className="search-result-label">Vendedores</span>{sellerResults.map((seller) => <button key={seller} onMouseDown={(event) => event.preventDefault()} onClick={() => openSeller(seller)}><Users size={15} /><div><strong>{seller}</strong><span>Abrir cartera y desempeño</span></div><ChevronRight size={15} /></button>)}</>}
                {!!brandResults.length && <><span className="search-result-label">Marcas</span>{brandResults.map((item) => <button key={item.brand} onMouseDown={(event) => event.preventDefault()} onClick={() => openBrand(item.brand)}><Store size={15} /><div><strong>{item.brand}</strong><span>Abrir productos y desempeño de la marca</span></div><ChevronRight size={15} /></button>)}</>}
                {!!productResults.length && <><span className="search-result-label">Productos</span>{productResults.map((product) => <div className="global-product-search-result" key={product.id}><button onMouseDown={(event) => event.preventDefault()} onClick={() => openProduct(product)}><Package size={15} /><div><strong>{product.name}</strong><span>{product.sku} · stock {product.stock}</span></div><ChevronRight size={15} /></button><button className="global-search-brand-link" onMouseDown={(event) => event.preventDefault()} onClick={() => openBrand(product.brand)}><Store size={12} /><span>{product.brand}</span></button></div>)}</>}
                {normalizedGlobalQuery.length >= 2 && !clientResults.length && !sellerResults.length && !brandResults.length && !productResults.length && <p>No encontramos coincidencias.</p>}
              </div>}
            </div>
            <div className="sync-action-wrap"><div className={`sync-chip status-only ${data.meta.source} freshness-${dataHealth?.freshness.level ?? 'unknown'}`} title="Estado de los datos disponibles"><Database size={14} /><div><strong>{reloadingData || dataHealth?.refresh.current ? 'Actualizando datos' : dataHealth?.freshness.label ?? (data.meta.source === 'demo' ? 'Datos de ejemplo' : 'Datos disponibles')}</strong><span>Actualizados · {snapshotLabel}</span></div>{(reloadingData || dataHealth?.refresh.current) && <RefreshCw className="spin" size={14} />}</div>{refreshFeedback && <div className={`sync-feedback ${refreshFeedback.tone}`}>{refreshFeedback.message}</div>}</div>
            {preferences.contextualHelp && <div className="context-help-wrap"><button className="context-help-button" aria-label={`Ayuda sobre ${currentTitle.title}`} aria-expanded={helpOpen} onClick={() => { setHelpOpen((value) => !value); setSearchOpen(false); setNotificationsOpen(false); }}><HelpCircle size={18} /></button>{helpOpen && <aside className="context-help-panel"><header><span>Ayuda de esta pantalla</span><button aria-label="Cerrar ayuda" onClick={() => setHelpOpen(false)}><X size={15} /></button></header><h3>{currentTitle.title}</h3><p>{contextualHelp[view].purpose}</p><ul>{contextualHelp[view].tips.map((tip) => <li key={tip}>{tip}</li>)}</ul><button className="button secondary" onClick={() => { selectView('settings'); setHelpOpen(false); }}>Abrir guías y preferencias</button></aside>}</div>}
            <div className="notification-wrap"><button className="notification-button" aria-label="Notificaciones" onClick={() => { setNotificationsOpen((value) => !value); setSearchOpen(false); }}><Bell size={18} />{!!notifications.length && <i>{number(notifications.length)}</i>}</button>{notificationsOpen && <div className="notification-panel"><div><span className="section-kicker"><AlertTriangle size={14} /> Gestión prioritaria</span><h3>Alertas operativas</h3><p>Promesas exigibles y riesgos altos de la foto actual.</p></div>{notifications.map((item) => { const client = data.clients.find((candidate) => candidate.id === item.clientId); return <button key={item.id} onClick={() => { if (item.type.startsWith('promise')) { setView('receivables'); setNotificationsOpen(false); } else if (client) openClient(client); }}><span className={`score-badge ${item.severity}`}>{item.type.startsWith('promise') ? '$' : client?.collectionRisk}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div><ChevronRight size={15} /></button>; })}{!notifications.length && <p className="notification-empty">No hay alertas accionables en este momento.</p>}<button className="notification-all" onClick={() => { setView('receivables'); setNotificationsOpen(false); }}>Abrir cuentas por cobrar</button></div>}</div>
          </div>
        </header>

        <div className="view-container"><Suspense fallback={<div className="view-loading"><RefreshCw className="spin" size={21} /><strong>Abriendo módulo…</strong></div>}>
          {view === 'map' && <MapDashboard clients={data.clients} products={data.products} logistics={data.logistics} selected={selected} onSelect={(client) => { setSelectedId(client?.id ?? null); setClientProfileOpen(false); }} onExpandClient={() => setClientProfileOpen(true)} onOpenSeller={openSeller} onOpenProduct={openProduct} onOpenInvoice={openInvoice} snapshotDate={data.meta.generatedAt} onPlanRoute={planRoute} onNoteSaved={noteSaved} clientVisibility={mapClientVisibility} onClientVisibilityChange={setMapClientVisibility} />}
          {view === 'agenda' && <AgendaView clients={data.clients} products={data.products} onOpen={openClient} onOpenSeller={openSeller} onOpenProduct={openProduct} onPlanRoute={planRoute} onOpenReceivables={() => setView('receivables')} onOperationalChange={refreshNotifications} />}
          {view === 'clients' && <ClientsView clients={data.clients} query={clientQuery} onQuery={setClientQuery} onOpen={openClient} onOpenSeller={openSeller} />}
          {view === 'sellers' && <SellersView clients={data.clients} snapshotDate={data.meta.generatedAt} selectedSeller={sellerFocus} onSelectSeller={setSellerFocus} onOpenClient={openClient} />}
          {view === 'finance' && <FinanceView clients={data.clients} onOpen={openClient} onOpenSeller={openSeller} onOpenInvoice={openInvoice} snapshotDate={data.meta.generatedAt.slice(0, 10)} />}
          {view === 'products' && <ProductsView products={data.products} clients={data.clients} snapshotDate={data.meta.generatedAt} focusProductId={productFocusId} focusFamily={productFamilyFocus} comparisonProductIds={productComparisonIds} comparisonRequest={productComparisonRequest} onComparisonChange={setProductComparisonIds} onFocusFamilyConsumed={() => setProductFamilyFocus('')} tutorialVectorMode={false} onOpenProduct={openProduct} onOpenBrand={openBrand} onOpenClient={openClient} onOpenSeller={openSeller} onDataChanged={() => reloadLocalData(true)} />}
          {view === 'brands' && <BrandsView products={data.products} focusBrand={brandFocus} onOpenProduct={openProduct} />}
          {view === 'routes' && <RoutesView clients={data.clients} logistics={data.logistics} initialClientId={routeClientId} onOpenClient={openClient} onOpenInvoice={openInvoice} />}
          {view === 'sales-explorer' && <SalesExplorerView clients={data.clients} navigationRequest={salesExplorerRequest} onOpenClient={openClientById} onOpenProduct={openProduct} onOpenBrand={openBrand} onOpenInvoice={openInvoice} />}
          {view === 'receivables' && <ReceivablesView dataClients={data.clients} navigationRequest={receivablesRequest} onOpenClient={openClient} onOpenSeller={openSeller} onOpenInvoice={openInvoice} />}
          {view === 'report-center' && <ReportsHubView
            data={data}
            onOpenReport={(report: ReportViewId) => selectView(report)}
            onOpenDestination={(destination) => selectView(destination)}
            onOpenSheet={openSheet}
          />}
          {view === 'reports' && <ReportsView data={data} onOpen={openClient} onOpenSeller={openSeller} onOpenBrand={openBrand} />}
          {view === 'spt' && <SptReportView onOpenSeller={openSeller} />}
          {view === 'commercial-sales' && <CommercialSalesReportView onOpenProduct={openProduct} onOpenBrand={openBrand} onOpenSalesExplorer={openSalesExplorer} />}
          {view === 'mars' && <MarsReportView onOpenBrand={openBrand} />}
          {view === 'nutripet' && <NutriPetReportView onOpenProduct={openProduct} onOpenBrand={openBrand} />}
          {view === 'baires' && <BairesReportView onOpenBrand={openBrand} />}
          {view === 'non-buyers' && <NonBuyersReportView data={data} onOpen={openClient} onOpenSeller={openSeller} onOpenBrand={openBrand} onOpenSalesExplorer={openSalesExplorer} />}
          {view === 'pending-balances' && <PendingBalancesReportView onOpenSeller={openSeller} onOpenReceivables={openReceivables} />}
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
      {tutorial && <TutorialOverlay definition={TUTORIALS[tutorial.section]} stepIndex={tutorial.stepIndex} onBack={() => setTutorial((current) => current ? { ...current, stepIndex: Math.max(0, current.stepIndex - 1) } : null)} onNext={nextTutorialStep} onClose={() => setTutorial(null)} />}
    </div>
  );
}
