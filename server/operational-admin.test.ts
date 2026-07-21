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

describe('administrative persistence', () => {
  it('versions goals, preserves changes, and activates only through an explicit action', () => {
    const initial = store.getCommercialGoalsPayload();
    expect(initial.selectedVersion.status).toBe('active');
    expect(initial.selectedVersion.rowCount).toBe(STATUS_TARGETS.length);

    const draft = store.createCommercialGoalVersion({
      name: 'Editable test plan',
      cloneFromId: initial.selectedVersion.id,
      actor: 'Office test',
    });
    expect(draft.status).toBe('draft');
    expect(draft.rowCount).toBe(STATUS_TARGETS.length);
    const first = store.listCommercialGoals(draft.id)[0];
    const updated = store.updateCommercialGoalRow(draft.id, first.id, {
      ...first,
      kilos: Number(first.kilos ?? 0) + 1,
      actor: 'Office test',
      comment: 'Verifiable adjustment',
    });
    expect(updated?.kilos).toBe(Number(first.kilos ?? 0) + 1);

    const added = store.createCommercialGoalRow(draft.id, {
      month: first.month,
      product: 'Additional test goal',
      seller: first.seller,
      kilos: 25,
      accounts: null,
      invoicing: null,
      actor: 'Office test',
    });
    expect(store.deleteCommercialGoalRow(draft.id, added.id, 'Office test')).toBe(true);
    store.activateCommercialGoalVersion(draft.id, 'Office test', 'Test activation');

    expect(store.getActiveCommercialGoalPlan().version.id).toBe(draft.id);
    expect(store.listCommercialGoalVersions().find((version) => version.id === initial.selectedVersion.id)?.status).toBe('archived');
    expect(store.listCommercialGoalChanges(draft.id).map((change) => change.eventType)).toEqual(expect.arrayContaining([
      'created', 'row_created', 'row_updated', 'row_deleted', 'activated',
    ]));
    expect(() => store.updateCommercialGoalRow(draft.id, first.id, {
      ...first,
      actor: 'Office test',
    })).toThrow(/Only draft versions can be edited/);
  });

  it('saves frequent views without mixing surfaces', () => {
    const created = store.createSavedView({
      viewKey: 'sales-explorer',
      name: 'Last ninety days',
      filters: { from: '2026-04-22', to: '2026-07-20' },
    });
    const updated = store.updateSavedView(created.id, { favorite: true, filters: { seller: 'Resale' } });
    const brandView = store.createSavedView({
      viewKey: 'brands',
      name: 'Searched brand',
      filters: { query: 'Northstar', productQuery: 'cat', selectedBrand: 'Northstar' },
    });
    expect(updated?.favorite).toBe(true);
    expect(store.listSavedViews('sales-explorer')).toHaveLength(1);
    expect(store.listSavedViews('brands')[0]?.filters).toMatchObject({ query: 'Northstar', productQuery: 'cat' });
    expect(store.listSavedViews('receivables')).toHaveLength(0);
    expect(store.deleteSavedView(created.id)).toBe(true);
    expect(store.deleteSavedView(brandView.id)).toBe(true);
    expect(store.listSavedViews()).toHaveLength(0);
  });

  it('records one event per follow-up, materializes promises, and restores state after deletion', () => {
    store.saveReceivableCase({
      clientId: 123,
      responsible: 'Administration',
      status: 'to_contact',
      nextFollowUpAt: '2026-07-22',
      actor: 'Office test',
      comment: 'First contact pending',
    });
    store.saveReceivableCase({
      clientId: 123,
      responsible: 'Collections',
      status: 'promise',
      nextFollowUpAt: '2026-07-25',
      promiseAmount: 125_000,
      promiseDueAt: '2026-07-24',
      actor: 'Office test',
      comment: 'Promise reported by the customer',
    });
    store.addReceivableComment(123, 'Conversation evidence attached.', 'Office test');
    store.syncReceivablePaymentPromise(123, 'Test seller');
    const workflow = store.getReceivableCase(123);
    const events = store.listReceivableCaseEvents(123);
    expect(workflow?.responsible).toBe('Collections');
    expect(workflow?.status).toBe('promise');
    expect(workflow?.promiseAmount).toBe(125_000);
    expect(workflow?.promiseDueAt).toBe('2026-07-24');
    expect(events).toHaveLength(3);
    expect(workflow?.eventCount).toBe(3);
    expect(events.map((event) => event.eventType)).toEqual(expect.arrayContaining(['created', 'follow_up', 'comment']));
    expect(events.some((event) => event.eventType === 'status')).toBe(false);
    expect(store.listPromises({ clientId: 123 })).toEqual([expect.objectContaining({
      amount: 125_000, dueAt: '2026-07-24', status: 'pending', seller: 'Test seller',
    })]);
    const removable = events.find((event) => event.eventType === 'follow_up')!;
    expect(store.deleteReceivableCaseEvent(123, removable.id, 'Office test')).toBe(true);
    store.syncReceivablePaymentPromise(123, 'Test seller');
    expect(store.listReceivableCaseEvents(123).find((event) => event.id === removable.id)).toMatchObject({
      deletedBy: 'Office test',
    });
    expect(store.getReceivableCase(123)).toMatchObject({
      responsible: 'Administration', status: 'to_contact', nextFollowUpAt: '2026-07-22',
      promiseAmount: null, promiseDueAt: null, eventCount: 2,
    });
    expect(store.listPromises({ clientId: 123 })).toHaveLength(0);

    expect(store.setClientTrendReviewed(123, 'decline', true)).toMatchObject({ clientId: 123, direction: 'decline' });
    expect(store.listClientTrendReviews('decline')).toEqual([expect.objectContaining({ clientId: 123 })]);
    expect(store.setClientTrendReviewed(123, 'decline', false)).toBeNull();
    expect(store.listClientTrendReviews('decline')).toHaveLength(0);

    const database = new DatabaseSync(store.getOperationalDatabasePath());
    store.saveReceivableCase({
      clientId: 456, responsible: 'Collections', status: 'promise', nextFollowUpAt: null,
      promiseAmount: 10_500, promiseDueAt: '2026-07-30', actor: 'Historical test',
    });
    const legacyEvent = store.listReceivableCaseEvents(456)[0];
    database.prepare('UPDATE receivable_case_events SET deleted_at = ?, deleted_by = ? WHERE id = ?')
      .run('2026-07-21T12:00:00.000Z', 'Previous version', legacyEvent.id);
    expect(store.getReceivableCase(456)?.status).toBe('promise');
    store.rebuildAllReceivableCasesFromEvents();
    expect(store.getReceivableCase(456)).toBeNull();

    expect(() => database.prepare('DELETE FROM receivable_case_events WHERE client_id = 123').run()).toThrow(/append-only/);
    expect(() => database.prepare('DELETE FROM commercial_goal_changes').run()).toThrow(/append-only/);
    database.close();
  });
});
