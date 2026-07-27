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
