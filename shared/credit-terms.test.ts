import { describe, expect, it } from 'vitest';
import { invoiceCreditTermDays, summarizeCreditTerms } from './credit-terms';

describe('observed account terms', () => {
  it('calculates the exact term between issue and due dates', () => {
    expect(invoiceCreditTermDays('2026-07-01', '2026-07-31')).toBe(30);
    expect(invoiceCreditTermDays('2026-07-01', '2026-07-01')).toBe(0);
    expect(invoiceCreditTermDays('2026-07-02', '2026-07-01')).toBeNull();
  });

  it('groups calendar shifts without losing the exact range', () => {
    const summary = summarizeCreditTerms([
      { issuedAt: '2026-01-01', dueAt: '2026-01-31' },
      { issuedAt: '2026-02-01', dueAt: '2026-03-05' },
      { issuedAt: '2026-03-01', dueAt: '2026-04-03' },
    ]);
    expect(summary.status).toBe('consistent');
    expect(summary.creditDays).toBe(30);
    expect(summary.options[0]).toMatchObject({ minDays: 30, maxDays: 33, invoiceCount: 3, share: 100 });
  });

  it('reports a predominant term and preserves alternatives', () => {
    const summary = summarizeCreditTerms([
      { issuedAt: '2026-01-01', dueAt: '2026-01-31' },
      { issuedAt: '2026-02-01', dueAt: '2026-03-03' },
      { issuedAt: '2026-03-01', dueAt: '2026-03-31' },
      { issuedAt: '2026-04-01', dueAt: '2026-04-16' },
    ]);
    expect(summary.status).toBe('predominant');
    expect(summary.creditDays).toBe(30);
    expect(summary.dominantShare).toBe(75);
    expect(summary.options.map((option) => option.days)).toEqual([30, 15]);
  });

  it('does not force one term when no condition has a majority', () => {
    const summary = summarizeCreditTerms([
      { issuedAt: '2026-01-01', dueAt: '2026-01-31' },
      { issuedAt: '2026-02-01', dueAt: '2026-03-03' },
      { issuedAt: '2026-03-01', dueAt: '2026-03-16' },
      { issuedAt: '2026-04-01', dueAt: '2026-04-16' },
    ]);
    expect(summary.status).toBe('mixed');
    expect(summary.options.map((option) => option.share)).toEqual([50, 50]);
  });
});
