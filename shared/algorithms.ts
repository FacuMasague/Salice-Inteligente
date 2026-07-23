import { SALICE_DEPOT, type Client, type Product, type Recommendation, type RoutePlan, type VectorKey } from './models.js';
import { VECTOR_KEYS } from './product-vectors.js';
import { buildCommercialOpportunities } from './commercial-opportunities.js';

const keys: VectorKey[] = VECTOR_KEYS;

export function cosineSimilarity(a: Record<VectorKey, number>, b: Record<VectorKey, number>) {
  const dot = keys.reduce((sum, key) => sum + a[key] * b[key], 0);
  const magnitudeA = Math.sqrt(keys.reduce((sum, key) => sum + a[key] ** 2, 0));
  const magnitudeB = Math.sqrt(keys.reduce((sum, key) => sum + b[key] ** 2, 0));
  return magnitudeA && magnitudeB ? dot / (magnitudeA * magnitudeB) : 0;
}

export function recommendProducts(client: Client, clients: Client[], products: Product[], limit = 4): Recommendation[] {
  return buildCommercialOpportunities(client, clients, products, limit);
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
