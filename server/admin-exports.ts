import type { Response } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { CommercialGoalsPayload, InvoiceDetailPayload, ReceivableDashboardPayload } from '../shared/models.js';
import { buildGeneralReport } from './general-report.js';
import { getCommercialGoalsPayload } from './operational-store.js';
import { buildReceivablesDashboard } from './receivables-dashboard.js';
import { forEachSalesExportRow, getSalesExplorerMeta, normalizeSalesExplorerFilters } from './sales-explorer.js';

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
  return Object.entries(filters).filter(([, value]) => value).map(([key, value]) => `${key}=${value}`).join(' · ') || 'No additional filters';
}

function setDownloadHeaders(response: Response, contentType: string, filename: string) {
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Disposition', `attachment; filename="${safeFilePart(filename)}"`);
  response.setHeader('Cache-Control', 'no-store');
}

export function exportSalesCsv(response: Response, input: Partial<Record<string, unknown>>) {
  const meta = getSalesExplorerMeta();
  const filters = normalizeSalesExplorerFilters(input, meta);
  setDownloadHeaders(response, 'text/csv; charset=utf-8', `smart-salice-sales-${filters.from}-${filters.to}.csv`);
  response.write('\ufeff');
  response.write(csvRow(['Generated', new Date().toISOString()]));
  response.write(csvRow(['Synthetic cutoff', meta.maxDate]));
  response.write(csvRow(['Universe', 'Synthetic commercial movements']));
  response.write(csvRow(['Filters', filtersLabel(filters)]));
  response.write('\r\n');
  response.write(csvRow(['Date', 'Document', 'Type', 'Seller', 'Customer ID', 'Customer', 'Product ID', 'Product', 'Brand', 'Category', 'Channel', 'Zone', 'Kilos', 'Units', 'Net sales']));
  forEachSalesExportRow(input, (row) => response.write(csvRow([
    row.date, row.document, row.documentType === 'credit_note' ? 'Credit note' : 'Invoice', row.seller,
    row.clientId, row.client, row.productId, row.product, row.brand, row.category, row.channel, row.zone,
    row.kilos, row.units, row.netAmount,
  ])));
  response.end();
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF214F3F' } };
  row.alignment = { vertical: 'middle' };
}

function addMetadataSheet(workbook: ExcelJS.stream.xlsx.WorkbookWriter, title: string, cutoff: string, universe: string, filters: object) {
  const sheet = workbook.addWorksheet('Metadata');
  sheet.columns = [{ width: 22 }, { width: 110 }];
  const titleRow = sheet.addRow([title]);
  titleRow.font = { size: 16, bold: true, color: { argb: 'FF214F3F' } };
  titleRow.commit();
  for (const values of [
    ['Generated', new Date().toISOString()],
    ['Operational cutoff', cutoff],
    ['Universe', universe],
    ['Filters', filtersLabel(filters)],
    ['Source', 'Deterministic local synthetic databases'],
  ]) sheet.addRow(values).commit();
  sheet.commit();
}

export async function exportSalesXlsx(response: Response, input: Partial<Record<string, unknown>>) {
  const meta = getSalesExplorerMeta();
  const filters = normalizeSalesExplorerFilters(input, meta);
  setDownloadHeaders(response, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `smart-salice-sales-${filters.from}-${filters.to}.xlsx`);
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: response, useStyles: true, useSharedStrings: true });
  workbook.creator = 'SMART Salice';
  workbook.created = new Date();
  addMetadataSheet(workbook, 'Sales explorer', meta.maxDate, 'Synthetic commercial movements', filters);
  const sheet = workbook.addWorksheet('Movements');
  sheet.columns = [
    { header: 'Date', key: 'date', width: 13 }, { header: 'Document', key: 'document', width: 22 },
    { header: 'Type', key: 'documentType', width: 17 }, { header: 'Seller', key: 'seller', width: 23 },
    { header: 'Customer ID', key: 'clientId', width: 13 }, { header: 'Customer', key: 'client', width: 38 },
    { header: 'Product ID', key: 'productId', width: 16 }, { header: 'Product', key: 'product', width: 45 },
    { header: 'Brand', key: 'brand', width: 24 }, { header: 'Category', key: 'category', width: 24 },
    { header: 'Channel', key: 'channel', width: 22 }, { header: 'Zone', key: 'zone', width: 16 },
    { header: 'Kilos', key: 'kilos', width: 14, style: { numFmt: '#,##0.000' } },
    { header: 'Units', key: 'units', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Net sales', key: 'netAmount', width: 18, style: { numFmt: '$ #,##0.00;[Red]-$ #,##0.00' } },
  ];
  styleHeader(sheet.getRow(1));
  sheet.getRow(1).commit();
  forEachSalesExportRow(input, (row) => {
    sheet.addRow({ ...row, documentType: row.documentType === 'credit_note' ? 'Credit note' : 'Invoice' }).commit();
  });
  sheet.autoFilter = 'A1:O1';
  sheet.commit();
  await workbook.commit();
}

