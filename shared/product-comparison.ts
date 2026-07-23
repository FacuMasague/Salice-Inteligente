import type { Product, VectorKey } from './models.js';

export type ProductComparisonDimensionId = 'use' | 'classification' | 'presentation' | 'price' | 'commercial' | 'confidence';

export interface ProductComparisonDimension {
  id: ProductComparisonDimensionId;
  label: string;
  score: number | null;
  explanation: string;
}

export interface ProductPairComparison {
  anchorId: string;
  candidateId: string;
  dimensions: ProductComparisonDimension[];
  compatibilities: string[];
  incompatibilities: string[];
  conclusion: string;
}

const USE_KEYS: Array<{ key: VectorKey; label: string; weight: number }> = [
  { key: 'perros', label: 'uso para perros', weight: 5 },
  { key: 'gatos', label: 'uso para gatos', weight: 5 },
  { key: 'otras_especies', label: 'uso para otras especies', weight: 5 },
  { key: 'cachorros', label: 'etapa cachorro', weight: 4 },
  { key: 'adultos', label: 'etapa adulta', weight: 4 },
  { key: 'senior', label: 'etapa senior', weight: 4 },
  { key: 'tamano_pequeno', label: 'porte pequeño', weight: 3 },
  { key: 'tamano_mediano', label: 'porte mediano', weight: 3 },
  { key: 'tamano_grande', label: 'porte grande', weight: 3 },
  { key: 'alimento_seco', label: 'alimento seco', weight: 5 },
  { key: 'alimento_humedo', label: 'alimento húmedo', weight: 5 },
  { key: 'snacks', label: 'snack', weight: 5 },
  { key: 'farmacia', label: 'farmacia', weight: 5 },
  { key: 'antiparasitario', label: 'antiparasitario', weight: 5 },
  { key: 'higiene', label: 'higiene', weight: 5 },
  { key: 'accesorios', label: 'accesorio', weight: 5 },
  { key: 'consumo_humano', label: 'consumo humano', weight: 5 },
  { key: 'funcional', label: 'uso funcional', weight: 2 },
  { key: 'esterilizados', label: 'esterilizados', weight: 2 },
  { key: 'control_peso', label: 'control de peso', weight: 2 },
  { key: 'piel_pelaje', label: 'piel y pelaje', weight: 2 },
  { key: 'salud_urinaria', label: 'salud urinaria', weight: 2 },
  { key: 'salud_digestiva', label: 'salud digestiva', weight: 2 },
  { key: 'salud_dental', label: 'salud dental', weight: 2 },
];

const normalize = (value: string | undefined) => (value ?? '').trim().toLocaleLowerCase('es');
const useful = (value: string | undefined) => {
  const normalized = normalize(value);
  return normalized && !normalized.startsWith('sin ') && normalized !== 'no informado' ? normalized : '';
};
const ratioSimilarity = (left: number, right: number) => left <= 0 && right <= 0 ? 100 : left <= 0 || right <= 0 ? 0 : Math.min(left, right) / Math.max(left, right) * 100;
const rounded = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function primaryKey(product: Product, keys: VectorKey[]) {
  return keys
    .filter((key) => product.vector[key] >= 55)
    .sort((left, right) => product.vector[right] - product.vector[left])[0] ?? null;
}

export function productUseSignature(product: Product) {
  return {
    species: primaryKey(product, ['perros', 'gatos', 'otras_especies']),
    type: primaryKey(product, ['alimento_seco', 'alimento_humedo', 'snacks', 'farmacia', 'antiparasitario', 'higiene', 'accesorios', 'consumo_humano']),
  };
}

export function arePricePerKgComparable(products: Product[]) {
  if (products.length < 2 || products.some((product) => !product.referencePricePerKg || product.referencePricePerKg <= 0)) return false;
  const signatures = products.map(productUseSignature);
  return Boolean(signatures[0]?.type)
    && signatures.every((signature) => signature.type === signatures[0].type && signature.species === signatures[0].species);
}

