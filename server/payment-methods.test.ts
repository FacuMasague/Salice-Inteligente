import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeCapture, suggestedDeliveryDate } from './gesi/normalize';
import type { GesiRawCapture } from './gesi/types';
import { buildPendingBalancesDatabase } from './pending-balances-build';

const directories: string[] = [];

function capture(): GesiRawCapture {
  const document = {
    empresaID: 3, clienteID: 101, comprobanteID: 9, serie: 'B', puntoDeVentaID: 1, numero: 123,
    subtipo: 'F', fechaDeEmision: '2026-07-01', fechaDePrimerVencimiento: '2026-07-15',
    importeTotal: 25_000, saldoPendiente: 12_500, formaDePagoID: 2, vendedorID: 7, anulado: false,
  };
  return {
    captureMeta: {
      capturedAt: '2026-07-20T13:05:00.000Z', empresaID: 3, sucursalID: 3, almacenPrincipalID: 2,
      historyFrom: '2025-07-20', salesHistoryFrom: '2025-07-20', sptFetchFrom: '2025-01-01',
      salesDetailFrom: '2026-04-20', sptSalesDetailFrom: '2025-01-01', historyUntil: '2026-07-20', optionalEndpointWarnings: [],
    },
    clients: [{
      clienteID: 101, estadoID: 1, razonSocial: 'Cliente de prueba', nombreDeFantasia: 'Prueba',
      lstDefinicionClienteSucursal: [{ empresaID: 3, sucursalID: 3, vendedorID: 7, formaDePagoID: 1 }],
    }],
    products: [], prices: [], stocks: [], balances: [], invoices: [document, {
      ...document, comprobanteID: 8, numero: 122, fechaDeEmision: '2026-02-20', fechaDePrimerVencimiento: '2026-03-22',
      importeTotal: 10_000, saldoPendiente: 0, formaDePagoID: 1,
    }], creditNotes: [],
    sptInvoices: [], sptCreditNotes: [], collections: [], pendingDocuments: [document],
    masters: {
      channels: [], paymentMethods: [{ formaDePagoID: 1, descripcion: 'CTA CTE 30 DIAS' }, { formaDePagoID: 2, descripcion: 'CARTERA' }],
      sellers: [{ vendedorID: 7, fantasia: 'Ana Ottaviano' }], rubros: [], subRubros: [], productBrands: [],
      productLines: [], productFamilies: [], productGroups: [], clientTypes: [], zones: [],
    },
  };
}

afterEach(() => {
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true });
});

