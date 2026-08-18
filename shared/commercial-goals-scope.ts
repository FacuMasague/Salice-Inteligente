import { CURRENT_COMMERCIAL_SELLERS, isCommercialSellerIncluded } from './commercial-seller-scope.js';

export const COMMERCIAL_GOAL_CATEGORIES = ['Alimento Húmedo', 'C&T'] as const;

export const COMMERCIAL_GOAL_CORE_BRANDS = [
  'Old Prince Equilibrium', 'Old Prince Noveles', 'Criadores High Pro',
  'Criadores Maintenance', 'Optimum', 'Pedigree', 'Raza', 'Voraz',
  'Whiskas', 'Kongo', 'Iams', 'Old Prince Premium', 'Company y Origen',
] as const;

export const COMMERCIAL_GOAL_STRATEGIC_BRANDS = [
  'Fawna', 'Juvenia Nutrition', 'MaxPet', 'Pampa',
] as const;

export const COMMERCIAL_GOAL_AUTOSERVICE_SELLERS = ['Ana Ottaviano', 'Julieta Errecart'] as const;

export const COMMERCIAL_GOAL_PRODUCTS = [
  ...COMMERCIAL_GOAL_CATEGORIES,
  ...COMMERCIAL_GOAL_CORE_BRANDS,
  ...COMMERCIAL_GOAL_STRATEGIC_BRANDS,
] as const;

const productNames = new Set<string>(COMMERCIAL_GOAL_PRODUCTS);

export function isCommercialGoalProduct(value: unknown) {
  return productNames.has(String(value ?? '').trim());
}

export function commercialGoalSellerOptions(values: unknown[] = []) {
  return [...new Set([
    ...CURRENT_COMMERCIAL_SELLERS,
    ...values.map((value) => String(value ?? '').trim()).filter(isCommercialSellerIncluded),
  ].filter(Boolean))].sort((left, right) => left.localeCompare(right, 'es'));
}

export function isCommercialGoalSeller(value: unknown) {
  const seller = String(value ?? '').trim();
  return Boolean(seller) && isCommercialSellerIncluded(seller);
}
