import type { Response } from 'express';
import ExcelJS from 'exceljs';
import type {
  BairesMetrics,
  MarsMetrics,
  NonBuyerEntityRow,
  NutriPetMetrics,
  SptPeriodMetrics,
} from '../shared/models.js';
import { decodeMultiFilter } from '../shared/multi-filter.js';
import { buildBairesReport, getBairesReportMeta } from './baires-report.js';
import { buildMarsReport, getMarsReportMeta } from './mars-report.js';
import { buildNonBuyerReport, getNonBuyerReportMeta } from './non-buyers-report.js';
import { buildNutriPetReport, getNutriPetReportMeta } from './nutripet-report.js';
import { buildSptReport, getSptReportMeta } from './spt-report.js';

export type ReportExportId = 'spt' | 'mars' | 'nutripet' | 'baires' | 'non-buyers';

interface ExportMetadata {
  title: string;
  filters: Record<string, unknown>;
  universe: string;
  period: string;
  cutoff: string;
  source: string;
  warnings: string[];
}

interface ExportColumn {
  header: string;
  key: string;
  width?: number;
  numFmt?: string;
  dataType?: 'date' | 'percent';
}

export interface ReportExportWorkbook {
  workbook: ExcelJS.Workbook;
  filename: string;
  detailRows: number;
}

const INTEGER = '#,##0';
const DECIMAL = '#,##0.00';
const KILOS = '#,##0.000';
const MONEY = '$ #,##0.00;[Red]-$ #,##0.00';
const PERCENT = '0.00%';
const DATE = 'dd/mm/yyyy';
const SOURCE_NOTE = 'API GESI y bases analíticas propias. Power BI se usa sólo como referencia funcional y no participa de la exportación.';

const FILTER_LABELS: Record<string, string> = {
  month: 'Mes',
  year: 'Año',
  period: 'Período',
  page: 'Vista',
  clientMode: 'Unidad de clientes',
  seller: 'Vendedor',
  brand: 'Marca',
  productGroup: 'Grupo de artículos',
  channel: 'Canal',
  product: 'Producto',
  client: 'Cliente',
  line: 'Línea',
  category: 'Rubro',
  subcategory: 'Subrubro',
  subcategoryGroup: 'Subrubro',
  clientType: 'Tipo de cliente',
  grouping: 'Agrupación',
  locality: 'Localidad',
  branch: 'Sucursal',
  channelGroup: 'Canal de venta',
  segment: 'Segmento',
  view: 'Vista exportada',
  statusMode: 'Estado de compra',
  query: 'Búsqueda',
};

function safeFilePart(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'salice';
}

function filterValue(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const decoded = decodeMultiFilter(text);
  return decoded.length > 1 ? decoded.join(' | ') : decoded[0] ?? text;
}

function filtersLabel(filters: Record<string, unknown>) {
  const values = Object.entries(filters)
    .map(([key, value]) => [FILTER_LABELS[key] ?? key, filterValue(value)] as const)
    .filter(([, value]) => value);
  return values.length ? values.map(([key, value]) => `${key}: ${value}`).join(' · ') : 'Sin filtros adicionales';
}

function generatedLabel(date: Date) {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(date);
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF214F3F' } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 28;
}

function addMetadata(workbook: ExcelJS.Workbook, metadata: ExportMetadata) {
  const sheet = workbook.addWorksheet('Metadatos', { views: [{ state: 'frozen', ySplit: 1, showGridLines: true }] });
  sheet.columns = [{ width: 26 }, { width: 92 }];
  const title = sheet.addRow([metadata.title]);
  title.font = { size: 16, bold: true, color: { argb: 'FF214F3F' } };
  const now = new Date();
  const rows: Array<[string, string]> = [
    ['Momento de generación', `${generatedLabel(now)} · ${now.toISOString()}`],
    ['Período', metadata.period],
    ['Fecha de corte', metadata.cutoff],
    ['Universo', metadata.universe],
    ['Filtros aplicados', filtersLabel(metadata.filters)],
    ['Fuente', metadata.source],
    ['Advertencias', metadata.warnings.length ? metadata.warnings.join('\n') : 'Sin advertencias adicionales.'],
  ];
  rows.forEach((values) => sheet.addRow(values));
  sheet.getColumn(1).font = { bold: true, color: { argb: 'FF315348' } };
  sheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
  sheet.getRow(8).height = Math.max(24, metadata.warnings.length * 18);
}

