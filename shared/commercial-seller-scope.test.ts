import { describe, expect, it } from 'vitest';
import {
  CURRENT_COMMERCIAL_SELLERS,
  isCommercialSellerIncluded,
  isExcludedHistoricalSeller,
} from './commercial-seller-scope';

describe('alcance comercial de vendedores', () => {
  it('incluye las siete carteras definidas para la v1.2.3', () => {
    for (const seller of CURRENT_COMMERCIAL_SELLERS) {
      expect(isCommercialSellerIncluded(seller)).toBe(true);
    }
  });

  it('excluye las carteras históricas conocidas sin depender de tildes o mayúsculas', () => {
    expect(isExcludedHistoricalSeller('Administración')).toBe(true);
    expect(isExcludedHistoricalSeller('administracion')).toBe(true);
    expect(isExcludedHistoricalSeller('Telemarketing')).toBe(true);
    expect(isExcludedHistoricalSeller('Sin vendedor')).toBe(true);
    expect(isExcludedHistoricalSeller('Alejandro Lurbe')).toBe(true);
    expect(isExcludedHistoricalSeller('Luciano Payba')).toBe(true);
  });

  it('incluye automáticamente un vendedor nuevo', () => {
    expect(isCommercialSellerIncluded('Nueva Vendedora 2027')).toBe(true);
  });
});
