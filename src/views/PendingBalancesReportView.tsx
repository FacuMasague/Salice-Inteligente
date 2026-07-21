import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarClock, ChevronRight, CircleDollarSign, Database, Filter, RefreshCw, Search, Store, TrendingUp, Users, WalletCards } from 'lucide-react';
import type {
  Client,
  DashboardData,
  PendingBalanceClientRow,
  PendingBalanceFilters,
  PendingBalanceReportMeta,
  PendingBalanceReportPayload,
  PendingBalanceSellerRow,
} from '../../shared/models';
import { decodeMultiFilter } from '../../shared/multi-filter';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SortButton } from '../components/SortButton';
import { money, number } from '../lib/format';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';

type ReportView = 'sellers' | 'clients';
type SellerSortKey = 'seller' | 'clients' | 'overdueClients' | 'pendingBalance' | 'overdueBalance' | 'overdueShare' | 'sales30';
type ClientSortKey = 'name' | 'seller' | 'earliestDue' | 'overdueBalance' | 'pendingBalance' | 'creditTermAverageDays' | 'overdueShare' | 'sales30' | 'overdueToSales30';

const EMPTY_FILTERS: PendingBalanceFilters = { seller: '', paymentMethod: '', status: 'all' };
const percent = (value: number | null, digits = 0) => value == null ? 'Sin ventas 30d' : `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(value)}%`;
const shortDate = (value: string | null) => value ? value.split('-').reverse().join('/') : 'Sin vencimiento';

function SellerChart({ rows, selected, onSelect }: { rows: PendingBalanceSellerRow[]; selected: string; onSelect: (seller: string) => void }) {
  const max = Math.max(1, ...rows.map((row) => row.pendingBalance));
  const selectedSellers = decodeMultiFilter(selected);
  return <div className="pending-seller-chart">{rows.map((row) => <button key={row.seller} className={selectedSellers.includes(row.seller) ? 'selected' : ''} onClick={() => onSelect(selectedSellers.length === 1 && selectedSellers[0] === row.seller ? '' : row.seller)} aria-label={`${row.seller}: ${money(row.pendingBalance)} pendiente, ${money(row.overdueBalance)} vencido`}>
    <strong>{row.seller}</strong><div><span style={{ width: `${row.pendingBalance / max * 100}%` }}><i style={{ width: `${Math.min(100, row.overdueShare)}%` }} /></span></div><b>{money(row.pendingBalance, true)}</b><aside><strong>{row.seller}</strong><span>Vencido <b>{money(row.overdueBalance)}</b></span><span>Pendiente <b>{money(row.pendingBalance)}</b></span><small>{percent(row.overdueShare, 1)} vencido · {row.overdueClients} clientes</small></aside>
  </button>)}</div>;
}

function SellerTable({ rows, onOpenSeller }: { rows: PendingBalanceSellerRow[]; onOpenSeller: (seller: string) => void }) {
  const [sort, setSort] = useState(emptySort<SellerSortKey>());
  const sorted = sortItems(rows, sort, (row, key) => row[key]);
  const direction = (key: SellerSortKey) => sort.key === key ? sort.direction : null;
  const change = (key: SellerSortKey) => setSort((current) => cycleSort(current, key));
  return <div className="pending-seller-table"><header><SortButton label="Vendedor" direction={direction('seller')} onClick={() => change('seller')} /><SortButton label="Clientes" direction={direction('clients')} onClick={() => change('clients')} /><SortButton label="Clientes vencidos" direction={direction('overdueClients')} onClick={() => change('overdueClients')} /><SortButton label="Saldo pendiente" direction={direction('pendingBalance')} onClick={() => change('pendingBalance')} /><SortButton label="Saldo vencido" direction={direction('overdueBalance')} onClick={() => change('overdueBalance')} /><SortButton label="Vencido / pendiente" direction={direction('overdueShare')} onClick={() => change('overdueShare')} /><SortButton label="Ventas 30d" direction={direction('sales30')} onClick={() => change('sales30')} /></header>{sorted.map((row) => <article key={row.seller}><button className="entity-link" onClick={() => onOpenSeller(row.seller)}>{row.seller}<ChevronRight size={13} /></button><span>{number(row.clients)}</span><span>{number(row.overdueClients)}</span><span>{money(row.pendingBalance)}</span><span className={row.overdueBalance > 0 ? 'pending' : ''}>{money(row.overdueBalance)}</span><span className="pending-ratio">{percent(row.overdueShare, 1)}</span><span>{money(row.sales30)}</span></article>)}</div>;
}

