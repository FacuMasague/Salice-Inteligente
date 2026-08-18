import { Archive, CheckCircle2, ChevronRight, History, Pencil, Plus, RefreshCw, Save, Target, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type {
  CommercialGoalMonthRevision,
  CommercialGoalMonthRevisionDetail,
  CommercialGoalRow,
  CommercialGoalsPayload,
} from '../../shared/models';
import { COMMERCIAL_GOAL_AUTOSERVICE_SELLERS } from '../../shared/commercial-goals-scope';
import { readApiJson } from '../lib/api-response';
import { money, number } from '../lib/format';
import { CommercialGoalsUpload } from './CommercialGoalsUpload';

const monthLabel = (value: string) => new Intl.DateTimeFormat('es-AR', {
  month: 'long', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${value}-01T12:00:00Z`));

const timestampLabel = (value: string) => new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));

function numericInput(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function rowKey(product: string, seller: string) {
  return `${product}\u0000${seller}`;
}

function upcomingMonths(months: string[], amount = 12) {
  const latest = months.at(-1) ?? new Date().toISOString().slice(0, 7);
  const [year, month] = latest.split('-').map(Number);
  return Array.from({ length: amount }, (_, index) => {
    const date = new Date(Date.UTC(year, month + index, 1, 12));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }).filter((value) => !months.includes(value));
}

export function CommercialGoalsManager({
  currentMonth,
  onSaved,
}: {
  currentMonth: string;
  onSaved: (month: string, name: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'editor' | 'history'>('editor');
  const [editorMode, setEditorMode] = useState<'edit' | 'create'>('edit');
  const [payload, setPayload] = useState<CommercialGoalsPayload | null>(null);
  const [history, setHistory] = useState<CommercialGoalMonthRevision[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [draftRows, setDraftRows] = useState<CommercialGoalRow[]>([]);
  const [name, setName] = useState('');
  const [newMonth, setNewMonth] = useState('');
  const [baseMonth, setBaseMonth] = useState(currentMonth);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [baseMessage, setBaseMessage] = useState('');

  const loadMonth = async (month: string, existingPayload?: CommercialGoalsPayload) => {
    const response = await fetch(`/api/admin/goals?${new URLSearchParams({ month })}`, { cache: 'no-store' });
    const next = await readApiJson<CommercialGoalsPayload>(response, 'No se pudieron abrir los objetivos.');
    const rows = next.rows.map((row) => ({ ...row }));
    const products = next.products.filter(Boolean);
    setPayload(existingPayload ? { ...next, versions: existingPayload.versions } : next);
    setSelectedMonth(next.selectedMonth || month);
    setDraftRows(rows);
    setName(next.monthPlans.find((item) => item.month === (next.selectedMonth || month))?.name ?? '');
    setSelectedProduct((current) => products.includes(current) ? current : products[0] ?? '');
    setBaseMessage('');
  };

  const begin = async () => {
    setOpen(true); setBusy(true); setError(''); setTab('editor'); setEditorMode('edit');
    try {
      const [goalsResponse, historyResponse] = await Promise.all([
        fetch(`/api/admin/goals?${new URLSearchParams({ month: currentMonth })}`, { cache: 'no-store' }),
        fetch('/api/admin/goals/history', { cache: 'no-store' }),
      ]);
      const goals = await readApiJson<CommercialGoalsPayload>(goalsResponse, 'No se pudieron abrir los objetivos.');
      const historical = await readApiJson<{ revisions: CommercialGoalMonthRevision[] }>(historyResponse, 'No se pudo abrir el historial.');
      setPayload(goals);
      setHistory(historical.revisions);
      setSelectedMonth(goals.selectedMonth);
      setDraftRows(goals.rows.map((row) => ({ ...row })));
      setName(goals.monthPlans.find((item) => item.month === goals.selectedMonth)?.name ?? '');
      setSelectedProduct(goals.products[0] ?? '');
      setBaseMonth(goals.selectedMonth);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron abrir los objetivos.');
    } finally {
      setBusy(false);
    }
  };

  const resetAndClose = () => {
    setOpen(false); setPayload(null); setDraftRows([]); setHistory([]); setError(''); setBaseMessage('');
  };
  const close = () => { if (!busy) resetAndClose(); };

  const products = payload?.products.filter(Boolean) ?? [];
  const sellers = payload?.sellers.filter(Boolean) ?? [];
  const rowMap = useMemo(() => new Map(draftRows.map((row) => [rowKey(row.product, row.seller), row])), [draftRows]);
  const selectedRows = sellers.map((seller) => rowMap.get(rowKey(selectedProduct, seller)) ?? {
    id: `draft-${selectedProduct}-${seller}`, month: selectedMonth, product: selectedProduct, seller,
    kilos: null, accounts: null, invoicing: null,
  });
  const totals = useMemo(() => ({
    kilos: draftRows.reduce((sum, row) => sum + Number(row.kilos ?? 0), 0),
    accounts: draftRows.reduce((sum, row) => sum + Number(row.accounts ?? 0), 0),
    invoicing: draftRows.reduce((sum, row) => sum + Number(row.invoicing ?? 0), 0),
  }), [draftRows]);

  const setMetric = (product: string, seller: string, metric: 'kilos' | 'accounts', raw: string) => {
    const value = numericInput(raw);
    const key = rowKey(product, seller);
    setDraftRows((current) => {
      const existing = current.find((row) => rowKey(row.product, row.seller) === key);
      if (existing) return current.map((row) => rowKey(row.product, row.seller) === key ? { ...row, [metric]: value } : row);
      return [...current, { id: `draft-${crypto.randomUUID()}`, month: selectedMonth, product, seller, kilos: null, accounts: null, invoicing: null, [metric]: value }];
    });
  };

  const sellerInvoice = (seller: string) => draftRows.reduce((sum, row) => row.seller === seller ? sum + Number(row.invoicing ?? 0) : sum, 0);
  const setInvoice = (seller: string, raw: string) => {
    const value = numericInput(raw);
    setDraftRows((current) => {
      const withoutSellerInvoice = current.map((row) => row.seller === seller ? { ...row, invoicing: null } : row);
      const blankIndex = withoutSellerInvoice.findIndex((row) => !row.product && row.seller === seller);
      if (blankIndex >= 0) return withoutSellerInvoice.map((row, index) => index === blankIndex ? { ...row, invoicing: value } : row);
      return [...withoutSellerInvoice, { id: `draft-invoice-${crypto.randomUUID()}`, month: selectedMonth, product: '', seller, kilos: null, accounts: null, invoicing: value }];
    });
  };

  const startCreateMode = () => {
    if (!payload) return;
    const target = upcomingMonths(payload.months)[0] ?? '';
    if (!target) { setError('No hay un mes próximo disponible para crear.'); return; }
    setEditorMode('create'); setError(''); setNewMonth(target); setBaseMonth(selectedMonth);
    setSelectedMonth(target); setName('');
    setDraftRows((current) => current.map((row) => ({ ...row, id: `draft-${crypto.randomUUID()}`, month: target })));
    setBaseMessage(`Copiamos ${monthLabel(selectedMonth)} como punto de partida. Podés cambiar el mes base antes de editar.`);
  };

  const changeNewMonth = (target: string) => {
    setNewMonth(target); setSelectedMonth(target); setError('');
    setDraftRows((current) => current.map((row) => ({ ...row, month: target })));
  };

  const loadBaseMonth = async (sourceMonth: string) => {
    if (!payload || !newMonth) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/goals?${new URLSearchParams({ month: sourceMonth })}`, { cache: 'no-store' });
      const source = await readApiJson<CommercialGoalsPayload>(response, 'No se pudo abrir el mes base.');
      setPayload({ ...source, versions: payload.versions });
      setBaseMonth(sourceMonth);
      setSelectedMonth(newMonth);
      setDraftRows(source.rows.map((row) => ({ ...row, id: `draft-${crypto.randomUUID()}`, month: newMonth })));
      setSelectedProduct((current) => source.products.includes(current) ? current : source.products[0] ?? '');
      setBaseMessage(`Copiamos ${monthLabel(sourceMonth)} como punto de partida. Los cambios se guardarán en ${monthLabel(newMonth)}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo abrir el mes base.');
    } finally {
      setBusy(false);
    }
  };

  const startEditMode = async () => {
    if (!payload) return;
    const month = payload.months.includes(baseMonth) ? baseMonth : payload.months.at(-1) ?? currentMonth;
    setEditorMode('edit'); setError(''); setNewMonth('');
    await loadMonth(month, payload);
  };

  const openRevision = async (revision: CommercialGoalMonthRevision) => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/goals/history/${encodeURIComponent(revision.id)}`, { cache: 'no-store' });
      const detail = await readApiJson<{ revision: CommercialGoalMonthRevisionDetail }>(response, 'No se pudo abrir ese registro.');
      const allowedSellers = new Set(payload?.sellers ?? []);
      const allowedProducts = new Set(payload?.products ?? []);
      const editableRows = detail.revision.rows.filter((row) => (
        allowedSellers.has(row.seller) && (!row.product || allowedProducts.has(row.product))
      ));
      setSelectedMonth(detail.revision.month);
      setBaseMonth(detail.revision.month);
      setDraftRows(editableRows.map((row) => ({ ...row, id: `draft-${crypto.randomUUID()}` })));
      setName(''); setSelectedProduct(editableRows.find((row) => row.product)?.product ?? products[0] ?? '');
      setBaseMessage(`Usando “${detail.revision.name}” como base. Al guardar se conservará como un registro anterior.`);
      setEditorMode('edit'); setTab('editor');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo abrir ese registro.');
    } finally {
      setBusy(false);
    }
  };

  const importedHistoricalGoals = async (month: string, importedName: string) => {
    await onSaved(month, importedName);
    const [historyResponse, goalsResponse] = await Promise.all([
      fetch('/api/admin/goals/history', { cache: 'no-store' }),
      fetch(`/api/admin/goals?${new URLSearchParams({ month })}`, { cache: 'no-store' }),
    ]);
    const historical = await readApiJson<{ revisions: CommercialGoalMonthRevision[] }>(historyResponse, 'No se pudo recargar el historial.');
    const goals = await readApiJson<CommercialGoalsPayload>(goalsResponse, 'No se pudieron recargar los objetivos.');
    setHistory(historical.revisions); setPayload(goals); setSelectedMonth(goals.selectedMonth);
  };

  const save = async () => {
    const rows = draftRows.map((row) => ({
      month: selectedMonth, product: row.product.trim(), seller: row.seller.trim(),
      kilos: row.product.trim() ? row.kilos : null,
      accounts: row.product.trim() ? row.accounts : null,
      invoicing: row.invoicing,
    })).filter((row) => row.kilos != null || row.accounts != null || row.invoicing != null);
    if (!name.trim()) { setError('Escribí un nombre para reconocer estos objetivos más adelante.'); return; }
    if (!rows.length) { setError('Cargá al menos un objetivo antes de guardar.'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/goals/months', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth, name: name.trim(), rows }),
      });
      await readApiJson(response, 'No se pudieron guardar los objetivos.');
      await onSaved(selectedMonth, name.trim());
      setBusy(false);
      resetAndClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron guardar los objetivos.');
      setBusy(false);
    }
  };

  return <>
    <button className="button primary goal-upload-open" onClick={() => void begin()}><Target size={15} /> Administrar objetivos</button>
    {open && <div className="goal-upload-layer">
      <button className="goal-upload-backdrop" aria-label="Cerrar administración de objetivos" disabled={busy} onClick={close} />
      <section className="goal-upload-dialog goal-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="goal-manager-title">
        <header><span><Target size={20} /></span><div><h2 id="goal-manager-title">Objetivos comerciales</h2><p>Cargalos desde la web y consultá cada registro anterior cuando lo necesites.</p></div><button className="icon-button" aria-label="Cerrar" disabled={busy} onClick={close}><X size={17} /></button></header>
        <nav className="goal-manager-tabs" aria-label="Secciones de objetivos">
          <button className={tab === 'editor' ? 'active' : ''} onClick={() => setTab('editor')}><Target size={14} /> Crear o editar</button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History size={14} /> Historial <span>{history.length}</span></button>
        </nav>
        <div className="goal-upload-body goal-manager-body">
          {busy && !payload ? <div className="goal-manager-loading"><RefreshCw className="spin" size={20} /> Preparando objetivos…</div> : null}
          {error && <p className="goal-upload-error">{error}</p>}
          {tab === 'editor' && payload && <>
            <section className="goal-manager-mode-choice" aria-label="Acción sobre los objetivos">
              <button className={editorMode === 'edit' ? 'active' : ''} onClick={() => void startEditMode()}><Pencil size={17} /><span><strong>Editar un mes existente</strong><small>Elegí cualquiera de los meses guardados.</small></span></button>
              <button className={editorMode === 'create' ? 'active' : ''} onClick={startCreateMode}><Plus size={17} /><span><strong>Crear un mes nuevo</strong><small>Elegí uno de los próximos meses y asignale un nombre.</small></span></button>
            </section>
            <section className="goal-manager-heading">
              {editorMode === 'edit' ? <div><label htmlFor="goal-manager-month">Mes que querés editar</label><select id="goal-manager-month" value={selectedMonth} onChange={(event) => { setBaseMonth(event.target.value); void loadMonth(event.target.value, payload); }}>{payload.months.map((month) => <option key={month} value={month}>{monthLabel(month)} · {payload.monthPlans.find((item) => item.month === month)?.name ?? 'Plan histórico'}</option>)}</select></div> : <>
                <div><label htmlFor="goal-manager-new-month">Mes nuevo</label><select id="goal-manager-new-month" value={newMonth} onChange={(event) => changeNewMonth(event.target.value)}>{upcomingMonths(payload.months).map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></div>
                <div><label htmlFor="goal-manager-base-month">Copiar valores de</label><select id="goal-manager-base-month" value={baseMonth} onChange={(event) => void loadBaseMonth(event.target.value)}>{payload.months.map((month) => <option key={month} value={month}>{monthLabel(month)} · {payload.monthPlans.find((item) => item.month === month)?.name ?? 'Plan histórico'}</option>)}</select></div>
              </>}
            </section>
            {baseMessage && <p className="goal-manager-base"><CheckCircle2 size={14} /> {baseMessage}</p>}
            <div className="goal-manager-name"><label htmlFor="goal-manager-name">Nombre de estos objetivos</label><input id="goal-manager-name" value={name} maxLength={120} placeholder="Ej.: Agosto · plan acordado con vendedores" onChange={(event) => setName(event.target.value)} /><small>Este nombre quedará guardado en el historial. No se genera automáticamente.</small></div>
            <div className="goal-manager-summary"><article><span>Kilos cargados</span><strong>{number(totals.kilos, 1)} kg</strong></article><article><span>Objetivos de clientes</span><strong>{number(totals.accounts)}</strong></article><article><span>Facturación autoservicio</span><strong>{money(totals.invoicing, true)}</strong></article></div>
            <section className="goal-manager-editor">
              <aside><strong>Producto o rubro</strong><div>{products.map((product) => <button key={product} className={selectedProduct === product ? 'active' : ''} onClick={() => setSelectedProduct(product)}><span>{product}</span><small>{number(draftRows.filter((row) => row.product === product).reduce((sum, row) => sum + Number(row.kilos ?? 0), 0), 1)} kg</small></button>)}</div></aside>
              <div className="goal-manager-grid"><header><div><span>Objetivos por vendedor</span><strong>{selectedProduct}</strong></div><small>Cargá kilos y cantidad de clientes objetivo para este producto o rubro.</small></header><div className="goal-manager-table"><div className="goal-manager-table-head"><span>Vendedor</span><span>Kilos</span><span>Clientes objetivo</span></div>{selectedRows.map((row) => <div className="goal-manager-table-row" key={row.seller}><strong>{row.seller}</strong><input aria-label={`Kilos · ${selectedProduct} · ${row.seller}`} inputMode="decimal" value={row.kilos ?? ''} onChange={(event) => setMetric(selectedProduct, row.seller, 'kilos', event.target.value)} /><input aria-label={`Clientes objetivo · ${selectedProduct} · ${row.seller}`} inputMode="numeric" value={row.accounts ?? ''} onChange={(event) => setMetric(selectedProduct, row.seller, 'accounts', event.target.value)} /></div>)}</div></div>
            </section>
            <details className="goal-manager-invoicing" open><summary>Facturación de Autoservicio</summary><p>Esta sección queda siempre visible para cargar rápidamente los objetivos de Ana y Julieta.</p><div className="goal-manager-invoice-grid">{COMMERCIAL_GOAL_AUTOSERVICE_SELLERS.map((seller) => <label key={seller}><span>{seller}</span><input aria-label={`Facturación · ${seller}`} inputMode="numeric" value={sellerInvoice(seller) ? Math.round(sellerInvoice(seller)) : ''} onChange={(event) => setInvoice(seller, event.target.value)} /></label>)}</div></details>
          </>}
          {tab === 'history' && <section className="goal-manager-history"><header><div><span>Registros conservados</span><strong>Excel histórico y cambios hechos desde la web</strong></div><div className="goal-manager-history-actions"><CommercialGoalsUpload currentMonth={selectedMonth} onImported={importedHistoricalGoals} buttonLabel="Importar otro histórico" buttonClassName="button secondary goal-history-inline" /><Archive size={18} /></div></header>{history.map((revision) => <article key={revision.id} className={revision.active ? 'active' : ''}><div className="goal-manager-history-date"><strong>{monthLabel(revision.month)}</strong><span>{revision.sourceKind === 'excel' ? 'Excel histórico' : 'Creado desde la web'}</span></div><div className="goal-manager-history-name"><strong>{revision.name}</strong><small>{timestampLabel(revision.createdAt)} · {revision.createdBy}</small></div><div className="goal-manager-history-total"><strong>{number(revision.totals.kilos, 1)} kg</strong><span>{revision.active ? 'En uso' : 'Registro anterior'}</span></div><button aria-label={`Usar ${revision.name} como base`} onClick={() => void openRevision(revision)}>Usar como base <ChevronRight size={13} /></button></article>)}</section>}
        </div>
        {tab === 'editor' && payload && <footer><button className="button secondary" disabled={busy} onClick={close}>Cancelar</button><button className="button primary" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? <><RefreshCw className="spin" size={14} /> Guardando…</> : <><Save size={14} /> Guardar y usar estos objetivos</>}</button></footer>}
      </section>
    </div>}
  </>;
}
