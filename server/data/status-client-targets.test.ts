import { describe, expect, it } from 'vitest';
import { isCommercialGoalProduct, isCommercialGoalSeller } from '../../shared/commercial-goals-scope';
import { STATUS_CLIENT_TARGET_HISTORY, STATUS_CLIENT_TARGETS } from './status-client-targets';
import { STATUS_TARGETS } from './status-targets';

describe('objetivos mensuales de clientes extraídos del Excel', () => {
  it('conserva junio y julio de 2026 con claves únicas y alcance comercial válido', () => {
    expect(STATUS_CLIENT_TARGETS).toHaveLength(162);
    expect(new Set(STATUS_CLIENT_TARGETS.map((row) => `${row.month}\u0000${row.product}\u0000${row.seller}`)).size).toBe(162);
    expect(STATUS_CLIENT_TARGETS.every((row) => isCommercialGoalSeller(row.seller))).toBe(true);
    expect(STATUS_CLIENT_TARGETS.every((row) => isCommercialGoalProduct(row.product))).toBe(true);
    for (const month of ['2026-06', '2026-07']) {
      expect(STATUS_CLIENT_TARGETS.filter((row) => row.month === month).reduce((sum, row) => sum + row.accounts, 0)).toBe(2_632);
      expect(STATUS_CLIENT_TARGET_HISTORY.filter((row) => row.month === month).reduce((sum, row) => sum + row.accounts, 0)).toBe(3_142);
    }
    expect(STATUS_CLIENT_TARGET_HISTORY).toHaveLength(200);
    expect(STATUS_CLIENT_TARGET_HISTORY.some((row) => row.seller === 'Luciano Payba')).toBe(true);
    expect(STATUS_CLIENT_TARGETS.some((row) => row.seller === 'Luciano Payba')).toBe(false);
  });

  it('queda incorporado en las mismas filas mensuales de kilos', () => {
    for (const clientTarget of STATUS_CLIENT_TARGETS) {
      expect(STATUS_TARGETS.find((row) => (
        row.month === clientTarget.month
        && row.product === clientTarget.product
        && row.seller === clientTarget.seller
      ))?.accounts).toBe(clientTarget.accounts);
    }
  });
});
