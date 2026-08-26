import { afterEach, describe, expect, it, vi } from 'vitest';
import { GesiClient } from './client.js';

const credentials = {
  baseUrl: 'https://gesi.example.test',
  username: 'usuario',
  password: 'clave',
};

afterEach(() => {
  vi.useRealTimers();
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

  it('acepta colecciones dispersas cuando la paginación cuenta claves consultadas y no filas disponibles', async () => {
    const sparsePrices = Array.from({ length: 24 }, (_, index) => ({
      productoID: `producto-${index + 1}`,
      precio: 100 + index,
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, token: 'token-ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        precios: sparsePrices,
        paginacion: { totalPaginas: 1, totalElementos: 40 },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new GesiClient(credentials);
    await client.login();
    const prices = await client.getSparseAll<{ productoID: string; precio: number }>(
      '/api/Maestros/Productos/GetPrecios?codigos=40-productos',
      'precios',
      1000,
    );

    expect(prices).toEqual(sparsePrices);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('pageNumber=1&pageSize=1000');
  });

  it('no tolera ni una fila faltante en una colección estricta', async () => {
    const incomplete = Array.from({ length: 9 }, (_, index) => ({ fojaID: index + 1 }));
    const complete = Array.from({ length: 10 }, (_, index) => ({ fojaID: index + 1 }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, token: 'token-ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        fojasReparto: incomplete,
        paginacion: { totalPaginas: 1, totalElementos: 10 },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        fojasReparto: complete,
        paginacion: { totalPaginas: 1, totalElementos: 10 },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new GesiClient(credentials);
    await client.login();
    const sheets = await client.getStrictAll<{ fojaID: number }>(
      '/api/Ventas/Repartos/GetList?fechaDesde=2025-08-25',
      'fojasReparto',
      1000,
    );

    expect(sheets).toEqual(complete);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reinicia una colección POST con páginas menores tras agotar los reintentos por timeout', async () => {
    vi.useFakeTimers();
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, token: 'token-ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockRejectedValueOnce(timeout)
      .mockRejectedValueOnce(timeout)
      .mockRejectedValueOnce(timeout)
      .mockRejectedValueOnce(timeout)
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        comprobantes: [{ comprobanteID: 1 }],
        paginacion: { totalPaginas: 1, totalElementos: 1 },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const client = new GesiClient(credentials);
    await client.login();
    const capture = client.postAll<{ comprobanteID: number }>(
      '/api/Ventas/Comprobantes/Facturas/GetList',
      'comprobantes',
      { datosOperacion: {} },
      1000,
    );
    await vi.runAllTimersAsync();

    await expect(capture).resolves.toEqual([{ comprobanteID: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(String(fetchMock.mock.calls[1][0])).toContain('pageNumber=1&pageSize=1000');
    expect(String(fetchMock.mock.calls[5][0])).toContain('pageNumber=1&pageSize=1000');
    expect(String(fetchMock.mock.calls[6][0])).toContain('pageNumber=1&pageSize=500');
  });
});
