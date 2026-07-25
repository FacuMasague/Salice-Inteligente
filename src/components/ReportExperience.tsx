import { useState, type ReactNode } from 'react';
import { AlertTriangle, Clipboard, Download, FileSpreadsheet, Info, RotateCcw, X } from 'lucide-react';
import type { ReportViewId } from '../lib/report-center';
import { buildReportLink, type ReportLinkFilters } from '../lib/report-links';

interface FilterLabel {
  label: string;
  value?: (value: string) => string;
}

export function ReportFilterActions({
  view,
  filters,
  labels,
  onClear,
  onReset,
  children,
}: {
  view: ReportViewId;
  filters: ReportLinkFilters;
  labels: Record<string, FilterLabel>;
  onClear: (key: string) => void;
  onReset: () => void;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const active = Object.entries(filters).filter(([key, value]) => value !== '' && labels[key]);
  const copyLink = async () => {
    const link = buildReportLink(view, filters);
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return <div className="report-filter-actions">
    <div className="report-filter-summary">
      <span className="report-filter-summary-label">Filtros activos</span>
      <div className="report-filter-chips">
        {active.length ? active.map(([key, raw]) => <button key={key} title={`Quitar ${labels[key].label}`} onClick={() => onClear(key)}>
          <span>{labels[key].label}</span><strong>{labels[key].value?.(raw) ?? raw}</strong><X size={12} />
        </button>) : <em>Vista general, sin filtros adicionales</em>}
      </div>
      <div className="report-filter-buttons">
        <button className="button ghost compact" onClick={onReset}><RotateCcw size={14} /> Restablecer</button>
        <button className="button ghost compact" onClick={copyLink}><Clipboard size={14} /> {copied ? 'Enlace copiado' : 'Copiar enlace'}</button>
      </div>
    </div>
    {children}
  </div>;
}

export interface ReportContextItem {
  label: string;
  value: string;
}

export function ReportExportActions({ links }: { links: Array<{ href: string; label: string; kind?: 'xlsx' | 'pdf' | 'csv' }> }) {
  return <div className="report-export-actions" aria-label="Exportaciones del reporte">
    {links.map((link) => <a key={`${link.kind}-${link.href}`} className="button secondary compact" href={link.href} download>
      {link.kind === 'xlsx' ? <FileSpreadsheet size={14} /> : <Download size={14} />} {link.label}
    </a>)}
  </div>;
}

export function reportExportUrl(report: string, filters: object) {
  const parameters = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) parameters.set(key, String(value)); });
  const query = parameters.toString();
  return `/api/reports/export/${report}${query ? `?${query}` : ''}`;
}

export function ReportContext({
  universe,
  period,
  cutoff,
  comparison,
  partial,
  warnings = [],
  related = [],
  actions,
  exports,
}: {
  universe: string;
  period: string;
  cutoff: string;
  comparison: string;
  partial: boolean;
  warnings?: string[];
  related?: { view: ReportViewId; label: string }[];
  actions?: ReactNode;
  exports?: ReactNode;
}) {
  const items: ReportContextItem[] = [
    { label: 'Universo', value: universe },
    { label: 'Período', value: period },
    { label: 'Fecha de corte', value: cutoff },
    { label: 'Comparación', value: comparison },
    { label: 'Estado', value: partial ? 'Período parcial' : 'Período completo' },
  ];
  return <section className="data-card report-context">
    <div className="report-context-grid">
      {items.map((item) => <div key={item.label}><small>{item.label}</small><strong>{item.value}</strong></div>)}
    </div>
    {!!warnings.length && <div className="report-context-warnings"><AlertTriangle size={16} /><div>{warnings.map((warning) => <span key={warning}>{warning}</span>)}</div></div>}
    {(related.length > 0 || actions || exports) && <div className="report-context-actions">
      {(related.length > 0 || actions) && <div className="report-context-related">
        {related.map((item) => <a key={item.view} className="button ghost compact" href={buildReportLink(item.view, {})}>{item.label}</a>)}
        {actions}
      </div>}
      {exports && <div className={`report-context-primary-actions ${related.length || actions ? 'separated' : ''}`}>{exports}</div>}
    </div>}
  </section>;
}

export function ReportState({ state, title, detail, onRetry }: {
  state: 'loading' | 'empty' | 'error';
  title: string;
  detail: string;
  onRetry?: () => void;
}) {
  return <div className={`page-view report-state-page ${state}`}>
    <section className={`data-card report-state report-${state}`}>
      {state === 'loading' ? <span className="report-state-spinner" /> : state === 'error' ? <AlertTriangle size={24} /> : <Info size={24} />}
      <div><h2>{title}</h2><p>{detail}</p>{onRetry && <button className="button secondary compact" onClick={onRetry}>Reintentar</button>}</div>
    </section>
  </div>;
}

export function ReportEmptyNotice({ title = 'Sin resultados para esta selección', detail = 'Quitá uno o más filtros para ampliar el universo.' }: { title?: string; detail?: string }) {
  return <section className="data-card report-empty-notice"><Info size={18} /><div><strong>{title}</strong><span>{detail}</span></div></section>;
}
