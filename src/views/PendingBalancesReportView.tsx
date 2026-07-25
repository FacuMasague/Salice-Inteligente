import { useEffect, useState } from 'react';
import { AlertCircle, CalendarClock, ChevronRight, CircleDollarSign, Database, RefreshCw, TrendingUp, Users, WalletCards } from 'lucide-react';
import type {
  PendingBalanceFilters,
  PendingBalanceReportMeta,
  PendingBalanceReportPayload,
  PendingBalanceSellerRow,
} from '../../shared/models';
import { decodeMultiFilter } from '../../shared/multi-filter';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { ReportContext, ReportEmptyNotice, ReportExportActions, ReportFilterActions, ReportState } from '../components/ReportExperience';
import { SortButton } from '../components/SortButton';
import { money, number } from '../lib/format';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';
import { reportFiltersFromLocation } from '../lib/report-links';

type SellerSortKey = 'seller' | 'clients' | 'overdueClients' | 'pendingBalance' | 'overdueBalance' | 'overdueShare' | 'sales30';

const EMPTY_FILTERS: PendingBalanceFilters = { seller: '', paymentMethod: '', status: 'all' };
const percent = (value: number | null, digits = 0) => value == null ? 'Sin ventas en 30 días' : `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(value)}%`;
const shortDate = (value: string | null) => value ? value.split('-').reverse().join('/') : 'Sin vencimiento';

function SellerChart({ rows, selected, onSelect }: { rows: PendingBalanceSellerRow[]; selected: string; onSelect: (seller: string) => void }) {
  const max = Math.max(1, ...rows.map((row) => row.pendingBalance));
  const selectedSellers = decodeMultiFilter(selected);
  return <div className="pending-seller-chart">{rows.map((row) => <button key={row.seller} className={selectedSellers.includes(row.seller) ? 'selected' : ''} onClick={() => onSelect(selectedSellers.length === 1 && selectedSellers[0] === row.seller ? '' : row.seller)} aria-label={`${row.seller}: ${money(row.pendingBalance)} pendiente, ${money(row.overdueBalance)} vencido`}>
    <strong>{row.seller}</strong><div><span style={{ width: `${row.pendingBalance / max * 100}%` }}><i style={{ width: `${Math.min(100, row.overdueShare)}%` }} /></span></div><b>{money(row.pendingBalance, true)}</b><aside><strong>{row.seller}</strong><span>Vencido <b>{money(row.overdueBalance)}</b></span><span>Pendiente <b>{money(row.pendingBalance)}</b></span><small>{percent(row.overdueShare, 1)} vencido · {row.overdueClients} clientes</small></aside>
  </button>)}</div>;
}

function SellerTable({ rows, onOpenSeller, onOpenReceivables }: { rows: PendingBalanceSellerRow[]; onOpenSeller: (seller: string) => void; onOpenReceivables: (selection: { seller?: string; clientId?: number }) => void }) {
  const [sort, setSort] = useState(emptySort<SellerSortKey>());
  const sorted = sortItems(rows, sort, (row, key) => row[key]);
  const direction = (key: SellerSortKey) => sort.key === key ? sort.direction : null;
  const change = (key: SellerSortKey) => setSort((current) => cycleSort(current, key));
  return <div className="pending-seller-table"><header><SortButton label="Vendedor" direction={direction('seller')} onClick={() => change('seller')} /><SortButton label="Clientes" direction={direction('clients')} onClick={() => change('clients')} /><SortButton label="Clientes vencidos" direction={direction('overdueClients')} onClick={() => change('overdueClients')} /><SortButton label="Saldo pendiente" direction={direction('pendingBalance')} onClick={() => change('pendingBalance')} /><SortButton label="Saldo vencido" direction={direction('overdueBalance')} onClick={() => change('overdueBalance')} /><SortButton label="Vencido / pendiente" direction={direction('overdueShare')} onClick={() => change('overdueShare')} /><SortButton label="Ventas 30 días" direction={direction('sales30')} onClick={() => change('sales30')} /></header>{sorted.map((row) => <article key={row.seller}><span><button className="entity-link" onClick={() => onOpenSeller(row.seller)}>{row.seller}<ChevronRight size={13} /></button><button className="report-inline-action" onClick={() => onOpenReceivables({ seller: row.seller })}>Cobrar</button></span><span>{number(row.clients)}</span><span>{number(row.overdueClients)}</span><span>{money(row.pendingBalance)}</span><span className={row.overdueBalance > 0 ? 'pending' : ''}>{money(row.overdueBalance)}</span><span className="pending-ratio">{percent(row.overdueShare, 1)}</span><span>{money(row.sales30)}</span></article>)}</div>;
}