function addTable<T extends object>(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: ExportColumn[],
  rows: T[],
) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, showGridLines: true }] });
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? Math.max(column.header.length + 2, column.numFmt === MONEY ? 22 : column.numFmt === KILOS ? 18 : column.numFmt ? 16 : 14),
    style: column.numFmt ? { numFmt: column.numFmt, alignment: { horizontal: 'right' as const } } : undefined,
  }));
  styleHeader(sheet.getRow(1));
  rows.forEach((row) => {
    const values = { ...row } as Record<string, unknown>;
    columns.forEach((column) => {
      const value = values[column.key];
      if (column.dataType === 'percent' && typeof value === 'number') values[column.key] = value / 100;
      if (column.dataType === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        values[column.key] = new Date(`${value.slice(0, 10)}T12:00:00Z`);
      }
    });
    sheet.addRow(values);
  });
  if (columns.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return sheet;
}

function metricRows(values: Array<{ period: string; metrics: SptPeriodMetrics | MarsMetrics | NutriPetMetrics | BairesMetrics }>) {
  return values.map(({ period, metrics }) => ({ period, ...metrics }));
}

function sourceWarnings(unavailableDocuments: number, extra: string[] = []) {
  return [
    ...(unavailableDocuments ? [`GESI no entregó el detalle de ${unavailableDocuments} comprobantes; no se completaron artificialmente.`] : []),
    ...extra,
  ];
}

function sptWorkbook(input: Partial<Record<string, unknown>>): ReportExportWorkbook {
  const report = buildSptReport(input);
  const meta = getSptReportMeta();
  if (!report) throw new Error('La base SPT no está disponible.');
  const workbook = new ExcelJS.Workbook();
  addMetadata(workbook, {
    title: 'Reporte SPT · exportación integral',
    filters: { ...report.filters, page: report.page },
    universe: `Empresas ${meta.defaultUniverse.companies.join('/')} · universo SPT conciliado · vista ${report.page}`,
    period: `${report.selectedMonth}-01 → ${report.selectedMonth}-${String(report.cutoffDay).padStart(2, '0')}`,
    cutoff: report.sourceMaxDate,
    source: `${meta.sourceSystem}. ${SOURCE_NOTE}`,
    warnings: sourceWarnings(meta.unavailableDocumentCount, meta.coverageFrom > `${Number(report.selectedMonth.slice(0, 4)) - 1}-01-01`
      ? [`La cobertura histórica comienza el ${meta.coverageFrom}; algunas comparaciones previas pueden quedar fuera de cobertura.`]
      : []),
  });
  addTable(workbook, 'Resumen', [
    { header: 'Período', key: 'period', width: 28 },
    { header: 'Kilos', key: 'kilos', numFmt: KILOS }, { header: 'Unidades', key: 'units', numFmt: DECIMAL },
    { header: 'Venta neta', key: 'netAmount', numFmt: MONEY }, { header: 'Clientes', key: 'clients', numFmt: INTEGER },
  ], metricRows([
    { period: 'Mes seleccionado', metrics: report.current },
    { period: 'Mes anterior comparable', metrics: report.previousMonth },
    { period: 'Año anterior comparable', metrics: report.previousYear },
    { period: 'Acumulado anual', metrics: report.ytd },
    { period: 'Acumulado anual anterior', metrics: report.previousYtd },
  ]));
  addTable(workbook, 'Detalle diario', [
    { header: 'Día', key: 'day', numFmt: INTEGER }, { header: 'Actual kg', key: 'current', numFmt: KILOS },
    { header: 'Mes anterior kg', key: 'previousMonth', numFmt: KILOS }, { header: 'Año anterior kg', key: 'previousYear', numFmt: KILOS },
  ], report.daily);
  addTable(workbook, 'Historia mensual', [
    { header: 'Mes', key: 'month' }, { header: 'Kilos', key: 'kilos', numFmt: KILOS },
    { header: 'Unidades', key: 'units', numFmt: DECIMAL }, { header: 'Venta neta', key: 'netAmount', numFmt: MONEY },
    { header: 'Clientes', key: 'clients', numFmt: INTEGER },
  ], report.monthly);
  const breakdownColumns: ExportColumn[] = [
    { header: 'Nombre', key: 'label', width: 32 }, { header: 'Kilos', key: 'kilos', numFmt: KILOS },
    { header: 'Unidades', key: 'units', numFmt: DECIMAL }, { header: 'Venta neta', key: 'netAmount', numFmt: MONEY },
    { header: 'Clientes', key: 'clients', numFmt: INTEGER },
  ];
  addTable(workbook, 'Vendedores', breakdownColumns, report.sellers);
  addTable(workbook, 'Grupos de producto', breakdownColumns, report.productGroups);
  addTable(workbook, 'Trimestres', [
    { header: 'Trimestre', key: 'quarter', numFmt: INTEGER }, { header: 'Actual kg', key: 'current', numFmt: KILOS },
    { header: 'Año anterior kg', key: 'previousYear', numFmt: KILOS },
  ], report.quarters);
  return { workbook, filename: `reporte-spt-${report.selectedMonth}.xlsx`, detailRows: report.daily.length + report.monthly.length + report.sellers.length + report.productGroups.length + report.quarters.length };
}