function receivableColumns() {
  return [
    'Customer ID', 'Customer', 'Trade name', 'Seller', 'Payment method', 'Internal owner', 'Internal status',
    'Next follow-up', 'Pending balance', 'Overdue balance', '% overdue', 'Next due date',
    'Maximum aging', 'Open documents', 'Overdue documents', '30-day sales', 'Last comment', 'Updated',
  ];
}

function receivableValues(row: ReceivableDashboardPayload['rows'][number]) {
  return [
    row.clientId, row.name, row.tradeName, row.seller, row.paymentMethod, row.workflow.responsible,
    row.workflow.status, row.workflow.nextFollowUpAt, row.pendingBalance, row.overdueBalance, row.overdueShare,
    row.earliestDue, row.oldestOverdueDays, row.openDocuments, row.overdueDocuments, row.sales30,
    row.workflow.lastComment, row.workflow.updatedAt,
  ];
}

export function exportReceivablesCsv(response: Response, input: Partial<Record<string, unknown>>) {
  const payload = buildReceivablesDashboard(input);
  if (!payload) throw new Error('The pending-balances database is unavailable.');
  setDownloadHeaders(response, 'text/csv; charset=utf-8', `smart-salice-receivables-${payload.sourceMaxDate}.csv`);
  response.write('\ufeff');
  response.write(csvRow(['Generated', payload.generatedAt]));
  response.write(csvRow(['Synthetic cutoff', payload.sourceMaxDate]));
  response.write(csvRow(['Universe', 'Open debit documents with valid due dates']));
  response.write(csvRow(['Filters', filtersLabel(payload.filters)]));
  response.write('\r\n');
  response.write(csvRow(receivableColumns()));
  payload.rows.forEach((row) => response.write(csvRow(receivableValues(row))));
  response.end();
}

