import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarRange, ChevronLeft, ChevronRight, Database, Download, FileSpreadsheet, Filter, Package, ReceiptText, Search, ShoppingCart, Users } from 'lucide-react';
import type {
  Client,
  SalesExplorerClientRow,
  SalesExplorerDocumentRow,
  SalesExplorerFilters,
  SalesExplorerMeta,
  SalesExplorerPayload,
  SalesExplorerProductRow,
} from '../../shared/models';
import { encodeMultiFilter } from '../../shared/multi-filter';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { SortButton } from '../components/SortButton';
import { clientPrimaryName, clientSecondaryName } from '../lib/client-name';
import { money, number, shortDate } from '../lib/format';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';
import { shouldAdvanceFromPeriod } from '../lib/sales-explorer-navigation';

type ExplorerTab = 'periods' | 'clients' | 'products' | 'documents';
type ClientSort = 'name' | 'seller' | 'netAmount' | 'kilos' | 'documents' | 'lastSaleAt';
type ProductSort = 'name' | 'brand' | 'netAmount' | 'kilos' | 'clients' | 'lastSaleAt';
type DocumentSort = 'date' | 'documentNumber' | 'client' | 'seller' | 'netAmount';

interface SalesExplorerViewProps {
  clients: Client[];
  navigationRequest?: { id: number; filters: Partial<SalesExplorerFilters> } | null;
  onOpenClient: (clientId: number) => void;
  onOpenProduct: (productId: string) => void;
  onOpenBrand: (brand: string) => void;
  onOpenInvoice: (invoiceId: string) => void;
}

const emptyFilters: SalesExplorerFilters = { from: '', to: '', seller: '', client: '', product: '', brand: '', category: '', productGroup: '', channel: '', zone: '' };
const asRecord = (filters: SalesExplorerFilters): Record<string, string> => ({ ...filters });
const exact = (value: number, digits = 2) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(value);

function periodLabel(key: string) {
  if (key.length === 7) return new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${key}-01T12:00:00Z`)).replace('.', '');
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`)).replace('.', '');
}

function SalesTimeline({ report, onSelect }: { report: SalesExplorerPayload; onSelect: (from: string, to: string) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const width = 1100;
  const height = 300;
  const inset = { left: 72, right: 24, top: 24, bottom: 46 };
  const plotHeight = height - inset.top - inset.bottom;
  const plotWidth = width - inset.left - inset.right;
  const max = Math.max(1, ...report.timeline.map((row) => Math.abs(row.netAmount))) * 1.08;
  const step = plotWidth / Math.max(1, report.timeline.length);
  const barWidth = Math.max(3, Math.min(38, step * .66));
  const active = hovered == null ? null : report.timeline[hovered];
  return <div className="admin-chart-stage" onMouseLeave={() => setHovered(null)}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolución de venta neta del período filtrado">
      {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}>
        <line x1={inset.left} x2={width - inset.right} y1={inset.top + plotHeight * (1 - ratio)} y2={inset.top + plotHeight * (1 - ratio)} />
        <text x={inset.left - 10} y={inset.top + plotHeight * (1 - ratio) + 4} textAnchor="end">{money(max * ratio, true)}</text>
      </g>)}
      {report.timeline.map((row, index) => {
        const x = inset.left + step * index + step / 2;
        const barHeight = Math.abs(row.netAmount) / max * plotHeight;
        const visibleLabel = report.timeline.length <= 18 || index % Math.ceil(report.timeline.length / 14) === 0;
        return <g key={row.key} tabIndex={0} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} onMouseEnter={() => setHovered(index)} onClick={() => onSelect(row.from, row.to)} className="admin-chart-point">
          <rect className="hit" x={x - step / 2} y={inset.top} width={step} height={plotHeight} />
          <rect className={row.netAmount < 0 ? 'negative' : hovered === index ? 'active' : ''} x={x - barWidth / 2} y={inset.top + plotHeight - barHeight} width={barWidth} height={Math.max(1, barHeight)} rx="4" />
          {visibleLabel && <text x={x} y={height - 16} textAnchor="middle">{periodLabel(row.key)}</text>}
        </g>;
      })}
    </svg>
    {active && <aside className="admin-chart-tooltip">
      <strong>{periodLabel(active.key)}</strong><span>Venta neta <b>{money(active.netAmount)}</b></span><span>Kilos <b>{exact(active.kilos, 3)}</b></span><span>Clientes <b>{number(active.clients)}</b></span><small>Hacé clic para profundizar este período.</small>
    </aside>}
  </div>;
}

