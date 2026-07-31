import { describe, expect, it } from 'vitest';
import { CURRENT_COMMERCIAL_SELLERS } from './commercial-seller-scope';
import {
  COMMERCIAL_GOAL_PRODUCTS,
  commercialGoalSellerOptions,
  isCommercialGoalProduct,
  isCommercialGoalSeller,
} from './commercial-goals-scope';

describe('dimensiones conectadas de objetivos comerciales', () => {
  it('usa las carteras vigentes y excluye nombres heredados del Excel', () => {
    const sellers = commercialGoalSellerOptions(['Alejandro Lurbe', 'Luciano Payba', 'Nueva Vendedora 2027']);
    expect(sellers).toEqual(expect.arrayContaining([...CURRENT_COMMERCIAL_SELLERS, 'Nueva Vendedora 2027']));
    expect(sellers).not.toContain('Alejandro Lurbe');
    expect(sellers).not.toContain('Luciano Payba');
    expect(isCommercialGoalSeller('Ana Ottaviano')).toBe(true);
    expect(isCommercialGoalSeller('Luciano Payba')).toBe(false);
  });

  it('comparte únicamente los productos y rubros publicados por Reporte General', () => {
    expect(COMMERCIAL_GOAL_PRODUCTS).toContain('Alimento Húmedo');
    expect(COMMERCIAL_GOAL_PRODUCTS).toContain('Juvenia Nutrition');
    expect(isCommercialGoalProduct('Pedigree')).toBe(true);
    expect(isCommercialGoalProduct('Objetivo inventado')).toBe(false);
  });
});
