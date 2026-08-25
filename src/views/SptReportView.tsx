import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CalendarRange, ChevronDown, ChevronRight, Database, Filter, Gauge, PackageOpen, RefreshCw, Scale, SlidersHorizontal, TrendingDown, TrendingUp, Users, X } from 'lucide-react';
import type { SptFilterKey, SptFilters, SptReportMeta, SptReportPayload } from '../../shared/models';
import { AiNarrativeCard } from '../components/AiInsights';
import { MobileFilterSheet } from '../components/MobileFilterSheet';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { ReportContext, ReportEmptyNotice, ReportExportActions, ReportFilterActions, ReportState, reportActiveFilterCount, reportExportUrl } from '../components/ReportExperience';
import { SingleSelectFilter } from '../components/SingleSelectFilter';
import { SortButton } from '../components/SortButton';
import { compactNumber, money, number } from '../lib/format';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';
import { reportFiltersFromLocation } from '../lib/report-links';
import { usePinnedChart } from '../lib/use-pinned-chart';

type ReportTab = 'summary' | 'sellers' | 'quarters';

const EMPTY_FILTERS: SptFilters = {
  month: '', seller: '', brand: '', productGroup: '', channel: '', product: '', client: '',
  line: '', category: '', subcategory: '', clientType: '', grouping: '', locality: '',
};

const FILTER_LABELS: Record<SptFilterKey, string> = {
  seller: 'Vendedor', brand: 'Marca', productGroup: 'Grupo de artículo', channel: 'Canal',
  product: 'Producto', client: 'Cliente', line: 'Línea', category: 'Rubro',
  subcategory: 'Subrubro', clientType: 'Tipo de cliente', grouping: 'Agrupación', locality: 'Localidad',
};

const kilos = (value: number, compact = false) => compact ? compactNumber(value) : number(value, 1);

const exactKilos = (value: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 }).format(value);

const monthLabel = (value: string, long = false) => {
  if (!value) return 'Sin fecha';
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-AR', { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit' })
    .format(new Date(year, month - 1, 1)).replace('.', '');
};