function marsWorkbook(input: Partial<Record<string, unknown>>): ReportExportWorkbook {
  const report = buildMarsReport(input);
  const meta = getMarsReportMeta();
  if (!report) throw new Error('La base Mars no está disponible.');
  const workbook = new ExcelJS.Workbook();
  addMetadata(workbook, {
    title: 'Reporte Mars · exportación integral',
    filters: report.filters,
    universe: 'Empresa 3 / sucursal 3 · grupo Pet Nutrition',
    period: `${report.selected.start} → ${report.isPartial ? report.sourceMaxDate : report.selected.end}`,
    cutoff: report.sourceMaxDate,
    source: `${meta.sourceSystem}. ${SOURCE_NOTE}`,
    warnings: sourceWarnings(meta.unavailableDocumentCount, meta.clientTypeCatalogSource !== 'gesi_api'
      ? ['Los tipos de cliente provienen de un catálogo de referencia validado porque GESI no entrega un maestro utilizable.']
      : []),
  });
  addTable(workbook, 'Resumen', [
    { header: 'Lectura', key: 'period', width: 28 }, { header: 'Kilos', key: 'kilos', numFmt: KILOS },
    { header: 'Clientes', key: 'clients', numFmt: INTEGER }, { header: 'Cuentas', key: 'accounts', numFmt: INTEGER },
    { header: 'Sucursales cliente', key: 'clientBranches', numFmt: INTEGER },
  ], metricRows([
    { period: 'Período seleccionado', metrics: report.current },
    { period: 'Período anterior', metrics: report.previousPeriod },
    { period: 'Año anterior', metrics: report.previousYear },
    { period: 'YTD', metrics: report.ytd },
    { period: 'YTD año anterior', metrics: report.previousYtd },
  ]));
  addTable(workbook, 'Períodos', [
    { header: 'Período', key: 'label' }, { header: 'Trimestre', key: 'quarter' }, { header: 'Desde', key: 'start', width: 15, numFmt: DATE, dataType: 'date' }, { header: 'Hasta', key: 'end', width: 15, numFmt: DATE, dataType: 'date' },
    { header: 'Parcial', key: 'isPartial' }, { header: 'Kilos', key: 'kilos', numFmt: KILOS }, { header: 'Clientes', key: 'clients', numFmt: INTEGER },
    { header: 'Cuentas', key: 'accounts', numFmt: INTEGER }, { header: 'Sucursales cliente', key: 'clientBranches', numFmt: INTEGER },
    { header: 'Año anterior kg', key: 'previousYearKilos', numFmt: KILOS }, { header: 'Período anterior kg', key: 'previousPeriodKilos', numFmt: KILOS },
    { header: 'YTD kg', key: 'ytdKilos', numFmt: KILOS }, { header: 'YTD anterior kg', key: 'previousYtdKilos', numFmt: KILOS },
    { header: 'YTD vs LY %', key: 'ytdVsPreviousYear', numFmt: PERCENT, dataType: 'percent' }, { header: 'Vs LY %', key: 'vsPreviousYear', numFmt: PERCENT, dataType: 'percent' },
    { header: 'Vs período anterior %', key: 'vsPreviousPeriod', numFmt: PERCENT, dataType: 'percent' },
  ], report.periods);
  addTable(workbook, 'Trimestres', [
    { header: 'Trimestre', key: 'label' },
    { header: 'Desde', key: 'start', width: 15, numFmt: DATE, dataType: 'date' }, { header: 'Hasta', key: 'end', width: 15, numFmt: DATE, dataType: 'date' },
    { header: 'Tramo parcial', key: 'isPartial' }, { header: 'Comparación disponible', key: 'comparisonAvailable' },
    { header: 'Kilos', key: 'kilos', numFmt: KILOS }, { header: 'Venta neta', key: 'netAmount', numFmt: MONEY },
    { header: 'Clientes', key: 'clients', numFmt: INTEGER }, { header: 'Mismo tramo año anterior kg', key: 'previousYearKilos', numFmt: KILOS },
    { header: 'Mismo tramo año anterior $', key: 'previousYearNetAmount', numFmt: MONEY }, { header: 'Variación interanual %', key: 'variation', numFmt: PERCENT, dataType: 'percent' },
  ], report.quarters);
  addTable(workbook, 'Marcas', [
    { header: 'Marca', key: 'brand', width: 28 }, { header: 'Kilos', key: 'kilos', numFmt: KILOS },
    { header: 'Clientes', key: 'clients', numFmt: INTEGER }, { header: 'Cuentas', key: 'accounts', numFmt: INTEGER },
    { header: 'Sucursales cliente', key: 'clientBranches', numFmt: INTEGER }, { header: 'Participación %', key: 'share', numFmt: PERCENT, dataType: 'percent' },
    { header: 'Año anterior kg', key: 'previousYearKilos', numFmt: KILOS }, { header: 'Variación %', key: 'variation', numFmt: PERCENT, dataType: 'percent' },
  ], report.brands);
  return { workbook, filename: `reporte-mars-${report.filters.year}-${report.filters.period}.xlsx`, detailRows: report.periods.length + report.quarters.length + report.brands.length };
}

