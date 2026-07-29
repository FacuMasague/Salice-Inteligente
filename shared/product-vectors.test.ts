import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from '../server/data/demo-snapshot';
import { applyCatalogPricePositioning, compareProductsV2, estimateContentKg, inferProductVectorV2, resolveProductContentKg, vectorSimilarityV2 } from './product-vectors';

describe('vectorización de productos v2', () => {
  it('usa los maestros estructurados como evidencia de especie, etapa y formato', () => {
    const profile = inferProductVectorV2({
      name: 'Whiskas Adulto Carne 500 g',
      category: 'Alimentos Balanceados',
      subcategory: 'Small Bags',
      brand: 'Whiskas',
      line: 'Cat',
      commercialFamily: 'Legacy',
      group: 'Pet Nutrition',
      pack: 'UN',
    });
    expect(profile.vector.gatos).toBe(100);
    expect(profile.vector.adultos).toBe(96);
    expect(profile.vector.alimento_seco).toBe(100);
    expect(profile.vector.perros).toBe(0);
    expect(profile.meta.evidence.gatos).toContain('Línea: Cat');
    expect(profile.meta.confidence).toBeGreaterThanOrEqual(80);
  });

  it('no completa especie, etapa ni función cuando GESI no entrega evidencia', () => {
    const profile = inferProductVectorV2({
      name: 'Antitetánica x 2 dosis',
      category: 'Biologicos',
      subcategory: 'Vacunas grandes animales',
      brand: 'Invesbio',
    });
    expect(profile.vector.farmacia).toBe(100);
    expect(profile.vector.perros).toBe(0);
    expect(profile.vector.gatos).toBe(0);
    expect(profile.vector.adultos).toBe(0);
    expect(profile.vector.funcional).toBe(0);
  });

  it('exige términos completos y no confunde palabras que sólo contienen cat', () => {
    const profile = inferProductVectorV2({ name: 'Catéter veterinario', category: 'Instrumental' });
    expect(profile.vector.gatos).toBe(0);
    expect(profile.vector.accesorios).toBe(100);
  });

  it('penaliza incompatibilidades explícitas de especie', () => {
    const dog = inferProductVectorV2({ name: 'Alimento perro adulto', category: 'Alimentos Balanceados', line: 'Adulto' });
    const cat = inferProductVectorV2({ name: 'Alimento gato adulto', category: 'Alimentos Balanceados', line: 'Cat' });
    expect(vectorSimilarityV2(dog.vector, cat.vector)).toBeLessThan(30);
    expect(vectorSimilarityV2(dog.vector, dog.vector)).toBeCloseTo(100, 8);
  });

  it('interpreta las líneas Adulto, Puppy y Cat según el maestro real de GESI', () => {
    const adult = inferProductVectorV2({ name: 'Nutrición completa', line: 'Adulto' });
    const puppy = inferProductVectorV2({ name: 'Nutrición completa', line: 'Puppy' });
    const cat = inferProductVectorV2({ name: 'Nutrición completa', line: 'Cat' });
    expect(adult.vector.perros).toBe(100);
    expect(adult.vector.adultos).toBe(100);
    expect(puppy.vector.perros).toBe(100);
    expect(puppy.vector.cachorros).toBe(100);
    expect(cat.vector.gatos).toBe(100);
    expect(cat.vector.perros).toBe(0);
  });

  it('distingue porte pequeño, mediano y grande sin confundir el tamaño del envase', () => {
    const small = inferProductVectorV2({ name: 'Perro adulto razas pequeñas 15 kg', category: 'Alimentos Balanceados' });
    const mediumLarge = inferProductVectorV2({ name: 'Perro adulto Medium & Large 15 kg', category: 'Alimentos Balanceados' });
    const packageOnly = inferProductVectorV2({ name: 'Bolsa grande de alimento perro adulto', category: 'Alimentos Balanceados' });
    expect(small.vector.tamano_pequeno).toBe(96);
    expect(small.vector.tamano_grande).toBe(0);
    expect(mediumLarge.vector.tamano_mediano).toBe(96);
    expect(mediumLarge.vector.tamano_grande).toBe(96);
    expect(packageOnly.vector.tamano_grande).toBe(0);
  });

  it('separa necesidades funcionales y sabores explícitos de alimentos para mascotas', () => {
    const urinary = inferProductVectorV2({ name: 'Alimento gato adulto urinary salmón', category: 'Alimentos Balanceados', line: 'Cat' });
    expect(urinary.vector.salud_urinaria).toBe(96);
    expect(urinary.vector.funcional).toBeGreaterThanOrEqual(82);
    expect(urinary.vector.sabor_pescado).toBe(96);
    const human = inferProductVectorV2({ name: 'Condimento para pescado', category: 'Almacén' });
    expect(human.vector.sabor_pescado).toBe(0);
  });

  it('penaliza conflictos explícitos de edad y porte', () => {
    const puppySmall = inferProductVectorV2({ name: 'Alimento perro cachorro razas pequeñas', category: 'Alimentos Balanceados' });
    const seniorLarge = inferProductVectorV2({ name: 'Alimento perro senior razas grandes', category: 'Alimentos Balanceados' });
    expect(vectorSimilarityV2(puppySmall.vector, seniorLarge.vector)).toBeLessThan(35);
  });

  it('normaliza kilos y promociones de contenido sin convertir unidades ambiguas', () => {
    expect(estimateContentKg('Bolsa 7,5 kg')).toBe(7.5);
    expect(estimateContentKg('Bolsa 15 + 3 kg')).toBe(18);
    expect(estimateContentKg('Bolsa 500 gr')).toBe(.5);
    expect(estimateContentKg('Caja x 12 unidades')).toBeNull();
    expect(estimateContentKg('Caja 12 x 100 g')).toBe(1.2);
    expect(resolveProductContentKg({ unit1: 'UN', unit2: 'KG', unit2PerUnit1: 7.5, descriptions: ['Presentación ambigua'] })).toBe(7.5);
  });

  it('prioriza maestros confiables y no convierte el rubro heredado Drovet en alimento', () => {
    const medicine = inferProductVectorV2({ name: 'Dexametasona iny.', category: 'Alimentos Balanceados', group: 'Drovet' });
    expect(medicine.vector.alimento_seco).toBe(0);
    expect(medicine.vector.farmacia).toBeGreaterThanOrEqual(84);
  });

  it('distingue combinaciones explícitas y respeta negaciones', () => {
    const shared = inferProductVectorV2({ name: 'Suplemento para perros y gatos de todas las edades', category: 'Alimentos suplementos y sustitutos' });
    expect(shared.vector.perros).toBeGreaterThanOrEqual(90);
    expect(shared.vector.gatos).toBeGreaterThanOrEqual(90);
    expect(shared.meta.declaredCombinations).toMatchObject({ species: 'perros y gatos', lifeStage: 'todas las edades' });
    const noChicken = inferProductVectorV2({ name: 'Alimento perro adulto sin pollo', category: 'Alimentos Balanceados' });
    expect(noChicken.vector.sabor_pollo).toBe(0);
  });

  it('asigna económico y premium por precio/kg sólo dentro de cohortes suficientes', () => {
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
    expect(positioned[11].vectorMeta.evidence.premium?.[0]).toContain('Precio relativo');
    expect(positioned[0].competitorReferencePricePerKg).toBe(10_000);
    expect(positioned[0].competitorPriceSampleSize).toBe(11);
  });

  it('separa similitud, taxonomía y confianza en una comparación auditable', () => {
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
