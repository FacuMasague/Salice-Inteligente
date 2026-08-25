import { classifyInventoryProduct } from './inventory-decisions.js';
import type { Client, Product, ProductClientOpportunity, Recommendation, RecommendationConfidence, RecommendationKind, VectorKey } from './models.js';
import { VECTOR_KEYS, vectorSimilarityV2 } from './product-vectors.js';
import { compareProductPair } from './product-comparison.js';
import { productAvailableStock } from './product-stock.js';

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function isCommercialOpportunityEligible(client: Client) {
  return client.active && !client.salesBlocked && client.sales90d > 0;
}

function availableForRecommendation(product: Product) {
  return product.masterStatus !== 'inactive'
    && product.commercialStatus !== 'not_commercializable'
    && productAvailableStock(product) > 0
    && product.inventory.status === 'positive'
    && product.inventory.quality !== 'insufficient';
}

function clientProfile(client: Client, productsById: Map<string, Product>): Record<VectorKey, number> {
  const purchased = client.purchases
    .map((purchase) => ({ purchase, product: productsById.get(purchase.productId) }))
    .filter((item): item is { purchase: Client['purchases'][number]; product: Product } => Boolean(item.product));
  const totalWeight = purchased.reduce((sum, item) => sum + Math.max(0, item.purchase.total), 0) || 1;
  return Object.fromEntries(VECTOR_KEYS.map((key) => [
    key,
    purchased.reduce((sum, item) => sum + item.product.vector[key] * Math.max(0, item.purchase.total), 0) / totalWeight,
  ])) as Record<VectorKey, number>;
}

function compatibleWithClient(profile: Record<VectorKey, number>, product: Product) {
  const mostlyDogs = profile.perros >= 65 && profile.gatos < 25;
  const mostlyCats = profile.gatos >= 65 && profile.perros < 25;
  if (mostlyDogs && product.vector.gatos >= 80 && product.vector.perros < 25) return false;
  if (mostlyCats && product.vector.perros >= 80 && product.vector.gatos < 25) return false;
  return true;
}

function comparablePeers(client: Client, clients: Client[]) {
  const owned = new Set(client.purchases.map((purchase) => purchase.productId));
  const candidates = clients
    .filter((peer) => peer.id !== client.id && peer.active && peer.portfolioStatus === 'confirmed' && peer.purchases.length > 0)
    .map((peer) => {
      const peerOwned = new Set(peer.purchases.map((purchase) => purchase.productId));
      const overlap = [...owned].filter((id) => peerOwned.has(id)).length;
      const union = new Set([...owned, ...peerOwned]).size || 1;
      const score = overlap / union * 70
        + (peer.segment === client.segment ? 10 : 0)
        + (peer.channel === client.channel ? 8 : 0)
        + (peer.locality === client.locality ? 7 : 0)
        + (peer.zone === client.zone ? 5 : 0);
      return { peer, overlap, score };
    })
    .filter((item) => item.overlap > 0)
    .sort((left, right) => right.score - left.score || right.overlap - left.overlap || left.peer.name.localeCompare(right.peer.name, 'es'));
  return candidates.slice(0, 40).map((item) => item.peer);
}

function confidenceFor(distinctPurchases: number, peers: number, product: Product): RecommendationConfidence {
  if (distinctPurchases >= 4 && peers >= 12 && product.vectorMeta.confidence >= 70) return 'reliable';
  if (distinctPurchases >= 1 && peers >= 4 && product.vectorMeta.confidence >= 45) return 'exploratory';
  return 'insufficient';
}

function affinityExplanation(profile: Record<VectorKey, number>, product: Product, similarity: number) {
  const traits = VECTOR_KEYS
    .filter((key) => profile[key] >= 55 && product.vector[key] >= 55)
    .sort((left, right) => Math.min(profile[right], product.vector[right]) - Math.min(profile[left], product.vector[left]))
    .slice(0, 3)
    .map((key) => ({
      perros: 'productos para perros', gatos: 'productos para gatos', otras_especies: 'otras especies',
      cachorros: 'etapa cachorro', adultos: 'etapa adulta', senior: 'etapa senior',
      tamano_pequeno: 'porte pequeño', tamano_mediano: 'porte mediano', tamano_grande: 'porte grande',
      premium: 'posicionamiento premium', economico: 'posicionamiento económico', alimento_seco: 'alimento seco',
      alimento_humedo: 'alimento húmedo', snacks: 'snacks', farmacia: 'farmacia', antiparasitario: 'antiparasitarios',
      natural: 'propuesta natural', funcional: 'uso funcional', esterilizados: 'esterilizados', control_peso: 'control de peso',
      piel_pelaje: 'piel y pelaje', salud_urinaria: 'salud urinaria', salud_digestiva: 'salud digestiva', salud_dental: 'salud dental',
      higiene: 'higiene', accesorios: 'accesorios', granel: 'granel', consumo_humano: 'consumo humano', promocional: 'promocional',
      sabor_pollo: 'sabor pollo', sabor_carne: 'sabor carne', sabor_pescado: 'sabor pescado', sabor_cordero: 'sabor cordero',
    } as Record<VectorKey, string>)[key]);
  if (traits.length) return `Se parece al mix reciente del cliente por ${traits.join(', ')}.`;
  if (similarity >= 55) return 'Se parece al mix reciente por señales descriptivas parciales.';
  return 'La afinidad descriptiva es limitada; la oportunidad se apoya principalmente en clientes comparables.';
}

