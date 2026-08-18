import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { commercialGoalsImportPreview, parseCommercialGoalsWorkbook } from './commercial-goals-import';

async function buffer(workbook: ExcelJS.Workbook) {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('importación web de objetivos comerciales', () => {
  it('reconoce la tabla consolidada y normaliza meses, nombres y dimensiones', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Power BI');
    sheet.addRows([
      ['Mes ', 'Producto', 'Vendedor', ' Objetivo', 'Obj. Ctas', 'Obj. Fact'],
      [new Date('2026-07-01T12:00:00Z'), 'Humedos', 'Ana Otaviano', 1_500, 110, null],
      [new Date('2026-07-01T12:00:00Z'), 'Humedos', 'Ana Ottaviano', 500, 10, null],
      [new Date('2026-07-01T12:00:00Z'), '', 'Julieta Errecart', 19, 1, 40_000_000],
      [new Date('2026-06-01T12:00:00Z'), 'Fawna', 'Lucianos Payba', 800, 10, null],
    ]);

    const parsed = await parseCommercialGoalsWorkbook(await buffer(workbook), 'Status Salice.xlsx');
    const preview = commercialGoalsImportPreview(parsed);

    expect(parsed.format).toBe('normalized_table');
    expect(parsed.months.map((item) => item.month)).toEqual(['2026-07', '2026-06']);
    expect(parsed.months[0].dimensions).toEqual(['kilos', 'accounts', 'invoicing']);
    expect(parsed.months[0].rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ product: 'Alimento Húmedo', seller: 'Ana Ottaviano', kilos: 2_000, accounts: 120 }),
      expect.objectContaining({ product: '', seller: 'Julieta Errecart', kilos: null, accounts: null, invoicing: 40_000_000 }),
    ]));
    expect(preview.months[0].totals).toMatchObject({ coreKilos: 2_000, invoicing: 40_000_000 });
  });

  it('reconoce la plantilla mensual y declara que debe preservar facturación', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Julio 26');
    sheet.addRows([
      ['C&T'],
      ['Vendedor', 'Objetivo', 'A hoy', '% Cumpl.', 'Kg restantes', 'Obj. Ctas'],
      ['Ana Otaviano', 50, null, null, null, 40],
      ['Andres Dominguez', 300, null, null, null, 50],
      ['TOTAL', 350, null, null, null, 90],
      [],
      ['JUVENIA'],
      ['Vendedor', 'Objetivo', 'A hoy', '% Cumpl.', 'Kg restantes', 'Objetivo'],
      ['Luciano Payba', 800, null, null, null, 10],
      ['TOTAL', 800, null, null, null, 10],
    ]);

    const parsed = await parseCommercialGoalsWorkbook(await buffer(workbook), 'Objetivos Julio.xlsx');
    const month = parsed.months[0];

    expect(parsed.format).toBe('monthly_template');
    expect(month.month).toBe('2026-07');
    expect(month.dimensions).toEqual(['kilos', 'accounts']);
    expect(month.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ product: 'C&T', seller: 'Ana Ottaviano', kilos: 50, accounts: 40 }),
      expect.objectContaining({ product: 'Juvenia Nutrition', seller: 'Luciano Payba', kilos: 800, accounts: 10 }),
    ]));
    expect(commercialGoalsImportPreview(parsed).months[0].totals.invoicing).toBe(0);
  });

  it('rechaza un libro que no contiene ninguno de los dos formatos admitidos', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Hoja1').addRow(['Sin objetivos']);
    await expect(parseCommercialGoalsWorkbook(await buffer(workbook), 'otro.xlsx')).rejects.toThrow(/No se encontraron objetivos/);
  });
});
