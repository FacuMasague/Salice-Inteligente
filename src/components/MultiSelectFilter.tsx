import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { decodeMultiFilter, encodeMultiFilter } from '../../shared/multi-filter';

interface MultiSelectFilterProps {
  label: string;
  value: string;
  options: string[] | { value: string; label: string }[];
  onChange: (value: string) => void;
  allLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function MultiSelectFilter({ label, value, options, onChange, allLabel = 'Todos', disabled = false, className = '' }: MultiSelectFilterProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = decodeMultiFilter(value);
  const normalizedOptions = useMemo(() => options.map((option) => typeof option === 'string' ? { value: option, label: option } : option), [options]);
  const selectedLabel = selected.length === 0
    ? allLabel
    : selected.length === 1
      ? normalizedOptions.find((option) => option.value === selected[0])?.label ?? selected[0]
      : `${selected.length} seleccionados`;
  const visibleOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    return normalized ? normalizedOptions.filter((option) => option.label.toLocaleLowerCase('es').includes(normalized)) : normalizedOptions;
  }, [normalizedOptions, query]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const toggle = (option: string) => {
    const next = selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option];
    onChange(encodeMultiFilter(next));
  };

  return <div ref={root} className={`shared-multi-filter ${open ? 'open' : ''} ${className}`}>
    <button type="button" className="shared-filter-trigger" aria-expanded={open} aria-controls={id} disabled={disabled} onClick={() => setOpen((current) => !current)}>
      <span>{label}</span><strong>{selectedLabel}</strong><ChevronDown size={14} />
    </button>
    {open && <div className="shared-filter-menu" id={id} role="listbox" aria-label={label} aria-multiselectable="true">
      {normalizedOptions.length > 8 && <label className="shared-filter-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar ${label.toLocaleLowerCase('es')}`} /></label>}
      <button type="button" role="option" aria-selected={!selected.length} className={!selected.length ? 'active' : ''} onClick={() => onChange('')}><i>{!selected.length && <Check size={12} />}</i><span>{allLabel}</span></button>
      <div className="shared-filter-options">
        {visibleOptions.map((option) => {
          const active = selected.includes(option.value);
          return <button type="button" role="option" aria-selected={active} className={active ? 'active' : ''} key={option.value} onClick={() => toggle(option.value)}><i>{active && <Check size={12} />}</i><span>{option.label}</span></button>;
        })}
        {!visibleOptions.length && <p>No hay coincidencias.</p>}
      </div>
    </div>}
  </div>;
}
