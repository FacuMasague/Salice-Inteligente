import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from '../server/data/demo-snapshot';
import { buildCommercialOpportunities, buildProductClientOpportunities, commercialOpportunityPolicy, isCommercialOpportunityEligible } from './commercial-opportunities';
import type { Product } from './models';

describe('oportunidades comerciales explicables', () => {
  it('excluye productos sin stock, inactivos e incompatibles con la especie dominante', () => {
    const snapshot = createDemoSnapshot();
    const baseClient = snapshot.clients[0]!;
    const client = { ...baseClient, purchases: baseClient.purchases.filter((purchase) => (snapshot.products.find((product) => product.id === purchase.productId)?.vector.perros ?? 0) >= 55) };
    const recommendations = buildCommercialOpportunities(client, snapshot.clients, snapshot.products, 30);
    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.every(({ product }) => product.stock > 0 && product.inventory.status === 'positive' && product.masterStatus !== 'inactive')).toBe(true);
    expect(recommendations.every(({ product }) => !(product.vector.gatos >= 80 && product.vector.perros < 25))).toBe(true);
  });

  it('expone pares, explicación, confianza y evidencia sin crear tareas', () => {
    const snapshot = createDemoSnapshot();
    const recommendations = buildCommercialOpportunities(snapshot.clients[0], snapshot.clients, snapshot.products, 12);
    expect(recommendations.every((item) => item.affinityExplanation.length > 0 && item.evidence.length > 0)).toBe(true);
    expect(recommendations.every((item) => ['reliable', 'exploratory', 'insufficient'].includes(item.confidence))).toBe(true);
    expect(commercialOpportunityPolicy.automaticTaskCreation).toBe(false);
  });

  it('excluye clientes bloqueados o sin compras positivas en los últimos 90 días', () => {
    const snapshot = createDemoSnapshot();
    const base = snapshot.clients[0]!;
    const blocked = { ...base, salesBlocked: true };
    const withoutRecentSales = { ...base, id: 990003, sales90d: 0 };
    expect(isCommercialOpportunityEligible(base)).toBe(true);
    expect(isCommercialOpportunityEligible(blocked)).toBe(false);
    expect(isCommercialOpportunityEligible(withoutRecentSales)).toBe(false);
    expect(buildCommercialOpportunities(blocked, snapshot.clients, snapshot.products)).toEqual([]);
    expect(buildCommercialOpportunities(withoutRecentSales, snapshot.clients, snapshot.products)).toEqual([]);
  });

  it('identifica una alternativa disponible sólo si uso y presentación son compatibles', () => {
    const snapshot = createDemoSnapshot();
    const client = snapshot.clients[0];
    const purchasedId = client.purchases[0].productId;
    const anchor = snapshot.products.find((product) => product.id === purchasedId)!;
    const unavailable = { ...anchor, stock: 0, units90d: Math.max(anchor.units90d, 10), inventory: { ...anchor.inventory, status: 'zero' as const, rawAvailableUnit1: 0 } };
    const substitute = { ...anchor, id: 'TEST-SUSTITUTO', sku: 'TEST-SUSTITUTO', name: 'Sustituto verificable', stock: 20, inventory: { ...anchor.inventory, status: 'positive' as const, rawAvailableUnit1: 20 } };
    const products = snapshot.products.filter((product) => product.id !== anchor.id).concat(unavailable, substitute);
    const result = buildCommercialOpportunities(client, snapshot.clients, products, 30).find((item) => item.product.id === substitute.id);
    expect(result?.kinds).toContain('stockout_substitute');
    expect(result?.replacedProduct?.id).toBe(anchor.id);
  });

  it('nunca propone como sustituto otro producto que el cliente ya compró', () => {
    const snapshot = createDemoSnapshot();
    const client = snapshot.clients[0]!;
    const owned = new Set(client.purchases.map((purchase) => purchase.productId));
    const anchorPurchase = client.purchases[0]!;
    const otherOwnedPurchase = client.purchases.find((purchase) => purchase.productId !== anchorPurchase.productId)!;
    const anchor = snapshot.products.find((product) => product.id === anchorPurchase.productId)!;
    const otherOwned = snapshot.products.find((product) => product.id === otherOwnedPurchase.productId)!;
    const unavailable = {
      ...anchor,
      stock: 0,
      units90d: Math.max(anchor.units90d, 10),
      inventory: { ...anchor.inventory, status: 'zero' as const, rawAvailableUnit1: 0 },
    };
    const alreadyPurchasedAlternative = {
      ...anchor,
      id: otherOwned.id,
      sku: otherOwned.sku,
      name: 'Alternativa ya comprada',
      stock: 20,
      inventory: { ...anchor.inventory, status: 'positive' as const, rawAvailableUnit1: 20 },
    };
    const newAlternative = {
      ...anchor,
      id: 'TEST-SUSTITUTO-NUEVO',
      sku: 'TEST-SUSTITUTO-NUEVO',
      name: 'Alternativa todavía no comprada',
      stock: 20,
      inventory: { ...anchor.inventory, status: 'positive' as const, rawAvailableUnit1: 20 },
    };
    const products: Product[] = [
      ...snapshot.products.map((product) => ({
        ...product,
        stock: 0,
        inventory: { ...product.inventory, status: 'zero' as const, rawAvailableUnit1: 0 },
      })).filter((product) => product.id !== anchor.id && product.id !== otherOwned.id),
      unavailable,
      alreadyPurchasedAlternative,
      newAlternative,
    ];

    const result = buildCommercialOpportunities(client, snapshot.clients, products, 50);

    expect(result.every((item) => !owned.has(item.product.id))).toBe(true);
    expect(result.find((item) => item.product.id === newAlternative.id)?.kinds).toContain('stockout_substitute');
    expect(result.some((item) => item.product.id === alreadyPurchasedAlternative.id)).toBe(false);
  });

  it('marca stock alto sólo como una señal comercial adicional', () => {
    const snapshot = createDemoSnapshot();
    const client = snapshot.clients[0];
    const owned = new Set(client.purchases.map((purchase) => purchase.productId));
    const candidate = snapshot.products.find((product) => !owned.has(product.id) && product.inventory.status === 'positive')!;
    const highStock = { ...candidate, stockCoverageMonths: 5, monthlyUnits: Math.max(candidate.monthlyUnits, 1), units90d: Math.max(candidate.units90d, 3) };
    const products = snapshot.products.map((product) => product.id === highStock.id ? highStock : product);
    const result = buildCommercialOpportunities(client, snapshot.clients, products, 50).find((item) => item.product.id === highStock.id);
    expect(result?.kinds).toContain('high_stock_opportunity');
    expect(result?.kinds).toContain('mix_gap');
  });

  it('invierte la recomendación para listar clientes potenciales sin incluir compradores actuales', () => {
    const snapshot = createDemoSnapshot();
    const target = snapshot.products.find((product) => product.stock > 0 && product.inventory.status === 'positive')!;
    const buyers = new Set(snapshot.clients.filter((client) => client.purchases.some((purchase) => purchase.productId === target.id)).map((client) => client.id));
    const result = buildProductClientOpportunities(target, snapshot.clients, snapshot.products, 50);
    expect(result.every((item) => !buyers.has(item.client.id))).toBe(true);
    expect(result.every((item) => item.reason.length > 0 && item.affinityExplanation.length > 0 && item.evidence.length > 0)).toBe(true);
    expect(result.every((item) => item.kinds.includes('mix_gap'))).toBe(true);
    expect(result).toEqual([...result].sort((left, right) => right.score - left.score || right.similarity - left.similarity));
  });

  it('tampoco propone bloqueados o sin venta reciente desde la ficha de producto', () => {
    const snapshot = createDemoSnapshot();
    const target = snapshot.products.find((product) => product.stock > 0 && product.inventory.status === 'positive')!;
    const blockedId = snapshot.clients[0]!.id;
    const withoutRecentSalesId = snapshot.clients[1]!.id;
    const clients = snapshot.clients.map((client) => client.id === blockedId
      ? { ...client, salesBlocked: true }
      : client.id === withoutRecentSalesId
        ? { ...client, sales90d: 0 }
        : client);
    const result = buildProductClientOpportunities(target, clients, snapshot.products, 200);
    expect(result.some((item) => item.client.id === blockedId)).toBe(false);
    expect(result.some((item) => item.client.id === withoutRecentSalesId)).toBe(false);
  });

  it('no propone clientes si el producto no tiene stock positivo', () => {
    const snapshot = createDemoSnapshot();
    const target = snapshot.products[0]!;
    const unavailable = { ...target, stock: 0, inventory: { ...target.inventory, status: 'zero' as const, rawAvailableUnit1: 0 } };
    expect(buildProductClientOpportunities(unavailable, snapshot.clients, snapshot.products)).toEqual([]);
  });
});
