import { useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight, CircleDollarSign, Database, Filter, PackageOpen, RefreshCw, Scale, ShoppingBasket, Store, TrendingDown, TrendingUp, X } from 'lucide-react';
import type {
  CommercialSalesBrandRow,
  CommercialSalesFilterKey,
  CommercialSalesFilters,
  CommercialSalesMixRow,
  CommercialSalesReportMeta,
  CommercialSalesReportPayload,
} from '../../shared/models';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { ReportContext, ReportEmptyNotice, ReportExportActions, ReportFilterActions, ReportState } from '../components/ReportExperience';
import { SingleSelectFilter } from '../components/SingleSelectFilter';
import { SortButton } from '../components/SortButton';
import { compactNumber, money, number } from '../lib/format';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';
import { reportFiltersFromLocation } from '../lib/report-links';

const EMPTY_FILTERS: CommercialSalesFilters = { periodMode: 'month', month: '', year: '', seller: '', category: '', brand: '', productGroup: '' };
const FILTER_LABELS: Record<CommercialSalesFilterKey, string> = {
  seller: 'Vendedor',
  category: 'Rubro',
  brand: 'Marca',
  productGroup: 'Grupo de artículo',
};
const MIX_COLORS: Record<CommercialSalesMixRow['label'], string> = {
  Balanceado: '#397a60',
  Autoservicio: '#d78a2d',
  Drovet: '#6687a4',
  Sanitarios: '#9b6f9f',
  Otros: '#b9c2bc',
};

const monthLabel = (value: string, long = false) => {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-AR', { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit' })
    .format(new Date(year, month - 1, 1)).replace('.', '');
};
const dateLabel = (value: string) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`)).replaceAll('.', '');
const kilos = (value: number, compact = false) => compact ? compactNumber(value) : number(value, 1);
const price = (value: number | null) => value == null ? 'Sin base' : money(value);
const percent = (value: number | null, signed = false) => value == null
  ? 'Sin base'
  : `${signed && value > 0 ? '+' : ''}${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value)}%`;

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <MultiSelectFilter label={label} value={value} options={options} onChange={onChange} />;
}

function EvolutionChart({ report }: { report: CommercialSalesReportPayload }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const width = 820;
  const height = 285;
  const inset = { left: 56, right: 18, top: 20, bottom: 42 };
  const max = Math.max(1, ...report.monthly.flatMap((row) => [row.current, row.previousYear]));
  const chartWidth = width - inset.left - inset.right;
  const chartHeight = height - inset.top - inset.bottom;
  const step = chartWidth / report.monthly.length;
  const x = (index: number) => inset.left + step * index + step / 2;
  const y = (value: number) => inset.top + chartHeight - value / max * chartHeight;
  const line = report.monthly.map((row, index) => `${x(index)},${y(row.previousYear)}`).join(' ');
  const hoveredRow = hovered == null ? null : report.monthly[hovered];
  return <div className="commercial-evolution-stage" onMouseLeave={() => setHovered(null)}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Evolución de ventas netas ${report.periodMode === 'year' ? `durante ${report.selectedPeriod}` : 'por mes'}`}>
      {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={inset.left} x2={width - inset.right} y1={y(max * ratio)} y2={y(max * ratio)} className="commercial-grid-line" />{ratio > 0 && <text x={inset.left - 9} y={y(max * ratio) + 4} textAnchor="end">{money(max * ratio, true)}</text>}</g>)}
      {report.monthly.map((row, index) => {
        const barWidth = Math.min(50, step * .56);
        const barHeight = Math.max(1, chartHeight - (y(row.current) - inset.top));
        return <g key={row.month} className="commercial-chart-hit" tabIndex={0} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)}>
          <rect x={x(index) - step / 2} y={inset.top} width={step} height={chartHeight} fill="transparent" />
          <rect x={x(index) - barWidth / 2} y={y(row.current)} width={barWidth} height={barHeight} rx="5" className="commercial-current-bar" />
          <text x={x(index)} y={height - 14} textAnchor="middle">{monthLabel(row.month)}</text>
        </g>;
      })}
      {report.comparisonAvailable && <polyline points={line} className="commercial-prior-line" />}
      {report.comparisonAvailable && report.monthly.map((row, index) => <circle key={row.month} cx={x(index)} cy={y(row.previousYear)} r={hovered === index ? 5 : 3.5} className="commercial-prior-dot" />)}
      {hovered != null && <line x1={x(hovered)} x2={x(hovered)} y1={inset.top} y2={inset.top + chartHeight} className="commercial-hover-line" />}
    </svg>
    {hoveredRow && hovered != null && <aside className={`commercial-chart-tooltip ${hovered < 2 ? 'align-start' : hovered > report.monthly.length - 3 ? 'align-end' : ''}`} style={{ left: `${x(hovered) / width * 100}%` }}>
      <strong>{monthLabel(hoveredRow.month, true)}</strong>
      <span><i style={{ background: '#397a60' }} /><div><small>Venta neta</small><b>{money(hoveredRow.current)}</b></div></span>
      {report.comparisonAvailable && <span><i style={{ background: '#6687a4' }} /><div><small>Año anterior</small><b>{money(hoveredRow.previousYear)}</b></div></span>}
      <em>{report.comparisonAvailable ? `${percent(hoveredRow.previousYear ? (hoveredRow.current - hoveredRow.previousYear) / hoveredRow.previousYear * 100 : null, true)} interanual` : 'Sin cobertura del año anterior'}</em>
    </aside>}
  </div>;
}

