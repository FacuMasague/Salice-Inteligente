import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarRange, ChevronDown, ChevronRight, Database, Filter, PackageSearch, RefreshCw, Scale, ShoppingBag, TrendingDown, TrendingUp, Users, X } from 'lucide-react';
import type { NutriPetBrandRow, NutriPetFilterKey, NutriPetFilters, NutriPetMonthlyPoint, NutriPetProductRow, NutriPetReportMeta, NutriPetReportPayload } from '../../shared/models';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SingleSelectFilter } from '../components/SingleSelectFilter';
import { SortButton } from '../components/SortButton';
import { number } from '../lib/format';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';

const EMPTY_FILTERS: NutriPetFilters = {
  year: '', month: '', channelGroup: 'Especializado', brand: '', product: '', line: '', client: '', grouping: '', category: '',
};

const FILTER_LABELS: Record<NutriPetFilterKey, string> = {
  channelGroup: 'Canal de venta', brand: 'Marca', product: 'Producto', line: 'Línea', client: 'Cliente', grouping: 'Agrupación', category: 'Rubro',
};

const kilos = (value: number, compact = false) => new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: compact ? 1 : 2,
  notation: compact ? 'compact' : 'standard',
}).format(value);
const exactKilos = (value: number) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value);
const money = (value: number) => `$${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1, notation: 'compact' }).format(value)}`;
const percent = (value: number | null, signed = false) => value == null
  ? 'Sin base'
  : `${signed && value > 0 ? '+' : ''}${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value)}%`;
const variation = (current: number, previous: number) => previous ? (current - previous) / previous * 100 : null;
const monthLabel = (value: string, long = false) => new Intl.DateTimeFormat('es-AR', { month: long ? 'long' : 'short', year: '2-digit' })
  .format(new Date(`${value}-15T12:00:00Z`)).replaceAll('.', '');
const monthName = (value: string) => new Intl.DateTimeFormat('es-AR', { month: 'long' })
  .format(new Date(`2026-${value}-15T12:00:00Z`)).replaceAll('.', '');
const monthNumericLabel = (value: string) => `${value.slice(5, 7)}/${value.slice(2, 4)}`;

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
      <span><i className="ratio" /><div><small>YTD vs año anterior</small><b>{percent(hoveredRow.ytdVsPreviousYear)}</b></div></span>
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
  const inset = { left: 45, right: 18, top: 21, bottom: 38 };
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
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Clientes NutriPet por mes">
      {[0, .5, 1].map((ratioValue) => <g key={ratioValue}><line x1={inset.left} x2={width - inset.right} y1={y(max * ratioValue)} y2={y(max * ratioValue)} className="nutripet-grid-line" />{ratioValue > 0 && <text x={inset.left - 8} y={y(max * ratioValue) + 4} textAnchor="end">{Math.round(max * ratioValue)}</text>}</g>)}
      <polyline points={points} className="nutripet-client-line" />
      {data.map((row, index) => <g key={row.month} className="nutripet-chart-hit" tabIndex={0} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)}><circle cx={x(index)} cy={y(row.clients)} r={hovered === index ? 6 : 4.5} className={row.isPartial ? 'nutripet-client-dot partial' : 'nutripet-client-dot'} /><text x={x(index)} y={height - 12} textAnchor="middle">{monthNumericLabel(row.month)}</text></g>)}
      {hovered != null && <line x1={x(hovered)} x2={x(hovered)} y1={inset.top} y2={inset.top + chartHeight} className="nutripet-hover-line" />}
    </svg>
    {hoveredRow && hovered != null && <aside className={`nutripet-client-tooltip ${hovered < 2 ? 'align-start' : hovered > data.length - 3 ? 'align-end' : ''}`} style={{ left: `${x(hovered) / width * 100}%` }}><strong>{monthLabel(hoveredRow.month, true)}</strong><b>{number(hoveredRow.clients)}</b><span>clientes únicos</span><small>{exactKilos(hoveredRow.kilos)} kg</small></aside>}
  </div>;
}

