import { SALICE_DEPOT, VECTOR_LABELS, type Client, type Product, type Recommendation, type RoutePlan, type VectorKey } from './models.js';
import { VECTOR_KEYS, vectorSimilarityV2 } from './product-vectors.js';

const keys: VectorKey[] = VECTOR_KEYS;

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function cosineSimilarity(a: Record<VectorKey, number>, b: Record<VectorKey, number>) {
  const dot = keys.reduce((sum, key) => sum + a[key] * b[key], 0);
  const magnitudeA = Math.sqrt(keys.reduce((sum, key) => sum + a[key] ** 2, 0));
  const magnitudeB = Math.sqrt(keys.reduce((sum, key) => sum + b[key] ** 2, 0));
  return magnitudeA && magnitudeB ? dot / (magnitudeA * magnitudeB) : 0;
}

function clientProfile(client: Client, products: Product[]): Record<VectorKey, number> {
  const purchased = client.purchases
    .map((purchase) => ({ purchase, product: products.find((item) => item.id === purchase.productId) }))
    .filter((item): item is { purchase: Client['purchases'][number]; product: Product } => Boolean(item.product));
  // El peso monetario evita sumar como equivalentes unidades incompatibles
  // (por ejemplo, una pipeta y una bolsa de alimento de 25 kg).
  const totalWeight = purchased.reduce((sum, item) => sum + Math.max(0, item.purchase.total), 0) || 1;
  return Object.fromEntries(keys.map((key) => [
    key,
    purchased.reduce((sum, item) => sum + item.product.vector[key] * Math.max(0, item.purchase.total), 0) / totalWeight,
  ])) as Record<VectorKey, number>;
}

function speciesCompatible(profile: Record<VectorKey, number>, product: Product) {
  const mostlyDogs = profile.perros >= 65 && profile.gatos < 25;
  const mostlyCats = profile.gatos >= 65 && profile.perros < 25;
  if (mostlyDogs && product.vector.gatos >= 80 && product.vector.perros < 25) return false;
  if (mostlyCats && product.vector.perros >= 80 && product.vector.gatos < 25) return false;
  return true;
}

