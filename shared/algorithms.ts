import {
  SALICE_DEPOT,
  type Client,
  type DeliveryInvoice,
  type Product,
  type Recommendation,
  type RoutePlan,
  type VectorKey,
} from './models.js';
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

export interface DeliveryStopCandidate {
  clientId: number;
  clientName: string;
  address: string;
  locality: string;
  coordinates: [number, number] | null;
  invoices: DeliveryInvoice[];
  amount: number;
}

export function groupDeliveryInvoices(invoices: DeliveryInvoice[], clients: Client[]): DeliveryStopCandidate[] {
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const groups = new Map<number, DeliveryInvoice[]>();
  for (const invoice of invoices) groups.set(invoice.clientId, [...(groups.get(invoice.clientId) ?? []), invoice]);
  return [...groups.entries()].map(([clientId, groupedInvoices]) => {
    const client = clientById.get(clientId);
    const preferredAddress = groupedInvoices.map((invoice) => invoice.deliveryAddress).find(Boolean) || client?.address || '';
    const preferredLocality = groupedInvoices.map((invoice) => invoice.locality).find(Boolean) || client?.locality || 'Sin localidad';
    return {
      clientId,
      clientName: client?.tradeName || client?.name || `Cliente ${clientId}`,
      address: preferredAddress || 'Sin domicilio informado',
      locality: preferredLocality,
      coordinates: client?.coordinates ?? null,
      invoices: [...groupedInvoices].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || a.number.localeCompare(b.number)),
      amount: Math.round(groupedInvoices.reduce((sum, invoice) => sum + invoice.amount, 0) * 100) / 100,
    };
  }).sort((a, b) => a.locality.localeCompare(b.locality, 'es') || a.clientName.localeCompare(b.clientName, 'es'));
}

export interface RouteOptions {
  stopMinutes?: number;
  maxWorkMinutes?: number;
  roadFactor?: number;
  mode?: 'suggested' | 'manual';
}

export function optimizeDeliveryRoute(
  orderedClientIds: number[],
  invoices: DeliveryInvoice[],
  clients: Client[],
  options: RouteOptions = {},
): RoutePlan {
  const depot = SALICE_DEPOT.coordinates;
  const stopMinutes = Math.max(5, Math.min(120, Math.round(options.stopMinutes ?? 15)));
  const maxWorkMinutes = Math.max(120, Math.min(720, Math.round(options.maxWorkMinutes ?? 480)));
  const roadFactor = Math.max(1, Math.min(1.8, options.roadFactor ?? 1.25));
  const selected = new Set(orderedClientIds);
  const grouped = groupDeliveryInvoices(invoices, clients)
    .filter((stop): stop is DeliveryStopCandidate & { coordinates: [number, number] } => selected.has(stop.clientId) && stop.coordinates !== null);
  const byClient = new Map(grouped.map((stop) => [stop.clientId, stop]));
  const remaining = options.mode === 'manual'
    ? orderedClientIds.map((id) => byClient.get(id)).filter((stop): stop is DeliveryStopCandidate & { coordinates: [number, number] } => Boolean(stop))
    : [...grouped];
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
    const candidates = remaining.map((stop) => ({ stop, distance: estimatedLeg(current, stop.coordinates) }));
    if (options.mode !== 'manual') candidates.sort((a, b) => a.distance - b.distance || a.stop.clientName.localeCompare(b.stop.clientName, 'es'));
    const next = candidates[0];
    const travelMinutes = travelTime(next.distance);
    totalKm += next.distance;
    elapsed += travelMinutes;
    stops.push({
      order: stops.length + 1,
      clientId: next.stop.clientId,
      clientName: next.stop.clientName,
      address: next.stop.address,
      locality: next.stop.locality,
      distanceKm: Number(next.distance.toFixed(1)),
      etaMinutes: elapsed,
      invoiceCount: next.stop.invoices.length,
      invoiceIds: next.stop.invoices.map((invoice) => invoice.id),
      amount: next.stop.amount,
    });
    elapsed += stopMinutes;
    current = next.stop.coordinates;
    remaining.splice(remaining.findIndex((stop) => stop.clientId === next.stop.clientId), 1);
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
    algorithm: options.mode === 'manual'
      ? 'Orden manual, distancia vial estimada y regreso al depósito'
      : 'Vecino más cercano por distancia estimada y regreso al depósito',
    feasible: warnings.length === 0,
    warnings,
    assumptions: { stopMinutes, maxWorkMinutes, roadFactor },
  };
}
