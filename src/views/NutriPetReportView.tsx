import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarRange, ChevronRight, PackageSearch, Scale, ShoppingBag, TrendingDown, TrendingUp, Users, X } from 'lucide-react';
import type { NutriPetBrandRow, NutriPetFilterKey, NutriPetFilters, NutriPetMonthlyPoint, NutriPetProductRow, NutriPetReportMeta, NutriPetReportPayload } from '../../shared/models';
import { decodeMultiFilter, multiFilterLabel } from '../../shared/multi-filter';
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

const EMPTY_FILTERS: NutriPetFilters = {
  year: '', month: '', channelGroup: 'Especializado', brand: '', product: '', line: '', client: '', grouping: '', category: '',
};

const FILTER_LABELS: Record<NutriPetFilterKey, string> = {
  channelGroup: 'Canal de venta', brand: 'Marca', product: 'Producto', line: 'Línea', client: 'Cliente', grouping: 'Agrupación', category: 'Rubro',
};

const kilos = (value: number, compact = false) => compact ? compactNumber(value) : number(value, 2);
const exactKilos = (value: number) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value);
const money = (value: number) => formatMoney(value, true);
const percent = (value: number | null, signed = false) => value == null
  ? 'Sin base'
  : `${signed && value > 0 ? '+' : ''}${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value)}%`;
const variation = (current: number, previous: number) => previous ? (current - previous) / previous * 100 : null;
const monthLabel = (value: string, long = false) => new Intl.DateTimeFormat('es-AR', { month: long ? 'long' : 'short', year: '2-digit' })
  .format(new Date(`${value}-15T12:00:00Z`)).replaceAll('.', '');
const monthName = (value: string) => new Intl.DateTimeFormat('es-AR', { month: 'long' })
  .format(new Date(`2026-${value}-15T12:00:00Z`)).replaceAll('.', '');

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <MultiSelectFilter label={label} value={value} options={options} onChange={onChange} />;
}

