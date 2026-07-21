import { useEffect, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, CircleDollarSign, Download, MapPin, Package, ReceiptText, RefreshCw, UserRound, X } from "lucide-react";
import type { InvoiceDetailPayload } from "../../shared/models";
import { compactDate, money, number } from "../lib/format";
interface InvoiceDetailDrawerProps {
    invoiceId: string;
    onClose: () => void;
    onOpenClient: (clientId: number) => void;
    onOpenSeller: (seller: string) => void;
}
const statusLabels: Record<InvoiceDetailPayload["status"], string> = {
    paid: "Paid", open: "Open", due_soon: "Due soon", overdue: "Overdue", not_due: "Not due",
};
export function InvoiceDetailDrawer({ invoiceId, onClose, onOpenClient, onOpenSeller }: InvoiceDetailDrawerProps) {
    const [detail, setDetail] = useState<InvoiceDetailPayload | null>(null);
    const [error, setError] = useState("");
    useEffect(() => {
        setDetail(null);
        setError("");
        const controller = new AbortController();
        fetch(`/api/invoices/detail?id=${encodeURIComponent(invoiceId)}`, { signal: controller.signal })
            .then(async (response) => {
            const payload = await response.json();
            if (!response.ok)
                throw new Error(payload.error || "The document could not be loaded.");
            return payload as InvoiceDetailPayload;
        })
            .then(setDetail)
            .catch((cause: Error) => {
            if (cause.name !== "AbortError")
                setError(cause.message);
        });
        return () => controller.abort();
    }, [invoiceId]);
    return <div className="invoice-drawer-layer">
    <button className="invoice-drawer-backdrop" aria-label="Close document" onClick={onClose}/>
    <aside className="invoice-detail-drawer" aria-label="Full document detail">
      <header className="invoice-detail-header">
        <div><span className="section-kicker"><ReceiptText size={14}/> Synthetic document</span><h2>{detail?.number || "Loading document\u2026"}</h2>{detail && <p>{detail.kind === "credit_note" ? "Credit note" : "Invoice"} · cutoff {compactDate(detail.sourceMaxDate)}</p>}</div>
        <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button>
      </header>

      {!detail && !error && <div className="invoice-drawer-state"><RefreshCw className="spin" size={24}/><strong>Loading available information…</strong></div>}
      {error && <div className="invoice-drawer-state error"><AlertTriangle size={25}/><strong>{error}</strong></div>}
      {detail && <div className="invoice-detail-body">
        <section className="invoice-client-card">
          <div className="invoice-client-icon"><UserRound size={21}/></div>
          <div><button className="entity-link" onClick={() => onOpenClient(detail.client.id)}><strong>{detail.client.name}</strong></button>{detail.client.tradeName && detail.client.tradeName !== detail.client.name && <span>{detail.client.tradeName}</span>}<small><MapPin size={12}/> {[detail.client.address, detail.client.locality].filter(Boolean).join(", ") || "Address unavailable"}</small></div>
          <button className="entity-link invoice-seller-link" onClick={() => onOpenSeller(detail.client.seller)}>{detail.client.seller}</button>
        </section>

        <section className="invoice-summary-grid">
          <article><CalendarDays size={17}/><span>Issued</span><strong>{compactDate(detail.issuedAt)}</strong><small>Due {compactDate(detail.dueAt)}</small></article>
          <article><ReceiptText size={17}/><span>Payment terms</span><strong>{detail.paymentMethod}</strong><small>{detail.creditTermDays == null ? "Term unavailable" : `${number(detail.creditTermDays)} days`}</small></article>
          <article className={detail.outstanding > 0 ? "attention" : "settled"}>{detail.outstanding > 0 ? <CircleDollarSign size={17}/> : <CheckCircle2 size={17}/>}<span>{detail.outstanding > 0 ? "Pending balance" : "Status"}</span><strong>{detail.outstanding > 0 ? money(detail.outstanding) : statusLabels[detail.status]}</strong><small>Amount {money(detail.amount)}</small></article>
        </section>

        <section className="invoice-source-details">
          <span><strong>Status</strong>{statusLabels[detail.status]}</span>
          <span><strong>Issuer</strong>{detail.issuer || "No verifiable value"}</span>
          <span><strong>Branch</strong>{detail.branch || "No verifiable value"}</span>
          {detail.paidAt && <span><strong>Payment reconciled</strong>{compactDate(detail.paidAt)}</span>}
        </section>

        <section className="invoice-line-section">
          <div className="section-title-row"><div><span className="section-kicker"><Package size={14}/> Items</span><h3>Detail of products</h3></div><span className="count-badge">{number(detail.lineItems.length)}</span></div>
          {!detail.detailAvailable && <div className="invoice-coverage-warning"><AlertTriangle size={17}/><span>Line detail is unavailable. The verified header and balance remain visible without invented values.</span></div>}
          {!!detail.lineItems.length && <div className="invoice-line-table"><header><span>Product</span><span>Units</span><span>Kilograms</span><span>Net sales</span></header>{detail.lineItems.map((item, index) => <article key={`${item.productId}-${index}`}><div><strong>{item.product}</strong><small>{item.productId} · {item.brand} · {item.category}</small></div><span>{number(item.units)}</span><span>{number(item.kilos, 3)}</span><strong>{money(item.netAmount)}</strong></article>)}</div>}
        </section>
      </div>}

      {detail && <footer className="invoice-detail-footer"><span>Source: synthetic local dataset and analytical databases.</span><a className="button primary" href={`/api/invoices/pdf?id=${encodeURIComponent(detail.id)}`} download><Download size={16}/> Download PDF</a></footer>}
    </aside>
  </div>;
}
