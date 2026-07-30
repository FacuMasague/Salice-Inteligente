import { afterEach, describe, expect, it, vi } from 'vitest';
import { GesiClient } from './client.js';

const credentials = {
  baseUrl: 'https://gesi.example.test',
  username: 'usuario',
  password: 'clave',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GesiClient.login', () => {
  it('reintenta un timeout transitorio y conserva la sesión recuperada', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, token: 'token-ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new GesiClient(credentials);
    await client.login();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no reintenta credenciales rechazadas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new GesiClient(credentials);
    await expect(client.login()).rejects.toThrow('GESI login respondió HTTP 401');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('GesiClient.request', () => {
  it('reintenta una conexión terminada durante una consulta y conserva la respuesta recuperada', async () => {
    const terminated = new TypeError('terminated', {
      cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }),
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, token: 'token-ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockRejectedValueOnce(terminated)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        precios: [{ productoID: 'producto-1', precio: 100 }],
        paginacion: { totalPaginas: 1, totalElementos: 1 },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new GesiClient(credentials);
    await client.login();
    const prices = await client.getAll<{ productoID: string; precio: number }>(
      '/api/Maestros/Productos/GetPrecios?codigos=producto-1',
      'precios',
      40,
    );

    expect(prices).toEqual([{ productoID: 'producto-1', precio: 100 }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reintenta un HTTP 500 transitorio de precios y conserva la respuesta recuperada', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, token: 'token-ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        precios: [{ productoID: 'producto-1', precio: 100 }],
        paginacion: { totalPaginas: 1, totalElementos: 1 },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new GesiClient(credentials);
    await client.login();
    const prices = await client.getAll<{ productoID: string; precio: number }>(
      '/api/Maestros/Productos/GetPrecios?codigos=producto-1',
      'precios',
      40,
    );

    expect(prices).toEqual([{ productoID: 'producto-1', precio: 100 }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('informa el número real de intentos cuando la respuesta no es reintentable', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, token: 'token-ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new GesiClient(credentials);
    await client.login();

    await expect(client.request('/api/inexistente')).rejects.toThrow('falló luego de 1 intento');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
