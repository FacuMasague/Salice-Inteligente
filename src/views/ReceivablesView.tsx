import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, ClipboardList, Download, FileSpreadsheet, History, MessageSquareText, Search, ShieldCheck, UserRoundCheck, WalletCards, X } from 'lucide-react';
import type { Client, ReceivableCaseDetail, ReceivableCaseStatus, ReceivableDashboardFilters, ReceivableDashboardPayload, ReceivableDashboardRow } from '../../shared/models';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { SortButton } from '../components/SortButton';
import { longDate, money, number, shortDate } from '../lib/format';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';

type ReceivableSort = 'name' | 'seller' | 'responsible' | 'status' | 'pendingBalance' | 'overdueBalance' | 'oldestOverdueDays' | 'nextFollowUpAt';

interface ReceivablesViewProps {
  dataClients: Client[];
  onOpenClient: (client: Client) => void;
}

const statusLabels: Record<ReceivableCaseStatus, string> = {
  unmanaged: 'Sin gestionar',
  to_contact: 'Contactar',
  in_progress: 'En seguimiento',
  promise: 'Promesa informada',
  disputed: 'En revisión',
  resolved: 'Cerrado internamente',
};

const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));
const agingOptions = [
  { value: 'overdue_90', label: 'Más de 90 días' }, { value: 'overdue_61_90', label: '61–90 días' },
  { value: 'overdue_31_60', label: '31–60 días' }, { value: 'overdue_1_30', label: '1–30 días' },
  { value: 'not_due', label: 'A vencer' },
];
const balanceOptions = [{ value: 'overdue', label: 'Con vencido' }, { value: 'not_due', label: 'Sólo a vencer' }];
const emptyFilters: ReceivableDashboardFilters = { seller: '', paymentMethod: '', status: '', responsible: '', internalStatus: '', aging: '', query: '' };
const asRecord = (filters: ReceivableDashboardFilters): Record<string, string> => ({ ...filters });
const percent = (value: number) => `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value)}%`;
const argentinaToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

function eventLabel(type: ReceivableCaseDetail['events'][number]['eventType']) {
  return ({ created: 'Caso iniciado', assignment: 'Responsable', status: 'Estado', follow_up: 'Próximo seguimiento', comment: 'Comentario' } as const)[type];
}