function MixChart({ rows }: { rows: CommercialSalesMixRow[] }) {
  const [hovered, setHovered] = useState<CommercialSalesMixRow['label'] | null>(null);
  const radius = 62;
  const circumference = Math.PI * radius * 2;
  let offset = 0;
  const total = rows.reduce((sum, row) => sum + row.netAmount, 0);
  return <div className="commercial-mix">
    <div className="commercial-donut-wrap">
      <svg viewBox="0 0 180 180" role="img" aria-label="Composición de la venta neta">
        <circle cx="90" cy="90" r={radius} className="commercial-donut-track" />
        {rows.map((row) => {
          const length = circumference * row.share / 100;
          const currentOffset = offset;
          offset += length;
          return <circle key={row.label} cx="90" cy="90" r={radius} fill="none" stroke={MIX_COLORS[row.label]} strokeWidth={hovered === row.label ? 24 : 20} strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-currentOffset} className="commercial-donut-slice" tabIndex={0} onMouseEnter={() => setHovered(row.label)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(row.label)} onBlur={() => setHovered(null)}><title>{row.label}: {money(row.netAmount)} ({percent(row.share)})</title></circle>;
        })}
      </svg>
      <div><strong>{money(total, true)}</strong><span>venta neta</span></div>
    </div>
    <div className="commercial-mix-list">{rows.map((row) => <article key={row.label} className={hovered === row.label ? 'active' : ''} onMouseEnter={() => setHovered(row.label)} onMouseLeave={() => setHovered(null)}><i style={{ background: MIX_COLORS[row.label] }} /><div><strong>{row.label}</strong><span>{number(row.clients)} clientes · {kilos(row.kilos, true)} kg</span></div><b>{percent(row.share)}</b><em>{money(row.netAmount, true)}</em></article>)}</div>
  </div>;
}

