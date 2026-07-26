import type { Client } from './models.js';

type Point = [number, number];

interface LocalityReference {
  coordinates: Point;
  aliases: string[];
}

const REFERENCES: LocalityReference[] = [
  { coordinates: [-38.0055, -57.5426], aliases: ['mar del plata', 'mar del plata norte', 'mar del plata sur', 'mar del plara'] },
  { coordinates: [-38.271, -57.8396], aliases: ['miramar'] },
  { coordinates: [-38.322, -58.781], aliases: ['necochea'] },
  { coordinates: [-38.575, -58.701], aliases: ['quequen'] },
  { coordinates: [-37.848, -58.255], aliases: ['balcarce'] },
  { coordinates: [-37.263, -56.973], aliases: ['villa gesell'] },
  { coordinates: [-37.107, -56.862], aliases: ['pinamar'] },
  { coordinates: [-37.123, -56.861], aliases: ['ostende'] },
  { coordinates: [-37.147, -56.892], aliases: ['valeria del mar'] },
  { coordinates: [-37.166, -56.891], aliases: ['carilo'] },
  { coordinates: [-37.323, -57.021], aliases: ['mar azul', 'mar de las pampas'] },
  { coordinates: [-36.356, -56.723], aliases: ['san clemente del tuyu'] },
  { coordinates: [-36.542, -56.704], aliases: ['santa teresita'] },
  { coordinates: [-36.577, -56.688], aliases: ['mar del tuyu', 'santa teresita mar del tuyu'] },
  { coordinates: [-36.724, -56.676], aliases: ['mar de ajo'] },
  { coordinates: [-36.696, -56.678], aliases: ['san bernardo', 'mar de ajo san bernardo'] },
  { coordinates: [-36.489, -56.700], aliases: ['las toninas'] },
  { coordinates: [-36.605, -56.718], aliases: ['costa del este'] },
  { coordinates: [-37.833, -57.508], aliases: ['santa clara del mar'] },
  { coordinates: [-37.868, -57.502], aliases: ['mar de cobo'] },
  { coordinates: [-38.009, -57.709], aliases: ['batan'] },
  { coordinates: [-37.942, -57.774], aliases: ['sierra de los padres'] },
  { coordinates: [-38.176, -57.650], aliases: ['chapadmalal', 'playa chapadmalal'] },
  { coordinates: [-38.112, -57.845], aliases: ['otamendi'] },
  { coordinates: [-37.451, -57.729], aliases: ['coronel vidal'] },
  { coordinates: [-37.329, -57.052], aliases: ['general juan madariaga', 'gral juan madariaga'] },
  { coordinates: [-37.328, -57.044], aliases: ['general piran', 'piran'] },
  { coordinates: [-36.314, -57.679], aliases: ['dolores'] },
  { coordinates: [-36.862, -57.880], aliases: ['maipu'] },
  { coordinates: [-37.317, -59.151], aliases: ['tandil'] },
  { coordinates: [-36.776, -59.089], aliases: ['rauch'] },
  { coordinates: [-36.091, -57.807], aliases: ['castelli'] },
  { coordinates: [-38.164, -58.781], aliases: ['loberia'] },
  { coordinates: [-38.148, -58.223], aliases: ['mechongue'] },
];

const clean = (value: string) => value
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLocaleLowerCase('es')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const aliasMap = new Map(REFERENCES.flatMap((reference) => reference.aliases.map((alias) => [clean(alias), reference] as const)));

function localityKey(value: string) {
  const normalized = clean(value);
  if (normalized.startsWith('villa gesell')) return 'villa gesell';
  return normalized;
}

function radians(value: number) {
  return value * Math.PI / 180;
}

export function locationDistanceKm(a: Point, b: Point) {
  const earthRadius = 6371;
  const latitudeDelta = radians(b[0] - a[0]);
  const longitudeDelta = radians(b[1] - a[1]);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

const inServiceEnvelope = ([latitude, longitude]: Point) => (
  latitude >= -39.7 && latitude <= -35.7 && longitude >= -60.8 && longitude <= -56.2
);

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function observedCenters(clients: Client[]) {
  const groups = new Map<string, Point[]>();
  for (const client of clients) {
    if (!client.coordinates || !inServiceEnvelope(client.coordinates)) continue;
    const key = localityKey(client.locality);
    if (!key || key === 'sin localidad') continue;
    groups.set(key, [...(groups.get(key) ?? []), client.coordinates]);
  }
  return new Map([...groups.entries()]
    .filter(([, points]) => points.length >= 3)
    .map(([key, points]) => [key, [median(points.map((point) => point[0])), median(points.map((point) => point[1]))] as Point]));
}

export interface ClientLocationSummary {
  clients: Client[];
  corrected: number;
  review: number;
}

/**
 * Corrige sólo incompatibilidades evidentes. Nunca inventa una dirección:
 * el punto sustituto representa la localidad y queda marcado como aproximado.
 */
export function applyClientLocationQuality(clients: Client[]): ClientLocationSummary {
  const centers = observedCenters(clients);
  let corrected = 0;
  let review = 0;
  const normalized = clients.map((client) => {
    const original = client.originalCoordinates ?? client.coordinates;
    if (!original) {
      return { ...client, locationStatus: client.locationStatus ?? 'original', originalCoordinates: null } satisfies Client;
    }
    const key = localityKey(client.locality);
    const reference = centers.get(key) ?? aliasMap.get(key)?.coordinates;
    if (reference && locationDistanceKm(original, reference) > 45) {
      corrected += 1;
      return {
        ...client,
        coordinates: reference,
        locationStatus: 'corrected',
        originalCoordinates: original,
        locationPrecision: 'locality',
        locationCorrectionReason: `Las coordenadas de GESI no coinciden con ${client.locality}; se muestra una referencia aproximada de la localidad.`,
      } satisfies Client;
    }
    if (!reference && !inServiceEnvelope(original)) {
      review += 1;
      return {
        ...client,
        coordinates: null,
        locationStatus: 'review',
        originalCoordinates: original,
        locationCorrectionReason: 'La coordenada queda fuera de la zona comercial y la localidad no permite corregirla de forma segura.',
      } satisfies Client;
    }
    return {
      ...client,
      coordinates: original,
      locationStatus: 'original',
      originalCoordinates: original,
      locationPrecision: 'exact',
      locationCorrectionReason: undefined,
    } satisfies Client;
  });
  return { clients: normalized, corrected, review };
}
