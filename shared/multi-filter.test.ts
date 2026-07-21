import { describe, expect, it } from 'vitest';
import { decodeMultiFilter, encodeMultiFilter, matchesMultiFilter, normalizeMultiFilter } from './multi-filter';

describe('filtros múltiples compartidos', () => {
  it('representa Todos como una selección vacía y exclusiva', () => {
    expect(decodeMultiFilter('')).toEqual([]);
    expect(decodeMultiFilter('all')).toEqual([]);
    expect(encodeMultiFilter([])).toBe('');
  });

  it('mantiene compatibilidad con filtros simples y combina varias opciones', () => {
    expect(decodeMultiFilter('Ana')).toEqual(['Ana']);
    expect(decodeMultiFilter('["Ana","Julieta","Ana"]')).toEqual(['Ana', 'Julieta']);
    expect(encodeMultiFilter(['Ana', 'Julieta'])).toBe('["Ana","Julieta"]');
  });

  it('aplica unión OR y descarta opciones que no pertenecen al universo permitido', () => {
    const selected = encodeMultiFilter(['Ana', 'Julieta']);
    expect(matchesMultiFilter('Ana', selected)).toBe(true);
    expect(matchesMultiFilter('Pedro', selected)).toBe(false);
    expect(matchesMultiFilter('Pedro', '')).toBe(true);
    expect(normalizeMultiFilter('["Ana","Desconocido"]', ['Ana', 'Julieta'])).toBe('Ana');
  });
});
