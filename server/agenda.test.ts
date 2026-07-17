import { describe, expect, it } from 'vitest';
import type { CommercialActivity, PaymentPromise } from '../shared/models';
import { createDemoSnapshot } from './data/demo-snapshot';
import { buildAgendaPayload, buildNotifications } from './agenda';

describe('agenda operativa', () => {
  const snapshot = createDemoSnapshot();
  const date = '2026-07-17';

  it('prioriza promesas vencidas y calcula sólo compromisos pendientes exigibles', () => {
    const client = snapshot.clients[0];
    const promises: PaymentPromise[] = [{
      id: 'promise-1',
      clientId: client.id,
      activityId: null,
      seller: client.seller,
      dueAt: '2026-07-16',
      amount: 125000,
      status: 'pending',
      note: 'Transferencia acordada',
      createdAt: '2026-07-15T12:00:00Z',
      resolvedAt: null,
    }, {
      id: 'promise-2',
      clientId: snapshot.clients[1].id,
      activityId: null,
      seller: snapshot.clients[1].seller,
      dueAt: '2026-07-18',
      amount: 90000,
      status: 'pending',
      note: '',
      createdAt: '2026-07-15T12:00:00Z',
      resolvedAt: null,
    }];
    const agenda = buildAgendaPayload(snapshot, date, '', [], [], promises);
    const promiseEntry = agenda.entries.find((entry) => entry.clientId === client.id);
    expect(promiseEntry?.source).toBe('promise');
    expect(promiseEntry?.priority).toBe(100);
    expect(agenda.stats.overduePromises).toBe(1);
    expect(agenda.stats.promiseAmountDue).toBe(125000);
  });

  it('cuenta una gestión como realizada sólo cuando existe un registro local', () => {
    const client = snapshot.clients[1];
    const activity: CommercialActivity = {
      id: 'activity-1',
      clientId: client.id,
      seller: client.seller,
      type: 'call',
      outcome: 'completed',
      occurredAt: '2026-07-17T14:00:00.000Z',
      note: 'Contacto confirmado',
      amount: null,
      productIds: [],
      nextActionAt: null,
      createdAt: '2026-07-17T14:01:00.000Z',
    };
    const agenda = buildAgendaPayload(snapshot, date, client.seller, [], [activity], []);
    expect(agenda.stats.completed).toBe(1);
    expect(agenda.entries.find((entry) => entry.clientId === client.id)?.status).toBe('completed');
    expect(agenda.definitions.completed).toContain('guardadas localmente');
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

  it('conserva un residual menor a $1.000 sin convertirlo en tarea o alerta', () => {
    const residual = {
      ...snapshot.clients[0],
      balance: 6,
      overdueOutstanding: 6,
      collectionRisk: 80,
      commercialOpportunity: 10,
      nextVisitAt: '2026-08-20',
      salesBlocked: false,
    };
    const residualSnapshot = { ...snapshot, clients: [residual] };
    const agenda = buildAgendaPayload(residualSnapshot, date, '', [], [], []);
    expect(agenda.entries).toEqual([]);
    expect(buildNotifications(residualSnapshot, date, [])).toEqual([]);
  });
});
