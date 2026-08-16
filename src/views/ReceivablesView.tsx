import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, ClipboardList, Download,
  FileSpreadsheet, History, MessageSquareText, Pencil, ReceiptText, Save, Search,
  ShieldCheck, Trash2, UserRoundCheck, WalletCards, X,
} from 'lucide-react';
import type {
  Client, ReceivableCaseDetail, ReceivableCaseEvent, ReceivableCaseStatus,
  ReceivableDashboardFilters, ReceivableDashboardPayload, ReceivableDashboardRow,
} from '../../shared/models';
import { localizedEditableNumber } from '../../shared/localized-number';
import { decodeMultiFilter, encodeMultiFilter } from '../../shared/multi-filter';
import { MobileFilterSheet } from '../components/MobileFilterSheet';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { SortButton } from '../components/SortButton';
import { clientPrimaryName, clientSecondaryName } from '../lib/client-name';
import { longDate, money, number, shortDate } from '../lib/format';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';

type ReceivableSort = 'name' | 'seller' | 'responsible' | 'status' | 'pendingBalance' | 'overdueBalance' | 'oldestOverdueDays' | 'nextFollowUpAt';

interface ReceivablesViewProps {
  dataClients: Client[];
  navigationRequest?: { id: number; filters: Partial<ReceivableDashboardFilters> } | null;
  onOpenClient: (client: Client) => void;
  onOpenSeller: (seller: string) => void;
  onOpenInvoice: (invoiceId: string) => void;
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

function eventLabel(type: ReceivableCaseEvent['eventType']) {
  return ({
    created: 'Seguimiento iniciado', assignment: 'Responsable modificado', status: 'Estado modificado',
    follow_up: 'Seguimiento guardado', promise: 'Promesa modificada', comment: 'Comentario',
  } as const)[type];
}

function eventDescription(event: ReceivableCaseEvent) {
  if (event.comment) return event.comment;
  if (event.eventType === 'assignment') return `${String(event.before?.responsible || 'Sin asignar')} → ${String(event.after?.responsible || 'Sin asignar')}`;
  if (event.eventType === 'status') {
    const before = statusLabels[String(event.before?.status) as ReceivableCaseStatus] ?? 'Sin gestionar';
    const after = statusLabels[String(event.after?.status) as ReceivableCaseStatus] ?? 'Sin gestionar';
    return `${before} → ${after}`;
  }
  if (event.eventType === 'follow_up' && event.after && Object.hasOwn(event.after, 'status')) {
    const status = statusLabels[String(event.after.status) as ReceivableCaseStatus] ?? 'Sin gestionar';
    const responsible = String(event.after.responsible || 'Sin asignar');
    const next = event.after.nextFollowUpAt ? ` · próximo ${longDate(String(event.after.nextFollowUpAt))}` : '';
    const promise = Number(event.after.promiseAmount ?? 0) > 0
      ? ` · promesa ${money(Number(event.after.promiseAmount))} para ${longDate(String(event.after.promiseDueAt || ''))}` : '';
    return `${status} · ${responsible}${next}${promise}`;
  }
  if (event.eventType === 'follow_up') return `${String(event.before?.nextFollowUpAt || 'Sin fecha')} → ${String(event.after?.nextFollowUpAt || 'Sin fecha')}`;
  if (event.eventType === 'promise') {
    const amount = Number(event.after?.promiseAmount ?? 0);
    return amount ? `${money(amount)} para ${longDate(String(event.after?.promiseDueAt || ''))}` : 'Promesa retirada del seguimiento';
  }
  return 'Se creó el seguimiento administrativo.';
}

function ReceivableDrawer({ row, detail, responsibles, onClose, onSaved, onOpenClient, onOpenInvoice }: {
  row: ReceivableDashboardRow;
  detail: ReceivableCaseDetail | null;
  responsibles: string[];
  onClose: () => void;
  onSaved: (detail: ReceivableCaseDetail) => void;
  onOpenClient: () => void;
  onOpenInvoice: (invoiceId: string) => void;
}) {
  const [responsible, setResponsible] = useState(row.workflow.responsible);
  const [status, setStatus] = useState<ReceivableCaseStatus>(row.workflow.status);
  const [nextFollowUpAt, setNextFollowUpAt] = useState(row.workflow.nextFollowUpAt ?? '');
  const [promiseAmount, setPromiseAmount] = useState(localizedEditableNumber(row.workflow.promiseAmount));
  const [promiseDueAt, setPromiseDueAt] = useState(row.workflow.promiseDueAt ?? '');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true); setError('');
    const response = await fetch(`/api/admin/receivables/${row.clientId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responsible, status, nextFollowUpAt: nextFollowUpAt || null, promiseAmount, promiseDueAt, comment }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setError(payload.error ?? 'No se pudo guardar el seguimiento.'); return; }
    setComment(''); onSaved(payload.detail as ReceivableCaseDetail);
  };

  const removeEvent = async (eventId: string) => {
    if (deleteCandidate !== eventId) { setDeleteCandidate(eventId); return; }
    setError('');
    const response = await fetch(`/api/admin/receivables/${row.clientId}/events/${eventId}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error ?? 'No se pudo borrar el seguimiento.'); return; }
    setDeleteCandidate(''); onSaved(payload as ReceivableCaseDetail);
  };
  const historyEvents = detail?.events.filter((event) => event.eventType !== 'status') ?? [];

  return <div className="admin-drawer-layer">
    <button className="admin-drawer-backdrop" aria-label="Cerrar seguimiento" onClick={onClose} />
    <aside className="admin-drawer receivable-drawer">
      <header><div><span className="section-kicker"><WalletCards size={14} /> Seguimiento administrativo</span><h2>{clientPrimaryName(row)}</h2><p>{clientSecondaryName(row) ? `${clientSecondaryName(row)} · ` : ''}ID {row.clientId} · {row.seller}</p></div><button className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={19} /></button></header>
      <div className="receivable-balance-hero"><div><small>Saldo pendiente</small><strong>{money(row.pendingBalance)}</strong></div><div><small>Saldo vencido</small><strong>{money(row.overdueBalance)}</strong></div><div><small>Antigüedad máxima</small><strong>{number(row.oldestOverdueDays)} días</strong></div><button className="entity-link" onClick={onOpenClient}>Abrir perfil completo <ChevronRight size={14} /></button></div>

      <section className="receivable-workflow-form">
        <h3>Modificar seguimiento</h3>
        {status === 'promise' && (!promiseAmount || !promiseDueAt) && <p className="promise-incomplete-note">Esta promesa todavía no puede aparecer como pago prometido: completá importe y fecha.</p>}
        <div className="form-grid">
          <label><span>Responsable</span><input list={`responsibles-${row.clientId}`} value={responsible} maxLength={120} placeholder="Asignar responsable" onChange={(event) => setResponsible(event.target.value)} /><datalist id={`responsibles-${row.clientId}`}>{responsibles.map((value) => <option key={value} value={value} />)}</datalist></label>
          <label><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value as ReceivableCaseStatus)}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label><span>Próximo seguimiento</span><input type="date" value={nextFollowUpAt} onChange={(event) => setNextFollowUpAt(event.target.value)} /></label>
          {status === 'promise' && <><label><span>Importe prometido</span><input type="text" inputMode="decimal" value={promiseAmount} placeholder="Ej. 125.000,50" onChange={(event) => setPromiseAmount(event.target.value)} required /></label><label><span>Fecha prometida</span><input type="date" value={promiseDueAt} onChange={(event) => setPromiseDueAt(event.target.value)} required /></label></>}
        </div>
        <label className="full-field"><span>Comentario del seguimiento</span><textarea value={comment} maxLength={2000} placeholder="Qué se habló, qué falta o por qué cambia el estado…" onChange={(event) => setComment(event.target.value)} /></label>
        {error && <small className="form-error">{error}</small>}
        <button className="button primary" disabled={saving} onClick={save}><Save size={15} /> {saving ? 'Guardando…' : 'Guardar seguimiento'}</button>
        <p className="workflow-note">Los importes y saldos siguen viniendo de GESI. Los cambios internos se registran con fecha y responsable.</p>
      </section>

      <section className="receivable-documents">
        <div className="drawer-section-title"><ReceiptText size={15} /><h3>Comprobantes abiertos</h3><span>{detail?.documents.length ?? row.openDocuments}</span></div>
        {detail?.documents.map((document) => <button className="receivable-document-row" key={document.documentId} onClick={() => onOpenInvoice(document.documentId)}><div><strong>{document.documentNumber}</strong><small>Emitido {shortDate(document.issuedAt)} · vence {shortDate(document.dueAt)}</small><small>{document.paymentMethod}</small></div><span className={document.status === 'overdue' ? 'overdue' : ''}>{document.status === 'overdue' ? `${number(document.overdueDays)} d vencido` : 'A vencer'}</span><strong>{money(document.outstanding)}</strong><ChevronRight size={15} /></button>)}
        {!detail && <p className="drawer-loading">Cargando comprobantes…</p>}
      </section>

      <section className="receivable-history">
        <div className="drawer-section-title"><History size={15} /><h3>Historial de seguimientos</h3><span>{historyEvents.filter((event) => !event.deletedAt).length}</span></div>
        {historyEvents.map((event) => <article key={event.id} className={event.deletedAt ? 'deleted' : ''}><i className={event.eventType} /><div><strong>{eventLabel(event.eventType)}</strong><span>{eventDescription(event)}</span><small>{event.actor} · {new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(event.createdAt))}{event.deletedAt ? ` · eliminado por ${event.deletedBy}` : ''}</small></div>{!event.deletedAt && <button className={`history-delete ${deleteCandidate === event.id ? 'confirm' : ''}`} title={deleteCandidate === event.id ? 'Confirmar eliminación' : 'Borrar seguimiento'} onClick={() => removeEvent(event.id)}>{deleteCandidate === event.id ? <><Trash2 size={13} /> Confirmar</> : <Trash2 size={14} />}</button>}</article>)}
        {detail && !historyEvents.length && <p className="drawer-empty">Todavía no hay seguimientos registrados.</p>}
      </section>
    </aside>
  </div>;
}

