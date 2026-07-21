import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, BookOpen, CheckCircle2, ClipboardCheck, Database, HardDrive, Map, PlayCircle, Route, Search, ShieldCheck, Users, WalletCards } from 'lucide-react';
import type { DashboardData } from '../../shared/models';
import type { DataHealthPayload } from '../../shared/data-health';
import type { MetricDefinition, ReportUniverseDefinition } from '../../shared/metrics';
import { longDate, number } from '../lib/format';

const lessons = [
  { icon: Map, title: 'Mapa operativo', text: 'Indicadores, cartera Salice, agrupación de puntos y fichas.' },
  { icon: ClipboardCheck, title: 'Agenda operativa', text: 'Prioridades, gestiones, resultados y promesas de pago.' },
  { icon: Users, title: 'Clientes', text: 'GESI, pertenencia, riesgo, oportunidad y filtros.' },
  { icon: Users, title: 'Vendedores', text: 'Desempeño, cartera, cobranza, territorio y clientes prioritarios.' },
  { icon: WalletCards, title: 'Cobranzas', text: 'Antigüedad, saldo pendiente y pago contra vencimiento.' },
  { icon: BarChart3, title: 'Reportes', text: 'Gestión general, volumen SPT, ventas comerciales, proveedores y cuentas no compradoras.' },
  { icon: BarChart3, title: 'Productos', text: 'Disponibilidad, comparación y ranking de 33 vectores.' },
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

interface MetricCatalogPayload {
  version: string;
  metrics: MetricDefinition[];
  universes: ReportUniverseDefinition[];
  principles: string[];
}

const freshnessLabels = { current: 'Actual', attention: 'Revisar', stale: 'Desactualizado', unknown: 'Sin fecha' };
const sourceLabels = { healthy: 'Consistente', attention: 'Con salvedades', stale: 'Desactualizada', unavailable: 'No disponible' };
const refreshStatusLabels = { running: 'En curso', success: 'Aprobada', failed: 'Fallida' };

function refreshDate(value: string) {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value));
}

