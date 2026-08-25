import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  Database,
  HelpCircle,
  LayoutDashboard,
  Map as MapIcon,
  PackageSearch,
  ReceiptText,
  Route,
  Settings2,
  ShieldCheck,
  ShoppingBasket,
  Store,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import type { Client, DashboardData, NotificationItem } from '../../shared/models';
import { clientPrimaryName, clientSecondaryName } from '../lib/client-name';
import { longDate, money, number } from '../lib/format';
import { buildHomeSummary, type HomeNavigationView } from '../lib/home-summary';

interface HomeViewProps {
  data: DashboardData;
  notifications: NotificationItem[];
  availableViews: HomeNavigationView[];
  recentViews: HomeNavigationView[];
  onOpenClient: (client: Client) => void;
  onNavigate: (view: HomeNavigationView) => void;
}

interface HomeAccessDefinition {
  title: string;
  description: string;
  icon: LucideIcon;
}

const accessDefinitions: Record<HomeNavigationView, HomeAccessDefinition> = {
  agenda: { title: 'Bandeja comercial', description: 'Señales, oportunidades, compromisos y notas', icon: ClipboardCheck },
  finance: { title: 'Cobranzas', description: 'Comprobantes, clientes y trabajo pendiente', icon: WalletCards },
  receivables: { title: 'Cobranzas · Clientes', description: 'Responsables, promesas y próximos pasos', icon: Users },
  clients: { title: 'Clientes', description: 'Cartera, compras, cuenta corriente y ubicación', icon: Users },
  sellers: { title: 'Vendedores', description: 'Carteras, cobertura y desempeño comercial', icon: Users },
  'sales-explorer': { title: 'Ventas', description: 'Del período al comprobante que explica el resultado', icon: ShoppingBasket },
  products: { title: 'Productos', description: 'Catálogo, inventario, demanda y oportunidades', icon: Boxes },
  brands: { title: 'Marcas', description: 'Participación, compra, stock y productos', icon: Store },
  map: { title: 'Mapa operativo', description: 'Clientes y prioridades sobre el territorio', icon: MapIcon },
  routes: { title: 'Rutas', description: 'Facturas, fojas y recorridos estimados', icon: Route },
  'report-center': { title: 'Reportes', description: 'Resultados, comparaciones y reportes específicos', icon: LayoutDashboard },
  reports: { title: 'Reporte General', description: 'Resultados, objetivos y estado comercial', icon: BarChart3 },
  spt: { title: 'Volumen SPT', description: 'Kilos, evolución y comparaciones', icon: BarChart3 },
  'commercial-sales': { title: 'Ventas y composición', description: 'Facturación y mezcla del negocio', icon: BarChart3 },
  mars: { title: 'Mars', description: 'Desempeño comercial del proveedor', icon: BarChart3 },
  nutripet: { title: 'NutriPet', description: 'Volumen, cobertura y evolución', icon: BarChart3 },
  baires: { title: 'Baires', description: 'Volumen, clientes y composición', icon: BarChart3 },
  'non-buyers': { title: 'Cuentas no compradoras', description: 'Cuentas y marcas para recuperar', icon: BarChart3 },
  'pending-balances': { title: 'Saldos pendientes', description: 'Deuda abierta y presión sobre ventas', icon: BarChart3 },
  help: { title: 'Ayuda', description: 'Tutoriales y recorridos guiados paso a paso', icon: HelpCircle },
  settings: { title: 'Configuración', description: 'Preferencias y criterios de trabajo', icon: Settings2 },
  users: { title: 'Usuarios', description: 'Solicitudes, roles y permisos de acceso', icon: ShieldCheck },
  'user-activity': { title: 'Actividad de usuarios', description: 'Uso del programa y cambios registrados', icon: Activity },
};

const accessGroups: Array<{ title: string; description: string; views: HomeNavigationView[] }> = [
  { title: 'Trabajo diario', description: 'Lo que la oficina consulta y actualiza con mayor frecuencia.', views: ['agenda', 'finance'] },
  { title: 'Clientes y ventas', description: 'Personas, responsables, ventas, productos y marcas.', views: ['clients', 'sellers', 'sales-explorer', 'products', 'brands'] },
  { title: 'Planificación', description: 'Territorio, entregas y recorridos.', views: ['map', 'routes'] },
  { title: 'Análisis', description: 'Una sola entrada para elegir el reporte adecuado.', views: ['report-center'] },
  { title: 'Sistema', description: 'Ayuda, preferencias y opciones según tu permiso.', views: ['help', 'settings', 'users', 'user-activity'] },
];

