import { ChevronDown } from 'lucide-react';

interface SingleSelectFilterProps {
  label: string;
  value: string | number;
  options: Array<string | number | { value: string | number; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function SingleSelectFilter({ label, value, options, onChange, disabled = false, className = '' }: SingleSelectFilterProps) {
  const normalizedOptions = options.map((option) => typeof option === 'object' ? option : { value: option, label: String(option) });

  return <label className={`shared-single-filter ${className}`}>
    <span>{label}</span>
    <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {normalizedOptions.map((option) => <option key={String(option.value)} value={option.value}>{option.label}</option>)}
    </select>
    <ChevronDown size={14} />
  </label>;
}
