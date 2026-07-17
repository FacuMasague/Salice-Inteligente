export const money = (value: number, compact = false) => new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
  notation: compact ? 'compact' : 'standard',
}).format(value);

export const number = (value: number) => new Intl.NumberFormat('es-AR').format(value);

export const shortDate = (value: string) => {
  if (!value) return 'Sin dato';
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00`));
};

export const compactDate = (value: string) => {
  if (!value) return 'Sin dato';
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(`${value}T12:00:00`));
};

export const paymentDelay = (days: number) => days === 0
  ? 'al vencimiento'
  : days > 0
    ? `${days} d después`
    : `${Math.abs(days)} d antes`;

export const longDate = (value: string) => {
  if (!value) return 'Sin dato';
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
};

export const minutesAsTime = (minutes: number) => {
  const start = 9 * 60;
  const total = start + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
