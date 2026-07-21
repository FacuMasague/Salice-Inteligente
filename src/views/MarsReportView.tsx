import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Building2, CalendarRange, ChevronDown, Database, Filter, PawPrint, RefreshCw, Scale, Store, TrendingDown, TrendingUp, Users, X } from 'lucide-react';
import type { MarsBrandRow, MarsFilterKey, MarsFilters, MarsPeriodPoint, MarsReportMeta, MarsReportPayload } from '../../shared/models';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SingleSelectFilter } from '../components/SingleSelectFilter';
import { SortButton } from '../components/SortButton';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';
import { number } from '../lib/format';

const EMPTY_FILTERS: MarsFilters = {
  year: '', period: '', clientMode: 'branch', branch: '', clientType: '',
  channelGroup: '', brand: '', subcategoryGroup: '',
};
const FILTER_LABELS: Record<MarsFilterKey, string> = {
  branch: 'Sucursal',
  clientType: 'Tipo de cliente',
  channelGroup: 'Canal de venta',
  brand: 'Marca',
  subcategoryGroup: 'Subrubro',
};

const kilos = (value: number, compact = false) => new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: compact ? 1 : 2,
  notation: compact ? 'compact' : 'standard',
}).format(value);
const exactKilos = (value: number) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value);
const percent = (value: number | null, signed = false) => value == null
  ? 'Sin base'
  : `${signed && value > 0 ? '+' : ''}${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value)}%`;
const dateLabel = (value: string) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })
  .format(new Date(`${value}T12:00:00Z`)).replaceAll('.', '');
const variation = (current: number, previous: number) => previous ? (current - previous) / previous * 100 : null;

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <MultiSelectFilter label={label} value={value} options={options} onChange={onChange} />;
}

function VolumeChart({ report }: { report: MarsReportPayload }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const width = 920;
  const height = 315;
  const inset = { left: 62, right: 62, top: 24, bottom: 43 };
  const chartWidth = width - inset.left - inset.right;
  const chartHeight = height - inset.top - inset.bottom;
  const maxKilos = Math.max(1, ...report.periods.map((row) => row.kilos));
  const maxRatio = Math.max(120, ...report.periods.map((row) => row.ytdVsPreviousYear ?? 0));
  const step = chartWidth / Math.max(1, report.periods.length);
  const x = (index: number) => inset.left + step * index + step / 2;
  const yKilos = (value: number) => inset.top + chartHeight - value / maxKilos * chartHeight;
  const yRatio = (value: number) => inset.top + chartHeight - value / maxRatio * chartHeight;
  const linePoints = report.periods.map((row, index) => `${x(index)},${yRatio(row.ytdVsPreviousYear ?? 0)}`).join(' ');
  const hoveredRow = hovered == null ? null : report.periods[hovered];
  return <div className="mars-chart-stage" onMouseLeave={() => setHovered(null)}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Volumen Mars por período y comparación acumulada contra el año anterior">
      {[0, .25, .5, .75, 1].map((ratioValue) => <g key={ratioValue}><line x1={inset.left} x2={width - inset.right} y1={yKilos(maxKilos * ratioValue)} y2={yKilos(maxKilos * ratioValue)} className="mars-grid-line" />{ratioValue > 0 && <text x={inset.left - 10} y={yKilos(maxKilos * ratioValue) + 4} textAnchor="end">{kilos(maxKilos * ratioValue, true)}</text>}</g>)}
      {[0, 50, 100].map((ratioValue) => <text key={ratioValue} x={width - inset.right + 10} y={yRatio(ratioValue) + 4}>{ratioValue}%</text>)}
      {report.periods.map((row, index) => {
        const barWidth = Math.min(47, step * .58);
        const barHeight = Math.max(1, inset.top + chartHeight - yKilos(row.kilos));
        return <g key={row.label} className="mars-chart-hit" tabIndex={0} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} aria-label={`${row.label}: ${exactKilos(row.kilos)} kilos`}>
          <rect x={x(index) - step / 2} y={inset.top} width={step} height={chartHeight} fill="transparent" />
          <rect x={x(index) - barWidth / 2} y={yKilos(row.kilos)} width={barWidth} height={barHeight} rx="5" className={row.isPartial ? 'mars-volume-bar partial' : 'mars-volume-bar'} />
          <text x={x(index)} y={height - 14} textAnchor="middle">{row.label}</text>
        </g>;
      })}
      <polyline points={linePoints} className="mars-ratio-line" />
      {report.periods.map((row, index) => <circle key={row.label} cx={x(index)} cy={yRatio(row.ytdVsPreviousYear ?? 0)} r={hovered === index ? 5 : 3.8} className="mars-ratio-dot" />)}
      {hovered != null && <line x1={x(hovered)} x2={x(hovered)} y1={inset.top} y2={inset.top + chartHeight} className="mars-hover-line" />}
    </svg>
    {hoveredRow && hovered != null && <aside className={`mars-chart-tooltip ${hovered < 2 ? 'align-start' : hovered > report.periods.length - 3 ? 'align-end' : ''}`} style={{ left: `${x(hovered) / width * 100}%` }}>
      <strong>{hoveredRow.label} · {dateLabel(hoveredRow.start)}–{dateLabel(hoveredRow.end)}{hoveredRow.isPartial ? ' · parcial' : ''}</strong>
      <span><i className="volume" /><div><small>Volumen</small><b>{exactKilos(hoveredRow.kilos)} kg</b></div></span>
      <span><i className="ratio" /><div><small>YTD vs año anterior</small><b>{percent(hoveredRow.ytdVsPreviousYear)}</b></div></span>
      <div className="mars-tooltip-grid"><span>{number(hoveredRow.clients)} {report.filters.clientMode === 'branch' ? 'sucursales' : 'cuentas'}</span><span>{percent(hoveredRow.vsPreviousYear)} vs LY</span><span>{percent(hoveredRow.vsPreviousPeriod)} vs período anterior</span></div>
    </aside>}
  </div>;
}

