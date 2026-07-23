import { useEffect, useMemo, useState } from 'react';
import { Archive, Check, Clock3, CopyPlus, Database, FileDown, FileSpreadsheet, History, Plus, Save, Target, Trash2 } from 'lucide-react';
import type { CommercialGoalProgressPayload, CommercialGoalRow, CommercialGoalsPayload, GeneralReportPayload } from '../../shared/models';
import { localizedEditableNumber } from '../../shared/localized-number';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { SingleSelectFilter } from '../components/SingleSelectFilter';
import { SortButton } from '../components/SortButton';
import { money, number } from '../lib/format';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';

type GoalSort = 'product' | 'seller' | 'kilos' | 'accounts' | 'invoicing';
const monthLabel = (month: string) => new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`));
const metric = (value: number, unit: GeneralReportPayload['unit']) => unit === 'currency' ? money(value, true) : `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value)} kg`;
const optionalNumber = (value: string) => value.trim() === '' ? null : value;

function goalChangeLabel(type: CommercialGoalsPayload['changes'][number]['eventType']) {
  return ({
    created: 'Versión creada',
    row_created: 'Objetivo agregado',
    row_updated: 'Objetivo modificado',
    row_deleted: 'Objetivo eliminado',
    activated: 'Versión activada',
  } as const)[type];
}

function EditableGoalRow({ row, versionId, sellers, products, onChanged, onDeleted }: {
  row: CommercialGoalRow;
  versionId: string;
  sellers: string[];
  products: string[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [product, setProduct] = useState(row.product);
  const [seller, setSeller] = useState(row.seller);
  const initialKilos = localizedEditableNumber(row.kilos);
  const initialAccounts = localizedEditableNumber(row.accounts, 0);
  const initialInvoicing = localizedEditableNumber(row.invoicing);
  const [kilos, setKilos] = useState(initialKilos);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [invoicing, setInvoicing] = useState(initialInvoicing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const changed = product !== row.product || seller !== row.seller || kilos !== initialKilos || accounts !== initialAccounts || invoicing !== initialInvoicing;
  const save = async () => {
    setSaving(true); setError('');
    const response = await fetch(`/api/admin/goals/versions/${versionId}/rows/${row.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: row.month, product, seller, kilos: optionalNumber(kilos), accounts: optionalNumber(accounts), invoicing: optionalNumber(invoicing), comment: 'Edición desde Configuración de objetivos' }),
    });
    const payload = await response.json().catch(() => ({})); setSaving(false);
    if (!response.ok) { setError(payload.error ?? 'No se pudo guardar.'); return; }
    onChanged();
  };
  const remove = async () => {
    if (!window.confirm('¿Eliminar este objetivo del borrador? El cambio quedará en el historial.')) return;
    const response = await fetch(`/api/admin/goals/versions/${versionId}/rows/${row.id}`, { method: 'DELETE' });
    if (!response.ok) { setError('No se pudo eliminar.'); return; }
    onDeleted();
  };
  return <article className={changed ? 'changed' : ''}><label><span>Producto / lectura</span><input list="goal-products" value={product} onChange={(event) => setProduct(event.target.value)} /></label><label><span>Vendedor</span><input list="goal-sellers" value={seller} onChange={(event) => setSeller(event.target.value)} /></label><label><span>Kilos</span><input type="text" inputMode="decimal" value={kilos} onChange={(event) => setKilos(event.target.value)} /></label><label><span>Cuentas</span><input type="text" inputMode="numeric" value={accounts} onChange={(event) => setAccounts(event.target.value)} /></label><label><span>Facturación</span><input type="text" inputMode="decimal" value={invoicing} onChange={(event) => setInvoicing(event.target.value)} /></label><div className="goal-row-actions"><button disabled={!changed || saving} title="Guardar fila" onClick={save}><Save size={14} /></button><button title="Eliminar fila" onClick={remove}><Trash2 size={14} /></button></div>{error && <small className="goal-row-error">{error}</small>}</article>;
}

