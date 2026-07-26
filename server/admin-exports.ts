import type { Response } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { resolve } from 'node:path';
import type { CommercialGoalsPayload, InvoiceDetailPayload, ReceivableDashboardPayload } from '../shared/models.js';
import { buildGeneralReport } from './general-report.js';
import { getCommercialGoalsPayload } from './operational-store.js';
import { buildReceivablesDashboard } from './receivables-dashboard.js';
import { forEachSalesExportRow, getSalesExplorerMeta, normalizeSalesExplorerFilters } from './sales-explorer.js';

const SALICE_LOGO_PATH = resolve(process.cwd(), 'public/salice-logo.png');

function safeFilePart(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'salice';
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow(values: unknown[]) {
  return `${values.map(csvCell).join(',')}\r\n`;
}

function filtersLabel(filters: object) {
  return Object.entries(filters).filter(([, value]) => value).map(([key, value]) => `${key}=${value}`).join(' · ') || 'Sin filtros adicionales';
}

const EXPORT_SOURCE = 'API GESI y bases analíticas propias; Power BI no participa de la exportación';

interface ExportMetadata {
  title: string;
  period: string;
  cutoff: string;
  universe: string;
  filters: object;
  source?: string;
  warnings?: string[];
}

function metadataCsv(metadata: ExportMetadata, generatedAt = new Date().toISOString()) {
  return [
    ['Título', metadata.title],
    ['Generado', generatedAt],
    ['Período', metadata.period],
    ['Corte operativo', metadata.cutoff],
    ['Universo', metadata.universe],
    ['Filtros', filtersLabel(metadata.filters)],
    ['Fuente', metadata.source ?? EXPORT_SOURCE],
    ['Advertencias', metadata.warnings?.join(' · ') || 'Sin advertencias adicionales'],
  ];
}

function setDownloadHeaders(response: Response, contentType: string, filename: string) {
  const extension = filename.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? '';
  const basename = extension ? filename.slice(0, -extension.length) : filename;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Disposition', `attachment; filename="${safeFilePart(basename)}${extension}"`);
  response.setHeader('Cache-Control', 'no-store');
}

export function exportSalesCsv(response: Response, input: Partial<Record<string, unknown>>) {
  const meta = getSalesExplorerMeta();
  const filters = normalizeSalesExplorerFilters(input, meta);
  setDownloadHeaders(response, 'text/csv; charset=utf-8', `ventas-salice-${filters.from}-${filters.to}.csv`);
  response.write('\ufeff');
  metadataCsv({
    title: 'Explorador general de ventas',
    period: `${filters.from} → ${filters.to}`,
    cutoff: meta.maxDate,
    universe: 'Ventas Comercial · empresa 3 · sucursales 3/6 · emisores publicados',
    filters,
    warnings: meta.unavailableDocumentCount ? [`${meta.unavailableDocumentCount} comprobantes sin detalle no se completaron artificialmente.`] : [],
  }).forEach((row) => response.write(csvRow(row)));
  response.write('\r\n');
  response.write(csvRow(['Fecha', 'Comprobante', 'Tipo', 'Vendedor', 'Cliente ID', 'Cliente', 'Producto ID', 'Producto', 'Marca', 'Rubro', 'Canal', 'Zona', 'Kilos', 'Unidades', 'Venta neta']));
  forEachSalesExportRow(input, (row) => response.write(csvRow([
    row.date, row.document, row.documentType === 'credit_note' ? 'Nota de crédito' : 'Factura', row.seller,
    row.clientId, row.client, row.productId, row.product, row.brand, row.category, row.channel, row.zone,
    row.kilos, row.units, row.netAmount,
  ])));
  response.end();
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF214F3F' } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 28;
}

function addMetadataSheet(workbook: ExcelJS.stream.xlsx.WorkbookWriter, metadata: ExportMetadata) {
  const sheet = workbook.addWorksheet('Metadatos', { views: [{ state: 'frozen', ySplit: 1, showGridLines: true }] });
  sheet.columns = [{ width: 26 }, { width: 92 }];
  const titleRow = sheet.addRow([metadata.title]);
  titleRow.font = { size: 16, bold: true, color: { argb: 'FF214F3F' } };
  titleRow.commit();
  for (const values of metadataCsv(metadata)) {
    const row = sheet.addRow(values);
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    row.commit();
  }
  sheet.commit();
}

function excelDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return value ?? '';
  return new Date(`${value.slice(0, 10)}T12:00:00Z`);
}

