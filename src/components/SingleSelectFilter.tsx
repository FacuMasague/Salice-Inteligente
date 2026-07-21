import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface SingleSelectFilterProps {
  label: string;
  value: string | number;
  options: Array<string | number | { value: string | number; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function SingleSelectFilter({ label, value, options, onChange, disabled = false, className = '' }: SingleSelectFilterProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const normalizedOptions = useMemo(() => options.map((option) => typeof option === 'object' ? option : { value: option, label: String(option) }), [options]);
  const selectedLabel = normalizedOptions.find((option) => String(option.value) === String(value))?.label ?? String(value);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return <div ref={root} className={`shared-single-filter ${open ? 'open' : ''} ${className}`}>
    <button type="button" className="shared-filter-trigger" aria-expanded={open} aria-controls={id} disabled={disabled} onClick={() => setOpen((current) => !current)}>
      <span>{label}</span><strong>{selectedLabel}</strong><ChevronDown size={14} />
    </button>
    {open && <div className="shared-filter-menu" id={id} role="listbox" aria-label={label}>
      <div className="shared-filter-options single">
        {normalizedOptions.map((option) => {
          const active = String(option.value) === String(value);
          return <button type="button" role="option" aria-selected={active} className={active ? 'active' : ''} key={String(option.value)} onClick={() => { onChange(String(option.value)); setOpen(false); }}><i>{active && <Check size={12} />}</i><span>{option.label}</span></button>;
        })}
      </div>
    </div>}
  </div>;
}
