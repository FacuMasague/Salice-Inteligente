import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { STATUS_TARGETS } from './data/status-targets';

let directory = '';
let store: typeof import('./operational-store');

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'salice-admin-v040-'));
  process.env.SALICE_OPERATIONS_DB_PATH = join(directory, 'operations.sqlite');
  vi.resetModules();
  store = await import('./operational-store');
});

afterAll(() => {
  delete process.env.SALICE_OPERATIONS_DB_PATH;
  rmSync(directory, { recursive: true, force: true });
});

describe('persistencia administrativa v0.4.0', () => {
  it('versiona objetivos, conserva cambios y sólo activa mediante una acción explícita', () => {
    const initial = store.getCommercialGoalsPayload();
    expect(initial.selectedVersion.status).toBe('active');
    expect(initial.selectedVersion.rowCount).toBe(STATUS_TARGETS.length);

    const draft = store.createCommercialGoalVersion({
      name: 'Plan de prueba administrable',
      cloneFromId: initial.selectedVersion.id,
      actor: 'Prueba oficina',
    });
    expect(draft.status).toBe('draft');
    expect(draft.rowCount).toBe(STATUS_TARGETS.length);
    const first = store.listCommercialGoals(draft.id)[0];
    const updated = store.updateCommercialGoalRow(draft.id, first.id, {
      ...first,
      kilos: Number(first.kilos ?? 0) + 1,
      actor: 'Prueba oficina',
      comment: 'Ajuste verificable',
    });
    expect(updated?.kilos).toBe(Number(first.kilos ?? 0) + 1);

    const added = store.createCommercialGoalRow(draft.id, {
      month: first.month,
      product: 'Objetivo adicional de prueba',
      seller: first.seller,
      kilos: 25,
      accounts: null,
      invoicing: null,
      actor: 'Prueba oficina',
    });
    expect(store.deleteCommercialGoalRow(draft.id, added.id, 'Prueba oficina')).toBe(true);
    store.activateCommercialGoalVersion(draft.id, 'Prueba oficina', 'Activación de prueba');

    expect(store.getActiveCommercialGoalPlan().version.id).toBe(draft.id);
    expect(store.listCommercialGoalVersions().find((version) => version.id === initial.selectedVersion.id)?.status).toBe('archived');
    expect(store.listCommercialGoalChanges(draft.id).map((change) => change.eventType)).toEqual(expect.arrayContaining([
      'created', 'row_created', 'row_updated', 'row_deleted', 'activated',
    ]));
    expect(() => store.updateCommercialGoalRow(draft.id, first.id, {
      ...first,
      actor: 'Prueba oficina',
    })).toThrow(/Sólo se pueden modificar versiones en borrador/);
  });

  it('guarda vistas frecuentes sin mezclar las superficies', () => {
    const created = store.createSavedView({
      viewKey: 'sales-explorer',
      name: 'Últimos noventa días',
      filters: { from: '2026-04-22', to: '2026-07-20' },
    });
    const updated = store.updateSavedView(created.id, { favorite: true, filters: { seller: 'Reventas' } });
    const brandView = store.createSavedView({
      viewKey: 'brands',
      name: 'Marca buscada',
      filters: { query: 'MaxPet', productQuery: 'gato', selectedBrand: 'MaxPet' },
    });
    expect(updated?.favorite).toBe(true);
    expect(store.listSavedViews('sales-explorer')).toHaveLength(1);
    expect(store.listSavedViews('brands')[0]?.filters).toMatchObject({ query: 'MaxPet', productQuery: 'gato' });
    expect(store.listSavedViews('receivables')).toHaveLength(0);
    expect(store.deleteSavedView(created.id)).toBe(true);
    expect(store.deleteSavedView(brandView.id)).toBe(true);
    expect(store.listSavedViews()).toHaveLength(0);
  });

  it('registra un evento por seguimiento, materializa promesas y revierte el estado al borrar', () => {
    store.saveReceivableCase({
      clientId: 123,
      responsible: 'Administración',
      status: 'to_contact',
      nextFollowUpAt: '2026-07-22',
      actor: 'Prueba oficina',
      comment: 'Primer contacto pendiente',
    });
    store.saveReceivableCase({
      clientId: 123,
      responsible: 'Cobranzas',
      status: 'promise',
      nextFollowUpAt: '2026-07-25',
      promiseAmount: 125_000,
      promiseDueAt: '2026-07-24',
      actor: 'Prueba oficina',
      comment: 'Promesa informada por el cliente',
    });
    store.addReceivableComment(123, 'Se adjuntó el comprobante de conversación.', 'Prueba oficina');
    store.syncReceivablePaymentPromise(123, 'Vendedor prueba');
    const workflow = store.getReceivableCase(123);
    const events = store.listReceivableCaseEvents(123);
    expect(workflow?.responsible).toBe('Cobranzas');
    expect(workflow?.status).toBe('promise');
    expect(workflow?.promiseAmount).toBe(125_000);
    expect(workflow?.promiseDueAt).toBe('2026-07-24');
    expect(events).toHaveLength(3);
    expect(workflow?.eventCount).toBe(3);
    expect(events.map((event) => event.eventType)).toEqual(expect.arrayContaining(['created', 'follow_up', 'comment']));
    expect(events.some((event) => event.eventType === 'status')).toBe(false);
    expect(store.listPromises({ clientId: 123 })).toEqual([expect.objectContaining({
      amount: 125_000, dueAt: '2026-07-24', status: 'pending', seller: 'Vendedor prueba',
    })]);
    const removable = events.find((event) => event.eventType === 'follow_up')!;
    expect(store.deleteReceivableCaseEvent(123, removable.id, 'Prueba oficina')).toBe(true);
    store.syncReceivablePaymentPromise(123, 'Vendedor prueba');
    expect(store.listReceivableCaseEvents(123).find((event) => event.id === removable.id)).toMatchObject({
      deletedBy: 'Prueba oficina',
    });
    expect(store.getReceivableCase(123)).toMatchObject({
      responsible: 'Administración', status: 'to_contact', nextFollowUpAt: '2026-07-22',
      promiseAmount: null, promiseDueAt: null, eventCount: 2,
    });
    expect(store.listPromises({ clientId: 123 })).toHaveLength(0);

    expect(store.setClientTrendReviewed(123, 'decline', true)).toMatchObject({ clientId: 123, direction: 'decline' });
    expect(store.listClientTrendReviews('decline')).toEqual([expect.objectContaining({ clientId: 123 })]);
    expect(store.setClientTrendReviewed(123, 'decline', false)).toBeNull();
    expect(store.listClientTrendReviews('decline')).toHaveLength(0);

    const database = new DatabaseSync(store.getOperationalDatabasePath());
    store.saveReceivableCase({
      clientId: 456, responsible: 'Cobranzas', status: 'promise', nextFollowUpAt: null,
      promiseAmount: 10_500, promiseDueAt: '2026-07-30', actor: 'Prueba legado',
    });
    const legacyEvent = store.listReceivableCaseEvents(456)[0];
    database.prepare('UPDATE receivable_case_events SET deleted_at = ?, deleted_by = ? WHERE id = ?')
      .run('2026-07-21T12:00:00.000Z', 'Versión anterior', legacyEvent.id);
    expect(store.getReceivableCase(456)?.status).toBe('promise');
    store.rebuildAllReceivableCasesFromEvents();
    expect(store.getReceivableCase(456)).toBeNull();

    expect(() => database.prepare('DELETE FROM receivable_case_events WHERE client_id = 123').run()).toThrow(/append-only/);
    expect(() => database.prepare('DELETE FROM commercial_goal_changes').run()).toThrow(/append-only/);
    database.close();
  });
});
