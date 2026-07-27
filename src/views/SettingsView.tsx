import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, BookOpen, BrainCircuit, CheckCircle2, ClipboardCheck, Clock3, Database, HardDrive, Info, Map, MessageSquareText, MonitorCog, PlayCircle, RefreshCcw, Search, ShieldCheck, SlidersHorizontal, WalletCards } from 'lucide-react';
import { APP_VERSION, type DashboardData } from '../../shared/models';
import type { AiSystemStatus } from '../../shared/ai';
import type { DataHealthPayload } from '../../shared/data-health';
import type { MetricDefinition, ReportUniverseDefinition } from '../../shared/metrics';
import { TUTORIALS, type TutorialSection } from '../components/TutorialOverlay';
import { longDate, number } from '../lib/format';
import { readPreferences, savePreferences, type AppPreferences } from '../lib/preferences';

const tutorialCards: { id: TutorialSection; icon: typeof Map }[] = [
  { id: 'operations', icon: Map },
  { id: 'administration', icon: ClipboardCheck },
  { id: 'reports', icon: BarChart3 },
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
  product_vectorization: 'Clasificación de productos',
  report_narrative: 'Narrativas de reportes',
  executive_summary: 'Resumen ejecutivo',
  commercial_inbox_explanation: 'Bandeja comercial',
  seller_summary: 'Carteras de vendedores',
  report_coherence: 'Coherencia global',
};

type SettingsTab = 'preferences' | 'ai' | 'data' | 'help' | 'diagnostics' | 'about';
const settingsTabs: Array<{ id: SettingsTab; label: string; icon: typeof Map }> = [
  { id: 'preferences', label: 'Preferencias', icon: SlidersHorizontal },
  { id: 'ai', label: 'Inteligencia artificial', icon: BrainCircuit },
  { id: 'data', label: 'Datos y actualizaciones', icon: Database },
  { id: 'help', label: 'Ayuda', icon: BookOpen },
  { id: 'diagnostics', label: 'Diagnóstico avanzado', icon: MonitorCog },
  { id: 'about', label: 'Acerca del programa', icon: Info },
];

function refreshDate(value: string) {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value));
}

function refreshTriggerLabel(value: string) {
  if (value === 'scheduled') return 'Automática';
  if (value === 'bootstrap') return 'Inicial';
  if (value === 'manual-resume') return 'Reanudación';
  return 'Manual';
}

