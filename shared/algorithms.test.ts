import { describe, expect, it } from 'vitest';
import { cosineSimilarity, groupDeliveryInvoices, optimizeDeliveryRoute, recommendProducts } from './algorithms';
import { SALICE_DEPOT } from './models';
import { createDemoSnapshot } from '../server/data/demo-snapshot';

describe('motor algorítmico', () => {
  const snapshot = createDemoSnapshot();

  it('recomienda productos todavía no comprados y ordenados por puntaje', () => {
    const client = snapshot.clients[0];
    const owned = new Set(client.purchases.map((purchase) => purchase.productId));
    const recommendations = recommendProducts(client, snapshot.clients, snapshot.products);
    expect(recommendations).toHaveLength(4);
    expect(recommendations.every((item) => !owned.has(item.product.id))).toBe(true);
    expect(recommendations.map((item) => item.score)).toEqual([...recommendations.map((item) => item.score)].sort((a, b) => b - a));
    expect(recommendations.every((item) => ['reliable', 'exploratory', 'insufficient'].includes(item.confidence))).toBe(true);
  });

  it('calcula similitud coseno idéntica como 100%', () => {
    const vector = snapshot.products[0].vector;
    expect(cosineSimilarity(vector, vector)).toBeCloseTo(1, 8);
  });

  it('agrupa facturas del mismo cliente y visita cada parada una sola vez', () => {
    const groups = groupDeliveryInvoices(snapshot.logistics.invoices, snapshot.clients);
    const selected = groups.filter((stop) => stop.coordinates).slice(0, 5).map((stop) => stop.clientId);
    const selectedInvoices = snapshot.logistics.invoices.filter((invoice) => selected.includes(invoice.clientId));
    const plan = optimizeDeliveryRoute(selected, selectedInvoices, snapshot.clients);
    expect(plan.stops.map((stop) => stop.clientId).sort()).toEqual([...selected].sort());
    expect(new Set(plan.stops.map((stop) => stop.clientId)).size).toBe(selected.length);
    expect(plan.stops.reduce((sum, stop) => sum + stop.invoiceCount, 0)).toBe(selectedInvoices.length);
    expect(plan.totalKm).toBeGreaterThan(0);
    expect(plan.totalMinutes).toBeGreaterThan(0);
    expect(plan.depot).toEqual(SALICE_DEPOT);
    expect(plan.depot.address).toBe('Eduardo Bradley 1450');
    expect(plan.assumptions.stopMinutes).toBe(15);
    expect(plan.feasible).toBe(plan.warnings.length === 0);
  });

  it('sugiere las facturas por razón social y no por nombre de fantasía', () => {
    const client = { ...snapshot.clients[0], name: 'Razón Social Ejemplo SA', tradeName: 'Comercio de Fantasía' };
    const invoice = snapshot.logistics.invoices.find((item) => item.clientId === client.id);
    expect(invoice).toBeDefined();
    const [stop] = groupDeliveryInvoices([invoice!], [client]);
    expect(stop.clientName).toBe('Razón Social Ejemplo SA');
  });

  it('excluye clientes inactivos de recomendaciones, pero conserva repartos reales si tienen factura', () => {
    const inactive = { ...snapshot.clients[0], active: false, gesiStateId: 2 };
    const clients = [inactive, ...snapshot.clients.slice(1)];
    expect(recommendProducts(inactive, clients, snapshot.products)).toEqual([]);
    const invoices = snapshot.logistics.invoices.filter((invoice) => [inactive.id, snapshot.clients[1].id].includes(invoice.clientId));
    const plan = optimizeDeliveryRoute([inactive.id, snapshot.clients[1].id], invoices, clients, { mode: 'manual' });
    expect(plan.stops.map((stop) => stop.clientId)).toEqual([inactive.id, snapshot.clients[1].id]);
  });

  it('advierte cuando la selección no entra en una jornada corta', () => {
    const selected = snapshot.logistics.invoices.map((invoice) => invoice.clientId);
    const plan = optimizeDeliveryRoute(selected, snapshot.logistics.invoices, snapshot.clients, { maxWorkMinutes: 120, stopMinutes: 45 });
    expect(plan.feasible).toBe(false);
    expect(plan.warnings.some((warning) => warning.includes('supera'))).toBe(true);
  });

  it('respeta el orden manual de las paradas', () => {
    const selected = snapshot.logistics.invoices.slice(0, 4).map((invoice) => invoice.clientId).reverse();
    const invoices = snapshot.logistics.invoices.filter((invoice) => selected.includes(invoice.clientId));
    const plan = optimizeDeliveryRoute(selected, invoices, snapshot.clients, { mode: 'manual' });
    expect(plan.stops.map((stop) => stop.clientId)).toEqual(selected);
  });

  it('no usa el centro aproximado de una localidad como parada de reparto', () => {
    const target = snapshot.clients[0];
    const clients = snapshot.clients.map((client) => client.id === target.id
      ? { ...client, locationPrecision: 'locality' as const, locationStatus: 'corrected' as const }
      : client);
    const groups = groupDeliveryInvoices(snapshot.logistics.invoices, clients);
    expect(groups.find((stop) => stop.clientId === target.id)?.coordinates).toBeNull();
    const invoices = snapshot.logistics.invoices.filter((invoice) => invoice.clientId === target.id);
    expect(optimizeDeliveryRoute([target.id], invoices, clients).stops).toEqual([]);
  });

  it('usa gasto y compatibilidad de especie para evitar recomendaciones incoherentes', () => {
    const base = snapshot.clients[0];
    const dogOnly = { ...base, purchases: base.purchases.filter((purchase) => ['P001', 'P002', 'P003', 'P011'].includes(purchase.productId)) };
    const recommendations = recommendProducts(dogOnly, snapshot.clients, snapshot.products, 12);
    expect(recommendations.every((item) => !(item.product.vector.gatos >= 80 && item.product.vector.perros < 25))).toBe(true);
  });
});