export function areCoverageValuesComparable(products: Product[]) {
  return products.length >= 2 && products.every((product) => product.stockCoverageMonths != null && product.monthlyUnits > 0 && product.inventory.quality !== 'insufficient');
}

function useComparison(a: Product, b: Product) {
  let sharedWeight = 0;
  let totalWeight = 0;
  const compatibilities: string[] = [];
  for (const definition of USE_KEYS) {
    const left = a.vector[definition.key];
    const right = b.vector[definition.key];
    const maximum = Math.max(left, right);
    if (!maximum) continue;
    totalWeight += maximum * definition.weight;
    sharedWeight += Math.min(left, right) * definition.weight;
    if (left >= 55 && right >= 55) compatibilities.push(definition.label);
  }
  const aSignature = productUseSignature(a);
  const bSignature = productUseSignature(b);
  const incompatibilities: string[] = [];
  if (aSignature.species && bSignature.species && aSignature.species !== bSignature.species) incompatibilities.push('especies distintas');
  if (aSignature.type && bSignature.type && aSignature.type !== bSignature.type) incompatibilities.push('tipos de producto distintos');
  const stageA = primaryKey(a, ['cachorros', 'adultos', 'senior']);
  const stageB = primaryKey(b, ['cachorros', 'adultos', 'senior']);
  if (stageA && stageB && stageA !== stageB) incompatibilities.push('etapas de vida distintas');
  const raw = totalWeight ? sharedWeight / totalWeight * 100 : 0;
  const score = rounded(raw - incompatibilities.length * 18);
  const explanation = incompatibilities.length
    ? `Comparten ${compatibilities.slice(0, 2).join(' y ') || 'pocas señales de uso'}, pero presentan ${incompatibilities.join(' y ')}.`
    : compatibilities.length
      ? `Coinciden en ${compatibilities.slice(0, 3).join(', ')}.`
      : 'No hay señales suficientes para afirmar que cumplen el mismo uso.';
  return { score, compatibilities, incompatibilities, explanation };
}

function classificationComparison(a: Product, b: Product) {
  const fields = [
    { label: 'rubro', left: a.family, right: b.family, weight: 28 },
    { label: 'subrubro', left: a.subcategory, right: b.subcategory, weight: 16 },
    { label: 'marca', left: a.brand, right: b.brand, weight: 12 },
    { label: 'línea', left: a.line, right: b.line, weight: 16 },
    { label: 'familia comercial', left: a.commercialFamily, right: b.commercialFamily, weight: 14 },
    { label: 'grupo', left: a.group, right: b.group, weight: 14 },
  ].filter((field) => useful(field.left) && useful(field.right));
  if (!fields.length) return { score: null, explanation: 'GESI no aporta suficientes campos comunes para contrastar la clasificación.' };
  const matches = fields.filter((field) => useful(field.left) === useful(field.right));
  const score = rounded(matches.reduce((sum, field) => sum + field.weight, 0) / fields.reduce((sum, field) => sum + field.weight, 0) * 100);
  return { score, explanation: matches.length ? `Coinciden en ${matches.map((field) => field.label).join(', ')}.` : 'GESI los ubica en clasificaciones comerciales diferentes.' };
}

function presentationComparison(a: Product, b: Product) {
  if (a.contentKg && b.contentKg) {
    const score = rounded(ratioSimilarity(a.contentKg, b.contentKg));
    return { score, explanation: score >= 80 ? 'Tienen contenidos netos cercanos y una presentación comparable.' : `El contenido difiere: ${a.contentKg.toLocaleString('es-AR')} kg frente a ${b.contentKg.toLocaleString('es-AR')} kg.` };
  }
  if (useful(a.pack) && useful(a.pack) === useful(b.pack)) return { score: 100, explanation: 'GESI informa la misma presentación.' };
  if (useful(a.unit) && useful(a.unit) === useful(b.unit)) return { score: null, explanation: 'Comparten unidad primaria, pero falta contenido inequívoco para comparar la presentación.' };
  return { score: null, explanation: 'Las unidades o contenidos disponibles no permiten comparar la presentación.' };
}