export function GoalsView() {
  const [payload, setPayload] = useState<CommercialGoalsPayload | null>(null);
  const [versionId, setVersionId] = useState('');
  const [month, setMonth] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(emptySort<GoalSort>());
  const [creating, setCreating] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({ product: '', seller: '', kilos: '', accounts: '', invoicing: '' });
  const [progress, setProgress] = useState<CommercialGoalProgressPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = (requestedVersion = versionId, requestedMonth = month) => {
    const queryParams = new URLSearchParams();
    if (requestedVersion) queryParams.set('versionId', requestedVersion);
    if (requestedMonth) queryParams.set('month', requestedMonth);
    setLoading(true); setError('');
    return fetch(`/api/admin/goals?${queryParams}`).then((response) => {
      if (!response.ok) return response.json().then((body) => Promise.reject(new Error(body.error ?? 'No se pudieron cargar los objetivos.')));
      return response.json();
    }).then((value: CommercialGoalsPayload) => {
      setPayload(value); setVersionId(value.selectedVersion.id); setMonth(value.selectedMonth); setLoading(false); return value;
    }).catch((cause: Error) => { setError(cause.message); setLoading(false); throw cause; });
  };
  useEffect(() => { load('', '').catch(() => undefined); }, []);

  useEffect(() => {
    if (!payload || !payload.selectedMonth) { setProgress(null); return; }
    fetch(`/api/admin/goals/progress?${new URLSearchParams({ versionId: payload.selectedVersion.id, month: payload.selectedMonth })}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error()))
      .then(setProgress).catch(() => setProgress(null));
  }, [payload?.selectedVersion.id, payload?.selectedMonth]);

  const changeVersion = (next: string) => { setVersionId(next); setMonth(''); load(next, '').catch(() => undefined); };
  const changeMonth = (next: string) => { setMonth(next); load(versionId, next).catch(() => undefined); };
  const createVersion = async () => {
    if (!payload || !newVersionName.trim()) return;
    const response = await fetch('/api/admin/goals/versions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newVersionName, cloneFromId: payload.selectedVersion.id }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error ?? 'No se pudo crear la versión.'); return; }
    setCreating(false); setNewVersionName(''); setVersionId(body.version.id); load(body.version.id, month).catch(() => undefined);
  };
  const activate = async () => {
    if (!payload || !window.confirm(`¿Activar “${payload.selectedVersion.name}”? El Reporte General comenzará a usar estos objetivos y la versión actual quedará archivada.`)) return;
    const response = await fetch(`/api/admin/goals/versions/${payload.selectedVersion.id}/activate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: 'Activación confirmada desde la administración de objetivos.' }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error ?? 'No se pudo activar la versión.'); return; }
    load(payload.selectedVersion.id, month).catch(() => undefined);
  };
  const addRow = async () => {
    if (!payload) return;
    const response = await fetch(`/api/admin/goals/versions/${payload.selectedVersion.id}/rows`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: payload.selectedMonth, product: newRow.product, seller: newRow.seller, kilos: optionalNumber(newRow.kilos), accounts: optionalNumber(newRow.accounts), invoicing: optionalNumber(newRow.invoicing), comment: 'Objetivo agregado desde Configuración' }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error ?? 'No se pudo agregar el objetivo.'); return; }
    setAdding(false); setNewRow({ product: '', seller: '', kilos: '', accounts: '', invoicing: '' }); load(versionId, month).catch(() => undefined);
  };
  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const visibleRows = useMemo(() => sortItems((payload?.rows ?? []).filter((row) => !normalizedQuery || `${row.product} ${row.seller}`.toLocaleLowerCase('es').includes(normalizedQuery)), sort, (row, key) => row[key]), [payload, normalizedQuery, sort]);
  const totals = visibleRows.reduce((sum, row) => ({ kilos: sum.kilos + Number(row.kilos ?? 0), accounts: sum.accounts + Number(row.accounts ?? 0), invoicing: sum.invoicing + Number(row.invoicing ?? 0) }), { kilos: 0, accounts: 0, invoicing: 0 });
  const direction = (key: GoalSort) => sort.key === key ? sort.direction : null;

  if (error && !payload) return <div className="page-view"><section className="data-card report-error"><Target size={22} /><div><h2>Objetivos no disponibles</h2><p>{error}</p></div></section></div>;
  if (!payload) return <div className="page-view"><section className="data-card report-loading"><span /><h2>Preparando los objetivos comerciales…</h2><p>Importando el plan versionado y su trazabilidad.</p></section></div>;
  const draft = payload.selectedVersion.status === 'draft';
  const versionOptions = payload.versions.map((version) => ({ value: version.id, label: `v${version.version} · ${version.name} · ${version.status === 'active' ? 'Activa' : version.status === 'draft' ? 'Borrador' : 'Archivada'}` }));
  const exportUrl = (format: 'xlsx' | 'pdf') => `/api/admin/goals/export?${new URLSearchParams({ versionId: payload.selectedVersion.id, month: payload.selectedMonth, format })}`;
  const savedFilters = { versionId: payload.selectedVersion.id, month: payload.selectedMonth, query, sortKey: sort.key ?? '', sortDirection: sort.direction ?? '' };
  const applySaved = (saved: Record<string, string>) => {
    setQuery(saved.query ?? '');
    setSort(saved.sortKey && (saved.sortDirection === 'asc' || saved.sortDirection === 'desc')
      ? { key: saved.sortKey as GoalSort, direction: saved.sortDirection }
      : emptySort<GoalSort>());
    load(saved.versionId || payload.selectedVersion.id, saved.month || payload.selectedMonth).catch(() => undefined);
  };

  return <div className={`page-view goals-page ${loading ? 'is-loading' : ''}`} data-tour="goals-overview">
    <section className="data-card goals-header-card"><div className="data-card-header"><div><span className="section-kicker"><Target size={14} /> Planificación propia</span><h2>Objetivos comerciales versionados</h2><p>Cada edición ocurre en un borrador; sólo una activación explícita modifica los objetivos del Reporte General.</p></div><div className="admin-export-actions"><a className="button ghost compact" href={exportUrl('xlsx')}><FileSpreadsheet size={14} /> Excel</a><a className="button ghost compact" href={exportUrl('pdf')}><FileDown size={14} /> PDF</a></div></div><div className="goals-version-controls"><SingleSelectFilter label="Versión" value={payload.selectedVersion.id} options={versionOptions} onChange={changeVersion} /><SingleSelectFilter label="Mes" value={payload.selectedMonth} options={payload.months.map((value) => ({ value, label: monthLabel(value) }))} onChange={changeMonth} /><span className={`goal-version-status ${payload.selectedVersion.status}`}>{payload.selectedVersion.status === 'active' ? <Check size={14} /> : payload.selectedVersion.status === 'draft' ? <Clock3 size={14} /> : <Archive size={14} />}{payload.selectedVersion.status === 'active' ? 'Plan activo' : payload.selectedVersion.status === 'draft' ? 'Borrador editable' : 'Histórico'}</span>{draft && <button className="button primary" onClick={activate}><Check size={15} /> Activar versión</button>}<button className="button ghost" onClick={() => setCreating(true)}><CopyPlus size={15} /> Nueva versión</button></div>{creating && <div className="goal-create-version"><input autoFocus value={newVersionName} maxLength={120} placeholder="Ej. Plan agosto–diciembre 2026" onChange={(event) => setNewVersionName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') createVersion(); if (event.key === 'Escape') setCreating(false); }} /><button className="button primary compact" onClick={createVersion}>Crear clon editable</button><button className="button ghost compact" onClick={() => setCreating(false)}>Cancelar</button></div>}<div className="goal-version-note"><Database size={14} /><span><strong>{payload.selectedVersion.sourceLabel}</strong> · {payload.selectedVersion.rowCount} filas · creado por {payload.selectedVersion.createdBy} el {new Intl.DateTimeFormat('es-AR').format(new Date(payload.selectedVersion.createdAt))}</span></div></section>
    <SavedViewsBar viewKey="goals" filters={savedFilters} onApply={applySaved} />

    {progress && <><div className="goal-compliance-grid">{progress.summaries.map((summary) => <article key={summary.mode}><small>{summary.label}</small><strong>{metric(summary.actual, summary.unit)}</strong><span>de {metric(summary.target, summary.unit)}</span><b>{summary.completion == null ? 'Sin objetivo' : `${summary.completion.toFixed(1)}%`}</b><div><i style={{ width: `${Math.min(100, summary.completion ?? 0)}%` }} /></div></article>)}</div>
      <section className="data-card goal-progress-card"><div className="data-card-header"><div><span className="section-kicker"><Target size={14} /> Resultado GESI + actividad registrada</span><h2>Seguimiento por vendedor</h2><p>Las notas son una señal simple de actividad humana: no prueban contacto, oferta ni productividad. Las oportunidades son la señal O actual, no un embudo.</p></div><span className="count-badge">{progress.sellers.length}</span></div><div className="goal-progress-table"><header><span>Vendedor</span><span>Objetivo kg</span><span>Resultado kg</span><span>Diferencia</span><span>Avance</span><span>Clientes con nota</span><span>Notas</span><span>Oportunidad alta</span></header>{progress.sellers.map((row) => <article key={row.seller}><strong>{row.seller || 'Sin vendedor'}</strong><span>{number(row.target)}</span><span>{number(row.actual)}</span><span className={row.gap < 0 ? 'negative' : 'positive'}>{number(row.gap)}</span><span>{row.completion == null ? '—' : `${row.completion.toFixed(1)}%`}</span><span>{number(row.clientsWithNotes)}</span><span>{number(row.notes)}</span><span>{number(row.highOpportunityClients)}</span></article>)}</div></section>
    </>}

    <section className="data-card goals-table-card"><div className="data-card-header"><div><span className="section-kicker"><Target size={14} /> {monthLabel(payload.selectedMonth)}</span><h2>Detalle del plan</h2><p>{draft ? 'Editá las filas y guardá cada cambio. Todo queda registrado antes de activar.' : 'Esta versión es de sólo lectura para conservar su trazabilidad.'}</p></div><div className="goal-table-actions"><label><input value={query} placeholder="Buscar producto o vendedor" onChange={(event) => setQuery(event.target.value)} /></label>{draft && <button className="button primary compact" onClick={() => setAdding(true)}><Plus size={14} /> Agregar objetivo</button>}</div></div><div className="goal-totals"><span><small>Kilos de las filas visibles</small><strong>{number(totals.kilos)}</strong></span><span><small>Cuentas</small><strong>{number(totals.accounts)}</strong></span><span><small>Facturación</small><strong>{money(totals.invoicing, true)}</strong></span><span><small>Filas</small><strong>{number(visibleRows.length)}</strong></span></div><div className="goals-table"><header><SortButton label="Producto / lectura" direction={direction('product')} onClick={() => setSort((state) => cycleSort(state, 'product'))} /><SortButton label="Vendedor" direction={direction('seller')} onClick={() => setSort((state) => cycleSort(state, 'seller'))} /><SortButton label="Kilos" direction={direction('kilos')} onClick={() => setSort((state) => cycleSort(state, 'kilos'))} /><SortButton label="Cuentas" direction={direction('accounts')} onClick={() => setSort((state) => cycleSort(state, 'accounts'))} /><SortButton label="Facturación" direction={direction('invoicing')} onClick={() => setSort((state) => cycleSort(state, 'invoicing'))} /><span /> </header>{adding && <article className="goal-new-row"><label><span>Producto / lectura</span><input list="goal-products" value={newRow.product} onChange={(event) => setNewRow((current) => ({ ...current, product: event.target.value }))} /></label><label><span>Vendedor</span><input list="goal-sellers" value={newRow.seller} onChange={(event) => setNewRow((current) => ({ ...current, seller: event.target.value }))} /></label><label><span>Kilos</span><input type="text" inputMode="decimal" value={newRow.kilos} onChange={(event) => setNewRow((current) => ({ ...current, kilos: event.target.value }))} /></label><label><span>Cuentas</span><input type="text" inputMode="numeric" value={newRow.accounts} onChange={(event) => setNewRow((current) => ({ ...current, accounts: event.target.value }))} /></label><label><span>Facturación</span><input type="text" inputMode="decimal" value={newRow.invoicing} onChange={(event) => setNewRow((current) => ({ ...current, invoicing: event.target.value }))} /></label><div className="goal-row-actions"><button title="Guardar" onClick={addRow}><Check size={14} /></button><button title="Cancelar" onClick={() => setAdding(false)}><Trash2 size={14} /></button></div></article>}{draft ? visibleRows.map((row) => <EditableGoalRow key={row.id} row={row} versionId={payload.selectedVersion.id} sellers={payload.sellers} products={payload.products} onChanged={() => load(versionId, month).catch(() => undefined)} onDeleted={() => load(versionId, month).catch(() => undefined)} />) : visibleRows.map((row) => <article className="readonly" key={row.id}><strong>{row.product || 'Autoservicio / cuenta'}</strong><span>{row.seller || 'Sin vendedor'}</span><span>{row.kilos == null ? '—' : number(row.kilos)}</span><span>{row.accounts == null ? '—' : number(row.accounts)}</span><span>{row.invoicing == null ? '—' : money(row.invoicing)}</span><span /></article>)}</div><datalist id="goal-products">{payload.products.map((value) => <option key={value} value={value} />)}</datalist><datalist id="goal-sellers">{payload.sellers.map((value) => <option key={value} value={value} />)}</datalist></section>

    <section className="data-card goal-history-card"><div className="data-card-header"><div><span className="section-kicker"><History size={14} /> Auditoría</span><h2>Historial de la versión</h2><p>Creaciones, ediciones y activaciones no se eliminan.</p></div><span className="count-badge">{payload.changes.length} eventos</span></div><div className="goal-history-list">{payload.changes.map((change) => <article key={change.id}><i className={change.eventType} /><div><strong>{goalChangeLabel(change.eventType)}</strong><span>{change.comment || change.entityKey}</span><small>{change.actor} · {new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(change.createdAt))}</small></div></article>)}</div></section>
    {error && <div className="admin-inline-error">{error}</div>}
  </div>;
}
