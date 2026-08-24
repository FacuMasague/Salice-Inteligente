import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Database,
  LayoutDashboard,
  PackageSearch,
  Users,
  WalletCards,
} from 'lucide-react';
import type { Client, DashboardData, NotificationItem } from '../../shared/models';
import { clientPrimaryName, clientSecondaryName } from '../lib/client-name';
import { longDate, money, number } from '../lib/format';
import { buildHomeSummary } from '../lib/home-summary';

interface HomeViewProps {
  data: DashboardData;
  notifications: NotificationItem[];
  onOpenClient: (client: Client) => void;
  onOpenAgenda: () => void;
  onOpenPortfolio: () => void;
  onOpenFollowup: () => void;
  onOpenProducts: () => void;
  onOpenReports: () => void;
}

export function HomeView({
  data,
  notifications,
  onOpenClient,
  onOpenAgenda,
  onOpenPortfolio,
  onOpenFollowup,
  onOpenProducts,
  onOpenReports,
}: HomeViewProps) {
  const { promiseItems, collectionItems, overdueInvoices, overdueAmount, opportunities, inventoryAlerts, priorityItems } = buildHomeSummary(data, notifications);
  const clientById = new Map(data.clients.map((client) => [client.id, client]));

  return <div className="page-view home-page" data-tour="home-overview">
    <section className="home-welcome data-card">
      <div>
        <span className="section-kicker"><LayoutDashboard size={15} /> Inicio</span>
        <h2>La información importante para empezar</h2>
        <p>Revisá compromisos, cobranzas y oportunidades sin recorrer todas las pantallas. Los accesos abren el módulo completo cuando necesitás profundizar.</p>
      </div>
      <div className="home-date"><span>Información actualizada</span><strong>{longDate(data.meta.generatedAt)}</strong></div>
    </section>

    <section className="home-kpis" aria-label="Resumen de trabajo">
      <button className="home-kpi critical" onClick={onOpenFollowup}><span><CalendarClock size={20} /></span><div><small>Promesas para revisar</small><strong>{number(promiseItems.length)}</strong><em>Vencidas o para hoy</em></div><ArrowRight size={16} /></button>
      <button className="home-kpi danger" onClick={onOpenPortfolio}><span><CircleDollarSign size={20} /></span><div><small>Saldo vencido</small><strong>{money(overdueAmount, true)}</strong><em>{number(overdueInvoices.length)} comprobantes</em></div><ArrowRight size={16} /></button>
      <button className="home-kpi opportunity" onClick={onOpenAgenda}><span><Users size={20} /></span><div><small>Oportunidades altas</small><strong>{number(opportunities.length)}</strong><em>Clientes para revisar</em></div><ArrowRight size={16} /></button>
      <button className="home-kpi inventory" onClick={onOpenProducts}><span><Boxes size={20} /></span><div><small>Inventario para revisar</small><strong>{number(inventoryAlerts.length)}</strong><em>Faltantes, cobertura o inmovilidad</em></div><ArrowRight size={16} /></button>
    </section>

    <div className="home-main-grid">
      <section className="data-card home-priority-card">
        <div className="data-card-header"><div><span className="section-kicker"><AlertTriangle size={14} /> Atención</span><h2>Lo más importante ahora</h2><p>Promesas y riesgos que ya requieren una revisión de la oficina.</p></div><span className="count-badge">{number(notifications.length)}</span></div>
        <div className="home-priority-list">
          {priorityItems.map((item) => {
            const client = clientById.get(item.clientId);
            return <button key={item.id} onClick={() => client && onOpenClient(client)} disabled={!client}>
              <span className={`home-priority-icon ${item.severity}`}>{item.type.startsWith('promise') ? <CalendarClock size={16} /> : <WalletCards size={16} />}</span>
              <span><strong>{item.title}</strong><small>{item.detail}</small></span>
              <ArrowRight size={15} />
            </button>;
          })}
          {!priorityItems.length && <div className="home-empty"><CheckCircle2 size={24} /><div><strong>No hay alertas inmediatas</strong><span>Podés continuar con la bandeja comercial o consultar los reportes.</span></div></div>}
        </div>
        <button className="button secondary home-section-link" onClick={onOpenFollowup}>Abrir Seguimiento <ArrowRight size={14} /></button>
      </section>

      <section className="data-card home-opportunity-card">
        <div className="data-card-header"><div><span className="section-kicker"><PackageSearch size={14} /> Comercial</span><h2>Clientes con oportunidad alta</h2><p>Una selección breve para revisar antes de abrir la bandeja completa.</p></div><span className="count-badge">{number(opportunities.length)}</span></div>
        <div className="home-opportunity-list">
          {opportunities.slice(0, 5).map((client) => <button key={client.id} onClick={() => onOpenClient(client)}>
            <span><strong>{clientPrimaryName(client)}</strong><small>{clientSecondaryName(client) ? `${clientSecondaryName(client)} · ` : ''}{client.seller}</small></span>
            <span className="home-opportunity-score"><strong>{client.commercialOpportunity}</strong><small>oportunidad</small></span>
            <ArrowRight size={15} />
          </button>)}
          {!opportunities.length && <div className="home-empty"><CheckCircle2 size={24} /><div><strong>Sin oportunidades altas</strong><span>La bandeja conserva el resto de las señales comerciales.</span></div></div>}
        </div>
        <button className="button secondary home-section-link" onClick={onOpenAgenda}>Abrir Bandeja comercial <ArrowRight size={14} /></button>
      </section>
    </div>

    <section className="data-card home-shortcuts">
      <div className="data-card-header"><div><span className="section-kicker"><ClipboardCheck size={14} /> Accesos rápidos</span><h2>Continuar el trabajo</h2></div></div>
      <div><button onClick={onOpenAgenda}><ClipboardCheck size={18} /><span><strong>Bandeja comercial</strong><small>Señales, notas y oportunidades</small></span><ArrowRight size={15} /></button><button onClick={onOpenPortfolio}><WalletCards size={18} /><span><strong>Cobranzas</strong><small>Cartera y seguimientos</small></span><ArrowRight size={15} /></button><button onClick={onOpenProducts}><Boxes size={18} /><span><strong>Productos</strong><small>Inventario y oportunidades</small></span><ArrowRight size={15} /></button><button onClick={onOpenReports}><LayoutDashboard size={18} /><span><strong>Reportes</strong><small>Resultados y comparaciones</small></span><ArrowRight size={15} /></button></div>
    </section>

    <details className="business-report-source-note home-technical-note"><summary><Database size={15} /> Información técnica de Inicio</summary><div><strong>Cómo se forma este resumen</strong><span>Las cifras se calculan con la misma información y las mismas reglas que Cobranzas, Bandeja comercial, Clientes y Productos. Inicio no crea tareas, no cambia estados y no modifica ningún importe.</span>{collectionItems.length > 0 && <small>{number(collectionItems.length)} alertas corresponden a riesgo de cobranza.</small>}</div></details>
  </div>;
}
