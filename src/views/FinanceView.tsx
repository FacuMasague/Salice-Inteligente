import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, CircleDollarSign, Search } from 'lucide-react';
import type { Client, Invoice, InvoiceStatus } from '../../shared/models';
import { compactDate, money, paymentDelay } from '../lib/format';

interface InvoiceWithClient extends Invoice { client: Client; overdueDays: number }
type Aging = 'all' | 'current' | '1-7' | '8-30' | '31-90' | '91+';

const daysBetween = (from: string, to: string) => Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000);

export function FinanceView({ clients, onOpen, snapshotDate }: { clients: Client[]; onOpen: (client: Client) => void; snapshotDate: string }) {
  const pageSize = 50;
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | InvoiceStatus>('all');
  const [seller, setSeller] = useState('all');
  const [portfolio, setPortfolio] = useState<'all' | 'confirmed' | 'review'>('all');
  const [aging, setAging] = useState<Aging>('all');
  const sellers = useMemo(() => [...new Set(clients.map((client) => client.seller))].sort((a, b) => a.localeCompare(b, 'es')), [clients]);
  const invoices: InvoiceWithClient[] = clients.flatMap((client) => client.invoices
    .filter((invoice) => invoice.outstanding > 0)
    .map((invoice) => ({ ...invoice, client, overdueDays: Math.max(0, daysBetween(invoice.dueAt, snapshotDate)) })));
  const matchesAging = (invoice: InvoiceWithClient) => aging === 'all'
    || (aging === 'current' && invoice.overdueDays === 0)
    || (aging === '1-7' && invoice.overdueDays >= 1 && invoice.overdueDays <= 7)
    || (aging === '8-30' && invoice.overdueDays >= 8 && invoice.overdueDays <= 30)
    || (aging === '31-90' && invoice.overdueDays >= 31 && invoice.overdueDays <= 90)
    || (aging === '91+' && invoice.overdueDays >= 91);
  const baseFiltered = invoices
    .filter((invoice) => status === 'all' || invoice.status === status)
    .filter((invoice) => seller === 'all' || invoice.client.seller === seller)
    .filter((invoice) => portfolio === 'all' || invoice.client.portfolioStatus === portfolio)
    .filter((invoice) => `${invoice.client.tradeName} ${invoice.client.reference} ${invoice.number} ${invoice.client.seller}`.toLowerCase().includes(query.trim().toLowerCase()));
  const filtered = baseFiltered
    .filter(matchesAging)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || b.outstanding - a.outstanding);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleInvoices = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const overdue = filtered.filter((invoice) => invoice.status === 'overdue');
  const dueSoon = filtered.filter((invoice) => invoice.status === 'due_soon');
  const total = filtered.reduce((sum, invoice) => sum + invoice.outstanding, 0);
  const paymentSamples = clients.reduce((sum, client) => sum + client.paymentSampleSize, 0);
  const onTimeRate = paymentSamples ? Math.round(clients.reduce((sum, client) => sum + client.onTimePaymentRate * client.paymentSampleSize, 0) / paymentSamples) : 0;
  const agingBands = [
    { key: 'current' as Aging, label: 'No vencido', from: 0, to: 0 },
    { key: '1-7' as Aging, label: '1–7 días', from: 1, to: 7 },
    { key: '8-30' as Aging, label: '8–30 días', from: 8, to: 30 },
    { key: '31-90' as Aging, label: '31–90 días', from: 31, to: 90 },
    { key: '91+' as Aging, label: 'Más de 90', from: 91, to: Infinity },
  ].map((band) => {
    const matches = baseFiltered.filter((invoice) => invoice.overdueDays >= band.from && invoice.overdueDays <= band.to);
    return { ...band, count: matches.length, amount: matches.reduce((sum, invoice) => sum + invoice.outstanding, 0) };
  });
  const maxAgingAmount = Math.max(...agingBands.map((band) => band.amount), 1);
  const resetPage = () => setPage(1);

  return (
    <div className="page-view finance-page">
      <div className="finance-summary" data-tour="finance-summary">
        <article className="summary-card danger"><AlertTriangle size={21} /><div><span>Vencido filtrado</span><strong>{money(overdue.reduce((sum, item) => sum + item.outstanding, 0), true)}</strong><small>{overdue.length} comprobantes</small></div></article>
        <article className="summary-card warning"><CalendarClock size={21} /><div><span>Vence en 7 días</span><strong>{money(dueSoon.reduce((sum, item) => sum + item.outstanding, 0), true)}</strong><small>{dueSoon.length} comprobantes</small></div></article>
        <article className="summary-card"><CircleDollarSign size={21} /><div><span>Cartera abierta filtrada</span><strong>{money(total, true)}</strong><small>{filtered.length} comprobantes</small></div></article>
        <article className="summary-card success"><CheckCircle2 size={21} /><div><span>Pagos en término</span><strong>{paymentSamples ? `${onTimeRate}%` : 'Sin datos'}</strong><small>{paymentSamples} facturas con vencimiento conciliado</small></div></article>
      </div>

      <div className="finance-filter-bar">
        <label className="large-search"><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); resetPage(); }} placeholder="Buscar cliente o comprobante…" /></label>
        <label><span>Estado</span><select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); resetPage(); }}><option value="all">Todos</option><option value="overdue">Vencidos</option><option value="due_soon">Por vencer</option><option value="open">Abiertos</option></select></label>
        <label><span>Antigüedad</span><select value={aging} onChange={(event) => { setAging(event.target.value as Aging); resetPage(); }}><option value="all">Todas</option><option value="current">No vencido</option><option value="1-7">1–7 días</option><option value="8-30">8–30 días</option><option value="31-90">31–90 días</option><option value="91+">Más de 90</option></select></label>
        <label><span>Vendedor</span><select value={seller} onChange={(event) => { setSeller(event.target.value); resetPage(); }}><option value="all">Todos</option>{sellers.map((name) => <option value={name} key={name}>{name}</option>)}</select></label>
        <label><span>Cartera Salice</span><select value={portfolio} onChange={(event) => { setPortfolio(event.target.value as typeof portfolio); resetPage(); }}><option value="all">Todas</option><option value="confirmed">Confirmada</option><option value="review">A revisar</option></select></label>
      </div>

      <section className="data-card aging-card">
        <div className="data-card-header"><div><span className="section-kicker">Antigüedad de deuda</span><h2>Dónde concentrar la cobranza</h2><p>Montos pendientes según días transcurridos desde el vencimiento.</p></div><button className="button secondary" onClick={() => setAging('all')}>Ver todas</button></div>
        <div className="aging-bars">{agingBands.map((band) => <button key={band.key} className={aging === band.key ? 'active' : ''} onClick={() => { setAging(band.key); resetPage(); }}><span>{band.label}</span><div><i style={{ width: `${band.amount / maxAgingAmount * 100}%` }} /></div><strong>{money(band.amount, true)}</strong><small>{band.count} docs.</small></button>)}</div>
      </section>

      <section className="data-card">
        <div className="data-card-header"><div><span className="section-kicker">Cuenta corriente</span><h2>Agenda de cobranzas</h2><p>El saldo mostrado es el pendiente real del comprobante, no su importe original.</p></div><span className="count-badge">{filtered.length} resultados</span></div>
        <div className="table-wrap">
          <table className="data-table finance-table">
            <thead><tr><th>Estado</th><th>Cliente</th><th>Comprobante</th><th>Emisión</th><th>Vencimiento</th><th>Saldo pendiente</th><th>Antigüedad</th><th>Condición / conducta</th><th>Riesgo</th><th /></tr></thead>
            <tbody>
              {visibleInvoices.map((invoice) => <tr key={invoice.id} onClick={() => onOpen(invoice.client)}>
                <td><span className={`invoice-pill ${invoice.status}`}>{invoice.status === 'overdue' ? 'Vencida' : invoice.status === 'due_soon' ? 'Por vencer' : 'Abierta'}</span></td>
                <td><strong>{invoice.client.tradeName}</strong><span className="cell-sub">{invoice.client.seller} · {invoice.client.active ? 'Activo' : 'Inactivo GESI'}</span></td>
                <td><strong className="normal-weight">{invoice.number}</strong></td>
                <td>{compactDate(invoice.issuedAt)}</td><td><strong>{compactDate(invoice.dueAt)}</strong></td>
                <td><strong>{money(invoice.outstanding)}</strong><span className="cell-sub">original {money(invoice.amount, true)}</span></td>
                <td><strong>{invoice.overdueDays ? `${invoice.overdueDays} días` : 'En término'}</strong></td>
                <td><strong>{invoice.client.paymentMethod}</strong><span className="cell-sub">{invoice.client.paymentSampleSize ? `${paymentDelay(invoice.client.avgPaymentDelayDays)} · ${invoice.client.onTimePaymentRate}% en término` : 'sin muestra conciliada'}</span></td>
                <td><span className={`score-badge ${invoice.client.health}`}>{invoice.client.collectionRisk}</span></td>
                <td><button className="icon-button" aria-label={`Abrir ${invoice.client.tradeName}`}><ChevronRight size={17} /></button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="table-pagination"><span>Mostrando {(currentPage - 1) * pageSize + (visibleInvoices.length ? 1 : 0)}–{(currentPage - 1) * pageSize + visibleInvoices.length} de {filtered.length}</span><div><button className="button secondary" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><strong>{currentPage} / {pageCount}</strong><button className="button secondary" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Siguiente</button></div></div>
      </section>
    </div>
  );
}