function ClientTable({ rows, clients, onOpen, onOpenSeller }: { rows: PendingBalanceClientRow[]; clients: DashboardData['clients']; onOpen: (client: Client) => void; onOpenSeller: (seller: string) => void }) {
  const [sort, setSort] = useState(emptySort<ClientSortKey>());
  const [visible, setVisible] = useState(100);
  useEffect(() => { setVisible(100); }, [rows]);
  const sorted = sortItems(rows, sort, (row, key) => row[key]);
  const direction = (key: ClientSortKey) => sort.key === key ? sort.direction : null;
  const change = (key: ClientSortKey) => setSort((current) => cycleSort(current, key));
  const clientMap = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  return <><div className="pending-client-table"><header><SortButton label="Cliente" direction={direction('name')} onClick={() => change('name')} /><SortButton label="Vendedor" direction={direction('seller')} onClick={() => change('seller')} /><SortButton label="Vencimiento" direction={direction('earliestDue')} onClick={() => change('earliestDue')} /><SortButton label="Saldo vencido" direction={direction('overdueBalance')} onClick={() => change('overdueBalance')} /><SortButton label="Saldo pendiente" direction={direction('pendingBalance')} onClick={() => change('pendingBalance')} /><SortButton label="Días prom. CC" direction={direction('creditTermAverageDays')} onClick={() => change('creditTermAverageDays')} /><SortButton label="Vdo. / pendiente" direction={direction('overdueShare')} onClick={() => change('overdueShare')} /><SortButton label="Ventas 30d" direction={direction('sales30')} onClick={() => change('sales30')} /><SortButton label="Vdo. / ventas 30d" direction={direction('overdueToSales30')} onClick={() => change('overdueToSales30')} /><span>Ficha</span></header>{sorted.slice(0, visible).map((row) => {
    const client = clientMap.get(row.clientId);
    return <article key={row.clientId} className={client ? 'clickable' : ''} onClick={() => client && onOpen(client)}><div><strong>{row.tradeName || row.name}</strong><small>{row.tradeName ? row.name : `ID ${row.clientId}`} · {row.active ? 'Activo' : 'Inactivo'}</small></div><button className="entity-link" onClick={(event) => { event.stopPropagation(); onOpenSeller(row.seller); }}>{row.seller}</button><span>{shortDate(row.earliestDue)}</span><span className={row.overdueBalance > 0 ? 'pending' : ''}>{money(row.overdueBalance)}</span><span>{money(row.pendingBalance)}</span><span>{row.creditTermAverageDays == null ? '—' : `${number(Math.round(row.creditTermAverageDays))} d`}</span><span className="pending-ratio">{percent(row.overdueShare, 1)}</span><span>{money(row.sales30)}</span><span className={row.overdueToSales30 == null && row.overdueBalance > 0 ? 'no-sales' : ''}>{row.overdueBalance <= 0 ? '0%' : percent(row.overdueToSales30, 1)}</span><button disabled={!client} onClick={(event) => { event.stopPropagation(); if (client) onOpen(client); }} aria-label={`Abrir ficha de ${row.name}`}><ChevronRight size={15} /></button></article>;
  })}</div>{visible < sorted.length && <button className="button secondary pending-more" onClick={() => setVisible((value) => value + 100)}>Mostrar 100 clientes más</button>}</>;
}