function opportunityReason(kinds: RecommendationKind[], adoption: number, peerCount: number, product: Product, replaced: Product | null) {
  if (replaced) return `Sustituto disponible para ${replaced.name}, que registra demanda reciente y no tiene stock.`;
  if (kinds.includes('peer_adoption')) return `${adoption}% de ${peerCount} clientes comparables lo compró en los 90 días observables.`;
  if (kinds.includes('high_stock_opportunity')) {
    const coverage = product.stockCoverageMonths == null ? 'stock sin movimiento reciente' : `${product.stockCoverageMonths.toLocaleString('es-AR', { maximumFractionDigits: 1 })} meses de cobertura`;
    return `No aparece en el mix reciente del cliente y tiene ${coverage}.`;
  }
  return 'No aparece entre las compras de los 90 días observables y es compatible con el mix reciente.';
}

function buildSubstitutes(client: Client, products: Product[], productsById: Map<string, Product>, peers: Client[]): Recommendation[] {
  const owned = new Set(client.purchases.map((purchase) => purchase.productId));
  const unavailablePurchased = [...new Set(client.purchases.map((purchase) => purchase.productId))]
    .map((id) => productsById.get(id))
    .filter((product): product is Product => Boolean(product) && !availableForRecommendation(product!) && product!.units90d > 0);
  const available = products.filter((product) => !owned.has(product.id) && availableForRecommendation(product));
  const results: Recommendation[] = [];
  for (const replacedProduct of unavailablePurchased) {
    const alternatives = available
      .filter((product) => product.id !== replacedProduct.id)
      .map((product) => ({ product, comparison: compareProductPair(replacedProduct, product) }))
      .filter(({ comparison }) => {
        const use = comparison.dimensions.find((dimension) => dimension.id === 'use')?.score ?? 0;
        const presentation = comparison.dimensions.find((dimension) => dimension.id === 'presentation')?.score ?? 0;
        return use >= 70 && presentation >= 70 && comparison.incompatibilities.length === 0;
      })
      .sort((left, right) => {
        const score = (item: typeof left) => (item.comparison.dimensions.find((dimension) => dimension.id === 'use')?.score ?? 0) * .65
          + (item.comparison.dimensions.find((dimension) => dimension.id === 'presentation')?.score ?? 0) * .25
          + item.product.vectorMeta.confidence * .1;
        return score(right) - score(left) || right.product.monthlyUnits - left.product.monthlyUnits;
      })
      .slice(0, 2);
    for (const { product, comparison } of alternatives) {
      const useScore = comparison.dimensions.find((dimension) => dimension.id === 'use')?.score ?? 0;
      const confidence = confidenceFor(new Set(client.purchases.map((purchase) => purchase.productId)).size, peers.length, product);
      results.push({
        product,
        score: Math.round(clamp(useScore * .7 + product.vectorMeta.confidence * .2 + Math.min(100, product.monthlyUnits) * .1)),
        similarity: Math.round(useScore), peerAdoption: 0, peerSampleSize: peers.length, confidence,
        reason: opportunityReason(['stockout_substitute'], 0, peers.length, product, replacedProduct),
        kinds: ['stockout_substitute'],
        affinityExplanation: comparison.conclusion,
        evidence: [comparison.dimensions.find((dimension) => dimension.id === 'use')?.explanation ?? '', comparison.dimensions.find((dimension) => dimension.id === 'presentation')?.explanation ?? ''].filter(Boolean),
        comparableClients: [], replacedProduct,
      });
    }
  }
  return results;
}