function ClientChart({ report }: { report: MarsReportPayload }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(500);
  const height = 315;
  const inset = { left: 48, right: 18, top: 22, bottom: 38 };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const updateWidth = () => setWidth(Math.max(320, Math.round(svg.getBoundingClientRect().width)));
    const observer = new ResizeObserver(updateWidth);
    observer.observe(svg);
    updateWidth();
    return () => observer.disconnect();
  }, []);
  const max = Math.max(1, ...report.periods.map((row) => row.clients));
  const chartWidth = width - inset.left - inset.right;
  const chartHeight = height - inset.top - inset.bottom;
  const step = chartWidth / Math.max(1, report.periods.length - 1);
  const x = (index: number) => inset.left + (report.periods.length === 1 ? chartWidth / 2 : step * index);
  const y = (value: number) => inset.top + chartHeight - value / max * chartHeight;
  const points = report.periods.map((row, index) => `${x(index)},${y(row.clients)}`).join(' ');
  const hoveredRow = hovered == null ? null : report.periods[hovered];
  return <div className="mars-client-chart" onMouseLeave={() => setHovered(null)}>
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Clientes Mars por período">
      {[0, .5, 1].map((ratioValue) => <g key={ratioValue}><line x1={inset.left} x2={width - inset.right} y1={y(max * ratioValue)} y2={y(max * ratioValue)} className="mars-grid-line" />{ratioValue > 0 && <text x={inset.left - 8} y={y(max * ratioValue) + 4} textAnchor="end">{Math.round(max * ratioValue)}</text>}</g>)}
      <polyline points={points} className="mars-client-line" />
      {report.periods.map((row, index) => <g key={row.label} className="mars-chart-hit" tabIndex={0} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)}><circle cx={x(index)} cy={y(row.clients)} r={hovered === index ? 6 : 4.5} className={row.isPartial ? 'mars-client-dot partial' : 'mars-client-dot'} /><text x={x(index)} y={height - 12} textAnchor="middle">{row.label}</text></g>)}
      {hovered != null && <line x1={x(hovered)} x2={x(hovered)} y1={inset.top} y2={inset.top + chartHeight} className="mars-hover-line" />}
    </svg>
    {hoveredRow && hovered != null && <aside className={`mars-client-tooltip ${hovered < 2 ? 'align-start' : hovered > report.periods.length - 3 ? 'align-end' : ''}`} style={{ left: `${x(hovered) / width * 100}%` }}><strong>{hoveredRow.label}</strong><b>{number(hoveredRow.clients)}</b><span>{report.filters.clientMode === 'branch' ? 'sucursales de cliente' : 'cuentas únicas'}</span><small>{number(hoveredRow.accounts)} cuentas · {number(hoveredRow.clientBranches)} sucursales</small></aside>}
  </div>;
}

