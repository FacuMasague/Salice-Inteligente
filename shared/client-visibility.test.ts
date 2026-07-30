import { describe, expect, it } from 'vitest';
import type { Client } from './models';
import { filterClientsByScope, isClientVisibleInScope } from './client-visibility';

const client = (overrides: Partial<Client>): Client => ({
  id: 1,
  active: true,
  lastPurchaseAt: '',
  balance: 0,
  invoices: [],
  ...overrides,
} as Client);

describe('visibilidad global de clientes', () => {
  const snapshotDate = '2026-07-30';

  it('muestra por defecto compras de tres meses y deuda accionable', () => {
    expect(isClientVisibleInScope(client({ lastPurchaseAt: '2026-04-30' }), 'recent3', snapshotDate)).toBe(true);
    expect(isClientVisibleInScope(client({ active: false, balance: 1_500 }), 'recent3', snapshotDate)).toBe(true);
    expect(isClientVisibleInScope(client({ lastPurchaseAt: '2026-04-29', balance: 999 }), 'recent3', snapshotDate)).toBe(false);
  });

  it('permite ampliar a seis meses, activos o universo completo', () => {
    const inactiveOld = client({ active: false, lastPurchaseAt: '2025-01-01' });
    const activeOld = client({ id: 2, active: true, lastPurchaseAt: '2025-01-01' });
    const sixMonths = client({ id: 3, lastPurchaseAt: '2026-01-30' });
    expect(filterClientsByScope([inactiveOld, activeOld, sixMonths], 'recent6', snapshotDate).map(({ id }) => id)).toEqual([3]);
    expect(filterClientsByScope([inactiveOld, activeOld, sixMonths], 'active', snapshotDate).map(({ id }) => id)).toEqual([2, 3]);
    expect(filterClientsByScope([inactiveOld, activeOld, sixMonths], 'all', snapshotDate)).toHaveLength(3);
  });
});
