import { useEffect, useState } from 'react';
import { BarChart3, BookOpen, CheckCircle2, ClipboardCheck, Database, HardDrive, Map, PlayCircle, Route, ShieldCheck, Users, WalletCards } from 'lucide-react';
import type { DashboardData } from '../../shared/models';
import { longDate, number } from '../lib/format';

const lessons = [
  { icon: Map, title: 'Mapa operativo', text: 'Indicadores, cartera Salice, agrupación de puntos y fichas.' },
  { icon: ClipboardCheck, title: 'Agenda operativa', text: 'Prioridades, gestiones, resultados y promesas de pago.' },
  { icon: Users, title: 'Clientes', text: 'GESI, pertenencia, riesgo, oportunidad y filtros.' },
  { icon: WalletCards, title: 'Cobranzas', text: 'Antigüedad, saldo pendiente y pago contra vencimiento.' },
  { icon: BarChart3, title: 'Productos', text: 'Disponibilidad, comparación y ranking de 20 vectores.' },
  { icon: Route, title: 'Rutas', text: 'Corredores, límite de jornada y supuestos visibles.' },
];

interface SystemStatus {
  storage: string;
  notes: number;
  activities: number;
  pendingPromises: number;
  pendingAgendaItems: number;
  backups: number;
  lastSync: { completedAt: string; snapshotAt: string; status: string } | null;
}