export function buildCommercialOpportunities(client: Client, clients: Client[], products: Product[], limit = 12): Recommendation[] {
  if (!isCommercialOpportunityEligible(client) || client.purchases.length === 0) return [];
  const productsById = new Map(products.map((product) => [product.id, product]));
  const owned = new Set(client.purchases.map((purchase) => purchase.productId));
  const profile = clientProfile(client, productsById);
  const peers = comparablePeers(client, clients);
  const distinctPurchases = owned.size;
  const maxUnits = Math.max(...products.map((product) => product.monthlyUnits), 1);
  const missing = products
    .filter((product) => !owned.has(product.id) && availableForRecommendation(product) && compatibleWithClient(profile, product))
    .map((product): Recommendation => {
      const similarity = Math.round(vectorSimilarityV2(profile, product.vector));
      const adopters = peers.filter((peer) => peer.purchases.some((purchase) => purchase.productId === product.id));
      const peerAdoption = peers.length ? Math.round(adopters.length / peers.length * 100) : 0;
      const inventoryStatus = classifyInventoryProduct(product).status;
      const kinds: RecommendationKind[] = ['mix_gap'];
      if (adopters.length >= 2 && peerAdoption >= 10) kinds.push('peer_adoption');
      if (inventoryStatus === 'high_coverage' || inventoryStatus === 'stock_without_movement') kinds.push('high_stock_opportunity');
      const stockOpportunity = kinds.includes('high_stock_opportunity') ? 100 : 0;
      const popularity = product.monthlyUnits / maxUnits * 100;
      const score = Math.round(clamp(similarity * .45 + peerAdoption * .35 + stockOpportunity * .12 + popularity * .08));
      const confidence = confidenceFor(distinctPurchases, peers.length, product);
      return {
        product, score, similarity, peerAdoption, peerSampleSize: peers.length, confidence,
        reason: opportunityReason(kinds, peerAdoption, peers.length, product, null), kinds,
        affinityExplanation: affinityExplanation(profile, product, similarity),
        evidence: [
          `${distinctPurchases} productos distintos en el mix observable del cliente.`,
          `${adopters.length} de ${peers.length} clientes comparables compraron el producto.`,
          kinds.includes('high_stock_opportunity') ? classifyInventoryProduct(product).explanation : '',
        ].filter(Boolean),
        comparableClients: adopters.slice(0, 3).map(({ id, name, tradeName, seller, locality }) => ({ id, name, tradeName, seller, locality })),
        replacedProduct: null,
      };
    })
    .filter((item) => item.score >= 18 || item.kinds.includes('peer_adoption') || (item.kinds.includes('high_stock_opportunity') && item.similarity >= 45));

  const substitutes = buildSubstitutes(client, products, productsById, peers);
  const merged = new Map<string, Recommendation>();
  for (const item of [...substitutes, ...missing]) {
    const current = merged.get(item.product.id);
    if (!current) merged.set(item.product.id, item);
    else merged.set(item.product.id, {
      ...current,
      score: Math.max(current.score, item.score),
      kinds: [...new Set([...current.kinds, ...item.kinds])],
      evidence: [...new Set([...current.evidence, ...item.evidence])],
      comparableClients: current.comparableClients.length ? current.comparableClients : item.comparableClients,
    });
  }
  return [...merged.values()]
    // Defensa final del contrato: ninguna ruta presente o futura puede
    // publicar como oportunidad un producto que ya integra el mix observable.
    .filter((item) => !owned.has(item.product.id))
    .sort((left, right) => Number(right.kinds.includes('stockout_substitute')) - Number(left.kinds.includes('stockout_substitute')) || right.score - left.score || left.product.name.localeCompare(right.product.name, 'es'))
    .slice(0, limit);
}

/**
 * Invierte la lectura cliente → productos sin cambiar la definición comercial:
 * evalúa un único producto contra cada cliente y evita calcular el catálogo
 * completo de recomendaciones para toda la cartera.
 */
