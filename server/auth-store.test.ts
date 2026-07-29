import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthStore } from './auth-store';

const directories: string[] = [];

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'salice-auth-'));
  directories.push(directory);
  const path = join(directory, 'operations.sqlite');
  return { path, store: new AuthStore(path) };
}

afterEach(() => {
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true });
});

describe('seguridad de usuarios y sesiones', () => {
  it('mantiene pendiente una solicitud hasta que un administrador la aprueba', () => {
    const { store } = setup();
    const admin = store.bootstrapAdmin('administrador', 'ClaveInicial2026', 'Administración');
    const requested = store.register({ username: 'facundo', displayName: 'Facundo Masague', password: 'ClaveSegura2026' });
    expect(requested).toMatchObject({ role: 'office', status: 'pending' });
    expect(store.authenticate('facundo', 'ClaveSegura2026')).toMatchObject({ ok: false, reason: 'pending' });

    const approved = store.reviewUser(requested.id, { status: 'active', reviewerId: admin!.id });
    expect(approved).toMatchObject({ status: 'active', role: 'office', reviewedBy: admin!.id });
    expect(store.authenticate('facundo', 'ClaveSegura2026')).toMatchObject({ ok: true });
    store.close();
  });

  it('no guarda contraseñas ni tokens de sesión en texto legible', () => {
    const { path, store } = setup();
    const admin = store.bootstrapAdmin('administrador', 'ClaveInicial2026', 'Administración')!;
    const session = store.createSession(admin.id);
    store.close();

    const database = new DatabaseSync(path);
    const userRow = database.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?').get(admin.id) as Record<string, unknown>;
    const sessionRow = database.prepare('SELECT token_hash, csrf_hash FROM user_sessions WHERE user_id = ?').get(admin.id) as Record<string, unknown>;
    expect(String(userRow.password_hash)).not.toContain('ClaveInicial2026');
    expect(String(userRow.password_salt)).not.toContain('ClaveInicial2026');
    expect(String(sessionRow.token_hash)).not.toBe(session.token);
    expect(String(sessionRow.csrf_hash)).not.toBe(session.csrfToken);
    database.close();
  });

  it('invalida las sesiones al deshabilitar una cuenta', () => {
    const { store } = setup();
    const admin = store.bootstrapAdmin('administrador', 'ClaveInicial2026', 'Administración')!;
    const user = store.register({ username: 'oficina', displayName: 'Usuario Oficina', password: 'ClaveOficina2026' });
    store.reviewUser(user.id, { status: 'active', reviewerId: admin.id });
    const session = store.createSession(user.id);
    expect(store.getSession(session.token)?.user.id).toBe(user.id);
    store.reviewUser(user.id, { status: 'disabled', reviewerId: admin.id });
    expect(store.getSession(session.token)).toBeNull();
    store.close();
  });

  it('impide deshabilitar al último administrador activo', () => {
    const { store } = setup();
    const admin = store.bootstrapAdmin('administrador', 'ClaveInicial2026', 'Administración')!;
    expect(() => store.reviewUser(admin.id, { status: 'disabled', reviewerId: admin.id })).toThrow(/propia cuenta|administrador activo/);
    store.close();
  });

  it('separa preferencias por usuario', () => {
    const { store } = setup();
    const admin = store.bootstrapAdmin('administrador', 'ClaveInicial2026', 'Administración')!;
    const user = store.register({ username: 'oficina', displayName: 'Usuario Oficina', password: 'ClaveOficina2026' });
    store.savePreferences(admin.id, { favoriteReports: ['reports'] });
    store.savePreferences(user.id, { favoriteReports: ['spt'] });
    expect(store.getPreferences(admin.id)).toEqual({ favoriteReports: ['reports'] });
    expect(store.getPreferences(user.id)).toEqual({ favoriteReports: ['spt'] });
    store.close();
  });
});