function nutripetWorkbook(input: Partial<Record<string, unknown>>): ReportExportWorkbook {
  const report = buildNutriPetReport(input);
  const meta = getNutriPetReportMeta();
  if (!report) throw new Error('La base NutriPet no está disponible.');
  const workbook = new ExcelJS.Workbook();
  addMetadata(workbook, {
    title: 'Reporte NutriPet · exportación integral',
    filters: report.filters,
    universe: 'Empresa 3 / sucursal 3 · grupo Nutri Pet',
    period: `${report.periodStart} → ${report.periodEnd}`,
    cutoff: report.sourceMaxDate,
    source: `${meta.sourceSystem}. ${SOURCE_NOTE}`,
    warnings: sourceWarnings(meta.unavailableDocumentCount),
  });
  addTable(workbook, 'Resumen', [
    { header: 'Lectura', key: 'period', width: 28 }, { header: 'Kilos', key: 'kilos', numFmt: KILOS },
    { header: 'Clientes', key: 'clients', numFmt: INTEGER }, { header: 'Unidades', key: 'units', numFmt: DECIMAL },
    { header: 'Venta neta', key: 'netAmount', numFmt: MONEY },
  ], metricRows([
    { period: 'Mes seleccionado', metrics: report.current },
    { period: 'Mes anterior comparable', metrics: report.previousMonth },
    { period: 'Año anterior comparable', metrics: report.previousYear },
    { period: 'YTD', metrics: report.ytd },
    { period: 'YTD año anterior', metrics: report.previousYtd },
  ]));
  const timeColumns: ExportColumn[] = [
    { header: 'Período', key: 'month' }, { header: 'Parcial', key: 'isPartial' }, { header: 'Kilos', key: 'kilos', numFmt: KILOS },
    { header: 'Clientes', key: 'clients', numFmt: INTEGER }, { header: 'Unidades', key: 'units', numFmt: DECIMAL },
    { header: 'Venta neta', key: 'netAmount', numFmt: MONEY }, { header: 'Mes anterior kg', key: 'previousMonthKilos', numFmt: KILOS },
    { header: 'Año anterior kg', key: 'previousYearKilos', numFmt: KILOS }, { header: 'YTD kg', key: 'ytdKilos', numFmt: KILOS },
    { header: 'YTD anterior kg', key: 'previousYtdKilos', numFmt: KILOS }, { header: 'Vs mes anterior %', key: 'vsPreviousMonth', numFmt: PERCENT, dataType: 'percent' },
    { header: 'Vs LY %', key: 'vsPreviousYear', numFmt: PERCENT, dataType: 'percent' }, { header: 'YTD vs LY %', key: 'ytdVsPreviousYear', numFmt: PERCENT, dataType: 'percent' },
  ];
  addTable(workbook, 'Historia mensual', timeColumns, report.monthly);
  addTable(workbook, 'Trimestres', [
    { header: 'Trimestre', key: 'label' }, { header: 'Desde', key: 'start', width: 15, numFmt: DATE, dataType: 'date' }, { header: 'Hasta', key: 'end', width: 15, numFmt: DATE, dataType: 'date' },
    { header: 'Tramo parcial', key: 'isPartial' }, { header: 'Comparación disponible', key: 'comparisonAvailable' }, { header: 'Kilos', key: 'kilos', numFmt: KILOS },
    { header: 'Clientes', key: 'clients', numFmt: INTEGER }, { header: 'Unidades', key: 'units', numFmt: DECIMAL },
    { header: 'Venta neta', key: 'netAmount', numFmt: MONEY }, { header: 'Mismo tramo año anterior kg', key: 'previousYearKilos', numFmt: KILOS },
    { header: 'Mismo tramo año anterior $', key: 'previousYearNetAmount', numFmt: MONEY }, { header: 'Variación interanual %', key: 'variation', numFmt: PERCENT, dataType: 'percent' },
  ], report.quarters);
  addTable(workbook, 'Marcas', [
    { header: 'Marca', key: 'brand', width: 28 }, { header: 'Kilos', key: 'kilos', numFmt: KILOS },
    { header: 'Clientes', key: 'clients', numFmt: INTEGER }, { header: 'Unidades', key: 'units', numFmt: DECIMAL },
    { header: 'Venta neta', key: 'netAmount', numFmt: MONEY }, { header: 'Participación %', key: 'share', numFmt: PERCENT, dataType: 'percent' },
    { header: 'Año anterior kg', key: 'previousYearKilos', numFmt: KILOS }, { header: 'Variación %', key: 'variation', numFmt: PERCENT, dataType: 'percent' },
  ], report.brands);
  addTable(workbook, 'Productos', [
    { header: 'Producto ID', key: 'productId', width: 16 }, { header: 'Producto', key: 'product', width: 46 }, { header: 'Marca', key: 'brand', width: 26 },
    { header: 'Kilos', key: 'kilos', numFmt: KILOS }, { header: 'Clientes', key: 'clients', numFmt: INTEGER },
    { header: 'Unidades', key: 'units', numFmt: DECIMAL }, { header: 'Venta neta', key: 'netAmount', numFmt: MONEY },
    { header: 'Participación %', key: 'share', numFmt: PERCENT, dataType: 'percent' },
  ], report.products);
  return { workbook, filename: `reporte-nutripet-${report.selectedMonth}.xlsx`, detailRows: report.monthly.length + report.quarters.length + report.brands.length + report.products.length };
}