function QuarterChart({ report }: { report: MarsReportPayload }) {
  const max = Math.max(1, ...report.quarters.flatMap((row) => [row.kilos, row.previousYearKilos]));
  return <div className="mars-quarter-grid">{report.quarters.map((row) => <article key={row.quarter}><div><span className="current" style={{ height: `${row.kilos / max * 100}%` }}><i>{kilos(row.kilos, true)}</i></span><span className="previous" style={{ height: `${row.previousYearKilos / max * 100}%` }}><i>{kilos(row.previousYearKilos, true)}</i></span></div><h3>{row.quarter}</h3><p>{percent(variation(row.kilos, row.previousYearKilos), true)}</p></article>)}</div>;
}

function BrandTable({ rows }: { rows: MarsBrandRow[] }) {
  type SortKey = 'brand' | 'kilos' | 'clients' | 'share' | 'previousYearKilos' | 'variation';
  const [sort, setSort] = useState(emptySort<SortKey>());
  const sorted = sortItems(rows, sort, (row, key) => row[key]);
  const direction = (key: SortKey) => sort.key === key ? sort.direction : null;
  const changeSort = (key: SortKey) => setSort((current) => cycleSort(current, key));
  return <div className="mars-brand-table"><header><SortButton label="Marca" direction={direction('brand')} onClick={() => changeSort('brand')} /><SortButton label="Kilos" direction={direction('kilos')} onClick={() => changeSort('kilos')} /><SortButton label="Clientes" direction={direction('clients')} onClick={() => changeSort('clients')} /><SortButton label="Participación" direction={direction('share')} onClick={() => changeSort('share')} /><SortButton label="Año anterior comparable" direction={direction('previousYearKilos')} onClick={() => changeSort('previousYearKilos')} /><SortButton label="Variación" direction={direction('variation')} onClick={() => changeSort('variation')} /></header>{sorted.map((row) => <article key={row.brand}><strong>{row.brand}</strong><span>{exactKilos(row.kilos)} kg</span><span>{number(row.clients)}</span><span>{percent(row.share)}</span><span>{exactKilos(row.previousYearKilos)} kg</span><span className={row.variation != null && row.variation >= 0 ? 'positive' : 'negative'}>{percent(row.variation, true)}</span></article>)}</div>;
}

