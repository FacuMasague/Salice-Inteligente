import { describe, expect, it } from 'vitest';
import type { CommercialActivity, PaymentPromise, ReceivableCase } from '../shared/models';
import { createDemoSnapshot } from './data/demo-snapshot';
import type { StoredAgendaItem } from './operational-store';
import { buildCommercialInbox, buildNotifications, commercialWeek } from './agenda';

describe('bandeja comercial semanal', () => {
  const snapshot = createDemoSnapshot();
  const date = '2026-07-17';

  it('calcula una semana de lunes a domingo', () => {
    expect(commercialWeek(date)).toEqual({ weekStart: '2026-07-13', weekEnd: '2026-07-19' });
    expect(commercialWeek('2026-07-19')).toEqual({ weekStart: '2026-07-13', weekEnd: '2026-07-19' });
  });

  it('reúne señales, promesas, recordatorios y notas sin duplicar al cliente', () => {
    const client = snapshot.clients[0];
    const note: CommercialActivity = {
      id: 'note-1',
      clientId: client.id,
      seller: client.seller,
      type: 'note',
      outcome: 'noted',
      occurredAt: '2026-07-17T14:00:00.000Z',
      note: 'La oficina confirmó el contexto por teléfono.',
      amount: null,
      productIds: [],
      nextActionAt: null,
      createdAt: '2026-07-17T14:01:00.000Z',
    };
    const promise: PaymentPromise = {
      id: 'promise-1',
      clientId: client.id,
      activityId: null,
      seller: client.seller,
      dueAt: '2026-07-12',
      amount: 125000,
      status: 'pending',
      note: 'Transferencia informada',
      createdAt: '2026-07-10T12:00:00Z',
      resolvedAt: null,
    };
    const reminder: StoredAgendaItem = {
      id: 'reminder-1',
      clientId: client.id,
      seller: client.seller,
      scheduledFor: '2026-07-18',
      actionType: 'call',
      reason: 'Recordatorio conservado de una versión anterior.',
      source: 'manual',
      status: 'pending',
      createdAt: '2026-07-10T12:00:00Z',
      completedActivityId: null,
    };
    const workflow: ReceivableCase = {
      clientId: client.id,
      responsible: 'Administración',
      status: 'in_progress',
      nextFollowUpAt: '2026-07-16',
      promiseAmount: null,
      promiseDueAt: null,
      updatedAt: '2026-07-15T10:00:00Z',
      updatedBy: 'Oficina Salice',
      lastComment: 'Revisar el comprobante informado.',
      eventCount: 1,
    };
    const inbox = buildCommercialInbox(snapshot, date, client.seller, [reminder], [note], [promise], [workflow]);
    const entries = inbox.entries.filter((entry) => entry.clientId === client.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].sources).toEqual(expect.arrayContaining(['system', 'promise', 'reminder', 'note']));
    expect(entries[0].signals.map((item) => item.kind)).toEqual(expect.arrayContaining([
      'promise_overdue', 'follow_up_due', 'legacy_reminder',
    ]));
    expect(entries[0].notes).toEqual([note]);
  });

  it('una nota no completa, elimina ni modifica las sugerencias del sistema', () => {
    const client = snapshot.clients[1];
    const note: CommercialActivity = {
      id: 'note-independent',
      clientId: client.id,
      seller: client.seller,
      type: 'visit',
      outcome: 'noted',
      occurredAt: '2026-07-17T14:00:00.000Z',
      note: 'Se dejó constancia de una visita externa.',
      amount: null,
      productIds: [],
      nextActionAt: null,
      createdAt: '2026-07-17T14:01:00.000Z',
    };
    const withoutNote = buildCommercialInbox(snapshot, date, client.seller, [], [], [], []);
    const withNote = buildCommercialInbox(snapshot, date, client.seller, [], [note], [], []);
    const before = withoutNote.entries.find((entry) => entry.clientId === client.id);
    const after = withNote.entries.find((entry) => entry.clientId === client.id);
    expect(before?.signals).toEqual(after?.signals);
    expect(after?.notes).toEqual([note]);
    expect(after).not.toHaveProperty('status');
  });

  it('no convierte un saldo residual menor a $1.000 en señal o alerta', () => {
    const residual = {
      ...snapshot.clients[0],
      balance: 6,
      overdueOutstanding: 6,
      collectionRisk: 80,
      commercialOpportunity: 10,
      visitPriority: 10,
      nextVisitAt: '2026-08-20',
      salesDelta: 0,
      salesBlocked: false,
    };
    const residualSnapshot = { ...snapshot, clients: [residual] };
    const inbox = buildCommercialInbox(residualSnapshot, date, '', [], [], [], []);
    expect(inbox.entries).toEqual([]);
    expect(buildNotifications(residualSnapshot, date, [])).toEqual([]);
  });

  it('conserva bloqueos y clientes sin compra para cobranza, pero no los muestra como oportunidad comercial', () => {
    const blocked = {
      ...snapshot.clients[0],
      salesBlocked: true,
      balance: 50000,
      overdueOutstanding: 50000,
      collectionRisk: 80,
      commercialOpportunity: 92,
      nextVisitAt: date,
    };
    const withoutRecentSales = {
      ...snapshot.clients[1],
      id: 990002,
      balance: 50000,
      overdueOutstanding: 50000,
      collectionRisk: 80,
      sales90d: 0,
      commercialOpportunity: 95,
      nextVisitAt: date,
    };
    const inbox = buildCommercialInbox(
      { ...snapshot, clients: [blocked, withoutRecentSales] },
      date,
      '',
      [],
      [],
      [],
      [],
    );
    const blockedEntry = inbox.entries.find((entry) => entry.clientId === blocked.id);
    const inactiveMixEntry = inbox.entries.find((entry) => entry.clientId === withoutRecentSales.id);
    expect(blockedEntry?.signals.map((item) => item.kind)).toContain('sales_blocked');
    expect(blockedEntry?.signals.map((item) => item.kind)).not.toContain('commercial_opportunity');
    expect(inactiveMixEntry?.signals.map((item) => item.kind)).not.toContain('commercial_opportunity');
  });

  it('mantiene todas las cuentas ordenadas por prioridad P sin ocultar cobranzas u oportunidades', () => {
    const opportunity = {
      ...snapshot.clients[0],
      id: 990003,
      active: true,
      salesBlocked: false,
      sales90d: 250000,
      balance: 0,
      overdueOutstanding: 0,
      collectionRisk: 10,
      commercialOpportunity: 88,
      visitPriority: 55,
      nextVisitAt: date,
    };
    const blockedCollection = {
      ...snapshot.clients[1],
      id: 990004,
      active: true,
      salesBlocked: true,
      sales90d: 250000,
      balance: 150000,
      overdueOutstanding: 150000,
      collectionRisk: 90,
      commercialOpportunity: 95,
      visitPriority: 95,
      nextVisitAt: date,
    };
    const inbox = buildCommercialInbox(
      { ...snapshot, clients: [blockedCollection, opportunity] },
      date,
      '',
      [],
      [],
      [],
      [],
    );

    expect(inbox.entries.map((entry) => entry.clientId)).toEqual([blockedCollection.id, opportunity.id]);
    expect(inbox.entries[0].signals.map((item) => item.kind)).toContain('sales_blocked');
    expect(inbox.entries[1].signals.map((item) => item.kind)).toContain('commercial_opportunity');
  });

  it('excluye clientes inactivos aunque tengan promesas, recordatorios o notas locales', () => {
    const inactive = { ...snapshot.clients[0], active: false, gesiStateId: 2 };
    const promise: PaymentPromise = {
      id: 'inactive-promise',
      clientId: inactive.id,
      activityId: null,
      seller: inactive.seller,
      dueAt: date,
      amount: 50000,
      status: 'pending',
      note: 'No debe incorporar al cliente inactivo.',
      createdAt: '2026-07-15T12:00:00Z',
      resolvedAt: null,
    };
    const note: CommercialActivity = {
      id: 'inactive-note',
      clientId: inactive.id,
      seller: inactive.seller,
      type: 'note',
      outcome: 'noted',
      occurredAt: '2026-07-17T12:00:00Z',
      note: 'Contexto histórico de un cliente inactivo.',
      amount: null,
      productIds: [],
      nextActionAt: null,
      createdAt: '2026-07-17T12:01:00Z',
    };
    const inbox = buildCommercialInbox({ ...snapshot, clients: [inactive] }, date, '', [], [note], [promise], []);
    expect(inbox.entries).toEqual([]);
    expect(inbox.stats).toMatchObject({ clients: 0, systemSignals: 0, dueItems: 0, notes: 0 });
  });

  it('convierte una promesa exigible en alerta sin duplicar el riesgo del mismo cliente', () => {
    const client = snapshot.clients.find((candidate) => candidate.collectionRisk >= 55)!;
    const promises: PaymentPromise[] = [{
      id: 'promise-alert',
      clientId: client.id,
      activityId: null,
      seller: client.seller,
      dueAt: '2026-07-16',
      amount: 75000,
      status: 'pending',
      note: '',
      createdAt: '2026-07-15T12:00:00Z',
      resolvedAt: null,
    }];
    const notifications = buildNotifications(snapshot, date, promises);
    expect(notifications.filter((item) => item.clientId === client.id)).toHaveLength(1);
    expect(notifications.find((item) => item.clientId === client.id)?.type).toBe('promise_overdue');
  });
});