function bairesWorkbook(input: Partial<Record<string, unknown>>): ReportExportWorkbook {
  const report = buildBairesReport(input);
  const meta = getBairesReportMeta();
  if (!report) throw new Error('La base Baires no está disponible.');
  const workbook = new ExcelJS.Workbook();
  addMetadata(workbook, {
    title: 'Reporte Baires · exportación integral',
    filters: report.filters,
    universe: 'Empresa 3 / sucursal 3 · grupos Baires SPT y Baires Masivo',
    period: `${report.periodStart} → ${report.periodEnd}`,
    cutoff: report.sourceMaxDate,
    source: `${meta.sourceSystem}. ${SOURCE_NOTE}`,
    warnings: sourceWarnings(meta.unavailableDocumentCount),
  });
  addTable(workbook, 'Resumen', [
    { header: 'Lectura', key: 'period', width: 28 }, { header: 'Kilos', key: 'kilos', numFmt: KILOS },
    { header: 'Clientes', key: 'clients', numFmt: INTEGER }, { header: 'Unidades', key: 'units', numFmt: DECIMAL },
    { header: 'Venta neta', key: 'netAmount', numFmt: MONEY },
  ], metricRows([
    { period: 'Mes seleccionado', metrics: report.current },
    { period: 'Mes anterior comparable', metrics: report.previousMonth },
    { period: 'Año anterior comparable', metrics: report.previousYear },
    { period: 'YTD', metrics: report.ytd },
    { period: 'YTD año anterior', metrics: report.previousYtd },
  ]));
  addTable(workbook, 'Historia mensual', [
    { header: 'Mes', key: 'month' }, { header: 'Parcial', key: 'isPartial' }, { header: 'Kilos', key: 'kilos', numFmt: KILOS },
    { header: 'Clientes', key: 'clients', numFmt: INTEGER }, { header: 'Unidades', key: 'units', numFmt: DECIMAL },
    { header: 'Venta neta', key: 'netAmount', numFmt: MONEY }, { header: 'Mes anterior kg', key: 'previousMonthKilos', numFmt: KILOS },
    { header: 'Año anterior kg', key: 'previousYearKilos', numFmt: KILOS }, { header: 'YTD kg', key: 'ytdKilos', numFmt: KILOS },
    { header: 'YTD anterior kg', key: 'previousYtdKilos', numFmt: KILOS }, { header: 'Vs mes anterior %', key: 'vsPreviousMonth', numFmt: PERCENT, dataType: 'percent' },
    { header: 'Vs LY %', key: 'vsPreviousYear', numFmt: PERCENT, dataType: 'percent' }, { header: 'YTD vs LY %', key: 'ytdVsPreviousYear', numFmt: PERCENT, dataType: 'percent' },
  ], report.monthly);
  addTable(workbook, 'Trimestres', [
    { header: 'Trimestre', key: 'label' }, { header: 'Desde', key: 'start', width: 15, numFmt: DATE, dataType: 'date' }, { header: 'Hasta', key: 'end', width: 15, numFmt: DATE, dataType: 'date' },
    { header: 'Tramo parcial', key: 'isPartial' }, { header: 'Comparación disponible', key: 'comparisonAvailable' }, { header: 'Kilos', key: 'kilos', numFmt: KILOS },
    { header: 'Clientes', key: 'clients', numFmt: INTEGER }, { header: 'Unidades', key: 'units', numFmt: DECIMAL },
    { header: 'Venta neta', key: 'netAmount', numFmt: MONEY }, { header: 'Mismo tramo año anterior kg', key: 'previousYearKilos', numFmt: KILOS },
    { header: 'Mismo tramo año anterior $', key: 'previousYearNetAmount', numFmt: MONEY }, { header: 'Variación interanual %', key: 'variation', numFmt: PERCENT, dataType: 'percent' },
  ], report.quarters);
  const breakdownColumns: ExportColumn[] = [
    { header: 'Nombre', key: 'name', width: 30 }, { header: 'Kilos', key: 'kilos', numFmt: KILOS },
    { header: 'Clientes', key: 'clients', numFmt: INTEGER }, { header: 'Unidades', key: 'units', numFmt: DECIMAL },
    { header: 'Venta neta', key: 'netAmount', numFmt: MONEY }, { header: 'Participación %', key: 'share', numFmt: PERCENT, dataType: 'percent' },
    { header: 'Año anterior kg', key: 'previousYearKilos', numFmt: KILOS }, { header: 'Variación %', key: 'variation', numFmt: PERCENT, dataType: 'percent' },
  ];
  addTable(workbook, 'Marcas', breakdownColumns, report.brands);
  addTable(workbook, 'Subrubros', breakdownColumns, report.subcategories);
  return { workbook, filename: `reporte-baires-${report.selectedMonth}.xlsx`, detailRows: report.monthly.length + report.quarters.length + report.brands.length + report.subcategories.length };
}

