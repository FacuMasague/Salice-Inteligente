import { describe, expect, it } from 'vitest';
import { readApiJson, STALE_SERVER_MESSAGE } from './api-response';

describe('respuestas de la API local', () => {
  it('explica cuando el frontend nuevo recibe HTML de un servidor anterior', async () => {
    const response = new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    await expect(readApiJson(response, 'Error genérico')).rejects.toThrow(STALE_SERVER_MESSAGE);
  });

  it('conserva el mensaje JSON informado por la API', async () => {
    const response = new Response(JSON.stringify({ error: 'Ruta no disponible' }), { status: 404, headers: { 'content-type': 'application/json' } });
    await expect(readApiJson(response, 'Error genérico')).rejects.toThrow('Ruta no disponible');
  });

  it('devuelve una respuesta JSON válida', async () => {
    const response = new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    await expect(readApiJson<{ ok: boolean }>(response, 'Error genérico')).resolves.toEqual({ ok: true });
  });
});
