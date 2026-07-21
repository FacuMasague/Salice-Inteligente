import { describe, expect, it } from 'vitest';
import { decodeMultiFilter, encodeMultiFilter, matchesMultiFilter, normalizeMultiFilter } from './multi-filter';

describe('shared multi-select filters', () => {
  it('represents All as an empty exclusive selection', () => {
    expect(decodeMultiFilter('')).toEqual([]);
    expect(decodeMultiFilter('all')).toEqual([]);
    expect(encodeMultiFilter([])).toBe('');
  });

  it('keeps compatibility with single filters and combines multiple options', () => {
    expect(decodeMultiFilter('Ana')).toEqual(['Ana']);
    expect(decodeMultiFilter('["Ana","Julieta","Ana"]')).toEqual(['Ana', 'Julieta']);
    expect(encodeMultiFilter(['Ana', 'Julieta'])).toBe('["Ana","Julieta"]');
  });

  it('applies OR union and discards options outside the allowed universe', () => {
    const selected = encodeMultiFilter(['Ana', 'Julieta']);
    expect(matchesMultiFilter('Ana', selected)).toBe(true);
    expect(matchesMultiFilter('Pedro', selected)).toBe(false);
    expect(matchesMultiFilter('Pedro', '')).toBe(true);
    expect(normalizeMultiFilter('["Ana","Desconocido"]', ['Ana', 'Julieta'])).toBe('Ana');
  });
});