function QuarterChart({ report }: { report: NutriPetReportPayload }) {
  const max = Math.max(1, ...report.quarters.map((row) => row.kilos));
  return <div className="nutripet-quarter-grid">{report.quarters.map((row) => <article key={row.quarter}><div><span className={row.isPartial ? 'partial' : ''} style={{ height: `${Math.max(2, Math.abs(row.kilos) / max * 100)}%` }}><i>{kilos(row.kilos, true)}</i></span></div><h3>{row.quarter}</h3><p>{number(row.clients)} clientes{row.isPartial ? ' · parcial' : ''}</p></article>)}</div>;
}

function BrandTable({ rows }: { rows: NutriPetBrandRow[] }) {
  type SortKey = 'brand' | 'kilos' | 'clients' | 'share' | 'previousYearKilos' | 'variation';
  const [sort, setSort] = useState(emptySort<SortKey>());
  const sorted = sortItems(rows, sort, (row, key) => row[key]);
  const direction = (key: SortKey) => sort.key === key ? sort.direction : null;
  const change = (key: SortKey) => setSort((current) => cycleSort(current, key));
  return <div className="nutripet-brand-table"><header><SortButton label="Marca" direction={direction('brand')} onClick={() => change('brand')} /><SortButton label="Kilos" direction={direction('kilos')} onClick={() => change('kilos')} /><SortButton label="Clientes" direction={direction('clients')} onClick={() => change('clients')} /><SortButton label="Participación" direction={direction('share')} onClick={() => change('share')} /><SortButton label="Año anterior comparable" direction={direction('previousYearKilos')} onClick={() => change('previousYearKilos')} /><SortButton label="Variación" direction={direction('variation')} onClick={() => change('variation')} /></header>{sorted.map((row) => <article key={row.brand}><strong>{row.brand}</strong><span>{exactKilos(row.kilos)}</span><span>{number(row.clients)}</span><span>{percent(row.share)}</span><span>{exactKilos(row.previousYearKilos)}</span><span className={row.variation != null && row.variation >= 0 ? 'positive' : 'negative'}>{percent(row.variation, true)}</span></article>)}</div>;
}

function ProductTable({ rows, onOpenProduct }: { rows: NutriPetProductRow[]; onOpenProduct: (productId: string) => void }) {
  type SortKey = 'product' | 'brand' | 'kilos' | 'clients' | 'units' | 'share';
  const [sort, setSort] = useState(emptySort<SortKey>());
  const sorted = sortItems(rows, sort, (row, key) => row[key]);
  const direction = (key: SortKey) => sort.key === key ? sort.direction : null;
  const change = (key: SortKey) => setSort((current) => cycleSort(current, key));
  return <div className="nutripet-product-table"><header><SortButton label="Producto" direction={direction('product')} onClick={() => change('product')} /><SortButton label="Marca" direction={direction('brand')} onClick={() => change('brand')} /><SortButton label="Kilos" direction={direction('kilos')} onClick={() => change('kilos')} /><SortButton label="Clientes" direction={direction('clients')} onClick={() => change('clients')} /><SortButton label="Unidades" direction={direction('units')} onClick={() => change('units')} /><SortButton label="Participación" direction={direction('share')} onClick={() => change('share')} /></header>{sorted.map((row) => <article key={`${row.productId}:${row.brand}`}><button className="entity-link product-entity-link" onClick={() => onOpenProduct(row.productId)}>{row.product}<ChevronRight size={12} /></button><span>{row.brand}</span><span>{exactKilos(row.kilos)}</span><span>{number(row.clients)}</span><span>{number(row.units)}</span><span>{percent(row.share)}</span></article>)}</div>;
}