export function PendingBalancesReportView({ data, onOpen, onOpenSeller }: { data: DashboardData; onOpen: (client: Client) => void; onOpenSeller: (seller: string) => void }) {
  const [meta, setMeta] = useState<PendingBalanceReportMeta | null>(null);
  const [report, setReport] = useState<PendingBalanceReportPayload | null>(null);
  const [filters, setFilters] = useState<PendingBalanceFilters>(EMPTY_FILTERS);
  const [view, setView] = useState<ReportView>('sellers');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { fetch('/api/reports/pending-balances/meta').then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'No se pudo abrir el modelo'); return payload as PendingBalanceReportMeta; }).then(setMeta).catch((cause: Error) => { setError(cause.message); setLoading(false); }); }, []);
  useEffect(() => {
    if (!meta) return;
    const controller = new AbortController();
    const parameters = new URLSearchParams();
    if (filters.seller) parameters.set('seller', filters.seller);
    if (filters.paymentMethod) parameters.set('paymentMethod', filters.paymentMethod);
    if (filters.status && filters.status !== 'all') parameters.set('status', filters.status);
    setLoading(true); setError('');
    fetch(`/api/reports/pending-balances?${parameters}`, { signal: controller.signal }).then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'No se pudo calcular el reporte'); return payload as PendingBalanceReportPayload; }).then(setReport).catch((cause: Error) => { if (cause.name !== 'AbortError') setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, meta]);

  const update = <Key extends keyof PendingBalanceFilters>(key: Key, value: PendingBalanceFilters[Key]) => setFilters((current) => ({ ...current, [key]: value }));
  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const clients = useMemo(() => (report?.clients ?? []).filter((row) => !normalizedQuery || `${row.clientId} ${row.name} ${row.tradeName} ${row.seller} ${row.paymentMethod}`.toLocaleLowerCase('es').includes(normalizedQuery)), [normalizedQuery, report?.clients]);

  if (!meta && loading) return <div className="page-view pending-page"><div className="spt-loading"><RefreshCw className="spin" size={24} /><strong>Preparando Saldos Pendientes</strong><span>Conciliando saldos, vencimientos y ventas de 30 días desde GESI…</span></div></div>;
  if (!meta || (!report && error)) return <div className="page-view pending-page"><div className="spt-loading error"><Database size={24} /><strong>No pudimos abrir el reporte</strong><span>{error}</span></div></div>;
  if (!report) return <div className="page-view pending-page"><div className="spt-loading"><RefreshCw className="spin" size={24} /><strong>Calculando Saldos Pendientes</strong></div></div>;

  const maxAging = Math.max(1, ...report.aging.map((row) => row.amount));
  return <div className={`page-view pending-page ${loading ? 'is-loading' : ''}`}>
    <section className="data-card pending-filter-card" data-tour="pending-balances-overview"><div className="pending-filter-heading"><div><span className="section-kicker"><WalletCards size={14} /> Saldos Pendientes Salice</span><h2>Cartera abierta · corte al {shortDate(report.sourceMaxDate)}</h2><p>Comprobantes débito abiertos, vencimientos y ventas brutas móviles desde {shortDate(report.salesWindowFrom)}.</p></div><div className="pending-view-switch" role="tablist" aria-label="Vista del reporte"><button role="tab" aria-selected={view === 'sellers'} className={view === 'sellers' ? 'active' : ''} onClick={() => setView('sellers')}><Users size={15} /> Vendedores</button><button role="tab" aria-selected={view === 'clients'} className={view === 'clients' ? 'active' : ''} onClick={() => setView('clients')}><Store size={15} /> Clientes</button></div></div><div className="pending-filters"><MultiSelectFilter label="Vendedor" value={filters.seller} options={meta.options.sellers} onChange={(value) => update('seller', value)} /><MultiSelectFilter label="Forma de pago" value={filters.paymentMethod} options={meta.options.paymentMethods} onChange={(value) => update('paymentMethod', value)} /><MultiSelectFilter label="Estado del saldo" value={filters.status === 'all' ? '' : filters.status} options={[{ value: 'overdue', label: 'Con saldo vencido' }, { value: 'not_due', label: 'Sólo a vencer' }]} onChange={(value) => update('status', value)} /><button className="button secondary" onClick={() => setFilters(EMPTY_FILTERS)}><Filter size={14} /> Restablecer</button></div>{loading && <div className="nutripet-filter-loading"><RefreshCw className="spin" size={13} /> Recalculando</div>}</section>

    <div className="pending-kpis"><article><span className="pending-kpi-icon green"><CircleDollarSign size={20} /></span><div><small>Saldo pendiente</small><strong>{money(report.pendingBalance, true)}</strong><em>{number(report.clientsWithBalance)} clientes con cartera abierta</em></div></article><article><span className="pending-kpi-icon ochre"><CalendarClock size={20} /></span><div><small>Saldo vencido</small><strong>{money(report.overdueBalance, true)}</strong><em>{number(report.overdueDocuments)} comprobantes vencidos</em></div></article><article><span className="pending-kpi-icon blue"><WalletCards size={20} /></span><div><small>Vencido / pendiente</small><strong>{percent(report.overdueShare, 1)}</strong><em>{number(report.overdueClients)} clientes alcanzados</em></div></article><article><span className="pending-kpi-icon green"><TrendingUp size={20} /></span><div><small>Ventas brutas · 30d</small><strong>{money(report.sales30, true)}</strong><em>{shortDate(report.salesWindowFrom)}–{shortDate(report.sourceMaxDate)}</em></div></article><article><span className="pending-kpi-icon blue"><Users size={20} /></span><div><small>Vencido / ventas 30d</small><strong>{percent(report.overdueToSales30, 1)}</strong><em>presión de cobranza sobre venta reciente</em></div></article></div>

    <div className="pending-main-grid"><section className="data-card pending-seller-card"><div className="data-card-header"><div><span className="section-kicker"><Users size={14} /> Responsables</span><h2>Saldo pendiente por vendedor</h2><p>El segmento oscuro representa la parte vencida. Hacé clic para filtrar toda la pantalla.</p></div><span className="count-badge">{report.sellers.length} {report.sellers.length === 1 ? 'vendedor' : 'vendedores'}</span></div><SellerChart rows={report.sellers} selected={filters.seller} onSelect={(seller) => update('seller', seller)} /></section><section className="data-card pending-aging-card"><div className="data-card-header"><div><span className="section-kicker"><CalendarClock size={14} /> Antigüedad</span><h2>Comprobantes por vencimiento</h2><p>Facturas y notas de débito que permanecen abiertas.</p></div></div><div className="pending-aging-list">{report.aging.map((row) => <article key={row.key}><div><strong>{row.label}</strong><small>{row.documents} comprobantes · {percent(row.share, 1)}</small></div><span><i style={{ width: `${row.amount / maxAging * 100}%` }} /></span><b>{money(row.amount, true)}</b></article>)}</div></section></div>

    {view === 'sellers' ? <section className="data-card pending-detail-card"><div className="data-card-header"><div><span className="section-kicker"><Users size={14} /> Resumen</span><h2>Cartera por vendedor</h2><p>Saldo, vencido y venta reciente bajo el mismo universo.</p></div></div><SellerTable rows={report.sellers} onOpenSeller={onOpenSeller} /></section> : <section className="data-card pending-detail-card"><div className="data-card-header"><div><span className="section-kicker"><Store size={14} /> Detalle operativo</span><h2>Clientes con saldo pendiente</h2><p>La ficha conserva los comprobantes individuales y las gestiones de cobranza.</p></div><span className="count-badge">{number(clients.length)} de {number(report.clients.length)}</span></div><div className="pending-table-tools"><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, ID, vendedor o forma de pago" /></label></div><ClientTable rows={clients} clients={data.clients} onOpen={onOpen} onOpenSeller={onOpenSeller} /></section>}

    <section className="pending-definition-note"><AlertCircle size={17} /><div><strong>Definiciones claras, sin “Infinity”</strong><span><b>Saldo pendiente</b> suma facturas y notas de débito abiertas con vencimiento válido. <b>Saldo vencido</b> toma la parte cuyo primer vencimiento ya pasó. <b>Días prom. CC</b> promedia emisión → vencimiento de esos comprobantes. Cuando no hubo ventas en 30 días, la relación vencido/ventas se muestra como “Sin ventas 30d”.</span><small>Recibos y notas de crédito sin aplicar no se suman como deuda; por eso la cartera documental puede diferir del saldo neto de cuenta corriente.</small></div></section>
    <section className="pending-source-note"><Database size={16} /><div><strong>{meta.sourceSystem}</strong><span>{number(meta.clientCount)} clientes · {number(meta.documentCount)} comprobantes con vencimiento válido · empresa 3 / sucursal 3 · vendedores visibles: {meta.options.sellers.join(', ')}. Foto GESI del {shortDate(meta.asOfDate)}. El Power BI fue utilizado sólo como referencia visual porque el PBIX no estaba disponible.</span></div></section>
  </div>;
}
