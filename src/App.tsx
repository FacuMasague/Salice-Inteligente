import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bell, Boxes, ChevronRight, CircleDollarSign, ClipboardCheck, Database, LayoutDashboard, Map, Menu, Package, RefreshCw, Route, Search, Settings2, Sparkles, Users, X } from 'lucide-react';
import type { Client, DashboardData, NotificationItem } from '../shared/models';
import { AgendaView } from './views/AgendaView';
import { ClientsView } from './views/ClientsView';
import { FinanceView } from './views/FinanceView';
import { MapDashboard } from './views/MapDashboard';
import { ProductsView } from './views/ProductsView';
import { RoutesView } from './views/RoutesView';
import { SettingsView } from './views/SettingsView';
import { ClientPanel } from './components/ClientPanel';
import { TUTORIAL_STEPS, TutorialOverlay, type TutorialView } from './components/TutorialOverlay';
import type { ClientVisibility } from './views/MapDashboard';

type View = TutorialView;

const titles: Record<View, { title: string; subtitle: string }> = {
  map: { title: 'Pulso comercial', subtitle: 'Clientes, oportunidades y riesgo sobre el territorio' },
  agenda: { title: 'Agenda operativa', subtitle: 'Prioridades, gestiones y compromisos del equipo comercial' },
  clients: { title: 'Clientes', subtitle: 'Toda la cartera comercial en una sola vista' },
  finance: { title: 'Cartera y cobranzas', subtitle: 'Vencimientos, saldos y comportamiento de pago' },
  products: { title: 'Inteligencia de producto', subtitle: 'Catálogo vectorizado para comparar y recomendar' },
  routes: { title: 'Planificación de rutas', subtitle: 'Recorridos comerciales priorizados y explicables' },
  settings: { title: 'Configuración', subtitle: 'Tutorial, reglas operativas y calidad de datos' },
};

