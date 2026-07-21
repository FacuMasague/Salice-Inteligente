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
    expect(updated?.favorite).toBe(true);
    expect(store.listSavedViews('sales-explorer')).toHaveLength(1);
    expect(store.listSavedViews('receivables')).toHaveLength(0);
    expect(store.deleteSavedView(created.id)).toBe(true);
    expect(store.listSavedViews()).toHaveLength(0);
  });

  it('registra asignación, estado, seguimiento y comentarios como eventos append-only', () => {
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
      actor: 'Prueba oficina',
      comment: 'Promesa informada por el cliente',
    });
    store.addReceivableComment(123, 'Se adjuntó el comprobante de conversación.', 'Prueba oficina');
    const workflow = store.getReceivableCase(123);
    const events = store.listReceivableCaseEvents(123);
    expect(workflow?.responsible).toBe('Cobranzas');
    expect(workflow?.status).toBe('promise');
    expect(workflow?.eventCount).toBe(events.length);
    expect(events.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      'created', 'assignment', 'status', 'follow_up', 'comment',
    ]));
    expect(events.filter((event) => event.eventType === 'comment')).toHaveLength(3);
    const database = new DatabaseSync(store.getOperationalDatabasePath());
    expect(() => database.prepare('DELETE FROM receivable_case_events WHERE client_id = 123').run()).toThrow(/append-only/);
    expect(() => database.prepare('DELETE FROM commercial_goal_changes').run()).toThrow(/append-only/);
    database.close();
  });
});
