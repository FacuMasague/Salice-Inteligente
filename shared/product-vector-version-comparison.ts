import type { DashboardData, Product, ProductVectorMeta, VectorKey } from './models.js';
import { estimateContentKgV21, inferProductVectorV21, inferProductVectorV22, resolveProductContentKg, VECTOR_KEYS } from './product-vectors.js';

export interface ProductVectorVersionComparison {
  generatedAt: string;
  snapshotAt: string;
  versions: { from: '2.1'; to: '2.2' };
  totals: {
    products: number;
    changedProducts: number;
    v21ProductsWithSignals: number;
    v22ProductsWithSignals: number;
    v21EmptyVectors: number;
    v22EmptyVectors: number;
    v21Contradictions: number;
    v22Contradictions: number;
    newlyRecognizedWeights: number;
  };
  coverageByDimension: Record<VectorKey, { v21: number; v22: number; delta: number }>;
  criteria: {
    coverageNotLower: boolean;
    coverageImproved: boolean;
    emptyVectorsNotHigher: boolean;
    contradictionsNotHigher: boolean;
    contradictionsReduced: boolean;
    passed: boolean;
  };
  review: Array<{ productId: string; name: string; dimensions: Array<{ key: VectorKey; v21: number; v22: number }>; v21Weight: number | null; v22Weight: number | null }>;
}

const inputFromProduct = (product: Product) => ({
  name: product.name,
  description: product.description,
  category: product.family,
  subcategory: product.subcategory,
  brand: product.brand,
  line: product.line,
  commercialFamily: product.commercialFamily,
  group: product.group,
  pack: product.pack,
});

const hasSignal = (vector: Record<VectorKey, number>) => VECTOR_KEYS.some((key) => vector[key] > 0);
const contradictionCount = (vector: Record<VectorKey, number>, meta: ProductVectorMeta) => Number(vector.perros >= 65 && vector.gatos >= 65 && !meta.declaredCombinations?.species)
  + Number(vector.cachorros >= 65 && vector.senior >= 65 && !meta.declaredCombinations?.lifeStage)
  + Number(vector.tamano_pequeno >= 65 && vector.tamano_grande >= 65 && !meta.declaredCombinations?.petSize)
  + Number(vector.economico >= 65 && vector.premium >= 65);

export function compareProductVectorVersions(data: DashboardData): ProductVectorVersionComparison {
  const rows = data.products.map((product) => {
    const input = inputFromProduct(product);
    const v21 = inferProductVectorV21(input);
    const v22 = inferProductVectorV22(input);
    const descriptions = [product.name, product.description, product.pack];
    const v21Weight = v21.vector.alimento_seco >= 75 ? estimateContentKgV21(...descriptions) : null;
    const v22Weight = v22.vector.alimento_seco >= 75 ? resolveProductContentKg({
      unit1: product.unit,
      unit2: product.inventory.unit2,
      unit2PerUnit1: product.inventory.unit2PerUnit1,
      descriptions,
    }) : null;
    const dimensions = VECTOR_KEYS.filter((key) => v21.vector[key] !== v22.vector[key])
      .map((key) => ({ key, v21: v21.vector[key], v22: v22.vector[key] }));
    return { product, v21, v22, v21Weight, v22Weight, dimensions };
  });
  const coverageByDimension = Object.fromEntries(VECTOR_KEYS.map((key) => {
    const v21 = rows.filter((row) => row.v21.vector[key] > 0).length;
    const v22 = rows.filter((row) => row.v22.vector[key] > 0).length;
    return [key, { v21, v22, delta: v22 - v21 }];
  })) as ProductVectorVersionComparison['coverageByDimension'];
  const v21Signals = rows.filter((row) => hasSignal(row.v21.vector)).length;
  const v22Signals = rows.filter((row) => hasSignal(row.v22.vector)).length;
  const v21Contradictions = rows.reduce((sum, row) => sum + contradictionCount(row.v21.vector, row.v21.meta), 0);
  const v22Contradictions = rows.reduce((sum, row) => sum + contradictionCount(row.v22.vector, row.v22.meta), 0);
  const coverageNotLower = v22Signals >= v21Signals;
  const coverageImproved = v22Signals > v21Signals;
  const emptyVectorsNotHigher = data.products.length - v22Signals <= data.products.length - v21Signals;
  const contradictionsNotHigher = v22Contradictions <= v21Contradictions;
  const contradictionsReduced = v22Contradictions < v21Contradictions;
  return {
    generatedAt: new Date().toISOString(),
    snapshotAt: data.meta.generatedAt,
    versions: { from: '2.1', to: '2.2' },
    totals: {
      products: rows.length,
      changedProducts: rows.filter((row) => row.dimensions.length || row.v21Weight !== row.v22Weight).length,
      v21ProductsWithSignals: v21Signals,
      v22ProductsWithSignals: v22Signals,
      v21EmptyVectors: rows.length - v21Signals,
      v22EmptyVectors: rows.length - v22Signals,
      v21Contradictions,
      v22Contradictions,
      newlyRecognizedWeights: rows.filter((row) => row.v21Weight == null && row.v22Weight != null).length,
    },
    coverageByDimension,
    criteria: {
      coverageNotLower,
      coverageImproved,
      emptyVectorsNotHigher,
      contradictionsNotHigher,
      contradictionsReduced,
      passed: coverageImproved && emptyVectorsNotHigher && contradictionsReduced,
    },
    review: rows.filter((row) => row.dimensions.length || row.v21Weight !== row.v22Weight).slice(0, 1000).map((row) => ({
      productId: row.product.id,
      name: row.product.name,
      dimensions: row.dimensions,
      v21Weight: row.v21Weight,
      v22Weight: row.v22Weight,
    })),
  };
}