export function SettingsView({ data, dataHealth, tutorialCompleted, onStartTutorial }: { data: DashboardData; dataHealth: DataHealthPayload | null; tutorialCompleted: boolean; onStartTutorial: () => void }) {
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [catalog, setCatalog] = useState<MetricCatalogPayload | null>(null);
  const [metricQuery, setMetricQuery] = useState('');
  useEffect(() => { fetch('/api/system/status').then((response) => response.json()).then(setSystem).catch(() => setSystem(null)); }, []);
  useEffect(() => { fetch('/api/metrics/catalog').then((response) => response.json()).then(setCatalog).catch(() => setCatalog(null)); }, []);
  const coverage = data.meta.coverage;
  const active = coverage?.activeClients ?? data.clients.filter((client) => client.active).length;
  const inactive = coverage?.inactiveClients ?? data.clients.filter((client) => !client.active).length;
  const confirmed = coverage?.activePortfolioConfirmedClients ?? data.clients.filter((client) => client.active && client.portfolioStatus === 'confirmed').length;
  const review = coverage?.activePortfolioReviewClients ?? active - confirmed;
  const activeGeocoded = coverage?.activeGeocodedClients ?? data.clients.filter((client) => client.active && client.coordinates).length;
  const geocodeRate = active ? Math.round(activeGeocoded / active * 100) : 0;
  const normalizedMetricQuery = metricQuery.trim().toLocaleLowerCase('es');
  const visibleMetrics = useMemo(() => !catalog ? [] : catalog.metrics.filter((metric) => !normalizedMetricQuery || `${metric.label} ${metric.description} ${metric.consumers.join(' ')}`.toLocaleLowerCase('es').includes(normalizedMetricQuery)), [catalog, normalizedMetricQuery]);
  return (
    <div className="page-view settings-view">
      <section className="data-card settings-tutorial-card" data-tour="settings-tutorial">
        <div className="settings-tutorial-copy">
          <div className="settings-icon"><BookOpen size={28} /></div>
          <div><span className="section-kicker">Recorrido guiado · 22 pasos</span><h2>Aprendé a usar Salice Inteligente v0.3.2</h2><p>El tutorial recorre agenda, clientes, vendedores, cartera, objetivos, saldos pendientes, productos y rutas. Sólo los formularios operativos modifican datos locales.</p></div>
        </div>
        <div className="settings-tutorial-action">
          {tutorialCompleted && <span><CheckCircle2 size={15} /> Completado en este equipo</span>}
          <button className="button primary large" onClick={onStartTutorial}><PlayCircle size={17} /> {tutorialCompleted ? 'Repetir tutorial' : 'Iniciar tutorial'}</button>
        </div>
      </section>

      <section className={`data-card data-health-card ${dataHealth?.overall ?? 'unavailable'}`}>
        <div className="data-card-header"><div><span className="section-kicker"><Database size={14} /> Estado de los datos</span><h2>Frescura, fuentes y última validación</h2><p>La pantalla siempre conserva la última foto aprobada; una captura fallida no reemplaza estos datos.</p></div><span className={`data-health-badge ${dataHealth?.freshness.level ?? 'unknown'}`}>{dataHealth ? freshnessLabels[dataHealth.freshness.level] : 'Consultando…'}</span></div>
        {dataHealth ? <>
          <div className="data-source-grid">{dataHealth.sources.map((source) => <article key={source.id}><div><span className={`source-health-dot ${source.level}`} /><strong>{source.label}</strong><em>{sourceLabels[source.level]}</em></div><p>{source.detail}</p><small>{source.coverageFrom ? `Cobertura ${source.coverageFrom} → ${source.coverageThrough}` : `Corte ${source.coverageThrough}`}</small></article>)}</div>
          <div className="data-health-footer"><span><strong>{dataHealth.freshness.label}</strong> · advertencia desde {dataHealth.freshness.warningAfterHours} h; desactualizado desde {dataHealth.freshness.staleAfterHours} h.</span>{dataHealth.quality && <span><ShieldCheck size={14} /> Auditoría {dataHealth.quality.passed}/{dataHealth.quality.total} · {dataHealth.quality.warnings} salvedades</span>}{dataHealth.refresh.lastAttempt?.status === 'failed' && <span className="refresh-failure"><AlertTriangle size={14} /> Último intento fallido en {dataHealth.refresh.lastAttempt.stage}: {dataHealth.refresh.lastAttempt.error}</span>}{dataHealth.refresh.current && <span>Actualización manual en curso · {dataHealth.refresh.current.stage}</span>}</div>
          <details className="refresh-history"><summary><span>Historial de actualizaciones manuales</span><em>{dataHealth.refresh.recent.length ? `${dataHealth.refresh.recent.length} ejecuciones` : 'Sin ejecuciones registradas en v0.3'}</em></summary>{dataHealth.refresh.recent.length > 0 && <div>{dataHealth.refresh.recent.map((run) => <article key={run.id}><span className={`refresh-run-status ${run.status}`}>{refreshStatusLabels[run.status]}</span><p><strong>{refreshDate(run.startedAt)}</strong><small>{run.trigger === 'manual-resume' ? 'Reanudación manual' : 'Actualización manual'} · etapa {run.stage}</small></p><p><strong>{run.durationMs == null ? 'Duración pendiente' : `${Math.max(1, Math.round(run.durationMs / 1000))} s`}</strong><small>{run.qualityStatus ?? 'Calidad pendiente'} · {run.warnings} salvedades</small></p>{run.error && <p className="refresh-run-error">{run.error}</p>}</article>)}</div>}</details>
        </> : <p className="settings-card-copy">No se pudo leer el estado consolidado. El snapshot activo continúa disponible.</p>}
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
          <div className="rule-list"><p><strong>Plazo por factura</strong><span>Diferencia exacta entre compra/emisión y primer vencimiento. Es la fuente operativa para cuenta corriente.</span></p><p><strong>Condición habitual o mixta</strong><span>Se agrupan corrimientos de hasta 3 días; una opción necesita al menos 60% para llamarse predominante.</span></p><p><strong>Pago contra vencimiento</strong><span>Días antes o después de la fecha contractual y porcentaje en término.</span></p><p><strong>Saldo pendiente</strong><span>La agenda usa el monto aún abierto; el importe original queda como referencia.</span></p><p><strong>Límite de crédito</strong><span>GESI informa cero para la cartera actual: por eso no se muestra un porcentaje ficticio.</span></p></div>
        </section>

        <section className="data-card settings-card" data-tour="data-quality">
          <div className="data-card-header"><div><span className="section-kicker"><ShieldCheck size={14} /> Calidad y cobertura</span><h2>Qué tan completa es la foto</h2></div><span className="count-badge">{longDate(data.meta.generatedAt)}</span></div>
          <div className="coverage-list"><p><span>Geocodificación de activos</span><strong>{geocodeRate}% · {number(activeGeocoded)} / {number(active)}</strong></p><p><span>Productos con precio</span><strong>{number(coverage?.pricedProducts ?? 0)} / {number(data.products.length)}</strong></p><p><span>Pagos conciliados</span><strong>{number(coverage?.paymentSamples ?? 0)}</strong></p><p><span>Facturas con plazo válido</span><strong>{number(coverage?.creditTermInvoices ?? 0)} / {number(coverage?.invoices365d ?? 0)}</strong></p><p><span>Clientes con condición realmente mixta</span><strong>{number(coverage?.clientsWithMixedCreditTerms ?? 0)}</strong></p><p><span>Detalles de factura omitidos por GESI</span><strong>{number(coverage?.omittedInvoiceDetails ?? 0)}</strong></p></div>
        </section>

        <section className="data-card settings-card" data-tour="storage-rules">
          <div className="data-card-header"><div><span className="section-kicker"><HardDrive size={14} /> Persistencia local</span><h2>Datos humanos separados de GESI</h2></div><span className="algorithm-pill">SQLite</span></div>
          <p className="settings-card-copy">Notas, gestiones, tareas y promesas se guardan fuera del snapshot importado. Así sobreviven a futuras actualizaciones de GESI.</p>
          <div className="coverage-list"><p><span>Notas persistidas</span><strong>{system ? number(system.notes) : 'Cargando…'}</strong></p><p><span>Gestiones registradas</span><strong>{system ? number(system.activities) : 'Cargando…'}</strong></p><p><span>Promesas pendientes</span><strong>{system ? number(system.pendingPromises) : 'Cargando…'}</strong></p><p><span>Tareas manuales pendientes</span><strong>{system ? number(system.pendingAgendaItems) : 'Cargando…'}</strong></p><p><span>Respaldos del snapshot</span><strong>{system ? number(system.backups) : 'Cargando…'}</strong></p><p><span>Última sincronización registrada</span><strong>{system?.lastSync ? longDate(system.lastSync.snapshotAt) : 'Foto actual migrada'}</strong></p></div>
        </section>

        <section className="data-card settings-card settings-wide-card">
          <div className="data-card-header"><div><span className="section-kicker"><BarChart3 size={14} /> Reglas explicables</span><h2>Tres puntajes y clasificación de producto</h2></div><span className="algorithm-pill">Sin IA operativa</span></div>
          <div className="score-definition-grid"><article><strong>C · Riesgo de cobranza</strong><p>Vencimientos, antigüedad, monto, demora histórica y marcas administrativas de GESI.</p></article><article><strong>O · Oportunidad comercial</strong><p>Recencia de compra, caída de ventas, inactividad reciente y amplitud del mix.</p></article><article><strong>P · Prioridad de visita</strong><p>58% riesgo de cobranza + 42% oportunidad. No se presenta como una predicción.</p></article><article><strong>Agenda y gestiones</strong><p>Una acción se considera realizada sólo al guardarla; no se infieren visitas por ubicación ni por fecha sugerida.</p></article><article><strong>Promesas exigibles</strong><p>Suma de compromisos locales pendientes con fecha igual o anterior al día elegido; no equivale a cobranza cobrada.</p></article><article><strong>Saldo accionable</strong><p>Un residual menor a $1.000 permanece visible, pero no genera por sí solo una tarea o alerta de cobranza.</p></article><article><strong>Vector v2.1</strong><p>33 dimensiones determinísticas agrupadas por especie, edad y porte, posicionamiento, tipo, necesidad y sabor. Económico y Premium pueden sumar precio/kg relativo sólo dentro de cohortes comparables.</p></article></div>
        </section>

        <section className="data-card settings-card settings-wide-card metric-catalog-card">
          <div className="data-card-header"><div><span className="section-kicker"><BookOpen size={14} /> Catálogo central · {catalog ? `v${catalog.version}` : 'cargando'}</span><h2>Métricas canónicas</h2><p>Una definición compartida para evitar que dos pantallas usen el mismo nombre con reglas diferentes.</p></div><label className="metric-search"><Search size={15} /><input value={metricQuery} onChange={(event) => setMetricQuery(event.target.value)} placeholder="Buscar métrica o reporte" aria-label="Buscar en el catálogo de métricas" /></label></div>
          {catalog ? <div className="metric-definition-list">{visibleMetrics.map((metric) => <details key={metric.id} className="metric-definition"><summary><div><strong>{metric.label}</strong><span>{metric.description}</span></div><em>{metric.unit}</em></summary><div className="metric-definition-body"><p><b>Definición</b><code>{metric.formula}</code></p><p><b>Fuente</b><span>{metric.source}</span></p><p><b>Grano</b><span>{metric.grain}</span></p><p><b>Fecha</b><span>{metric.dateBasis}</span></p><p><b>Usada en</b><span>{metric.consumers.join(' · ')}</span></p>{metric.caveats.length > 0 && <p><b>Salvedades</b><span>{metric.caveats.join(' ')}</span></p>}</div></details>)}{!visibleMetrics.length && <p className="notification-empty">No hay métricas que coincidan con la búsqueda.</p>}</div> : <p className="settings-card-copy">No se pudo cargar el catálogo central.</p>}
        </section>

        <section className="data-card settings-card settings-wide-card universe-catalog-card">
          <div className="data-card-header"><div><span className="section-kicker"><ShieldCheck size={14} /> Universos documentados</span><h2>Cada reporte conserva su alcance</h2><p>Empresa, sucursal, exclusiones y corte temporal se documentan por separado.</p></div><span className="count-badge">{catalog?.universes.length ?? 0} universos</span></div>
          <div className="universe-definition-grid">{catalog?.universes.map((universe) => <article key={universe.id}><div><strong>{universe.label}</strong><span>Empresa {universe.companies.join('/')} · sucursal {universe.branches.join('/') || 'según reporte'}</span></div><p><b>Incluye:</b> {universe.included.join(' ')}</p><p><b>Excluye:</b> {universe.excluded.length ? universe.excluded.join(' · ') : 'Sin exclusiones adicionales.'}</p><small>{universe.dateRule}</small></article>)}</div>
        </section>
      </div>
    </div>
  );
}