export function buildProductClientOpportunities(product: Product, clients: Client[], products: Product[], limit = 120): ProductClientOpportunity[] {
  if (!availableForRecommendation(product)) return [];

  const productsById = new Map(products.map((item) => [item.id, item]));
  const purchaseSets = new Map(clients.map((client) => [client.id, new Set(client.purchases.map((purchase) => purchase.productId))]));
  const peersByProduct = new Map<string, Client[]>();
  for (const peer of clients) {
    if (!isCommercialOpportunityEligible(peer) || peer.portfolioStatus !== 'confirmed' || peer.purchases.length === 0) continue;
    for (const productId of purchaseSets.get(peer.id) ?? []) {
      const peers = peersByProduct.get(productId) ?? [];
      peers.push(peer);
      peersByProduct.set(productId, peers);
    }
  }

  const maxUnits = Math.max(...products.map((item) => item.monthlyUnits), 1);
  const inventoryStatus = classifyInventoryProduct(product).status;
  const stockOpportunity = inventoryStatus === 'high_coverage' || inventoryStatus === 'stock_without_movement';
  const popularity = product.monthlyUnits / maxUnits * 100;
  const opportunities: ProductClientOpportunity[] = [];

  for (const client of clients) {
    const owned = purchaseSets.get(client.id) ?? new Set<string>();
    if (!isCommercialOpportunityEligible(client) || owned.size === 0 || owned.has(product.id)) continue;
    const profile = clientProfile(client, productsById);
    if (!compatibleWithClient(profile, product)) continue;

    const candidatePeers = new Map<number, Client>();
    for (const productId of owned) {
      for (const peer of peersByProduct.get(productId) ?? []) {
        if (peer.id !== client.id) candidatePeers.set(peer.id, peer);
      }
    }
    const peers = [...candidatePeers.values()]
      .map((peer) => {
        const peerOwned = purchaseSets.get(peer.id) ?? new Set<string>();
        let overlap = 0;
        for (const productId of owned) if (peerOwned.has(productId)) overlap += 1;
        const union = owned.size + peerOwned.size - overlap || 1;
        const score = overlap / union * 70
          + (peer.segment === client.segment ? 10 : 0)
          + (peer.channel === client.channel ? 8 : 0)
          + (peer.locality === client.locality ? 7 : 0)
          + (peer.zone === client.zone ? 5 : 0);
        return { peer, overlap, score };
      })
      .filter((item) => item.overlap > 0)
      .sort((left, right) => right.score - left.score || right.overlap - left.overlap || left.peer.name.localeCompare(right.peer.name, 'es'))
      .slice(0, commercialOpportunityPolicy.comparablePeerLimit)
      .map((item) => item.peer);

    const similarity = Math.round(vectorSimilarityV2(profile, product.vector));
    const adopters = peers.filter((peer) => purchaseSets.get(peer.id)?.has(product.id));
    const peerAdoption = peers.length ? Math.round(adopters.length / peers.length * 100) : 0;
    const kinds: ProductClientOpportunity['kinds'] = ['mix_gap'];
    if (adopters.length >= 2 && peerAdoption >= 10) kinds.push('peer_adoption');
    if (stockOpportunity) kinds.push('high_stock_opportunity');
    const score = Math.round(clamp(similarity * .45 + peerAdoption * .35 + (stockOpportunity ? 100 : 0) * .12 + popularity * .08));
    if (score < 18 && !kinds.includes('peer_adoption') && !(stockOpportunity && similarity >= 45)) continue;

    opportunities.push({
      client: (({ id, name, tradeName, seller, locality, commercialOpportunity, sales90d }) => ({ id, name, tradeName, seller, locality, commercialOpportunity, sales90d }))(client),
      score,
      similarity,
      peerAdoption,
      peerSampleSize: peers.length,
      confidence: confidenceFor(owned.size, peers.length, product),
      reason: opportunityReason(kinds, peerAdoption, peers.length, product, null),
      kinds,
      affinityExplanation: affinityExplanation(profile, product, similarity),
      evidence: [
        `${owned.size} productos distintos en el mix observable del cliente.`,
        `${adopters.length} de ${peers.length} clientes comparables compraron el producto.`,
        stockOpportunity ? classifyInventoryProduct(product).explanation : '',
      ].filter(Boolean),
      comparableClients: adopters.slice(0, 3).map(({ id, name, tradeName, seller, locality }) => ({ id, name, tradeName, seller, locality })),
    });
  }

  return opportunities
    .sort((left, right) => right.score - left.score
      || right.similarity - left.similarity
      || right.client.commercialOpportunity - left.client.commercialOpportunity
      || right.client.sales90d - left.client.sales90d
      || left.client.name.localeCompare(right.client.name, 'es'))
    .slice(0, Math.max(0, limit));
}

export const commercialOpportunityPolicy = {
  observableWindowDays: 90,
  comparablePeerLimit: 40,
  activeClientRequired: true,
  recentPurchaseRequired: true,
  salesBlockExcluded: true,
  positiveStockRequired: true,
  automaticTaskCreation: false,
} as const;
