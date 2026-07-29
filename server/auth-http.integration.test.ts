import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let child: ChildProcess | null = null;
let directory = '';
let baseUrl = '';
let adminCookie = '';
let adminCsrf = '';

async function freePort() {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

function setCookieValues(response: Response) {
  return typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') ?? ''];
}

function cookies(response: Response) {
  return setCookieValues(response).map((value) => value.split(';')[0]).filter(Boolean).join('; ');
}

function csrfFromCookie(value: string) {
  const entry = value.split('; ').find((item) => item.startsWith('salice_csrf='));
  return entry ? decodeURIComponent(entry.slice('salice_csrf='.length)) : '';
}

async function waitForServer(output: () => string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // El proceso todavía está iniciando.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`El servidor de prueba no inició.\n${output()}`);
}

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'salice-auth-http-'));
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  let output = '';
  child = spawn(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'server/index.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      SALICE_AUTO_REFRESH_ENABLED: 'false',
      SALICE_OPERATIONS_DB_PATH: join(directory, 'operations.sqlite'),
      SALICE_INITIAL_ADMIN_USERNAME: 'adminintegracion',
      SALICE_INITIAL_ADMIN_PASSWORD: 'ClaveIntegracion2026',
      SALICE_INITIAL_ADMIN_ROLE: 'developer',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk) => { output += String(chunk); });
  child.stderr?.on('data', (chunk) => { output += String(chunk); });
  await waitForServer(() => output);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'adminintegracion', password: 'ClaveIntegracion2026' }),
  });
  adminCookie = cookies(login);
  adminCsrf = csrfFromCookie(adminCookie);
}, 30_000);

afterAll(async () => {
  if (child && child.exitCode == null) {
    child.kill('SIGTERM');
    await new Promise<void>((resolveExit) => {
      child?.once('exit', () => resolveExit());
      setTimeout(resolveExit, 2_000);
    });
  }
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe('protección HTTP de los datos privados', () => {
  it('mantiene público un health mínimo pero bloquea todos los datos sin sesión', async () => {
    const health = await fetch(`${baseUrl}/api/health`);
    const healthPayload = await health.json() as Record<string, unknown>;
    expect(health.status).toBe(200);
    expect(healthPayload).toEqual({ ok: true, version: '1.2.1' });
    expect(healthPayload).not.toHaveProperty('generatedAt');
    expect(healthPayload).not.toHaveProperty('source');
    expect(health.headers.get('content-security-policy')).toContain('https://*.tile.openstreetmap.org');

    for (const path of ['/api/dashboard', '/api/reports/general/meta', '/api/admin/sales/meta', '/api/system/status']) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status, path).toBe(401);
    }
  });

  it('exige CSRF para toda escritura autenticada', async () => {
    const withoutCsrf = await fetch(`${baseUrl}/api/account/preferences`, {
      method: 'PATCH',
      headers: { Cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ favoriteReports: ['reports'] }),
    });
    expect(withoutCsrf.status).toBe(403);

    const withCsrf = await fetch(`${baseUrl}/api/account/preferences`, {
      method: 'PATCH',
      headers: { Cookie: adminCookie, 'X-Salice-CSRF': adminCsrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({ favoriteReports: ['reports'] }),
    });
    expect(withCsrf.status).toBe(200);

    const heartbeat = await fetch(`${baseUrl}/api/account/activity`, {
      method: 'POST',
      headers: { Cookie: adminCookie, 'X-Salice-CSRF': adminCsrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeSeconds: 30 }),
    });
    expect(heartbeat.status).toBe(200);

    const activity = await fetch(`${baseUrl}/api/system/user-activity`, { headers: { Cookie: adminCookie } });
    expect(activity.status).toBe(200);
    const activityPayload = await activity.json() as {
      users: Array<{ activeSeconds: number; accessCount: number }>;
      changes: Array<{ path: string }>;
    };
    expect(activityPayload.users[0]).toMatchObject({ activeSeconds: 30, accessCount: 1 });
    expect(activityPayload.changes.some((change) => change.path === '/api/account/preferences')).toBe(true);
    expect(activityPayload.changes.some((change) => change.path === '/api/account/activity')).toBe(false);
  });

  it('admite el proxy local conocido y rechaza orígenes externos', async () => {
    const localLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5173' },
      body: JSON.stringify({ username: 'adminintegracion', password: 'ClaveIntegracion2026' }),
    });
    expect(localLogin.status).toBe(200);
    expect(setCookieValues(localLogin).every((value) => !/;\s*Secure/i.test(value))).toBe(true);

    const secureLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
      body: JSON.stringify({ username: 'adminintegracion', password: 'ClaveIntegracion2026' }),
    });
    expect(secureLogin.status).toBe(200);
    expect(setCookieValues(secureLogin).filter(Boolean).every((value) => /;\s*Secure/i.test(value))).toBe(true);

    const foreignLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://sitio-ajeno.example' },
      body: JSON.stringify({ username: 'adminintegracion', password: 'ClaveIntegracion2026' }),
    });
    expect(foreignLogin.status).toBe(403);
  });

  it('no permite que una cuenta pendiente o de oficina administre accesos', async () => {
    const registration = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Oficina Prueba', password: 'ClaveOficina2026' }),
    });
    expect(registration.status).toBe(201);
    const registered = await registration.json() as { user: { id: string } };

    const pendingLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Oficina Prueba', password: 'ClaveOficina2026' }),
    });
    expect(pendingLogin.status).toBe(403);

    const approval = await fetch(`${baseUrl}/api/system/users/${registered.user.id}`, {
      method: 'PATCH',
      headers: { Cookie: adminCookie, 'X-Salice-CSRF': adminCsrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', role: 'office' }),
    });
    expect(approval.status).toBe(200);

    const officeLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Oficina Prueba', password: 'ClaveOficina2026' }),
    });
    const officeCookie = cookies(officeLogin);
    expect(officeLogin.status).toBe(200);
    expect((await fetch(`${baseUrl}/api/dashboard`, { headers: { Cookie: officeCookie } })).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/system/users`, { headers: { Cookie: officeCookie } })).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/system/user-activity`, { headers: { Cookie: officeCookie } })).status).toBe(403);

    const promotion = await fetch(`${baseUrl}/api/system/users/${registered.user.id}`, {
      method: 'PATCH',
      headers: { Cookie: adminCookie, 'X-Salice-CSRF': adminCsrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', role: 'admin' }),
    });
    expect(promotion.status).toBe(200);
    const promotedLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Oficina Prueba', password: 'ClaveOficina2026' }),
    });
    const promotedCookie = cookies(promotedLogin);
    expect((await fetch(`${baseUrl}/api/system/users`, { headers: { Cookie: promotedCookie } })).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/system/user-activity`, { headers: { Cookie: promotedCookie } })).status).toBe(403);

    const disabled = await fetch(`${baseUrl}/api/system/users/${registered.user.id}`, {
      method: 'PATCH',
      headers: { Cookie: adminCookie, 'X-Salice-CSRF': adminCsrf, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'disabled', role: 'office' }),
    });
    expect(disabled.status).toBe(200);
    expect((await fetch(`${baseUrl}/api/dashboard`, { headers: { Cookie: officeCookie } })).status).toBe(401);
  });
});
