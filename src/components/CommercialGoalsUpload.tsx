import { AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCw, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { CommercialGoalImportMonthPreview, CommercialGoalImportPreview } from '../../shared/models';
import { readApiJson } from '../lib/api-response';
import { money, number } from '../lib/format';

const monthLabel = (value: string) => new Intl.DateTimeFormat('es-AR', {
  month: 'long', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${value}-01T12:00:00Z`));

const dimensionLabels = {
  kilos: 'Kilos',
  accounts: 'Objetivos de clientes',
  invoicing: 'Facturación',
} as const;

function PreviewTotals({ month }: { month: CommercialGoalImportMonthPreview }) {
  return <div className="goal-upload-totals">
    <article><span>Objetivos kilos</span><strong>{number(month.totals.coreKilos, 1)} kg</strong></article>
    <article><span>Marcas estratégicas</span><strong>{number(month.totals.strategicKilos, 1)} kg</strong></article>
    <article><span>Objetivos de clientes</span><strong>{month.dimensions.includes('accounts') ? number(month.totals.accounts) : 'Se conservan'}</strong></article>
    <article><span>Facturación</span><strong>{month.dimensions.includes('invoicing') ? money(month.totals.invoicing, true) : 'Se conserva'}</strong></article>
  </div>;
}

export function CommercialGoalsUpload({
  currentMonth,
  onImported,
  buttonLabel = 'Importar Excel histórico',
  buttonClassName = 'button secondary goal-history-import',
}: {
  currentMonth: string;
  onImported: (month: string, name: string) => Promise<void> | void;
  buttonLabel?: string;
  buttonClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CommercialGoalImportPreview | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const resetAndClose = () => {
    setOpen(false); setFile(null); setPreview(null); setSelectedMonth(''); setName(''); setError('');
    if (inputRef.current) inputRef.current.value = '';
  };
  const close = () => { if (!busy) resetAndClose(); };

  const analyze = async (nextFile: File | null) => {
    setFile(nextFile); setPreview(null); setSelectedMonth(''); setError('');
    if (!nextFile) return;
    if (!nextFile.name.toLocaleLowerCase('es').endsWith('.xlsx')) {
      setError('Elegí un archivo Excel con extensión .xlsx.');
      return;
    }
    if (nextFile.size > 5 * 1024 * 1024) {
      setError('El archivo supera el límite de 5 MB.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/goals/import/preview?${new URLSearchParams({ fileName: nextFile.name })}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        body: await nextFile.arrayBuffer(),
      });
      const payload = await readApiJson<CommercialGoalImportPreview>(response, 'No se pudo revisar el Excel.');
      setPreview(payload);
      setSelectedMonth(payload.months.some((item) => item.month === currentMonth) ? currentMonth : payload.months[0]?.month ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo revisar el Excel.');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    const selected = preview?.months.find((item) => item.month === selectedMonth);
    if (!file || !selected || !name.trim()) return;
    setBusy(true); setError('');
    try {
      const parameters = new URLSearchParams({
        fileName: file.name,
        month: selectedMonth,
        name: name.trim(),
        confirmWarnings: selected.warnings.length ? 'true' : 'false',
      });
      const response = await fetch(`/api/admin/goals/import?${parameters}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        body: await file.arrayBuffer(),
      });
      await readApiJson(response, 'No se pudieron actualizar los objetivos.');
      await onImported(selectedMonth, name.trim());
      resetAndClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron actualizar los objetivos.');
    } finally {
      setBusy(false);
    }
  };

  const selected = preview?.months.find((item) => item.month === selectedMonth) ?? null;

  return <>
    <button className={buttonClassName} onClick={() => setOpen(true)}><FileSpreadsheet size={15} /> {buttonLabel}</button>
    {open && <div className="goal-upload-layer">
      <button className="goal-upload-backdrop" aria-label="Cerrar actualización de objetivos" disabled={busy} onClick={close} />
      <section className="goal-upload-dialog" role="dialog" aria-modal="true" aria-labelledby="goal-upload-title">
        <header>
          <span><FileSpreadsheet size={20} /></span>
          <div><h2 id="goal-upload-title">Importar objetivos históricos</h2><p>Usá el Excel solamente para migrar registros anteriores. Los objetivos nuevos se cargan desde la web.</p></div>
          <button className="icon-button" aria-label="Cerrar" disabled={busy} onClick={close}><X size={17} /></button>
        </header>
        <div className="goal-upload-body">
          <label className={`goal-file-picker ${file ? 'selected' : ''}`}>
            <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void analyze(event.target.files?.[0] ?? null)} />
            <span>{busy && !preview ? <RefreshCw className="spin" size={22} /> : file ? <CheckCircle2 size={22} /> : <Upload size={22} />}</span>
            <div><strong>{file?.name ?? 'Elegir archivo Excel'}</strong><small>{file ? 'Archivo listo para revisar' : 'Acepta Status Salice y la plantilla mensual de objetivos'}</small></div>
          </label>

          {preview && <>
            <div className="goal-upload-detected"><CheckCircle2 size={16} /><span><strong>Formato reconocido</strong>{preview.format === 'normalized_table' ? 'Tabla consolidada “Power BI”' : 'Plantilla mensual por producto y vendedor'}</span></div>
            <div className="goal-upload-form">
              <label htmlFor="goal-upload-month"><span>Mes que querés actualizar</span><select id="goal-upload-month" aria-label="Mes que querés actualizar" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>{preview.months.map((item) => <option key={item.month} value={item.month}>{monthLabel(item.month)} · {number(item.rows)} filas</option>)}</select></label>
              <label htmlFor="goal-upload-name"><span>Nombre de estos objetivos</span><input id="goal-upload-name" aria-label="Nombre de estos objetivos" value={name} maxLength={120} placeholder="Ej.: Plan julio · cierre acordado" onChange={(event) => setName(event.target.value)} /><small>Lo elegís vos; no se genera automáticamente.</small></label>
            </div>
          </>}

          {selected && <section className="goal-upload-preview">
            <header><div><span>Previsualización</span><strong>{monthLabel(selected.month)}</strong></div><small>{selected.sourceSheet} · {number(selected.rows)} filas</small></header>
            <div className="goal-upload-dimensions">{selected.dimensions.map((dimension) => <span key={dimension}>{dimensionLabels[dimension]}</span>)}</div>
            <PreviewTotals month={selected} />
            {!selected.dimensions.includes('invoicing') && <p className="goal-upload-preserved"><CheckCircle2 size={14} /> Este archivo no contiene facturación de Autoservicio. La web conservará ese objetivo del plan vigente.</p>}
            {!!selected.warnings.length && <div className="goal-upload-warnings"><AlertTriangle size={16} /><div><strong>Revisá antes de aplicar</strong>{selected.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div></div>}
          </section>}
          {error && <p className="goal-upload-error"><AlertTriangle size={15} /> {error}</p>}
        </div>
        <footer><button className="button secondary" disabled={busy} onClick={close}>Cancelar</button><button className="button primary" disabled={busy || !selected || !name.trim()} onClick={() => void apply()}>{busy ? <><RefreshCw className="spin" size={14} /> Procesando…</> : 'Importar y usar estos objetivos'}</button></footer>
      </section>
    </div>}
  </>;
}
