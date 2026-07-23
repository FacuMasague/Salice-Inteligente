import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from '../server/data/demo-snapshot';
import {
  buildSellerPortfolioProfiles,
  matchesPortfolioLens,
} from './portfolio-analysis';

describe('lectura de carteras comerciales', () => {
  const snapshot = createDemoSnapshot();

  it('usa sólo clientes activos, conserva Sin vendedor y mantiene cada cartera ordenada por P', () => {
    const seller = snapshot.clients[0].seller;
    const activeHigh = { ...snapshot.clients[0], id: 980001, active: true, seller, visitPriority: 90 };
    const activeLow = { ...snapshot.clients[1], id: 980002, active: true, seller, visitPriority: 20 };
    const inactive = { ...snapshot.clients[2], id: 980003, active: false, seller, visitPriority: 100 };
    const unassigned = { ...snapshot.clients[3], id: 980009, active: true, seller: 'Sin vendedor' };
    const profiles = buildSellerPortfolioProfiles([activeLow, inactive, activeHigh, unassigned]);

    expect(profiles).toHaveLength(2);
    const assigned = profiles.find((profile) => profile.name === seller)!;
    expect(assigned.clientRows.map((row) => row.client.id)).toEqual([activeHigh.id, activeLow.id]);
    expect(assigned.activeClients).toBe(2);
    expect(profiles.find((profile) => profile.name === 'Sin vendedor')?.activeClients).toBe(1);
  });

  it('mantiene C/O/P separados y sólo cuenta oportunidades comercialmente elegibles', () => {
    const seller = snapshot.clients[0].seller;
    const noPurchase = {
      ...snapshot.clients[0],
      id: 980004,
      active: true,
      seller,
      sales90d: 0,
      salesBlocked: false,
      collectionRisk: 70,
      commercialOpportunity: 80,
      visitPriority: 65,
    };
    const eligible = {
      ...snapshot.clients[1],
      id: 980005,
      active: true,
      seller,
      sales90d: 100000,
      salesBlocked: false,
      collectionRisk: 20,
      commercialOpportunity: 70,
      visitPriority: 60,
    };
    const profiles = buildSellerPortfolioProfiles([noPurchase, eligible]);
    const [first, second] = profiles[0].clientRows;

    expect(matchesPortfolioLens(first, 'high_risk')).toBe(true);
    expect(matchesPortfolioLens(first, 'high_opportunity')).toBe(false);
    expect(matchesPortfolioLens(second, 'high_opportunity')).toBe(true);
    expect(profiles[0]).toMatchObject({
      opportunityClients: 1,
      prioritySignalClients: 2,
    });
  });

  it('resume localidades observadas sin convertirlas en territorios', () => {
    const seller = snapshot.clients[0].seller;
    const first = { ...snapshot.clients[0], id: 980006, active: true, seller, locality: 'Mar del Plata', sales90d: 100 };
    const second = { ...snapshot.clients[1], id: 980007, active: true, seller, locality: '  MAR DEL   PLATA ', sales90d: 200 };
    const third = { ...snapshot.clients[2], id: 980008, active: true, seller, locality: 'Miramar', sales90d: 50 };
    const profile = buildSellerPortfolioProfiles([first, second, third])[0];

    expect(profile.localities.map((row) => row.name)).toEqual(['Mar del Plata', 'Miramar']);
    expect(profile.localities[0]).toMatchObject({ clients: 2, sales90d: 300 });
  });
});
