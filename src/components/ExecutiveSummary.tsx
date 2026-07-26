import type { KeyboardEvent, ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  CircleDollarSign,
  PackageSearch,
  Route,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  WalletCards,
} from 'lucide-react';
import type {
  ExecutiveSummaryContext,
  ExecutiveSummaryDestination,
  ExecutiveSummaryPayload,
} from '../../shared/models';
import { AiExecutiveBriefCard } from './AiInsights';
import { formatAiDisplayText } from '../lib/ai-display';
import { money, number } from '../lib/format';

function percent(value: number | null, signed = false) {
  if (value == null) return 'Sin base';
  return `${signed && value > 0 ? '+' : ''}${number(value, 1)}%`;
}

function kilos(value: number) {
  return `${number(value, 1)} kg`;
}

function compactPeriod(value: string) {
  return value.replaceAll(/(\d{4})-(\d{2})-(\d{2})/g, '$3/$2/$1');
}

function Context({ value }: { value: ExecutiveSummaryContext }) {
  return (
    <>
      <p className="executive-card-definition">{value.definition}</p>
      <dl className="executive-card-context">
        <div><dt>Período</dt><dd>{compactPeriod(value.period)}</dd></div>
        <div><dt>Fuente</dt><dd title={value.source}>{value.source}</dd></div>
      </dl>
      <details className="executive-card-detail" onClick={(event) => event.stopPropagation()}>
        <summary>Definición completa y universo</summary>
        <p><strong>Corte:</strong> {compactPeriod(value.cutoff)}</p>
        <p><strong>Universo:</strong> {value.universe}</p>
        {value.warning && <p className="warning"><AlertTriangle size={12} /> {value.warning}</p>}
      </details>
    </>
  );
}