function PeriodTable({ rows, mode }: { rows: MarsPeriodPoint[]; mode: MarsFilters['clientMode'] }) {
  type SortKey = 'period' | 'kilos' | 'clients' | 'previousYearKilos' | 'vsPreviousYear' | 'ytdKilos' | 'ytdVsPreviousYear';
  const [sort, setSort] = useState(emptySort<SortKey>());
  const sorted = sortItems(rows, sort, (row, key) => row[key]);
  const direction = (key: SortKey) => sort.key === key ? sort.direction : null;
  const changeSort = (key: SortKey) => setSort((current) => cycleSort(current, key));
  return <div className="mars-period-table"><header><SortButton label="Período" direction={direction('period')} onClick={() => changeSort('period')} /><SortButton label="Kilos" direction={direction('kilos')} onClick={() => changeSort('kilos')} /><SortButton label={mode === 'branch' ? 'Sucursales' : 'Cuentas'} direction={direction('clients')} onClick={() => changeSort('clients')} /><SortButton label="LY comparable" direction={direction('previousYearKilos')} onClick={() => changeSort('previousYearKilos')} /><SortButton label="Vs LY" direction={direction('vsPreviousYear')} onClick={() => changeSort('vsPreviousYear')} /><SortButton label="YTD" direction={direction('ytdKilos')} onClick={() => changeSort('ytdKilos')} /><SortButton label="YTD vs LY" direction={direction('ytdVsPreviousYear')} onClick={() => changeSort('ytdVsPreviousYear')} /></header>{sorted.map((row) => <article key={row.label}><strong>{row.label}<small>{dateLabel(row.start)}–{dateLabel(row.end)}{row.isPartial ? ' · parcial' : ''}</small></strong><span>{exactKilos(row.kilos)}</span><span>{number(row.clients)}</span><span>{exactKilos(row.previousYearKilos)}</span><span>{percent(row.vsPreviousYear)}</span><span>{exactKilos(row.ytdKilos)}</span><span>{percent(row.ytdVsPreviousYear)}</span></article>)}</div>;
}