export async function exportSalesXlsx(response: Response, input: Partial<Record<string, unknown>>) {
  const meta = getSalesExplorerMeta();
  const filters = normalizeSalesExplorerFilters(input, meta);
  setDownloadHeaders(response, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `ventas-salice-${filters.from}-${filters.to}.xlsx`);
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: response, useStyles: true, useSharedStrings: true });
  workbook.creator = 'Salice Inteligente';
  workbook.created = new Date();
  addMetadataSheet(workbook, {
    title: 'Explorador general de ventas',
    period: `${filters.from} → ${filters.to}`,
    cutoff: meta.maxDate,
    universe: 'Ventas Comercial · empresa 3 · sucursales 3/6',
    filters,
    warnings: meta.unavailableDocumentCount ? [`${meta.unavailableDocumentCount} comprobantes sin detalle no se completaron artificialmente.`] : [],
  });
  const sheet = workbook.addWorksheet('Movimientos', { views: [{ state: 'frozen', ySplit: 1, showGridLines: true }] });
  sheet.columns = [
    { header: 'Fecha', key: 'date', width: 14, style: { numFmt: 'dd/mm/yyyy' } }, { header: 'Comprobante', key: 'document', width: 22 },
    { header: 'Tipo', key: 'documentType', width: 17 }, { header: 'Vendedor', key: 'seller', width: 23 },
    { header: 'Cliente ID', key: 'clientId', width: 13 }, { header: 'Cliente', key: 'client', width: 38 },
    { header: 'Producto ID', key: 'productId', width: 16 }, { header: 'Producto', key: 'product', width: 45 },
    { header: 'Marca', key: 'brand', width: 24 }, { header: 'Rubro', key: 'category', width: 24 },
    { header: 'Canal', key: 'channel', width: 22 }, { header: 'Zona', key: 'zone', width: 16 },
    { header: 'Kilos', key: 'kilos', width: 14, style: { numFmt: '#,##0.000' } },
    { header: 'Unidades', key: 'units', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Venta neta', key: 'netAmount', width: 22, style: { numFmt: '$ #,##0.00;[Red]-$ #,##0.00' } },
  ];
  styleHeader(sheet.getRow(1));
  sheet.getRow(1).commit();
  forEachSalesExportRow(input, (row) => {
    sheet.addRow({ ...row, date: excelDate(row.date), documentType: row.documentType === 'credit_note' ? 'Nota de crédito' : 'Factura' }).commit();
  });
  sheet.autoFilter = 'A1:O1';
  sheet.commit();
  await workbook.commit();
}

function receivableColumns() {
  return [
    'Cliente ID', 'Cliente', 'Nombre comercial', 'Vendedor', 'Forma de pago', 'Responsable interno', 'Estado interno',
    'Próximo seguimiento', 'Saldo pendiente', 'Saldo vencido', '% vencido', 'Vencimiento más próximo',
    'Antigüedad máxima', 'Comprobantes abiertos', 'Comprobantes vencidos', 'Venta 30d', 'Último comentario', 'Actualizado',
  ];
}

function receivableValues(row: ReceivableDashboardPayload['rows'][number]) {
  return [
    row.clientId, row.name, row.tradeName, row.seller, row.paymentMethod, row.workflow.responsible,
    row.workflow.status, excelDate(row.workflow.nextFollowUpAt), row.pendingBalance, row.overdueBalance, row.overdueShare,
    excelDate(row.earliestDue), row.oldestOverdueDays, row.openDocuments, row.overdueDocuments, row.sales30,
    row.workflow.lastComment, excelDate(row.workflow.updatedAt),
  ];
}