function EvolutionChart({ report }: { report: NutriPetReportPayload }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const width = 920;
  const height = 310;
  const inset = { left: 63, right: 64, top: 23, bottom: 42 };
  const chartWidth = width - inset.left - inset.right;
  const chartHeight = height - inset.top - inset.bottom;
  const maxKilos = Math.max(1, ...report.monthly.map((row) => row.kilos));
  const minKilos = Math.min(0, ...report.monthly.map((row) => row.kilos));
  const kiloRange = Math.max(1, maxKilos - minKilos);
  const ratios = report.monthly.flatMap((row) => row.ytdVsPreviousYear == null ? [] : [row.ytdVsPreviousYear]);
  const minRatio = Math.min(0, ...ratios);
  const maxRatio = Math.max(120, ...ratios);
  const ratioRange = Math.max(1, maxRatio - minRatio);
  const step = chartWidth / Math.max(1, report.monthly.length);
  const x = (index: number) => inset.left + step * index + step / 2;
  const yKilos = (value: number) => inset.top + chartHeight - (value - minKilos) / kiloRange * chartHeight;
  const yRatio = (value: number) => inset.top + chartHeight - (value - minRatio) / ratioRange * chartHeight;
  const zeroY = yKilos(0);
  const linePoints = report.monthly.flatMap((row, index) => row.ytdVsPreviousYear == null ? [] : [`${x(index)},${yRatio(row.ytdVsPreviousYear)}`]).join(' ');
  const hoveredRow = hovered == null ? null : report.monthly[hovered];
  return <div className="nutripet-chart-stage" onMouseLeave={() => setHovered(null)}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Volumen NutriPet de los últimos trece meses y acumulado contra el año anterior">
      {[0, .25, .5, .75, 1].map((ratioValue) => {
        const value = minKilos + kiloRange * ratioValue;
        return <g key={ratioValue}><line x1={inset.left} x2={width - inset.right} y1={yKilos(value)} y2={yKilos(value)} className="nutripet-grid-line" />{ratioValue > 0 && <text x={inset.left - 10} y={yKilos(value) + 4} textAnchor="end">{kilos(value, true)}</text>}</g>;
      })}
      {[0, 100].map((value) => <text key={value} x={width - inset.right + 9} y={yRatio(value) + 4}>{value}%</text>)}
      <line x1={inset.left} x2={width - inset.right} y1={zeroY} y2={zeroY} className="nutripet-zero-line" />
      {report.monthly.map((row, index) => {
        const barWidth = Math.min(43, step * .62);
        const barY = row.kilos >= 0 ? yKilos(row.kilos) : zeroY;
        const barHeight = Math.max(1, Math.abs(zeroY - yKilos(row.kilos)));
        return <g key={row.month} className="nutripet-chart-hit" tabIndex={0} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} aria-label={`${monthLabel(row.month, true)}: ${exactKilos(row.kilos)} kilos`}>
          <rect x={x(index) - step / 2} y={inset.top} width={step} height={chartHeight} fill="transparent" />
          <rect x={x(index) - barWidth / 2} y={barY} width={barWidth} height={barHeight} rx="5" className={row.isPartial ? 'nutripet-volume-bar partial' : row.kilos < 0 ? 'nutripet-volume-bar negative' : 'nutripet-volume-bar'} />
          <text x={x(index)} y={height - 13} textAnchor="middle">{monthLabel(row.month)}</text>
        </g>;
      })}
      {linePoints && <polyline points={linePoints} className="nutripet-ratio-line" />}
      {report.monthly.map((row, index) => row.ytdVsPreviousYear == null ? null : <circle key={row.month} cx={x(index)} cy={yRatio(row.ytdVsPreviousYear)} r={hovered === index ? 5 : 3.8} className="nutripet-ratio-dot" />)}
      {hovered != null && <line x1={x(hovered)} x2={x(hovered)} y1={inset.top} y2={inset.top + chartHeight} className="nutripet-hover-line" />}
    </svg>
    {hoveredRow && hovered != null && <aside className={`nutripet-chart-tooltip ${hovered < 2 ? 'align-start' : hovered > report.monthly.length - 3 ? 'align-end' : ''}`} style={{ left: `${x(hovered) / width * 100}%` }}>
      <strong>{monthLabel(hoveredRow.month, true)}{hoveredRow.isPartial ? ' · parcial' : ''}</strong>
      <span><i className="volume" /><div><small>Volumen</small><b>{exactKilos(hoveredRow.kilos)} kg</b></div></span>
      <span><i className="sales" /><div><small>Facturación neta</small><b>{money(hoveredRow.netAmount)}</b></div></span>
      <span><i className="ratio" /><div><small>Acumulado vs año anterior</small><b>{percent(hoveredRow.ytdVsPreviousYear)}</b></div></span>
      <div><span>{number(hoveredRow.clients)} clientes</span><span>{percent(hoveredRow.vsPreviousMonth == null ? null : hoveredRow.vsPreviousMonth - 100, true)} vs mes anterior</span><span>{percent(hoveredRow.vsPreviousYear == null ? null : hoveredRow.vsPreviousYear - 100, true)} vs año anterior</span></div>
    </aside>}
  </div>;
}

function ClientChart({ rows }: { rows: NutriPetMonthlyPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const data = rows.slice(-12);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(520);
  const height = 310;
  const inset = { left: 45, right: 22, top: 21, bottom: 52 };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const updateWidth = () => setWidth(Math.max(320, Math.round(svg.getBoundingClientRect().width)));
    const observer = new ResizeObserver(updateWidth);
    observer.observe(svg);
    updateWidth();
    return () => observer.disconnect();
  }, []);
  const max = Math.max(1, ...data.map((row) => row.clients));
  const chartWidth = width - inset.left - inset.right;
  const chartHeight = height - inset.top - inset.bottom;
  const step = chartWidth / Math.max(1, data.length - 1);
  const x = (index: number) => inset.left + (data.length === 1 ? chartWidth / 2 : step * index);
  const y = (value: number) => inset.top + chartHeight - value / max * chartHeight;
  const points = data.map((row, index) => `${x(index)},${y(row.clients)}`).join(' ');
  const hoveredRow = hovered == null ? null : data[hovered];
  return <div className="nutripet-client-stage" onMouseLeave={() => setHovered(null)}>
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Clientes NutriPet por mes"
      onMouseMove={(event) => {
        if (!data.length) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const pointerX = (event.clientX - rect.left) / rect.width * width;
        const nearest = data.length === 1 ? 0 : Math.round((pointerX - inset.left) / step);
        setHovered(Math.max(0, Math.min(data.length - 1, nearest)));
      }}
    >
      {[0, .5, 1].map((ratioValue) => <g key={ratioValue}><line x1={inset.left} x2={width - inset.right} y1={y(max * ratioValue)} y2={y(max * ratioValue)} className="nutripet-grid-line" />{ratioValue > 0 && <text x={inset.left - 8} y={y(max * ratioValue) + 4} textAnchor="end">{Math.round(max * ratioValue)}</text>}</g>)}
      <polyline points={points} className="nutripet-client-line" />
      {data.map((row, index) => <g key={row.month} className="nutripet-chart-hit" tabIndex={0} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} aria-label={`${monthLabel(row.month, true)}: ${number(row.clients)} clientes`}><circle cx={x(index)} cy={y(row.clients)} r={hovered === index ? 6 : 4.5} className={row.isPartial ? 'nutripet-client-dot partial' : 'nutripet-client-dot'} /><text className="nutripet-client-month-label" x={x(index)} y={height - 18} textAnchor="middle">{monthLabel(row.month)}</text></g>)}
      {hovered != null && <line x1={x(hovered)} x2={x(hovered)} y1={inset.top} y2={inset.top + chartHeight} className="nutripet-hover-line" />}
    </svg>
    {hoveredRow && hovered != null && <aside className={`nutripet-client-tooltip ${hovered < 2 ? 'align-start' : hovered > data.length - 3 ? 'align-end' : ''}`} style={{ left: `${x(hovered) / width * 100}%` }}><strong>{monthLabel(hoveredRow.month, true)}</strong><b>{number(hoveredRow.clients)}</b><span>clientes únicos</span><small>{exactKilos(hoveredRow.kilos)} kg · {money(hoveredRow.netAmount)}</small></aside>}
  </div>;
}