function AccessButton({ view, onNavigate }: { view: HomeNavigationView; onNavigate: (view: HomeNavigationView) => void }) {
  const definition = accessDefinitions[view];
  const Icon = definition.icon;
  return <button type="button" className="home-access-card" onClick={() => onNavigate(view)}>
    <span className="home-access-icon"><Icon size={19} /></span>
    <span><strong>{definition.title}</strong><small>{definition.description}</small></span>
    <ArrowRight size={16} />
  </button>;
}

export function HomeView({ data, notifications, availableViews, recentViews, onOpenClient, onNavigate }: HomeViewProps) {
  const {
    collectionItems,
    opportunities,
    priorityItems,
    activeClients,
    confirmedActiveClients,
    reviewActiveClients,
    portfolio90d,
    portfolioKilos90d,
    portfolioKilosComplete,
    portfolioDelta,
    accountBalance,
    clientsWithDebitBalance,
    highRiskClients,
  } = buildHomeSummary(data, notifications);
  const clientById = new Map(data.clients.map((client) => [client.id, client]));
  const available = new Set(availableViews);
  const visibleRecentViews = recentViews.filter((view) => available.has(view)).slice(0, 4);

  return <div className="page-view home-page" data-tour="home-overview">
    <section className="home-welcome data-card">
      <div>
        <span className="section-kicker"><LayoutDashboard size={15} /> Inicio</span>
        <h2>Una entrada clara a todo el programa</h2>
        <p>Consultá el estado general, retomá las últimas pantallas o elegí directamente el área en la que querés trabajar.</p>
      </div>
      <div className="home-date"><span>Información actualizada</span><strong>{longDate(data.meta.generatedAt)}</strong></div>
    </section>

    <section className="home-kpis" aria-label="Resumen comercial" data-tour="home-kpis">
      <button className="home-kpi clients" onClick={() => onNavigate('clients')} aria-label="Abrir Clientes">
        <span><Users size={20} /></span><div><small>Clientes activos</small><strong>{number(activeClients.length)}</strong><em>{number(confirmedActiveClients)} confirmados · {number(reviewActiveClients)} a revisar</em></div><ArrowRight size={16} />
      </button>
      <button className="home-kpi sales" onClick={() => onNavigate('sales-explorer')} aria-label="Abrir Ventas">
        <span><TrendingUp size={20} /></span><div><small>Facturación / kilos · 90 días</small><strong>{money(portfolio90d, true)}</strong><em>{number(portfolioKilos90d, 2)} kg{portfolioKilosComplete ? '' : ' · conversión parcial'} · {portfolioDelta >= 0 ? '↑' : '↓'} {Math.abs(portfolioDelta)}% vs. trimestre anterior</em></div><ArrowRight size={16} />
      </button>
      <button className="home-kpi balance" onClick={() => onNavigate('finance')} aria-label="Abrir comprobantes de Cobranzas">
        <span><CircleDollarSign size={20} /></span><div><small>Saldo neto en cuenta corriente</small><strong>{money(accountBalance, true)}</strong><em>{number(clientsWithDebitBalance)} clientes activos con saldo deudor</em></div><ArrowRight size={16} />
      </button>
      <button className="home-kpi risk" onClick={() => onNavigate('receivables')} aria-label="Abrir clientes de Cobranzas">
        <span><AlertTriangle size={20} /></span><div><small>Riesgo de cobranza alto</small><strong>{number(highRiskClients.length)}</strong><em>Puntaje 55 o superior · revisar antes de vender</em></div><ArrowRight size={16} />
      </button>
    </section>

    <section className="data-card home-shortcuts">
      <div className="data-card-header"><div><span className="section-kicker"><ReceiptText size={14} /> Accesos rápidos</span><h2>Tus últimas pantallas</h2><p>Se actualizan con las cuatro pestañas distintas que usaste más recientemente.</p></div></div>
      {visibleRecentViews.length > 0
        ? <div className="home-shortcut-grid">{visibleRecentViews.map((view) => <AccessButton key={view} view={view} onNavigate={onNavigate} />)}</div>
        : <div className="home-recent-empty"><LayoutDashboard size={21} /><span><strong>Todavía no hay pantallas recientes</strong><small>Cuando abras otras áreas, aparecerán acá para que puedas retomarlas.</small></span></div>}
    </section>

    <section className="data-card home-directory" aria-labelledby="home-directory-title">
      <div className="data-card-header"><div><span className="section-kicker"><PackageSearch size={14} /> Secciones</span><h2 id="home-directory-title">¿Dónde querés trabajar?</h2><p>Cada acceso abre la sección completa. Reportes conserva una sola entrada porque su portada ya organiza todos los informes.</p></div></div>
      <div className="home-access-groups">
        {accessGroups.map((group) => {
          const groupViews = group.views.filter((view) => available.has(view));
          if (!groupViews.length) return null;
          return <section key={group.title} className="home-access-group">
            <header><strong>{group.title}</strong><span>{group.description}</span></header>
            <div>{groupViews.map((view) => <AccessButton key={view} view={view} onNavigate={onNavigate} />)}</div>
          </section>;
        })}
      </div>
    </section>

    <div className="home-main-grid">
      <details className="data-card home-expandable home-priority-card">
        <summary><span><span className="section-kicker"><AlertTriangle size={14} /> Atención</span><strong>Lo más importante ahora</strong><small>Promesas y riesgos que requieren revisión de la oficina.</small></span><span className="count-badge">{number(notifications.length)}</span><ChevronDown size={18} /></summary>
        <div className="home-priority-list">
          {priorityItems.map((item) => {
            const client = clientById.get(item.clientId);
            return <button key={item.id} onClick={() => client && onOpenClient(client)} disabled={!client}>
              <span className={`home-priority-icon ${item.severity}`}>{item.type.startsWith('promise') ? <CircleDollarSign size={16} /> : <WalletCards size={16} />}</span>
              <span><strong>{item.title}</strong><small>{item.detail}</small></span>
              <ArrowRight size={15} />
            </button>;
          })}
          {!priorityItems.length && <div className="home-empty"><CheckCircle2 size={24} /><div><strong>No hay alertas inmediatas</strong><span>Podés continuar con la bandeja comercial o consultar los reportes.</span></div></div>}
        </div>
        <button className="button secondary home-section-link" onClick={() => onNavigate('receivables')}>Abrir Clientes de Cobranzas <ArrowRight size={14} /></button>
      </details>

      <details className="data-card home-expandable home-opportunity-card">
        <summary><span><span className="section-kicker"><PackageSearch size={14} /> Comercial</span><strong>Clientes con oportunidad alta</strong><small>Una selección breve antes de abrir la bandeja completa.</small></span><span className="count-badge">{number(opportunities.length)}</span><ChevronDown size={18} /></summary>
        <div className="home-opportunity-list">
          {opportunities.slice(0, 5).map((client) => <button key={client.id} onClick={() => onOpenClient(client)}>
            <span><strong>{clientPrimaryName(client)}</strong><small>{clientSecondaryName(client) ? `${clientSecondaryName(client)} · ` : ''}{client.seller}</small></span>
            <span className="home-opportunity-score"><strong>{client.commercialOpportunity}</strong><small>oportunidad</small></span>
            <ArrowRight size={15} />
          </button>)}
          {!opportunities.length && <div className="home-empty"><CheckCircle2 size={24} /><div><strong>Sin oportunidades altas</strong><span>La bandeja conserva el resto de las señales comerciales.</span></div></div>}
        </div>
        <button className="button secondary home-section-link" onClick={() => onNavigate('agenda')}>Abrir Bandeja comercial <ArrowRight size={14} /></button>
      </details>
    </div>

    <details className="business-report-source-note home-technical-note"><summary><Database size={15} /> Información técnica de Inicio</summary><div><strong>Cómo se forma este resumen</strong><span>Las cifras se calculan con la misma información y las mismas reglas que Cobranzas, Bandeja comercial, Clientes, Ventas y Productos. Inicio no crea tareas, no cambia estados y no modifica ningún importe.</span>{collectionItems.length > 0 && <small>{number(collectionItems.length)} alertas corresponden a riesgo de cobranza.</small>}</div></details>
  </div>;
}
