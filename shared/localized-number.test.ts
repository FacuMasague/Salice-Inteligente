import { describe, expect, it } from 'vitest';
import { localizedEditableNumber, parseLocalizedNumber } from './localized-number';

describe('Argentine localized numbers', () => {
  it('interprets decimal commas and thousands separators', () => {
    expect(parseLocalizedNumber('1.234,56')).toBe(1234.56);
    expect(parseLocalizedNumber('125.000')).toBe(125000);
    expect(parseLocalizedNumber('12,5')).toBe(12.5);
    expect(parseLocalizedNumber('-2.500,75')).toBe(-2500.75);
  });

  it('keeps technical numbers compatible and rejects invalid input', () => {
    expect(parseLocalizedNumber(1234.56)).toBe(1234.56);
    expect(parseLocalizedNumber('12.5')).toBe(12.5);
    expect(parseLocalizedNumber('')).toBeNull();
    expect(parseLocalizedNumber('1,2,3')).toBeNull();
  });

  it('presents editable values using Argentine formatting', () => {
    expect(localizedEditableNumber(1234.56)).toBe('1.234,56');
  });
});
