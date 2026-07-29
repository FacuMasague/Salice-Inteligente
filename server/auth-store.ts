import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { AuthUser, UserRole, UserStatus } from '../shared/auth.js';
import { getOperationalDatabasePath } from './operational-store.js';

const SESSION_DAYS = 30;
const PASSWORD_MIN_LENGTH = 12;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

type Row = Record<string, unknown>;

function normalizedUsername(value: string) {
  return value.trim().toLocaleLowerCase('es-AR');
}

function tokenHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function userFromRow(row: Row): AuthUser {
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    role: String(row.role) as UserRole,
    status: String(row.status) as UserStatus,
    createdAt: String(row.created_at),
    reviewedAt: row.reviewed_at == null ? null : String(row.reviewed_at),
    reviewedBy: row.reviewed_by == null ? null : String(row.reviewed_by),
    lastLoginAt: row.last_login_at == null ? null : String(row.last_login_at),
  };
}

export function validateUsername(value: string) {
  const username = normalizedUsername(value);
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
    return 'El usuario debe tener entre 3 y 40 caracteres y usar solamente letras, números, punto, guion o guion bajo.';
  }
  return null;
}

export function validateDisplayName(value: string) {
  const name = value.trim();
  return name.length >= 3 && name.length <= 80 ? null : 'Ingresá tu nombre y apellido.';
}

export function validatePassword(value: string) {
  if (value.length < PASSWORD_MIN_LENGTH) return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (value.length > 200) return 'La contraseña es demasiado larga.';
  if (!/[a-záéíóúüñ]/i.test(value) || !/\d/.test(value)) return 'La contraseña debe combinar letras y números.';
  return null;
}

function passwordHash(password: string, salt: string) {
  return scryptSync(password, salt, 64, SCRYPT_OPTIONS).toString('hex');
}

export class AuthStore {
  private readonly database: DatabaseSync;