function matchesNonBuyerView(row: NonBuyerEntityRow, statusMode: string, query: string) {
  const statuses = decodeMultiFilter(statusMode);
  const status = row.isNonBuyer30 ? 'non-buyers' : 'buyers';
  if (statuses.length && !statuses.includes(status)) return false;
  const normalized = query.trim().toLocaleLowerCase('es');
  return !normalized || `${row.id} ${row.name} ${row.seller}`.toLocaleLowerCase('es').includes(normalized);
}

function nonBuyersWorkbook(input: Partial<Record<string, unknown>>): ReportExportWorkbook {
  const report = buildNonBuyerReport(input);
  const meta = getNonBuyerReportMeta();
  if (!report) throw new Error('La base de cuentas no compradoras no está disponible.');
  const view = input.view === 'brands' ? 'brands' : 'accounts';
  const statusMode = String(input.statusMode ?? '');
  const query = String(input.query ?? '').trim().slice(0, 200);
  const rows = (view === 'brands' ? report.brands : report.accounts).filter((row) => matchesNonBuyerView(row, statusMode, query));
  const sellers = view === 'brands' ? report.brandSellers : report.accountSellers;
  const summary = view === 'brands' ? report.brandsSummary : report.accountsSummary;
  const workbook = new ExcelJS.Workbook();
  addMetadata(workbook, {
    title: `Cuentas no compradoras · ${view === 'brands' ? 'marcas' : 'cuentas'}`,
    filters: { ...report.filters, view: view === 'brands' ? 'Marcas' : 'Cuentas', statusMode, query },
    universe: `Clientes activos · empresa 3 / sucursal 3 · ${view === 'brands' ? 'marcas elegibles' : 'cuentas elegibles'}`,
    period: `${report.windows.from180} → ${report.windows.through} · ventanas móviles 30/90/180 días`,
    cutoff: report.sourceMaxDate,
    source: `${meta.sourceSystem}. ${SOURCE_NOTE}`,
    warnings: sourceWarnings(meta.unavailableDocumentCount, [meta.agreementsNote]),
  });
  addTable(workbook, 'Resumen', [
    { header: 'Universo 180d', key: 'universe180', numFmt: INTEGER }, { header: 'Universo comprador 90d', key: 'universe90', numFmt: INTEGER },
    { header: 'Compraron 30d', key: 'buyers30', numFmt: INTEGER }, { header: 'Sin compra 30d', key: 'nonBuyers30', numFmt: INTEGER },
    { header: 'Tasa sin compra %', key: 'rate', numFmt: PERCENT, dataType: 'percent' }, { header: 'Filas exportadas', key: 'exportedRows', numFmt: INTEGER },
  ], [{ ...summary, exportedRows: rows.length }]);
  addTable(workbook, view === 'brands' ? 'Marcas' : 'Cuentas', [
    { header: 'ID', key: 'id', width: 16 }, { header: view === 'brands' ? 'Marca' : 'Cuenta', key: 'name', width: 42 },
    { header: 'Vendedor', key: 'seller', width: 24 }, { header: 'Estado', key: 'purchaseStatus', width: 18 },
    { header: 'Última compra', key: 'lastPurchaseDate', width: 15, numFmt: DATE, dataType: 'date' }, { header: 'Días sin compra', key: 'daysSinceLastPurchase', numFmt: INTEGER },
    { header: 'Promedio kg 3 meses', key: 'averageKilos3Months', numFmt: KILOS },
    { header: 'Promedio venta 3 meses', key: 'averageSales3Months', numFmt: MONEY },
    { header: 'Venta neta 180d', key: 'net180', numFmt: MONEY }, { header: 'Venta neta 90d', key: 'net90', numFmt: MONEY },
    { header: 'Venta neta 30d', key: 'net30', numFmt: MONEY },
  ], rows.map((row) => ({ ...row, purchaseStatus: row.isNonBuyer30 ? 'Sin compra 30d' : 'Compró en 30d' })));
  addTable(workbook, 'Vendedores', [
    { header: 'Vendedor', key: 'seller', width: 28 }, { header: 'Universo 90d', key: 'universe90', numFmt: INTEGER },
    { header: 'Sin compra 30d', key: 'nonBuyers30', numFmt: INTEGER }, { header: 'Tasa %', key: 'rate', numFmt: PERCENT, dataType: 'percent' },
  ], sellers);
  return { workbook, filename: `cuentas-no-compradoras-${view === 'brands' ? 'marcas' : 'cuentas'}-${report.sourceMaxDate}.xlsx`, detailRows: rows.length };
}

export function createReportExportWorkbook(id: ReportExportId, input: Partial<Record<string, unknown>>): ReportExportWorkbook {
  if (id === 'spt') return sptWorkbook(input);
  if (id === 'mars') return marsWorkbook(input);
  if (id === 'nutripet') return nutripetWorkbook(input);
  if (id === 'baires') return bairesWorkbook(input);
  return nonBuyersWorkbook(input);
}

export async function exportReportXlsx(response: Response, id: ReportExportId, input: Partial<Record<string, unknown>>) {
  const result = createReportExportWorkbook(id, input);
  result.workbook.creator = 'Salice Inteligente';
  result.workbook.created = new Date();
  response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  response.setHeader('Content-Disposition', `attachment; filename="${safeFilePart(result.filename.replace(/\.xlsx$/i, ''))}.xlsx"`);
  response.setHeader('Cache-Control', 'no-store');
  await result.workbook.xlsx.write(response);
  response.end();
}