const nav: { id: View; label: string; icon: typeof Map }[] = [
  { id: 'map', label: 'Mapa operativo', icon: Map },
  { id: 'agenda', label: 'Agenda', icon: ClipboardCheck },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'finance', label: 'Cartera', icon: CircleDollarSign },
  { id: 'products', label: 'Productos', icon: Boxes },
  { id: 'routes', label: 'Rutas', icon: Route },
];

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('map');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [routeClientId, setRouteClientId] = useState<number | null>(null);
  const [clientQuery, setClientQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mapClientVisibility, setMapClientVisibility] = useState<ClientVisibility>('active');
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [tutorialCompleted, setTutorialCompleted] = useState(() => localStorage.getItem('salice-tutorial-v004') === 'completed');
  const [globalQuery, setGlobalQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [productFocusId, setProductFocusId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
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

  const refreshNotifications = () => {
    fetch('/api/notifications').then((response) => response.json()).then((payload) => setNotifications(payload.items || [])).catch(() => setNotifications([]));
  };

  useEffect(refreshNotifications, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchInput.current?.focus());
      }
      if (event.key === 'Escape') { setSearchOpen(false); setNotificationsOpen(false); }
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
    } else {
      setSelectedId(null);
    }
  }, [data, tutorialStep]);

  const selected = useMemo(() => data?.clients.find((client) => client.id === selectedId) || null, [data, selectedId]);
  const activeClients = useMemo(() => data?.clients.filter((client) => client.active) ?? [], [data]);
  const openClient = (client: Client, goToMap = false) => { setSelectedId(client.id); setMapClientVisibility(client.active ? 'active' : 'inactive'); if (goToMap) setView('map'); setSearchOpen(false); setNotificationsOpen(false); };
  const selectView = (next: View) => { setView(next); setSidebarOpen(false); if (next !== 'map') setSelectedId(null); };
  const planRoute = (clientId: number) => { if (!data?.clients.find((client) => client.id === clientId)?.active) return; setRouteClientId(clientId); setView('routes'); setSelectedId(null); };
  const noteSaved = (clientId: number, note: string) => setData((current) => current ? ({ ...current, clients: current.clients.map((client) => client.id === clientId ? { ...client, note } : client) }) : current);
  const startTutorial = () => setTutorialStep(0);
  const finishTutorial = () => {
    localStorage.setItem('salice-tutorial-v004', 'completed');
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
    .filter((product) => `${product.name} ${product.sku} ${product.brand} ${product.family}`.toLowerCase().includes(normalizedGlobalQuery))
    .sort((a, b) => b.monthlyUnits - a.monthlyUnits)
    .slice(0, 5), [data, normalizedGlobalQuery]);
  const nextTutorialStep = () => {
    if (tutorialStep == null) return;
    if (tutorialStep === TUTORIAL_STEPS.length - 1) finishTutorial();
    else setTutorialStep(tutorialStep + 1);
  };

  if (error) return <main className="boot-screen"><div className="boot-logo">S</div><h1>No pudimos abrir Salice Inteligente</h1><p>{error}. Ejecutá <code>npm run dev</code> y volvé a intentar.</p><button className="button primary" onClick={() => location.reload()}><RefreshCw size={16} /> Reintentar</button></main>;
  if (!data) return <main className="boot-screen"><div className="boot-logo loading">S</div><h1>Preparando el centro operativo</h1><p>Cargando clientes, productos y cuenta corriente…</p></main>;

  const currentTitle = titles[view];
  const snapshotDate = new Date(data.meta.generatedAt);
  const snapshotDay = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(snapshotDate).replace('.', '');
  const snapshotTime = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(snapshotDate);
  const snapshotLabel = `${snapshotDay} · ${snapshotTime}`;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark"><span>S</span></div><div><strong>SALICE</strong><small>INTELIGENTE</small></div><button className="mobile-close" onClick={() => setSidebarOpen(false)}><X size={19} /></button></div>
        <div className="sidebar-section-label">Centro operativo</div>
        <nav className="main-nav">
          {nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => selectView(item.id)}><Icon size={19} /><span>{item.label}</span>{item.id === 'finance' && activeClients.some((client) => client.health === 'critical') && <i>{activeClients.filter((client) => client.health === 'critical').length}</i>}</button>; })}
        </nav>
        <div className="sidebar-section-label lower">Sistema</div>
        <nav className="main-nav muted-nav"><button disabled title="Disponible en una próxima versión"><LayoutDashboard size={19} /><span>Reportes</span><em>Próximo</em></button><button className={view === 'settings' ? 'active' : ''} onClick={() => selectView('settings')}><Settings2 size={19} /><span>Configuración</span></button></nav>
        <div className="sidebar-insight"><div><Sparkles size={16} /><span>Motor activo</span></div><strong>{data.products.length} productos</strong><p>vectorizados en 20 dimensiones</p></div>
        <div className="sidebar-footer"><span className={`source-dot ${data.meta.source}`} /><div><strong>v{data.meta.version} · {data.meta.sourceLabel}</strong><small>{data.meta.source === 'demo' ? 'Esperando URL de GESI' : 'Snapshot conectado'}</small></div></div>
      </aside>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="topbar-title"><h1>{currentTitle.title}</h1><p>{currentTitle.subtitle}</p></div>
          <div className="topbar-actions">
            <div className={`global-search ${searchOpen ? 'open' : ''}`}><Search size={17} /><input ref={searchInput} value={globalQuery} onFocus={() => setSearchOpen(true)} onChange={(event) => setGlobalQuery(event.target.value)} placeholder="Buscar cliente o producto" /><kbd>⌘ K</kbd>
              {searchOpen && <div className="global-search-results">
                {normalizedGlobalQuery.length < 2 && <p>Escribí al menos 2 caracteres para buscar en toda la base.</p>}
                {!!clientResults.length && <><span className="search-result-label">Clientes</span>{clientResults.map((client) => <button key={client.id} onMouseDown={(event) => event.preventDefault()} onClick={() => openClient(client, true)}><Users size={15} /><div><strong>{client.tradeName}</strong><span>{client.locality} · {client.active ? 'Activo' : 'Inactivo'} · P{client.visitPriority}</span></div><ChevronRight size={15} /></button>)}</>}
                {!!productResults.length && <><span className="search-result-label">Productos</span>{productResults.map((product) => <button key={product.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { setProductFocusId(product.id); setView('products'); setSearchOpen(false); }}><Package size={15} /><div><strong>{product.name}</strong><span>{product.sku} · stock {product.stock}</span></div><ChevronRight size={15} /></button>)}</>}
                {normalizedGlobalQuery.length >= 2 && !clientResults.length && !productResults.length && <p>No encontramos coincidencias.</p>}
              </div>}
            </div>
            <div className={`sync-chip ${data.meta.source}`}><Database size={14} /><div><strong>{data.meta.source === 'demo' ? 'Modo demo' : 'GESI conectado'}</strong><span>Foto · {snapshotLabel}</span></div></div>
            <div className="notification-wrap"><button className="notification-button" aria-label="Notificaciones" onClick={() => { setNotificationsOpen((value) => !value); setSearchOpen(false); }}><Bell size={18} />{!!notifications.length && <i>{notifications.length}</i>}</button>{notificationsOpen && <div className="notification-panel"><div><span className="section-kicker"><AlertTriangle size={14} /> Gestión prioritaria</span><h3>Alertas operativas</h3><p>Promesas exigibles y riesgos altos de la foto actual.</p></div>{notifications.map((item) => { const client = data.clients.find((candidate) => candidate.id === item.clientId); return <button key={item.id} onClick={() => { if (item.type.startsWith('promise')) { setView('agenda'); setNotificationsOpen(false); } else if (client) openClient(client, true); }}><span className={`score-badge ${item.severity}`}>{item.type.startsWith('promise') ? '$' : client?.collectionRisk}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div><ChevronRight size={15} /></button>; })}{!notifications.length && <p className="notification-empty">No hay alertas accionables en este momento.</p>}<button className="notification-all" onClick={() => { setView('agenda'); setNotificationsOpen(false); }}>Abrir agenda operativa</button></div>}</div>
            <div className="user-avatar">FM</div>
          </div>
        </header>

        {data.meta.disclaimer && <div className={`demo-banner ${data.meta.source === 'gesi' ? 'connected' : ''}`}><Database size={15} /><span><strong>{data.meta.source === 'demo' ? 'Prototipo con datos demostrativos.' : 'Snapshot real de Salice.'}</strong> {data.meta.disclaimer}</span></div>}

        <div className="view-container">
          {view === 'map' && <MapDashboard clients={data.clients} products={data.products} selected={selected} onSelect={(client) => setSelectedId(client?.id ?? null)} onPlanRoute={planRoute} onNoteSaved={noteSaved} clientVisibility={mapClientVisibility} onClientVisibilityChange={setMapClientVisibility} />}
          {view === 'agenda' && <AgendaView clients={data.clients} products={data.products} onOpen={(client) => openClient(client)} onPlanRoute={planRoute} onOperationalChange={refreshNotifications} />}
          {view === 'clients' && <ClientsView clients={data.clients} query={clientQuery} onQuery={setClientQuery} onOpen={(client) => openClient(client)} />}
          {view === 'finance' && <FinanceView clients={data.clients} onOpen={(client) => openClient(client)} snapshotDate={data.meta.generatedAt.slice(0, 10)} />}
          {view === 'products' && <ProductsView products={data.products} focusProductId={productFocusId} tutorialVectorMode={tutorialStep != null && TUTORIAL_STEPS[tutorialStep]?.target === 'vector-explorer'} />}
          {view === 'routes' && <RoutesView clients={activeClients} initialClientId={routeClientId} />}
          {view === 'settings' && <SettingsView data={data} tutorialCompleted={tutorialCompleted} onStartTutorial={startTutorial} />}
        </div>
      </main>
      {view !== 'map' && selected && <div className="client-drawer-layer"><button className="client-drawer-backdrop" aria-label="Cerrar ficha" onClick={() => setSelectedId(null)} /><ClientPanel client={selected} products={data.products} onClose={() => setSelectedId(null)} onPlanRoute={planRoute} onNoteSaved={noteSaved} /></div>}
      {tutorialStep != null && <TutorialOverlay stepIndex={tutorialStep} onBack={() => setTutorialStep((value) => value == null ? null : Math.max(0, value - 1))} onNext={nextTutorialStep} onClose={() => setTutorialStep(null)} />}
    </div>
  );
}
