import type { CreditTermOption, CreditTermStatus } from './models.js';

export interface CreditTermSample {
  issuedAt: string;
  dueAt: string;
}

export interface CreditTermSummary {
  creditDays: number | null;
  status: CreditTermStatus;
  sampleSize: number;
  invalidSampleSize: number;
  dominantShare: number;
  minDays: number | null;
  maxDays: number | null;
  options: CreditTermOption[];
}

const DAY_MS = 86_400_000;
const MAX_CREDIT_TERM_DAYS = 365;
const CLUSTER_TOLERANCE_DAYS = 3;

const isoDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';

const dayValue = (value: string) => {
  const normalized = isoDay(value);
  if (!normalized) return null;
  const timestamp = Date.parse(`${normalized}T12:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== normalized) return null;
  return timestamp;
};

export function invoiceCreditTermDays(issuedAt: string, dueAt: string) {
  const issued = dayValue(issuedAt);
  const due = dayValue(dueAt);
  if (issued == null || due == null) return null;
  const days = Math.round((due - issued) / DAY_MS);
  return days >= 0 && days <= MAX_CREDIT_TERM_DAYS ? days : null;
}

export function summarizeCreditTerms(samples: CreditTermSample[]): CreditTermSummary {
  const observations = samples.map((sample) => ({
    days: invoiceCreditTermDays(sample.issuedAt, sample.dueAt),
    issuedAt: isoDay(sample.issuedAt),
  }));
  const valid = observations.filter((sample): sample is { days: number; issuedAt: string } => sample.days != null);
  const byExactDays = new Map<number, { days: number; count: number; lastUsedAt: string }>();
  for (const sample of valid) {
    const current = byExactDays.get(sample.days) ?? { days: sample.days, count: 0, lastUsedAt: '' };
    current.count += 1;
    if (sample.issuedAt > current.lastUsedAt) current.lastUsedAt = sample.issuedAt;
    byExactDays.set(sample.days, current);
  }

  const remaining = [...byExactDays.values()];
  const options: CreditTermOption[] = [];
  while (remaining.length) {
    remaining.sort((a, b) => b.count - a.count || a.days - b.days || b.lastUsedAt.localeCompare(a.lastUsedAt));
    const seed = remaining[0];
    const cluster = remaining.filter((candidate) => Math.abs(candidate.days - seed.days) <= CLUSTER_TOLERANCE_DAYS);
    const clusteredDays = new Set(cluster.map((candidate) => candidate.days));
    const invoiceCount = cluster.reduce((sum, candidate) => sum + candidate.count, 0);
    options.push({
      days: seed.days,
      minDays: Math.min(...cluster.map((candidate) => candidate.days)),
      maxDays: Math.max(...cluster.map((candidate) => candidate.days)),
      invoiceCount,
      share: valid.length ? Math.max(1, Math.round(invoiceCount / valid.length * 100)) : 0,
      lastUsedAt: cluster.map((candidate) => candidate.lastUsedAt).sort().at(-1) ?? '',
    });
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      if (clusteredDays.has(remaining[index].days)) remaining.splice(index, 1);
    }
  }
  options.sort((a, b) => b.invoiceCount - a.invoiceCount || b.lastUsedAt.localeCompare(a.lastUsedAt) || a.days - b.days);

  const sampleSize = valid.length;
  const dominantShare = options[0]?.share ?? 0;
  const status: CreditTermStatus = sampleSize === 0
    ? 'unavailable'
    : sampleSize === 1
      ? 'single'
      : options.length === 1
        ? 'consistent'
        : dominantShare >= 60
          ? 'predominant'
          : 'mixed';
  return {
    creditDays: options[0]?.days ?? null,
    status,
    sampleSize,
    invalidSampleSize: samples.length - sampleSize,
    dominantShare,
    minDays: sampleSize ? Math.min(...valid.map((sample) => sample.days)) : null,
    maxDays: sampleSize ? Math.max(...valid.map((sample) => sample.days)) : null,
    options,
  };
}