export function exportReceivablesCsv(response: Response, input: Partial<Record<string, unknown>>) {
  const payload = buildReceivablesDashboard(input);
  if (!payload) throw new Error('La base de saldos pendientes no está disponible.');
  setDownloadHeaders(response, 'text/csv; charset=utf-8', `cuentas-por-cobrar-${payload.sourceMaxDate}.csv`);
  response.write('\ufeff');
  metadataCsv({
    title: 'Cuentas por cobrar',
    period: `Cartera vigente al ${payload.sourceMaxDate}; ventas móviles de 30 días`,
    cutoff: payload.sourceMaxDate,
    universe: 'Comprobantes débito abiertos con vencimiento válido',
    filters: payload.filters,
    warnings: ['Recibos y notas de crédito sin aplicar no se suman como deuda documental.'],
  }, payload.generatedAt).forEach((row) => response.write(csvRow(row)));
  response.write('\r\n');
  response.write(csvRow(receivableColumns()));
  payload.rows.forEach((row) => response.write(csvRow(receivableValues(row))));
  response.end();
}

export async function exportReceivablesXlsx(response: Response, input: Partial<Record<string, unknown>>) {
  const payload = buildReceivablesDashboard(input);
  if (!payload) throw new Error('La base de saldos pendientes no está disponible.');
  setDownloadHeaders(response, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `cuentas-por-cobrar-${payload.sourceMaxDate}.xlsx`);
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: response, useStyles: true, useSharedStrings: true });
  addMetadataSheet(workbook, {
    title: 'Cuentas por cobrar',
    period: `Cartera vigente al ${payload.sourceMaxDate}; ventas móviles de 30 días`,
    cutoff: payload.sourceMaxDate,
    universe: 'Comprobantes débito abiertos con vencimiento válido',
    filters: payload.filters,
    warnings: ['Recibos y notas de crédito sin aplicar no se suman como deuda documental.'],
  });
  const sheet = workbook.addWorksheet('Cartera', { views: [{ state: 'frozen', ySplit: 1, showGridLines: true }] });
  const widths = [13, 38, 28, 24, 22, 22, 20, 18, 22, 22, 14, 18, 17, 18, 19, 22, 42, 20];
  sheet.columns = widths.map((width) => ({ width }));
  sheet.addRow(receivableColumns());
  styleHeader(sheet.getRow(1));
  sheet.getRow(1).commit();
  payload.rows.forEach((row) => {
    const excelRow = sheet.addRow(receivableValues(row));
    for (const column of [9, 10, 16]) excelRow.getCell(column).numFmt = '$ #,##0.00;[Red]-$ #,##0.00';
    excelRow.getCell(11).value = row.overdueShare / 100;
    excelRow.getCell(11).numFmt = '0.00%';
    for (const column of [8, 12, 18]) excelRow.getCell(column).numFmt = 'dd/mm/yyyy';
    excelRow.commit();
  });
  sheet.autoFilter = 'A1:R1';
  sheet.commit();
  await workbook.commit();
}

function goalTotals(payload: CommercialGoalsPayload) {
  return payload.rows.reduce((totals, row) => ({
    kilos: totals.kilos + Number(row.kilos ?? 0),
    accounts: totals.accounts + Number(row.accounts ?? 0),
    invoicing: totals.invoicing + Number(row.invoicing ?? 0),
  }), { kilos: 0, accounts: 0, invoicing: 0 });
}

