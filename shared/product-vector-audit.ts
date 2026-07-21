import type { DashboardData, Product, VectorKey } from './models.js';
import { VECTOR_KEYS } from './product-vectors.js';

export interface ProductVectorAudit {
  generatedAt: string;
  snapshotAt: string;
  previousSnapshotAt: string | null;
  status: 'passed' | 'passed_with_review';
  totals: {
    products: number;
    productsWithSignals: number;
    emptyVectors: number;
    withoutRecognizedWeight: number;
    dryFoodsWithoutRecognizedWeight: number;
    withPricePerKg: number;
    changedProducts: number;
    largePricePerKgChanges: number;
  };
  coverageByDimension: Record<VectorKey, number>;
  priceCohorts: Array<{ species: 'perros' | 'gatos'; packBand: string; products: number; budget: number; market: number; premium: number }>;
  positioning: Record<'budget' | 'market' | 'premium' | 'unknown', number>;
  review: {
    contradictions: Array<{ productId: string; name: string; reason: string }>;
    unrecognizedWeights: Array<{ productId: string; name: string; price: number }>;
    pricePositioning: Array<{ productId: string; name: string; position: 'budget' | 'premium'; pricePerKg: number | null; evidence: string[] }>;
    changedProducts: Array<{ productId: string; name: string; dimensions: VectorKey[] }>;
    largePricePerKgChanges: Array<{ productId: string; name: string; previous: number; current: number; variationPercent: number }>;
  };
}

function positive(product: Product, key: VectorKey, threshold = 65) {
  return product.vector[key] >= threshold;
}

function contradiction(product: Product) {
  const reasons: string[] = [];
  if (positive(product, 'perros') && positive(product, 'gatos')) reasons.push('Especie perro y gato simultánea');
  if (positive(product, 'cachorros') && positive(product, 'senior')) reasons.push('Etapa cachorro y senior simultánea');
  if (positive(product, 'tamano_pequeno') && positive(product, 'tamano_grande')) reasons.push('Porte pequeño y grande simultáneo');
  if (positive(product, 'economico') && positive(product, 'premium')) reasons.push('Posicionamiento económico y premium simultáneo');
  return reasons;
}

function packBand(contentKg: number | null) {
  if (contentKg == null) return 'sin peso';
  if (contentKg <= 3) return 'hasta 3 kg';
  if (contentKg <= 10) return 'más de 3 a 10 kg';
  return 'más de 10 kg';
}

export function analyzeProductVectors(current: DashboardData, previous: DashboardData | null = null): ProductVectorAudit {
  const coverageByDimension = Object.fromEntries(VECTOR_KEYS.map((key) => [
    key,
    current.products.filter((product) => product.vector[key] > 0).length,
  ])) as Record<VectorKey, number>;
  const previousById = new Map((previous?.products ?? []).map((product) => [product.id, product]));
  const changedProducts: ProductVectorAudit['review']['changedProducts'] = [];
  const priceChanges: ProductVectorAudit['review']['largePricePerKgChanges'] = [];
  for (const product of current.products) {
    const prior = previousById.get(product.id);
    if (!prior) continue;
    const dimensions = VECTOR_KEYS.filter((key) => prior.vector[key] !== product.vector[key]);
    if (dimensions.length) changedProducts.push({ productId: product.id, name: product.name, dimensions });
    if (prior.referencePricePerKg && product.referencePricePerKg) {
      const variationPercent = (product.referencePricePerKg - prior.referencePricePerKg) / prior.referencePricePerKg * 100;
      if (Math.abs(variationPercent) >= 25) priceChanges.push({
        productId: product.id,
        name: product.name,
        previous: prior.referencePricePerKg,
        current: product.referencePricePerKg,
        variationPercent: Math.round(variationPercent * 10) / 10,
      });
    }
  }
  const cohortMap = new Map<string, ProductVectorAudit['priceCohorts'][number]>();
  for (const product of current.products.filter((item) => item.referencePricePerKg && item.vector.alimento_seco >= 75)) {
    const species = product.vector.perros >= 75 && product.vector.gatos < 75 ? 'perros'
      : product.vector.gatos >= 75 && product.vector.perros < 75 ? 'gatos' : null;
    if (!species) continue;
    const band = packBand(product.contentKg);
    const key = `${species}:${band}`;
    const row = cohortMap.get(key) ?? { species, packBand: band, products: 0, budget: 0, market: 0, premium: 0 };
    row.products += 1;
    if (product.pricePosition !== 'unknown') row[product.pricePosition] += 1;
    cohortMap.set(key, row);
  }
  const contradictions = current.products.flatMap((product) => contradiction(product).map((reason) => ({ productId: product.id, name: product.name, reason })));
  const emptyVectors = current.products.filter((product) => VECTOR_KEYS.every((key) => product.vector[key] === 0)).length;
  const unrecognizedWeights = current.products.filter((product) => product.vector.alimento_seco >= 75 && product.price > 0 && product.contentKg == null);
  const positioning = { budget: 0, market: 0, premium: 0, unknown: 0 };
  current.products.forEach((product) => { positioning[product.pricePosition] += 1; });
  const needsReview = contradictions.length + changedProducts.length + priceChanges.length > 0;
  return {
    generatedAt: new Date().toISOString(),
    snapshotAt: current.meta.generatedAt,
    previousSnapshotAt: previous?.meta.generatedAt ?? null,
    status: needsReview ? 'passed_with_review' : 'passed',
    totals: {
      products: current.products.length,
      productsWithSignals: current.products.length - emptyVectors,
      emptyVectors,
      withoutRecognizedWeight: current.products.filter((product) => product.contentKg == null).length,
      dryFoodsWithoutRecognizedWeight: unrecognizedWeights.length,
      withPricePerKg: current.products.filter((product) => product.referencePricePerKg != null).length,
      changedProducts: changedProducts.length,
      largePricePerKgChanges: priceChanges.length,
    },
    coverageByDimension,
    priceCohorts: [...cohortMap.values()].sort((a, b) => `${a.species}:${a.packBand}`.localeCompare(`${b.species}:${b.packBand}`)),
    positioning,
    review: {
      contradictions: contradictions.slice(0, 500),
      unrecognizedWeights: unrecognizedWeights.slice(0, 500).map((product) => ({ productId: product.id, name: product.name, price: product.price })),
      pricePositioning: current.products.filter((product) => product.pricePosition === 'budget' || product.pricePosition === 'premium').slice(0, 500).map((product) => ({
        productId: product.id,
        name: product.name,
        position: product.pricePosition as 'budget' | 'premium',
        pricePerKg: product.referencePricePerKg,
        evidence: product.vectorMeta.evidence[product.pricePosition === 'budget' ? 'economico' : 'premium'] ?? [],
      })),
      changedProducts: changedProducts.slice(0, 500),
      largePricePerKgChanges: priceChanges.slice(0, 500),
    },
  };
}
