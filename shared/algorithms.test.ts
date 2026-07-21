import { describe, expect, it } from 'vitest';
import { cosineSimilarity, optimizeRoute, recommendProducts } from './algorithms';
import { SALICE_DEPOT } from './models';
import { createDemoSnapshot } from '../server/data/demo-snapshot';

describe('algorithm engine', () => {
  const snapshot = createDemoSnapshot();

  it('recommends products not yet purchased and orders them by score', () => {
    const client = snapshot.clients[0];
    const owned = new Set(client.purchases.map((purchase) => purchase.productId));
    const recommendations = recommendProducts(client, snapshot.clients, snapshot.products);
    expect(recommendations).toHaveLength(4);
    expect(recommendations.every((item) => !owned.has(item.product.id))).toBe(true);
    expect(recommendations.map((item) => item.score)).toEqual([...recommendations.map((item) => item.score)].sort((a, b) => b - a));
    expect(recommendations.every((item) => ['reliable', 'exploratory', 'insufficient'].includes(item.confidence))).toBe(true);
  });

  it('calculates identical cosine similarity as 100%', () => {
    const vector = snapshot.products[0].vector;
    expect(cosineSimilarity(vector, vector)).toBeCloseTo(1, 8);
  });

  it('visits every selected customer exactly once', () => {
    const selected = snapshot.clients.slice(0, 5).map((client) => client.id);
    const plan = optimizeRoute(selected, snapshot.clients);
    expect(plan.stops.map((stop) => stop.clientId).sort()).toEqual([...selected].sort());
    expect(new Set(plan.stops.map((stop) => stop.clientId)).size).toBe(selected.length);
    expect(plan.totalKm).toBeGreaterThan(0);
    expect(plan.totalMinutes).toBeGreaterThan(100);
    expect(plan.depot).toEqual(SALICE_DEPOT);
    expect(plan.depot.address).toBe('1 Demo Logistics Park');
    expect(plan.assumptions.visitMinutes).toBe(25);
    expect(plan.feasible).toBe(plan.warnings.length === 0);
  });

  it('excludes inactive customers from recommendations and routes', () => {
    const inactive = { ...snapshot.clients[0], active: false, sourceStateId: 2 };
    const clients = [inactive, ...snapshot.clients.slice(1)];
    expect(recommendProducts(inactive, clients, snapshot.products)).toEqual([]);
    const plan = optimizeRoute([inactive.id, snapshot.clients[1].id], clients);
    expect(plan.stops.map((stop) => stop.clientId)).toEqual([snapshot.clients[1].id]);
  });

  it('warns when the selection does not fit into a short workday', () => {
    const selected = snapshot.clients.slice(0, 8).map((client) => client.id);
    const plan = optimizeRoute(selected, snapshot.clients, { maxWorkMinutes: 120, visitMinutes: 45 });
    expect(plan.feasible).toBe(false);
    expect(plan.warnings.some((warning) => warning.includes('exceeds'))).toBe(true);
  });

  it('uses spend and species compatibility to avoid incoherent recommendations', () => {
    const base = snapshot.clients[0];
    const dogOnly = { ...base, purchases: base.purchases.filter((purchase) => ['P001', 'P002', 'P003', 'P011'].includes(purchase.productId)) };
    const recommendations = recommendProducts(dogOnly, snapshot.clients, snapshot.products, 12);
    expect(recommendations.every((item) => !(item.product.vector.gatos >= 80 && item.product.vector.perros < 25))).toBe(true);
  });
});