const ratio = (current: number, previous: number) => previous ? current / previous * 100 : null;
const variation = (current: number, previous: number) => previous ? (current - previous) / previous * 100 : null;
const signedPercent = (value: number | null) => value == null ? 'Sin base' : `${value >= 0 ? '+' : ''}${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value)}%`;
const sharePoints = (current: number, previous: number) => `${current - previous >= 0 ? '+' : ''}${number(current - previous, 1)} pp`;
const periodRange = (start: string, end: string) => `${new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' }).format(new Date(`${start}T12:00:00`))}–${new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${end}T12:00:00`))}`;

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <MultiSelectFilter label={label} value={value} options={options} onChange={onChange} />;
}

function DailyComparison({ report }: { report: SptReportPayload }) {
  const chart = usePinnedChart<number>();
  const hoveredIndex = chart.active;
  const width = 820;
  const height = 300;
  const inset = { x: 46, y: 22, bottom: 31 };
  const cumulative = (key: 'current' | 'previousMonth' | 'previousYear') => {
    let total = 0;
    return report.daily.map((point) => { total += point[key]; return total; });
  };
  type DailyMetricKey = 'current' | 'previousMonth' | 'previousYear';
  const series: { key: DailyMetricKey; label: string; color: string; values: number[] }[] = [
    { key: 'current', label: monthLabel(report.selectedMonth, true), color: '#32745b', values: cumulative('current') },
    { key: 'previousMonth', label: 'Mes anterior', color: '#d88b2e', values: cumulative('previousMonth') },
    { key: 'previousYear', label: 'Año anterior', color: '#6484a0', values: cumulative('previousYear') },
  ];
  const max = Math.max(1, ...series.flatMap((item) => item.values));
  const x = (index: number) => inset.x + index * ((width - inset.x * 2) / Math.max(1, report.daily.length - 1));
  const y = (value: number) => height - inset.bottom - value / max * (height - inset.y - inset.bottom);
  const hoveredPoint = hoveredIndex == null ? null : report.daily[hoveredIndex];
  return <div className="spt-line-chart">
    <div className="spt-chart-legend">{series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>
    <div className="spt-line-chart-scroll">
      <div className="spt-line-chart-stage">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Kilos acumulados por día comparados con mes y año anterior"
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const pointerX = (event.clientX - bounds.left) / bounds.width * width;
            const index = Math.round((pointerX - inset.x) / Math.max(1, width - inset.x * 2) * Math.max(1, report.daily.length - 1));
            chart.setHovered(Math.max(0, Math.min(report.daily.length - 1, index)));
          }}
          onPointerLeave={chart.clearHover}
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const pointerX = (event.clientX - bounds.left) / bounds.width * width;
            const index = Math.round((pointerX - inset.x) / Math.max(1, width - inset.x * 2) * Math.max(1, report.daily.length - 1));
            chart.togglePinned(Math.max(0, Math.min(report.daily.length - 1, index)));
          }}>
          <defs><linearGradient id="spt-current-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f8b72" stopOpacity=".22" /><stop offset="100%" stopColor="#4f8b72" stopOpacity="0" /></linearGradient></defs>
          {[0, .25, .5, .75, 1].map((tick) => <g key={tick}><line x1={inset.x} x2={width - inset.x} y1={y(max * tick)} y2={y(max * tick)} className="spt-grid-line" /><text x={inset.x - 7} y={y(max * tick) + 3} textAnchor="end">{kilos(max * tick, true)}</text></g>)}
          {series[0]?.values.length > 0 && <polygon points={`${x(0)},${height - inset.bottom} ${series[0].values.map((value, index) => `${x(index)},${y(value)}`).join(' ')} ${x(series[0].values.length - 1)},${height - inset.bottom}`} fill="url(#spt-current-area)" />}
          {series.map((item) => <polyline key={item.key} points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')} fill="none" stroke={item.color} strokeWidth={item.key === 'current' ? 3 : 2} strokeDasharray={item.key === 'current' ? undefined : '5 4'} strokeLinejoin="round" strokeLinecap="round" />)}
          {hoveredIndex != null && <g className="spt-hover-guide"><line x1={x(hoveredIndex)} x2={x(hoveredIndex)} y1={inset.y} y2={height - inset.bottom} />{series.map((item) => <circle key={item.key} cx={x(hoveredIndex)} cy={y(item.values[hoveredIndex])} r={4} fill="white" stroke={item.color} strokeWidth={2.5} />)}</g>}
          {report.daily.map((point, index) => (point.day === 1 || point.day % 3 === 0 || point.day === report.cutoffDay) && <text key={point.day} x={x(index)} y={height - 7} textAnchor="middle">{point.day}</text>)}
        </svg>
        {hoveredPoint && hoveredIndex != null && <aside className={`spt-chart-tooltip ${hoveredIndex < 3 ? 'align-start' : hoveredIndex > report.daily.length - 4 ? 'align-end' : ''}`} style={{ left: `${x(hoveredIndex) / width * 100}%` }} aria-live="polite">
          <strong>Día {hoveredPoint.day}</strong>
          {series.map((item) => <div key={item.key}><i style={{ background: item.color }} /><span><b>{item.label}</b><em>{exactKilos(item.values[hoveredIndex])} kg acumulados</em><small>{exactKilos(hoveredPoint[item.key])} kg del día</small></span></div>)}
        </aside>}
      </div>
    </div>
  </div>;
}

function MonthlyChart({ report }: { report: SptReportPayload }) {
  const chart = usePinnedChart<number>();
  const hovered = chart.active;
  const width = 900;
  const height = 285;
  const inset = { left: 58, right: 18, top: 20, bottom: 42 };
  const max = Math.max(1, ...report.monthly.map((row) => row.kilos));
  const chartWidth = width - inset.left - inset.right;
  const chartHeight = height - inset.top - inset.bottom;
  const step = chartWidth / report.monthly.length;
  const x = (index: number) => inset.left + step * index + step / 2;
  const y = (value: number) => inset.top + chartHeight - value / max * chartHeight;
  const hoveredRow = hovered == null ? null : report.monthly[hovered];
  return <div className="commercial-evolution-stage spt-history-stage" onMouseLeave={chart.clearHover}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolución mensual de kilos SPT">
      {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={inset.left} x2={width - inset.right} y1={y(max * ratio)} y2={y(max * ratio)} className="commercial-grid-line" />{ratio > 0 && <text x={inset.left - 9} y={y(max * ratio) + 4} textAnchor="end">{kilos(max * ratio, true)} kg</text>}</g>)}
      {report.monthly.map((row, index) => {
        const barWidth = Math.min(42, step * .58);
        const barHeight = Math.max(1, chartHeight - (y(row.kilos) - inset.top));
        return <g key={row.month} className="commercial-chart-hit" tabIndex={0} role="button" aria-pressed={chart.pinned === index} onMouseEnter={() => chart.setHovered(index)} onFocus={() => chart.setHovered(index)} onBlur={chart.clearHover} onClick={() => chart.togglePinned(index)} aria-label={`${monthLabel(row.month, true)}: ${exactKilos(row.kilos)} kilos`}>
          <rect x={x(index) - step / 2} y={inset.top} width={step} height={chartHeight} fill="transparent" />
          <rect x={x(index) - barWidth / 2} y={y(row.kilos)} width={barWidth} height={barHeight} rx="5" className="commercial-current-bar" />
          <text x={x(index)} y={height - 14} textAnchor="middle">{monthLabel(row.month)}</text>
        </g>;
      })}
      {hovered != null && <line x1={x(hovered)} x2={x(hovered)} y1={inset.top} y2={inset.top + chartHeight} className="commercial-hover-line" />}
    </svg>
    {hoveredRow && hovered != null && <aside className={`commercial-chart-tooltip spt-history-tooltip ${hovered < 2 ? 'align-start' : hovered > report.monthly.length - 3 ? 'align-end' : ''}`} style={{ left: `${x(hovered) / width * 100}%` }}>
      <strong>{monthLabel(hoveredRow.month, true)}</strong>
      <span><i style={{ background: '#78a48f' }} /><div><small>Volumen SPT</small><b>{exactKilos(hoveredRow.kilos)} kg</b></div></span>
      <div className="spt-history-tooltip-details"><span>{number(hoveredRow.clients)} clientes</span><span>{number(hoveredRow.units)} unidades</span><span>{money(hoveredRow.netAmount)} netos</span></div>
    </aside>}
  </div>;
}

function ProductGroupMix({ report }: { report: SptReportPayload }) {
  const previousMonthAvailable = report.mixPeriods.previousMonth.available;
  const previousYearAvailable = report.mixPeriods.previousYear.available;
  return <div className="report-mix-comparison spt-product-mix">
    <div className="report-mix-denominators" aria-label="Períodos y denominadores de la mezcla">
      <div><span>Período elegido</span><strong>{kilos(report.current.kilos)} kg</strong><small>{periodRange(report.mixPeriods.current.start, report.mixPeriods.current.end)}</small></div>
      <div><span>Mes anterior</span><strong>{previousMonthAvailable ? `${kilos(report.previousMonth.kilos)} kg` : 'Sin cobertura'}</strong><small>{periodRange(report.mixPeriods.previousMonth.start, report.mixPeriods.previousMonth.end)}</small></div>
      <div><span>Año anterior</span><strong>{previousYearAvailable ? `${kilos(report.previousYear.kilos)} kg` : 'Sin cobertura'}</strong><small>{periodRange(report.mixPeriods.previousYear.start, report.mixPeriods.previousYear.end)}</small></div>
    </div>
    <p className="report-mix-method">La participación usa los kilos totales del universo SPT en cada período. Las variaciones comparan el mismo corte calendario.</p>
    <div className="report-mix-card-grid">
      {report.productGroups.map((row) => <article key={row.label} className="report-mix-comparison-card">
        <header><div><span className="report-mix-marker" /><strong>{row.label}</strong></div><b>{number(row.share, 1)}%</b></header>
        <div className="report-mix-current">
          <div><span>Kilos al corte</span><strong>{kilos(row.kilos)} kg</strong></div>
          <div><span>Facturación</span><strong>{money(row.netAmount, true)}</strong></div>
          <div><span>Clientes</span><strong>{number(row.clients)}</strong></div>
        </div>
        <div className="report-mix-comparisons">
          <div className={!previousMonthAvailable ? 'unavailable' : row.kilosVariationPreviousMonth != null && row.kilosVariationPreviousMonth >= 0 ? 'positive' : 'negative'}>
            <span>vs mes anterior</span>
            <strong>{previousMonthAvailable ? signedPercent(row.kilosVariationPreviousMonth) : 'Sin cobertura'}</strong>
            <small>{previousMonthAvailable ? `${kilos(row.previousMonth.kilos)} kg antes · ${sharePoints(row.share, row.previousMonthShare)}` : periodRange(report.mixPeriods.previousMonth.start, report.mixPeriods.previousMonth.end)}</small>
          </div>
          <div className={!previousYearAvailable ? 'unavailable' : row.kilosVariationPreviousYear != null && row.kilosVariationPreviousYear >= 0 ? 'positive' : 'negative'}>
            <span>vs año anterior</span>
            <strong>{previousYearAvailable ? signedPercent(row.kilosVariationPreviousYear) : 'Sin cobertura'}</strong>
            <small>{previousYearAvailable ? `${kilos(row.previousYear.kilos)} kg antes · ${sharePoints(row.share, row.previousYearShare)}` : periodRange(report.mixPeriods.previousYear.start, report.mixPeriods.previousYear.end)}</small>
          </div>
        </div>
      </article>)}
    </div>
  </div>;
}

function DailyTable({ report }: { report: SptReportPayload }) {
  type DailySortKey = 'day' | 'current' | 'previousMonth' | 'previousYear';
  const [sort, setSort] = useState(emptySort<DailySortKey>());
  const rows = sortItems(report.daily, sort, (row, key) => row[key]);
  const totals = report.daily.reduce((sum, row) => ({
    current: sum.current + row.current,
    previousMonth: sum.previousMonth + row.previousMonth,
    previousYear: sum.previousYear + row.previousYear,
  }), { current: 0, previousMonth: 0, previousYear: 0 });
  const direction = (key: DailySortKey) => sort.key === key ? sort.direction : null;
  const changeSort = (key: DailySortKey) => setSort((current) => cycleSort(current, key));
  return <div className="spt-daily-table"><header><span><SortButton label="Día" direction={direction('day')} onClick={() => changeSort('day')} /></span><span><SortButton label={monthLabel(report.selectedMonth)} direction={direction('current')} onClick={() => changeSort('current')} /></span><span><SortButton label="Mes anterior" direction={direction('previousMonth')} onClick={() => changeSort('previousMonth')} /></span><span><SortButton label="Año anterior" direction={direction('previousYear')} onClick={() => changeSort('previousYear')} /></span></header>{rows.map((row) => <article key={row.day}><strong>{row.day}</strong><span>{kilos(row.current)}</span><span>{kilos(row.previousMonth)}</span><span>{kilos(row.previousYear)}</span></article>)}<footer><strong>Total</strong><span>{exactKilos(totals.current)}</span><span>{exactKilos(totals.previousMonth)}</span><span>{exactKilos(totals.previousYear)}</span></footer></div>;
}

function SellerTab({ report, onOpenSeller }: { report: SptReportPayload; onOpenSeller: (seller: string) => void }) {
  type SellerSortKey = 'label' | 'kilos' | 'clients' | 'units' | 'netAmount';
  const [sort, setSort] = useState(emptySort<SellerSortKey>());
  const rows = sortItems(report.sellers, sort, (row, key) => row[key]);
  const max = Math.max(1, ...report.sellers.map((row) => row.kilos));
  const direction = (key: SellerSortKey) => sort.key === key ? sort.direction : null;
  const changeSort = (key: SellerSortKey) => setSort((current) => cycleSort(current, key));
  return <section className="data-card spt-seller-card"><div className="data-card-header"><div><span className="section-kicker"><Users size={14} /> Vendedores</span><h2>Volumen y cobertura comercial</h2><p>Usa el universo comercial ampliado definido para el análisis de vendedores.</p></div><span className="count-badge">{report.sellers.length} vendedores</span></div>
    <div className="spt-seller-table-scroll">
      <div className="spt-seller-head"><SortButton label="Vendedor" direction={direction('label')} onClick={() => changeSort('label')} /><SortButton label="Volumen" direction={direction('kilos')} onClick={() => changeSort('kilos')} /><SortButton label="Clientes" direction={direction('clients')} onClick={() => changeSort('clients')} /><SortButton label="Unidades" direction={direction('units')} onClick={() => changeSort('units')} /><SortButton label="Importe neto" direction={direction('netAmount')} onClick={() => changeSort('netAmount')} /></div>
      <div className="spt-seller-list">{rows.map((row) => <article key={row.label}><button className="entity-link" onClick={() => onOpenSeller(row.label)}>{row.label}<ChevronRight size={13} /></button><div><b>{kilos(row.kilos)} kg</b><i><span style={{ width: `${row.kilos / max * 100}%` }} /></i></div><span>{number(row.clients)}</span><span>{number(row.units)}</span><span>{money(row.netAmount, true)}</span></article>)}</div>
    </div>
  </section>;
}

function QuarterTab({ report }: { report: SptReportPayload }) {
  const selectedYear = Number(report.selectedMonth.slice(0, 4));
  const currentQuarter = Math.floor((Number(report.selectedMonth.slice(5, 7)) - 1) / 3) + 1;
  const max = Math.max(1, ...report.quarters.flatMap((row) => [row.current, row.previousYear]));
  return <section className="data-card spt-quarter-card"><div className="data-card-header"><div><span className="section-kicker"><CalendarRange size={14} /> Trimestre</span><h2>Volumen trimestral contra el año anterior</h2><p>El trimestre en curso se corta en el mismo día para ambos años y aplica el universo histórico conciliado.</p></div><div className="spt-chart-legend"><span><i className="green" />{selectedYear}</span><span><i className="blue" />{selectedYear - 1}</span></div></div>
    <div className="spt-quarter-grid">{report.quarters.map((row) => <article key={row.quarter}><h3>T{row.quarter}</h3><div><span className="current" style={{ height: `${row.current / max * 100}%` }}><i>{kilos(row.current, true)}</i></span><span className="previous" style={{ height: `${row.previousYear / max * 100}%` }}><i>{kilos(row.previousYear, true)}</i></span></div><p>{row.quarter > currentQuarter ? 'Aún no iniciado' : `${money(row.currentNetAmount, true)} · ${signedPercent(variation(row.current, row.previousYear))}`}</p></article>)}</div>
  </section>;
}

export function SptReportView({ onOpenSeller }: { onOpenSeller: (seller: string) => void }) {
  const [meta, setMeta] = useState<SptReportMeta | null>(null);
  const [filters, setFilters] = useState<SptFilters>(EMPTY_FILTERS);
  const [report, setReport] = useState<SptReportPayload | null>(null);
  const [tab, setTab] = useState<ReportTab>(() => {
    const linked = reportFiltersFromLocation('spt', { tab: 'summary' });
    return ['summary', 'sellers', 'quarters'].includes(linked.tab) ? linked.tab as ReportTab : 'summary';
  });
  const [expanded, setExpanded] = useState(false);
  const [specificFiltersOpen, setSpecificFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/reports/spt/meta').then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo abrir la base SPT');
      return payload as SptReportMeta;
    }).then((payload) => { setMeta(payload); setFilters(reportFiltersFromLocation('spt', { ...EMPTY_FILTERS, month: payload.latestMonth })); }).catch((cause: Error) => { setError(cause.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!meta || !filters.month) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) parameters.set(key, value);
    parameters.set('page', tab === 'summary' ? 'main' : tab);
    fetch(`/api/reports/spt?${parameters}`, { signal: controller.signal }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo calcular el reporte');
      return payload as SptReportPayload;
    }).then(setReport).catch((cause: Error) => { if (cause.name !== 'AbortError') setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, meta, tab]);

  const advancedFilterCount = useMemo(() => (['brand', 'category', 'product', 'client', 'line', 'subcategory', 'clientType', 'grouping', 'locality'] as const).filter((key) => filters[key]).length, [filters]);
  const update = (key: keyof SptFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));

  if (!meta && loading) return <ReportState state="loading" title="Preparando el modelo SPT" detail="Leyendo facturas, notas de crédito y datos comerciales…" />;
  if (!meta || (!report && error)) return <ReportState state="error" title="No pudimos abrir el reporte SPT" detail={error} onRetry={() => location.reload()} />;
  if (!report) return <ReportState state="loading" title="Calculando comparaciones" detail="Aplicando el universo y los filtros seleccionados." />;

  const previousRatio = ratio(report.current.kilos, report.previousMonth.kilos);
  const yearRatio = ratio(report.current.kilos, report.previousYear.kilos);
  const ytdRatio = ratio(report.ytd.kilos, report.previousYtd.kilos);
  const selectedMonthLong = monthLabel(report.selectedMonth, true);
  const requiredHistoricalStart = `${Number(report.selectedMonth.slice(0, 4)) - 1}-01-01`;
  const incompleteHistoricalCoverage = meta.coverageFrom > requiredHistoricalStart;
  const unavailableDocumentRate = meta.sourceDocumentCount
    ? meta.unavailableDocumentCount / (meta.sourceDocumentCount + meta.unavailableDocumentCount) * 100
    : 0;
  const commonAdvancedKeys: SptFilterKey[] = ['brand', 'category', 'product', 'client'];
  const specificAdvancedKeys: SptFilterKey[] = ['line', 'subcategory', 'clientType', 'grouping', 'locality'];
  const resetFilters = () => {
    setFilters({ ...EMPTY_FILTERS, month: meta.latestMonth });
    setSpecificFiltersOpen(false);
  };
  const savedFilters = { ...filters, tab };
  const defaultFilters = { ...EMPTY_FILTERS, month: meta.latestMonth, tab: 'summary' as ReportTab };
  const selectedFilterCount = reportActiveFilterCount(savedFilters, defaultFilters);
  const applySaved = (saved: Record<string, string>) => {
    setFilters(Object.fromEntries(Object.keys(EMPTY_FILTERS).map((key) => [key, saved[key] ?? (key === 'month' ? meta.latestMonth : '')])) as unknown as SptFilters);
    setTab(['summary', 'sellers', 'quarters'].includes(saved.tab) ? saved.tab as ReportTab : 'summary');
  };

  return <div className="page-view spt-page">
    <section className="data-card spt-filter-card" data-tour="spt-overview">
      <div className="spt-filter-intro"><span className="section-kicker"><Filter size={14} /> Información SPT conciliada</span><h2>Volumen SPT · {selectedMonthLong}</h2><p>Las reglas del reporte histórico se recalculan sobre facturas, notas de crédito y datos comerciales.</p></div>
      <MobileFilterSheet
        title="Filtros de Volumen SPT"
        description="Elegí el mes y acotá el universo comercial sin perder de vista el resumen del reporte."
        activeCount={selectedFilterCount}
      >
        <div className="spt-filter-primary"><SingleSelectFilter label="Mes" value={filters.month} options={meta.months.map((month) => ({ value: month, label: monthLabel(month, true) }))} onChange={(value) => update('month', value)} /><SelectFilter label="Vendedor" value={filters.seller} options={meta.options.seller} onChange={(value) => update('seller', value)} /><SelectFilter label="Canal" value={filters.channel} options={meta.options.channel} onChange={(value) => update('channel', value)} /><SelectFilter label="Grupo de artículo" value={filters.productGroup} options={meta.options.productGroup} onChange={(value) => update('productGroup', value)} /><button className={`button secondary spt-more-button ${advancedFilterCount ? 'active' : ''}`} onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}><Filter size={14} /> Más filtros {advancedFilterCount ? `(${advancedFilterCount})` : ''}<ChevronDown size={13} /></button></div>
        {expanded && <div className="spt-filter-expanded">
          <div className="spt-filter-group-heading"><div><strong>Filtros comerciales</strong><span>Acotá el análisis por marca, rubro, producto o cliente.</span></div></div>
          <div className="spt-filter-grid">{commonAdvancedKeys.map((key) => <SelectFilter key={key} label={FILTER_LABELS[key]} value={filters[key]} options={meta.options[key]} onChange={(value) => update(key, value)} />)}</div>
          <button className={`button ghost spt-specific-toggle ${specificFiltersOpen ? 'active' : ''}`} onClick={() => setSpecificFiltersOpen((value) => !value)} aria-expanded={specificFiltersOpen}><SlidersHorizontal size={14} /> {specificFiltersOpen ? 'Ocultar criterios específicos' : 'Ver criterios específicos'}</button>
          {specificFiltersOpen && <><div className="spt-filter-group-heading secondary"><div><strong>Clasificación y segmentación</strong><span>Usalos sólo cuando necesitás reproducir un corte puntual del reporte histórico.</span></div></div><div className="spt-filter-grid specific">{specificAdvancedKeys.map((key) => <SelectFilter key={key} label={FILTER_LABELS[key]} value={filters[key]} options={meta.options[key]} onChange={(value) => update(key, value)} />)}</div></>}
          <div className="spt-filter-footer"><button className="button secondary" disabled={!selectedFilterCount} onClick={resetFilters}><X size={14} /> Restablecer filtros</button></div>
        </div>}
        <ReportFilterActions view="spt" filters={savedFilters} defaults={defaultFilters} labels={{ month: { label: 'Mes', value: (value) => monthLabel(value, true) }, tab: { label: 'Vista' }, ...Object.fromEntries(Object.entries(FILTER_LABELS).map(([key, label]) => [key, { label }])) }} onClear={(key) => key === 'tab' ? setTab('summary') : update(key as keyof SptFilters, key === 'month' ? meta.latestMonth : '')} onReset={() => { resetFilters(); setTab('summary'); }}><SavedViewsBar viewKey="spt" filters={savedFilters} onApply={applySaved} /></ReportFilterActions>
      </MobileFilterSheet>
      {loading && <div className="spt-filter-loading"><RefreshCw className="spin" size={13} /> Recalculando</div>}
    </section>

    <ReportContext universe="Empresa 3 · sucursal 3 · universo SPT conciliado" period={`${report.selectedMonth}-01 → ${report.selectedMonth}-${String(report.cutoffDay).padStart(2, '0')}`} cutoff={report.sourceMaxDate} comparison="Mes anterior y mismo período del año anterior" partial={report.cutoffDay < new Date(Date.UTC(Number(report.selectedMonth.slice(0, 4)), Number(report.selectedMonth.slice(5, 7)), 0)).getUTCDate()} warnings={[...(incompleteHistoricalCoverage ? [`Cobertura histórica disponible desde ${meta.coverageFrom}.`] : []), ...(meta.unavailableDocumentCount ? [`${meta.unavailableDocumentCount} comprobantes sin detalle.`] : [])]} related={[{ view: 'reports', label: 'Abrir Reporte General' }, { view: 'commercial-sales', label: 'Abrir Ventas Comercial' }]} exports={<ReportExportActions links={[{ href: reportExportUrl('spt', { ...filters, page: tab === 'summary' ? 'main' : tab }), label: 'Exportar informe', kind: 'xlsx' }]} />} />
    <AiNarrativeCard artifact={report.aiNarrative} />
    {!report.current.clients && !report.current.kilos && <ReportEmptyNotice />}

    {incompleteHistoricalCoverage
      ? <section className="spt-coverage-warning"><AlertTriangle size={17} /><div><strong>Histórico todavía incompleto</strong><span>La información disponible comienza el {meta.coverageFrom}. No interpretes como cero las comparaciones con períodos anteriores a esa fecha.</span></div></section>
      : <section className="spt-coverage-warning is-complete"><Database size={17} /><div><strong>Histórico 2025 incorporado</strong><span>Cobertura desde {meta.coverageFrom} con los filtros actuales. No está disponible el detalle de {number(meta.unavailableDocumentCount)} de {number(meta.sourceDocumentCount + meta.unavailableDocumentCount)} comprobantes ({number(unavailableDocumentRate)}%).</span></div></section>}

    <div className="spt-tabs"><button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}><Gauge size={15} /> Resumen mensual</button><button className={tab === 'sellers' ? 'active' : ''} onClick={() => setTab('sellers')}><Users size={15} /> Vendedores</button><button className={tab === 'quarters' ? 'active' : ''} onClick={() => setTab('quarters')}><CalendarRange size={15} /> Trimestre</button></div>

    <div className="spt-kpis">
      <article><span className="spt-kpi-icon green"><Scale size={18} /></span><div><small>Kilos / facturación del mes</small><strong>{kilos(report.current.kilos)} kg</strong><em>{money(report.current.netAmount, true)} · 1–{report.cutoffDay} {selectedMonthLong}</em></div></article>
      <article><span className={`spt-kpi-icon ${previousRatio != null && previousRatio >= 100 ? 'green' : 'red'}`}>{previousRatio != null && previousRatio >= 100 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}</span><div><small>Vs mes anterior</small><strong>{previousRatio == null ? 'Sin base' : `${kilos(previousRatio)}%`}</strong><em>{signedPercent(variation(report.current.kilos, report.previousMonth.kilos))} · misma cantidad de días</em></div></article>
      <article><span className={`spt-kpi-icon ${yearRatio != null && yearRatio >= 100 ? 'green' : 'blue'}`}><BarChart3 size={18} /></span><div><small>Vs año anterior</small><strong>{incompleteHistoricalCoverage ? 'Sin cobertura' : yearRatio == null ? 'Sin base' : `${kilos(yearRatio)}%`}</strong><em>{incompleteHistoricalCoverage ? 'Histórico no disponible' : `${signedPercent(variation(report.current.kilos, report.previousYear.kilos))} interanual`}</em></div></article>
      <article><span className="spt-kpi-icon blue"><Users size={18} /></span><div><small>Clientes</small><strong>{number(report.current.clients)}</strong><em>clientes distintos en el período</em></div></article>
      <article><span className="spt-kpi-icon ochre"><PackageOpen size={18} /></span><div><small>Promedio 3 meses</small><strong>{kilos(report.averageLast3MonthsKilos)} kg</strong><em>tres meses completos anteriores</em></div></article>
      <article><span className={`spt-kpi-icon ${ytdRatio != null && ytdRatio >= 100 ? 'green' : 'red'}`}><CalendarRange size={18} /></span><div><small>Acumulado vs año anterior</small><strong>{incompleteHistoricalCoverage ? 'Sin cobertura' : ytdRatio == null ? 'Sin base' : `${kilos(ytdRatio)}%`}</strong><em>{incompleteHistoricalCoverage ? 'Histórico no disponible' : `${money(report.ytd.netAmount, true)} · ${signedPercent(variation(report.ytd.kilos, report.previousYtd.kilos))}`}</em></div></article>
    </div>

    {tab === 'summary' && <>
      <section className="data-card"><div className="data-card-header"><div><span className="section-kicker"><TrendingUp size={14} /> Avance mensual</span><h2>Kilos acumulados por día</h2><p>Comparación homogénea hasta el día {report.cutoffDay}.</p></div><span className="count-badge">{money(report.current.netAmount, true)} netos</span></div><DailyComparison report={report} /></section>
      <section className="data-card spt-product-mix-card"><div className="data-card-header"><div><span className="section-kicker"><PackageOpen size={14} /> Mezcla</span><h2>Participación y evolución por grupo</h2><p>Volumen, facturación y clientes de cada grupo, con comparaciones al mismo día.</p></div><span className="count-badge">{number(report.productGroups.length)} grupos</span></div><ProductGroupMix report={report} /></section>
      <section className="data-card spt-monthly-card"><div className="data-card-header"><div><span className="section-kicker"><BarChart3 size={14} /> Historia</span><h2>Evolución de kilos por mes</h2><p>Trece meses de volumen SPT; el mes actual se muestra parcial cuando corresponde.</p></div><div className="commercial-legend"><span><i className="current" />Kilos SPT</span></div></div><MonthlyChart report={report} /></section>
      <section className="data-card spt-daily-card"><div className="data-card-header"><div><span className="section-kicker"><CalendarRange size={14} /> Detalle diario</span><h2>Volumen por día</h2><p>Kilos diarios sin acumulación, como soporte de la comparación.</p></div></div><DailyTable report={report} /></section>
    </>}
    {tab === 'sellers' && <SellerTab report={report} onOpenSeller={onOpenSeller} />}
    {tab === 'quarters' && <QuarterTab report={report} />}

    <details className="business-report-source-note"><summary><Database size={15} /> Información técnica del reporte</summary><div><strong>{meta.sourceSystem}</strong><span>{number(meta.rowCount)} movimientos · cobertura solicitada {meta.coverageFrom} a {meta.maxDate} · empresa 3 / sucursal 3.</span></div></details>
  </div>;
}
