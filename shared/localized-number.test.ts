import { describe, expect, it } from 'vitest';
import { localizedEditableNumber, parseLocalizedNumber } from './localized-number';

describe('números localizados para Argentina', () => {
  it('interpreta coma decimal y punto de miles', () => {
    expect(parseLocalizedNumber('1.234,56')).toBe(1234.56);
    expect(parseLocalizedNumber('125.000')).toBe(125000);
    expect(parseLocalizedNumber('12,5')).toBe(12.5);
    expect(parseLocalizedNumber('-2.500,75')).toBe(-2500.75);
  });

  it('mantiene compatibles los números técnicos y rechaza entradas inválidas', () => {
    expect(parseLocalizedNumber(1234.56)).toBe(1234.56);
    expect(parseLocalizedNumber('12.5')).toBe(12.5);
    expect(parseLocalizedNumber('')).toBeNull();
    expect(parseLocalizedNumber('1,2,3')).toBeNull();
  });

  it('presenta valores editables con convención argentina', () => {
    expect(localizedEditableNumber(1234.56)).toBe('1.234,56');
  });
});
