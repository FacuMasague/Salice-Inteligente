import ExcelJS from 'exceljs';
import type {
  CommercialGoalImportPreview,
  CommercialGoalRow,
} from '../shared/models.js';

type GoalDimension = 'kilos' | 'accounts' | 'invoicing';

export interface ParsedCommercialGoalMonth {
  month: string;
  sourceSheet: string;
  rows: Omit<CommercialGoalRow, 'id'>[];
  dimensions: GoalDimension[];
  warnings: string[];
}

export interface ParsedCommercialGoalsWorkbook {
  fileName: string;
  format: CommercialGoalImportPreview['format'];
  months: ParsedCommercialGoalMonth[];
}

const MONTHS = new Map([
  ['enero', 1], ['febrero', 2], ['marzo', 3], ['abril', 4], ['mayo', 5], ['junio', 6],
  ['julio', 7], ['agosto', 8], ['septiembre', 9], ['setiembre', 9], ['octubre', 10],
  ['noviembre', 11], ['diciembre', 12],
]);

const KNOWN_PRODUCTS = new Map<string, string>([
  ['ct', 'C&T'],
  ['humedos', 'Alimento Húmedo'],
  ['alimentohumedo', 'Alimento Húmedo'],
  ['pedigreeseco', 'Pedigree'],
  ['pedigreedry', 'Pedigree'],
  ['pedigree', 'Pedigree'],
  ['whiskasseco', 'Whiskas'],
  ['whiskasdry', 'Whiskas'],
  ['whiskas', 'Whiskas'],
  ['raza', 'Raza'],
  ['kongo', 'Kongo'],
  ['maintenance', 'Criadores Maintenance'],
  ['criadoresmaintenance', 'Criadores Maintenance'],
  ['voraz', 'Voraz'],
  ['oldprincenovel', 'Old Prince Noveles'],
  ['oldprincenoveles', 'Old Prince Noveles'],
  ['oldprinceequilibrium', 'Old Prince Equilibrium'],
  ['oldprincepremium', 'Old Prince Premium'],
  ['maxpet', 'MaxPet'],
  ['criadoreshp', 'Criadores High Pro'],
  ['criadoreshighpro', 'Criadores High Pro'],
  ['optimum', 'Optimum'],
  ['companyyorigen', 'Company y Origen'],
  ['companyorigen', 'Company y Origen'],
  ['pampa', 'Pampa'],
  ['iams', 'Iams'],
  ['fawna', 'Fawna'],
  ['juvenia', 'Juvenia Nutrition'],
  ['juvenianutrition', 'Juvenia Nutrition'],
]);

const KNOWN_SELLERS = new Map<string, string>([
  ['anaotaviano', 'Ana Ottaviano'],
  ['anaottaviano', 'Ana Ottaviano'],
  ['andresdominguez', 'Andres Dominguez'],
  ['edgardolarrea', 'Edgardo Larrea'],
  ['gonzalorussian', 'Gonzalo Russian'],
  ['ignaciocarea', 'Ignacio Carea'],
  ['julietaerrecart', 'Julieta Errecart'],
  ['lucianopayba', 'Luciano Payba'],
  ['lucianospayba', 'Luciano Payba'],
  ['reventa', 'Reventas'],
  ['reventas', 'Reventas'],
]);

const STRATEGIC_PRODUCTS = new Set(['Fawna', 'Juvenia Nutrition', 'MaxPet', 'Pampa']);
const CORE_EXCLUSIONS = new Set(['Fawna', 'MaxPet', 'Pampa']);

function identity(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, '');
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value && typeof value === 'object' && 'result' in value) return value.result;
  if (value && typeof value === 'object' && 'text' in value) return value.text;
  return value;
}

function optionalNumber(value: unknown) {
  if (value == null || value === '') return null;
  const number = typeof value === 'number'
    ? value
    : Number(String(value).trim().replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function monthKey(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function monthFromValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return monthKey(value.getUTCFullYear(), value.getUTCMonth() + 1);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000);
    return monthKey(date.getUTCFullYear(), date.getUTCMonth() + 1);
  }
  const text = String(value ?? '').trim();
  const iso = /^(\d{4})[-/]([01]?\d)(?:[-/]\d{1,2})?$/.exec(text);
  if (iso) return monthKey(Number(iso[1]), Number(iso[2]));
  const localized = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/.exec(text);
  if (localized) return monthKey(Number(localized[3]) < 100 ? 2000 + Number(localized[3]) : Number(localized[3]), Number(localized[2]));
  return null;
}