export async function exportReceivablesXlsx(response: Response, input: Partial<Record<string, unknown>>) {
  const payload = buildReceivablesDashboard(input);
  if (!payload) throw new Error('The pending-balances database is unavailable.');
  setDownloadHeaders(response, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `smart-salice-receivables-${payload.sourceMaxDate}.xlsx`);
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: response, useStyles: true, useSharedStrings: true });
  addMetadataSheet(workbook, 'Accounts receivable', payload.sourceMaxDate, 'Open debit documents with valid due dates', payload.filters);
  const sheet = workbook.addWorksheet('Portfolio');
  sheet.addRow(receivableColumns());
  styleHeader(sheet.getRow(1));
  sheet.getRow(1).commit();
  payload.rows.forEach((row) => {
    const excelRow = sheet.addRow(receivableValues(row));
    for (const column of [9, 10, 16]) excelRow.getCell(column).numFmt = '$ #,##0.00;[Red]-$ #,##0.00';
    excelRow.getCell(11).value = row.overdueShare / 100;
    excelRow.getCell(11).numFmt = '0.00%';
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
  setDownloadHeaders(response, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `smart-salice-goals-${version.version}-${payload.selectedMonth}.xlsx`);
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: response, useStyles: true, useSharedStrings: true });
  addMetadataSheet(
    workbook,
    `Commercial goals · ${version.name}`,
    payload.selectedMonth,
    `${version.sourceLabel} · version ${version.version} · ${version.status}`,
    {},
  );
  const sheet = workbook.addWorksheet('Goals');
  sheet.columns = [
    { header: 'Month', key: 'month', width: 12 }, { header: 'Product / lectura', key: 'product', width: 32 },
    { header: 'Seller', key: 'seller', width: 24 }, { header: 'Kilos', key: 'kilos', width: 15, style: { numFmt: '#,##0.00' } },
    { header: 'Accounts', key: 'accounts', width: 14, style: { numFmt: '#,##0' } },
    { header: 'Revenue', key: 'invoicing', width: 18, style: { numFmt: '$ #,##0.00' } },
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
  const versionStatus = version.status === 'active' ? 'active' : version.status === 'draft' ? 'draft' : 'archived';
  const generatedAt = new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date());
  setDownloadHeaders(response, 'application/pdf', `smart-salice-goals-${version.version}-${payload.selectedMonth}.pdf`);
  const document = new PDFDocument({ size: 'A4', margin: 42, info: { Title: `Commercial goals ${payload.selectedMonth}`, Author: 'SMART Salice' } });
  document.pipe(response);
  document.fillColor('#214f3f').font('Helvetica-Bold').fontSize(20).text('SMART Salice');
  document.fillColor('#1f2d28').fontSize(15).text('Commercial goals and attainment');
  document.moveDown(.4).font('Helvetica').fontSize(9).fillColor('#65736d')
    .text(`Plan: ${version.name} · version ${version.version} · ${versionStatus}`)
    .text(`Month: ${payload.selectedMonth} · generated ${generatedAt}`)
    .text('Actuals: local synthetic commercial database. Goals: versioned local configuration.');
  const totals = goalTotals(payload);
  document.moveDown(1).fillColor('#1f2d28').font('Helvetica-Bold').fontSize(12).text('Loaded plan');
  document.font('Helvetica').fontSize(10)
    .text(`Kilos: ${formatNumber(totals.kilos, 'kg')}`)
    .text(`Accounts: ${formatNumber(totals.accounts, 'count')}`)
    .text(`Revenue: ${formatNumber(totals.invoicing, 'ars')}`);
  if (version.status === 'active') {
    const reports = [
      ['Goals kilos', buildGeneralReport({ mode: 'core', month: payload.selectedMonth })],
      ['Strategic brands', buildGeneralReport({ mode: 'strategic', month: payload.selectedMonth })],
      ['Small retail', buildGeneralReport({ mode: 'autoservice', month: payload.selectedMonth })],
    ] as const;
    document.moveDown(1).font('Helvetica-Bold').fontSize(12).text('Active-plan attainment');
    for (const [label, report] of reports) {
      if (!report) continue;
      const unit = report.unit === 'currency' ? 'ars' : 'kg';
      document.moveDown(.45).font('Helvetica-Bold').fontSize(10).fillColor('#214f3f').text(label);
      document.font('Helvetica').fillColor('#1f2d28')
        .text(`Actual ${formatNumber(report.actual, unit)} · Goal ${formatNumber(report.target, unit)} · Attainment ${report.completion == null ? 'no baseline' : `${report.completion.toFixed(1)}%`}`);
    }
  } else {
    document.moveDown(1).fillColor('#8a6a25').font('Helvetica-Bold').fontSize(10)
      .text('This version is a draft. Operational attainment remains tied to the active plan until activation.');
  }
  document.moveDown(1).fillColor('#1f2d28').font('Helvetica-Bold').fontSize(12).text('Goals by seller');
  const sellers = new Map<string, { kilos: number; invoicing: number }>();
  for (const row of payload.rows) {
    const current = sellers.get(row.seller || 'No seller') ?? { kilos: 0, invoicing: 0 };
    current.kilos += Number(row.kilos ?? 0);
    current.invoicing += Number(row.invoicing ?? 0);
    sellers.set(row.seller || 'No seller', current);
  }
  document.font('Helvetica').fontSize(9);
  [...sellers.entries()].sort((left, right) => right[1].kilos - left[1].kilos).forEach(([seller, values]) => {
    if (document.y > 750) document.addPage();
    document.text(`${seller}: ${formatNumber(values.kilos, 'kg')}${values.invoicing ? ` · ${formatNumber(values.invoicing, 'ars')}` : ''}`);
  });
  document.moveDown(1).fontSize(8).fillColor('#65736d')
    .text('Generated by SMART Salice from deterministic local synthetic data.');
  document.end();
}