export function SettingsView({ data, dataHealth, tutorialCompleted, onStartTutorial }: { data: DashboardData; dataHealth: DataHealthPayload | null; tutorialCompleted: Record<TutorialSection, boolean>; onStartTutorial: (section: TutorialSection) => void }) {
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [catalog, setCatalog] = useState<MetricCatalogPayload | null>(null);
  const [metricQuery, setMetricQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SettingsTab>('preferences');
  const [preferences, setPreferences] = useState<AppPreferences>(() => readPreferences());
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
  const updatePreferences = (next: AppPreferences) => {
    setPreferences(next);
    savePreferences(next);
  };
  return (
    <div className="page-view settings-view">
      <nav className="settings-tabs" aria-label="Secciones de configuración">
        {settingsTabs.map(({ id, label, icon: Icon }) => <button key={id} className={activeTab === id ? 'active' : ''} aria-current={activeTab === id ? 'page' : undefined} onClick={() => setActiveTab(id)}><Icon size={16} /><span>{label}</span></button>)}
      </nav>

      {activeTab === 'preferences' && <div className="settings-grid">
        <section className="data-card settings-card">
          <div className="data-card-header"><div><span className="section-kicker"><SlidersHorizontal size={14} /> Apariencia</span><h2>Densidad de la interfaz</h2><p>Elegí cuánto espacio ocupan tarjetas y tablas.</p></div></div>
          <div className="settings-choice-grid">
            <button className={preferences.density === 'comfortable' ? 'active' : ''} onClick={() => updatePreferences({ ...preferences, density: 'comfortable' })}><strong>Cómoda</strong><span>Más aire y lectura pausada.</span></button>
            <button className={preferences.density === 'compact' ? 'active' : ''} onClick={() => updatePreferences({ ...preferences, density: 'compact' })}><strong>Compacta</strong><span>Más información visible a la vez.</span></button>
          </div>
        </section>
        <section className="data-card settings-card">
          <div className="data-card-header"><div><span className="section-kicker"><Info size={14} /> Orientación</span><h2>Ayuda contextual</h2><p>Muestra el botón de ayuda de cada pantalla en la barra superior.</p></div><button className={`settings-switch ${preferences.contextualHelp ? 'on' : ''}`} role="switch" aria-checked={preferences.contextualHelp} onClick={() => updatePreferences({ ...preferences, contextualHelp: !preferences.contextualHelp })}><span />{preferences.contextualHelp ? 'Activada' : 'Desactivada'}</button></div>
          <p className="settings-card-copy">Las guías completas permanecen disponibles en la sección Ayuda, aun si ocultás el acceso contextual.</p>
        </section>
      </div>}

      {activeTab === 'help' && <section className="data-card settings-tutorial-card" data-tour="settings-tutorial">
        <div className="settings-tutorial-copy">
          <div className="settings-icon"><BookOpen size={28} /></div>
          <div><span className="section-kicker">Guías interactivas</span><h2>Elegí qué sección querés aprender</h2><p>Cada recorrido explica una parte concreta del programa, cambia de pantalla automáticamente y no modifica ningún dato.</p></div>
        </div>
        <div className="tutorial-selector-grid">
          {tutorialCards.map(({ id, icon: Icon }) => {
            const definition = TUTORIALS[id];
            const completed = tutorialCompleted[id];
            return <article key={id}>
              <div className="tutorial-selector-icon"><Icon size={21} /></div>
              <div><span>{definition.label}</span><strong>{definition.title}</strong><p>{definition.description}</p><small>{definition.steps.length} pasos · recorrido independiente</small></div>
              {completed && <em><CheckCircle2 size={14} /> Completado</em>}
              <button className={`button ${completed ? 'secondary' : 'primary'}`} onClick={() => onStartTutorial(id)}><PlayCircle size={16} /> {completed ? 'Repetir' : 'Comenzar'}</button>
            </article>;
          })}
        </div>
      </section>}

      {activeTab === 'data' && <section className={`data-card data-health-card ${dataHealth?.overall ?? 'unavailable'}`}>
        <div className="data-card-header"><div><span className="section-kicker"><Database size={14} /> Estado de los datos</span><h2>Frescura, fuentes y última validación</h2><p>La pantalla siempre conserva la última foto aprobada; una captura fallida no reemplaza estos datos.</p></div><span className={`data-health-badge ${dataHealth?.freshness.level ?? 'unknown'}`}>{dataHealth ? freshnessLabels[dataHealth.freshness.level] : 'Consultando…'}</span></div>
        {dataHealth ? <>
          <div className="data-source-grid">{dataHealth.sources.map((source) => <article key={source.id}><div><span className={`source-health-dot ${source.level}`} /><strong>{source.label}</strong><em>{sourceLabels[source.level]}</em></div><p>{source.detail}</p><small>{source.coverageFrom ? `Cobertura ${source.coverageFrom} → ${source.coverageThrough}` : `Corte ${source.coverageThrough}`}</small></article>)}</div>
          <div className="data-health-footer"><span><strong>{dataHealth.freshness.label}</strong> · advertencia desde {dataHealth.freshness.warningAfterHours} h; desactualizado desde {dataHealth.freshness.staleAfterHours} h.</span>{dataHealth.quality && <span><ShieldCheck size={14} /> Auditoría {dataHealth.quality.passed}/{dataHealth.quality.total} · {dataHealth.quality.warnings} salvedades</span>}{dataHealth.refresh.lastAttempt?.status === 'failed' && <span className="refresh-failure"><AlertTriangle size={14} /> El último intento no se completó; se conservan los datos disponibles.</span>}{dataHealth.refresh.current && <span>Actualización en curso · {dataHealth.refresh.current.stage}</span>}</div>
          <details className="refresh-history"><summary><span>Historial de actualizaciones</span><em>{dataHealth.refresh.recent.length ? `${dataHealth.refresh.recent.length} ejecuciones` : 'Sin ejecuciones registradas'}</em></summary>{dataHealth.refresh.recent.length > 0 && <div>{dataHealth.refresh.recent.map((run) => <article key={run.id}><span className={`refresh-run-status ${run.status}`}>{refreshStatusLabels[run.status]}</span><p><strong>{refreshDate(run.startedAt)}</strong><small>{refreshTriggerLabel(run.trigger)} · etapa {run.stage}</small></p><p><strong>{run.durationMs == null ? 'Duración pendiente' : `${Math.max(1, Math.round(run.durationMs / 1000))} s`}</strong><small>{run.qualityStatus ?? 'Calidad pendiente'} · {run.warnings} salvedades</small></p>{run.error && <p className="refresh-run-error">La ejecución no pudo completarse.</p>}</article>)}</div>}</details>
        </> : <p className="settings-card-copy">No se pudo leer el estado consolidado. Los datos actuales continúan disponibles.</p>}
      </section>}

      <div className="settings-grid">
        {activeTab === 'data' && <section className="data-card settings-card settings-wide-card settings-refresh-plan">
          <div className="data-card-header"><div><span className="section-kicker"><Clock3 size={14} /> Actualizaciones automáticas</span><h2>Último dato y próxima actualización</h2><p>El servidor ejecuta el proceso completo dos veces por día con hora de Argentina.</p></div><span className={`data-health-badge ${dataHealth?.schedule.enabled ? 'fresh' : 'warning'}`}>{dataHealth?.schedule.enabled ? 'Activadas' : 'Desactivadas'}</span></div>
          <div className="coverage-list"><p><span>Última actualización publicada</span><strong>{longDate(data.meta.generatedAt)}</strong></p><p><span>Horarios diarios</span><strong>{dataHealth?.schedule.times.length ? dataHealth.schedule.times.join(' y ') : 'Sin horarios activos'}</strong></p><p><span>Zona horaria</span><strong>{dataHealth?.schedule.timeZone ?? 'America/Argentina/Buenos_Aires'}</strong></p><p><span>Próxima ejecución</span><strong>{dataHealth?.schedule.nextRunAt ? refreshDate(dataHealth.schedule.nextRunAt) : 'Todavía no programada'}</strong></p></div>
        </section>}

        {activeTab === 'ai' && <section className="data-card settings-card settings-wide-card">
          <div className="data-card-header">
            <div>
              <span className="section-kicker"><BrainCircuit size={14} /> Asistencia con IA · Beta</span>
              <h2>Análisis disponibles, calidad y costo</h2>
              <p>La IA agrega una lectura explicativa. Los reportes y cálculos normales siguen funcionando aunque la asistencia no esté disponible.</p>
            </div>
            <span className={`data-health-badge ${system?.ai.configured ? 'fresh' : 'warning'}`}>
              {system ? (system.ai.configured ? 'Disponible' : 'No configurada') : 'Consultando…'}
            </span>
          </div>
          <div className="coverage-list ai-user-summary">
            <p><span>Contenido disponible</span><strong>{system ? `${number(system.ai.artifactCounts.valid)} análisis vigentes` : 'Cargando…'}</strong></p>
            <p><span>Datos analizados</span><strong>{system?.ai.activeSnapshotAt ? longDate(system.ai.activeSnapshotAt) : 'No disponibles'}</strong></p>
            <p><span>Actividad actual</span><strong>{system?.ai.current ? `${aiRunStatusLabels[system.ai.current.status]} · ${longDate(system.ai.current.startedAt)}` : 'Sin procesos en curso'}</strong></p>
            <p><span>Gasto del mes</span><strong>{system ? `USD ${system.ai.usage.currentMonth.estimatedCostUsd.toFixed(2)}` : 'Cargando…'}</strong></p>
          </div>
          {system && <div className={`ai-budget-banner ${system.ai.budget.alert}`}>
            <div><strong>Presupuesto mensual</strong><span>USD {system.ai.budget.spentUsd.toFixed(2)} consumidos de USD {system.ai.budget.monthlyLimitUsd.toFixed(2)}</span></div>
            <div className="ai-budget-track"><span style={{ width: `${Math.min(100, system.ai.budget.usedPercent)}%` }} /></div>
            <small>{system.ai.budget.alert === 'exceeded'
              ? 'Presupuesto mensual superado.'
              : system.ai.budget.alert === 'warning'
                ? `Alerta: se utilizó ${system.ai.budget.usedPercent.toFixed(1)}% del presupuesto.`
                : `Quedan USD ${system.ai.budget.remainingUsd.toFixed(2)} · alerta al ${system.ai.budget.warningPercent}%.`}</small>
          </div>}
          {system && <div className="ai-governance-summary">
            <article><span><ShieldCheck size={15} /> Control de calidad</span><strong>{number(system.ai.quality.passed)} aprobadas</strong><small>{number(system.ai.quality.blocked)} bloqueadas · {number(system.ai.quality.warnings)} con aviso</small></article>
            <article><span><MessageSquareText size={15} /> Feedback humano</span><strong>{number(system.ai.feedback.total)} evaluaciones</strong><small>{number(system.ai.feedback.useful)} útiles · {number(system.ai.feedback.notUseful)} poco útiles · {number(system.ai.feedback.incorrect)} incorrectas · {number(system.ai.feedback.incomplete)} incompletas · {number(system.ai.feedback.corrections)} correcciones</small></article>
            <article><span><RefreshCcw size={15} /> Reintentos</span><strong>{number(system.ai.usage.currentMonth.retries)}</strong><small>{number(system.ai.usage.currentMonth.attempts)} solicitudes durante el mes</small></article>
          </div>}
          {system && system.ai.quality.blocked > 0 && <div className="ai-blocked-notice"><ShieldCheck size={17} /><div><strong>{number(system.ai.quality.blocked)} análisis no se publicaron</strong><span>El control de calidad detectó problemas. Las cifras y los reportes normales continúan disponibles sin ese texto.</span></div></div>}
          {system && <details className="ai-technical-details"><summary><span>Ver consumo y funcionamiento técnico</span><em>Modelo, solicitudes y resultados</em></summary><div className="ai-technical-body"><div className="coverage-list">
            <p><span>Último intento</span><strong>{system.ai.lastRun ? `${aiRunStatusLabels[system.ai.lastRun.status]} · ${longDate(system.ai.lastRun.startedAt)}` : 'Sin ejecuciones'}</strong></p>
            <p><span>Resultados nuevos / reutilizados</span><strong>{system.ai.lastRun ? `${number(system.ai.lastRun.completed)} / ${number(system.ai.lastRun.reused)}` : '0 / 0'}</strong></p>
            <p><span>Consumo del mes</span><strong>{number(system.ai.usage.currentMonth.inputTokens)} entrada · {number(system.ai.usage.currentMonth.outputTokens)} salida</strong></p>
            <p><span>Límite por actualización</span><strong>USD {system.ai.limits.maxEstimatedCostUsdPerRun.toFixed(2)}</strong></p>
            <p><span>Modelo</span><strong>gpt-5.6-terra · {system.ai.pricing.version}</strong></p>
          </div><div className="ai-function-usage">
            <header><strong>Consumo y resultados por función · mes actual</strong><span>Costo medido sobre intentos reales</span></header>
            {system.ai.usage.functions.length
              ? system.ai.usage.functions.map((item) => <article key={item.functionKey}>
                <div><strong>{aiFunctionLabels[item.functionKey]}</strong><small>{number(item.inputTokens)} entrada · {number(item.outputTokens)} salida</small></div>
                <div><span>{item.completed} nuevos</span><span>{item.reused} reutilizados</span><span>{item.skipped} omitidos</span><span>{item.failed} fallidos</span></div>
                <strong>USD {item.estimatedCostUsd.toFixed(4)}</strong>
              </article>)
              : <p>Este mes todavía no registró solicitudes pagas ni resultados de IA.</p>}
          </div>
          <details className="ai-run-history">
            <summary>Ver consumo por actualización <span>{system.ai.usage.recentRuns.length} ejecuciones</span></summary>
            <div>{system.ai.usage.recentRuns.slice(0, 8).map((run) => <article key={run.id}>
              <div><strong>{longDate(run.startedAt)}</strong><small>{aiRunStatusLabels[run.status]} · {run.trigger === 'refresh' ? 'actualización' : 'ejecución manual'}</small></div>
              <div><span>{run.completed} nuevos</span><span>{run.reused} reutilizados</span><span>{run.skipped} omitidos</span><span>{run.failed} fallidos</span></div>
              <strong>USD {run.estimatedCostUsd.toFixed(4)}</strong>
            </article>)}</div>
          </details></div></details>}
          {system?.ai.lastRun?.error && <div className="settings-rule"><AlertTriangle size={16} /><span>El último intento tuvo un problema. Los {number(system.ai.artifactCounts.valid)} análisis disponibles se conservan y los reportes normales no se ven afectados.</span></div>}
        </section>}

        {activeTab === 'data' && <section className="data-card settings-card" data-tour="portfolio-rules">
          <div className="data-card-header"><div><span className="section-kicker"><ShieldCheck size={14} /> Universo de clientes</span><h2>Estado comercial y cartera Salice son señales distintas</h2></div><span className="count-badge">Regla conservadora</span></div>
          <div className="status-audit-summary"><div><strong>{number(confirmed)}</strong><span>activos con sucursal Salice confirmada</span></div><div className="review"><strong>{number(review)}</strong><span>activos cuya pertenencia debe revisarse</span></div></div>
          <p className="settings-card-copy">El estado comercial sigue definiendo la actividad. La pertenencia confirmada a la cartera Salice se muestra como una segunda señal: los casos dudosos no se excluyen hasta validarlos.</p>
          <div className="settings-rule"><Database size={16} /><span>{number(inactive)} inactivos permanecen disponibles como histórico. La cobranza conserva sus documentos abiertos.</span></div>
        </section>}

        {activeTab === 'data' && <section className="data-card settings-card" data-tour="finance-rules">
          <div className="data-card-header"><div><span className="section-kicker"><WalletCards size={14} /> Semántica financiera</span><h2>Métricas que no mezclan conceptos</h2></div></div>
          <div className="rule-list"><p><strong>Plazo por factura</strong><span>Diferencia exacta entre compra/emisión y primer vencimiento. Es la fuente operativa para cuenta corriente.</span></p><p><strong>Condición habitual o mixta</strong><span>Se agrupan corrimientos de hasta 3 días; una opción necesita al menos 60% para llamarse predominante.</span></p><p><strong>Pago contra vencimiento</strong><span>Días antes o después de la fecha contractual y porcentaje en término.</span></p><p><strong>Saldo pendiente</strong><span>La agenda y la cartera usan el monto aún abierto desde $1.000 por comprobante; el importe original queda como referencia.</span></p><p><strong>Vendedores incluidos</strong><span>Sólo se consideran facturas a nombre de Andres Dominguez, Edgardo Larrea, Ignacio Carea, Ana Ottaviano, Julieta Errecart y Gonzalo Russian. La regla se aplica al vendedor del comprobante.</span></p><p><strong>Entidades excluidas</strong><span>GBA M6 S.A., Consumidor Final y Salice Distribuciones S.A. no integran el universo porque no son clientes comerciales.</span></p><p><strong>Límite de crédito</strong><span>GESI informa cero para la cartera actual: por eso no se muestra un porcentaje ficticio.</span></p></div>
        </section>}

        {activeTab === 'data' && <section className="data-card settings-card" data-tour="data-quality">
          <div className="data-card-header"><div><span className="section-kicker"><ShieldCheck size={14} /> Calidad y cobertura</span><h2>Qué tan completa es la foto</h2></div><span className="count-badge">{longDate(data.meta.generatedAt)}</span></div>
          <div className="coverage-list"><p><span>Geocodificación de activos</span><strong>{geocodeRate}% · {number(activeGeocoded)} / {number(active)}</strong></p><p><span>Productos con precio</span><strong>{number(coverage?.pricedProducts ?? 0)} / {number(data.products.length)}</strong></p><p><span>Pagos conciliados</span><strong>{number(coverage?.paymentSamples ?? 0)}</strong></p><p><span>Facturas con plazo válido</span><strong>{number(coverage?.creditTermInvoices ?? 0)} / {number(coverage?.invoices365d ?? 0)}</strong></p><p><span>Fojas logísticas abiertas / cerradas</span><strong>{number(coverage?.logistics?.openSheets ?? 0)} / {number(coverage?.logistics?.closedSheets ?? 0)}</strong></p><p><span>Facturas sin foja / con foja cerrada</span><strong>{number(coverage?.logistics?.unassignedInvoices ?? 0)} / {number(coverage?.logistics?.closedSheetInvoices ?? 0)}</strong></p><p><span>Clientes con condición realmente mixta</span><strong>{number(coverage?.clientsWithMixedCreditTerms ?? 0)}</strong></p><p><span>Detalles de factura omitidos por GESI</span><strong>{number(coverage?.omittedInvoiceDetails ?? 0)}</strong></p></div>
        </section>}

        {activeTab === 'diagnostics' && <details className="settings-advanced-section" open>
          <summary><HardDrive size={20} /><div><strong>Información técnica y diagnóstico</strong><span>Catálogo de productos, almacenamiento, fórmulas y alcance de los reportes.</span></div></summary>
          <div className="settings-grid advanced-settings-grid">
        <section className="data-card settings-card">
          <div className="data-card-header"><div><span className="section-kicker"><Database size={14} /> Universo de productos</span><h2>Maestro, catálogo y existencias no son lo mismo</h2></div><span className={`data-health-badge ${inventory?.completeZeroStockUniverse ? 'fresh' : 'warning'}`}>{inventory?.completeZeroStockUniverse ? 'Ceros verificados' : 'Captura anterior'}</span></div>
          <p className="settings-card-copy">El maestro completo se conserva para auditoría. El catálogo operativo incluye maestros activos, productos vendidos recientemente o artículos con existencia no nula. GESI no entrega una marca inequívoca de discontinuación.</p>
          <div className="coverage-list"><p><span>Maestros únicos</span><strong>{number(inventory?.uniqueMasterProducts ?? coverage?.rawProducts ?? 0)}</strong></p><p><span>Activos / inactivos</span><strong>{number(inventory?.activeMasterProducts ?? 0)} / {number(inventory?.inactiveMasterProducts ?? 0)}</strong></p><p><span>Catálogo operativo</span><strong>{number(inventory?.catalogProducts ?? data.products.length)}</strong></p><p><span>Comercializables observables</span><strong>{number(inventory?.commercializableProducts ?? 0)}</strong></p><p><span>Stock U1 positivo / cero / negativo</span><strong>{number(inventory?.positiveStockProducts ?? 0)} / {number(inventory?.zeroStockProducts ?? 0)} / {number(inventory?.negativeStockProducts ?? 0)}</strong></p><p><span>Sin fila de existencia</span><strong>{number(inventory?.missingStockProducts ?? 0)}</strong></p><p><span>Duplicadas / sin productoID</span><strong>{number(inventory?.duplicateStockRows ?? 0)} / {inventory?.invalidStockRows == null ? 'no registrado en este paquete' : number(inventory.invalidStockRows)}</strong></p><p><span>Discontinuados explícitos</span><strong>{number(inventory?.explicitDiscontinuedProducts ?? 0)} · señal no disponible</strong></p></div>
          <div className="settings-rule"><Database size={16} /><span>Corte {inventory?.capturedAt ? longDate(inventory.capturedAt) : longDate(data.meta.generatedAt)} · empresa {inventory?.companyId ?? 3} / sucursal {inventory?.branchId ?? 3} / depósito {inventory?.warehouseId ?? 2} {inventory?.warehouseLabel ? `(${inventory.warehouseLabel})` : ''}.</span></div>
        </section>

        <section className="data-card settings-card" data-tour="storage-rules">
          <div className="data-card-header"><div><span className="section-kicker"><HardDrive size={14} /> Persistencia local</span><h2>Datos humanos separados de GESI</h2></div><span className="algorithm-pill">SQLite</span></div>
          <p className="settings-card-copy">Notas, recordatorios históricos, seguimientos, vistas y objetivos se conservan por separado. Así sobreviven a futuras actualizaciones de los datos comerciales.</p>
          <div className="coverage-list"><p><span>Notas persistidas</span><strong>{system ? number(system.notes) : 'Cargando…'}</strong></p><p><span>Gestiones registradas</span><strong>{system ? number(system.activities) : 'Cargando…'}</strong></p><p><span>Promesas pendientes</span><strong>{system ? number(system.pendingPromises) : 'Cargando…'}</strong></p><p><span>Tareas manuales pendientes</span><strong>{system ? number(system.pendingAgendaItems) : 'Cargando…'}</strong></p><p><span>Cuentas con seguimiento administrativo</span><strong>{system ? number(system.receivableCases) : 'Cargando…'}</strong></p><p><span>Vistas de filtros guardadas</span><strong>{system ? number(system.savedViews) : 'Cargando…'}</strong></p><p><span>Versiones de objetivos</span><strong>{system ? number(system.goalVersions) : 'Cargando…'}</strong></p><p><span>Generaciones de datos recuperables</span><strong>{system ? number(system.backups) : 'Cargando…'}</strong></p><p><span>Backups de información humana</span><strong>{system ? number(system.operationalBackups) : 'Cargando…'}</strong></p><p><span>Última sincronización registrada</span><strong>{system?.lastSync ? longDate(system.lastSync.snapshotAt) : 'Datos actuales disponibles'}</strong></p></div>
        </section>

        <section className="data-card settings-card settings-wide-card">
          <div className="data-card-header"><div><span className="section-kicker"><BarChart3 size={14} /> Reglas explicables</span><h2>Tres señales y clasificación de producto</h2></div><span className="algorithm-pill">Reglas verificables · IA auditada</span></div>
          <div className="score-definition-grid"><article><strong>Riesgo de cobranza</strong><p>Vencimientos, antigüedad, monto, demora histórica y marcas administrativas. Se expresa de 0 a 100 y se calcula sin IA.</p></article><article><strong>Oportunidad comercial</strong><p>Recencia de compra, caída de ventas, inactividad reciente y amplitud del mix. Se expresa de 0 a 100 y se calcula sin IA.</p></article><article><strong>Prioridad de revisión</strong><p>Combina 58% del riesgo de cobranza y 42% de la oportunidad. Ordena la revisión, pero no planifica una visita.</p></article><article><strong>Bandeja y notas</strong><p>Las señales orientan una revisión. Las notas documentan hechos externos y nunca completan ni modifican una sugerencia.</p></article><article><strong>Promesas exigibles</strong><p>Suma de compromisos locales pendientes con fecha igual o anterior al día elegido; no equivale a cobranza cobrada.</p></article><article><strong>Saldo accionable</strong><p>Un residual menor a $1.000 permanece visible, pero no genera por sí solo una tarea o alerta de cobranza.</p></article><article><strong>Clasificación de productos</strong><p>Las características del catálogo son explicables. Las correcciones humanas requieren motivo, conservan historial y siempre prevalecen.</p></article></div>
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
        </details>}

        {activeTab === 'about' && <>
          <section className="data-card settings-card settings-wide-card settings-about-card">
            <img src="/salice-isotipo.png" alt="" />
            <div><span className="section-kicker">Salice Inteligente</span><h2>Versión {APP_VERSION}</h2><p>Centro operativo y de reportes para acompañar decisiones comerciales, administrativas y logísticas de Salice.</p></div>
          </section>
          <section className="data-card settings-card">
            <div className="data-card-header"><div><span className="section-kicker"><ShieldCheck size={14} /> Principios</span><h2>Cómo trabaja el programa</h2></div></div>
            <div className="rule-list"><p><strong>Datos antes que interpretación</strong><span>Los cálculos verificables siguen disponibles aunque una ayuda complementaria falle.</span></p><p><strong>Sin cambios silenciosos</strong><span>Notas, objetivos, correcciones y feedback conservan historial.</span></p><p><strong>Salvedades visibles</strong><span>Una fuente incompleta se identifica y no se completa artificialmente.</span></p></div>
          </section>
          <section className="data-card settings-card">
            <div className="data-card-header"><div><span className="section-kicker"><HardDrive size={14} /> Recuperación manual</span><h2>Copias disponibles</h2><p>La restauración se realiza de forma administrada para evitar reemplazos accidentales.</p></div></div>
            <div className="coverage-list"><p><span>Generaciones de datos</span><strong>{system ? number(system.backups) : 'Cargando…'}</strong></p><p><span>Copias de información humana</span><strong>{system ? number(system.operationalBackups) : 'Cargando…'}</strong></p></div>
            <div className="settings-rule"><Info size={16} /><span>Ante una restauración, registrá primero una copia nueva y verificá fecha y alcance con el responsable técnico.</span></div>
          </section>
        </>}
      </div>
    </div>
  );
}
