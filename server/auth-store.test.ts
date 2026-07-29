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
    const admin = store.bootstrapAdmin('Administrador Salice', 'ClaveInicial2026');
    const requested = store.register({ username: 'Facundo Masague', password: 'Clave2026' });
    expect(requested).toMatchObject({
      username: 'Facundo Masague',
      displayName: 'Facundo Masague',
      role: 'office',
      status: 'pending',
    });
    expect(store.authenticate('facundo masague', 'Clave2026')).toMatchObject({ ok: false, reason: 'pending' });

    const approved = store.reviewUser(requested.id, { status: 'active', reviewerId: admin!.id });
    expect(approved).toMatchObject({ status: 'active', role: 'office', reviewedBy: admin!.id });
    expect(store.authenticate('FACUNDO MASAGUE', 'Clave2026')).toMatchObject({ ok: true });
    store.close();
  });

  it('no guarda contraseñas ni tokens de sesión en texto legible', () => {
    const { path, store } = setup();
    const admin = store.bootstrapAdmin('administrador', 'ClaveInicial2026')!;
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
    const admin = store.bootstrapAdmin('administrador', 'ClaveInicial2026')!;
    const user = store.register({ username: 'Usuario Oficina', password: 'ClaveOficina2026' });
    store.reviewUser(user.id, { status: 'active', reviewerId: admin.id });
    const session = store.createSession(user.id);
    expect(store.getSession(session.token)?.user.id).toBe(user.id);
    store.reviewUser(user.id, { status: 'disabled', reviewerId: admin.id });
    expect(store.getSession(session.token)).toBeNull();
    store.close();
  });

  it('impide deshabilitar al último administrador activo', () => {
    const { store } = setup();
    const admin = store.bootstrapAdmin('administrador', 'ClaveInicial2026')!;
    expect(() => store.reviewUser(admin.id, { status: 'disabled', reviewerId: admin.id })).toThrow(/propia cuenta|administrador activo/);
    store.close();
  });

  it('separa preferencias por usuario', () => {
    const { store } = setup();
    const admin = store.bootstrapAdmin('administrador', 'ClaveInicial2026')!;
    const user = store.register({ username: 'Usuario Oficina', password: 'ClaveOficina2026' });
    store.savePreferences(admin.id, { favoriteReports: ['reports'] });
    store.savePreferences(user.id, { favoriteReports: ['spt'] });
    expect(store.getPreferences(admin.id)).toEqual({ favoriteReports: ['reports'] });
    expect(store.getPreferences(user.id)).toEqual({ favoriteReports: ['spt'] });
    store.close();
  });

  it('registra accesos, actividad validada y cambios para Developer', () => {
    const { store } = setup();
    const developer = store.bootstrapAdmin('Developer Salice', 'ClaveDeveloper2026', 'developer')!;
    const session = store.createSession(developer.id, { ipAddress: '127.0.0.1', userAgent: 'Navegador de prueba' });
    expect(store.recordActivity(store.getSession(session.token)!.id, developer.id, 30)).toBe(30);
    store.recordChange({
      userId: developer.id,
      sessionId: store.getSession(session.token)!.id,
      method: 'PATCH',
      path: '/api/account/preferences',
      action: 'Actualizó preferencias personales',
    });
    const activity = store.developerActivity();
    expect(activity.antiAfkMinutes).toBe(5);
    expect(activity.users[0]).toMatchObject({ accessCount: 1, activeSeconds: 30, changeCount: 1 });
    expect(activity.accesses[0]).toMatchObject({ ipAddress: '127.0.0.1', userAgent: 'Navegador de prueba' });
    expect(activity.changes[0]).toMatchObject({ method: 'PATCH', action: 'Actualizó preferencias personales' });
    store.close();
  });

  it('reserva la gestión del rol Developer para otro Developer', () => {
    const { store } = setup();
    const developer = store.bootstrapAdmin('Developer Salice', 'ClaveDeveloper2026', 'developer')!;
    const admin = store.register({ username: 'Administrador', password: 'ClaveAdmin2026' });
    store.reviewUser(admin.id, { status: 'active', role: 'admin', reviewerId: developer.id });
    expect(() => store.reviewUser(developer.id, { status: 'active', role: 'admin', reviewerId: admin.id })).toThrow(/Developer/);
    expect(() => store.reviewUser(developer.id, { status: 'disabled', role: 'developer', reviewerId: admin.id })).toThrow(/Developer/);
    expect(store.getUser(developer.id)?.role).toBe('developer');
    expect(store.getUser(developer.id)?.status).toBe('active');
    store.close();
  });

  it('eleva a Developer la cuenta inicial existente sin reemplazar sus credenciales', () => {
    const { store } = setup();
    const admin = store.bootstrapAdmin('Facu Masague', 'ClaveOriginal2026')!;
    const developer = store.bootstrapAdmin('Facu Masague', 'OtraClaveNoAplicada2026', 'developer')!;
    expect(developer).toMatchObject({ id: admin.id, role: 'developer', status: 'active' });
    expect(store.authenticate('Facu Masague', 'ClaveOriginal2026')).toMatchObject({ ok: true });
    expect(store.authenticate('Facu Masague', 'OtraClaveNoAplicada2026')).toMatchObject({ ok: false });
    store.close();
  });

  it('migra la restricción anterior de roles sin romper referencias', () => {
    const directory = mkdtempSync(join(tmpdir(), 'salice-auth-legacy-'));
    directories.push(directory);
    const path = join(directory, 'operations.sqlite');
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'office')),
        status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'rejected', 'disabled')),
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        password_changed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        reviewed_at TEXT,
        reviewed_by TEXT,
        last_login_at TEXT
      );
      INSERT INTO users VALUES (
        'legacy-admin', 'Administrador', 'Administrador', 'admin', 'active',
        'hash', 'salt', '2026-07-29T00:00:00.000Z', '2026-07-29T00:00:00.000Z', NULL, NULL, NULL
      );
    `);
    legacy.close();

    const store = new AuthStore(path);
    store.close();
    const migrated = new DatabaseSync(path);
    const definition = migrated.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get() as { sql: string };
    expect(definition.sql).toContain("'developer'");
    expect(migrated.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(() => migrated.prepare("UPDATE users SET role = 'developer' WHERE id = 'legacy-admin'").run()).not.toThrow();
    migrated.close();
  });
});
