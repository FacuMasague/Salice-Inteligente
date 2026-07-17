import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { resolve } from 'node:path';
import { recommendProducts, optimizeRoute } from '../shared/algorithms.js';
import {
  APP_VERSION,
  type CommercialActivityOutcome,
  type CommercialActivityType,
  type PaymentPromiseStatus,
} from '../shared/models.js';
import { buildAgendaPayload, buildNotifications } from './agenda.js';
import { ensureSnapshot, getBackupCount, getSnapshotPath, loadSnapshot } from './store.js';
import {
  createAgendaItem,
  createCommercialActivity,
  getOperationalDatabasePath,
  listActivities,
  listAgendaItems,
  listPromises,
  operationalStatus,
  saveClientNote,
  updatePromiseStatus,
} from './operational-store.js';

const app = express();
const port = Number(process.env.PORT || 8787);
const activityTypes = new Set<CommercialActivityType>(['visit', 'call', 'collection', 'offer']);
const activityOutcomes = new Set<CommercialActivityOutcome>(['completed', 'sale', 'promise', 'no_contact', 'rescheduled', 'no_interest']);
const promiseStatuses = new Set<PaymentPromiseStatus>(['pending', 'kept', 'broken', 'cancelled']);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function localDate(value = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(value);
}

function validDate(value: unknown) {
  const text = String(value || '');
  if (!datePattern.test(text)) return null;
  const parsed = new Date(`${text}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : null;
}

function validDateTime(value: unknown) {
  const text = String(value || '');
  return text && !Number.isNaN(new Date(text).getTime()) ? new Date(text).toISOString() : null;
}

app.use(cors({ origin: ['http://127.0.0.1:5173', 'http://localhost:5173'] }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  const data = await loadSnapshot();
  res.json({ ok: true, version: data.meta.version, source: data.meta.source, generatedAt: data.meta.generatedAt });
});

app.get('/api/dashboard', async (_req, res) => {
  res.json(await loadSnapshot());
});

app.get('/api/system/status', async (_req, res) => {
  res.json({ ...operationalStatus(), backups: await getBackupCount() });
});

app.get('/api/agenda', async (req, res) => {
  const date = validDate(req.query.date) || localDate();
  const seller = String(req.query.seller || '').trim().slice(0, 120);
  const data = await loadSnapshot();
  const activities = listActivities({ limit: 1000 });
  const promises = listPromises({ limit: 1000 });
  const items = listAgendaItems({ date, seller: seller || undefined });
  res.json(buildAgendaPayload(data, date, seller, items, activities, promises));
});

app.get('/api/notifications', async (_req, res) => {
  const data = await loadSnapshot();
  const date = localDate();
  const items = buildNotifications(data, date, listPromises({ status: 'pending', dueThrough: date, limit: 200 }));
  res.json({ date, count: items.length, items });
});

app.get('/api/clients/:id/operations', async (req, res) => {
  const clientId = Number(req.params.id);
  const data = await loadSnapshot();
  if (!data.clients.some((client) => client.id === clientId)) return res.status(404).json({ error: 'Cliente no encontrado' });
  return res.json({
    activities: listActivities({ clientId, limit: 50 }),
    promises: listPromises({ clientId, limit: 50 }),
    agenda: listAgendaItems({ clientId, includeCancelled: false }).slice(0, 50),
  });
});

app.post('/api/activities', async (req, res) => {
  const data = await loadSnapshot();
  const clientId = Number(req.body?.clientId);
  const client = data.clients.find((item) => item.id === clientId);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!client.active) return res.status(409).json({ error: 'El cliente está inactivo en GESI; la gestión comercial no se puede agregar a la agenda activa.' });
  const type = String(req.body?.type || '') as CommercialActivityType;
  const outcome = String(req.body?.outcome || '') as CommercialActivityOutcome;
  if (!activityTypes.has(type)) return res.status(400).json({ error: 'Tipo de gestión inválido' });
  if (!activityOutcomes.has(outcome)) return res.status(400).json({ error: 'Resultado de gestión inválido' });
  const occurredAt = req.body?.occurredAt ? validDateTime(req.body.occurredAt) : new Date().toISOString();
  if (!occurredAt) return res.status(400).json({ error: 'La fecha y hora de la gestión no son válidas' });
  const occurredDate = localDate(new Date(occurredAt));
  const nextActionAt = req.body?.nextActionAt ? validDate(req.body.nextActionAt) : null;
  if (req.body?.nextActionAt && !nextActionAt) return res.status(400).json({ error: 'La fecha de próxima acción no es válida' });
  if (nextActionAt && nextActionAt < occurredDate) return res.status(400).json({ error: 'La próxima acción no puede quedar antes de la gestión' });
  if (outcome === 'rescheduled' && !nextActionAt) return res.status(400).json({ error: 'Indicá la nueva fecha para una gestión reprogramada' });
  const rawAmount = req.body?.amount == null || req.body.amount === '' ? null : Number(req.body.amount);
  if (rawAmount != null && (!Number.isFinite(rawAmount) || rawAmount < 0)) return res.status(400).json({ error: 'El importe no es válido' });
  const amount = rawAmount === 0 ? null : rawAmount;
  const knownProducts = new Set(data.products.map((product) => product.id));
  const requestedProductIds: string[] = Array.isArray(req.body?.productIds)
    ? req.body.productIds.map((value: unknown) => String(value))
    : [];
  const productIds = [...new Set(requestedProductIds.filter((id) => knownProducts.has(id)))].slice(0, 20);
  let promise: { dueAt: string; amount: number; note: string } | null = null;
  if (outcome === 'promise') {
    const dueAt = validDate(req.body?.promise?.dueAt);
    const amount = Number(req.body?.promise?.amount);
    if (!dueAt || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Indicá fecha e importe válidos para la promesa' });
    if (dueAt < occurredDate) return res.status(400).json({ error: 'La promesa no puede vencer antes de la gestión' });
    promise = { dueAt, amount, note: String(req.body?.promise?.note || '').trim().slice(0, 500) };
  } else if (req.body?.promise) {
    return res.status(400).json({ error: 'Elegí “Promesa de pago” como resultado para guardar una promesa' });
  }
  const result = createCommercialActivity({
    clientId,
    seller: client.seller,
    type,
    outcome,
    occurredAt,
    note: String(req.body?.note || '').trim().slice(0, 1000),
    amount,
    productIds,
    nextActionAt,
    agendaItemId: req.body?.agendaItemId ? String(req.body.agendaItemId).slice(0, 120) : null,
    promise,
  });
  return res.status(201).json(result);
});

app.post('/api/agenda', async (req, res) => {
  const data = await loadSnapshot();
  const clientId = Number(req.body?.clientId);
  const client = data.clients.find((item) => item.id === clientId);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (!client.active) return res.status(409).json({ error: 'El cliente está inactivo en GESI' });
  const scheduledFor = validDate(req.body?.scheduledFor);
  const actionType = String(req.body?.actionType || '') as CommercialActivityType;
  if (!scheduledFor || !activityTypes.has(actionType)) return res.status(400).json({ error: 'Fecha o tipo de acción inválidos' });
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  if (!reason) return res.status(400).json({ error: 'Indicá el motivo de la tarea' });
  return res.status(201).json(createAgendaItem({ clientId, seller: client.seller, scheduledFor, actionType, reason }));
});

app.patch('/api/promises/:id', (req, res) => {
  const status = String(req.body?.status || '') as PaymentPromiseStatus;
  if (!promiseStatuses.has(status)) return res.status(400).json({ error: 'Estado de promesa inválido' });
  const promise = updatePromiseStatus(String(req.params.id), status);
  if (!promise) return res.status(404).json({ error: 'Promesa no encontrada' });
  return res.json({ promise });
});

app.get('/api/clients/:id/recommendations', async (req, res) => {
  const data = await loadSnapshot();
  const client = data.clients.find((item) => item.id === Number(req.params.id));
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
  return res.json({ recommendations: recommendProducts(client, data.clients, data.products) });
});

app.post('/api/routes/optimize', async (req, res) => {
  const selectedIds = Array.isArray(req.body?.clientIds) ? req.body.clientIds.map(Number) : [];
  if (!selectedIds.length) return res.status(400).json({ error: 'Elegí al menos un cliente' });
  const data = await loadSnapshot();
  const visitMinutes = Number(req.body?.visitMinutes);
  const maxWorkMinutes = Number(req.body?.maxWorkMinutes);
  return res.json(optimizeRoute(selectedIds, data.clients, {
    visitMinutes: Number.isFinite(visitMinutes) ? visitMinutes : undefined,
    maxWorkMinutes: Number.isFinite(maxWorkMinutes) ? maxWorkMinutes : undefined,
  }));
});

app.patch('/api/clients/:id/note', async (req, res) => {
  const note = String(req.body?.note || '').trim().slice(0, 500);
  const data = await loadSnapshot();
  const client = data.clients.find((item) => item.id === Number(req.params.id));
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
  saveClientNote(client.id, note);
  return res.json({ ok: true, note });
});

if (process.env.NODE_ENV === 'production') {
  const dist = resolve(process.cwd(), 'dist');
  app.use(express.static(dist));
  app.use((_req, res) => res.sendFile(resolve(dist, 'index.html')));
}

await ensureSnapshot();
app.listen(port, '127.0.0.1', () => {
  console.log(`Salice API v${APP_VERSION} en http://127.0.0.1:${port}`);
  console.log(`Snapshot persistente: ${getSnapshotPath()}`);
  console.log(`Datos operativos: ${getOperationalDatabasePath()}`);
});
