import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarRange, CheckCircle2, ChevronRight, Database, Gauge, Info, PackageCheck, Target, TrendingUp, Users } from 'lucide-react';
import type { Client, DashboardData, GeneralPerformanceRow, GeneralReportMeta, GeneralReportMode, GeneralReportPayload } from '../../shared/models';
import { matchesMultiFilter } from '../../shared/multi-filter';
import { AiNarrativeCard } from '../components/AiInsights';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { ReportContext, ReportExportActions, ReportFilterActions, ReportState } from '../components/ReportExperience';
import { SingleSelectFilter } from '../components/SingleSelectFilter';
import { SortButton } from '../components/SortButton';
import { clientPrimaryName, clientSecondaryName } from '../lib/client-name';
import { money, number } from '../lib/format';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';
import { reportFiltersFromLocation } from '../lib/report-links';

interface ReportsViewProps {
  data: DashboardData;
  onOpen: (client: Client) => void;
  onOpenSeller: (seller: string) => void;
  onOpenBrand: (brand: string) => void;
  onOpenGoals: () => void;
}

type PerformanceSortKey = 'name' | 'actual' | 'target' | 'completion' | 'gap';

const modes: { id: GeneralReportMode; label: string; note: string }[] = [
  { id: 'core', label: 'Objetivos kilos', note: 'Marcas y rubros principales' },
  { id: 'strategic', label: 'Marcas estratégicas', note: 'Fawna, Juvenia, MaxPet y Pampa' },
  { id: 'autoservice', label: 'Autoservicio', note: 'Facturación de Ana y Julieta' },
];

const monthLabel = (value: string, long = false) => new Intl.DateTimeFormat('es-AR', {
  month: long ? 'long' : 'short', year: '2-digit', timeZone: 'UTC',
}).format(new Date(`${value}-01T12:00:00Z`)).replace('.', '');

const percent = (value: number | null, digits = 0) => value == null
  ? 'Sin objetivo'
  : `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(value)}%`;

