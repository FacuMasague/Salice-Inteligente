import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarRange, PackageOpen, Scale, Store, TrendingDown, TrendingUp, Users, X } from 'lucide-react';
import type { BairesBreakdownRow, BairesFilterKey, BairesFilters, BairesMonthlyPoint, BairesReportMeta, BairesReportPayload } from '../../shared/models';
import { AiNarrativeCard } from '../components/AiInsights';
import { BusinessReportFilters, BusinessReportKpis, BusinessReportPeriodNote, BusinessReportSourceNote } from '../components/BusinessReportExperience';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { ReportContext, ReportEmptyNotice, ReportExportActions, ReportFilterActions, ReportState, reportActiveFilterCount, reportExportUrl } from '../components/ReportExperience';
import { SingleSelectFilter } from '../components/SingleSelectFilter';
import { SortButton } from '../components/SortButton';
import { compactNumber, money as formatMoney, number } from '../lib/format';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';
import { reportFiltersFromLocation } from '../lib/report-links';

const EMPTY_FILTERS: BairesFilters = { year: '', month: '', segment: '', brand: '', subcategory: '', branch: '' };
const FILTER_LABELS: Record<BairesFilterKey, string> = { segment: 'Segmento Baires', brand: 'Marca', subcategory: 'Subrubro', branch: 'Sucursal' };

const kilos = (value: number, compact = false) => compact ? compactNumber(value) : number(value, 2);
const exactKilos = (value: number) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value);
const money = (value: number) => formatMoney(value, true);
const percent = (value: number | null, signed = false) => value == null ? 'Sin base' : `${signed && value > 0 ? '+' : ''}${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value)}%`;
const variation = (current: number, previous: number) => previous ? (current - previous) / previous * 100 : null;
const monthLabel = (value: string, long = false) => new Intl.DateTimeFormat('es-AR', { month: long ? 'long' : 'short', year: '2-digit' }).format(new Date(`${value}-15T12:00:00Z`)).replaceAll('.', '');
const monthName = (value: string) => new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(new Date(`2026-${value}-15T12:00:00Z`)).replaceAll('.', '');

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <MultiSelectFilter label={label} value={value} options={options} onChange={onChange} />;
}

