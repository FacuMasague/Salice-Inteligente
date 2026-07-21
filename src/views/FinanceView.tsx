import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, CircleDollarSign, Search } from 'lucide-react';
import type { Client, Invoice } from '../../shared/models';
import { matchesMultiFilter } from '../../shared/multi-filter';
import { MultiSelectFilter } from '../components/MultiSelectFilter';
import { SortButton } from '../components/SortButton';
import { compactDate, creditTermDetail, creditTermLabel, money, paymentDelay } from '../lib/format';
import { cycleSort, emptySort, sortItems } from '../lib/sorting';

interface InvoiceWithClient extends Invoice { client: Client; overdueDays: number }
type Aging = 'all' | 'current' | '1-7' | '8-30' | '31-90' | '91+';
type FinanceSortKey = 'status' | 'client' | 'invoice' | 'issuedAt' | 'dueAt' | 'term' | 'outstanding' | 'age' | 'behavior' | 'risk';

const daysBetween = (from: string, to: string) => Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000);

export function FinanceView({ clients, onOpen, onOpenSeller, snapshotDate }: { clients: Client[]; onOpen: (client: Client) => void; onOpenSeller: (seller: string) => void; snapshotDate: string }) {
  const pageSize = 50;
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [seller, setSeller] = useState('');
  const [portfolio, setPortfolio] = useState('');
  const [aging, setAging] = useState('');
  const [creditTerm, setCreditTerm] = useState('');
  const [tableSort, setTableSort] = useState(emptySort<FinanceSortKey>());
  const sellers = useMemo(() => [...new Set(clients.map((client) => client.seller))].sort((a, b) => a.localeCompare(b, 'es')), [clients]);
  const invoices: InvoiceWithClient[] = clients.flatMap((client) => client.invoices
    .filter((invoice) => invoice.outstanding > 0)
    .map((invoice) => ({ ...invoice, client, overdueDays: Math.max(0, daysBetween(invoice.dueAt, snapshotDate)) })));
  const matchesAging = (invoice: InvoiceWithClient) => matchesMultiFilter(invoice.overdueDays === 0 ? 'current' : invoice.overdueDays <= 7 ? '1-7' : invoice.overdueDays <= 30 ? '8-30' : invoice.overdueDays <= 90 ? '31-90' : '91+', aging);
  const baseFiltered = invoices
    .filter((invoice) => matchesMultiFilter(invoice.status, status))
    .filter((invoice) => matchesMultiFilter(invoice.client.seller, seller))
    .filter((invoice) => matchesMultiFilter(invoice.client.portfolioStatus, portfolio))
    .filter((invoice) => matchesMultiFilter(invoice.client.creditTermStatus, creditTerm))
    .filter((invoice) => `${invoice.client.tradeName} ${invoice.client.reference} ${invoice.number} ${invoice.client.seller}`.toLowerCase().includes(query.trim().toLowerCase()));
  const originallySorted = baseFiltered
    .filter(matchesAging)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || b.outstanding - a.outstanding);
  const filtered = sortItems(originallySorted, tableSort, (invoice, key) => {
    if (key === 'status') return invoice.status === 'open' ? 0 : invoice.status === 'due_soon' ? 1 : 2;
    if (key === 'client') return invoice.client.tradeName;
    if (key === 'invoice') return invoice.number;
    if (key === 'issuedAt') return invoice.issuedAt;
    if (key === 'dueAt') return invoice.dueAt;
    if (key === 'term') return invoice.creditTermDays;
    if (key === 'outstanding') return invoice.outstanding;
    if (key === 'age') return invoice.overdueDays;
    if (key === 'behavior') return invoice.client.avgPaymentDelayDays;
    return invoice.client.collectionRisk;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleInvoices = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const overdue = filtered.filter((invoice) => invoice.status === 'overdue');
  const dueSoon = filtered.filter((invoice) => invoice.status === 'due_soon');
  const total = filtered.reduce((sum, invoice) => sum + invoice.outstanding, 0);
  const behaviorClients = [...new Map(filtered.map((invoice) => [invoice.client.id, invoice.client])).values()];
  const paymentSamples = behaviorClients.reduce((sum, client) => sum + client.paymentSampleSize, 0);
  const onTimeRate = paymentSamples ? Math.round(behaviorClients.reduce((sum, client) => sum + client.onTimePaymentRate * client.paymentSampleSize, 0) / paymentSamples) : 0;
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
  const direction = (key: FinanceSortKey) => tableSort.key === key ? tableSort.direction : null;
  const ariaSort = (key: FinanceSortKey): 'ascending' | 'descending' | 'none' => direction(key) === 'asc' ? 'ascending' : direction(key) === 'desc' ? 'descending' : 'none';
  const changeTableSort = (key: FinanceSortKey) => { setTableSort((current) => cycleSort(current, key)); resetPage(); };

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
        <MultiSelectFilter label="Estado" value={status} options={[{ value: 'overdue', label: 'Vencidos' }, { value: 'due_soon', label: 'Por vencer' }, { value: 'open', label: 'Abiertos' }]} onChange={(value) => { setStatus(value); resetPage(); }} />
        <MultiSelectFilter label="Antigüedad" value={aging} options={[{ value: 'current', label: 'No vencido' }, { value: '1-7', label: '1–7 días' }, { value: '8-30', label: '8–30 días' }, { value: '31-90', label: '31–90 días' }, { value: '91+', label: 'Más de 90' }]} onChange={(value) => { setAging(value); resetPage(); }} />
        <MultiSelectFilter label="Vendedor" value={seller} options={sellers} onChange={(value) => { setSeller(value); resetPage(); }} />
        <MultiSelectFilter label="Cartera Salice" value={portfolio} options={[{ value: 'confirmed', label: 'Confirmada' }, { value: 'review', label: 'A revisar' }]} onChange={(value) => { setPortfolio(value); resetPage(); }} />
        <MultiSelectFilter label="Plazo observado" value={creditTerm} options={[{ value: 'consistent', label: 'Consistente' }, { value: 'predominant', label: 'Predominante' }, { value: 'mixed', label: 'Condición mixta' }, { value: 'single', label: 'Una factura' }, { value: 'unavailable', label: 'Sin muestra' }]} onChange={(value) => { setCreditTerm(value); resetPage(); }} />
      </div>

      <section className="data-card aging-card">
        <div className="data-card-header"><div><span className="section-kicker">Antigüedad de deuda</span><h2>Dónde concentrar la cobranza</h2><p>Montos pendientes según días transcurridos desde el vencimiento.</p></div><button className="button secondary" onClick={() => setAging('')}>Ver todas</button></div>
        <div className="aging-bars">{agingBands.map((band) => <button key={band.key} className={matchesMultiFilter(band.key, aging) && Boolean(aging) ? 'active' : ''} onClick={() => { setAging(band.key); resetPage(); }}><span>{band.label}</span><div><i style={{ width: `${band.amount / maxAgingAmount * 100}%` }} /></div><strong>{money(band.amount, true)}</strong><small>{band.count} docs.</small></button>)}</div>
      </section>

      <section className="data-card">
        <div className="data-card-header"><div><span className="section-kicker">Cuenta corriente</span><h2>Agenda de cobranzas</h2><p>El saldo mostrado es el pendiente real del comprobante, no su importe original.</p></div><span className="count-badge">{filtered.length} resultados</span></div>
        <div className="table-wrap">
          <table className="data-table finance-table">
            <thead><tr><th aria-sort={ariaSort('status')}><SortButton label="Estado" direction={direction('status')} onClick={() => changeTableSort('status')} /></th><th aria-sort={ariaSort('client')}><SortButton label="Cliente" direction={direction('client')} onClick={() => changeTableSort('client')} /></th><th aria-sort={ariaSort('invoice')}><SortButton label="Comprobante" direction={direction('invoice')} onClick={() => changeTableSort('invoice')} /></th><th aria-sort={ariaSort('issuedAt')}><SortButton label="Compra / emisión" direction={direction('issuedAt')} onClick={() => changeTableSort('issuedAt')} /></th><th aria-sort={ariaSort('dueAt')}><SortButton label="Vencimiento" direction={direction('dueAt')} onClick={() => changeTableSort('dueAt')} /></th><th aria-sort={ariaSort('term')}><SortButton label="Plazo factura" direction={direction('term')} onClick={() => changeTableSort('term')} /></th><th aria-sort={ariaSort('outstanding')}><SortButton label="Saldo pendiente" direction={direction('outstanding')} onClick={() => changeTableSort('outstanding')} /></th><th aria-sort={ariaSort('age')}><SortButton label="Antigüedad" direction={direction('age')} onClick={() => changeTableSort('age')} /></th><th aria-sort={ariaSort('behavior')}><SortButton label="Cuenta corriente / conducta" direction={direction('behavior')} onClick={() => changeTableSort('behavior')} /></th><th aria-sort={ariaSort('risk')}><SortButton label="Riesgo" direction={direction('risk')} onClick={() => changeTableSort('risk')} /></th><th /></tr></thead>
            <tbody>
              {visibleInvoices.map((invoice) => <tr key={invoice.id} onClick={() => onOpen(invoice.client)}>
                <td><span className={`invoice-pill ${invoice.status}`}>{invoice.status === 'overdue' ? 'Vencida' : invoice.status === 'due_soon' ? 'Por vencer' : 'Abierta'}</span></td>
                <td><strong>{invoice.client.tradeName}</strong><span className="cell-sub"><button className="entity-link" onClick={(event) => { event.stopPropagation(); onOpenSeller(invoice.client.seller); }}>{invoice.client.seller}</button> · {invoice.client.active ? 'Activo' : 'Inactivo GESI'}</span></td>
                <td><strong className="normal-weight">{invoice.number}</strong></td>
                <td>{compactDate(invoice.issuedAt)}</td><td><strong>{compactDate(invoice.dueAt)}</strong></td>
                <td><strong>{invoice.creditTermDays != null ? `${invoice.creditTermDays} días` : 'Sin dato'}</strong><span className="cell-sub">compra/emisión → vencimiento</span></td>
                <td><strong>{money(invoice.outstanding)}</strong><span className="cell-sub">original {money(invoice.amount, true)}</span></td>
                <td><strong>{invoice.overdueDays ? `${invoice.overdueDays} días` : 'En término'}</strong></td>
                <td title={creditTermDetail(invoice.client)}><strong>{creditTermLabel(invoice.client)}</strong><span className="cell-sub">GESI: {invoice.client.paymentMethod}</span><span className="cell-sub">{invoice.client.paymentSampleSize ? `${paymentDelay(invoice.client.avgPaymentDelayDays)} · ${invoice.client.onTimePaymentRate}% en término` : 'sin muestra conciliada'}</span></td>
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
