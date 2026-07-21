import { ArrowDown, ArrowUp } from 'lucide-react';
import type { SortDirection } from '../lib/sorting';

export function SortButton({ label, direction, onClick }: {
  label: string;
  direction: SortDirection | null;
  onClick: () => void;
}) {
  const stateLabel = direction === 'asc' ? 'menor a mayor' : direction === 'desc' ? 'mayor a menor' : 'orden original';
  const nextLabel = direction === 'asc' ? 'mayor a menor' : direction === 'desc' ? 'orden original' : 'menor a mayor';
  return <button type="button" className={`sort-button ${direction ? 'active' : ''}`} onClick={onClick} aria-label={`${label}: ${stateLabel}. Ordenar ${nextLabel}`}>
    <span>{label}</span>
    {direction === 'asc' ? <ArrowUp size={12} aria-hidden="true" /> : direction === 'desc' ? <ArrowDown size={12} aria-hidden="true" /> : <i className="sort-button-placeholder" aria-hidden="true" />}
  </button>;
}
