import { describe, expect, it } from 'vitest';
import { REPORT_UNIVERSES } from '../shared/metrics';
import { getBairesReportMeta } from './baires-report';
import { getCommercialSalesReportMeta } from './commercial-sales-report';
import { getGeneralReportMeta } from './general-report';
import { getMarsReportMeta } from './mars-report';
import { getNonBuyerReportMeta } from './non-buyers-report';
import { getNutriPetReportMeta } from './nutripet-report';
import { getPendingBalancesReportMeta } from './pending-balances-report';
import { getSptReportMeta } from './spt-report';
import { validateExecutableUniverses } from './report-universes';

function documented(id: string) {
  const value = REPORT_UNIVERSES.find((universe) => universe.id === id);
  if (!value) throw new Error(`Falta el universo ${id}`);
  return value;
}

describe('contrato central de universos de reporte', () => {
  it('mantiene los contratos ejecutables alineados con el catálogo', () => {
    expect(validateExecutableUniverses()).toEqual([]);
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
    expect(runtime.excludedCategories).toEqual(expect.arrayContaining(['POP', 'Promociones']));
  });
});
