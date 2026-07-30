import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { REPORT_UNIVERSES } from '../shared/metrics';
import { getBairesReportMeta } from './baires-report';
import { getCommercialSalesReportMeta } from './commercial-sales-report';
import { getGeneralReportMeta } from './general-report';
import { getMarsReportMeta } from './mars-report';
import { getNonBuyerReportMeta } from './non-buyers-report';
import { getNutriPetReportMeta } from './nutripet-report';
import { getPendingBalancesReportMeta } from './pending-balances-report';
import { getSptReportMeta } from './spt-report';
import { compileMovementUniverse, EXECUTABLE_UNIVERSES, validateExecutableUniverses } from './report-universes';

function documented(id: string) {
  const value = REPORT_UNIVERSES.find((universe) => universe.id === id);
  if (!value) throw new Error(`Falta el universo ${id}`);
  return value;
}

describe('contrato central de universos de reporte', () => {
  it('mantiene los contratos ejecutables alineados con el catálogo', () => {
    expect(validateExecutableUniverses()).toEqual([]);
  });
  it('excluye vendedores históricos y conserva uno futuro en SQLite', () => {
    const database = new DatabaseSync(':memory:');
    database.exec('CREATE TABLE movements(company_id INTEGER, branch_id INTEGER, issuer_name TEXT, client_name TEXT, seller TEXT, branch_seller TEXT, category TEXT, product_group TEXT, client_status TEXT)');
    const insert = database.prepare('INSERT INTO movements VALUES (3, 3, ?, ?, ?, ?, ?, ?, ?)');
    insert.run('Salice Distribuciones S.A.', 'Cliente 1', 'Administración', 'Administración', '', '', 'Activo');
    insert.run('Salice Distribuciones S.A.', 'Cliente 2', 'Nueva Vendedora 2027', 'Nueva Vendedora 2027', '', '', 'Activo');
    const universe = compileMovementUniverse(EXECUTABLE_UNIVERSES.commercialSales);
    const sellers = database.prepare(`SELECT seller FROM movements WHERE ${universe.sql}`).all(...universe.parameters);
    database.close();
    expect(sellers).toEqual([{ seller: 'Nueva Vendedora 2027' }]);
  });
  it('mantiene empresa y sucursal alineadas con las implementaciones', () => {
    const mappings = [
      ['commercial-sales', getCommercialSalesReportMeta().universe],
      ['mars', getMarsReportMeta().universe],
      ['nutripet', getNutriPetReportMeta().universe],
      ['baires', getBairesReportMeta().universe],
      ['non-buyers', getNonBuyerReportMeta().universe],
      ['general-status', getGeneralReportMeta().universe],
      ['pending-balances', getPendingBalancesReportMeta().universe],
    ] as const;
    for (const [id, runtime] of mappings) {
      expect(runtime.companies, `${id}: empresas`).toEqual(documented(id).companies);
      expect(runtime.branches, `${id}: sucursales`).toEqual(documented(id).branches);
    }
  }, 20_000);

  it('conserva el universo histórico propio de SPT', () => {
    const runtime = getSptReportMeta().defaultUniverse;
    const catalog = documented('spt-main');
    expect(runtime.companies).toEqual(catalog.companies);
    expect(runtime.branches).toEqual(catalog.branches);
    expect(runtime.excludedCategories).toEqual(expect.arrayContaining(['POP', 'Promociones']));
  });
});