export function MarsReportView() {
  const [meta, setMeta] = useState<MarsReportMeta | null>(null);
  const [filters, setFilters] = useState<MarsFilters>(EMPTY_FILTERS);
  const [report, setReport] = useState<MarsReportPayload | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/reports/mars/meta').then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo abrir el modelo Mars');
      return payload as MarsReportMeta;
    }).then((payload) => {
      setMeta(payload);
      setFilters({ ...EMPTY_FILTERS, year: payload.latestYear, period: payload.latestPeriod });
    }).catch((cause: Error) => { setError(cause.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!meta || !filters.year || !filters.period) return;
    const controller = new AbortController();
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) parameters.set(key, value);
    setLoading(true);
    setError('');
    fetch(`/api/reports/mars?${parameters}`, { signal: controller.signal }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo calcular el reporte Mars');
      return payload as MarsReportPayload;
    }).then(setReport).catch((cause: Error) => { if (cause.name !== 'AbortError') setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, meta]);

  const activeFilterCount = useMemo(() => (Object.entries(filters) as [keyof MarsFilters, string][]).filter(([key, value]) => !['year', 'period', 'clientMode'].includes(key) && value).length, [filters]);
  const update = (key: keyof MarsFilters, value: string) => setFilters((current) => {
    if (key === 'year' && meta) return { ...current, year: value, period: meta.periods[value]?.at(-1)?.label ?? current.period };
    return { ...current, [key]: value };
  });

  if (!meta && loading) return <div className="page-view mars-page"><div className="spt-loading"><RefreshCw className="spin" size={24} /><strong>Preparando Reporte Mars</strong><span>Reconstruyendo el calendario comercial y los movimientos desde GESI…</span></div></div>;
  if (!meta || (!report && error)) return <div className="page-view mars-page"><div className="spt-loading error"><Database size={24} /><strong>No pudimos abrir Reporte Mars</strong><span>{error}</span></div></div>;
  if (!report) return <div className="page-view mars-page"><div className="spt-loading"><RefreshCw className="spin" size={24} /><strong>Calculando períodos Mars</strong></div></div>;

  const clientTerm = report.filters.clientMode === 'branch' ? 'sucursales de cliente' : 'cuentas únicas';
  const priorPeriod = report.selected.period === 1 ? 'P13 del año anterior' : `P${String(report.selected.period - 1).padStart(2, '0')}`;
  const currentVsPrevious = variation(report.current.kilos, report.previousPeriod.kilos);
  const currentVsYear = variation(report.current.kilos, report.previousYear.kilos);
  const ytdClientVariation = variation(report.ytd.clients, report.previousYtd.clients);
  const filterKeys: MarsFilterKey[] = ['branch', 'clientType', 'channelGroup', 'brand', 'subcategoryGroup'];
  const reset = () => setFilters({ ...EMPTY_FILTERS, year: meta.latestYear, period: meta.latestPeriod, clientMode: filters.clientMode });

  return <div className="page-view mars-page">
    <section className="data-card mars-filter-card" data-tour="mars-overview">
      <div className="mars-filter-copy"><span className="section-kicker"><PawPrint size={14} /> Reporte Mars</span><h2>Pet Nutrition · {report.filters.year} {report.filters.period}</h2><p>Períodos comerciales Mars de cuatro semanas, calculados directamente sobre facturas y notas de crédito de GESI.</p><div className="mars-mode-tabs" role="group" aria-label="Unidad de clientes"><button className={filters.clientMode === 'branch' ? 'active' : ''} onClick={() => update('clientMode', 'branch')}><Store size={14} /> Por sucursal</button><button className={filters.clientMode === 'account' ? 'active' : ''} onClick={() => update('clientMode', 'account')}><Building2 size={14} /> Por cuenta</button></div></div>
      <div className="mars-filter-controls"><SingleSelectFilter label="Año Mars" value={filters.year} options={meta.years} onChange={(value) => update('year', value)} /><SingleSelectFilter label="Período Mars" value={filters.period} options={(meta.periods[filters.year] ?? []).map((period) => period.label)} onChange={(value) => update('period', value)} /><SelectFilter label={FILTER_LABELS.branch} value={filters.branch} options={meta.options.branch} onChange={(value) => update('branch', value)} /><button className={`button secondary mars-more-button ${activeFilterCount ? 'active' : ''}`} onClick={() => setExpanded((value) => !value)}><Filter size={14} /> Más filtros {activeFilterCount ? `(${activeFilterCount})` : ''}<ChevronDown size={13} /></button></div>
      {expanded && <div className="mars-filter-expanded">{filterKeys.filter((key) => key !== 'branch').map((key) => <SelectFilter key={key} label={FILTER_LABELS[key]} value={filters[key]} options={meta.options[key]} onChange={(value) => update(key, value)} />)}<button className="button secondary" disabled={!activeFilterCount} onClick={reset}><X size={14} /> Restablecer</button></div>}
      {loading && <div className="mars-filter-loading"><RefreshCw className="spin" size={13} /> Recalculando</div>}
    </section>

    <section className={`mars-period-note ${report.isPartial ? 'partial' : ''}`}><CalendarRange size={17} /><div><strong>{report.selected.label} · {dateLabel(report.selected.start)} al {dateLabel(report.isPartial ? report.sourceMaxDate : report.selected.end)}</strong><span>{report.isPartial ? `Período en curso: ${report.elapsedDays} de ${report.selected.days} días. Las comparaciones YTD y por marca usan el mismo número de días del año anterior.` : `Período completo de ${report.selected.days} días.`}</span></div></section>

    <div className="mars-kpis">
      <article><span className="mars-kpi-icon green"><Scale size={20} /></span><div><small>Total de kilos</small><strong>{kilos(report.current.kilos)} kg</strong><em>{report.isPartial ? 'corte parcial' : 'período completo'}</em></div></article>
      <article><span className={`mars-kpi-icon ${currentVsPrevious != null && currentVsPrevious >= 0 ? 'green' : 'blue'}`}>{currentVsPrevious != null && currentVsPrevious >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}</span><div><small>{priorPeriod}</small><strong>{kilos(report.previousPeriod.kilos)} kg</strong><em>{percent(currentVsPrevious, true)} vs período seleccionado</em></div></article>
      <article><span className={`mars-kpi-icon ${currentVsYear != null && currentVsYear >= 0 ? 'green' : 'blue'}`}><BarChart3 size={20} /></span><div><small>Mismo período {report.selected.year - 1}</small><strong>{kilos(report.previousYear.kilos)} kg</strong><em>{report.isPartial ? 'base completa del período' : `${percent(currentVsYear, true)} interanual`}</em></div></article>
      <article><span className="mars-kpi-icon navy"><Users size={20} /></span><div><small>{clientTerm}</small><strong>{number(report.current.clients)}</strong><em>{number(report.current.accounts)} cuentas · {number(report.current.clientBranches)} sucursales</em></div></article>
      <article><span className="mars-kpi-icon green"><CalendarRange size={20} /></span><div><small>{clientTerm} YTD</small><strong>{number(report.ytd.clients)}</strong><em>P01–{report.selected.label}</em></div></article>
      <article><span className={`mars-kpi-icon ${ytdClientVariation != null && ytdClientVariation >= 0 ? 'green' : 'blue'}`}><Users size={20} /></span><div><small>YTD año anterior</small><strong>{number(report.previousYtd.clients)}</strong><em>{percent(ytdClientVariation, true)} · corte equivalente</em></div></article>
    </div>

    <div className="mars-main-grid"><section className="data-card mars-volume-card"><div className="data-card-header"><div><span className="section-kicker"><TrendingUp size={14} /> Evolución</span><h2>Volumen por período y avance YTD</h2><p>Barras en kilos; la línea compara el acumulado contra el mismo corte del año anterior.</p></div><div className="mars-legend"><span><i className="volume" />Volumen</span><span><i className="ratio" />YTD vs LY</span><span><i className="partial" />Período parcial</span></div></div><VolumeChart report={report} /></section><section className="data-card mars-client-card"><div className="data-card-header"><div><span className="section-kicker"><Users size={14} /> Cobertura</span><h2>Clientes por período</h2><p>{filters.clientMode === 'branch' ? 'Una cuenta puede sumar más de una sucursal de entrega.' : 'Cada ClienteID se cuenta una sola vez.'}</p></div></div><ClientChart report={report} /></section></div>

    <div className="mars-secondary-grid"><section className="data-card mars-quarter-card"><div className="data-card-header"><div><span className="section-kicker"><CalendarRange size={14} /> Quarter Mars</span><h2>Volumen acumulado por quarter</h2><p>Actual contra año anterior comparable.</p></div><div className="mars-legend"><span><i className="volume" />{report.selected.year}</span><span><i className="prior" />{report.selected.year - 1}</span></div></div><QuarterChart report={report} /></section><section className="data-card mars-brand-card"><div className="data-card-header"><div><span className="section-kicker"><PawPrint size={14} /> Marcas</span><h2>Mix del período seleccionado</h2><p>Comparación contra la misma cantidad de días del año anterior.</p></div><span className="count-badge">{number(report.brands.length)} marcas</span></div><BrandTable rows={report.brands} /></section></div>

    <section className="data-card mars-period-card"><div className="data-card-header"><div><span className="section-kicker"><Database size={14} /> Detalle auditable</span><h2>Períodos Mars {report.selected.year}</h2><p>Seleccioná los encabezados para ordenar de menor a mayor, de mayor a menor y volver al orden original.</p></div></div><PeriodTable rows={report.periods} mode={filters.clientMode} /></section>

    <section className="mars-source-note"><Database size={16} /><div><strong>{meta.sourceSystem}</strong><span>{number(meta.rowCount)} movimientos Mars · cobertura GESI {meta.coverageFrom} a {meta.maxDate} · empresa 3 / sucursal 3 · grupo Pet Nutrition · excluye Via Salice MDP S.A.{meta.unavailableDocumentCount ? ` GESI no entregó el detalle de ${number(meta.unavailableDocumentCount)} de ${number(meta.sourceDocumentCount)} comprobantes; quedan identificados para el próximo refresco.` : ''}{meta.clientTypeCatalogSource !== 'gesi_api' ? ' Como el maestro de tipos de cliente llegó vacío, sus nombres se muestran con el catálogo de referencia validado; los IDs, clientes y movimientos siguen siendo de GESI.' : ''} El PBIX se usa sólo como referencia funcional y de conciliación.</span></div></section>
  </div>;
}