export function SalesExplorerView({ clients, navigationRequest, onOpenClient, onOpenProduct, onOpenBrand, onOpenInvoice }: SalesExplorerViewProps) {
  const [meta, setMeta] = useState<SalesExplorerMeta | null>(null);
  const [report, setReport] = useState<SalesExplorerPayload | null>(null);
  const [filters, setFilters] = useState<SalesExplorerFilters>(emptyFilters);
  const [tab, setTab] = useState<ExplorerTab>('periods');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [clientSort, setClientSort] = useState(emptySort<ClientSort>());
  const [productSort, setProductSort] = useState(emptySort<ProductSort>());
  const [documentSort, setDocumentSort] = useState(emptySort<DocumentSort>());

  useEffect(() => {
    fetch('/api/admin/sales/meta').then((response) => {
      if (!response.ok) throw new Error('No se pudo abrir la base general de ventas.');
      return response.json();
    }).then((payload: SalesExplorerMeta) => {
      setMeta(payload);
      const from = new Date(`${payload.maxDate}T12:00:00Z`);
      from.setUTCDate(from.getUTCDate() - 89);
      setFilters({ ...emptyFilters, from: from.toISOString().slice(0, 10) < payload.minDate ? payload.minDate : from.toISOString().slice(0, 10), to: payload.maxDate });
    }).catch((cause: Error) => { setError(cause.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!meta || !navigationRequest) return;
    setFilters((current) => ({ ...current, ...navigationRequest.filters }));
    setPage(1);
    setTab(navigationRequest.filters.client || navigationRequest.filters.product ? 'documents' : 'periods');
  }, [meta, navigationRequest?.id]);

  useEffect(() => {
    if (!meta || !filters.from || !filters.to) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ ...filters, page: String(page), pageSize: '40' });
    setLoading(true);
    setError('');
    fetch(`/api/admin/sales?${query}`, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error('No se pudo calcular el explorador de ventas.');
      return response.json();
    }).then((payload: SalesExplorerPayload) => { setReport(payload); setLoading(false); }).catch((cause: Error) => {
      if (cause.name !== 'AbortError') { setError(cause.message); setLoading(false); }
    });
    return () => controller.abort();
  }, [meta, filters, page]);

  const changeFilter = <Key extends keyof SalesExplorerFilters>(key: Key, value: SalesExplorerFilters[Key]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };
  const reset = () => {
    if (!meta) return;
    const from = new Date(`${meta.maxDate}T12:00:00Z`); from.setUTCDate(from.getUTCDate() - 89);
    setFilters({ ...emptyFilters, from: from.toISOString().slice(0, 10) < meta.minDate ? meta.minDate : from.toISOString().slice(0, 10), to: meta.maxDate });
    setPage(1); setTab('periods');
  };
  const selectPeriod = (from: string, to: string) => {
    setFilters((current) => ({ ...current, from, to }));
    setPage(1);
    if (shouldAdvanceFromPeriod(from, to)) setTab('clients');
  };
  const drillClient = (clientId: number) => { changeFilter('client', encodeMultiFilter([String(clientId)])); setTab('documents'); };
  const drillProduct = (productId: string) => { changeFilter('product', encodeMultiFilter([productId])); setTab('documents'); };
  const exportUrl = (format: 'csv' | 'xlsx') => `/api/admin/sales/export?${new URLSearchParams({ ...filters, format })}`;
  const sortedClients = useMemo(() => sortItems(report?.clients ?? [], clientSort, (row, key) => row[key]), [report, clientSort]);
  const clientMap = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const sortedProducts = useMemo(() => sortItems(report?.products ?? [], productSort, (row, key) => row[key]), [report, productSort]);
  const sortedDocuments = useMemo(() => sortItems(report?.documents ?? [], documentSort, (row, key) => row[key]), [report, documentSort]);
  const applySaved = (saved: Record<string, string>) => { setFilters((current) => ({ ...current, ...saved })); setPage(1); };

  if (error && !report) return <div className="page-view"><section className="data-card report-error"><Database size={22} /><div><h2>Explorador de ventas no disponible</h2><p>{error}</p></div></section></div>;
  if (!meta || !report) return <div className="page-view"><section className="data-card report-loading"><span /><h2>Preparando el explorador de ventas…</h2><p>Organizando movimientos, clientes, productos y comprobantes.</p></section></div>;

  const metricCards = [
    { label: 'Venta neta', value: money(report.summary.netAmount, true), note: `${number(report.summary.documents)} comprobantes`, icon: ShoppingCart },
    { label: 'Kilos netos', value: `${exact(report.summary.kilos, 1)} kg`, note: `${exact(report.summary.units)} unidades`, icon: Package },
    { label: 'Clientes compradores', value: number(report.summary.clients), note: `${filters.from} → ${filters.to}`, icon: Users },
    { label: 'Ticket promedio', value: report.summary.averageTicket == null ? 'Sin base' : money(report.summary.averageTicket), note: 'Venta neta / comprobantes', icon: ReceiptText },
    { label: 'Venta por kilo', value: report.summary.averagePricePerKilo == null ? 'Sin base' : `${money(report.summary.averagePricePerKilo)}/kg`, note: 'Cociente del período', icon: BarChart3 },
  ];

  return <div className={`page-view admin-sales-page ${loading ? 'is-loading' : ''}`}>
    <section className="data-card admin-filter-card" data-tour="sales-explorer-overview">
      <div className="data-card-header"><div><span className="section-kicker"><Search size={14} /> Exploración administrativa</span><h2>De la venta al comprobante</h2><p>Todos los indicadores y desgloses usan el mismo universo comercial y los mismos filtros.</p></div><div className="admin-export-actions"><a className="button ghost compact" href={exportUrl('csv')}><Download size={14} /> CSV</a><a className="button ghost compact" href={exportUrl('xlsx')}><FileSpreadsheet size={14} /> Excel</a></div></div>
      <div className="admin-filter-grid primary"><label className="date-filter"><span>Desde</span><input type="date" min={meta.minDate} max={filters.to} value={filters.from} onChange={(event) => changeFilter('from', event.target.value)} /></label><label className="date-filter"><span>Hasta</span><input type="date" min={filters.from} max={meta.maxDate} value={filters.to} onChange={(event) => changeFilter('to', event.target.value)} /></label><MultiSelectFilter label="Vendedor" value={filters.seller} options={meta.options.sellers} onChange={(value) => changeFilter('seller', value)} /><MultiSelectFilter label="Cliente" value={filters.client} options={meta.options.clients} onChange={(value) => changeFilter('client', value)} /></div>
      <button className="admin-more-filters" onClick={() => setAdvanced((current) => !current)}><Filter size={14} /> {advanced ? 'Ocultar filtros adicionales' : 'Producto, marca, rubro, canal y zona'} <ChevronRight size={14} className={advanced ? 'rotated' : ''} /></button>
      {advanced && <div className="admin-filter-grid advanced"><MultiSelectFilter label="Producto" value={filters.product} options={meta.options.products} onChange={(value) => changeFilter('product', value)} /><MultiSelectFilter label="Marca" value={filters.brand} options={meta.options.brands} onChange={(value) => changeFilter('brand', value)} /><MultiSelectFilter label="Rubro" value={filters.category} options={meta.options.categories} onChange={(value) => changeFilter('category', value)} /><MultiSelectFilter label="Grupo" value={filters.productGroup} options={meta.options.productGroups} onChange={(value) => changeFilter('productGroup', value)} /><MultiSelectFilter label="Canal" value={filters.channel} options={meta.options.channels} onChange={(value) => changeFilter('channel', value)} /><MultiSelectFilter label="Zona" value={filters.zone} options={meta.options.zones} onChange={(value) => changeFilter('zone', value)} /><button className="button ghost" onClick={reset}>Restablecer</button></div>}
      <SavedViewsBar viewKey="sales-explorer" filters={asRecord(filters)} onApply={applySaved} />
    </section>

    <div className="admin-kpi-strip">{metricCards.map(({ label, value, note, icon: Icon }) => <button key={label} onClick={() => setTab('periods')}><span><Icon size={19} /></span><div><small>{label}</small><strong>{value}</strong><em>{note}</em></div></button>)}</div>

    <section className="data-card admin-drill-card">
      <div className="admin-drill-steps"><button className={tab === 'periods' ? 'active' : ''} onClick={() => setTab('periods')}><i>1</i> Período</button><ChevronRight size={14} /><button className={tab === 'clients' ? 'active' : ''} onClick={() => setTab('clients')}><i>2</i> Cliente</button><span>o</span><button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}><i>2</i> Producto</button><ChevronRight size={14} /><button className={tab === 'documents' ? 'active' : ''} onClick={() => setTab('documents')}><i>3</i> Comprobante</button></div>

      {tab === 'periods' && <><div className="data-card-header"><div><span className="section-kicker"><CalendarRange size={14} /> Evolución</span><h2>Venta neta por {report.timelineGrain === 'day' ? 'día' : 'mes'}</h2><p>{report.timelineGrain === 'day' ? 'Elegí un día para avanzar automáticamente, o pasá a Cliente o Producto cuando quieras.' : 'Elegí una barra para profundizar el período sin abandonar este paso; después podés pasar a Cliente o Producto.'}</p></div><span className="count-badge">{report.timeline.length} períodos</span></div><SalesTimeline report={report} onSelect={selectPeriod} /></>}

      {tab === 'clients' && <><div className="data-card-header"><div><span className="section-kicker"><Users size={14} /> Segundo nivel</span><h2>Clientes que explican el período</h2><p>Hacé clic en una cuenta para filtrar sus comprobantes; el acceso lateral abre su perfil completo.</p></div><span className="count-badge">Top {report.resultLimits.clients}</span></div><div className="admin-table clients"><header><SortButton label="Cliente" direction={clientSort.key === 'name' ? clientSort.direction : null} onClick={() => setClientSort((state) => cycleSort(state, 'name'))} /><SortButton label="Vendedor" direction={clientSort.key === 'seller' ? clientSort.direction : null} onClick={() => setClientSort((state) => cycleSort(state, 'seller'))} /><SortButton label="Venta neta" direction={clientSort.key === 'netAmount' ? clientSort.direction : null} onClick={() => setClientSort((state) => cycleSort(state, 'netAmount'))} /><SortButton label="Kilos" direction={clientSort.key === 'kilos' ? clientSort.direction : null} onClick={() => setClientSort((state) => cycleSort(state, 'kilos'))} /><SortButton label="Comprobantes" direction={clientSort.key === 'documents' ? clientSort.direction : null} onClick={() => setClientSort((state) => cycleSort(state, 'documents'))} /><SortButton label="Última venta" direction={clientSort.key === 'lastSaleAt' ? clientSort.direction : null} onClick={() => setClientSort((state) => cycleSort(state, 'lastSaleAt'))} /></header>{sortedClients.map((row: SalesExplorerClientRow) => { const client = clientMap.get(row.clientId); return <article key={row.clientId}><button className="admin-drill-entity" onClick={() => drillClient(row.clientId)}><strong>{client ? clientPrimaryName(client) : row.name}</strong><small>{client && clientSecondaryName(client) ? `${clientSecondaryName(client)} · ` : ''}ID {row.clientId} · {row.zone} · {exact(row.share, 1)}%</small></button><button className="entity-link" onClick={() => onOpenClient(row.clientId)}>{row.seller}</button><span>{money(row.netAmount)}</span><span>{exact(row.kilos, 2)}</span><span>{number(row.documents)}</span><span>{shortDate(row.lastSaleAt)}</span></article>; })}</div></>}

      {tab === 'products' && <><div className="data-card-header"><div><span className="section-kicker"><Package size={14} /> Segundo nivel</span><h2>Productos que explican el período</h2><p>Filtrá el producto para llegar a sus comprobantes o abrí su ficha desde el nombre.</p></div><span className="count-badge">Top {report.resultLimits.products}</span></div><div className="admin-table products"><header><SortButton label="Producto" direction={productSort.key === 'name' ? productSort.direction : null} onClick={() => setProductSort((state) => cycleSort(state, 'name'))} /><SortButton label="Marca" direction={productSort.key === 'brand' ? productSort.direction : null} onClick={() => setProductSort((state) => cycleSort(state, 'brand'))} /><SortButton label="Venta neta" direction={productSort.key === 'netAmount' ? productSort.direction : null} onClick={() => setProductSort((state) => cycleSort(state, 'netAmount'))} /><SortButton label="Kilos" direction={productSort.key === 'kilos' ? productSort.direction : null} onClick={() => setProductSort((state) => cycleSort(state, 'kilos'))} /><SortButton label="Clientes" direction={productSort.key === 'clients' ? productSort.direction : null} onClick={() => setProductSort((state) => cycleSort(state, 'clients'))} /><SortButton label="Última venta" direction={productSort.key === 'lastSaleAt' ? productSort.direction : null} onClick={() => setProductSort((state) => cycleSort(state, 'lastSaleAt'))} /></header>{sortedProducts.map((row: SalesExplorerProductRow) => <article key={row.productId}><button className="admin-drill-entity" onClick={() => drillProduct(row.productId)}><strong>{row.name}</strong><small>{row.productId} · {row.category} · {exact(row.share, 1)}%</small></button><button className="entity-link" onClick={() => onOpenBrand(row.brand)}>{row.brand}</button><span>{money(row.netAmount)}</span><span>{exact(row.kilos, 2)}</span><span>{number(row.clients)}</span><span>{shortDate(row.lastSaleAt)}</span></article>)}</div></>}

      {tab === 'documents' && <><div className="data-card-header"><div><span className="section-kicker"><ReceiptText size={14} /> Último nivel</span><h2>Comprobantes e ítems</h2><p>Abrí un comprobante para revisar el detalle exacto, su estado y descargarlo en PDF.</p></div><span className="count-badge">{number(report.documentPagination.total)} comprobantes</span></div><div className="admin-table documents"><header><SortButton label="Fecha" direction={documentSort.key === 'date' ? documentSort.direction : null} onClick={() => setDocumentSort((state) => cycleSort(state, 'date'))} /><SortButton label="Comprobante" direction={documentSort.key === 'documentNumber' ? documentSort.direction : null} onClick={() => setDocumentSort((state) => cycleSort(state, 'documentNumber'))} /><SortButton label="Cliente" direction={documentSort.key === 'client' ? documentSort.direction : null} onClick={() => setDocumentSort((state) => cycleSort(state, 'client'))} /><SortButton label="Vendedor" direction={documentSort.key === 'seller' ? documentSort.direction : null} onClick={() => setDocumentSort((state) => cycleSort(state, 'seller'))} /><SortButton label="Venta neta" direction={documentSort.key === 'netAmount' ? documentSort.direction : null} onClick={() => setDocumentSort((state) => cycleSort(state, 'netAmount'))} /><span>Renglones</span></header>{sortedDocuments.map((row: SalesExplorerDocumentRow) => <button className="admin-document-row" key={row.key} onClick={() => onOpenInvoice(row.key)}><span>{shortDate(row.date)}</span><strong>{row.documentNumber}<small>{row.kind === 'credit_note' ? 'Nota de crédito' : 'Factura'}</small></strong><span>{row.client}</span><span>{row.seller}</span><span className={row.netAmount < 0 ? 'negative-value' : ''}>{money(row.netAmount)}</span><span>{number(row.items)}</span></button>)}</div><div className="admin-pagination"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={15} /> Anterior</button><span>Página {number(report.documentPagination.page)} de {number(report.documentPagination.pages)}</span><button disabled={page >= report.documentPagination.pages} onClick={() => setPage((value) => value + 1)}>Siguiente <ChevronRight size={15} /></button></div></>}
    </section>

    <details className="business-report-source-note"><summary><Database size={15} /> Información técnica del explorador</summary><div><strong>Fuente y corte auditables</strong><span>{meta.sourceSystem}. Cobertura {meta.minDate} → {meta.maxDate}; {number(meta.sourceDocumentCount)} comprobantes fuente. Los filtros combinan dimensiones y aceptan varias opciones dentro de cada una.</span>{meta.unavailableDocumentCount > 0 && <small>{meta.unavailableDocumentCount} comprobantes no entregaron detalle y no se completan artificialmente.</small>}</div></details>
    {error && report && <div className="admin-inline-error">{error}</div>}
  </div>;
}