export function PendingBalancesReportView({ onOpenSeller, onOpenReceivables }: { onOpenSeller: (seller: string) => void; onOpenReceivables: (selection: { seller?: string; clientId?: number }) => void }) {
  const linked = reportFiltersFromLocation('pending-balances', { ...EMPTY_FILTERS });
  const [meta, setMeta] = useState<PendingBalanceReportMeta | null>(null);
  const [report, setReport] = useState<PendingBalanceReportPayload | null>(null);
  const [filters, setFilters] = useState<PendingBalanceFilters>({ seller: linked.seller, paymentMethod: linked.paymentMethod, status: linked.status });
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
  if (!meta && loading) return <ReportState state="loading" title="Preparando Saldos Pendientes" detail="Conciliando saldos, vencimientos y ventas de 30 días desde GESI…" />;
  if (!meta || (!report && error)) return <ReportState state="error" title="No pudimos abrir el reporte" detail={error} onRetry={() => location.reload()} />;
  if (!report) return <ReportState state="loading" title="Calculando Saldos Pendientes" detail="Aplicando el universo y los filtros seleccionados." />;

  const maxAging = Math.max(1, ...report.aging.map((row) => row.amount));
  const savedFilters = { ...filters };
  const receivablesExportUrl = `/api/admin/receivables/export?${new URLSearchParams({ ...filters, format: 'xlsx' })}`;
  const applySaved = (saved: Record<string, string>) => {
    setFilters({ seller: saved.seller || '', paymentMethod: saved.paymentMethod || '', status: saved.status || 'all' });
  };
  return <div className={`page-view pending-page ${loading ? 'is-loading' : ''}`}>
    <section className="data-card pending-filter-card" data-tour="pending-balances-overview"><div className="pending-filter-heading"><div><span className="section-kicker"><WalletCards size={14} /> Saldos Pendientes Salice</span><h2>Resumen de cartera abierta · corte al {shortDate(report.sourceMaxDate)}</h2><p>Esta pantalla resume saldos, vencimientos y presión sobre ventas. El detalle por cliente y las gestiones se trabajan en Cuentas por cobrar.</p></div><span className="pending-summary-badge">Vista resumida</span></div><div className="pending-filters"><MultiSelectFilter label="Vendedor" value={filters.seller} options={meta.options.sellers} onChange={(value) => update('seller', value)} /><MultiSelectFilter label="Forma de pago" value={filters.paymentMethod} options={meta.options.paymentMethods} onChange={(value) => update('paymentMethod', value)} /><MultiSelectFilter label="Estado del saldo" value={filters.status === 'all' ? '' : filters.status} options={[{ value: 'overdue', label: 'Con saldo vencido' }, { value: 'not_due', label: 'Sólo a vencer' }]} onChange={(value) => update('status', value)} /></div><ReportFilterActions view="pending-balances" filters={savedFilters} labels={{ seller: { label: 'Vendedor' }, paymentMethod: { label: 'Forma de pago' }, status: { label: 'Saldo', value: (value) => value === 'all' ? 'Todos' : value === 'overdue' ? 'Vencido' : 'A vencer' } }} onClear={(key) => update(key as keyof PendingBalanceFilters, key === 'status' ? 'all' : '')} onReset={() => setFilters(EMPTY_FILTERS)}><SavedViewsBar viewKey="pending-balances" filters={savedFilters} onApply={applySaved} /></ReportFilterActions>{loading && <div className="nutripet-filter-loading"><RefreshCw className="spin" size={13} /> Recalculando</div>}</section>

    <ReportContext universe="Empresa 3 · sucursal 3 · cartera documental abierta" period={`${report.salesWindowFrom} → ${report.sourceMaxDate} (ventas de los últimos 30 días)`} cutoff={report.sourceMaxDate} comparison="No aplica" partial={false} warnings={['Recibos y notas de crédito sin aplicar no se suman como deuda documental.']} related={[{ view: 'reports', label: 'Abrir Reporte General' }]} actions={<button className="button secondary compact" onClick={() => onOpenReceivables({ seller: decodeMultiFilter(filters.seller).length === 1 ? decodeMultiFilter(filters.seller)[0] : undefined })}><WalletCards size={14} /> Gestionar en Cuentas por cobrar</button>} exports={<ReportExportActions links={[{ href: receivablesExportUrl, label: 'Exportar cartera completa', kind: 'xlsx' }]} />} />
    {!report.clients.length && <ReportEmptyNotice title="No hay saldos para esta selección" detail="Quitá uno o más filtros para revisar otra parte de la cartera." />}

    <div className="pending-kpis"><article><span className="pending-kpi-icon green"><CircleDollarSign size={20} /></span><div><small>Saldo pendiente</small><strong>{money(report.pendingBalance, true)}</strong><em>{number(report.clientsWithBalance)} clientes con cartera abierta</em></div></article><article><span className="pending-kpi-icon ochre"><CalendarClock size={20} /></span><div><small>Saldo vencido</small><strong>{money(report.overdueBalance, true)}</strong><em>{number(report.overdueDocuments)} comprobantes vencidos</em></div></article><article><span className="pending-kpi-icon blue"><WalletCards size={20} /></span><div><small>Vencido / pendiente</small><strong>{percent(report.overdueShare, 1)}</strong><em>{number(report.overdueClients)} clientes alcanzados</em></div></article><article><span className="pending-kpi-icon green"><TrendingUp size={20} /></span><div><small>Ventas brutas · últimos 30 días</small><strong>{money(report.sales30, true)}</strong><em>{shortDate(report.salesWindowFrom)}–{shortDate(report.sourceMaxDate)}</em></div></article><article><span className="pending-kpi-icon blue"><Users size={20} /></span><div><small>Vencido / ventas de 30 días</small><strong>{percent(report.overdueToSales30, 1)}</strong><em>presión de cobranza sobre venta reciente</em></div></article></div>

    <div className="pending-main-grid"><section className="data-card pending-seller-card"><div className="data-card-header"><div><span className="section-kicker"><Users size={14} /> Responsables</span><h2>Saldo pendiente por vendedor</h2><p>El segmento oscuro representa la parte vencida. Hacé clic para filtrar toda la pantalla.</p></div><span className="count-badge">{report.sellers.length} {report.sellers.length === 1 ? 'vendedor' : 'vendedores'}</span></div><SellerChart rows={report.sellers} selected={filters.seller} onSelect={(seller) => update('seller', seller)} /></section><section className="data-card pending-aging-card"><div className="data-card-header"><div><span className="section-kicker"><CalendarClock size={14} /> Antigüedad</span><h2>Comprobantes por vencimiento</h2><p>Facturas y notas de débito que permanecen abiertas.</p></div></div><div className="pending-aging-list">{report.aging.map((row) => <article key={row.key}><div><strong>{row.label}</strong><small>{row.documents} comprobantes · {percent(row.share, 1)}</small></div><span><i style={{ width: `${row.amount / maxAging * 100}%` }} /></span><b>{money(row.amount, true)}</b></article>)}</div></section></div>

    <section className="data-card pending-detail-card"><div className="data-card-header"><div><span className="section-kicker"><Users size={14} /> Resumen</span><h2>Cartera por vendedor</h2><p>Saldo, vencido y venta reciente bajo el mismo universo. Para comprobantes, seguimientos y clientes individuales, abrí Cuentas por cobrar.</p></div></div><SellerTable rows={report.sellers} onOpenSeller={onOpenSeller} onOpenReceivables={onOpenReceivables} /></section>

    <section className="pending-definition-note"><AlertCircle size={17} /><div><strong>Cómo se calculan estos saldos</strong><span><b>Saldo pendiente</b> suma facturas y notas de débito abiertas con vencimiento válido. <b>Saldo vencido</b> toma la parte cuyo primer vencimiento ya pasó. Cuando no hubo ventas en los últimos 30 días, la relación entre vencido y ventas se muestra como “Sin ventas en 30 días”.</span><small>Recibos y notas de crédito sin aplicar no se suman como deuda; por eso la cartera documental puede diferir del saldo neto de cuenta corriente.</small></div></section>
    <section className="pending-source-note"><Database size={16} /><div><strong>{meta.sourceSystem}</strong><span>{number(meta.clientCount)} clientes · {number(meta.documentCount)} comprobantes con vencimiento válido · empresa 3 / sucursal 3 · vendedores visibles: {meta.options.sellers.join(', ')}. Foto GESI del {shortDate(meta.asOfDate)}. El Power BI fue utilizado sólo como referencia visual porque el PBIX no estaba disponible.</span></div></section>
  </div>;
}