function Card({
  title,
  eyebrow,
  icon,
  tone,
  context,
  children,
  onOpen,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  icon: ReactNode;
  tone: string;
  context: ExecutiveSummaryContext;
  children: ReactNode;
  onOpen: () => void;
  wide?: boolean;
}) {
  const openWithKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  };
  return (
    <article
      className={`executive-summary-card ${tone} ${wide ? 'wide' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={openWithKeyboard}
    >
      <header>
        <span className="executive-card-icon">{icon}</span>
        <div><small>{eyebrow}</small><h3>{title}</h3></div>
        <ArrowRight size={16} />
      </header>
      <div className="executive-card-values">{children}</div>
      <Context value={context} />
    </article>
  );
}

export function ExecutiveSummary({
  summary,
  onOpen,
}: {
  summary: ExecutiveSummaryPayload | null;
  onOpen: (destination: ExecutiveSummaryDestination) => void;
}) {
  if (!summary) return <section className="executive-summary-state error"><AlertTriangle size={18} /><div><strong>El resumen inicial no está disponible</strong><span>La actualización activa no incluye todas las fuentes necesarias.</span></div></section>;

  const netPositive = (summary.sales.netVariation ?? 0) >= 0;
  const overview = summary.aiBrief?.output.currentState
    ?? `Ventas ${netPositive ? 'estables o en crecimiento' : 'por debajo del período comparable'}, con ${percent(summary.goals.completion)} de avance sobre el objetivo mensual.`;
  return (
    <details className="executive-summary" aria-label="Resumen inicial ¿Cómo estamos?">
      <summary className="executive-summary-toggle">
        <div>
          <span className="section-kicker"><Sparkles size={13} /> {summary.aiBrief ? 'Lectura general asistida' : 'Lectura general disponible'}</span>
          <h2>¿Cómo estamos?</h2>
          <p>{formatAiDisplayText(overview)}</p>
        </div>
        <div className="executive-summary-toggle-meta">
          <span>Actualizado {new Intl.DateTimeFormat('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          }).format(new Date(summary.snapshotAt))}</span>
          <strong><span className="when-closed">Ver indicadores</span><span className="when-open">Ocultar indicadores</span><ChevronDown size={15} /></strong>
        </div>
      </summary>
      <div className="executive-summary-content">
        <div className="executive-summary-expanded-intro">
          <span>Detalle por fuente</span>
          <p>Cada bloque conserva su definición y abre el reporte o módulo que permite profundizar.</p>
        </div>
        <AiExecutiveBriefCard artifact={summary.aiBrief} expanded />
        <div className="executive-summary-grid">
        <Card title="Ventas del período" eyebrow="Ventas · Comercial" icon={<CircleDollarSign size={19} />} tone="green" context={summary.sales.context} onOpen={() => onOpen(summary.sales.context.destination)} wide>
          <div className="executive-primary-value"><strong>{money(summary.sales.netAmount, true)}</strong><span>{kilos(summary.sales.kilos)} · {number(summary.sales.buyers)} compradores</span></div>
          <div className={`executive-change ${netPositive ? 'positive' : 'negative'}`}>{netPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}<span><strong>{percent(summary.sales.netVariation, true)}</strong><small>venta neta · {percent(summary.sales.kiloVariation, true)} kilos</small></span></div>
        </Card>

        <Card title="Avance del objetivo" eyebrow="Plan mensual activo" icon={<Target size={19} />} tone="blue" context={summary.goals.context} onOpen={() => onOpen(summary.goals.context.destination)}>
          <div className="executive-primary-value"><strong>{percent(summary.goals.completion)}</strong><span>{kilos(summary.goals.actual)} de {kilos(summary.goals.target)}</span></div>
          <div className="executive-mini-note">Diferencia {kilos(summary.goals.gap)}{summary.goals.projectedCompletion != null ? ` · ritmo ${percent(summary.goals.projectedCompletion)}` : ''}</div>
        </Card>

        <Card title="Cuentas no compradoras" eyebrow="Recuperación comercial" icon={<PackageSearch size={19} />} tone="ochre" context={summary.nonBuyers.context} onOpen={() => onOpen(summary.nonBuyers.context.destination)}>
          <div className="executive-primary-value"><strong>{number(summary.nonBuyers.accounts)}</strong><span>{percent(summary.nonBuyers.rate)} del universo de {number(summary.nonBuyers.universe90)} cuentas</span></div>
        </Card>

        <Card title="Saldo pendiente y vencido" eyebrow="Cartera documental" icon={<WalletCards size={19} />} tone="red" context={summary.balances.context} onOpen={() => onOpen(summary.balances.context.destination)}>
          <div className="executive-primary-value"><strong>{money(summary.balances.pending, true)}</strong><span>{money(summary.balances.overdue, true)} vencido · {percent(summary.balances.overdueShare)}</span></div>
          <div className="executive-mini-note">{number(summary.balances.clients)} cuentas con saldo</div>
        </Card>

        <Card title="Mayores variaciones por vendedor" eyebrow="Contra período equivalente" icon={<Users size={19} />} tone="blue" context={summary.sellerVariations.context} onOpen={() => onOpen(summary.sellerVariations.context.destination)} wide>
          <div className="executive-variation-list">{summary.sellerVariations.rows.map((row) => <div key={row.seller}>
            <strong>{row.seller}</strong>
            <span className={row.difference >= 0 ? 'positive' : 'negative'}>{row.difference >= 0 ? '+' : ''}{money(row.difference, true)}</span>
            <small>{percent(row.variation, true)}</small>
          </div>)}</div>
        </Card>

        <Card title="Facturas y fojas" eyebrow="Estado documental" icon={<Truck size={19} />} tone="green" context={summary.logistics.context} onOpen={() => onOpen(summary.logistics.context.destination)}>
          <div className="executive-logistics-values">
            <span><strong>{number(summary.logistics.unassigned)}</strong><small>sin foja</small></span>
            <span><strong>{number(summary.logistics.openSheet)}</strong><small>foja abierta</small></span>
            <span><strong>{number(summary.logistics.closedSheet)}</strong><small>foja cerrada</small></span>
          </div>
          {!!summary.logistics.unknown && <div className="executive-mini-note warning">{number(summary.logistics.unknown)} sin clasificación confiable</div>}
          <div className="executive-mini-note"><Route size={12} /> {number(summary.logistics.invoices)} facturas en cobertura</div>
        </Card>
        </div>
      </div>
    </details>
  );
}
