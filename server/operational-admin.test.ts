import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { STATUS_TARGETS } from './data/status-targets';
import { createDemoSnapshot } from './data/demo-snapshot';

let directory = '';
let store: typeof import('./operational-store');

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'salice-admin-v040-'));
  const databasePath = join(directory, 'operations.sqlite');
  process.env.SALICE_OPERATIONS_DB_PATH = databasePath;
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE inventory_alert_reviews (
      product_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT NOT NULL DEFAULT '',
      exception_type TEXT NOT NULL DEFAULT 'none',
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      CHECK (status IN ('pending', 'reviewed')),
      CHECK (exception_type IN ('none', 'seasonal', 'discontinued', 'reserved_stock'))
    );
    CREATE INDEX idx_inventory_alert_reviews_status ON inventory_alert_reviews(status, updated_at DESC);
    INSERT INTO inventory_alert_reviews VALUES (
      'producto-legado', 'pending', 'Revisión iniciada antes de incorporar el tercer estado.',
      'none', '2026-07-21T12:00:00.000Z', 'Prueba legado'
    );
  `);
  legacy.close();
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

  it('guarda listas reproducibles y vínculos de oportunidades sin crear un workflow', () => {
    const list = store.createSavedView({
      viewKey: 'products',
      purpose: 'product_opportunities',
      name: 'Mix para revisar',
      filters: { clientId: '123', kind: 'mix_gap', confidence: 'reliable' },
    });
    const note = store.createCommercialNote({
      clientId: 123,
      seller: 'Vendedor prueba',
      type: 'note',
      occurredAt: '2026-07-23T15:00:00.000Z',
      note: 'La oficina documentó que la oportunidad fue conversada fuera del sistema.',
      productIds: ['producto-123'],
    });
    const link = store.createCommercialOpportunityLink({
      savedViewId: list.id,
      clientId: 123,
      productId: 'producto-123',
      recommendationKinds: ['mix_gap'],
      activityId: note.activity.id,
      snapshotAt: '2026-07-22T14:02:00.000Z',
    });
    expect(store.listSavedViews('products', 'product_opportunities')).toEqual([
      expect.objectContaining({ id: list.id, purpose: 'product_opportunities' }),
    ]);
    expect(store.listCommercialOpportunityLinks({ savedViewId: list.id })).toEqual([
      expect.objectContaining({ id: link.id, activityId: note.activity.id, recommendationKinds: ['mix_gap'] }),
    ]);
    expect(note.activity.productIds).toEqual(['producto-123']);
    expect(note.nextAgendaItem).toBeNull();
    expect(note.promise).toBeNull();
    expect(store.deleteSavedView(list.id)).toBe(true);
    expect(store.listCommercialOpportunityLinks({ clientId: 123 })).toEqual([]);
  });

  it('persiste la revisión humana de inventario sin modificar las señales GESI', () => {
    expect(store.listInventoryAlertReviews()).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: 'producto-legado', status: 'unreviewed', note: 'Revisión iniciada antes de incorporar el tercer estado.' }),
    ]));
    const saved = store.saveInventoryAlertReview('producto-123', {
      status: 'reviewed',
      note: 'Se venderá durante la temporada de verano.',
      exceptionType: 'seasonal',
      actor: 'Prueba oficina',
      decisionStatus: 'high_coverage',
      snapshotAt: '2026-07-22T10:00:00.000Z',
    });
    expect(saved).toMatchObject({
      productId: 'producto-123', status: 'reviewed', exceptionType: 'seasonal', updatedBy: 'Prueba oficina',
    });
    const updated = store.saveInventoryAlertReview('producto-123', {
      status: 'in_review', note: 'Stock comprometido para un cliente.', exceptionType: 'reserved_stock', actor: 'Prueba oficina',
      decisionStatus: 'high_coverage', snapshotAt: '2026-07-22T10:00:00.000Z',
    });
    expect(updated).toMatchObject({ status: 'in_review', exceptionType: 'reserved_stock' });
    const reset = store.saveInventoryAlertReview('producto-123', {
      status: 'unreviewed', note: updated.note, exceptionType: updated.exceptionType, actor: 'Prueba oficina',
      decisionStatus: 'high_coverage', snapshotAt: '2026-07-22T10:00:00.000Z',
    });
    expect(reset.status).toBe('unreviewed');
    expect(store.listInventoryAlertReviews()).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: 'producto-123' }),
      expect.objectContaining({ productId: 'producto-legado', status: 'unreviewed' }),
    ]));
    expect(store.listInventoryAlertReviewEvents('producto-123').map((event) => event.eventType)).toEqual([
      'review_saved', 'review_saved', 'review_saved',
    ]);
  });

  it('resuelve y reabre automáticamente una incidencia sin perder el historial', () => {
    const snapshot = createDemoSnapshot();
    const base = snapshot.products[0];
    const productId = 'producto-recurrente';
    const shortage = {
      ...base,
      id: productId,
      stock: 2,
      stockCoverageMonths: .2,
      inventory: { ...base.inventory, status: 'positive' as const, rawAvailableUnit1: 2 },
    };
    store.saveInventoryAlertReview(productId, {
      status: 'reviewed', note: 'Se repuso el producto.', exceptionType: 'none', actor: 'Prueba oficina',
      decisionStatus: 'critical_coverage', snapshotAt: '2026-07-22T10:00:00.000Z',
    });
    const healthy = { ...shortage, stock: 20, stockCoverageMonths: 2, inventory: { ...shortage.inventory, rawAvailableUnit1: 20 } };
    expect(store.reconcileInventoryAlertReviews([healthy], '2026-07-23T10:00:00.000Z')).toMatchObject({ resolved: 1, reopened: 0 });
    expect(store.listInventoryAlertReviews().find((review) => review.productId === productId)).toMatchObject({
      status: 'reviewed', incidentNumber: 1,
    });
    expect(store.reconcileInventoryAlertReviews([shortage], '2026-07-24T10:00:00.000Z')).toMatchObject({ resolved: 0, reopened: 1 });
    expect(store.listInventoryAlertReviews().find((review) => review.productId === productId)).toMatchObject({
      status: 'unreviewed', incidentNumber: 2, decisionStatus: 'critical_coverage', resolvedAt: null,
    });
    expect(store.listInventoryAlertReviewEvents(productId).map((event) => event.eventType)).toEqual([
      'reopened', 'resolved', 'review_saved',
    ]);
    const database = new DatabaseSync(store.getOperationalDatabasePath());
    expect(() => database.prepare('DELETE FROM inventory_alert_review_events WHERE product_id = ?').run(productId)).toThrow(/append-only/);
    database.close();
  });

  it('conserva correcciones vectoriales humanas y un historial inmutable', () => {
    const saved = store.saveProductVectorCorrection('producto-123', {
      key: 'perros', value: 72, reason: 'Validado contra el envase físico', actor: 'Prueba oficina',
    });
    expect(saved).toMatchObject({ productId: 'producto-123', key: 'perros', value: 72 });
    const snapshot = createDemoSnapshot();
    const productId = snapshot.products[0].id;
    store.saveProductVectorCorrection(productId, {
      key: 'gatos', value: 91, reason: 'Ficha técnica verificada por oficina', actor: 'Prueba oficina',
    });
    const merged = store.mergeOperationalData(snapshot);
    expect(merged.products[0].vector.gatos).toBe(91);
    expect(merged.products[0].vectorMeta.evidence.gatos?.[0]).toContain('Corrección de oficina');
    const refreshedSnapshot = structuredClone(snapshot);
    refreshedSnapshot.meta.generatedAt = '2026-07-23T10:00:00.000Z';
    refreshedSnapshot.products[0].vector.gatos = 12;
    refreshedSnapshot.products[0].vectorMeta.evidence.gatos = ['Nueva inferencia algorítmica del snapshot'];
    const mergedAfterRefresh = store.mergeOperationalData(refreshedSnapshot);
    expect(mergedAfterRefresh.products[0].vector.gatos).toBe(91);
    expect(mergedAfterRefresh.products[0].vectorMeta.evidence.gatos).toEqual([
      'Corrección de oficina: Ficha técnica verificada por oficina',
      'Nueva inferencia algorítmica del snapshot',
    ]);
    const removed = store.removeProductVectorCorrection(productId, 'gatos', 'Se corrigió la ficha del fabricante', 'Prueba oficina');
    expect(removed?.eventType).toBe('removed');
    expect(store.listProductVectorCorrections(productId)).toHaveLength(0);
    expect(store.listProductVectorCorrectionEvents(productId).map((event) => event.eventType)).toEqual(['removed', 'set']);
    const database = new DatabaseSync(store.getOperationalDatabasePath());
    expect(() => database.prepare('DELETE FROM product_vector_correction_events WHERE product_id = ?').run(productId)).toThrow(/append-only/);
    database.close();
  });

  it('preserva la historia de precios por snapshot sin sobrescribir observaciones', () => {
    const first = createDemoSnapshot();
    first.meta.source = 'gesi';
    first.meta.generatedAt = '2026-07-20T10:00:00.000Z';
    first.products[0].price = 100;
    expect(store.recordProductPriceSnapshot(first, 'Snapshot inicial de prueba').inserted).toBe(first.products.length);
    expect(store.recordProductPriceSnapshot(first, 'Reintento idempotente').inserted).toBe(0);

    const second = structuredClone(first);
    second.meta.generatedAt = '2026-07-22T10:00:00.000Z';
    second.products[0].price = 120;
    expect(store.recordProductPriceSnapshot(second, 'Snapshot posterior de prueba').inserted).toBe(second.products.length);
    expect(store.listProductPriceSnapshots(first.products[0].id).map((point) => point.referencePrice)).toEqual([100, 120]);
    expect(store.productPriceHistoryStats()).toMatchObject({ snapshots: 2 });

    const database = new DatabaseSync(store.getOperationalDatabasePath());
    expect(() => database.prepare('UPDATE product_price_snapshots SET reference_price = 1').run()).toThrow(/append-only/);
    expect(() => database.prepare('DELETE FROM product_price_snapshots').run()).toThrow(/append-only/);
    database.close();
  });

  it('guarda una nota comercial sin crear tareas, promesas ni planificación', () => {
    const result = store.createCommercialNote({
      clientId: 789,
      seller: 'Vendedor prueba',
      type: 'call',
      occurredAt: '2026-07-23T14:00:00.000Z',
      note: 'La oficina dejó constancia de una conversación realizada fuera del sistema.',
    });
    expect(result.activity).toMatchObject({
      clientId: 789,
      type: 'call',
      outcome: 'noted',
      nextActionAt: null,
      note: 'La oficina dejó constancia de una conversación realizada fuera del sistema.',
    });
    expect(result.promise).toBeNull();
    expect(result.nextAgendaItem).toBeNull();
    expect(store.listAgendaItems({ clientId: 789 })).toEqual([]);
    expect(store.listPromises({ clientId: 789 })).toEqual([]);
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
