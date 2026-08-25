import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Building2, CalendarRange, Database, PawPrint, Scale, Store, TrendingDown, TrendingUp, Users, X } from 'lucide-react';
import type { MarsBrandRow, MarsFilterKey, MarsFilters, MarsPeriodPoint, MarsReportMeta, MarsReportPayload } from '../../shared/models';
import { AiNarrativeCard } from '../components/AiInsights';
import { BusinessReportFilters, BusinessReportKpis, BusinessReportPeriodNote, BusinessReportSourceNote } from '../components/BusinessReportExperience';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { ReportContext, ReportEmptyNotice, ReportExportActions, ReportFilterActions, ReportState, reportActiveFilterCount, reportExportUrl } from '../components/ReportExperience';
import { SingleSelectFilter } from '../components/SingleSelectFilter';
import { SortButton } from '../components/SortButton';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';
import { compactNumber, money as formatMoney, number } from '../lib/format';
import { reportFiltersFromLocation } from '../lib/report-links';
import { usePinnedChart } from '../lib/use-pinned-chart';

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

const kilos = (value: number, compact = false) => compact ? compactNumber(value) : number(value, 2);
const exactKilos = (value: number) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value);
const money = (value: number) => formatMoney(value, true);
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
  const chart = usePinnedChart<number>();
  const hovered = chart.active;
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
  return <div className="mars-chart-stage" onMouseLeave={chart.clearHover}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Volumen Mars por período y comparación acumulada contra el año anterior">
      {[0, .25, .5, .75, 1].map((ratioValue) => <g key={ratioValue}><line x1={inset.left} x2={width - inset.right} y1={yKilos(maxKilos * ratioValue)} y2={yKilos(maxKilos * ratioValue)} className="mars-grid-line" />{ratioValue > 0 && <text x={inset.left - 10} y={yKilos(maxKilos * ratioValue) + 4} textAnchor="end">{kilos(maxKilos * ratioValue, true)}</text>}</g>)}
      {[0, 50, 100].map((ratioValue) => <text key={ratioValue} x={width - inset.right + 10} y={yRatio(ratioValue) + 4}>{ratioValue}%</text>)}
      {report.periods.map((row, index) => {
        const barWidth = Math.min(47, step * .58);
        const barHeight = Math.max(1, inset.top + chartHeight - yKilos(row.kilos));
        return <g key={row.label} className="mars-chart-hit" tabIndex={0} role="button" aria-pressed={chart.pinned === index} onMouseEnter={() => chart.setHovered(index)} onFocus={() => chart.setHovered(index)} onBlur={chart.clearHover} onClick={() => chart.togglePinned(index)} aria-label={`${row.label}: ${exactKilos(row.kilos)} kilos`}>
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
      <span><i className="sales" /><div><small>Facturación neta</small><b>{money(hoveredRow.netAmount)}</b></div></span>
      <span><i className="ratio" /><div><small>Acumulado vs año anterior</small><b>{percent(hoveredRow.ytdVsPreviousYear)}</b></div></span>
      <div className="mars-tooltip-grid"><span>{number(hoveredRow.clients)} {report.filters.clientMode === 'branch' ? 'sucursales' : 'cuentas'}</span><span>{percent(hoveredRow.vsPreviousYear)} vs año anterior</span><span>{percent(hoveredRow.vsPreviousPeriod)} vs período anterior</span></div>
    </aside>}
  </div>;
}

function ClientChart({ report }: { report: MarsReportPayload }) {
  const chart = usePinnedChart<number>();
  const hovered = chart.active;
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
  return <div className="mars-client-chart" onMouseLeave={chart.clearHover}>
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Clientes Mars por período"
      onMouseMove={(event) => {
        if (!report.periods.length) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const pointerX = (event.clientX - rect.left) / rect.width * width;
        const nearest = report.periods.length === 1 ? 0 : Math.round((pointerX - inset.left) / step);
        chart.setHovered(Math.max(0, Math.min(report.periods.length - 1, nearest)));
      }}
    >
      {[0, .5, 1].map((ratioValue) => <g key={ratioValue}><line x1={inset.left} x2={width - inset.right} y1={y(max * ratioValue)} y2={y(max * ratioValue)} className="mars-grid-line" />{ratioValue > 0 && <text x={inset.left - 8} y={y(max * ratioValue) + 4} textAnchor="end">{Math.round(max * ratioValue)}</text>}</g>)}
      <polyline points={points} className="mars-client-line" />
      {report.periods.map((row, index) => <g key={row.label} className="mars-chart-hit" tabIndex={0} role="button" aria-pressed={chart.pinned === index} onMouseEnter={() => chart.setHovered(index)} onFocus={() => chart.setHovered(index)} onBlur={chart.clearHover} onClick={() => chart.togglePinned(index)} aria-label={`${row.label}: ${number(row.clients)} ${report.filters.clientMode === 'branch' ? 'sucursales de cliente' : 'cuentas únicas'}`}><rect x={x(index) - Math.max(16, step / 2)} y={inset.top} width={Math.max(32, step)} height={chartHeight} fill="transparent" /><circle cx={x(index)} cy={y(row.clients)} r={hovered === index ? 6 : 4.5} className={row.isPartial ? 'mars-client-dot partial' : 'mars-client-dot'} /><text x={x(index)} y={height - 12} textAnchor="middle">{row.label}</text></g>)}
      {hovered != null && <line x1={x(hovered)} x2={x(hovered)} y1={inset.top} y2={inset.top + chartHeight} className="mars-hover-line" />}
    </svg>
    {hoveredRow && hovered != null && <aside className={`mars-client-tooltip ${hovered < 2 ? 'align-start' : hovered > report.periods.length - 3 ? 'align-end' : ''}`} style={{ left: `${x(hovered) / width * 100}%` }}><strong>{hoveredRow.label}</strong><b>{number(hoveredRow.clients)}</b><span>{report.filters.clientMode === 'branch' ? 'sucursales de cliente' : 'cuentas únicas'}</span><small>{number(hoveredRow.accounts)} cuentas · {number(hoveredRow.clientBranches)} sucursales</small></aside>}
  </div>;
}

function QuarterChart({ report }: { report: MarsReportPayload }) {
  const max = Math.max(1, ...report.quarters.flatMap((row) => [Math.abs(row.kilos), Math.abs(row.previousYearKilos ?? 0)]));
  return <div className="mars-quarter-grid">{report.quarters.map((row) => <article key={row.label || row.quarter}>
    <div>
      <span role="img" aria-label={`${row.label || row.quarter}, período: ${kilos(row.kilos)} kilos`} className={`current${row.isPartial ? ' partial' : ''}${row.kilos < 0 ? ' negative' : ''}`} style={{ height: `${Math.max(2, Math.abs(row.kilos) / max * 100)}%` }}><i aria-hidden="true">{kilos(row.kilos, true)}</i></span>
      {row.previousYearKilos != null && <span role="img" aria-label={`${row.label || row.quarter}, mismo tramo de ${row.year - 1}: ${kilos(row.previousYearKilos)} kilos`} className={`previous${row.previousYearKilos < 0 ? ' negative' : ''}`} style={{ height: `${Math.max(2, Math.abs(row.previousYearKilos) / max * 100)}%` }}><i aria-hidden="true">{kilos(row.previousYearKilos, true)}</i></span>}
    </div>
    <h3>{row.label || row.quarter}</h3>
    <small className="quarter-range">{row.start && row.end ? `${dateLabel(row.start)}–${dateLabel(row.end)}` : ''}{row.isPartial ? ' · tramo parcial' : ''}</small>
    <p>{money(row.netAmount)} · {number(row.clients)} clientes</p>
    <p className="quarter-comparison">{row.comparisonAvailable ? `${percent(row.variation, true)} vs mismo tramo ${row.year - 1}` : 'Sin cobertura interanual comparable'}</p>
  </article>)}</div>;
}

function BrandTable({ rows, onOpenBrand }: { rows: MarsBrandRow[]; onOpenBrand: (brand: string) => void }) {
  type SortKey = 'brand' | 'kilos' | 'clients' | 'share' | 'previousYearKilos' | 'variation';
  const [sort, setSort] = useState(emptySort<SortKey>());
  const sorted = sortItems(rows, sort, (row, key) => row[key]);
  const direction = (key: SortKey) => sort.key === key ? sort.direction : null;
  const changeSort = (key: SortKey) => setSort((current) => cycleSort(current, key));
  return <div className="mars-brand-table" role="region" aria-label="Detalle por marca Mars" tabIndex={0}><header><SortButton label="Marca" direction={direction('brand')} onClick={() => changeSort('brand')} /><SortButton label="Kilos / facturación" direction={direction('kilos')} onClick={() => changeSort('kilos')} /><SortButton label="Clientes" direction={direction('clients')} onClick={() => changeSort('clients')} /><SortButton label="Participación" direction={direction('share')} onClick={() => changeSort('share')} /><SortButton label="Año anterior" direction={direction('previousYearKilos')} onClick={() => changeSort('previousYearKilos')} /><SortButton label="Variación" direction={direction('variation')} onClick={() => changeSort('variation')} /></header>{sorted.map((row) => <article key={row.brand}><button className="entity-link" onClick={() => onOpenBrand(row.brand)}>{row.brand}</button><span><strong>{exactKilos(row.kilos)} kg</strong><small>{money(row.netAmount)}</small></span><span>{number(row.clients)}</span><span>{percent(row.share)}</span><span>{exactKilos(row.previousYearKilos)} kg</span><span className={row.variation != null && row.variation >= 0 ? 'positive' : 'negative'}>{percent(row.variation, true)}</span></article>)}</div>;
}

function PeriodTable({ rows, mode }: { rows: MarsPeriodPoint[]; mode: MarsFilters['clientMode'] }) {
  type SortKey = 'period' | 'kilos' | 'clients' | 'previousYearKilos' | 'vsPreviousYear' | 'ytdKilos' | 'ytdVsPreviousYear';
  const [sort, setSort] = useState(emptySort<SortKey>());
  const sorted = sortItems(rows, sort, (row, key) => row[key]);
  const direction = (key: SortKey) => sort.key === key ? sort.direction : null;
  const changeSort = (key: SortKey) => setSort((current) => cycleSort(current, key));
  return <div className="mars-period-table" role="region" aria-label="Detalle por período Mars" tabIndex={0}><header><SortButton label="Período" direction={direction('period')} onClick={() => changeSort('period')} /><SortButton label="Kilos / facturación" direction={direction('kilos')} onClick={() => changeSort('kilos')} /><SortButton label={mode === 'branch' ? 'Sucursales' : 'Cuentas'} direction={direction('clients')} onClick={() => changeSort('clients')} /><SortButton label="Año anterior" direction={direction('previousYearKilos')} onClick={() => changeSort('previousYearKilos')} /><SortButton label="Vs año anterior" direction={direction('vsPreviousYear')} onClick={() => changeSort('vsPreviousYear')} /><SortButton label="Acumulado" direction={direction('ytdKilos')} onClick={() => changeSort('ytdKilos')} /><SortButton label="Acum. vs anterior" direction={direction('ytdVsPreviousYear')} onClick={() => changeSort('ytdVsPreviousYear')} /></header>{sorted.map((row) => <article key={row.label}><strong>{row.label}<small>{dateLabel(row.start)}–{dateLabel(row.end)}{row.isPartial ? ' · parcial' : ''}</small></strong><span><strong>{exactKilos(row.kilos)} kg</strong><small>{money(row.netAmount)}</small></span><span>{number(row.clients)}</span><span>{exactKilos(row.previousYearKilos)}</span><span>{percent(row.vsPreviousYear)}</span><span>{exactKilos(row.ytdKilos)}</span><span>{percent(row.ytdVsPreviousYear)}</span></article>)}</div>;
}

export function MarsReportView({ onOpenBrand }: { onOpenBrand: (brand: string) => void }) {
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
      setFilters(reportFiltersFromLocation('mars', { ...EMPTY_FILTERS, year: payload.latestYear, period: payload.latestPeriod }));
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

  const advancedFilterCount = useMemo(() => (['clientType', 'channelGroup', 'brand', 'subcategoryGroup'] as const).filter((key) => filters[key]).length, [filters]);
  const update = (key: keyof MarsFilters, value: string) => setFilters((current) => {
    if (key === 'year' && meta) return { ...current, year: value, period: meta.periods[value]?.at(-1)?.label ?? current.period };
    return { ...current, [key]: value };
  });

  if (!meta && loading) return <ReportState state="loading" title="Preparando Reporte Mars" detail="Reconstruyendo el calendario comercial y los movimientos…" />;
  if (!meta || (!report && error)) return <ReportState state="error" title="No pudimos abrir Reporte Mars" detail={error} onRetry={() => location.reload()} />;
  if (!report) return <ReportState state="loading" title="Calculando períodos Mars" detail="Aplicando el universo y los filtros seleccionados." />;

  const clientTerm = report.filters.clientMode === 'branch' ? 'sucursales de cliente' : 'cuentas únicas';
  const priorPeriod = report.selected.period === 1 ? 'P13 del año anterior' : `P${String(report.selected.period - 1).padStart(2, '0')}`;
  const currentVsPrevious = variation(report.current.kilos, report.previousPeriod.kilos);
  const currentVsYear = variation(report.current.kilos, report.previousYear.kilos);
  const ytdClientVariation = variation(report.ytd.clients, report.previousYtd.clients);
  const filterKeys: MarsFilterKey[] = ['branch', 'clientType', 'channelGroup', 'brand', 'subcategoryGroup'];
  const defaultFilters: MarsFilters = { ...EMPTY_FILTERS, year: meta.latestYear, period: meta.latestPeriod, clientMode: filters.clientMode };
  const selectedFilterCount = reportActiveFilterCount(filters, defaultFilters);
  const reset = () => setFilters(defaultFilters);
  const applySaved = (saved: Record<string, string>) => setFilters({
    year: saved.year || meta.latestYear, period: saved.period || meta.latestPeriod,
    clientMode: saved.clientMode === 'account' ? 'account' : 'branch', branch: saved.branch || '',
    clientType: saved.clientType || '', channelGroup: saved.channelGroup || '', brand: saved.brand || '', subcategoryGroup: saved.subcategoryGroup || '',
  });

  return <div className="page-view mars-page">
    <BusinessReportFilters
      dataTour="mars-overview"
      kicker={<><PawPrint size={14} /> Reporte Mars</>}
      title={<>Pet Nutrition · {report.filters.year} {report.filters.period}</>}
      description="Períodos comerciales Mars de cuatro semanas, calculados sobre facturas y notas de crédito."
      introExtra={<div className="mars-mode-tabs" role="group" aria-label="Unidad de clientes"><button type="button" className={filters.clientMode === 'branch' ? 'active' : ''} aria-pressed={filters.clientMode === 'branch'} onClick={() => update('clientMode', 'branch')}><Store size={14} /> Por sucursal</button><button type="button" className={filters.clientMode === 'account' ? 'active' : ''} aria-pressed={filters.clientMode === 'account'} onClick={() => update('clientMode', 'account')}><Building2 size={14} /> Por cuenta</button></div>}
      primary={<><SingleSelectFilter label="Año Mars" value={filters.year} options={meta.years} onChange={(value) => update('year', value)} /><SingleSelectFilter label="Período Mars" value={filters.period} options={(meta.periods[filters.year] ?? []).map((period) => period.label)} onChange={(value) => update('period', value)} /><SelectFilter label={FILTER_LABELS.branch} value={filters.branch} options={meta.options.branch} onChange={(value) => update('branch', value)} /></>}
      advanced={<>{filterKeys.filter((key) => key !== 'branch').map((key) => <SelectFilter key={key} label={FILTER_LABELS[key]} value={filters[key]} options={meta.options[key]} onChange={(value) => update(key, value)} />)}<button className="button secondary" disabled={!selectedFilterCount} onClick={reset}><X size={14} /> Restablecer</button></>}
      activeFilterCount={advancedFilterCount}
      mobileActiveFilterCount={selectedFilterCount}
      expanded={expanded}
      onToggle={() => setExpanded((value) => !value)}
      loading={loading}
    >
      <ReportFilterActions view="mars" filters={{ ...filters }} defaults={defaultFilters} labels={{ year: { label: 'Año Mars' }, period: { label: 'Período' }, clientMode: { label: 'Clientes', value: (value) => value === 'account' ? 'Por cuenta' : 'Por sucursal' }, ...Object.fromEntries(Object.entries(FILTER_LABELS).map(([key, label]) => [key, { label }])) }} onClear={(key) => update(key as keyof MarsFilters, key === 'year' ? meta.latestYear : key === 'period' ? meta.latestPeriod : key === 'clientMode' ? 'branch' : '')} onReset={reset}><SavedViewsBar viewKey="mars" filters={{ ...filters }} onApply={applySaved} /></ReportFilterActions>
    </BusinessReportFilters>

    <ReportContext universe="Empresa 3 / sucursal 3 · grupo Pet Nutrition" period={`${report.selected.start} → ${report.isPartial ? report.sourceMaxDate : report.selected.end}`} cutoff={report.sourceMaxDate} comparison="Período anterior, mismo período del año anterior y acumulado equivalente" partial={report.isPartial} warnings={[...(meta.unavailableDocumentCount ? [`${meta.unavailableDocumentCount} comprobantes sin detalle.`] : []), ...(meta.clientTypeCatalogSource !== 'gesi_api' ? ['Tipos de cliente mostrados desde catálogo de referencia validado.'] : [])]} related={[{ view: 'commercial-sales', label: 'Abrir Ventas Comercial' }]} exports={<ReportExportActions links={[{ href: reportExportUrl('mars', filters), label: 'Exportar informe', kind: 'xlsx' }]} />} />
    <AiNarrativeCard artifact={report.aiNarrative} />
    {!report.current.clients && !report.current.kilos && <ReportEmptyNotice />}

    <BusinessReportPeriodNote partial={report.isPartial} title={`${report.selected.label} · ${dateLabel(report.selected.start)} al ${dateLabel(report.isPartial ? report.sourceMaxDate : report.selected.end)}`} detail={report.isPartial ? `Período en curso: ${report.elapsedDays} de ${report.selected.days} días. Las comparaciones acumuladas y por marca usan el mismo número de días del año anterior.` : `Período completo de ${report.selected.days} días.`} />

    <BusinessReportKpis items={[
      { label: 'Kilos / facturación', value: <>{kilos(report.current.kilos)} kg</>, detail: `${money(report.current.netAmount)} · ${report.isPartial ? 'corte parcial' : 'período completo'}`, icon: <Scale size={20} />, tone: 'green' },
      { label: priorPeriod, value: <>{kilos(report.previousPeriod.kilos)} kg</>, detail: `${money(report.previousPeriod.netAmount)} · ${percent(currentVsPrevious, true)}`, icon: currentVsPrevious != null && currentVsPrevious >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />, tone: currentVsPrevious != null && currentVsPrevious >= 0 ? 'green' : 'blue' },
      { label: `Mismo período ${report.selected.year - 1}`, value: <>{kilos(report.previousYear.kilos)} kg</>, detail: `${money(report.previousYear.netAmount)} · ${report.isPartial ? 'base completa' : percent(currentVsYear, true)}`, icon: <BarChart3 size={20} />, tone: currentVsYear != null && currentVsYear >= 0 ? 'green' : 'blue' },
      { label: clientTerm, value: number(report.current.clients), detail: `${number(report.current.accounts)} cuentas · ${number(report.current.clientBranches)} sucursales`, icon: <Users size={20} />, tone: 'navy' },
      { label: 'Kilos / facturación acumulados', value: <>{kilos(report.ytd.kilos)} kg</>, detail: `${money(report.ytd.netAmount)} · P01–${report.selected.label}`, icon: <CalendarRange size={20} />, tone: 'green' },
      { label: 'Acumulado año anterior', value: <>{kilos(report.previousYtd.kilos)} kg</>, detail: `${money(report.previousYtd.netAmount)} · ${percent(ytdClientVariation, true)} en ${clientTerm.toLowerCase()}`, icon: <Users size={20} />, tone: ytdClientVariation != null && ytdClientVariation >= 0 ? 'green' : 'blue' },
    ]} />

    <section className="data-card mars-volume-card"><div className="data-card-header"><div><span className="section-kicker"><TrendingUp size={14} /> Evolución</span><h2>Volumen por período y avance acumulado</h2><p>Barras en kilos; la línea compara el acumulado contra el mismo corte del año anterior.</p></div><div className="mars-legend"><span><i className="volume" />Volumen</span><span><i className="ratio" />Acumulado vs año anterior</span><span><i className="partial" />Período parcial</span></div></div><VolumeChart report={report} /></section>

    <div className="mars-secondary-grid"><section className="data-card mars-client-card"><div className="data-card-header"><div><span className="section-kicker"><Users size={14} /> Cobertura</span><h2>Clientes por período</h2><p>{filters.clientMode === 'branch' ? 'Una cuenta puede sumar más de una sucursal de entrega.' : 'Cada cliente se cuenta una sola vez.'}</p></div></div><ClientChart report={report} /></section><section className="data-card mars-quarter-card"><div className="data-card-header"><div><span className="section-kicker"><CalendarRange size={14} /> Quarters Mars</span><h2>13 períodos hasta {report.selected.label} {report.selected.year}</h2><p>Todos los quarters observables; los extremos parciales comparan exactamente el mismo tramo del año anterior.</p></div><div className="mars-legend"><span><i className="volume" />Período</span><span><i className="prior" />Mismo tramo año anterior</span></div></div><div className="quarter-chart-scroll"><QuarterChart report={report} /></div></section></div>

    <section className="data-card mars-brand-card"><div className="data-card-header"><div><span className="section-kicker"><PawPrint size={14} /> Marcas</span><h2>Mix del período seleccionado</h2><p>Comparación contra la misma cantidad de días del año anterior.</p></div><span className="count-badge">{number(report.brands.length)} marcas</span></div><BrandTable rows={report.brands} onOpenBrand={onOpenBrand} /></section>

    <section className="data-card mars-period-card"><div className="data-card-header"><div><span className="section-kicker"><Database size={14} /> Detalle auditable</span><h2>Períodos Mars {report.selected.year}</h2><p>Seleccioná los encabezados para ordenar de menor a mayor, de mayor a menor y volver al orden original.</p></div></div><PeriodTable rows={report.periods} mode={filters.clientMode} /></section>

    <BusinessReportSourceNote source={meta.sourceSystem}>{number(meta.rowCount)} movimientos Mars · cobertura GESI {meta.coverageFrom} a {meta.maxDate} · empresa 3 / sucursal 3 · grupo Pet Nutrition · excluye Via Salice MDP S.A.{meta.unavailableDocumentCount ? ` GESI no entregó el detalle de ${number(meta.unavailableDocumentCount)} de ${number(meta.sourceDocumentCount)} comprobantes; quedan identificados para el próximo refresco.` : ''}{meta.clientTypeCatalogSource !== 'gesi_api' ? ' Como el maestro de tipos de cliente llegó vacío, sus nombres se muestran con el catálogo de referencia validado; los IDs, clientes y movimientos siguen siendo de GESI.' : ''} El PBIX se usa sólo como referencia funcional y de conciliación.</BusinessReportSourceNote>
  </div>;
}