function priceComparison(a: Product, b: Product) {
  if (!arePricePerKgComparable([a, b])) return { score: null, explanation: 'El precio por kilo no es comparable por falta de peso o por distinto uso principal.' };
  const score = rounded(ratioSimilarity(a.referencePricePerKg ?? 0, b.referencePricePerKg ?? 0));
  return { score, explanation: `Ambos precios están expresados por kilo para productos del mismo uso; la cercanía de precio es ${score}%.` };
}

function commercialComparison(a: Product, b: Product) {
  const scores = [
    ratioSimilarity(a.monthlyUnits, b.monthlyUnits),
    ratioSimilarity(a.clients90d, b.clients90d),
    ratioSimilarity(a.sales90d, b.sales90d),
  ];
  const score = rounded(scores.reduce((sum, value) => sum + value, 0) / scores.length);
  return { score, explanation: score >= 70 ? 'Rotación, compradores y venta reciente tienen escalas cercanas.' : 'Su comportamiento comercial reciente tiene escalas diferentes.' };
}

function confidenceComparison(a: Product, b: Product) {
  const inventoryPenalty = [a, b].filter((product) => product.inventory.quality !== 'reliable').length * 10;
  const score = rounded(Math.min(a.vectorMeta.confidence, b.vectorMeta.confidence) - inventoryPenalty);
  return { score, explanation: score >= 70 ? 'La comparación se apoya en perfiles e inventario con buena cobertura.' : 'La conclusión debe leerse con cautela porque al menos un producto tiene datos parciales.' };
}

export function compareProductPair(a: Product, b: Product): ProductPairComparison {
  const use = useComparison(a, b);
  const classification = classificationComparison(a, b);
  const presentation = presentationComparison(a, b);
  const price = priceComparison(a, b);
  const commercial = commercialComparison(a, b);
  const confidence = confidenceComparison(a, b);
  const directSubstitute = use.score >= 70 && (presentation.score ?? 0) >= 70 && !use.incompatibilities.length;
  const conclusion = directSubstitute
    ? 'Son alternativas cercanas por uso y presentación; precio, stock y disponibilidad deben decidir la conveniencia operativa.'
    : use.score >= 65
      ? `Se parecen por uso, pero no son sustitutos directos${presentation.score == null || presentation.score < 70 ? ' porque la presentación no es equivalente' : ''}${use.incompatibilities.length ? ` y existen ${use.incompatibilities.join(' y ')}` : ''}.`
      : 'No conviene tratarlos como sustitutos directos: el uso o la clasificación disponible difieren de forma relevante.';
  return {
    anchorId: a.id,
    candidateId: b.id,
    dimensions: [
      { id: 'use', label: 'Compatibilidad de uso', ...use },
      { id: 'classification', label: 'Clasificación comercial', ...classification },
      { id: 'presentation', label: 'Presentación', ...presentation },
      { id: 'price', label: 'Posicionamiento de precio', ...price },
      { id: 'commercial', label: 'Comportamiento comercial', ...commercial },
      { id: 'confidence', label: 'Confianza de los datos', ...confidence },
    ],
    compatibilities: use.compatibilities,
    incompatibilities: use.incompatibilities,
    conclusion,
  };
}

export function suggestComparableProducts(seed: Product, products: Product[], limit = 12) {
  return products
    .filter((product) => product.id !== seed.id)
    .map((product) => {
      const comparison = compareProductPair(seed, product);
      const dimensions = Object.fromEntries(comparison.dimensions.map((dimension) => [dimension.id, dimension.score])) as Record<ProductComparisonDimensionId, number | null>;
      const score = (dimensions.use ?? 0) * .45
        + (dimensions.classification ?? 0) * .25
        + (dimensions.presentation ?? 0) * .2
        + (dimensions.confidence ?? 0) * .1;
      return { product, comparison, suggestionScore: rounded(score) };
    })
    .sort((left, right) => right.suggestionScore - left.suggestionScore || right.product.monthlyUnits - left.product.monthlyUnits || left.product.name.localeCompare(right.product.name, 'es'))
    .slice(0, limit);
}