export function recommendProducts(client: Client, clients: Client[], products: Product[], limit = 4): Recommendation[] {
  if (!client.active) return [];
  const owned = new Set(client.purchases.map((purchase) => purchase.productId));
  const profile = clientProfile(client, products);
  const confirmed = clients.filter((peer) => peer.active && peer.portfolioStatus === 'confirmed' && peer.id !== client.id);
  const segmentPeers = confirmed.filter((peer) => peer.segment === client.segment);
  const channelPeers = confirmed.filter((peer) => peer.channel === client.channel);
  const peers = segmentPeers.length >= 8 ? segmentPeers : channelPeers;
  const zonePeers = confirmed.filter((peer) => peer.zone === client.zone);
  const maxUnits = Math.max(...products.map((product) => product.monthlyUnits), 1);
  const distinctPurchases = owned.size;
  const coldStart = distinctPurchases < 2;

  return products
    .filter((product) => !owned.has(product.id) && product.stock > 0 && speciesCompatible(profile, product))
    .map((product) => {
      const similarity = vectorSimilarityV2(profile, product.vector);
      const sharedTraits = VECTOR_KEYS
        .filter((key) => profile[key] >= 55 && product.vector[key] >= 55)
        .sort((left, right) => Math.min(profile[right], product.vector[right]) - Math.min(profile[left], product.vector[left]))
        .slice(0, 3)
        .map((key) => VECTOR_LABELS[key]);
      const peerAdoption = peers.length
        ? peers.filter((peer) => peer.purchases.some((purchase) => purchase.productId === product.id)).length / peers.length * 100
        : 0;
      const zoneAdoption = zonePeers.length
        ? zonePeers.filter((peer) => peer.purchases.some((purchase) => purchase.productId === product.id)).length / zonePeers.length * 100
        : 0;
      const popularity = product.monthlyUnits / maxUnits * 100;
      const score = Math.round(clamp(coldStart
        ? similarity * .2 + peerAdoption * .35 + zoneAdoption * .25 + popularity * .2
        : similarity * .5 + peerAdoption * .25 + zoneAdoption * .15 + popularity * .1));
      const vectorConfidence = product.vectorMeta.confidence;
      const confidence: Recommendation['confidence'] = distinctPurchases >= 4 && peers.length >= 20 && vectorConfidence >= 70
        ? 'reliable'
        : distinctPurchases >= 1 && peers.length >= 8 && vectorConfidence >= 45
          ? 'exploratory'
          : 'insufficient';
      const reason = confidence === 'insufficient'
        ? 'Sugerencia exploratoria: todavía hay poco historial comparable'
        : peerAdoption >= 35
          ? `${Math.round(peerAdoption)}% de ${peers.length} clientes comparables ya lo compra`
          : similarity >= 72
            ? `Afinidad v2.1 de ${Math.round(similarity)}%${sharedTraits.length ? `: ${sharedTraits.join(', ')}` : ' con su mix de compra'}`
            : `Complementa su mix y tiene rotación en la cartera`;
      return {
        product,
        score,
        similarity: Math.round(similarity),
        peerAdoption: Math.round(peerAdoption),
        peerSampleSize: peers.length,
        confidence,
        reason,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

const toRad = (value: number) => value * Math.PI / 180;

export function distanceKm(a: [number, number], b: [number, number]) {
  const earthRadius = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export interface RouteOptions {
  visitMinutes?: number;
  maxWorkMinutes?: number;
  roadFactor?: number;
}

export function optimizeRoute(selectedIds: number[], clients: Client[], options: RouteOptions = {}): RoutePlan {
  const depot = SALICE_DEPOT.coordinates;
  const visitMinutes = Math.max(10, Math.min(90, Math.round(options.visitMinutes ?? 25)));
  const maxWorkMinutes = Math.max(120, Math.min(720, Math.round(options.maxWorkMinutes ?? 480)));
  const roadFactor = Math.max(1, Math.min(1.8, options.roadFactor ?? 1.25));
  const remaining = clients.filter((client): client is Client & { coordinates: [number, number] } => (
    client.active && selectedIds.includes(client.id) && client.coordinates !== null
  ));
  const stops: RoutePlan['stops'] = [];
  let current = depot;
  let totalKm = 0;
  let elapsed = 0;

  const estimatedLeg = (a: [number, number], b: [number, number]) => distanceKm(a, b) * roadFactor;
  const travelTime = (kilometers: number) => {
    const speed = kilometers <= 10 ? 32 : kilometers <= 35 ? 48 : 68;
    return Math.max(4, Math.round(kilometers / speed * 60));
  };

  while (remaining.length) {
    const candidates = remaining.map((client) => ({
      client,
      distance: estimatedLeg(current, client.coordinates),
    }));
    candidates.sort((a, b) => {
      const scoreA = a.distance - a.client.visitPriority * 0.045;
      const scoreB = b.distance - b.client.visitPriority * 0.045;
      return scoreA - scoreB;
    });
    const next = candidates[0];
    const travelMinutes = travelTime(next.distance);
    totalKm += next.distance;
    elapsed += travelMinutes;
    stops.push({
      order: stops.length + 1,
      clientId: next.client.id,
      clientName: next.client.name,
      locality: next.client.locality,
      distanceKm: Number(next.distance.toFixed(1)),
      etaMinutes: elapsed,
      priority: next.client.visitPriority,
    });
    elapsed += visitMinutes;
    current = next.client.coordinates;
    remaining.splice(remaining.findIndex((client) => client.id === next.client.id), 1);
  }

  const returnDistance = stops.length ? estimatedLeg(current, depot) : 0;
  const returnMinutes = travelTime(returnDistance);
  if (stops.length) totalKm += returnDistance;
  const totalMinutes = elapsed + (stops.length ? returnMinutes : 0);
  const warnings: string[] = [];
  if (totalMinutes > maxWorkMinutes) warnings.push(`La jornada supera el máximo configurado por ${totalMinutes - maxWorkMinutes} min.`);
  if (stops.some((stop) => stop.distanceKm > 60)) warnings.push('Hay al menos un tramo estimado de más de 60 km; conviene separar la ruta por corredor.');
  if (new Set(stops.map((stop) => stop.locality)).size > 4) warnings.push('La ruta mezcla más de cuatro localidades y puede ser difícil de cumplir.');
  return {
    depot: SALICE_DEPOT,
    stops,
    totalKm: Number(totalKm.toFixed(1)),
    totalMinutes,
    algorithm: 'Vecino más cercano ponderado por prioridad, distancia vial estimada y regreso al depósito',
    feasible: warnings.length === 0,
    warnings,
    assumptions: { visitMinutes, maxWorkMinutes, roadFactor },
  };
}