export async function exportGoalsXlsx(response: Response, versionId?: string, month?: string) {
  const payload = getCommercialGoalsPayload(versionId, month);
  const version = payload.selectedVersion;
  setDownloadHeaders(response, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `objetivos-${version.version}-${payload.selectedMonth}.xlsx`);
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: response, useStyles: true, useSharedStrings: true });
  addMetadataSheet(workbook, {
    title: `Objetivos comerciales · ${version.name}`,
    period: payload.selectedMonth,
    cutoff: payload.selectedMonth,
    universe: `${version.sourceLabel} · versión ${version.version} · ${version.status}`,
    filters: { month: payload.selectedMonth, version: version.version },
    source: 'Objetivos: configuración versionada de Salice. Resultados reales: API GESI.',
    warnings: version.status === 'active' ? [] : ['La versión exportada no es el plan activo y no modifica el cumplimiento operativo.'],
  });
  const sheet = workbook.addWorksheet('Objetivos', { views: [{ state: 'frozen', ySplit: 1, showGridLines: true }] });
  sheet.columns = [
    { header: 'Mes', key: 'month', width: 12 }, { header: 'Producto / lectura', key: 'product', width: 32 },
    { header: 'Vendedor', key: 'seller', width: 24 }, { header: 'Kilos', key: 'kilos', width: 15, style: { numFmt: '#,##0.00' } },
    { header: 'Cuentas', key: 'accounts', width: 14, style: { numFmt: '#,##0' } },
    { header: 'Facturación', key: 'invoicing', width: 22, style: { numFmt: '$ #,##0.00;[Red]-$ #,##0.00' } },
  ];
  styleHeader(sheet.getRow(1));
  sheet.getRow(1).commit();
  payload.rows.forEach((row) => sheet.addRow(row).commit());
  sheet.autoFilter = 'A1:F1';
  sheet.commit();
  await workbook.commit();
}

