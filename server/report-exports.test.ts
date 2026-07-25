import { existsSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { resolveActiveDataPaths } from './data-bundle';
import { buildNonBuyerReport } from './non-buyers-report';
import { createReportExportWorkbook, type ReportExportId } from './report-exports';

const paths = resolveActiveDataPaths();
const available = existsSync(paths.commercial) && existsSync(paths.pendingBalances);
const describeWithData = available ? describe : describe.skip;

function metadataValues(workbook: ExcelJS.Workbook) {
  const sheet = workbook.getWorksheet('Metadatos');
  return new Map(
    (sheet?.getRows(2, 7) ?? []).map((row) => [String(row.getCell(1).value), String(row.getCell(2).value)]),
  );
}

describeWithData('exportaciones integrales de Reportes', () => {
  it('genera un único libro auditable y válido para cada informe seleccionado', async () => {
    const cases: Array<{ id: ReportExportId; input: Record<string, string>; sheets: string[] }> = [
      { id: 'spt', input: {}, sheets: ['Resumen', 'Detalle diario', 'Historia mensual', 'Vendedores', 'Grupos de producto', 'Trimestres'] },
      { id: 'mars', input: {}, sheets: ['Resumen', 'Períodos', 'Trimestres', 'Marcas'] },
      { id: 'nutripet', input: {}, sheets: ['Resumen', 'Historia mensual', 'Trimestres', 'Marcas', 'Productos'] },
      { id: 'baires', input: {}, sheets: ['Resumen', 'Historia mensual', 'Trimestres', 'Marcas', 'Subrubros'] },
      { id: 'non-buyers', input: { view: 'accounts' }, sheets: ['Resumen', 'Cuentas', 'Vendedores'] },
    ];

    for (const testCase of cases) {
      const result = createReportExportWorkbook(testCase.id, testCase.input);
      expect(result.filename).toMatch(/\.xlsx$/);
      expect(result.detailRows).toBeGreaterThan(0);
      expect(result.workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Metadatos', ...testCase.sheets]);
      const metadata = metadataValues(result.workbook);
      expect(metadata.get('Período')).toBeTruthy();
      expect(metadata.get('Fecha de corte')).toBeTruthy();
      expect(metadata.get('Universo')).toBeTruthy();
      expect(metadata.get('Filtros aplicados')).toBeTruthy();
      expect(metadata.get('Fuente')).toContain('GESI');
      expect(metadata.get('Advertencias')).toBeTruthy();

      const buffer = await result.workbook.xlsx.writeBuffer();
      const reopened = new ExcelJS.Workbook();
      await reopened.xlsx.load(buffer);
      expect(reopened.getWorksheet('Metadatos')).toBeDefined();
      reopened.worksheets.forEach((sheet) => {
        expect(sheet.views[0]?.showGridLines).toBe(true);
      });
      testCase.sheets.forEach((sheetName) => {
        const sheet = reopened.getWorksheet(sheetName);
        expect(sheet).toBeDefined();
        expect(sheet!.views[0]?.state).toBe('frozen');
        sheet!.columns.forEach((column) => expect(column.width ?? 0).toBeGreaterThanOrEqual(12));
      });
    }
  }, 60_000);

  it('exporta todo el universo filtrado de No compradoras y no sólo las primeras 100 filas visibles', () => {
    const report = buildNonBuyerReport({});
    expect(report).not.toBeNull();
    const expected = report!.accounts.filter((row) => row.isNonBuyer30);
    expect(expected.length).toBeGreaterThan(100);
    const result = createReportExportWorkbook('non-buyers', { view: 'accounts', statusMode: 'non-buyers' });
    const detail = result.workbook.getWorksheet('Cuentas');
    expect(result.detailRows).toBe(expected.length);
    expect((detail?.rowCount ?? 0) - 1).toBe(expected.length);
  });

  it('guarda porcentajes como fracciones de Excel y fechas como valores tipados', () => {
    const mars = createReportExportWorkbook('mars', {});
    const percentageCell = mars.workbook.getWorksheet('Marcas')?.getCell('F2');
    expect(percentageCell?.numFmt).toBe('0.00%');
    expect(typeof percentageCell?.value).toBe('number');
    expect(Number(percentageCell?.value)).toBeLessThanOrEqual(1);

    const nonBuyers = createReportExportWorkbook('non-buyers', { view: 'accounts' });
    const dateCell = nonBuyers.workbook.getWorksheet('Cuentas')?.getCell('E2');
    expect(dateCell?.value).toBeInstanceOf(Date);
    expect(dateCell?.numFmt).toBe('dd/mm/yyyy');
  });
});