function metric(value: number, unit: GeneralReportPayload['unit'], compact = false) {
  if (unit === 'currency') return money(value, compact);
  if (compact && Math.abs(value) >= 1_000_000) return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value / 1_000_000)} M kg`;
  if (compact && Math.abs(value) >= 1_000) return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value / 1_000)} k kg`;
  return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value)} kg`;
}

function change(value: number, base: number) {
  if (!base) return null;
  return (value / base - 1) * 100;
}

function TrendChart({ report }: { report: GeneralReportPayload }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const width = 980;
  const height = 330;
  const inset = { left: 54, right: 24, top: 24, bottom: 46 };
  const plotWidth = width - inset.left - inset.right;
  const plotHeight = height - inset.top - inset.bottom;
  const max = Math.max(...report.trend.flatMap((point) => [point.actual, point.target]), 1) * 1.12;
  const step = plotWidth / report.trend.length;
  const barWidth = Math.min(42, step * .54);
  const x = (index: number) => inset.left + step * index + step / 2;
  const y = (value: number) => inset.top + plotHeight - value / max * plotHeight;
  const targetLine = report.trend.map((point, index) => `${x(index)},${y(point.target)}`).join(' ');
  const active = hovered == null ? null : report.trend[hovered];

  return <div className="general-trend-stage" onMouseLeave={() => setHovered(null)}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolución mensual de resultado real y objetivo">
      {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}>
        <line x1={inset.left} x2={width - inset.right} y1={inset.top + plotHeight * (1 - ratio)} y2={inset.top + plotHeight * (1 - ratio)} className="general-chart-grid" />
        <text x={inset.left - 10} y={inset.top + plotHeight * (1 - ratio) + 4} textAnchor="end" className="general-axis-label">{metric(max * ratio, report.unit, true)}</text>
      </g>)}
      {report.trend.map((point, index) => <g key={point.month} tabIndex={0} aria-label={`${monthLabel(point.month, true)}. Real ${metric(point.actual, report.unit)}. Objetivo ${metric(point.target, report.unit)}.`} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} onMouseEnter={() => setHovered(index)}>
        <rect x={x(index) - step / 2} y={inset.top} width={step} height={plotHeight} className={`general-chart-hit ${hovered === index ? 'active' : ''}`} />
        <rect x={x(index) - barWidth / 2} y={y(point.actual)} width={barWidth} height={Math.max(1, inset.top + plotHeight - y(point.actual))} rx="5" className={point.isPartial ? 'general-chart-bar partial' : 'general-chart-bar'} />
        <text x={x(index)} y={height - 15} textAnchor="middle" className="general-month-label">{monthLabel(point.month)}</text>
      </g>)}
      <polyline points={targetLine} className="general-target-line" />
      {report.trend.map((point, index) => <circle key={point.month} cx={x(index)} cy={y(point.target)} r={hovered === index ? 5.5 : 3.5} className="general-target-dot" />)}
    </svg>
    {active && hovered != null && <aside className="general-chart-tooltip" style={{ left: `${Math.min(84, Math.max(8, x(hovered) / width * 100))}%` }}>
      <strong>{monthLabel(active.month, true)}{active.isPartial ? ' · parcial' : ''}</strong>
      <span><i className="actual" />Real <b>{metric(active.actual, report.unit)}</b></span>
      <span><i className="target" />Objetivo <b>{metric(active.target, report.unit)}</b></span>
      <small>Cumplimiento {percent(active.completion, 1)}</small>
    </aside>}
  </div>;
}

function PerformanceTable({ title, subtitle, rows, unit, onOpenName }: { title: string; subtitle: string; rows: GeneralPerformanceRow[]; unit: GeneralReportPayload['unit']; onOpenName?: (name: string) => void }) {
  const [sort, setSort] = useState(emptySort<PerformanceSortKey>());
  const sorted = useMemo(() => sortItems(rows, sort, (row, key) => row[key]), [rows, sort]);
  const direction = (key: PerformanceSortKey) => sort.key === key ? sort.direction : null;
  return <section className="data-card general-table-card">
    <div className="data-card-header"><div><span className="section-kicker"><Users size={14} /> Desglose</span><h2>{title}</h2><p>{subtitle}</p></div><span className="count-badge">{rows.length} filas</span></div>
    <div className="general-performance-table">
      <header><SortButton label="Nombre" direction={direction('name')} onClick={() => setSort((state) => cycleSort(state, 'name'))} /><SortButton label="Real" direction={direction('actual')} onClick={() => setSort((state) => cycleSort(state, 'actual'))} /><SortButton label="Objetivo" direction={direction('target')} onClick={() => setSort((state) => cycleSort(state, 'target'))} /><SortButton label="Cumplimiento" direction={direction('completion')} onClick={() => setSort((state) => cycleSort(state, 'completion'))} /><SortButton label="Diferencia" direction={direction('gap')} onClick={() => setSort((state) => cycleSort(state, 'gap'))} /></header>
      {sorted.map((row) => <article key={row.name}>{onOpenName ? <button className="entity-link general-name-link" onClick={() => onOpenName(row.name)}>{row.name}<ChevronRight size={13} /></button> : <strong>{row.name}</strong>}<span>{metric(row.actual, unit)}</span><span>{row.target ? metric(row.target, unit) : '—'}</span><span className={`general-completion ${row.completion != null && row.completion >= 100 ? 'achieved' : ''}`}>{percent(row.completion, 1)}</span><span className={row.gap < 0 ? 'pending' : 'achieved-text'}>{row.target ? `${row.gap > 0 ? '+' : ''}${metric(row.gap, unit)}` : '—'}</span></article>)}
      {!rows.length && <p className="report-empty">No hay datos para esta selección.</p>}
    </div>
  </section>;
}

export function ReportsView({ data, onOpen, onOpenSeller, onOpenBrand, onOpenGoals }: ReportsViewProps) {
  const [meta, setMeta] = useState<GeneralReportMeta | null>(null);
  const [report, setReport] = useState<GeneralReportPayload | null>(null);
  const [mode, setMode] = useState<GeneralReportMode>('core');
  const [month, setMonth] = useState('');
  const [seller, setSeller] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/reports/general/meta').then((response) => {
      if (!response.ok) throw new Error('No se pudo abrir la base analítica del Reporte General.');
      return response.json();
    }).then((payload: GeneralReportMeta) => {
      setMeta(payload);
      const linked = reportFiltersFromLocation('reports', { mode: 'core', month: payload.latestMonth, seller: '', category: '', brand: '' });
      setMode(modes.some((item) => item.id === linked.mode) ? linked.mode as GeneralReportMode : 'core');
      setMonth(linked.month); setSeller(linked.seller); setCategory(linked.category); setBrand(linked.brand);
    }).catch((cause: Error) => { setError(cause.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!meta || !month) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ mode, month });
    if (seller) query.set('seller', seller);
    if (category && mode === 'core') query.set('category', category);
    if (brand && mode !== 'autoservice') query.set('brand', brand);
    setLoading(true);
    setError('');
    fetch(`/api/reports/general?${query}`, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error('No se pudo calcular el Reporte General.');
      return response.json();
    }).then((payload: GeneralReportPayload) => { setReport(payload); setLoading(false); }).catch((cause: Error) => {
      if (cause.name !== 'AbortError') { setError(cause.message); setLoading(false); }
    });
    return () => controller.abort();
  }, [meta, mode, month, seller, category, brand]);

  const changeMode = (next: GeneralReportMode) => { setMode(next); setSeller(''); setCategory(''); setBrand(''); };
  const sellerOptions = mode === 'autoservice' ? meta?.universe.autoserviceSellers ?? [] : meta?.options.sellers ?? [];
  const actualChangeMonth = report ? change(report.actual, report.previousMonthActual) : null;
  const actualChangeYear = report ? change(report.actual, report.previousYearActual) : null;
  const pulseClients = useMemo(() => data.clients.filter((client) => client.active && matchesMultiFilter(client.seller, seller)), [data.clients, seller]);
  const pulseSales = pulseClients.reduce((sum, client) => sum + client.sales90d, 0);
  const pulseOverdue = pulseClients.reduce((sum, client) => sum + client.overdueOutstanding, 0);
  const priority = [...pulseClients].sort((left, right) => right.visitPriority - left.visitPriority)[0];
  const breakdown = report?.brands.length ? report.brands : report?.categories ?? [];
  const savedFilters = { mode, month, seller, category, brand };
  const applySaved = (saved: Record<string, string>) => {
    setMode(modes.some((item) => item.id === saved.mode) ? saved.mode as GeneralReportMode : 'core');
    setMonth(saved.month || meta?.latestMonth || '');
    setSeller(saved.seller || '');
    setCategory(saved.category || '');
    setBrand(saved.brand || '');
  };

  if (error && !report) return <ReportState state="error" title="Reporte General no disponible" detail={error} onRetry={() => location.reload()} />;
  if (!meta || !report) return <ReportState state="loading" title="Preparando Reporte General…" detail="Calculando resultados y objetivos desde las fuentes conciliadas." />;

  return <div className={`page-view general-report-page ${loading ? 'is-loading' : ''}`}>
    <section className="data-card general-filter-card" data-tour="reports-overview">
      <div className="general-filter-heading"><span className="section-kicker"><Gauge size={14} /> Estado Salice</span><h2>Resultado real frente al plan mensual</h2><p>Este reporte consulta resultados y objetivos. La carga, edición y activación del plan se realiza en Objetivos comerciales.</p></div>
      <div className="general-mode-switch">{modes.map((item) => <button key={item.id} className={mode === item.id ? 'active' : ''} onClick={() => changeMode(item.id)}><strong>{item.label}</strong><small>{item.note}</small></button>)}</div>
      <div className="general-filters">
        <SingleSelectFilter label="Mes" value={month} options={meta.months.map((item) => ({ value: item, label: monthLabel(item, true) }))} onChange={setMonth} />
        <MultiSelectFilter label="Vendedor" value={seller} options={sellerOptions} onChange={setSeller} />
        {mode === 'core' && <MultiSelectFilter label="Rubro" value={category} options={meta.options.coreCategories} onChange={setCategory} />}
        {mode !== 'autoservice' && <MultiSelectFilter label="Marca" value={brand} options={mode === 'strategic' ? meta.options.strategicBrands : meta.options.coreBrands} onChange={setBrand} />}
      </div>
      <ReportFilterActions view="reports" filters={savedFilters} labels={{ mode: { label: 'Universo', value: (value) => modes.find((item) => item.id === value)?.label ?? value }, month: { label: 'Mes', value: (value) => monthLabel(value, true) }, seller: { label: 'Vendedor' }, category: { label: 'Rubro' }, brand: { label: 'Marca' } }} onClear={(key) => key === 'mode' ? changeMode('core') : key === 'month' ? setMonth(meta.latestMonth) : key === 'seller' ? setSeller('') : key === 'category' ? setCategory('') : setBrand('')} onReset={() => { setMode('core'); setMonth(meta.latestMonth); setSeller(''); setCategory(''); setBrand(''); }}><SavedViewsBar viewKey="reports" filters={savedFilters} onApply={applySaved} /></ReportFilterActions>
    </section>

    <ReportContext universe={`${modes.find((item) => item.id === mode)?.label} · empresa 3 / sucursal 3`} period={`${report.periodStart} → ${report.periodEnd}`} cutoff={report.sourceMaxDate} comparison="Mes anterior y mismo período del año anterior" partial={report.isPartial} warnings={meta.unavailableDocumentCount ? [`${meta.unavailableDocumentCount} comprobantes fuente no disponibles en GESI.`] : []} related={[{ view: 'spt', label: 'Abrir SPT' }, { view: 'commercial-sales', label: 'Abrir Ventas Comercial' }]} actions={<button className="button secondary compact" onClick={onOpenGoals}><Target size={14} /> Administrar objetivos</button>} exports={<ReportExportActions links={[{ href: `/api/admin/goals/export?format=xlsx&month=${encodeURIComponent(month)}`, label: 'Plan mensual Excel', kind: 'xlsx' }, { href: `/api/admin/goals/export?format=pdf&month=${encodeURIComponent(month)}`, label: 'Plan y avance PDF', kind: 'pdf' }]} />} />
    <AiNarrativeCard artifact={report.aiNarrative} />

    <div className="general-kpis">
      <article><span className="general-kpi-icon green"><BarChart3 size={20} /></span><div><small>Resultado real</small><strong>{metric(report.actual, report.unit, true)}</strong><em>Hasta el {new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(new Date(`${report.periodEnd}T12:00:00`))}</em></div></article>
      <article><span className="general-kpi-icon blue"><Target size={20} /></span><div><small>Objetivo mensual</small><strong>{metric(report.target, report.unit, true)}</strong><em>{monthLabel(report.selectedMonth, true)}</em></div></article>
      <article><span className="general-kpi-icon ochre"><Gauge size={20} /></span><div><small>Cumplimiento</small><strong>{percent(report.completion, 1)}</strong><em>{report.target ? `${metric(Math.abs(report.gap), report.unit, true)} ${report.gap >= 0 ? 'por encima' : 'pendiente'}` : 'Sin objetivo cargado'}</em></div></article>
      <article><span className="general-kpi-icon green"><TrendingUp size={20} /></span><div><small>Proyección lineal</small><strong>{report.projection == null ? 'Mes cerrado' : metric(report.projection, report.unit, true)}</strong><em>{report.projectedCompletion == null ? `${report.daysInMonth} días completos` : `${percent(report.projectedCompletion, 1)} del objetivo`}</em></div></article>
      <article><span className="general-kpi-icon blue"><Users size={20} /></span><div><small>Clientes compradores</small><strong>{number(report.clients)}</strong><em>{number(report.units)} unidades informadas</em></div></article>
    </div>

    <div className="general-primary-grid">
      <section className="data-card general-goal-card">
        <div className="data-card-header"><div><span className="section-kicker"><Target size={14} /> Objetivo del período</span><h2>{modes.find((item) => item.id === mode)?.label}</h2><p>{report.isPartial ? `${report.elapsedDays} de ${report.daysInMonth} días transcurridos` : 'Período completo'}</p></div><span className="general-goal-value">{metric(report.actual, report.unit)} / {metric(report.target, report.unit)}</span></div>
        <div className="general-goal-body">
          <div className="general-goal-track"><i style={{ width: `${Math.min(100, report.completion ?? 0)}%` }} /><b style={{ left: `${Math.min(100, report.elapsedDays / report.daysInMonth * 100)}%` }} title="Avance calendario" /></div>
          <div className="general-goal-labels"><span>{metric(0, report.unit)}</span><span>Objetivo al día {metric(report.target * report.elapsedDays / report.daysInMonth, report.unit)}</span><span>{metric(report.target, report.unit)}</span></div>
          <div className="general-comparisons"><article><span>Contra mes anterior, mismo corte</span><strong className={actualChangeMonth != null && actualChangeMonth < 0 ? 'pending' : ''}>{actualChangeMonth == null ? 'Sin base' : `${actualChangeMonth >= 0 ? '+' : ''}${percent(actualChangeMonth, 1)}`}</strong><small>{metric(report.previousMonthActual, report.unit)} de base</small></article><article><span>Contra año anterior, mismo corte</span><strong className={actualChangeYear != null && actualChangeYear < 0 ? 'pending' : ''}>{actualChangeYear == null ? 'Sin base' : `${actualChangeYear >= 0 ? '+' : ''}${percent(actualChangeYear, 1)}`}</strong><small>{metric(report.previousYearActual, report.unit)} de base</small></article></div>
        </div>
      </section>

      <section className="data-card general-pulse-card">
        <div className="data-card-header"><div><span className="section-kicker"><PackageCheck size={14} /> Contexto operativo</span><h2>Pulso de la cartera</h2><p>Señales complementarias, no incluidas en el objetivo.</p></div></div>
        <div className="general-pulse-list"><article><span>Ventas últimos 90 días</span><strong>{money(pulseSales, true)}</strong></article><article><span>Saldo vencido actual</span><strong>{money(pulseOverdue, true)}</strong></article><article><span>Clientes activos</span><strong>{number(pulseClients.length)}</strong></article>{priority && <button onClick={() => onOpen(priority)}><span>Prioridad comercial más alta</span><strong>{clientPrimaryName(priority)}</strong><small>{clientSecondaryName(priority) ? `${clientSecondaryName(priority)} · ` : ''}P{priority.visitPriority} · {priority.seller}</small></button>}</div>
      </section>
    </div>

    <section className="data-card general-trend-card">
      <div className="data-card-header"><div><span className="section-kicker"><CalendarRange size={14} /> Evolución</span><h2>Real vs objetivo · 13 meses</h2><p>Las barras muestran el resultado real y la línea el plan. Pasá por cada mes para ver los valores exactos.</p></div><div className="general-chart-legend"><span><i className="actual" />Real</span><span><i className="target" />Objetivo</span></div></div>
      <TrendChart report={report} />
    </section>

    <div className="general-detail-grid">
      <PerformanceTable title="Resultado por vendedor" subtitle="Cada columna admite orden ascendente, descendente y original." rows={report.sellers} unit={report.unit} onOpenName={onOpenSeller} />
      <PerformanceTable title={report.brands.length ? 'Resultado por marca' : 'Composición por rubro'} subtitle={report.brands.length ? 'Participación y objetivos del universo seleccionado.' : 'Composición real del período; el plan no baja a este nivel.'} rows={breakdown} unit={report.unit} onOpenName={report.brands.length ? onOpenBrand : undefined} />
    </div>

    {mode === 'core' && report.categories.length > 0 && <PerformanceTable title="Resultado por rubro" subtitle="Alimento húmedo, balanceados y C&T bajo las mismas reglas del reporte." rows={report.categories} unit={report.unit} />}

    <section className="general-source-note">
      <Database size={18} /><div><strong>Fuentes separadas y auditables</strong><span><b>Resultado real:</b> {meta.sourceSystem}, empresa y sucursal 3, con cobertura al {new Intl.DateTimeFormat('es-AR').format(new Date(`${meta.maxDate}T12:00:00`))}. <b>Objetivos:</b> {meta.targetSource.label}, capturados el {new Intl.DateTimeFormat('es-AR').format(new Date(`${meta.targetSource.capturedAt}T12:00:00`))}. No se consulta Power BI para ejecutar esta pantalla.</span>{meta.unavailableDocumentCount > 0 && <small><Info size={13} /> {meta.unavailableDocumentCount} comprobantes fuente no estuvieron disponibles en GESI; la conciliación de kilos generales difiere 20 kg del archivo de referencia. Estratégicas y Autoservicio coinciden.</small>}</div>
    </section>
  </div>;
}
