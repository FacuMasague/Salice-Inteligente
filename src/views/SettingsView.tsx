import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, BookOpen, BrainCircuit, CheckCircle2, ClipboardCheck, Database, HardDrive, Map, MessageSquareText, PlayCircle, RefreshCcw, Route, Search, ShieldCheck, Users, WalletCards } from 'lucide-react';
import type { DashboardData } from '../../shared/models';
import type { AiSystemStatus } from '../../shared/ai';
import type { DataHealthPayload } from '../../shared/data-health';
import type { MetricDefinition, ReportUniverseDefinition } from '../../shared/metrics';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { longDate, number } from '../lib/format';

const lessons = [
  { icon: Map, title: 'Mapa operativo', text: 'Indicadores, cartera Salice, agrupación de puntos y fichas.' },
  { icon: ClipboardCheck, title: 'Bandeja comercial', text: 'Señales, oportunidades, compromisos y notas sin planificación paralela.' },
  { icon: Users, title: 'Clientes', text: 'GESI, pertenencia, riesgo, oportunidad y filtros.' },
  { icon: Users, title: 'Vendedores', text: 'Desempeño, cartera, cobranza, territorio y clientes prioritarios.' },
  { icon: WalletCards, title: 'Cobranzas', text: 'Antigüedad, saldo pendiente y pago contra vencimiento.' },
  { icon: BarChart3, title: 'Reportes', text: 'Gestión general, volumen SPT, ventas comerciales, proveedores y cuentas no compradoras.' },
  { icon: BarChart3, title: 'Productos', text: 'Disponibilidad, comparación y ranking de 33 vectores.' },
  { icon: Route, title: 'Rutas', text: 'Facturas, fojas abiertas/cerradas, paradas y recorridos estimados.' },
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
  lastSync: { completedAt: string; snapshotAt: string; status: string } | null;
  ai: AiSystemStatus;
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
const aiRunStatusLabels = { running: 'En curso', completed: 'Completo', partial: 'Parcial', failed: 'Fallido', skipped: 'Sin funciones habilitadas' };
const aiFunctionLabels = {
  product_vectorization: 'Vectores de producto',
  report_narrative: 'Narrativas de reportes',
  executive_summary: 'Resumen ejecutivo',
  commercial_inbox_explanation: 'Bandeja comercial',
  seller_summary: 'Carteras de vendedores',
  report_coherence: 'Coherencia global',
};

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
  const inventory = coverage?.inventory;
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
          <div><span className="section-kicker">Tutorial vigente hasta v0.8.7</span><h2>Aprendé a usar las funciones operativas</h2><p>Incluye gestión comercial, rutas y fojas, Centro de reportes, filtros guardados, exportaciones y los reportes renovados de Mars, NutriPet y Baires. La infraestructura de IA se documentará en el tutorial únicamente al cerrar v0.9 y con autorización.</p></div>
        </div>
        <div className="settings-tutorial-action">
          {tutorialCompleted && <span><CheckCircle2 size={15} /> Completado en este equipo</span>}
          <button className="button primary large" onClick={onStartTutorial}><PlayCircle size={17} /> {tutorialCompleted ? 'Repetir tutorial' : 'Iniciar tutorial'}</button>
        </div>
      </section>

      <SavedViewsBar viewKey="settings" filters={{ metricQuery }} onApply={(saved) => setMetricQuery(saved.metricQuery ?? '')} />

      <section className={`data-card data-health-card ${dataHealth?.overall ?? 'unavailable'}`}>
        <div className="data-card-header"><div><span className="section-kicker"><Database size={14} /> Estado de los datos</span><h2>Frescura, fuentes y última validación</h2><p>La pantalla siempre conserva la última foto aprobada; una captura fallida no reemplaza estos datos.</p></div><span className={`data-health-badge ${dataHealth?.freshness.level ?? 'unknown'}`}>{dataHealth ? freshnessLabels[dataHealth.freshness.level] : 'Consultando…'}</span></div>
        {dataHealth ? <>
          <div className="data-source-grid">{dataHealth.sources.map((source) => <article key={source.id}><div><span className={`source-health-dot ${source.level}`} /><strong>{source.label}</strong><em>{sourceLabels[source.level]}</em></div><p>{source.detail}</p><small>{source.coverageFrom ? `Cobertura ${source.coverageFrom} → ${source.coverageThrough}` : `Corte ${source.coverageThrough}`}</small></article>)}</div>
          <div className="data-health-footer"><span><strong>{dataHealth.freshness.label}</strong> · advertencia desde {dataHealth.freshness.warningAfterHours} h; desactualizado desde {dataHealth.freshness.staleAfterHours} h.</span>{dataHealth.quality && <span><ShieldCheck size={14} /> Auditoría {dataHealth.quality.passed}/{dataHealth.quality.total} · {dataHealth.quality.warnings} salvedades</span>}{dataHealth.refresh.lastAttempt?.status === 'failed' && <span className="refresh-failure"><AlertTriangle size={14} /> Último intento fallido en {dataHealth.refresh.lastAttempt.stage}: {dataHealth.refresh.lastAttempt.error}</span>}{dataHealth.refresh.current && <span>Actualización manual en curso · {dataHealth.refresh.current.stage}</span>}</div>
          <details className="refresh-history"><summary><span>Historial de actualizaciones manuales</span><em>{dataHealth.refresh.recent.length ? `${dataHealth.refresh.recent.length} ejecuciones` : 'Sin ejecuciones registradas en v0.3'}</em></summary>{dataHealth.refresh.recent.length > 0 && <div>{dataHealth.refresh.recent.map((run) => <article key={run.id}><span className={`refresh-run-status ${run.status}`}>{refreshStatusLabels[run.status]}</span><p><strong>{refreshDate(run.startedAt)}</strong><small>{run.trigger === 'manual-resume' ? 'Reanudación manual' : 'Actualización manual'} · etapa {run.stage}</small></p><p><strong>{run.durationMs == null ? 'Duración pendiente' : `${Math.max(1, Math.round(run.durationMs / 1000))} s`}</strong><small>{run.qualityStatus ?? 'Calidad pendiente'} · {run.warnings} salvedades</small></p>{run.error && <p className="refresh-run-error">{run.error}</p>}</article>)}</div>}</details>
        </> : <p className="settings-card-copy">No se pudo leer el estado consolidado. El snapshot activo continúa disponible.</p>}
      </section>

      <div className="settings-grid">
        <section className="data-card settings-card settings-wide-card">
          <div className="data-card-header">
            <div>
              <span className="section-kicker"><BrainCircuit size={14} /> IA auditable · v0.9.5</span>
              <h2>Calidad, utilidad y costo medidos</h2>
              <p>Las pantallas leen resultados guardados. Una narrativa problemática se oculta sin afectar los reportes determinísticos.</p>
            </div>
            <span className={`data-health-badge ${system?.ai.configured ? 'fresh' : 'warning'}`}>
              {system ? (system.ai.configured ? 'Clave configurada' : 'Sin clave') : 'Consultando…'}
            </span>
          </div>
          <div className="coverage-list">
            <p><span>Snapshot activo</span><strong>{system?.ai.activeSnapshotAt ? longDate(system.ai.activeSnapshotAt) : 'Cargando…'}</strong></p>
            <p><span>Ejecución actual</span><strong>{system?.ai.current ? `${aiRunStatusLabels[system.ai.current.status]} · ${longDate(system.ai.current.startedAt)}` : 'Sin procesos en curso'}</strong></p>
            <p><span>Última ejecución</span><strong>{system?.ai.lastRun ? `${aiRunStatusLabels[system.ai.lastRun.status]} · ${longDate(system.ai.lastRun.startedAt)}` : 'Sin ejecuciones'}</strong></p>
            <p><span>Correspondiente al snapshot activo</span><strong>{system?.ai.activeSnapshotRun ? aiRunStatusLabels[system.ai.activeSnapshotRun.status] : 'No disponible'}</strong></p>
            <p><span>Entidades procesadas / reutilizadas</span><strong>{system?.ai.lastRun ? `${number(system.ai.lastRun.completed)} / ${number(system.ai.lastRun.reused)}` : '0 / 0'}</strong></p>
            <p><span>Consumo del mes</span><strong>{system ? `${number(system.ai.usage.currentMonth.inputTokens)} entrada · ${number(system.ai.usage.currentMonth.outputTokens)} salida` : 'Cargando…'}</strong></p>
            <p><span>Gasto del mes / histórico</span><strong>{system ? `USD ${system.ai.usage.currentMonth.estimatedCostUsd.toFixed(4)} / USD ${system.ai.usage.allTime.estimatedCostUsd.toFixed(4)}` : 'Cargando…'}</strong></p>
            <p><span>Límites por actualización</span><strong>{system ? `${number(system.ai.limits.maxEntitiesPerRun)} entidades · ${number(system.ai.limits.maxEstimatedInputTokensPerRun)} tokens · USD ${system.ai.limits.maxEstimatedCostUsdPerRun.toFixed(2)}` : 'Cargando…'}</strong></p>
            <p><span>Modelo y tarifa registrada</span><strong>gpt-5.6-terra · {system?.ai.pricing.version ?? 'cargando'}</strong></p>
          </div>
          {system && <div className={`ai-budget-banner ${system.ai.budget.alert}`}>
            <div><strong>Presupuesto mensual</strong><span>USD {system.ai.budget.spentUsd.toFixed(4)} consumidos de USD {system.ai.budget.monthlyLimitUsd.toFixed(2)}</span></div>
            <div className="ai-budget-track"><span style={{ width: `${Math.min(100, system.ai.budget.usedPercent)}%` }} /></div>
            <small>{system.ai.budget.alert === 'exceeded'
              ? 'Presupuesto mensual superado.'
              : system.ai.budget.alert === 'warning'
                ? `Alerta: se utilizó ${system.ai.budget.usedPercent.toFixed(1)}% del presupuesto.`
                : `Quedan USD ${system.ai.budget.remainingUsd.toFixed(4)} · alerta al ${system.ai.budget.warningPercent}%.`}</small>
          </div>}
          {system && <div className="ai-governance-summary">
            <article><span><ShieldCheck size={15} /> Control de calidad</span><strong>{number(system.ai.quality.passed)} aprobadas</strong><small>{number(system.ai.quality.blocked)} bloqueadas · {number(system.ai.quality.warnings)} con aviso</small></article>
            <article><span><MessageSquareText size={15} /> Feedback humano</span><strong>{number(system.ai.feedback.total)} evaluaciones</strong><small>{number(system.ai.feedback.useful)} útiles · {number(system.ai.feedback.corrections)} correcciones</small></article>
            <article><span><RefreshCcw size={15} /> Reintentos</span><strong>{number(system.ai.usage.currentMonth.retries)}</strong><small>{number(system.ai.usage.currentMonth.attempts)} solicitudes durante el mes</small></article>
          </div>}
          {system && <div className="ai-function-usage">
            <header><strong>Consumo y resultados por función · mes actual</strong><span>Costo medido sobre intentos reales</span></header>
            {system.ai.usage.functions.length
              ? system.ai.usage.functions.map((item) => <article key={item.functionKey}>
                <div><strong>{aiFunctionLabels[item.functionKey]}</strong><small>{number(item.inputTokens)} entrada · {number(item.outputTokens)} salida</small></div>
                <div><span>{item.completed} nuevos</span><span>{item.reused} reutilizados</span><span>{item.skipped} omitidos</span><span>{item.failed} fallidos</span></div>
                <strong>USD {item.estimatedCostUsd.toFixed(4)}</strong>
              </article>)
              : <p>Este mes todavía no registró solicitudes pagas ni resultados de IA.</p>}
          </div>}
          {system && <details className="ai-run-history">
            <summary>Ver consumo por actualización <span>{system.ai.usage.recentRuns.length} ejecuciones</span></summary>
            <div>{system.ai.usage.recentRuns.slice(0, 8).map((run) => <article key={run.id}>
              <div><strong>{longDate(run.startedAt)}</strong><small>{aiRunStatusLabels[run.status]} · {run.trigger === 'refresh' ? 'actualización' : 'ejecución manual'}</small></div>
              <div><span>{run.completed} nuevos</span><span>{run.reused} reutilizados</span><span>{run.skipped} omitidos</span><span>{run.failed} fallidos</span></div>
              <strong>USD {run.estimatedCostUsd.toFixed(4)}</strong>
            </article>)}</div>
          </details>}
          {system?.ai.lastRun?.error && <div className="settings-rule"><AlertTriangle size={16} /><span>{system.ai.lastRun.error}</span></div>}
        </section>

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
          <div className="coverage-list"><p><span>Geocodificación de activos</span><strong>{geocodeRate}% · {number(activeGeocoded)} / {number(active)}</strong></p><p><span>Productos con precio</span><strong>{number(coverage?.pricedProducts ?? 0)} / {number(data.products.length)}</strong></p><p><span>Pagos conciliados</span><strong>{number(coverage?.paymentSamples ?? 0)}</strong></p><p><span>Facturas con plazo válido</span><strong>{number(coverage?.creditTermInvoices ?? 0)} / {number(coverage?.invoices365d ?? 0)}</strong></p><p><span>Fojas logísticas abiertas / cerradas</span><strong>{number(coverage?.logistics?.openSheets ?? 0)} / {number(coverage?.logistics?.closedSheets ?? 0)}</strong></p><p><span>Facturas sin foja / con foja cerrada</span><strong>{number(coverage?.logistics?.unassignedInvoices ?? 0)} / {number(coverage?.logistics?.closedSheetInvoices ?? 0)}</strong></p><p><span>Clientes con condición realmente mixta</span><strong>{number(coverage?.clientsWithMixedCreditTerms ?? 0)}</strong></p><p><span>Detalles de factura omitidos por GESI</span><strong>{number(coverage?.omittedInvoiceDetails ?? 0)}</strong></p></div>
        </section>

        <section className="data-card settings-card">
          <div className="data-card-header"><div><span className="section-kicker"><Database size={14} /> Universo de productos</span><h2>Maestro, catálogo y existencias no son lo mismo</h2></div><span className={`data-health-badge ${inventory?.completeZeroStockUniverse ? 'fresh' : 'warning'}`}>{inventory?.completeZeroStockUniverse ? 'Ceros verificados' : 'Captura anterior'}</span></div>
          <p className="settings-card-copy">El maestro completo se conserva para auditoría. El catálogo operativo incluye maestros activos, productos vendidos recientemente o artículos con existencia no nula. GESI no entrega una marca inequívoca de discontinuación.</p>
          <div className="coverage-list"><p><span>Maestros únicos</span><strong>{number(inventory?.uniqueMasterProducts ?? coverage?.rawProducts ?? 0)}</strong></p><p><span>Activos / inactivos</span><strong>{number(inventory?.activeMasterProducts ?? 0)} / {number(inventory?.inactiveMasterProducts ?? 0)}</strong></p><p><span>Catálogo operativo</span><strong>{number(inventory?.catalogProducts ?? data.products.length)}</strong></p><p><span>Comercializables observables</span><strong>{number(inventory?.commercializableProducts ?? 0)}</strong></p><p><span>Stock U1 positivo / cero / negativo</span><strong>{number(inventory?.positiveStockProducts ?? 0)} / {number(inventory?.zeroStockProducts ?? 0)} / {number(inventory?.negativeStockProducts ?? 0)}</strong></p><p><span>Sin fila de existencia</span><strong>{number(inventory?.missingStockProducts ?? 0)}</strong></p><p><span>Duplicadas / sin productoID</span><strong>{number(inventory?.duplicateStockRows ?? 0)} / {inventory?.invalidStockRows == null ? 'no registrado en este paquete' : number(inventory.invalidStockRows)}</strong></p><p><span>Discontinuados explícitos</span><strong>{number(inventory?.explicitDiscontinuedProducts ?? 0)} · señal no disponible</strong></p></div>
          <div className="settings-rule"><Database size={16} /><span>Corte {inventory?.capturedAt ? longDate(inventory.capturedAt) : longDate(data.meta.generatedAt)} · empresa {inventory?.companyId ?? 3} / sucursal {inventory?.branchId ?? 3} / depósito {inventory?.warehouseId ?? 2} {inventory?.warehouseLabel ? `(${inventory.warehouseLabel})` : ''}.</span></div>
        </section>

        <section className="data-card settings-card" data-tour="storage-rules">
          <div className="data-card-header"><div><span className="section-kicker"><HardDrive size={14} /> Persistencia local</span><h2>Datos humanos separados de GESI</h2></div><span className="algorithm-pill">SQLite</span></div>
          <p className="settings-card-copy">Notas, recordatorios históricos, seguimientos, vistas y objetivos se guardan fuera del snapshot importado. Así sobreviven a futuras actualizaciones de GESI.</p>
          <div className="coverage-list"><p><span>Notas persistidas</span><strong>{system ? number(system.notes) : 'Cargando…'}</strong></p><p><span>Gestiones registradas</span><strong>{system ? number(system.activities) : 'Cargando…'}</strong></p><p><span>Promesas pendientes</span><strong>{system ? number(system.pendingPromises) : 'Cargando…'}</strong></p><p><span>Tareas manuales pendientes</span><strong>{system ? number(system.pendingAgendaItems) : 'Cargando…'}</strong></p><p><span>Cuentas con seguimiento administrativo</span><strong>{system ? number(system.receivableCases) : 'Cargando…'}</strong></p><p><span>Vistas de filtros guardadas</span><strong>{system ? number(system.savedViews) : 'Cargando…'}</strong></p><p><span>Versiones de objetivos</span><strong>{system ? number(system.goalVersions) : 'Cargando…'}</strong></p><p><span>Generaciones de datos recuperables</span><strong>{system ? number(system.backups) : 'Cargando…'}</strong></p><p><span>Backups de información humana</span><strong>{system ? number(system.operationalBackups) : 'Cargando…'}</strong></p><p><span>Última sincronización registrada</span><strong>{system?.lastSync ? longDate(system.lastSync.snapshotAt) : 'Foto actual migrada'}</strong></p></div>
        </section>

        <section className="data-card settings-card settings-wide-card">
          <div className="data-card-header"><div><span className="section-kicker"><BarChart3 size={14} /> Reglas explicables</span><h2>Tres puntajes y clasificación de producto</h2></div><span className="algorithm-pill">Base determinística · IA auditada</span></div>
          <div className="score-definition-grid"><article><strong>C · Riesgo de cobranza</strong><p>Vencimientos, antigüedad, monto, demora histórica y marcas administrativas de GESI. Se calcula sin IA.</p></article><article><strong>O · Oportunidad comercial</strong><p>Recencia de compra, caída de ventas, inactividad reciente y amplitud del mix. Se calcula sin IA.</p></article><article><strong>P · Prioridad de visita</strong><p>58% riesgo de cobranza + 42% oportunidad. No se presenta como una predicción y se calcula sin IA.</p></article><article><strong>Bandeja y notas</strong><p>Las señales orientan una revisión. Las notas documentan hechos externos y nunca completan ni modifican una sugerencia.</p></article><article><strong>Promesas exigibles</strong><p>Suma de compromisos locales pendientes con fecha igual o anterior al día elegido; no equivale a cobranza cobrada.</p></article><article><strong>Saldo accionable</strong><p>Un residual menor a $1.000 permanece visible, pero no genera por sí solo una tarea o alerta de cobranza.</p></article><article><strong>Vector v2.2</strong><p>33 dimensiones explicables. Los productos de la línea base conservan su cálculo determinístico; sólo una alta posterior puede recibir un vector IA validado. Las correcciones humanas requieren motivo e historial y siempre prevalecen.</p></article></div>
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