export function SettingsView({ data, tutorialCompleted, onStartTutorial }: { data: DashboardData; tutorialCompleted: boolean; onStartTutorial: () => void }) {
  const [system, setSystem] = useState<SystemStatus | null>(null);
  useEffect(() => { fetch('/api/system/status').then((response) => response.json()).then(setSystem).catch(() => setSystem(null)); }, []);
  const coverage = data.meta.coverage;
  const active = coverage?.activeClients ?? data.clients.filter((client) => client.active).length;
  const inactive = coverage?.inactiveClients ?? data.clients.filter((client) => !client.active).length;
  const confirmed = coverage?.activePortfolioConfirmedClients ?? data.clients.filter((client) => client.active && client.portfolioStatus === 'confirmed').length;
  const review = coverage?.activePortfolioReviewClients ?? active - confirmed;
  const activeGeocoded = coverage?.activeGeocodedClients ?? data.clients.filter((client) => client.active && client.coordinates).length;
  const geocodeRate = active ? Math.round(activeGeocoded / active * 100) : 0;
  return (
    <div className="page-view settings-view">
      <section className="data-card settings-tutorial-card" data-tour="settings-tutorial">
        <div className="settings-tutorial-copy">
          <div className="settings-icon"><BookOpen size={28} /></div>
          <div><span className="section-kicker">Recorrido guiado · 12 pasos</span><h2>Aprendé a usar Salice Inteligente v0.0.4</h2><p>El tutorial recorre la agenda diaria, las nuevas definiciones de cartera, cobranza, oportunidad y rutas. Sólo el formulario de gestión modifica datos locales.</p></div>
        </div>
        <div className="settings-tutorial-action">
          {tutorialCompleted && <span><CheckCircle2 size={15} /> Completado en este equipo</span>}
          <button className="button primary large" onClick={onStartTutorial}><PlayCircle size={17} /> {tutorialCompleted ? 'Repetir tutorial' : 'Iniciar tutorial'}</button>
        </div>
      </section>

      <div className="settings-grid">
        <section className="data-card settings-card">
          <div className="data-card-header"><div><span className="section-kicker"><BookOpen size={14} /> Contenido</span><h2>Qué vas a aprender</h2></div></div>
          <div className="settings-lessons">{lessons.map(({ icon: Icon, title, text }, index) => <article key={title}><span>{index + 1}</span><Icon size={18} /><div><strong>{title}</strong><p>{text}</p></div></article>)}</div>
        </section>

        <section className="data-card settings-card" data-tour="portfolio-rules">
          <div className="data-card-header"><div><span className="section-kicker"><ShieldCheck size={14} /> Universo de clientes</span><h2>GESI y cartera Salice son señales distintas</h2></div><span className="count-badge">Regla conservadora</span></div>
          <div className="status-audit-summary"><div><strong>{number(confirmed)}</strong><span>activos con sucursal Salice confirmada</span></div><div className="review"><strong>{number(review)}</strong><span>activos cuya pertenencia debe revisarse</span></div></div>
          <p className="settings-card-copy">El estado 1 de GESI sigue definiendo actividad. La definición empresa 3 / sucursal 3 se muestra como segunda señal: los casos sin esa definición no se excluyen hasta validarlos con Salice.</p>
          <div className="settings-rule"><Database size={16} /><span>{number(inactive)} inactivos permanecen disponibles como histórico. La cobranza conserva sus documentos abiertos.</span></div>
        </section>

        <section className="data-card settings-card" data-tour="finance-rules">
          <div className="data-card-header"><div><span className="section-kicker"><WalletCards size={14} /> Semántica financiera</span><h2>Métricas que no mezclan conceptos</h2></div></div>
          <div className="rule-list"><p><strong>Pago contra vencimiento</strong><span>Días antes o después de la fecha contractual y porcentaje en término.</span></p><p><strong>Saldo pendiente</strong><span>La agenda usa el monto aún abierto; el importe original queda como referencia.</span></p><p><strong>Límite de crédito</strong><span>GESI informa cero para la cartera actual: por eso no se muestra un porcentaje ficticio.</span></p></div>
        </section>

        <section className="data-card settings-card" data-tour="data-quality">
          <div className="data-card-header"><div><span className="section-kicker"><ShieldCheck size={14} /> Calidad y cobertura</span><h2>Qué tan completa es la foto</h2></div><span className="count-badge">{longDate(data.meta.generatedAt)}</span></div>
          <div className="coverage-list"><p><span>Geocodificación de activos</span><strong>{geocodeRate}% · {number(activeGeocoded)} / {number(active)}</strong></p><p><span>Productos con precio</span><strong>{number(coverage?.pricedProducts ?? 0)} / {number(data.products.length)}</strong></p><p><span>Pagos conciliados</span><strong>{number(coverage?.paymentSamples ?? 0)}</strong></p><p><span>Detalles de factura omitidos por GESI</span><strong>{number(coverage?.omittedInvoiceDetails ?? 0)}</strong></p></div>
        </section>

        <section className="data-card settings-card" data-tour="storage-rules">
          <div className="data-card-header"><div><span className="section-kicker"><HardDrive size={14} /> Persistencia local</span><h2>Datos humanos separados de GESI</h2></div><span className="algorithm-pill">SQLite</span></div>
          <p className="settings-card-copy">Notas, gestiones, tareas y promesas se guardan fuera del snapshot importado. Así sobreviven a futuras actualizaciones de GESI.</p>
          <div className="coverage-list"><p><span>Notas persistidas</span><strong>{system ? number(system.notes) : 'Cargando…'}</strong></p><p><span>Gestiones registradas</span><strong>{system ? number(system.activities) : 'Cargando…'}</strong></p><p><span>Promesas pendientes</span><strong>{system ? number(system.pendingPromises) : 'Cargando…'}</strong></p><p><span>Tareas manuales pendientes</span><strong>{system ? number(system.pendingAgendaItems) : 'Cargando…'}</strong></p><p><span>Respaldos del snapshot</span><strong>{system ? number(system.backups) : 'Cargando…'}</strong></p><p><span>Última sincronización registrada</span><strong>{system?.lastSync ? longDate(system.lastSync.snapshotAt) : 'Foto actual migrada'}</strong></p></div>
        </section>

        <section className="data-card settings-card settings-wide-card">
          <div className="data-card-header"><div><span className="section-kicker"><BarChart3 size={14} /> Reglas explicables</span><h2>Dos puntajes y clasificación de producto</h2></div><span className="algorithm-pill">Sin IA operativa</span></div>
          <div className="score-definition-grid"><article><strong>C · Riesgo de cobranza</strong><p>Vencimientos, antigüedad, monto, demora histórica y marcas administrativas de GESI.</p></article><article><strong>O · Oportunidad comercial</strong><p>Recencia de compra, caída de ventas, inactividad reciente y amplitud del mix.</p></article><article><strong>P · Prioridad de visita</strong><p>58% riesgo de cobranza + 42% oportunidad. No se presenta como una predicción.</p></article><article><strong>Agenda y gestiones</strong><p>Una acción se considera realizada sólo al guardarla; no se infieren visitas por ubicación ni por fecha sugerida.</p></article><article><strong>Promesas exigibles</strong><p>Suma de compromisos locales pendientes con fecha igual o anterior al día elegido; no equivale a cobranza cobrada.</p></article><article><strong>Saldo accionable</strong><p>Un residual menor a $1.000 permanece visible, pero no genera por sí solo una tarea o alerta de cobranza.</p></article><article><strong>Vector v1.1</strong><p>20 dimensiones determinísticas; recomendaciones con nivel de confianza y muestra comparable.</p></article></div>
        </section>
      </div>
    </div>
  );
}