function formatNumber(value: number, unit: 'kg' | 'ars' | 'count') {
  if (unit === 'ars') return `$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value)}`;
  if (unit === 'kg') return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value)} kg`;
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value);
}

export function exportGoalsPdf(response: Response, versionId?: string, month?: string) {
  const payload = getCommercialGoalsPayload(versionId, month);
  const version = payload.selectedVersion;
  const versionStatus = version.status === 'active' ? 'activo' : version.status === 'draft' ? 'borrador' : 'archivado';
  const generatedAt = new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date());
  setDownloadHeaders(response, 'application/pdf', `objetivos-${version.version}-${payload.selectedMonth}.pdf`);
  const document = new PDFDocument({ size: 'A4', margin: 42, info: { Title: `Objetivos comerciales ${payload.selectedMonth}`, Author: 'Salice' } });
  document.pipe(response);
  document.image(SALICE_LOGO_PATH, 42, 34, { fit: [54, 47], align: 'center', valign: 'center' });
  document.fillColor('#214f3f').font('Helvetica-Bold').fontSize(20).text('Objetivos comerciales', 112, 39);
  document.fillColor('#1f2d28').fontSize(12).text('Plan y cumplimiento', 112, 65);
  document.y = 95;
  document.moveDown(.4).font('Helvetica').fontSize(9).fillColor('#65736d')
    .text(`Plan: ${version.name} · versión ${version.version} · ${versionStatus}`)
    .text(`Mes: ${payload.selectedMonth} · generado ${generatedAt}`)
    .text('Resultados reales: datos comerciales disponibles. Objetivos: plan versionado de Salice.');
  const totals = goalTotals(payload);
  document.moveDown(1).fillColor('#1f2d28').font('Helvetica-Bold').fontSize(12).text('Plan cargado');
  document.font('Helvetica').fontSize(10)
    .text(`Kilos: ${formatNumber(totals.kilos, 'kg')}`)
    .text(`Cuentas: ${formatNumber(totals.accounts, 'count')}`)
    .text(`Facturación: ${formatNumber(totals.invoicing, 'ars')}`);
  if (version.status === 'active') {
    const reports = [
      ['Objetivos kilos', buildGeneralReport({ mode: 'core', month: payload.selectedMonth })],
      ['Marcas estratégicas', buildGeneralReport({ mode: 'strategic', month: payload.selectedMonth })],
      ['Autoservicio', buildGeneralReport({ mode: 'autoservice', month: payload.selectedMonth })],
    ] as const;
    document.moveDown(1).font('Helvetica-Bold').fontSize(12).text('Cumplimiento del plan activo');
    for (const [label, report] of reports) {
      if (!report) continue;
      const unit = report.unit === 'currency' ? 'ars' : 'kg';
      document.moveDown(.45).font('Helvetica-Bold').fontSize(10).fillColor('#214f3f').text(label);
      document.font('Helvetica').fillColor('#1f2d28')
        .text(`Real ${formatNumber(report.actual, unit)} · Objetivo ${formatNumber(report.target, unit)} · Cumplimiento ${report.completion == null ? 'sin base' : `${report.completion.toFixed(1)}%`}`);
    }
  } else {
    document.moveDown(1).fillColor('#8a6a25').font('Helvetica-Bold').fontSize(10)
      .text('Esta versión está en borrador. El cumplimiento operativo permanece asociado al plan activo hasta su activación.');
  }
  document.moveDown(1).fillColor('#1f2d28').font('Helvetica-Bold').fontSize(12).text('Objetivos por vendedor');
  const sellers = new Map<string, { kilos: number; invoicing: number }>();
  for (const row of payload.rows) {
    const current = sellers.get(row.seller || 'Sin vendedor') ?? { kilos: 0, invoicing: 0 };
    current.kilos += Number(row.kilos ?? 0);
    current.invoicing += Number(row.invoicing ?? 0);
    sellers.set(row.seller || 'Sin vendedor', current);
  }
  document.font('Helvetica').fontSize(9);
  [...sellers.entries()].sort((left, right) => right[1].kilos - left[1].kilos).forEach(([seller, values]) => {
    if (document.y > 750) document.addPage();
    document.text(`${seller}: ${formatNumber(values.kilos, 'kg')}${values.invoicing ? ` · ${formatNumber(values.invoicing, 'ars')}` : ''}`);
  });
  document.moveDown(1).fontSize(8).fillColor('#65736d')
    .text('Documento generado por Salice. Los resultados se calculan con los datos comerciales disponibles.');
  document.end();
}

export function exportInvoicePdf(response: Response, invoice: InvoiceDetailPayload) {
  const generatedAt = new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date());
  const date = (value: string | null) => value
    ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`))
    : 'Sin dato';
  setDownloadHeaders(response, 'application/pdf', `${invoice.number || invoice.id}.pdf`);
  const document = new PDFDocument({
    size: 'A4', margin: 42,
    info: { Title: `${invoice.kind === 'credit_note' ? 'Nota de crédito' : 'Factura'} ${invoice.number}`, Author: 'Salice' },
  });
  document.pipe(response);

  document.rect(0, 0, 595, 112).fill('#214f3f');
  document.roundedRect(42, 20, 72, 72, 12).fill('#ffffff');
  document.image(SALICE_LOGO_PATH, 49, 27, { fit: [58, 58], align: 'center', valign: 'center' });
  document.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12).text(invoice.kind === 'credit_note' ? 'NOTA DE CRÉDITO' : 'COMPROBANTE DE VENTA', 132, 47);
  document.fillColor('#d8b36a').fontSize(18).text(invoice.number, 325, 42, { width: 228, align: 'right' });
  document.fillColor('#d8e5df').font('Helvetica').fontSize(8).text(`Corte operativo ${date(invoice.sourceMaxDate)}`, 325, 70, { width: 228, align: 'right' });

  document.fillColor('#1f2d28').font('Helvetica-Bold').fontSize(12).text(invoice.client.name, 42, 137);
  if (invoice.client.tradeName && invoice.client.tradeName !== invoice.client.name) {
    document.font('Helvetica').fontSize(9).fillColor('#65736d').text(invoice.client.tradeName, 42, 154);
  }
  const contactY = invoice.client.tradeName && invoice.client.tradeName !== invoice.client.name ? 171 : 156;
  document.font('Helvetica').fontSize(8.5).fillColor('#65736d')
    .text([invoice.client.address, invoice.client.locality].filter(Boolean).join(' · ') || 'Domicilio no informado', 42, contactY)
    .text(`Cliente ${invoice.client.id} · Vendedor: ${invoice.client.seller}`, 42, contactY + 13);

  const summaryY = contactY + 42;
  const box = (x: number, title: string, value: string, accent = '#214f3f') => {
    document.roundedRect(x, summaryY, 160, 57, 7).fillAndStroke('#f6f8f5', '#dfe5e0');
    document.fillColor('#75827c').font('Helvetica-Bold').fontSize(7).text(title.toUpperCase(), x + 11, summaryY + 11, { width: 138 });
    document.fillColor(accent).fontSize(11).text(value, x + 11, summaryY + 29, { width: 138 });
  };
  box(42, 'Emisión / vencimiento', `${date(invoice.issuedAt)} · ${date(invoice.dueAt)}`);
  box(217, 'Forma de pago', invoice.paymentMethod);
  box(392, invoice.outstanding > 0 ? 'Saldo pendiente' : 'Importe', formatNumber(invoice.outstanding > 0 ? invoice.outstanding : invoice.amount, 'ars'), invoice.outstanding > 0 ? '#a24b3d' : '#214f3f');

  let y = summaryY + 82;
  document.fillColor('#214f3f').font('Helvetica-Bold').fontSize(11).text('Detalle del comprobante', 42, y);
  y += 23;
  const tableHeader = () => {
    document.rect(42, y, 511, 24).fill('#e9efe9');
    document.fillColor('#315348').font('Helvetica-Bold').fontSize(7.5)
      .text('PRODUCTO', 50, y + 8, { width: 248 })
      .text('UNIDADES', 310, y + 8, { width: 65, align: 'right' })
      .text('KILOS', 384, y + 8, { width: 65, align: 'right' })
      .text('VENTA NETA', 458, y + 8, { width: 87, align: 'right' });
    y += 24;
  };
  tableHeader();
  if (!invoice.lineItems.length) {
    document.fillColor('#65736d').font('Helvetica').fontSize(9)
      .text('GESI no entregó detalle de renglones para este comprobante. Se conserva el encabezado y la información financiera disponible.', 50, y + 13, { width: 495 });
    y += 54;
  } else {
    for (const item of invoice.lineItems) {
      if (y > 726) {
        document.addPage();
        y = 42;
        tableHeader();
      }
      const rowHeight = 38;
      document.rect(42, y, 511, rowHeight).fillAndStroke('#ffffff', '#e7ebe7');
      document.fillColor('#2b473d').font('Helvetica-Bold').fontSize(8).text(item.product, 50, y + 8, { width: 248, height: 12, ellipsis: true });
      document.fillColor('#849089').font('Helvetica').fontSize(7).text(`${item.productId} · ${item.brand} · ${item.category}`, 50, y + 22, { width: 248, height: 10, ellipsis: true });
      document.fillColor('#334f45').fontSize(8).text(formatNumber(item.units, 'count'), 310, y + 14, { width: 65, align: 'right' });
      document.text(new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 }).format(item.kilos), 384, y + 14, { width: 65, align: 'right' });
      document.font('Helvetica-Bold').text(formatNumber(item.netAmount, 'ars'), 458, y + 14, { width: 87, align: 'right' });
      y += rowHeight;
    }
  }

  if (y > 690) { document.addPage(); y = 42; }
  document.moveTo(360, y + 18).lineTo(553, y + 18).strokeColor('#d8b36a').lineWidth(2).stroke();
  document.fillColor('#65736d').font('Helvetica').fontSize(8).text('TOTAL DEL COMPROBANTE', 360, y + 29, { width: 193, align: 'right' });
  document.fillColor('#214f3f').font('Helvetica-Bold').fontSize(15).text(formatNumber(invoice.amount, 'ars'), 360, y + 43, { width: 193, align: 'right' });
  if (invoice.outstanding > 0) document.fillColor('#a24b3d').fontSize(9).text(`Saldo abierto ${formatNumber(invoice.outstanding, 'ars')}`, 360, y + 63, { width: 193, align: 'right' });
  document.fillColor('#7a867f').font('Helvetica').fontSize(7.5).text(
    `Generado ${generatedAt}. ${invoice.detailAvailable ? 'Detalle disponible en la base comercial.' : 'El origen de datos no informó el detalle de productos.'}`,
    42, y + 92, { width: 511, align: 'left' },
  );
  document.end();
}