function monthFromSheetName(name: string) {
  const normalized = name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').trim();
  const match = /^([a-z]+)\s+(\d{2}|\d{4})$/.exec(normalized);
  if (!match) return null;
  const month = MONTHS.get(match[1]);
  const year = Number(match[2]) < 100 ? 2000 + Number(match[2]) : Number(match[2]);
  return month ? monthKey(year, month) : null;
}

function canonicalProduct(value: unknown) {
  const text = String(value ?? '').trim();
  return KNOWN_PRODUCTS.get(identity(text)) ?? text;
}

function canonicalSeller(value: unknown) {
  const text = String(value ?? '').trim();
  return KNOWN_SELLERS.get(identity(text)) ?? text;
}

function mergeRows(rows: Omit<CommercialGoalRow, 'id'>[]) {
  const grouped = new Map<string, Omit<CommercialGoalRow, 'id'>>();
  for (const row of rows) {
    const key = `${row.month}\u0000${row.product}\u0000${row.seller}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...row });
      continue;
    }
    for (const dimension of ['kilos', 'accounts', 'invoicing'] as const) {
      if (row[dimension] != null) current[dimension] = Number(current[dimension] ?? 0) + row[dimension]!;
    }
  }
  return [...grouped.values()].sort((left, right) => (
    left.product.localeCompare(right.product, 'es') || left.seller.localeCompare(right.seller, 'es')
  ));
}

function dimensionsFor(rows: Omit<CommercialGoalRow, 'id'>[]) {
  return (['kilos', 'accounts', 'invoicing'] as GoalDimension[]).filter((dimension) => rows.some((row) => row[dimension] != null));
}

function normalizedTable(workbook: ExcelJS.Workbook) {
  const byMonth = new Map<string, { rows: Omit<CommercialGoalRow, 'id'>[]; sheet: string; warnings: string[] }>();
  for (const sheet of workbook.worksheets) {
    for (let headerRow = 1; headerRow <= Math.min(20, sheet.rowCount); headerRow += 1) {
      const headers = new Map<string, number>();
      for (let column = 1; column <= Math.min(30, sheet.columnCount); column += 1) {
        const key = identity(cellValue(sheet.getCell(headerRow, column)));
        if (key) headers.set(key, column);
      }
      const monthColumn = headers.get('mes');
      const productColumn = headers.get('producto');
      const sellerColumn = headers.get('vendedor');
      const kilosColumn = headers.get('objetivo');
      const accountsColumn = headers.get('objctas') ?? headers.get('objetivocuentas');
      const invoicingColumn = headers.get('objfact') ?? headers.get('objetivofacturacion');
      if (!monthColumn || !productColumn || !sellerColumn || (!kilosColumn && !accountsColumn && !invoicingColumn)) continue;
      for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const month = monthFromValue(cellValue(sheet.getCell(rowNumber, monthColumn)));
        if (!month) continue;
        const product = canonicalProduct(cellValue(sheet.getCell(rowNumber, productColumn)));
        const seller = canonicalSeller(cellValue(sheet.getCell(rowNumber, sellerColumn)));
        const kilos = product && kilosColumn ? optionalNumber(cellValue(sheet.getCell(rowNumber, kilosColumn))) : null;
        const accounts = product && accountsColumn ? optionalNumber(cellValue(sheet.getCell(rowNumber, accountsColumn))) : null;
        const invoicing = invoicingColumn ? optionalNumber(cellValue(sheet.getCell(rowNumber, invoicingColumn))) : null;
        if (kilos == null && accounts == null && invoicing == null) continue;
        if (!product && invoicing == null) continue;
        if (!seller) continue;
        const current = byMonth.get(month) ?? { rows: [], sheet: sheet.name, warnings: [] };
        current.rows.push({ month, product, seller, kilos, accounts, invoicing });
        byMonth.set(month, current);
      }
      if (byMonth.size) return byMonth;
    }
  }
  return byMonth;
}

function monthlyTemplates(workbook: ExcelJS.Workbook) {
  const byMonth = new Map<string, { rows: Omit<CommercialGoalRow, 'id'>[]; sheet: string; warnings: string[] }>();
  for (const sheet of workbook.worksheets) {
    const month = monthFromSheetName(sheet.name);
    if (!month) continue;
    const rows: Omit<CommercialGoalRow, 'id'>[] = [];
    const warnings: string[] = [];
    for (let rowNumber = 1; rowNumber < sheet.rowCount; rowNumber += 1) {
      const title = String(cellValue(sheet.getCell(rowNumber, 1)) ?? '').trim();
      const nextLabel = identity(cellValue(sheet.getCell(rowNumber + 1, 1)));
      const nextMetric = identity(cellValue(sheet.getCell(rowNumber + 1, 2)));
      if (!title || nextLabel !== 'vendedor' || !nextMetric.includes('objetivo')) continue;
      const product = KNOWN_PRODUCTS.get(identity(title));
      if (!product) {
        warnings.push(`No se reconoció el bloque “${title}” de la hoja ${sheet.name}.`);
        continue;
      }
      for (let detailRow = rowNumber + 2; detailRow <= sheet.rowCount; detailRow += 1) {
        const sellerLabel = String(cellValue(sheet.getCell(detailRow, 1)) ?? '').trim();
        if (!sellerLabel || identity(sellerLabel) === 'total') break;
        const seller = KNOWN_SELLERS.get(identity(sellerLabel));
        if (!seller) {
          warnings.push(`No se reconoció el vendedor “${sellerLabel}” en ${title}.`);
          continue;
        }
        const kilos = optionalNumber(cellValue(sheet.getCell(detailRow, 2)));
        const accounts = optionalNumber(cellValue(sheet.getCell(detailRow, 6)));
        if (kilos == null && accounts == null) continue;
        rows.push({ month, product, seller, kilos, accounts, invoicing: null });
      }
    }
    if (rows.length) byMonth.set(month, { rows, sheet: sheet.name, warnings: [...new Set(warnings)] });
  }
  return byMonth;
}

export async function parseCommercialGoalsWorkbook(buffer: Buffer, fileName: string): Promise<ParsedCommercialGoalsWorkbook> {
  if (!buffer.length) throw new Error('El archivo está vacío.');
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new Error('No se pudo abrir el Excel. Verificá que sea un archivo .xlsx válido.');
  }
  const normalized = normalizedTable(workbook);
  const format = normalized.size ? 'normalized_table' : 'monthly_template';
  const source = normalized.size ? normalized : monthlyTemplates(workbook);
  if (!source.size) {
    throw new Error('No se encontraron objetivos. Usá la tabla “Power BI” o una hoja mensual con bloques por producto y vendedor.');
  }
  return {
    fileName,
    format,
    months: [...source.entries()].map(([month, value]) => {
      const rows = mergeRows(value.rows);
      return { month, sourceSheet: value.sheet, rows, dimensions: dimensionsFor(rows), warnings: value.warnings };
    }).sort((left, right) => right.month.localeCompare(left.month)),
  };
}

export function commercialGoalsImportPreview(parsed: ParsedCommercialGoalsWorkbook): CommercialGoalImportPreview {
  return {
    fileName: parsed.fileName,
    format: parsed.format,
    months: parsed.months.map((item) => ({
      month: item.month,
      sourceSheet: item.sourceSheet,
      rows: item.rows.length,
      dimensions: item.dimensions,
      totals: {
        coreKilos: item.rows.filter((row) => row.kilos != null && !CORE_EXCLUSIONS.has(row.product)).reduce((sum, row) => sum + Number(row.kilos), 0),
        strategicKilos: item.rows.filter((row) => row.kilos != null && STRATEGIC_PRODUCTS.has(row.product)).reduce((sum, row) => sum + Number(row.kilos), 0),
        accounts: item.rows.reduce((sum, row) => sum + Number(row.accounts ?? 0), 0),
        invoicing: item.rows.reduce((sum, row) => sum + Number(row.invoicing ?? 0), 0),
      },
      warnings: item.warnings,
    })),
  };
}