function QuarterChart({ report }: { report: NutriPetReportPayload }) {
  const max = Math.max(1, ...report.quarters.map((row) => row.kilos));
  return <div className="nutripet-quarter-grid">{report.quarters.map((row) => <article key={row.quarter}><div><span className={row.isPartial ? 'partial' : ''} style={{ height: `${Math.max(2, Math.abs(row.kilos) / max * 100)}%` }}><i>{kilos(row.kilos, true)}</i></span></div><h3>{row.quarter}</h3><p>{money(row.netAmount)} · {number(row.clients)} clientes{row.isPartial ? ' · parcial' : ''}</p></article>)}</div>;
}

function BrandTable({ rows, onOpenBrand }: { rows: NutriPetBrandRow[]; onOpenBrand: (brand: string) => void }) {
  type SortKey = 'brand' | 'kilos' | 'clients' | 'share' | 'previousYearKilos' | 'variation';
  const [sort, setSort] = useState(emptySort<SortKey>());
  const sorted = sortItems(rows, sort, (row, key) => row[key]);
  const direction = (key: SortKey) => sort.key === key ? sort.direction : null;
  const change = (key: SortKey) => setSort((current) => cycleSort(current, key));
  return <div className="nutripet-brand-table" role="region" aria-label="Detalle por marca NutriPet" tabIndex={0}><header><SortButton label="Marca" direction={direction('brand')} onClick={() => change('brand')} /><SortButton label="Kilos / facturación" direction={direction('kilos')} onClick={() => change('kilos')} /><SortButton label="Clientes" direction={direction('clients')} onClick={() => change('clients')} /><SortButton label="Participación" direction={direction('share')} onClick={() => change('share')} /><SortButton label="Año anterior" direction={direction('previousYearKilos')} onClick={() => change('previousYearKilos')} /><SortButton label="Variación" direction={direction('variation')} onClick={() => change('variation')} /></header>{sorted.map((row) => <article key={row.brand}><button className="entity-link" onClick={() => onOpenBrand(row.brand)}>{row.brand}</button><span><strong>{exactKilos(row.kilos)} kg</strong><small>{money(row.netAmount)}</small></span><span>{number(row.clients)}</span><span>{percent(row.share)}</span><span>{exactKilos(row.previousYearKilos)}</span><span className={row.variation != null && row.variation >= 0 ? 'positive' : 'negative'}>{percent(row.variation, true)}</span></article>)}</div>;
}