function BrandTable({ report, onOpenProduct, onOpenBrand, onExploreProduct }: { report: CommercialSalesReportPayload; onOpenProduct: (productId: string) => void; onOpenBrand: (brand: string) => void; onExploreProduct: (productId: string) => void }) {
  type SortKey = 'brand' | 'kilos' | 'averagePricePerKilo' | 'kiloShare' | 'netAmount' | 'salesShare' | 'averageDailySales';
  const [sort, setSort] = useState(emptySort<SortKey>());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rows = sortItems(report.brands, sort, (row, key) => row[key]);
  const direction = (key: SortKey) => sort.key === key ? sort.direction : null;
  const changeSort = (key: SortKey) => setSort((current) => cycleSort(current, key));
  const toggle = (brand: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(brand)) next.delete(brand); else next.add(brand);
    return next;
  });
  return <div className="commercial-brand-table">
    <header><SortButton label="Marca / producto" direction={direction('brand')} onClick={() => changeSort('brand')} /><SortButton label="Kilos" direction={direction('kilos')} onClick={() => changeSort('kilos')} /><SortButton label="Precio prom. / kg" direction={direction('averagePricePerKilo')} onClick={() => changeSort('averagePricePerKilo')} /><SortButton label="% kilos" direction={direction('kiloShare')} onClick={() => changeSort('kiloShare')} /><SortButton label="Venta neta" direction={direction('netAmount')} onClick={() => changeSort('netAmount')} /><SortButton label="% venta" direction={direction('salesShare')} onClick={() => changeSort('salesShare')} /><SortButton label="Promedio diario" direction={direction('averageDailySales')} onClick={() => changeSort('averageDailySales')} /></header>
    <div>{rows.map((row) => <div className="commercial-brand-group" key={row.brand}>
      <div className="commercial-brand-row" aria-expanded={expanded.has(row.brand)}><span><button className="icon-button" aria-label={`${expanded.has(row.brand) ? 'Ocultar' : 'Mostrar'} productos de ${row.brand}`} onClick={() => toggle(row.brand)}><ChevronRight size={15} /></button><button className="entity-link" onClick={() => onOpenBrand(row.brand)}>{row.brand}</button><small>{number(row.products.length)} productos · {number(row.clients)} clientes</small></span><strong>{kilos(row.kilos)}</strong><strong>{price(row.averagePricePerKilo)}</strong><strong>{percent(row.kiloShare)}</strong><strong>{money(row.netAmount)}</strong><strong>{percent(row.salesShare)}</strong><strong>{money(row.averageDailySales)}</strong></div>
      {expanded.has(row.brand) && <div className="commercial-product-rows">{row.products.map((product) => <article key={product.productId}><span><button className="entity-link product-entity-link" onClick={() => onOpenProduct(product.productId)}>{product.product}<ChevronRight size={12} /></button><small>{product.productId} · {number(product.clients)} clientes</small><button className="report-inline-action" onClick={() => onExploreProduct(product.productId)}>Ver ventas</button></span><strong>{kilos(product.kilos)}</strong><strong>{price(product.averagePricePerKilo)}</strong><strong>{percent(row.kilos ? product.kilos / row.kilos * 100 : 0)}</strong><strong>{money(product.netAmount)}</strong><strong>{percent(row.netAmount ? product.netAmount / row.netAmount * 100 : 0)}</strong><strong>{money(product.netAmount / report.elapsedDays)}</strong></article>)}</div>}
    </div>)}</div>
    <footer><strong>Total</strong><strong>{kilos(report.brandTotal.kilos)}</strong><strong>{price(report.brandTotal.averagePricePerKilo)}</strong><strong>100%</strong><strong>{money(report.brandTotal.netAmount)}</strong><strong>100%</strong><strong>{money(report.brandTotal.averageDailySales)}</strong></footer>
  </div>;
}

