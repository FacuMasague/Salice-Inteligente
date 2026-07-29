import { describe, expect, it } from 'vitest';
import type { LogisticsSnapshot } from '../../shared/models';
import { deliveryAssignmentText, invoiceDeliveryDisplay, summarizeReliableInvoiceKilos } from './delivery-status';

const logistics: LogisticsSnapshot = {
  coverageFrom: '2026-06-08T17:26:29.857Z',
  coverageThrough: '2026-07-23',
  sheets: [{
    id: 700,
    status: 'closed',
    driver: 'Repartidor',
    startsAt: '2026-07-20',
    endsAt: '2026-07-20',
    closedAt: '2026-07-20',
    zone: 'Mar del Plata',
    subzone: '',
    comment: '',
    dispatchComment: '',
    dispatchedAt: null,
    invoiceIds: ['invoice-closed'],
  }],
  invoices: [{
    id: 'invoice-closed',
    clientId: 1,
    number: 'F 0001-000001',
    issuedAt: '2026-07-20',
    suggestedDeliveryAt: '2026-07-21',
    amount: 100,
    deliveryAddress: 'Dirección',
    locality: 'Mar del Plata',
    assignmentStatus: 'closed_sheet',
    sheet: {
      id: 700,
      status: 'closed',
      driver: 'Repartidor',
      startsAt: '2026-07-20',
      endsAt: '2026-07-20',
      closedAt: '2026-07-20',
    },
  }, {
    id: 'invoice-unassigned',
    clientId: 1,
    number: 'F 0001-000002',
    issuedAt: '2026-07-21',
    suggestedDeliveryAt: '2026-07-22',
    amount: 200,
    deliveryAddress: 'Dirección',
    locality: 'Mar del Plata',
    assignmentStatus: 'unassigned',
    sheet: null,
  }],
};

describe('estado logístico de una factura en la ficha del cliente', () => {
  it('reutiliza el número y estado de la foja observada', () => {
    expect(invoiceDeliveryDisplay('invoice-closed', '2026-07-20', logistics)).toEqual({
      status: 'closed_sheet',
      label: 'Foja 700 cerrada',
      sheetId: 700,
    });
    expect(deliveryAssignmentText('open_sheet', 701)).toBe('Foja 701 abierta');
  });

  it('distingue una factura sin foja de otra fuera de la cobertura logística', () => {
    expect(invoiceDeliveryDisplay('invoice-unassigned', '2026-07-21', logistics)).toEqual({
      status: 'unassigned',
      label: 'Sin asignar a foja',
    });
    expect(invoiceDeliveryDisplay('old-invoice', '2026-05-31', logistics)).toEqual({
      status: 'outside_coverage',
      label: 'Fuera de cobertura de fojas',
    });
  });

  it('no inventa sin foja cuando falta una asociación dentro de la cobertura', () => {
    expect(invoiceDeliveryDisplay('missing-invoice', '2026-07-22', logistics)).toEqual({
      status: 'unavailable',
      label: 'Estado de foja no confirmado',
    });
  });

  it('suma kilos sólo de comprobantes con cobertura completa', () => {
    const summary = summarizeReliableInvoiceKilos([
      { ...logistics.invoices[0], kilos: 12.5, kiloDataStatus: 'available' },
      { ...logistics.invoices[1], kilos: 4, kiloDataStatus: 'unavailable' },
    ]);
    expect(summary).toEqual({ kilos: 12.5, reliableInvoiceCount: 1, totalInvoiceCount: 2, complete: false });
  });
});