function ProductTable({ rows, onOpenProduct, onOpenBrand }: { rows: NutriPetProductRow[]; onOpenProduct: (productId: string) => void; onOpenBrand: (brand: string) => void }) {
  type SortKey = 'product' | 'brand' | 'kilos' | 'clients' | 'units' | 'share';
  const [sort, setSort] = useState(emptySort<SortKey>());
  const sorted = sortItems(rows, sort, (row, key) => row[key]);
  const direction = (key: SortKey) => sort.key === key ? sort.direction : null;
  const change = (key: SortKey) => setSort((current) => cycleSort(current, key));
  return <div className="nutripet-product-table" role="region" aria-label="Detalle por producto NutriPet" tabIndex={0}><header><SortButton label="Producto" direction={direction('product')} onClick={() => change('product')} /><SortButton label="Marca" direction={direction('brand')} onClick={() => change('brand')} /><SortButton label="Kilos / facturación" direction={direction('kilos')} onClick={() => change('kilos')} /><SortButton label="Clientes" direction={direction('clients')} onClick={() => change('clients')} /><SortButton label="Unidades" direction={direction('units')} onClick={() => change('units')} /><SortButton label="Participación" direction={direction('share')} onClick={() => change('share')} /></header>{sorted.map((row) => <article key={`${row.productId}:${row.brand}`}><button className="entity-link product-entity-link" onClick={() => onOpenProduct(row.productId)}>{row.product}<ChevronRight size={12} /></button><button className="entity-link" onClick={() => onOpenBrand(row.brand)}>{row.brand}</button><span><strong>{exactKilos(row.kilos)} kg</strong><small>{money(row.netAmount)}</small></span><span>{number(row.clients)}</span><span>{number(row.units)}</span><span>{percent(row.share)}</span></article>)}</div>;
}