function EvolutionChart({ report }: { report: BairesReportPayload }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const width = 920;
  const height = 310;
  const inset = { left: 63, right: 64, top: 23, bottom: 42 };
  const chartWidth = width - inset.left - inset.right;
  const chartHeight = height - inset.top - inset.bottom;
  const maxKilos = Math.max(1, ...report.monthly.map((row) => row.kilos));
  const ratios = report.monthly.flatMap((row) => row.ytdVsPreviousYear == null ? [] : [row.ytdVsPreviousYear]);
  const minRatio = Math.min(0, ...ratios);
  const maxRatio = Math.max(120, ...ratios);
  const ratioRange = Math.max(1, maxRatio - minRatio);
  const step = chartWidth / Math.max(1, report.monthly.length);
  const x = (index: number) => inset.left + step * index + step / 2;
  const yKilos = (value: number) => inset.top + chartHeight - value / maxKilos * chartHeight;
  const yRatio = (value: number) => inset.top + chartHeight - (value - minRatio) / ratioRange * chartHeight;
  const linePoints = report.monthly.flatMap((row, index) => row.ytdVsPreviousYear == null ? [] : [`${x(index)},${yRatio(row.ytdVsPreviousYear)}`]).join(' ');
  const hoveredRow = hovered == null ? null : report.monthly[hovered];
  return <div className="nutripet-chart-stage" onMouseLeave={() => setHovered(null)}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Volumen Baires de los últimos trece meses y acumulado contra el año anterior">
      {[0, .25, .5, .75, 1].map((ratioValue) => <g key={ratioValue}><line x1={inset.left} x2={width - inset.right} y1={yKilos(maxKilos * ratioValue)} y2={yKilos(maxKilos * ratioValue)} className="nutripet-grid-line" />{ratioValue > 0 && <text x={inset.left - 10} y={yKilos(maxKilos * ratioValue) + 4} textAnchor="end">{kilos(maxKilos * ratioValue, true)}</text>}</g>)}
      {[0, 100].map((value) => <text key={value} x={width - inset.right + 9} y={yRatio(value) + 4}>{value}%</text>)}
      {report.monthly.map((row, index) => { const barWidth = Math.min(43, step * .62); const barHeight = Math.max(1, inset.top + chartHeight - yKilos(row.kilos)); return <g key={row.month} className="nutripet-chart-hit" tabIndex={0} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} aria-label={`${monthLabel(row.month, true)}: ${exactKilos(row.kilos)} kilos`}><rect x={x(index) - step / 2} y={inset.top} width={step} height={chartHeight} fill="transparent" /><rect x={x(index) - barWidth / 2} y={yKilos(row.kilos)} width={barWidth} height={barHeight} rx="5" className={row.isPartial ? 'nutripet-volume-bar partial' : 'nutripet-volume-bar'} /><text x={x(index)} y={height - 13} textAnchor="middle">{monthLabel(row.month)}</text></g>; })}
      {linePoints && <polyline points={linePoints} className="nutripet-ratio-line" />}
      {report.monthly.map((row, index) => row.ytdVsPreviousYear == null ? null : <circle key={row.month} cx={x(index)} cy={yRatio(row.ytdVsPreviousYear)} r={hovered === index ? 5 : 3.8} className="nutripet-ratio-dot" />)}
      {hovered != null && <line x1={x(hovered)} x2={x(hovered)} y1={inset.top} y2={inset.top + chartHeight} className="nutripet-hover-line" />}
    </svg>
    {hoveredRow && hovered != null && <aside className={`nutripet-chart-tooltip ${hovered < 2 ? 'align-start' : hovered > report.monthly.length - 3 ? 'align-end' : ''}`} style={{ left: `${x(hovered) / width * 100}%` }}><strong>{monthLabel(hoveredRow.month, true)}{hoveredRow.isPartial ? ' · parcial' : ''}</strong><span><i /><div><small>Volumen</small><b>{exactKilos(hoveredRow.kilos)} kg</b></div></span><span><i className="sales" /><div><small>Facturación neta</small><b>{money(hoveredRow.netAmount)}</b></div></span><span><i className="ratio" /><div><small>Acumulado vs año anterior</small><b>{percent(hoveredRow.ytdVsPreviousYear)}</b></div></span><div><span>{number(hoveredRow.clients)} clientes</span><span>{percent(hoveredRow.vsPreviousMonth == null ? null : hoveredRow.vsPreviousMonth - 100, true)} vs mes anterior</span><span>{percent(hoveredRow.vsPreviousYear == null ? null : hoveredRow.vsPreviousYear - 100, true)} vs año anterior</span></div></aside>}
  </div>;
}

