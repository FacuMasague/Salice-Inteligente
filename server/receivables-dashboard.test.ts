import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveActiveDataPaths } from './data-bundle';
import { buildPendingBalancesReport, getPendingBalancesReportMeta } from './pending-balances-report';
import { buildReceivablesDashboard, getReceivableCaseDetail } from './receivables-dashboard';

const databasePath = resolveActiveDataPaths().pendingBalances;
const describeWithDatabase = existsSync(databasePath) ? describe : describe.skip;

describeWithDatabase('tablero consolidado de cuentas por cobrar', () => {
  it('conserva los saldos de GESI al añadir el flujo administrativo local', () => {
    const base = buildPendingBalancesReport({});
    const dashboard = buildReceivablesDashboard({});
    expect(base).not.toBeNull();
    expect(dashboard).not.toBeNull();
    expect(dashboard?.pendingBalance).toBeCloseTo(base!.pendingBalance, 6);
    expect(dashboard?.overdueBalance).toBeCloseTo(base!.overdueBalance, 6);
    expect(dashboard?.openDocuments).toBe(base!.openDocuments);
    expect(dashboard?.overdueDocuments).toBe(base!.overdueDocuments);
    expect(dashboard?.rows).toHaveLength(base!.clients.length);
    expect(dashboard?.rows.every((row) => row.workflow.clientId === row.clientId)).toBe(true);
  });

  it('mantiene opciones estables y recalcula la bandeja completa al filtrar', () => {
    const meta = getPendingBalancesReportMeta();
    const seller = meta.options.sellers[0];
    const dashboard = buildReceivablesDashboard({ seller });
    expect(dashboard?.options.sellers).toEqual(meta.options.sellers);
    expect(dashboard?.options.paymentMethods).toEqual(meta.options.paymentMethods);
    expect(dashboard?.rows.every((row) => row.seller === seller)).toBe(true);
    expect(dashboard?.aging.reduce((sum, row) => sum + row.amount, 0)).toBeCloseTo(dashboard!.pendingBalance, 6);
  });

  it('abre los comprobantes exactos que componen el saldo de cada cuenta', () => {
    const dashboard = buildReceivablesDashboard({});
    const row = dashboard!.rows[0];
    const detail = getReceivableCaseDetail(row.clientId);
    expect(detail.documents).toHaveLength(row.openDocuments);
    expect(detail.documents.reduce((sum, document) => sum + document.outstanding, 0)).toBeCloseTo(row.pendingBalance, 6);
    expect(detail.documents.every((document) => document.clientId === row.clientId)).toBe(true);
  });
});
