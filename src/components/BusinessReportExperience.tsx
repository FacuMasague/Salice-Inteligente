import type { ReactNode } from 'react';
import { CalendarRange, ChevronDown, Database, Filter, RefreshCw } from 'lucide-react';

export interface BusinessReportKpi {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  icon: ReactNode;
  tone: 'green' | 'blue' | 'ochre' | 'navy';
}

export function BusinessReportFilters({
  dataTour,
  kicker,
  title,
  description,
  introExtra,
  primary,
  advanced,
  activeFilterCount,
  expanded,
  onToggle,
  loading,
  children,
}: {
  dataTour: string;
  kicker: ReactNode;
  title: ReactNode;
  description: ReactNode;
  introExtra?: ReactNode;
  primary: ReactNode;
  advanced?: ReactNode;
  activeFilterCount: number;
  expanded: boolean;
  onToggle: () => void;
  loading: boolean;
  children: ReactNode;
}) {
  return <section className="data-card business-report-filter-card" data-tour={dataTour}>
    <div className="business-report-filter-copy">
      <span className="section-kicker">{kicker}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {introExtra}
    </div>
    <div className="business-report-filter-controls">
      {primary}
      <button
        className={`button secondary business-report-more-button ${activeFilterCount ? 'active' : ''}`}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <Filter size={14} /> Más filtros {activeFilterCount ? `(${activeFilterCount})` : ''}
        <ChevronDown size={13} />
      </button>
    </div>
    {expanded && <div className="business-report-filter-expanded">{advanced}</div>}
    {children}
    {loading && <div className="business-report-filter-loading"><RefreshCw className="spin" size={13} /> Recalculando</div>}
  </section>;
}

export function BusinessReportPeriodNote({
  title,
  detail,
  partial,
}: {
  title: ReactNode;
  detail: ReactNode;
  partial: boolean;
}) {
  return <section className={`business-report-period-note ${partial ? 'partial' : ''}`}>
    <CalendarRange size={17} />
    <div><strong>{title}</strong><span>{detail}</span></div>
  </section>;
}

export function BusinessReportKpis({ items }: { items: BusinessReportKpi[] }) {
  return <div className="business-report-kpis">
    {items.map((item) => <article key={item.label}>
      <span className={`business-report-kpi-icon ${item.tone}`}>{item.icon}</span>
      <div><small>{item.label}</small><strong>{item.value}</strong><em>{item.detail}</em></div>
    </article>)}
  </div>;
}

export function BusinessReportSourceNote({ source, children }: { source: ReactNode; children: ReactNode }) {
  return <details className="business-report-source-note">
    <summary><Database size={16} /><span>Información técnica del reporte</span></summary>
    <div><strong>{source}</strong><span>{children}</span></div>
  </details>;
}