function ClientChart({ rows }: { rows: BairesMonthlyPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const data = rows.slice(-12);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(520);
  const height = 310;
  const inset = { left: 45, right: 22, top: 21, bottom: 52 };
  useEffect(() => { const svg = svgRef.current; if (!svg) return; const update = () => setWidth(Math.max(320, Math.round(svg.getBoundingClientRect().width))); const observer = new ResizeObserver(update); observer.observe(svg); update(); return () => observer.disconnect(); }, []);
  const max = Math.max(1, ...data.map((row) => row.clients));
  const chartWidth = width - inset.left - inset.right;
  const chartHeight = height - inset.top - inset.bottom;
  const step = chartWidth / Math.max(1, data.length - 1);
  const x = (index: number) => inset.left + (data.length === 1 ? chartWidth / 2 : step * index);
  const y = (value: number) => inset.top + chartHeight - value / max * chartHeight;
  const hoveredRow = hovered == null ? null : data[hovered];
  return <div className="nutripet-client-stage" onMouseLeave={() => setHovered(null)}><svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Clientes Baires por mes" onMouseMove={(event) => { if (!data.length) return; const rect = event.currentTarget.getBoundingClientRect(); const pointerX = (event.clientX - rect.left) / rect.width * width; const nearest = data.length === 1 ? 0 : Math.round((pointerX - inset.left) / step); setHovered(Math.max(0, Math.min(data.length - 1, nearest))); }}>{[0, .5, 1].map((ratioValue) => <g key={ratioValue}><line x1={inset.left} x2={width - inset.right} y1={y(max * ratioValue)} y2={y(max * ratioValue)} className="nutripet-grid-line" />{ratioValue > 0 && <text x={inset.left - 8} y={y(max * ratioValue) + 4} textAnchor="end">{Math.round(max * ratioValue)}</text>}</g>)}<polyline points={data.map((row, index) => `${x(index)},${y(row.clients)}`).join(' ')} className="nutripet-client-line" />{data.map((row, index) => <g key={row.month} className="nutripet-chart-hit" tabIndex={0} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} aria-label={`${monthLabel(row.month, true)}: ${number(row.clients)} clientes`}><circle cx={x(index)} cy={y(row.clients)} r={hovered === index ? 6 : 4.5} className={row.isPartial ? 'nutripet-client-dot partial' : 'nutripet-client-dot'} /><text className="nutripet-client-month-label" x={x(index)} y={height - 18} textAnchor="middle">{monthLabel(row.month)}</text></g>)}</svg>{hoveredRow && hovered != null && <aside className={`nutripet-client-tooltip ${hovered < 2 ? 'align-start' : hovered > data.length - 3 ? 'align-end' : ''}`} style={{ left: `${x(hovered) / width * 100}%` }}><strong>{monthLabel(hoveredRow.month, true)}</strong><b>{number(hoveredRow.clients)}</b><span>clientes únicos</span><small>{exactKilos(hoveredRow.kilos)} kg · {money(hoveredRow.netAmount)}</small></aside>}</div>;
}

function QuarterChart({ report }: { report: BairesReportPayload }) {
  const max = Math.max(1, ...report.quarters.map((row) => row.kilos));
  return <div className="nutripet-quarter-grid">{report.quarters.map((row) => <article key={row.quarter}><div><span className={row.isPartial ? 'partial' : ''} style={{ height: `${Math.max(2, Math.abs(row.kilos) / max * 100)}%` }}><i>{kilos(row.kilos, true)}</i></span></div><h3>{row.quarter}</h3><p>{money(row.netAmount)} · {number(row.clients)} clientes{row.isPartial ? ' · parcial' : ''}</p></article>)}</div>;
}

function BreakdownTable({ rows, firstLabel, onOpenName }: { rows: BairesBreakdownRow[]; firstLabel: string; onOpenName?: (name: string) => void }) {
  type SortKey = 'name' | 'kilos' | 'clients' | 'share' | 'previousYearKilos' | 'variation';
  const [sort, setSort] = useState(emptySort<SortKey>());
  const sorted = sortItems(rows, sort, (row, key) => row[key]);
  const direction = (key: SortKey) => sort.key === key ? sort.direction : null;
  const change = (key: SortKey) => setSort((current) => cycleSort(current, key));
  return <div className="nutripet-brand-table" role="region" aria-label={`Detalle de Baires por ${firstLabel.toLocaleLowerCase('es')}`} tabIndex={0}><header><SortButton label={firstLabel} direction={direction('name')} onClick={() => change('name')} /><SortButton label="Kilos / facturación" direction={direction('kilos')} onClick={() => change('kilos')} /><SortButton label="Clientes" direction={direction('clients')} onClick={() => change('clients')} /><SortButton label="Participación" direction={direction('share')} onClick={() => change('share')} /><SortButton label="Año anterior" direction={direction('previousYearKilos')} onClick={() => change('previousYearKilos')} /><SortButton label="Variación" direction={direction('variation')} onClick={() => change('variation')} /></header>{sorted.map((row) => <article key={row.name}>{onOpenName ? <button className="entity-link" onClick={() => onOpenName(row.name)}>{row.name}</button> : <strong>{row.name}</strong>}<span><strong>{exactKilos(row.kilos)} kg</strong><small>{money(row.netAmount)}</small></span><span>{number(row.clients)}</span><span>{percent(row.share)}</span><span>{exactKilos(row.previousYearKilos)}</span><span className={row.variation != null && row.variation >= 0 ? 'positive' : 'negative'}>{percent(row.variation, true)}</span></article>)}</div>;
}

export function BairesReportView({ onOpenBrand }: { onOpenBrand: (brand: string) => void }) {
  const [meta, setMeta] = useState<BairesReportMeta | null>(null);
  const [filters, setFilters] = useState<BairesFilters>(EMPTY_FILTERS);
  const [report, setReport] = useState<BairesReportPayload | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { fetch('/api/reports/baires/meta').then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'No se pudo abrir el modelo Baires'); return payload as BairesReportMeta; }).then((payload) => { setMeta(payload); setFilters(reportFiltersFromLocation('baires', { ...EMPTY_FILTERS, year: payload.latestYear, month: payload.latestMonth.slice(5, 7) })); }).catch((cause: Error) => { setError(cause.message); setLoading(false); }); }, []);
  useEffect(() => { if (!meta || !filters.year || !filters.month) return; const controller = new AbortController(); const parameters = new URLSearchParams(); for (const [key, value] of Object.entries(filters)) if (value) parameters.set(key, value); setLoading(true); setError(''); fetch(`/api/reports/baires?${parameters}`, { signal: controller.signal }).then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'No se pudo calcular el reporte Baires'); return payload as BairesReportPayload; }).then(setReport).catch((cause: Error) => { if (cause.name !== 'AbortError') setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [filters, meta]);

  const advancedFilterCount = useMemo(() => (['brand', 'subcategory', 'branch'] as const).filter((key) => filters[key]).length, [filters]);
  const update = (key: keyof BairesFilters, value: string) => setFilters((current) => { if (key === 'year' && meta) { const available = meta.monthsByYear[value] ?? []; return { ...current, year: value, month: available.includes(current.month) ? current.month : available.at(-1) ?? current.month }; } return { ...current, [key]: value }; });
  if (!meta && loading) return <ReportState state="loading" title="Preparando Reporte Baires" detail="Reconstruyendo volumen, clientes y comparaciones desde GESI…" />;
  if (!meta || (!report && error)) return <ReportState state="error" title="No pudimos abrir Reporte Baires" detail={error} onRetry={() => location.reload()} />;
  if (!report) return <ReportState state="loading" title="Calculando Reporte Baires" detail="Aplicando el universo y los filtros seleccionados." />;

  const currentVsPrevious = variation(report.current.kilos, report.previousMonth.kilos);
  const currentVsYear = variation(report.current.kilos, report.previousYear.kilos);
  const ytdVsYear = variation(report.ytd.kilos, report.previousYtd.kilos);
  const clientVsPrevious = variation(report.current.clients, report.previousMonth.clients);
  const clientVsYear = variation(report.current.clients, report.previousYear.clients);
  const defaultFilters = { ...EMPTY_FILTERS, year: meta.latestYear, month: meta.latestMonth.slice(5, 7) };
  const selectedFilterCount = reportActiveFilterCount(filters, defaultFilters);
  const reset = () => setFilters(defaultFilters);
  const applySaved = (saved: Record<string, string>) => setFilters({
    year: saved.year || meta.latestYear, month: saved.month || meta.latestMonth.slice(5, 7), segment: saved.segment || '',
    brand: saved.brand || '', subcategory: saved.subcategory || '', branch: saved.branch || '',
  });

  return <div className="page-view nutripet-page baires-page">
    <BusinessReportFilters
      dataTour="baires-overview"
      kicker={<><PackageOpen size={14} /> Reporte Baires</>}
      title={<>Baires · {monthLabel(report.selectedMonth, true)}</>}
      description="Volumen y cobertura de Baires SPT y Baires Masivo calculados directamente desde GESI."
      primary={<><SingleSelectFilter label="Año" value={filters.year} options={meta.years} onChange={(value) => update('year', value)} /><SingleSelectFilter label="Mes" value={filters.month} options={(meta.monthsByYear[filters.year] ?? []).map((month) => ({ value: month, label: monthName(month) }))} onChange={(value) => update('month', value)} /><SelectFilter label={FILTER_LABELS.segment} value={filters.segment} options={meta.options.segment} onChange={(value) => update('segment', value)} /></>}
      advanced={<><SelectFilter label={FILTER_LABELS.brand} value={filters.brand} options={meta.options.brand} onChange={(value) => update('brand', value)} /><SelectFilter label={FILTER_LABELS.subcategory} value={filters.subcategory} options={meta.options.subcategory} onChange={(value) => update('subcategory', value)} /><SelectFilter label={FILTER_LABELS.branch} value={filters.branch} options={meta.options.branch} onChange={(value) => update('branch', value)} /><button className="button secondary" disabled={!selectedFilterCount} onClick={reset}><X size={14} /> Restablecer</button></>}
      activeFilterCount={advancedFilterCount}
      mobileActiveFilterCount={selectedFilterCount}
      expanded={expanded}
      onToggle={() => setExpanded((value) => !value)}
      loading={loading}
    >
      <ReportFilterActions view="baires" filters={{ ...filters }} defaults={defaultFilters} labels={{ year: { label: 'Año' }, month: { label: 'Mes', value: monthName }, ...Object.fromEntries(Object.entries(FILTER_LABELS).map(([key, label]) => [key, { label }])) }} onClear={(key) => update(key as keyof BairesFilters, key === 'year' ? meta.latestYear : key === 'month' ? meta.latestMonth.slice(5, 7) : '')} onReset={reset}><SavedViewsBar viewKey="baires" filters={{ ...filters }} onApply={applySaved} /></ReportFilterActions>
    </BusinessReportFilters>
    <ReportContext universe="Empresa 3 / sucursal 3 · grupos Baires SPT y Baires Masivo" period={`${report.periodStart} → ${report.periodEnd}`} cutoff={report.sourceMaxDate} comparison={report.comparisonAvailable ? 'Mes anterior, mismo mes del año anterior y acumulado equivalente' : 'Comparación fuera de cobertura'} partial={report.isPartial} warnings={meta.unavailableDocumentCount ? [`${meta.unavailableDocumentCount} comprobantes sin detalle.`] : []} related={[{ view: 'commercial-sales', label: 'Abrir Ventas Comercial' }]} exports={<ReportExportActions links={[{ href: reportExportUrl('baires', filters), label: 'Exportar informe', kind: 'xlsx' }]} />} />
    <AiNarrativeCard artifact={report.aiNarrative} />
    {!report.current.clients && !report.current.kilos && <ReportEmptyNotice />}
    <BusinessReportPeriodNote partial={report.isPartial} title={`${monthLabel(report.selectedMonth, true)} · corte al ${report.periodEnd.split('-').reverse().join('/')}`} detail={report.isPartial ? `Mes en curso: ${report.elapsedDays} días. Mes anterior, año anterior y acumulado usan el mismo día de corte.` : 'Mes completo. Las comparaciones usan períodos calendario equivalentes.'} />
    <BusinessReportKpis items={[
      { label: 'Kilos / facturación', value: <>{kilos(report.current.kilos)} kg</>, detail: `${money(report.current.netAmount)} · ${number(report.current.units)} unidades`, icon: <Scale size={20} />, tone: 'green' },
      { label: 'Mes anterior comparable', value: <>{kilos(report.previousMonth.kilos)} kg</>, detail: `${money(report.previousMonth.netAmount)} · ${percent(currentVsPrevious, true)}`, icon: currentVsPrevious != null && currentVsPrevious >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />, tone: currentVsPrevious != null && currentVsPrevious >= 0 ? 'green' : 'ochre' },
      { label: 'Mismo mes año anterior', value: <>{kilos(report.previousYear.kilos)} kg</>, detail: `${money(report.previousYear.netAmount)} · ${percent(currentVsYear, true)}`, icon: <BarChart3 size={20} />, tone: 'blue' },
      { label: 'Kilos / facturación acumulados', value: <>{kilos(report.ytd.kilos)} kg</>, detail: `${money(report.ytd.netAmount)} · ${percent(ytdVsYear, true)} vs año anterior`, icon: <CalendarRange size={20} />, tone: 'green' },
      { label: 'Clientes del mes', value: number(report.current.clients), detail: `${percent(clientVsPrevious, true)} vs mes anterior`, icon: <Users size={20} />, tone: 'blue' },
      { label: 'Clientes año anterior', value: number(report.previousYear.clients), detail: `${percent(clientVsYear, true)} variación actual`, icon: <Users size={20} />, tone: 'ochre' },
    ]} />
    <section className="data-card nutripet-evolution-card"><div className="data-card-header"><div><span className="section-kicker"><TrendingUp size={14} /> Evolución</span><h2>Volumen y acumulado interanual</h2><p>Últimos 13 meses disponibles. Barras en kilos y línea acumulada contra el año anterior.</p></div><div className="nutripet-legend"><span><i />Volumen</span><span><i className="ratio" />Acumulado vs año anterior</span><span><i className="partial" />Mes parcial</span></div></div><EvolutionChart report={report} /></section>
    <div className="nutripet-secondary-grid"><section className="data-card nutripet-client-card"><div className="data-card-header"><div><span className="section-kicker"><Users size={14} /> Cobertura</span><h2>Clientes por mes</h2><p>Cada cliente se cuenta una sola vez por mes.</p></div></div><ClientChart rows={report.monthly} /></section><section className="data-card nutripet-quarter-card"><div className="data-card-header"><div><span className="section-kicker"><CalendarRange size={14} /> Trimestres</span><h2>Volumen por trimestre · {filters.year}</h2><p>El mes seleccionado no limita esta vista anual.</p></div></div><QuarterChart report={report} /></section></div>
    <section className="data-card nutripet-brand-card"><div className="data-card-header"><div><span className="section-kicker"><Store size={14} /> Marcas</span><h2>Mix del mes seleccionado</h2><p>Volumen y comparación contra el mismo corte del año anterior.</p></div><span className="count-badge">{number(report.brands.length)} marcas</span></div><BreakdownTable rows={report.brands} firstLabel="Marca" onOpenName={onOpenBrand} /></section>
    <section className="data-card nutripet-product-card"><div className="data-card-header"><div><span className="section-kicker"><PackageOpen size={14} /> Subrubros</span><h2>Composición del mes seleccionado</h2><p>Seleccioná cualquier encabezado para alternar orden ascendente, descendente y original.</p></div><span className="count-badge">{number(report.subcategories.length)} subrubros</span></div><BreakdownTable rows={report.subcategories} firstLabel="Subrubro" /></section>
    <BusinessReportSourceNote source={meta.sourceSystem}>{number(meta.rowCount)} movimientos Baires · cobertura GESI {meta.coverageFrom} a {meta.maxDate} · empresa 3 / sucursal 3 · grupos Baires SPT y Baires Masivo · excluye rubro POP y Via Salice MDP S.A.{meta.unavailableDocumentCount ? ` GESI no entregó el detalle de ${number(meta.unavailableDocumentCount)} de ${number(meta.sourceDocumentCount)} comprobantes; quedan identificados para el próximo refresco.` : ''} El PBIX se usa sólo como referencia funcional y de conciliación.</BusinessReportSourceNote>
  </div>;
}