function ReceivableDrawer({ row, detail, responsibles, onClose, onSaved, onOpenClient }: {
  row: ReceivableDashboardRow;
  detail: ReceivableCaseDetail | null;
  responsibles: string[];
  onClose: () => void;
  onSaved: (detail: ReceivableCaseDetail) => void;
  onOpenClient: () => void;
}) {
  const [responsible, setResponsible] = useState(row.workflow.responsible);
  const [status, setStatus] = useState<ReceivableCaseStatus>(row.workflow.status);
  const [nextFollowUpAt, setNextFollowUpAt] = useState(row.workflow.nextFollowUpAt ?? '');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setSaving(true); setError('');
    const response = await fetch(`/api/admin/receivables/${row.clientId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responsible, status, nextFollowUpAt: nextFollowUpAt || null, comment }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setError(payload.error ?? 'No se pudo guardar el seguimiento.'); return; }
    setComment(''); onSaved(payload.detail as ReceivableCaseDetail);
  };
  return <div className="admin-drawer-layer"><button className="admin-drawer-backdrop" aria-label="Cerrar seguimiento" onClick={onClose} /><aside className="admin-drawer receivable-drawer">
    <header><div><span className="section-kicker"><WalletCards size={14} /> Seguimiento administrativo</span><h2>{row.tradeName || row.name}</h2><p>ID {row.clientId} · {row.seller}</p></div><button className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={19} /></button></header>
    <div className="receivable-balance-hero"><div><small>Saldo pendiente</small><strong>{money(row.pendingBalance)}</strong></div><div><small>Saldo vencido</small><strong>{money(row.overdueBalance)}</strong></div><div><small>Antigüedad máxima</small><strong>{row.oldestOverdueDays} días</strong></div><button className="entity-link" onClick={onOpenClient}>Abrir perfil completo <ChevronRight size={14} /></button></div>
    <section className="receivable-workflow-form"><h3>Asignación y estado interno</h3><div className="form-grid"><label><span>Responsable</span><input list={`responsibles-${row.clientId}`} value={responsible} maxLength={120} placeholder="Asignar responsable" onChange={(event) => setResponsible(event.target.value)} /><datalist id={`responsibles-${row.clientId}`}>{responsibles.map((value) => <option key={value} value={value} />)}</datalist></label><label><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value as ReceivableCaseStatus)}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label><span>Próximo seguimiento</span><input type="date" value={nextFollowUpAt} onChange={(event) => setNextFollowUpAt(event.target.value)} /></label></div><label className="full-field"><span>Comentario auditable</span><textarea value={comment} maxLength={2000} placeholder="Qué se habló, qué falta o por qué cambia el estado…" onChange={(event) => setComment(event.target.value)} /></label>{error && <small className="form-error">{error}</small>}<button className="button primary" disabled={saving} onClick={save}><ShieldCheck size={15} /> {saving ? 'Guardando…' : 'Guardar seguimiento'}</button><p className="workflow-note">Mientras no existan usuarios, las acciones se registran como “Oficina Salice”. El historial es append-only.</p></section>
    <section className="receivable-documents"><div className="drawer-section-title"><ClipboardList size={15} /><h3>Comprobantes abiertos</h3><span>{detail?.documents.length ?? row.openDocuments}</span></div>{detail?.documents.map((document) => <article key={document.documentId}><div><strong>{document.documentNumber}</strong><small>Emitido {shortDate(document.issuedAt)} · vence {shortDate(document.dueAt)}</small></div><span className={document.status === 'overdue' ? 'overdue' : ''}>{document.status === 'overdue' ? `${document.overdueDays} d vencido` : 'A vencer'}</span><strong>{money(document.outstanding)}</strong></article>)}{!detail && <p className="drawer-loading">Cargando comprobantes…</p>}</section>
    <section className="receivable-history"><div className="drawer-section-title"><History size={15} /><h3>Historial auditable</h3><span>{detail?.workflow.eventCount ?? 0}</span></div>{detail?.events.map((event) => <article key={event.id}><i className={event.eventType} /><div><strong>{eventLabel(event.eventType)}</strong><span>{event.comment || `${JSON.stringify(event.before ?? {})} → ${JSON.stringify(event.after ?? {})}`}</span><small>{event.actor} · {new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(event.createdAt))}</small></div></article>)}{detail && !detail.events.length && <p className="drawer-empty">Todavía no hay acciones registradas.</p>}</section>
  </aside></div>;
}

export function ReceivablesView({ dataClients, onOpenClient }: ReceivablesViewProps) {
  const [filters, setFilters] = useState<ReceivableDashboardFilters>(emptyFilters);
  const [payload, setPayload] = useState<ReceivableDashboardPayload | null>(null);
  const [selected, setSelected] = useState<ReceivableDashboardRow | null>(null);
  const [detail, setDetail] = useState<ReceivableCaseDetail | null>(null);
  const [sort, setSort] = useState(emptySort<ReceivableSort>());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = () => {
    const controller = new AbortController();
    setLoading(true); setError('');
    fetch(`/api/admin/receivables?${new URLSearchParams(asRecord(filters))}`, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error('No se pudo abrir el tablero de cuentas por cobrar.');
      return response.json();
    }).then((value: ReceivableDashboardPayload) => { setPayload(value); setLoading(false); }).catch((cause: Error) => {
      if (cause.name !== 'AbortError') { setError(cause.message); setLoading(false); }
    });
    return controller;
  };
  useEffect(() => { const controller = reload(); return () => controller.abort(); }, [filters]);

  const changeFilter = <Key extends keyof ReceivableDashboardFilters>(key: Key, value: ReceivableDashboardFilters[Key]) => setFilters((current) => ({ ...current, [key]: value }));
  const openWorkflow = async (row: ReceivableDashboardRow) => {
    setSelected(row); setDetail(null);
    const response = await fetch(`/api/admin/receivables/${row.clientId}`);
    if (response.ok) setDetail(await response.json());
  };
  const saved = (nextDetail: ReceivableCaseDetail) => {
    setDetail(nextDetail);
    setSelected((current) => current && current.clientId === nextDetail.workflow.clientId
      ? { ...current, workflow: nextDetail.workflow }
      : current);
    reload();
  };
  const openProfile = (clientId: number) => { const client = dataClients.find((value) => value.id === clientId); if (client) onOpenClient(client); };
  const sorted = useMemo(() => sortItems(payload?.rows ?? [], sort, (row, key) => key === 'responsible' ? row.workflow.responsible : key === 'status' ? row.workflow.status : key === 'nextFollowUpAt' ? row.workflow.nextFollowUpAt : row[key]), [payload, sort]);
  const direction = (key: ReceivableSort) => sort.key === key ? sort.direction : null;
  const exportUrl = (format: 'csv' | 'xlsx') => `/api/admin/receivables/export?${new URLSearchParams({ ...filters, format })}`;
  const applySaved = (savedFilters: Record<string, string>) => setFilters((current) => ({ ...current, ...savedFilters }));
  const today = argentinaToday();

  if (error && !payload) return <div className="page-view"><section className="data-card report-error"><AlertTriangle size={22} /><div><h2>Cuentas por cobrar no disponible</h2><p>{error}</p></div></section></div>;
  if (!payload) return <div className="page-view"><section className="data-card report-loading"><span /><h2>Consolidando la cartera…</h2><p>Uniendo saldos GESI con el seguimiento administrativo local.</p></section></div>;

  return <div className={`page-view receivables-page ${loading ? 'is-loading' : ''}`} data-tour="receivables-overview">
    <section className="data-card admin-filter-card"><div className="data-card-header"><div><span className="section-kicker"><WalletCards size={14} /> Centro administrativo</span><h2>Cartera abierta y trabajo pendiente</h2><p>La deuda proviene de GESI; responsables, estados y comentarios son información humana separada y auditable.</p></div><div className="admin-export-actions"><a className="button ghost compact" href={exportUrl('csv')}><Download size={14} /> CSV</a><a className="button ghost compact" href={exportUrl('xlsx')}><FileSpreadsheet size={14} /> Excel</a></div></div><div className="receivable-filter-grid"><MultiSelectFilter label="Vendedor" value={filters.seller} options={payload.options.sellers} onChange={(value) => changeFilter('seller', value)} /><MultiSelectFilter label="Forma de pago" value={filters.paymentMethod} options={payload.options.paymentMethods} onChange={(value) => changeFilter('paymentMethod', value)} /><MultiSelectFilter label="Saldo" value={filters.status} options={balanceOptions} onChange={(value) => changeFilter('status', value)} /><MultiSelectFilter label="Responsable" value={filters.responsible} options={payload.options.responsibles} onChange={(value) => changeFilter('responsible', value)} /><MultiSelectFilter label="Estado interno" value={filters.internalStatus} options={statusOptions} onChange={(value) => changeFilter('internalStatus', value)} /><MultiSelectFilter label="Antigüedad" value={filters.aging} options={agingOptions} onChange={(value) => changeFilter('aging', value)} /><label className="admin-search-field"><Search size={15} /><input value={filters.query} placeholder="Cliente, vendedor o comentario" onChange={(event) => changeFilter('query', event.target.value)} /></label><button className="button ghost" onClick={() => setFilters(emptyFilters)}>Restablecer</button></div><SavedViewsBar viewKey="receivables" filters={asRecord(filters)} onApply={applySaved} /></section>

    <div className="admin-kpi-strip receivable-kpis"><button><span><WalletCards size={19} /></span><div><small>Saldo pendiente</small><strong>{money(payload.pendingBalance, true)}</strong><em>{number(payload.openDocuments)} comprobantes</em></div></button><button><span><AlertTriangle size={19} /></span><div><small>Saldo vencido</small><strong>{money(payload.overdueBalance, true)}</strong><em>{percent(payload.overdueShare)} de la cartera</em></div></button><button><span><CalendarClock size={19} /></span><div><small>Seguimientos exigibles</small><strong>{number(payload.dueFollowUps)}</strong><em>Hasta hoy</em></div></button><button><span><UserRoundCheck size={19} /></span><div><small>Sin gestionar</small><strong>{number(payload.unmanagedClients)}</strong><em>De {number(payload.clientsWithBalance)} cuentas</em></div></button><button><span><CheckCircle2 size={19} /></span><div><small>Clientes vencidos</small><strong>{number(payload.overdueClients)}</strong><em>{number(payload.overdueDocuments)} comprobantes</em></div></button></div>

    <div className="receivable-summary-grid"><section className="data-card"><div className="data-card-header"><div><span className="section-kicker"><CalendarClock size={14} /> Antigüedad</span><h2>Composición de la cartera</h2></div></div><div className="receivable-aging">{payload.aging.map((row) => <article key={row.key}><div><strong>{row.label}</strong><span>{row.documents} comprobantes</span></div><div className="aging-track"><i style={{ width: `${Math.min(100, row.share)}%` }} /></div><b>{money(row.amount)}</b></article>)}</div></section><section className="data-card"><div className="data-card-header"><div><span className="section-kicker"><ClipboardList size={14} /> Flujo interno</span><h2>Estado de seguimiento</h2></div></div><div className="receivable-status-grid">{payload.statusBreakdown.map((row) => <article key={row.status} className={row.status}><span>{statusLabels[row.status]}</span><strong>{number(row.clients)}</strong><small>{money(row.amount, true)}</small></article>)}</div></section></div>

    <section className="data-card receivable-table-card"><div className="data-card-header"><div><span className="section-kicker"><MessageSquareText size={14} /> Bandeja de trabajo</span><h2>Cuentas por cobrar</h2><p>Ordená la tabla o abrí una cuenta para asignar responsable, estado, seguimiento y comentarios.</p></div><span className="count-badge">{number(payload.rows.length)} cuentas</span></div><div className="admin-table receivables"><header><SortButton label="Cliente" direction={direction('name')} onClick={() => setSort((state) => cycleSort(state, 'name'))} /><SortButton label="Vendedor" direction={direction('seller')} onClick={() => setSort((state) => cycleSort(state, 'seller'))} /><SortButton label="Responsable / estado" direction={direction('responsible')} onClick={() => setSort((state) => cycleSort(state, 'responsible'))} /><SortButton label="Pendiente" direction={direction('pendingBalance')} onClick={() => setSort((state) => cycleSort(state, 'pendingBalance'))} /><SortButton label="Vencido" direction={direction('overdueBalance')} onClick={() => setSort((state) => cycleSort(state, 'overdueBalance'))} /><SortButton label="Antigüedad" direction={direction('oldestOverdueDays')} onClick={() => setSort((state) => cycleSort(state, 'oldestOverdueDays'))} /><SortButton label="Próximo seguimiento" direction={direction('nextFollowUpAt')} onClick={() => setSort((state) => cycleSort(state, 'nextFollowUpAt'))} /></header>{sorted.map((row) => <article key={row.clientId} className={row.workflow.nextFollowUpAt && row.workflow.nextFollowUpAt <= today && row.workflow.status !== 'resolved' ? 'follow-up-due' : ''}><button className="admin-drill-entity" onClick={() => openWorkflow(row)}><strong>{row.tradeName || row.name}</strong><small>ID {row.clientId} · {row.paymentMethod} · {row.openDocuments} comprobantes</small></button><button className="entity-link" onClick={() => openProfile(row.clientId)}>{row.seller}</button><button className="workflow-cell" onClick={() => openWorkflow(row)}><strong>{row.workflow.responsible || 'Sin asignar'}</strong><span className={`status-pill ${row.workflow.status}`}>{statusLabels[row.workflow.status]}</span>{row.workflow.lastComment && <small>{row.workflow.lastComment}</small>}</button><span>{money(row.pendingBalance)}</span><span className="overdue-value">{money(row.overdueBalance)}<small>{percent(row.overdueShare)}</small></span><span>{row.oldestOverdueDays ? `${row.oldestOverdueDays} días` : 'A vencer'}</span><span>{row.workflow.nextFollowUpAt ? longDate(row.workflow.nextFollowUpAt) : 'Sin fecha'}</span></article>)}</div></section>
    <section className="general-source-note"><ShieldCheck size={18} /><div><strong>Separación de responsabilidades</strong><span>Los importes y vencimientos corresponden al corte GESI {payload.sourceMaxDate}. El flujo interno vive en `operations.sqlite` y no se reemplaza al actualizar datos.</span><small>“Cerrado internamente” no cancela ni modifica una deuda en GESI; sólo cierra el seguimiento local.</small></div></section>
    {selected && <ReceivableDrawer row={selected} detail={detail} responsibles={payload.options.responsibles} onClose={() => { setSelected(null); setDetail(null); }} onSaved={saved} onOpenClient={() => openProfile(selected.clientId)} />}
  </div>;
}
