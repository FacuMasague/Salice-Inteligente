import { AlertTriangle, X } from 'lucide-react';
import type { ReactNode } from 'react';

export function ActionDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  disabled = false,
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return <div className="action-dialog-layer" role="presentation">
    <button className="action-dialog-backdrop" aria-label="Cancelar" onClick={onCancel} />
    <section className="action-dialog" role="alertdialog" aria-modal="true" aria-labelledby="action-dialog-title">
      <header><span><AlertTriangle size={17} /></span><div><h2 id="action-dialog-title">{title}</h2><p>{description}</p></div><button aria-label="Cerrar" onClick={onCancel}><X size={16} /></button></header>
      {children && <div className="action-dialog-content">{children}</div>}
      <footer><button className="button secondary" disabled={busy} onClick={onCancel}>Cancelar</button><button className="button primary danger-action" disabled={busy || disabled} onClick={onConfirm}>{busy ? 'Procesando…' : confirmLabel}</button></footer>
    </section>
  </div>;
}