export function NutriPetReportView({ onOpenProduct }: { onOpenProduct: (productId: string) => void }) {
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
      setFilters({ ...EMPTY_FILTERS, year: payload.latestYear, month: payload.latestMonth.slice(5, 7) });
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

  const activeFilterCount = useMemo(() => (Object.entries(filters) as [keyof NutriPetFilters, string][]).filter(([key, value]) => !['year', 'month'].includes(key) && value && !(key === 'channelGroup' && value === 'Especializado')).length, [filters]);
  const update = (key: keyof NutriPetFilters, value: string) => setFilters((current) => {
    if (key === 'year' && meta) {
      const available = meta.monthsByYear[value] ?? [];
      return { ...current, year: value, month: available.includes(current.month) ? current.month : available.at(-1) ?? current.month };
    }
    return { ...current, [key]: value };
  });

  if (!meta && loading) return <div className="page-view nutripet-page"><div className="spt-loading"><RefreshCw className="spin" size={24} /><strong>Preparando Reporte NutriPet</strong><span>Reconstruyendo ventas, clientes y comparaciones desde GESI…</span></div></div>;
  if (!meta || (!report && error)) return <div className="page-view nutripet-page"><div className="spt-loading error"><Database size={24} /><strong>No pudimos abrir Reporte NutriPet</strong><span>{error}</span></div></div>;
  if (!report) return <div className="page-view nutripet-page"><div className="spt-loading"><RefreshCw className="spin" size={24} /><strong>Calculando el reporte NutriPet</strong></div></div>;

  const currentVsPrevious = variation(report.current.kilos, report.previousMonth.kilos);
  const currentVsYear = variation(report.current.kilos, report.previousYear.kilos);
  const ytdVsYear = variation(report.ytd.kilos, report.previousYtd.kilos);
  const clientYtdVariation = variation(report.ytd.clients, report.previousYtd.clients);
  const filterKeys: NutriPetFilterKey[] = ['brand', 'product', 'line', 'client', 'grouping', 'category'];
  const reset = () => setFilters({ ...EMPTY_FILTERS, year: meta.latestYear, month: meta.latestMonth.slice(5, 7) });

  return <div className="page-view nutripet-page">
    <section className="data-card nutripet-filter-card" data-tour="nutripet-overview">
      <div className="nutripet-filter-copy"><span className="section-kicker"><ShoppingBag size={14} /> Reporte NutriPet</span><h2>Nutri Pet · {monthLabel(report.selectedMonth, true)}</h2><p>Volumen y cobertura del proveedor calculados directamente sobre facturas y notas de crédito de GESI.</p></div>
      <div className="nutripet-filter-controls"><SingleSelectFilter label="Año" value={filters.year} options={meta.years} onChange={(value) => update('year', value)} /><SingleSelectFilter label="Mes" value={filters.month} options={(meta.monthsByYear[filters.year] ?? []).map((month) => ({ value: month, label: monthName(month) }))} onChange={(value) => update('month', value)} /><SelectFilter label={FILTER_LABELS.channelGroup} value={filters.channelGroup} options={meta.options.channelGroup} onChange={(value) => update('channelGroup', value)} /><button className={`button secondary nutripet-more-button ${activeFilterCount ? 'active' : ''}`} onClick={() => setExpanded((value) => !value)}><Filter size={14} /> Más filtros {activeFilterCount ? `(${activeFilterCount})` : ''}<ChevronDown size={13} /></button></div>
      {expanded && <div className="nutripet-filter-expanded">{filterKeys.map((key) => <SelectFilter key={key} label={FILTER_LABELS[key]} value={filters[key]} options={meta.options[key]} onChange={(value) => update(key, value)} />)}<button className="button secondary" onClick={reset}><X size={14} /> Restablecer</button></div>}
      {loading && <div className="nutripet-filter-loading"><RefreshCw className="spin" size={13} /> Recalculando</div>}
    </section>

    <section className={`nutripet-period-note ${report.isPartial ? 'partial' : ''}`}><CalendarRange size={17} /><div><strong>{monthLabel(report.selectedMonth, true)} · corte al {report.periodEnd.split('-').reverse().join('/')}</strong><span>{report.isPartial ? `Mes en curso: ${report.elapsedDays} días. Mes anterior, año anterior y YTD se comparan usando el mismo día de corte.` : 'Mes completo. Las comparaciones usan períodos calendario equivalentes.'}</span></div></section>

    <div className="nutripet-kpis">
      <article><span className="nutripet-kpi-icon green"><Scale size={20} /></span><div><small>Total de kilos</small><strong>{kilos(report.current.kilos)} kg</strong><em>{number(report.current.clients)} clientes · {money(report.current.netAmount)}</em></div></article>
      <article><span className={`nutripet-kpi-icon ${currentVsPrevious != null && currentVsPrevious >= 0 ? 'green' : 'ochre'}`}>{currentVsPrevious != null && currentVsPrevious >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}</span><div><small>Mes anterior comparable</small><strong>{kilos(report.previousMonth.kilos)} kg</strong><em>{percent(currentVsPrevious, true)}</em></div></article>
      <article><span className="nutripet-kpi-icon blue"><BarChart3 size={20} /></span><div><small>Mismo mes año anterior</small><strong>{kilos(report.previousYear.kilos)} kg</strong><em>{percent(currentVsYear, true)}</em></div></article>
      <article><span className="nutripet-kpi-icon green"><CalendarRange size={20} /></span><div><small>Volumen YTD</small><strong>{kilos(report.ytd.kilos)} kg</strong><em>{percent(ytdVsYear, true)} vs año anterior</em></div></article>
      <article><span className="nutripet-kpi-icon blue"><Users size={20} /></span><div><small>Clientes del mes</small><strong>{number(report.current.clients)}</strong><em>{number(report.current.units)} unidades</em></div></article>
      <article><span className="nutripet-kpi-icon ochre"><Users size={20} /></span><div><small>Clientes YTD</small><strong>{number(report.ytd.clients)}</strong><em>{percent(clientYtdVariation, true)} · {number(report.previousYtd.clients)} LY</em></div></article>
    </div>

    <div className="nutripet-main-grid"><section className="data-card nutripet-evolution-card"><div className="data-card-header"><div><span className="section-kicker"><TrendingUp size={14} /> Evolución</span><h2>Volumen y acumulado interanual</h2><p>Últimos 13 meses disponibles. Las barras muestran kilos y la línea el YTD contra el año anterior.</p></div><div className="nutripet-legend"><span><i />Volumen</span><span><i className="ratio" />YTD vs LY</span><span><i className="partial" />Mes parcial</span></div></div><EvolutionChart report={report} /></section><section className="data-card nutripet-client-card"><div className="data-card-header"><div><span className="section-kicker"><Users size={14} /> Cobertura</span><h2>Clientes por mes</h2><p>Cada ClienteID se cuenta una sola vez por mes.</p></div></div><ClientChart rows={report.monthly} /></section></div>

    <div className="nutripet-secondary-grid"><section className="data-card nutripet-quarter-card"><div className="data-card-header"><div><span className="section-kicker"><CalendarRange size={14} /> Trimestres</span><h2>Volumen por trimestre · {filters.year}</h2><p>El mes seleccionado no limita esta vista anual.</p></div></div><QuarterChart report={report} /></section><section className="data-card nutripet-brand-card"><div className="data-card-header"><div><span className="section-kicker"><ShoppingBag size={14} /> Marcas</span><h2>Mix del mes seleccionado</h2><p>Volumen y comparación contra el mismo corte del año anterior.</p></div><span className="count-badge">{number(report.brands.length)} marcas</span></div><BrandTable rows={report.brands} /></section></div>

    <section className="data-card nutripet-product-card"><div className="data-card-header"><div><span className="section-kicker"><PackageSearch size={14} /> Detalle auditable</span><h2>Productos del mes seleccionado</h2><p>Seleccioná cualquier encabezado para alternar orden ascendente, descendente y original.</p></div><span className="count-badge">{number(report.products.length)} productos</span></div><ProductTable rows={report.products} onOpenProduct={onOpenProduct} /></section>

    <section className="nutripet-source-note"><Database size={16} /><div><strong>{meta.sourceSystem}</strong><span>{number(meta.rowCount)} movimientos NutriPet · cobertura GESI {meta.coverageFrom} a {meta.maxDate} · empresa 3 / sucursal 3 · grupo Nutri Pet · excluye rubro POP y Via Salice MDP S.A.{meta.unavailableDocumentCount ? ` GESI no entregó el detalle de ${number(meta.unavailableDocumentCount)} de ${number(meta.sourceDocumentCount)} comprobantes; quedan identificados para el próximo refresco.` : ''} El PBIX se usa sólo como referencia funcional y de conciliación.</span></div></section>
  </div>;
}