  constructor(path = getOperationalDatabasePath()) {
    this.database = new DatabaseSync(path);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
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
        last_login_at TEXT,
        FOREIGN KEY(reviewed_by) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status, created_at);
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        csrf_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        user_agent TEXT NOT NULL DEFAULT '',
        ip_address TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, expires_at);
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY,
        value_json TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  close() {
    this.database.close();
  }

  bootstrapAdmin(usernameValue?: string, password?: string, displayNameValue?: string) {
    const username = normalizedUsername(usernameValue ?? '');
    if (!username || !password) return null;
    const validation = validateUsername(username) || validatePassword(password);
    if (validation) throw new Error(`Configuración inicial de administrador inválida: ${validation}`);
    const existingAdmin = this.database.prepare("SELECT * FROM users WHERE role = 'admin' AND status = 'active' LIMIT 1").get() as Row | undefined;
    if (existingAdmin) return userFromRow(existingAdmin);
    const existing = this.database.prepare('SELECT * FROM users WHERE username = ?').get(username) as Row | undefined;
    const now = new Date().toISOString();
    if (existing) {
      const salt = randomBytes(16).toString('hex');
      this.database.prepare(`
        UPDATE users SET role = 'admin', status = 'active', display_name = ?,
          password_hash = ?, password_salt = ?, password_changed_at = ?, reviewed_at = ?
        WHERE id = ?
      `).run(
        (displayNameValue || 'Administrador Salice').trim().slice(0, 80),
        passwordHash(password, salt), salt, now, now, String(existing.id),
      );
      this.database.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(String(existing.id));
      return userFromRow(this.database.prepare('SELECT * FROM users WHERE id = ?').get(String(existing.id)) as Row);
    }
    const salt = randomBytes(16).toString('hex');
    const id = randomUUID();
    this.database.prepare(`
      INSERT INTO users (
        id, username, display_name, role, status, password_hash, password_salt,
        password_changed_at, created_at, reviewed_at
      ) VALUES (?, ?, ?, 'admin', 'active', ?, ?, ?, ?, ?)
    `).run(id, username, (displayNameValue || 'Administrador Salice').trim().slice(0, 80), passwordHash(password, salt), salt, now, now, now);
    return this.getUser(id);
  }

  register(input: { username: string; displayName: string; password: string }) {
    const username = normalizedUsername(input.username);
    const validation = validateUsername(username) || validateDisplayName(input.displayName) || validatePassword(input.password);
    if (validation) throw new Error(validation);
    const salt = randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    const user: AuthUser = {
      id: randomUUID(),
      username,
      displayName: input.displayName.trim().replace(/\s+/g, ' ').slice(0, 80),
      role: 'office',
      status: 'pending',
      createdAt: now,
      reviewedAt: null,
      reviewedBy: null,
      lastLoginAt: null,
    };
    try {
      this.database.prepare(`
        INSERT INTO users (
          id, username, display_name, role, status, password_hash, password_salt,
          password_changed_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(user.id, user.username, user.displayName, user.role, user.status, passwordHash(input.password, salt), salt, now, now);
    } catch (error) {
      if (String(error).includes('UNIQUE')) throw new Error('Ese nombre de usuario ya está registrado.');
      throw error;
    }
    return user;
  }

  authenticate(usernameValue: string, password: string) {
    const username = normalizedUsername(usernameValue);
    const row = this.database.prepare('SELECT * FROM users WHERE username = ?').get(username) as Row | undefined;
    const fallbackSalt = '00000000000000000000000000000000';
    const candidate = passwordHash(password, row ? String(row.password_salt) : fallbackSalt);
    const expected = row ? String(row.password_hash) : '0'.repeat(128);
    const matches = timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(expected, 'hex'));
    if (!row || !matches) return { ok: false as const, reason: 'invalid' as const };
    const user = userFromRow(row);
    if (user.status !== 'active') return { ok: false as const, reason: user.status };
    const now = new Date().toISOString();
    this.database.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, user.id);
    return { ok: true as const, user: { ...user, lastLoginAt: now } };
  }

  createSession(userId: string, context: { userAgent?: string; ipAddress?: string } = {}) {
    this.pruneSessions();
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
    this.database.prepare(`
      INSERT INTO user_sessions (
        id, user_id, token_hash, csrf_hash, created_at, expires_at, last_seen_at, user_agent, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), userId, tokenHash(token), tokenHash(csrfToken), now.toISOString(), expiresAt.toISOString(),
      now.toISOString(), String(context.userAgent ?? '').slice(0, 300), String(context.ipAddress ?? '').slice(0, 100),
    );
    const sessions = this.database.prepare('SELECT id FROM user_sessions WHERE user_id = ? ORDER BY created_at DESC').all(userId) as Row[];
    sessions.slice(5).forEach((row) => this.database.prepare('DELETE FROM user_sessions WHERE id = ?').run(String(row.id)));
    return { token, csrfToken, expiresAt: expiresAt.toISOString() };
  }

  getSession(token: string) {
    if (!token) return null;
    const row = this.database.prepare(`
      SELECT sessions.id AS session_id, sessions.csrf_hash, sessions.expires_at, users.*
      FROM user_sessions sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.status = 'active'
    `).get(tokenHash(token), new Date().toISOString()) as Row | undefined;
    if (!row) return null;
    this.database.prepare('UPDATE user_sessions SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), String(row.session_id));
    return { id: String(row.session_id), csrfHash: String(row.csrf_hash), expiresAt: String(row.expires_at), user: userFromRow(row) };
  }

  csrfMatches(sessionId: string, csrfToken: string) {
    const row = this.database.prepare('SELECT csrf_hash FROM user_sessions WHERE id = ?').get(sessionId) as Row | undefined;
    if (!row || !csrfToken) return false;
    const actual = Buffer.from(tokenHash(csrfToken));
    const expected = Buffer.from(String(row.csrf_hash));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  rotateCsrf(sessionId: string) {
    const csrfToken = randomBytes(24).toString('base64url');
    this.database.prepare('UPDATE user_sessions SET csrf_hash = ? WHERE id = ?').run(tokenHash(csrfToken), sessionId);
    return csrfToken;
  }

  deleteSession(token: string) {
    if (token) this.database.prepare('DELETE FROM user_sessions WHERE token_hash = ?').run(tokenHash(token));
  }

  listUsers() {
    return (this.database.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as Row[]).map(userFromRow);
  }

  hasActiveAdmin() {
    return Number((this.database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'").get() as Row).count) > 0;
  }

  getUser(id: string) {
    const row = this.database.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined;
    return row ? userFromRow(row) : null;
  }

  reviewUser(id: string, input: { status: Exclude<UserStatus, 'pending'>; role?: UserRole; reviewerId: string }) {
    const current = this.getUser(id);
    if (!current) return null;
    if (current.id === input.reviewerId && input.status !== 'active') throw new Error('No podés bloquear tu propia cuenta.');
    if (current.role === 'admin' && current.status === 'active' && (input.status !== 'active' || input.role === 'office')) {
      const activeAdmins = Number((this.database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'").get() as Row).count);
      if (activeAdmins <= 1) throw new Error('Debe quedar al menos un administrador activo.');
    }
    const now = new Date().toISOString();
    const role = input.role ?? current.role;
    this.database.prepare('UPDATE users SET status = ?, role = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?')
      .run(input.status, role, now, input.reviewerId, id);
    if (input.status !== 'active') this.database.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(id);
    return this.getUser(id);
  }

  getPreferences(userId: string) {
    const row = this.database.prepare('SELECT value_json FROM user_preferences WHERE user_id = ?').get(userId) as Row | undefined;
    if (!row) return {};
    try {
      const value = JSON.parse(String(row.value_json));
      return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }

  savePreferences(userId: string, value: Record<string, unknown>) {
    const safeEntries = Object.entries(value).slice(0, 100);
    const safe = Object.fromEntries(safeEntries);
    const serialized = JSON.stringify(safe);
    if (Buffer.byteLength(serialized) > 32_000) throw new Error('Las preferencias superan el tamaño permitido.');
    const now = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO user_preferences (user_id, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(userId, serialized, now);
    return safe;
  }

  assignLegacySavedViews(userId: string) {
    const columns = this.database.prepare('PRAGMA table_info(saved_views)').all() as Row[];
    if (columns.some((column) => String(column.name) === 'user_id')) {
      this.database.prepare("UPDATE saved_views SET user_id = ? WHERE user_id = '' OR user_id IS NULL").run(userId);
    }
  }

  private pruneSessions() {
    this.database.prepare('DELETE FROM user_sessions WHERE expires_at <= ?').run(new Date().toISOString());
  }
}

let defaultStore: AuthStore | null = null;

export function authStore() {
  defaultStore ??= new AuthStore();
  return defaultStore;
}
