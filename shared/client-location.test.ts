import { describe, expect, it } from 'vitest';
import type { Client } from './models.js';
import { applyClientLocationQuality } from './client-location.js';

const client = (id: number, locality: string, coordinates: [number, number] | null): Client => ({
  id, locality, coordinates, active: true, gesiStateId: 1, statusUpdatedAt: '2026-07-25',
  portfolioStatus: 'confirmed', reference: String(id), name: `Cliente ${id}`, tradeName: `Cliente ${id}`,
  address: 'Dirección', zone: 'Zona', segment: 'Pet shop', channel: 'Canal', seller: 'Vendedor',
  phone: '', email: '', creditLimit: 0, balance: 0, accountEnabled: false, salesBlocked: false,
  deliveryBlocked: false, paymentMethod: '', creditDays: null, creditTermStatus: 'unavailable',
  creditTermSampleSize: 0, creditTermDominantShare: 0, creditTermMinDays: null, creditTermMaxDays: null,
  creditTermOptions: [], avgPaymentDays: 0, avgPaymentDelayDays: 0, onTimePaymentRate: 0,
  paymentSampleSize: 0, paymentTrend: [], paymentDelayTrend: [], salesTrend: [0, 0, 0, 0, 0, 0],
  lastPurchaseAt: '', nextVisitAt: '2026-07-25', sales90d: 0, unmappedSales90d: 0, salesDelta: 0,
  collectionRisk: 0, commercialOpportunity: 0, visitPriority: 0, health: 'healthy',
  overdueOutstanding: 0, oldestOverdueDays: 0, purchases: [], invoices: [], note: '',
});

describe('calidad geográfica de clientes', () => {
  it('conserva coordenadas compatibles con la localidad', () => {
    const result = applyClientLocationQuality([client(1, 'Mar del Plata', [-38.01, -57.55])]);
    expect(result.clients[0]).toMatchObject({ coordinates: [-38.01, -57.55], locationStatus: 'original', locationPrecision: 'exact' });
    expect(result.corrected).toBe(0);
  });

  it('corrige una coordenada de Capital declarada como Mar del Plata y conserva el original', () => {
    const original: [number, number] = [-34.6037, -58.3816];
    const result = applyClientLocationQuality([client(1, 'Mar del Plata', original)]);
    expect(result.clients[0].locationStatus).toBe('corrected');
    expect(result.clients[0].originalCoordinates).toEqual(original);
    expect(result.clients[0].coordinates?.[0]).toBeLessThan(-37.9);
    expect(result.clients[0].locationPrecision).toBe('locality');
  });

  it('omite del mapa una ubicación externa que no puede corregir con seguridad', () => {
    const result = applyClientLocationQuality([client(1, 'Localidad desconocida', [-34.60, -58.38])]);
    expect(result.clients[0]).toMatchObject({ coordinates: null, locationStatus: 'review', originalCoordinates: [-34.60, -58.38] });
    expect(result.review).toBe(1);
  });

  it('usa la mediana observada para variantes de localidades con muestra suficiente', () => {
    const clients = [
      client(1, 'Pueblo de prueba', [-37.10, -57.10]),
      client(2, 'Pueblo de prueba', [-37.11, -57.11]),
      client(3, 'Pueblo de prueba', [-37.12, -57.12]),
      client(4, 'Pueblo de prueba', [-34.60, -58.38]),
    ];
    const result = applyClientLocationQuality(clients);
    expect(result.clients[3]).toMatchObject({ locationStatus: 'corrected', coordinates: [-37.11, -57.11] });
  });
});
