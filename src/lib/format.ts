import type { Client } from '../../shared/models';

export const number = (value: number, maximumFractionDigits = 0) => new Intl.NumberFormat('es-AR', {
  maximumFractionDigits,
}).format(value);

export const compactNumber = (value: number) => {
  const absolute = Math.abs(value);
  if (absolute < 1_000) return number(value);
  const divisor = absolute >= 1_000_000 ? 1_000_000 : 1_000;
  const suffix = divisor === 1_000_000 ? 'M' : 'mil';
  const scaled = value / divisor;
  return `${number(scaled, Math.abs(scaled) < 100 ? 1 : 0)} ${suffix}`;
};

export const money = (value: number, compact = false) => compact
  ? `${value < 0 ? '-$' : '$'} ${compactNumber(Math.abs(value))}`
  : new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);

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

type CreditTermClient = Pick<Client, 'creditDays' | 'creditTermStatus' | 'creditTermSampleSize' | 'creditTermDominantShare' | 'creditTermMinDays' | 'creditTermMaxDays' | 'creditTermOptions'>;

const termDaysLabel = (days: number) => days === 0 ? 'Contado observado' : `${days} días`;

export const creditTermLabel = (client: CreditTermClient) => {
  if (client.creditDays == null || client.creditTermStatus === 'unavailable') return 'Sin plazo habitual reciente';
  if (client.creditTermStatus === 'mixed') return 'Condición mixta';
  if (client.creditTermStatus === 'single') return `${termDaysLabel(client.creditDays)} · 1 factura`;
  if (client.creditTermStatus === 'predominant') return `${termDaysLabel(client.creditDays)} predominante`;
  return `${termDaysLabel(client.creditDays)} habitual`;
};

export const creditTermDetail = (client: CreditTermClient) => {
  if (!client.creditTermSampleSize) return 'No hay facturas con compra/emisión y vencimiento válidos en los últimos 365 días.';
  const observedRange = client.creditTermMinDays !== client.creditTermMaxDays
    ? ` · rango exacto ${client.creditTermMinDays}–${client.creditTermMaxDays} días`
    : '';
  if (client.creditTermStatus === 'single') return `Basado en una única factura${observedRange}.`;
  if (client.creditTermStatus === 'mixed') {
    const alternatives = client.creditTermOptions.slice(0, 3).map((option) => `${option.days} d (${option.share}%)`).join(', ');
    return `${client.creditTermSampleSize} facturas con más de una condición y sin mayoría: ${alternatives}${observedRange}.`;
  }
  const calendarNote = client.creditTermOptions[0] && client.creditTermOptions[0].minDays !== client.creditTermOptions[0].maxDays
    ? `; incluye corrimientos de ${client.creditTermOptions[0].minDays} a ${client.creditTermOptions[0].maxDays} días`
    : '';
  const predominance = client.creditTermStatus === 'predominant' ? ` · ${client.creditTermDominantShare}% de la muestra` : '';
  return `${client.creditTermSampleSize} facturas observadas${predominance}${calendarNote}${observedRange}.`;
};

export const longDate = (value: string) => {
  if (!value) return 'Sin dato';
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }).format(parsed);
};

export const minutesAsTime = (minutes: number) => {
  const start = 9 * 60;
  const total = start + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