export function CommercialSalesReportView({ onOpenProduct, onOpenBrand, onOpenSalesExplorer }: { onOpenProduct: (productId: string) => void; onOpenBrand: (brand: string) => void; onOpenSalesExplorer: (filters: { from: string; to: string; seller?: string; brand?: string; product?: string; category?: string }) => void }) {
  const [meta, setMeta] = useState<CommercialSalesReportMeta | null>(null);
  const [filters, setFilters] = useState<CommercialSalesFilters>(EMPTY_FILTERS);
  const [report, setReport] = useState<CommercialSalesReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/reports/commercial-sales/meta').then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo abrir el modelo comercial');
      return payload as CommercialSalesReportMeta;
    }).then((payload) => {
      setMeta(payload);
      setFilters(reportFiltersFromLocation('commercial-sales', { ...EMPTY_FILTERS, month: payload.latestMonth, year: payload.latestYear }));
    }).catch((cause: Error) => { setError(cause.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!meta || !filters.month) return;
    const controller = new AbortController();
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) parameters.set(key, value);
    setLoading(true);
    setError('');
    fetch(`/api/reports/commercial-sales?${parameters}`, { signal: controller.signal }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo calcular el reporte comercial');
      return payload as CommercialSalesReportPayload;
    }).then(setReport).catch((cause: Error) => { if (cause.name !== 'AbortError') setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, meta]);

  const activeFilterCount = useMemo(() => (Object.entries(filters) as [keyof CommercialSalesFilters, string][]).filter(([key, value]) => !['periodMode', 'month', 'year'].includes(key) && value).length, [filters]);
  const update = (key: keyof CommercialSalesFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));

  if (!meta && loading) return <ReportState state="loading" title="Preparando Ventas · Comercial" detail="Leyendo los movimientos capturados desde GESI…" />;
  if (!meta || (!report && error)) return <ReportState state="error" title="No pudimos abrir el reporte comercial" detail={error} onRetry={() => location.reload()} />;
  if (!report) return <ReportState state="loading" title="Calculando indicadores comerciales" detail="Aplicando el universo y los filtros seleccionados." />;

  const hasComparison = report.comparisonAvailable && report.comparison.netAmount !== 0;
  const positive = hasComparison && report.variation != null && report.variation >= 0;
  const periodTitle = report.periodMode === 'year' ? report.selectedPeriod : monthLabel(report.selectedPeriod, true);
  const comparisonTitle = report.periodMode === 'year' ? 'Mismo período año anterior' : 'Mismo período mes anterior';
  const differenceTitle = report.periodMode === 'year' ? 'Diferencia vs año anterior' : 'Diferencia vs mes anterior';
  const comparisonLegend = report.periodMode === 'year' ? String(Number(report.selectedPeriod) - 1) : 'Año anterior';
  const resetFilters = () => setFilters({ ...EMPTY_FILTERS, periodMode: filters.periodMode, month: meta.latestMonth, year: meta.latestYear });
  const filterKeys: CommercialSalesFilterKey[] = ['seller', 'category', 'brand', 'productGroup'];
  const applySaved = (saved: Record<string, string>) => setFilters({
    periodMode: saved.periodMode === 'year' ? 'year' : 'month',
    month: saved.month || meta.latestMonth,
    year: saved.year || meta.latestYear,
    seller: saved.seller || '', category: saved.category || '', brand: saved.brand || '', productGroup: saved.productGroup || '',
  });
  const expectedEnd = report.periodMode === 'year'
    ? `${report.selectedPeriod}-12-31`
    : new Date(Date.UTC(Number(report.selectedPeriod.slice(0, 4)), Number(report.selectedPeriod.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const isPartial = report.periodEnd < expectedEnd;
  const explore = (product = '') => onOpenSalesExplorer({
    from: report.periodStart, to: report.periodEnd,
    seller: filters.seller, brand: filters.brand, product, category: filters.category,
  });
  const linkFilters = { ...filters, month: filters.periodMode === 'month' ? filters.month : '', year: filters.periodMode === 'year' ? filters.year : '' };
  const salesExportUrl = `/api/admin/sales/export?${new URLSearchParams({
    format: 'xlsx', from: report.periodStart, to: report.periodEnd, seller: filters.seller,
    brand: filters.brand, category: filters.category, productGroup: filters.productGroup,
  })}`;
  const filterLabels = {
    periodMode: { label: 'Vista', value: (value: string) => value === 'year' ? 'Anual' : 'Mensual' },
    month: { label: 'Mes', value: (value: string) => monthLabel(value, true) },
    year: { label: 'Año' },
    seller: { label: 'Vendedor' }, category: { label: 'Rubro' }, brand: { label: 'Marca' }, productGroup: { label: 'Grupo' },
  };
  return <div className="page-view commercial-page">
    <section className="data-card commercial-filter-card" data-tour="commercial-sales-overview">
      <div><span className="section-kicker"><Filter size={14} /> Reporte Ventas - Comercial</span><h2>Venta neta · {periodTitle}</h2><p>{report.periodMode === 'year' ? `Vista anual del ${dateLabel(report.periodStart)} al ${dateLabel(report.periodEnd)}.` : 'Vista mensual'} calculada sobre facturas y notas de crédito de GESI.</p><div className="commercial-period-tabs" role="group" aria-label="Frecuencia del reporte"><button type="button" className={filters.periodMode === 'month' ? 'active' : ''} aria-pressed={filters.periodMode === 'month'} onClick={() => update('periodMode', 'month')}>Mensual</button><button type="button" className={filters.periodMode === 'year' ? 'active' : ''} aria-pressed={filters.periodMode === 'year'} onClick={() => update('periodMode', 'year')}>Anual</button></div></div>
      <div className="commercial-filters"><SingleSelectFilter label={filters.periodMode === 'year' ? 'Año' : 'Mes'} value={filters.periodMode === 'year' ? filters.year : filters.month} options={filters.periodMode === 'year' ? meta.years : meta.months.map((month) => ({ value: month, label: monthLabel(month, true) }))} onChange={(value) => update(filters.periodMode === 'year' ? 'year' : 'month', value)} />{filterKeys.map((key) => <SelectFilter key={key} label={FILTER_LABELS[key]} value={filters[key]} options={meta.options[key]} onChange={(value) => update(key, value)} />)}<button className="button secondary" disabled={!activeFilterCount} onClick={resetFilters}><X size={14} /> Limpiar {activeFilterCount ? `(${activeFilterCount})` : ''}</button></div>
      <ReportFilterActions view="commercial-sales" filters={linkFilters} labels={filterLabels} onClear={(key) => update(key as keyof CommercialSalesFilters, key === 'periodMode' ? 'month' : key === 'month' ? meta.latestMonth : key === 'year' ? meta.latestYear : '')} onReset={resetFilters}>
        <SavedViewsBar viewKey="commercial-sales" filters={{ ...filters }} onApply={applySaved} />
      </ReportFilterActions>
      {loading && <div className="commercial-filter-loading"><RefreshCw className="spin" size={13} /> Recalculando</div>}
    </section>

    <ReportContext
      universe="Empresa 3 · sucursales 3/6 · emisores Salice/MDQ Alarcón"
      period={`${report.periodStart} → ${report.periodEnd}`}
      cutoff={report.sourceMaxDate}
      comparison={report.comparisonAvailable ? `${report.comparisonStart} → ${report.comparisonEnd}` : 'Fuera de cobertura'}
      partial={isPartial}
      warnings={meta.unavailableDocumentCount ? [`${meta.unavailableDocumentCount} comprobantes sin detalle no se completan artificialmente.`] : []}
      related={[{ view: 'reports', label: 'Abrir Reporte General' }, { view: 'non-buyers', label: 'Abrir No compradoras' }]}
      actions={<button className="button secondary compact" onClick={() => explore()}><ShoppingBasket size={14} /> Continuar en Explorador de ventas</button>}
      exports={<ReportExportActions links={[{ href: salesExportUrl, label: 'Exportar ventas completas', kind: 'xlsx' }]} />}
    />
    {!report.current.clients && !report.current.netAmount && <ReportEmptyNotice />}

    <div className="commercial-main-kpis">
      <article><span className="commercial-kpi-icon green"><CircleDollarSign size={21} /></span><div><small>Venta neta</small><strong>{money(report.current.netAmount, true)}</strong><em>{dateLabel(report.periodStart)}–{dateLabel(report.periodEnd)} · {number(report.elapsedDays)} días</em></div></article>
      <article><span className="commercial-kpi-icon blue"><BarChart3 size={21} /></span><div><small>{comparisonTitle}</small><strong>{report.comparisonAvailable ? money(report.comparison.netAmount, true) : 'Sin cobertura'}</strong><em>{report.comparisonAvailable ? `${dateLabel(report.comparisonStart)}–${dateLabel(report.comparisonEnd)}` : `GESI comienza en ${meta.coverageFrom}`}</em></div></article>
      <article className={!hasComparison ? '' : positive ? 'positive' : 'negative'}><span className={`commercial-kpi-icon ${!hasComparison ? 'blue' : positive ? 'green' : 'red'}`}>{!hasComparison ? <BarChart3 size={21} /> : positive ? <TrendingUp size={21} /> : <TrendingDown size={21} />}</span><div><small>{differenceTitle}</small><strong>{hasComparison ? `${report.difference >= 0 ? '+' : ''}${money(report.difference, true)}` : 'Sin base'}</strong><em>{hasComparison ? percent(report.variation, true) : 'Período anterior fuera de cobertura'}</em></div></article>
    </div>

    <div className="commercial-segment-kpis">
      <article><span className="commercial-kpi-icon green"><Scale size={19} /></span><div><small>Ventas T. Balanceado</small><strong>{money(report.segments.balanceado.netAmount, true)}</strong><em>{kilos(report.segments.balanceado.kilos, true)} kg · {number(report.segments.balanceado.clients)} clientes</em></div></article>
      <article><span className="commercial-kpi-icon blue"><PackageOpen size={19} /></span><div><small>Ventas T. Drovet</small><strong>{money(report.segments.drovet.netAmount, true)}</strong><em>{kilos(report.segments.drovet.kilos, true)} kg · {number(report.segments.drovet.clients)} clientes</em></div></article>
      <article><span className="commercial-kpi-icon purple"><ShoppingBasket size={19} /></span><div><small>Accesorios y sanitarios</small><strong>{money(report.segments.sanitarios.netAmount, true)}</strong><em>{kilos(report.segments.sanitarios.kilos, true)} kg · {number(report.segments.sanitarios.clients)} clientes</em></div></article>
      <article><span className="commercial-kpi-icon ochre"><Store size={19} /></span><div><small>Ventas T. Autoservicios</small><strong>{money(report.segments.autoservicio.netAmount, true)}</strong><em>{kilos(report.segments.autoservicio.kilos, true)} kg · {number(report.segments.autoservicio.clients)} clientes</em></div></article>
    </div>

    <div className="commercial-chart-grid">
      <section className="data-card commercial-evolution-card"><div className="data-card-header"><div><span className="section-kicker"><TrendingUp size={14} /> Evolución</span><h2>{report.periodMode === 'year' ? `Evolución de ${report.selectedPeriod} por mes` : 'Evolución de $ por mes'}</h2><p>{report.periodMode === 'year' ? `Venta neta mensual de ${report.selectedPeriod} contra ${Number(report.selectedPeriod) - 1}.` : 'Siete meses de venta neta contra los mismos meses del año anterior.'}</p></div><div className="commercial-legend"><span><i className="current" />Venta neta</span>{report.comparisonAvailable && <span><i className="prior" />{comparisonLegend}</span>}</div></div><EvolutionChart report={report} /></section>
      <section className="data-card commercial-mix-card"><div className="data-card-header"><div><span className="section-kicker"><PackageOpen size={14} /> Composición</span><h2>Venta neta por negocio</h2><p>Small Retail se muestra como Autoservicio.</p></div></div><MixChart rows={report.mix} /></section>
    </div>

    <section className="data-card commercial-brand-card"><div className="data-card-header"><div><span className="section-kicker"><ShoppingBasket size={14} /> Detalle comercial</span><h2>Total de kilos y precio promedio por marca</h2><p>La flecha despliega productos; cada nombre abre su ficha y “Ver ventas” continúa con el mismo período.</p></div><span className="count-badge">{number(report.brands.length)} marcas</span></div><BrandTable report={report} onOpenProduct={onOpenProduct} onOpenBrand={onOpenBrand} onExploreProduct={explore} /></section>

    <section className="commercial-source-note"><Database size={16} /><div><strong>{meta.sourceSystem}</strong><span>{number(meta.rowCount)} movimientos disponibles · cobertura {meta.coverageFrom} a {meta.maxDate} · empresa 3, sucursales 3/6 y razones sociales Salice/MDQ Alarcón. Se excluyen movimientos internos definidos en el reporte de referencia.</span></div></section>
  </div>;
}