export function exportInvoicePdf(response: Response, invoice: InvoiceDetailPayload) {
  const generatedAt = new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date());
  const date = (value: string | null) => value
    ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`))
    : 'No data';
  setDownloadHeaders(response, 'application/pdf', `${invoice.number || invoice.id}.pdf`);
  const document = new PDFDocument({
    size: 'A4', margin: 42,
    info: { Title: `${invoice.kind === 'credit_note' ? 'Credit note' : 'Invoice'} ${invoice.number}`, Author: 'SMART Salice' },
  });
  document.pipe(response);

  document.rect(0, 0, 595, 112).fill('#214f3f');
  document.fillColor('#f5f0df').font('Helvetica-Bold').fontSize(20).text('SMART Salice', 42, 35);
  document.fillColor('#ffffff').fontSize(12).text(invoice.kind === 'credit_note' ? 'CREDIT NOTE' : 'SALES DOCUMENT', 42, 66);
  document.fillColor('#d8b36a').fontSize(18).text(invoice.number, 325, 42, { width: 228, align: 'right' });
  document.fillColor('#d8e5df').font('Helvetica').fontSize(8).text(`Operational cutoff ${date(invoice.sourceMaxDate)}`, 325, 70, { width: 228, align: 'right' });

  document.fillColor('#1f2d28').font('Helvetica-Bold').fontSize(12).text(invoice.client.name, 42, 137);
  if (invoice.client.tradeName && invoice.client.tradeName !== invoice.client.name) {
    document.font('Helvetica').fontSize(9).fillColor('#65736d').text(invoice.client.tradeName, 42, 154);
  }
  const contactY = invoice.client.tradeName && invoice.client.tradeName !== invoice.client.name ? 171 : 156;
  document.font('Helvetica').fontSize(8.5).fillColor('#65736d')
    .text([invoice.client.address, invoice.client.locality].filter(Boolean).join(' · ') || 'Address unavailable', 42, contactY)
    .text(`Customer ${invoice.client.id} · Seller: ${invoice.client.seller}`, 42, contactY + 13);

  const summaryY = contactY + 42;
  const box = (x: number, title: string, value: string, accent = '#214f3f') => {
    document.roundedRect(x, summaryY, 160, 57, 7).fillAndStroke('#f6f8f5', '#dfe5e0');
    document.fillColor('#75827c').font('Helvetica-Bold').fontSize(7).text(title.toUpperCase(), x + 11, summaryY + 11, { width: 138 });
    document.fillColor(accent).fontSize(11).text(value, x + 11, summaryY + 29, { width: 138 });
  };
  box(42, 'Issue / due date', `${date(invoice.issuedAt)} · ${date(invoice.dueAt)}`);
  box(217, 'Payment method', invoice.paymentMethod);
  box(392, invoice.outstanding > 0 ? 'Pending balance' : 'Amount', formatNumber(invoice.outstanding > 0 ? invoice.outstanding : invoice.amount, 'ars'), invoice.outstanding > 0 ? '#a24b3d' : '#214f3f');

  let y = summaryY + 82;
  document.fillColor('#214f3f').font('Helvetica-Bold').fontSize(11).text('Document detail', 42, y);
  y += 23;
  const tableHeader = () => {
    document.rect(42, y, 511, 24).fill('#e9efe9');
    document.fillColor('#315348').font('Helvetica-Bold').fontSize(7.5)
      .text('PRODUCT', 50, y + 8, { width: 248 })
      .text('UNITS', 310, y + 8, { width: 65, align: 'right' })
      .text('KILOS', 384, y + 8, { width: 65, align: 'right' })
      .text('NET SALES', 458, y + 8, { width: 87, align: 'right' });
    y += 24;
  };
  tableHeader();
  if (!invoice.lineItems.length) {
    document.fillColor('#65736d').font('Helvetica').fontSize(9)
      .text('No line-item detail is available for this synthetic document. Header and financial details remain visible.', 50, y + 13, { width: 495 });
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
  document.fillColor('#65736d').font('Helvetica').fontSize(8).text('DOCUMENT TOTAL', 360, y + 29, { width: 193, align: 'right' });
  document.fillColor('#214f3f').font('Helvetica-Bold').fontSize(15).text(formatNumber(invoice.amount, 'ars'), 360, y + 43, { width: 193, align: 'right' });
  if (invoice.outstanding > 0) document.fillColor('#a24b3d').fontSize(9).text(`Open balance ${formatNumber(invoice.outstanding, 'ars')}`, 360, y + 63, { width: 193, align: 'right' });
  document.fillColor('#7a867f').font('Helvetica').fontSize(7.5).text(
    `Generated ${generatedAt}. Source: deterministic local synthetic data. ${invoice.detailAvailable ? 'Line-item detail is available.' : 'Product detail is explicitly unavailable.'}`,
    42, y + 92, { width: 511, align: 'left' },
  );
  document.end();
}
