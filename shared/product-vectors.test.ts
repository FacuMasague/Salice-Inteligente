import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from '../server/data/demo-snapshot';
import { applyCatalogPricePositioning, compareProductsV2, estimateContentKg, inferProductVectorV2, vectorSimilarityV2 } from './product-vectors';

describe('product vectorization v2', () => {
  it('uses structured catalog fields as species, life-stage, and format evidence', () => {
    const profile = inferProductVectorV2({
      name: 'Moonlight Adult Cat Beef 500 g',
      category: 'Alimentos Balanceados',
      subcategory: 'Small Bags',
      brand: 'Moonlight',
      line: 'Cat',
      commercialFamily: 'Historical',
      group: 'Pet Nutrition',
      pack: 'UN',
    });
    expect(profile.vector.gatos).toBe(100);
    expect(profile.vector.adultos).toBe(96);
    expect(profile.vector.alimento_seco).toBe(100);
    expect(profile.vector.perros).toBe(0);
    expect(profile.meta.evidence.gatos).toContain('Line: Cat');
    expect(profile.meta.confidence).toBeGreaterThanOrEqual(80);
  });

  it('does not infer species, life stage, or function when the catalog provides no evidence', () => {
    const profile = inferProductVectorV2({
      name: 'Tetanus vaccine x 2 doses',
      category: 'Biologics',
      subcategory: 'Large-animal vaccines',
      brand: 'Fictional Vet Labs',
    });
    expect(profile.vector.farmacia).toBe(100);
    expect(profile.vector.perros).toBe(0);
    expect(profile.vector.gatos).toBe(0);
    expect(profile.vector.adultos).toBe(0);
    expect(profile.vector.funcional).toBe(0);
  });

  it('requires complete terms and does not confuse words that merely contain cat', () => {
    const profile = inferProductVectorV2({ name: 'Veterinary catheter', category: 'Instruments' });
    expect(profile.vector.gatos).toBe(0);
    expect(profile.vector.accesorios).toBe(100);
  });

  it('penalizes explicit species incompatibilities', () => {
    const dog = inferProductVectorV2({ name: 'Adult dog food', category: 'Dry Food', line: 'Adult' });
    const cat = inferProductVectorV2({ name: 'Adult cat food', category: 'Dry Food', line: 'Cat' });
    expect(vectorSimilarityV2(dog.vector, cat.vector)).toBeLessThan(30);
    expect(vectorSimilarityV2(dog.vector, dog.vector)).toBeCloseTo(100, 8);
  });

  it('interprets Adult, Puppy, and Cat lines from structured catalog fields', () => {
    const adult = inferProductVectorV2({ name: 'Complete nutrition', line: 'Adult' });
    const puppy = inferProductVectorV2({ name: 'Complete nutrition', line: 'Puppy' });
    const cat = inferProductVectorV2({ name: 'Complete nutrition', line: 'Cat' });
    expect(adult.vector.perros).toBe(100);
    expect(adult.vector.adultos).toBe(100);
    expect(puppy.vector.perros).toBe(100);
    expect(puppy.vector.cachorros).toBe(100);
    expect(cat.vector.gatos).toBe(100);
    expect(cat.vector.perros).toBe(0);
  });

  it('distinguishes small, medium, and large breeds without confusing package size', () => {
    const small = inferProductVectorV2({ name: 'Adult dog small breed 15 kg', category: 'Dry Food' });
    const mediumLarge = inferProductVectorV2({ name: 'Adult dog Medium & Large 15 kg', category: 'Dry Food' });
    const packageOnly = inferProductVectorV2({ name: 'Large bag of adult dog food', category: 'Dry Food' });
    expect(small.vector.tamano_pequeno).toBe(96);
    expect(small.vector.tamano_grande).toBe(0);
    expect(mediumLarge.vector.tamano_mediano).toBe(96);
    expect(mediumLarge.vector.tamano_grande).toBe(96);
    expect(packageOnly.vector.tamano_grande).toBe(0);
  });

  it('separates functional needs and explicit pet-food flavors', () => {
    const urinary = inferProductVectorV2({ name: 'Adult cat urinary salmon food', category: 'Dry Food', line: 'Cat' });
    expect(urinary.vector.salud_urinaria).toBe(96);
    expect(urinary.vector.funcional).toBeGreaterThanOrEqual(82);
    expect(urinary.vector.sabor_pescado).toBe(96);
    const human = inferProductVectorV2({ name: 'Fish seasoning', category: 'Grocery' });
    expect(human.vector.sabor_pescado).toBe(0);
  });

  it('penalizes explicit life-stage and breed-size conflicts', () => {
    const puppySmall = inferProductVectorV2({ name: 'Puppy food for small-breed dogs', category: 'Dry Food' });
    const seniorLarge = inferProductVectorV2({ name: 'Senior food for large-breed dogs', category: 'Dry Food' });
    expect(vectorSimilarityV2(puppySmall.vector, seniorLarge.vector)).toBeLessThan(35);
  });

  it('normalizes kilograms and bonus content without converting ambiguous units', () => {
    expect(estimateContentKg('Bag 7.5 kg')).toBe(7.5);
    expect(estimateContentKg('Bag 15 + 3 kg')).toBe(18);
    expect(estimateContentKg('Bag 500 g')).toBe(.5);
    expect(estimateContentKg('Box x 12 units')).toBeNull();
  });

  it('assigns budget and premium positioning only within sufficiently large price cohorts', () => {
    const seed = createDemoSnapshot().products[0];
    const cohort = Array.from({ length: 12 }, (_, index) => ({
      ...seed,
      id: `price-${index}`,
      price: (index + 4) * 1000,
      contentKg: 1,
      referencePricePerKg: (index + 4) * 1000,
      pricePosition: 'unknown' as const,
      vector: { ...seed.vector, perros: 100, gatos: 0, alimento_seco: 100, premium: 0, economico: 0 },
      vectorMeta: { ...seed.vectorMeta, evidence: {} },
    }));
    const positioned = applyCatalogPricePositioning(cohort);
    expect(positioned[0].pricePosition).toBe('budget');
    expect(positioned[0].vector.economico).toBeGreaterThanOrEqual(78);
    expect(positioned[6].pricePosition).toBe('market');
    expect(positioned[11].pricePosition).toBe('premium');
    expect(positioned[11].vector.premium).toBeGreaterThanOrEqual(78);
    expect(positioned[11].vectorMeta.evidence.premium?.[0]).toContain('Relative price');
  });

  it('separates similarity, taxonomy, and confidence in an auditable comparison', () => {
    const [first, second] = createDemoSnapshot().products;
    const comparison = compareProductsV2(first, second);
    expect(comparison.score).toBeGreaterThanOrEqual(0);
    expect(comparison.score).toBeLessThanOrEqual(100);
    expect(comparison.vectorScore).toBeGreaterThanOrEqual(0);
    expect(comparison.taxonomyScore).toBeGreaterThanOrEqual(0);
    expect(comparison.confidence).toBe(92);
    expect(compareProductsV2(first, first).score).toBe(100);
  });
});
