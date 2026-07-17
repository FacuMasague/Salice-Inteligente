import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { resolve } from 'node:path';
import { recommendProducts, optimizeRoute } from '../shared/algorithms.js';
import { ensureSnapshot, getBackupCount, getSnapshotPath, loadSnapshot } from './store.js';
import { getOperationalDatabasePath, operationalStatus, saveClientNote } from './operational-store.js';

const app = express();
const port = Number(process.env.PORT || 8787);

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
  console.log(`Salice API v0.0.3 en http://127.0.0.1:${port}`);
  console.log(`Snapshot persistente: ${getSnapshotPath()}`);
  console.log(`Datos operativos: ${getOperationalDatabasePath()}`);
});
