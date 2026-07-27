import { describe, expect, it } from 'vitest';
import {
  MIN_RECEIVABLE_DOCUMENT_AMOUNT,
  isActionableReceivableAmount,
  isExcludedReceivableClient,
} from './receivables-policy';

describe('política de cartera v0.10.7', () => {
  it('incluye desde $1.000 y desprecia saldos menores', () => {
    expect(MIN_RECEIVABLE_DOCUMENT_AMOUNT).toBe(1_000);
    expect(isActionableReceivableAmount(999.99)).toBe(false);
    expect(isActionableReceivableAmount(1_000)).toBe(true);
  });

  it('reconoce las razones sociales excluidas sin depender de mayúsculas o puntuación', () => {
    expect(isExcludedReceivableClient('GBA M6 SA')).toBe(true);
    expect(isExcludedReceivableClient('consumidor final')).toBe(true);
    expect(isExcludedReceivableClient('Salice Distribuciones S.A.')).toBe(true);
    expect(isExcludedReceivableClient('Veterinaria real')).toBe(false);
  });
});