export function NutriPetReportView({ onOpenProduct, onOpenBrand }: { onOpenProduct: (productId: string) => void; onOpenBrand: (brand: string) => void }) {
  const [meta, setMeta] = useState<NutriPetReportMeta | null>(null);
  const [filters, setFilters] = useState<NutriPetFilters>(EMPTY_FILTERS);
  const [report, setReport] = useState<NutriPetReportPayload | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/reports/nutripet/meta').then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo abrir el modelo NutriPet');
      return payload as NutriPetReportMeta;
    }).then((payload) => {
      setMeta(payload);
      setFilters(reportFiltersFromLocation('nutripet', { ...EMPTY_FILTERS, year: payload.latestYear, month: payload.latestMonth.slice(5, 7) }));
    }).catch((cause: Error) => { setError(cause.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!meta || !filters.year || !filters.month) return;
    const controller = new AbortController();
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) parameters.set(key, value);
    setLoading(true);
    setError('');
    fetch(`/api/reports/nutripet?${parameters}`, { signal: controller.signal }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo calcular el reporte NutriPet');
      return payload as NutriPetReportPayload;
    }).then(setReport).catch((cause: Error) => { if (cause.name !== 'AbortError') setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, meta]);

  const advancedFilterCount = useMemo(() => (['brand', 'product', 'line', 'client', 'grouping', 'category'] as const).filter((key) => filters[key]).length, [filters]);
  const update = (key: keyof NutriPetFilters, value: string) => setFilters((current) => {
    if (key === 'year' && meta) {
      const available = meta.monthsByYear[value] ?? [];
      return { ...current, year: value, month: available.includes(current.month) ? current.month : available.at(-1) ?? current.month };
    }
    return { ...current, [key]: value };
  });

  if (!meta && loading) return <ReportState state="loading" title="Preparando Reporte NutriPet" detail="Reconstruyendo ventas, clientes y comparaciones desde GESI…" />;
  if (!meta || (!report && error)) return <ReportState state="error" title="No pudimos abrir Reporte NutriPet" detail={error} onRetry={() => location.reload()} />;
  if (!report) return <ReportState state="loading" title="Calculando el reporte NutriPet" detail="Aplicando el universo y los filtros seleccionados." />;

  const currentVsPrevious = variation(report.current.kilos, report.previousMonth.kilos);
  const currentVsYear = variation(report.current.kilos, report.previousYear.kilos);
  const ytdVsYear = variation(report.ytd.kilos, report.previousYtd.kilos);
  const clientYtdVariation = variation(report.ytd.clients, report.previousYtd.clients);
  const filterKeys: NutriPetFilterKey[] = ['brand', 'product', 'line', 'client', 'grouping', 'category'];
  const defaultFilters: NutriPetFilters = { ...EMPTY_FILTERS, year: meta.latestYear, month: meta.latestMonth.slice(5, 7) };
  const selectedFilterCount = reportActiveFilterCount(filters, defaultFilters);
  const selectedChannels = decodeMultiFilter(report.filters.channelGroup);
  const channelUniverse = selectedChannels.length === 0
    ? 'todos los canales de venta'
    : selectedChannels.length === 1
      ? `canal ${selectedChannels[0]}`
      : `canales ${selectedChannels.join(', ')}`;
  const reset = () => setFilters(defaultFilters);
  const applySaved = (saved: Record<string, string>) => setFilters({
    year: saved.year || meta.latestYear, month: saved.month || meta.latestMonth.slice(5, 7),
    channelGroup: saved.channelGroup ?? 'Especializado', brand: saved.brand || '', product: saved.product || '',
    line: saved.line || '', client: saved.client || '', grouping: saved.grouping || '', category: saved.category || '',
  });

  return <div className="page-view nutripet-page">
    <BusinessReportFilters
      dataTour="nutripet-overview"
      kicker={<><ShoppingBag size={14} /> Reporte NutriPet</>}
      title={<>Nutri Pet · {monthLabel(report.selectedMonth, true)}</>}
      description="Volumen y cobertura del proveedor calculados directamente sobre facturas y notas de crédito de GESI."
      primary={<><SingleSelectFilter label="Año" value={filters.year} options={meta.years} onChange={(value) => update('year', value)} /><SingleSelectFilter label="Mes" value={filters.month} options={(meta.monthsByYear[filters.year] ?? []).map((month) => ({ value: month, label: monthName(month) }))} onChange={(value) => update('month', value)} /><SelectFilter label={FILTER_LABELS.channelGroup} value={filters.channelGroup} options={meta.options.channelGroup} onChange={(value) => update('channelGroup', value)} /></>}
      advanced={<>{filterKeys.map((key) => <SelectFilter key={key} label={FILTER_LABELS[key]} value={filters[key]} options={meta.options[key]} onChange={(value) => update(key, value)} />)}<button className="button secondary" disabled={!selectedFilterCount} onClick={reset}><X size={14} /> Restablecer</button></>}
      activeFilterCount={advancedFilterCount}
      mobileActiveFilterCount={selectedFilterCount}
      expanded={expanded}
      onToggle={() => setExpanded((value) => !value)}
      loading={loading}
    >
      <ReportFilterActions view="nutripet" filters={{ ...filters }} defaults={defaultFilters} labels={{ year: { label: 'Año' }, month: { label: 'Mes', value: monthName }, ...Object.fromEntries(Object.entries(FILTER_LABELS).map(([key, label]) => [key, { label }])), channelGroup: { label: FILTER_LABELS.channelGroup, value: (value) => multiFilterLabel(value, 'Todos los canales') } }} onClear={(key) => update(key as keyof NutriPetFilters, key === 'year' ? meta.latestYear : key === 'month' ? meta.latestMonth.slice(5, 7) : key === 'channelGroup' ? 'Especializado' : '')} onReset={reset}><SavedViewsBar viewKey="nutripet" filters={{ ...filters }} onApply={applySaved} /></ReportFilterActions>
    </BusinessReportFilters>

    <ReportContext universe={`Empresa 3 / sucursal 3 · grupo Nutri Pet · ${channelUniverse}`} period={`${report.periodStart} → ${report.periodEnd}`} cutoff={report.sourceMaxDate} comparison={report.comparisonAvailable ? 'Mes anterior, mismo mes del año anterior y acumulado equivalente' : 'Comparación fuera de cobertura'} partial={report.isPartial} warnings={meta.unavailableDocumentCount ? [`${meta.unavailableDocumentCount} comprobantes sin detalle.`] : []} related={[{ view: 'commercial-sales', label: 'Abrir Ventas Comercial' }]} exports={<ReportExportActions links={[{ href: reportExportUrl('nutripet', filters), label: 'Exportar informe', kind: 'xlsx' }]} />} />
    <AiNarrativeCard artifact={report.aiNarrative} />
    {!report.current.clients && !report.current.kilos && <ReportEmptyNotice />}

    <BusinessReportPeriodNote partial={report.isPartial} title={`${monthLabel(report.selectedMonth, true)} · corte al ${report.periodEnd.split('-').reverse().join('/')}`} detail={report.isPartial ? `Mes en curso: ${report.elapsedDays} días. Mes anterior, año anterior y acumulado se comparan usando el mismo día de corte.` : 'Mes completo. Las comparaciones usan períodos calendario equivalentes.'} />

    <BusinessReportKpis items={[
      { label: 'Kilos / facturación', value: <>{kilos(report.current.kilos)} kg</>, detail: `${money(report.current.netAmount)} · ${number(report.current.clients)} clientes`, icon: <Scale size={20} />, tone: 'green' },
      { label: 'Mes anterior comparable', value: <>{kilos(report.previousMonth.kilos)} kg</>, detail: `${money(report.previousMonth.netAmount)} · ${percent(currentVsPrevious, true)}`, icon: currentVsPrevious != null && currentVsPrevious >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />, tone: currentVsPrevious != null && currentVsPrevious >= 0 ? 'green' : 'ochre' },
      { label: 'Mismo mes año anterior', value: <>{kilos(report.previousYear.kilos)} kg</>, detail: `${money(report.previousYear.netAmount)} · ${percent(currentVsYear, true)}`, icon: <BarChart3 size={20} />, tone: 'blue' },
      { label: 'Kilos / facturación acumulados', value: <>{kilos(report.ytd.kilos)} kg</>, detail: `${money(report.ytd.netAmount)} · ${percent(ytdVsYear, true)} vs año anterior`, icon: <CalendarRange size={20} />, tone: 'green' },
      { label: 'Clientes del mes', value: number(report.current.clients), detail: `${number(report.current.units)} unidades`, icon: <Users size={20} />, tone: 'blue' },
      { label: 'Clientes acumulados', value: number(report.ytd.clients), detail: `${percent(clientYtdVariation, true)} · ${number(report.previousYtd.clients)} año anterior`, icon: <Users size={20} />, tone: 'ochre' },
    ]} />

    <section className="data-card nutripet-evolution-card"><div className="data-card-header"><div><span className="section-kicker"><TrendingUp size={14} /> Evolución</span><h2>Volumen y acumulado interanual</h2><p>Últimos 13 meses disponibles. Las barras muestran kilos y la línea el acumulado contra el año anterior.</p></div><div className="nutripet-legend"><span><i />Volumen</span><span><i className="ratio" />Acumulado vs año anterior</span><span><i className="partial" />Mes parcial</span></div></div><EvolutionChart report={report} /></section>

    <div className="nutripet-secondary-grid"><section className="data-card nutripet-client-card"><div className="data-card-header"><div><span className="section-kicker"><Users size={14} /> Cobertura</span><h2>Clientes por mes</h2><p>Cada cliente se cuenta una sola vez por mes.</p></div></div><ClientChart rows={report.monthly} /></section><section className="data-card nutripet-quarter-card"><div className="data-card-header"><div><span className="section-kicker"><CalendarRange size={14} /> Trimestres</span><h2>Volumen por trimestre · {filters.year}</h2><p>El mes seleccionado no limita esta vista anual.</p></div></div><QuarterChart report={report} /></section></div>

    <section className="data-card nutripet-brand-card"><div className="data-card-header"><div><span className="section-kicker"><ShoppingBag size={14} /> Marcas</span><h2>Mix del mes seleccionado</h2><p>Volumen y comparación contra el mismo corte del año anterior.</p></div><span className="count-badge">{number(report.brands.length)} marcas</span></div><BrandTable rows={report.brands} onOpenBrand={onOpenBrand} /></section>

    <section className="data-card nutripet-product-card"><div className="data-card-header"><div><span className="section-kicker"><PackageSearch size={14} /> Detalle auditable</span><h2>Productos del mes seleccionado</h2><p>Seleccioná cualquier encabezado para alternar orden ascendente, descendente y original.</p></div><span className="count-badge">{number(report.products.length)} productos</span></div><ProductTable rows={report.products} onOpenProduct={onOpenProduct} onOpenBrand={onOpenBrand} /></section>

    <BusinessReportSourceNote source={meta.sourceSystem}>{number(meta.rowCount)} movimientos NutriPet · cobertura GESI {meta.coverageFrom} a {meta.maxDate} · empresa 3 / sucursal 3 · grupo Nutri Pet · excluye rubro POP y Via Salice MDP S.A.{meta.unavailableDocumentCount ? ` GESI no entregó el detalle de ${number(meta.unavailableDocumentCount)} de ${number(meta.sourceDocumentCount)} comprobantes; quedan identificados para el próximo refresco.` : ''} El PBIX se usa sólo como referencia funcional y de conciliación.</BusinessReportSourceNote>
  </div>;
}