export function ReceivablesView({ dataClients, navigationRequest, onOpenClient, onOpenSeller, onOpenInvoice }: ReceivablesViewProps) {
  const [filters, setFilters] = useState<ReceivableDashboardFilters>(emptyFilters);
  const [payload, setPayload] = useState<ReceivableDashboardPayload | null>(null);
  const [selected, setSelected] = useState<ReceivableDashboardRow | null>(null);
  const [detail, setDetail] = useState<ReceivableCaseDetail | null>(null);
  const [sort, setSort] = useState(emptySort<ReceivableSort>());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!navigationRequest) return;
    setFilters((current) => ({ ...current, ...navigationRequest.filters }));
  }, [navigationRequest?.id]);

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
    setSelected((current) => current && current.clientId === nextDetail.workflow.clientId ? { ...current, workflow: nextDetail.workflow } : current);
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

  const activeStatuses = decodeMultiFilter(filters.internalStatus);
  const toggleStatus = (status: ReceivableCaseStatus) => changeFilter('internalStatus', activeStatuses.length === 1 && activeStatuses[0] === status ? '' : encodeMultiFilter([status]));
  const activeFilterCount = [filters.seller, filters.paymentMethod, filters.status, filters.responsible, filters.internalStatus, filters.aging].filter(Boolean).length;

  return <div className={`page-view receivables-page ${loading ? 'is-loading' : ''}`} data-tour="receivables-overview">
    <section className="data-card admin-filter-card">
      <div className="data-card-header"><div><span className="section-kicker"><WalletCards size={14} /> Centro administrativo</span><h2>Cartera abierta y trabajo pendiente</h2><p>La deuda proviene de GESI; responsables, promesas y seguimientos son información humana separada.</p></div><div className="admin-export-actions"><a className="button ghost compact" href={exportUrl('csv')}><Download size={14} /> CSV</a><a className="button ghost compact" href={exportUrl('xlsx')}><FileSpreadsheet size={14} /> Excel</a></div></div>
      <div className="receivable-filter-grid"><label className="admin-search-field"><Search size={15} /><input value={filters.query} placeholder="Cliente, vendedor o comentario" onChange={(event) => changeFilter('query', event.target.value)} /></label></div>
      <MobileFilterSheet
        title="Filtrar cuentas por cobrar"
        description="Acotá la bandeja por vendedor, saldo y estado de seguimiento. La búsqueda principal queda siempre visible."
        activeCount={activeFilterCount}
      >
        <div className="receivable-filter-grid"><MultiSelectFilter label="Vendedor" value={filters.seller} options={payload.options.sellers} onChange={(value) => changeFilter('seller', value)} /><MultiSelectFilter label="Forma de pago" value={filters.paymentMethod} options={payload.options.paymentMethods} onChange={(value) => changeFilter('paymentMethod', value)} /><MultiSelectFilter label="Saldo" value={filters.status} options={balanceOptions} onChange={(value) => changeFilter('status', value)} /><MultiSelectFilter label="Responsable" value={filters.responsible} options={payload.options.responsibles} onChange={(value) => changeFilter('responsible', value)} /><MultiSelectFilter label="Estado interno" value={filters.internalStatus} options={statusOptions} onChange={(value) => changeFilter('internalStatus', value)} /><MultiSelectFilter label="Antigüedad" value={filters.aging} options={agingOptions} onChange={(value) => changeFilter('aging', value)} /><button className="button ghost" onClick={() => setFilters(emptyFilters)}>Restablecer</button></div>
        <SavedViewsBar viewKey="receivables" purpose="collections" filters={asRecord(filters)} onApply={applySaved} />
      </MobileFilterSheet>
    </section>

    <div className="admin-kpi-strip receivable-kpis"><button><span><WalletCards size={19} /></span><div><small>Saldo pendiente</small><strong>{money(payload.pendingBalance, true)}</strong><em>{number(payload.openDocuments)} comprobantes</em></div></button><button><span><AlertTriangle size={19} /></span><div><small>Saldo vencido</small><strong>{money(payload.overdueBalance, true)}</strong><em>{percent(payload.overdueShare)} de la cartera</em></div></button><button><span><CalendarClock size={19} /></span><div><small>Seguimientos exigibles</small><strong>{number(payload.dueFollowUps)}</strong><em>Hasta hoy</em></div></button><button><span><UserRoundCheck size={19} /></span><div><small>Sin gestionar</small><strong>{number(payload.unmanagedClients)}</strong><em>De {number(payload.clientsWithBalance)} cuentas</em></div></button><button><span><CheckCircle2 size={19} /></span><div><small>Clientes vencidos</small><strong>{number(payload.overdueClients)}</strong><em>{number(payload.overdueDocuments)} comprobantes</em></div></button></div>

    <div className="receivable-summary-grid">
      <section className="data-card"><div className="data-card-header"><div><span className="section-kicker"><CalendarClock size={14} /> Antigüedad</span><h2>Composición de la cartera</h2></div></div><div className="receivable-aging">{payload.aging.map((row) => <article key={row.key}><div><strong>{row.label}</strong><span>{number(row.documents)} comprobantes</span></div><div className="aging-track"><i style={{ width: `${Math.min(100, row.share)}%` }} /></div><b>{money(row.amount)}</b></article>)}</div></section>
      <section className="data-card"><div className="data-card-header"><div><span className="section-kicker"><ClipboardList size={14} /> Flujo interno</span><h2>Filtrar por estado</h2><p>Seleccioná un cuadrante para limitar la bandeja.</p></div></div><div className="receivable-status-grid">{payload.statusBreakdown.map((row) => <button key={row.status} className={`${row.status} ${activeStatuses.includes(row.status) ? 'active' : ''}`} aria-pressed={activeStatuses.includes(row.status)} onClick={() => toggleStatus(row.status)}><span>{statusLabels[row.status]}</span><strong>{number(row.clients)}</strong><small>{money(row.amount, true)}</small></button>)}</div></section>
    </div>

    <section className="data-card receivable-table-card"><div className="data-card-header"><div><span className="section-kicker"><MessageSquareText size={14} /> Bandeja de trabajo</span><h2>Cuentas por cobrar</h2><p>La razón social abre el cliente; el lápiz permite modificar el seguimiento.</p></div><span className="count-badge">{number(payload.rows.length)} cuentas</span></div><div className="admin-table receivables"><header><SortButton label="Cliente" direction={direction('name')} onClick={() => setSort((state) => cycleSort(state, 'name'))} /><SortButton label="Vendedor" direction={direction('seller')} onClick={() => setSort((state) => cycleSort(state, 'seller'))} /><SortButton label="Responsable / estado" direction={direction('responsible')} onClick={() => setSort((state) => cycleSort(state, 'responsible'))} /><SortButton label="Pendiente" direction={direction('pendingBalance')} onClick={() => setSort((state) => cycleSort(state, 'pendingBalance'))} /><SortButton label="Vencido" direction={direction('overdueBalance')} onClick={() => setSort((state) => cycleSort(state, 'overdueBalance'))} /><SortButton label="Antigüedad" direction={direction('oldestOverdueDays')} onClick={() => setSort((state) => cycleSort(state, 'oldestOverdueDays'))} /><SortButton label="Próximo seguimiento" direction={direction('nextFollowUpAt')} onClick={() => setSort((state) => cycleSort(state, 'nextFollowUpAt'))} /><span>Modificar</span></header>{sorted.map((row) => <article key={row.clientId} className={row.workflow.nextFollowUpAt && row.workflow.nextFollowUpAt <= today && row.workflow.status !== 'resolved' ? 'follow-up-due' : ''}><button className="admin-drill-entity" onClick={() => openProfile(row.clientId)}><strong>{clientPrimaryName(row)}</strong><small>{clientSecondaryName(row) ? `${clientSecondaryName(row)} · ` : ''}ID {row.clientId} · {row.paymentMethod} · {number(row.openDocuments)} comprobantes</small></button><button className="entity-link" onClick={() => onOpenSeller(row.seller)}>{row.seller}</button><div className="workflow-cell"><strong>{row.workflow.responsible || 'Sin asignar'}</strong><span className={`status-pill ${row.workflow.status}`}>{statusLabels[row.workflow.status]}</span>{row.workflow.status === 'promise' && row.workflow.promiseAmount && <small>{money(row.workflow.promiseAmount)} · {longDate(row.workflow.promiseDueAt ?? '')}</small>}{row.workflow.status === 'promise' && !row.workflow.promiseAmount && <small className="promise-incomplete-inline">Completar importe y fecha</small>}{row.workflow.lastComment && <small>{row.workflow.lastComment}</small>}</div><span>{money(row.pendingBalance)}</span><span className="overdue-value">{money(row.overdueBalance)}<small>{percent(row.overdueShare)}</small></span><span>{row.oldestOverdueDays ? `${number(row.oldestOverdueDays)} días` : 'A vencer'}</span><span>{row.workflow.nextFollowUpAt ? longDate(row.workflow.nextFollowUpAt) : 'Sin fecha'}</span><button className="icon-button edit-workflow-button" aria-label={`Modificar seguimiento de ${clientPrimaryName(row)}`} onClick={() => openWorkflow(row)}><Pencil size={15} /></button></article>)}</div></section>
    <section className="general-source-note"><ShieldCheck size={18} /><div><strong>Separación de responsabilidades</strong><span>Los importes y vencimientos corresponden a los datos del {payload.sourceMaxDate}. El seguimiento interno se conserva entre actualizaciones.</span><small>“Cerrado internamente” no cancela ni modifica una deuda; sólo cierra el seguimiento dentro del programa.</small></div></section>
    {selected && <ReceivableDrawer key={selected.clientId} row={selected} detail={detail} responsibles={payload.options.responsibles} onClose={() => { setSelected(null); setDetail(null); }} onSaved={saved} onOpenClient={() => { const clientId = selected.clientId; setSelected(null); setDetail(null); openProfile(clientId); }} onOpenInvoice={onOpenInvoice} />}
  </div>;
}