describe('forma de pago documental', () => {
  it('normaliza la forma de pago de la factura sin reemplazarla por la condición actual del cliente', () => {
    const client = normalizeCapture(capture()).clients[0];
    expect(client.paymentMethod).toBe('CTA CTE 30 DIAS');
    expect(client.invoices[0]?.paymentMethod).toBe('CARTERA');
  });

  it('compara los últimos 90 días con los 90 inmediatamente anteriores', () => {
    const client = normalizeCapture(capture()).clients[0];
    expect(client.sales90d).toBe(25_000);
    expect(client.salesDelta).toBe(150);
  });

  it('persiste la forma de pago de cada comprobante en la base de saldos pendientes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'salice-payment-method-'));
    directories.push(directory);
    const path = join(directory, 'pending.sqlite');
    buildPendingBalancesDatabase(capture(), path);
    const database = new DatabaseSync(path, { readOnly: true });
    const document = database.prepare('SELECT payment_method, seller FROM documents').get() as { payment_method: string; seller: string };
    const client = database.prepare('SELECT payment_method FROM clients').get() as { payment_method: string };
    database.close();
    expect(document.payment_method).toBe('CARTERA');
    expect(document.seller).toBe('Ana Ottaviano');
    expect(client.payment_method).toBe('CTA CTE 30 DIAS');
  });

  it('no normaliza como cartera los residuales menores a $1.000', () => {
    const raw = capture();
    raw.pendingDocuments[0].saldoPendiente = 999.99;
    const client = normalizeCapture(raw).clients[0];
    expect(client.invoices.filter((invoice) => invoice.outstanding > 0)).toHaveLength(0);
    expect(client.overdueOutstanding).toBe(0);
  });

  it('excluye del universo a las entidades que no son clientes comerciales', () => {
    const raw = capture();
    raw.clients[0].razonSocial = 'GBA M6 S.A.';
    expect(normalizeCapture(raw).clients).toHaveLength(0);
  });

  it('filtra por el vendedor de la factura y no por el responsable actual del cliente', () => {
    const raw = capture();
    raw.masters.sellers.push({ vendedorID: 8, fantasia: 'Administración' });
    raw.pendingDocuments[0].vendedorID = 8;
    const client = normalizeCapture(raw).clients[0];
    expect(client.seller).toBe('Ana Ottaviano');
    expect(client.invoices.filter((invoice) => invoice.outstanding > 0)).toHaveLength(0);
    expect(client.overdueOutstanding).toBe(0);
  });

  it('distingue facturas sin foja, en foja abierta y en foja cerrada sin llamarlas entregadas', () => {
    const raw = capture();
    raw.captureMeta.logisticsFrom = '2026-06-01';
    const base = raw.invoices[0];
    const openInvoice = { ...base, numero: 124, fechaDeEmision: '2026-07-02' };
    const unassignedInvoice = { ...base, numero: 125, fechaDeEmision: '2026-07-03' };
    raw.invoices.push(openInvoice, unassignedInvoice);
    raw.deliverySheets = [{
      empresaID: 3, fojaID: 700, estado: 2, repartidorID: 4, descripcionRepartidor: 'Repartidor prueba',
      desde: '2026-07-02', hasta: '2026-07-02', fechaCerrada: '2026-07-02',
      listaDeComprobantesAsignados: [base],
    }, {
      empresaID: 3, fojaID: 701, estado: 1, repartidorID: 4, descripcionRepartidor: 'Repartidor prueba',
      desde: '2026-07-03', hasta: '2026-07-03', fechaCerrada: null,
      listaDeComprobantesAsignados: [openInvoice],
    }];
    raw.unassignedDeliveryDocuments = [unassignedInvoice];

    const logistics = normalizeCapture(raw).logistics;
    expect(logistics.invoices.find((invoice) => invoice.number.includes('00000123'))).toMatchObject({
      assignmentStatus: 'closed_sheet', sheet: { id: 700, status: 'closed' },
    });
    expect(logistics.invoices.find((invoice) => invoice.number.includes('00000124'))).toMatchObject({
      assignmentStatus: 'open_sheet', sheet: { id: 701, status: 'open' },
    });
    expect(logistics.invoices.find((invoice) => invoice.number.includes('00000125'))).toMatchObject({
      assignmentStatus: 'unassigned', sheet: null,
    });
    expect(logistics.coverageFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(logistics.sheets.flatMap((sheet) => sheet.invoiceIds)).toHaveLength(2);
    expect(logistics.sheets.find((sheet) => sheet.id === 700)).toMatchObject({
      zone: '',
      subzone: '',
      comment: '',
      dispatchComment: '',
      dispatchedAt: null,
    });
  });

  it('infiere kilos desde las unidades vendidas y el contenido neto por U1', () => {
    const raw = capture();
    raw.captureMeta.logisticsFrom = '2026-06-01';
    raw.products = [{
      productoID: 'SKU-1', estado: 'A', descripcion: 'Alimento seco para perro 20 kg', rubro: 'Alimentos Balanceados',
      unidad1: 'UN', unidad2: 'KG', unidad2XUnidad1: 20,
    }];
    raw.invoices[0].detalleItems = [{
      tipoDeItem: 'P', codigoDeItem: 'SKU-1', cantidadU1: 2, cantidadU2: 0, importeTotalNeto: 25_000,
    }];
    const inferred = normalizeCapture(raw);
    expect(inferred.products[0]).toMatchObject({ id: 'SKU-1', units90d: 2, contentKg: 20, kilos90d: 40, kiloDataStatus: 'estimated' });
    expect(inferred.logistics.invoices.find((invoice) => invoice.number.includes('00000123')))
      .toMatchObject({ kilos: 40, kiloDataStatus: 'estimated' });

    (raw.invoices[0].detalleItems as Array<Record<string, unknown>>)[0].cantidadU2 = 12.5;
    const sameInference = normalizeCapture(raw);
    expect(sameInference.products[0]).toMatchObject({ id: 'SKU-1', units90d: 2, kilos90d: 40, kiloDataStatus: 'estimated' });
    expect(sameInference.logistics.invoices.find((invoice) => invoice.number.includes('00000123')))
      .toMatchObject({ kilos: 40, kiloDataStatus: 'estimated' });
  });

  it('no inventa una conversión cuando la presentación no expresa un peso por unidad', () => {
    const raw = capture();
    raw.captureMeta.logisticsFrom = '2026-06-01';
    raw.products = [{ productoID: 'SKU-1', estado: 'A', descripcion: 'Correa para perro', rubro: 'Accesorios', unidad1: 'UN', unidad2: 'UN' }];
    raw.invoices[0].detalleItems = [
      { tipoDeItem: 'P', codigoDeItem: 'SKU-1', cantidadU1: 1, cantidadU2: 6, importeTotalNeto: 15_000 },
      { tipoDeItem: 'P', codigoDeItem: 'SKU-1', cantidadU1: 1, cantidadU2: 0, importeTotalNeto: 10_000 },
    ];
    const normalized = normalizeCapture(raw);
    expect(normalized.products[0]).toMatchObject({ contentKg: null, kilos90d: 0, kiloDataStatus: 'unavailable' });
    expect(normalized.logistics.invoices.find((invoice) => invoice.number.includes('00000123')))
      .toMatchObject({ kilos: 0, kiloDataStatus: 'unavailable' });
  });

  it('usa como tipo de cliente el maestro TiposDeCliente de GESI', () => {
    const raw = capture();
    raw.clients[0].tipoDeClienteID = 4;
    raw.clients[0].canalDeVentaID = 8;
    raw.masters.clientTypes = [{ tipoDeClienteID: 4, descripcion: 'Veterinaria' }];
    raw.masters.channels = [{ canalDeVentaID: 8, descripcion: 'Minorista' }];
    const client = normalizeCapture(raw).clients[0];
    expect(client.segment).toBe('Veterinaria');
    expect(client.channel).toBe('Minorista');
  });

  it('sugiere lunes para una factura del viernes sin convertirlo en compromiso', () => {
    expect(suggestedDeliveryDate('2026-07-24')).toBe('2026-07-27');
    expect(suggestedDeliveryDate('2026-07-23')).toBe('2026-07-24');
  });
});
