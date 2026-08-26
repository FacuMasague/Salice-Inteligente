import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type {
  AuthUser,
  DeveloperActivityPayload,
  UserAccessRecord,
  UserChangeRecord,
  UserViewActivityRecord,
  UserRole,
  UserStatus,
} from '../shared/auth.js';
import { getOperationalDatabasePath } from './operational-store.js';

// La columna se conserva para que las bases operativas existentes sigan siendo
// compatibles. La vigencia real de la sesión ya no depende de una fecha.
const PERSISTENT_SESSION_MARKER = '9999-12-31T23:59:59.999Z';
const PASSWORD_MIN_LENGTH = 8;
export const ANTI_AFK_MINUTES = 5;
const ACTIVITY_VIEWS = new Set([
  'map', 'routes', 'clients', 'sellers', 'products', 'brands', 'finance', 'agenda',
  'sales-explorer', 'receivables', 'report-center', 'reports', 'spt', 'commercial-sales',
  'mars', 'nutripet', 'baires', 'non-buyers', 'pending-balances', 'settings', 'help',
  'users', 'user-activity',
]);
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

type Row = Record<string, unknown>;

function normalizedUsername(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function tokenHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function localDate(value = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(value);
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
  if (username.length < 3 || username.length > 80 || !/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(username)) {
    return 'El usuario debe tener entre 3 y 80 caracteres y usar solamente letras, números, espacios, punto, guion o guion bajo.';
  }
  return null;
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
        role TEXT NOT NULL CHECK (role IN ('developer', 'admin', 'office')),
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
    this.ensureDeveloperRoleConstraint();
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS user_access_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        ip_address TEXT NOT NULL DEFAULT '',
        user_agent TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_user_access_events_user ON user_access_events(user_id, occurred_at DESC);
      CREATE TABLE IF NOT EXISTS user_activity_daily (
        user_id TEXT NOT NULL,
        activity_date TEXT NOT NULL,
        active_seconds INTEGER NOT NULL DEFAULT 0,
        heartbeat_count INTEGER NOT NULL DEFAULT 0,
        last_active_at TEXT NOT NULL,
        PRIMARY KEY(user_id, activity_date),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS user_activity_heartbeats (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        last_recorded_at TEXT NOT NULL,
        last_view TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS user_activity_by_view (
        user_id TEXT NOT NULL,
        activity_date TEXT NOT NULL,
        view_id TEXT NOT NULL,
        active_seconds INTEGER NOT NULL DEFAULT 0,
        heartbeat_count INTEGER NOT NULL DEFAULT 0,
        visit_count INTEGER NOT NULL DEFAULT 0,
        last_active_at TEXT NOT NULL,
        PRIMARY KEY(user_id, activity_date, view_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_user_activity_by_view_time ON user_activity_by_view(activity_date, last_active_at DESC);
      CREATE TABLE IF NOT EXISTS user_change_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        occurred_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_user_change_log_user ON user_change_log(user_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_user_change_log_time ON user_change_log(occurred_at DESC);
    `);
    this.ensureColumn('user_activity_heartbeats', 'last_view', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('user_change_log', 'detail', "TEXT NOT NULL DEFAULT ''");
  }

  close() {
    this.database.close();
  }

  bootstrapAdmin(usernameValue?: string, password?: string, role: Extract<UserRole, 'admin' | 'developer'> = 'admin') {
    const username = normalizedUsername(usernameValue ?? '');
    if (!username || !password) return null;
    const validation = validateUsername(username) || validatePassword(password);
    if (validation) throw new Error(`Configuración inicial de administrador inválida: ${validation}`);
    const configuredUser = this.database.prepare('SELECT * FROM users WHERE username = ?').get(username) as Row | undefined;
    if (configuredUser && configuredUser.status === 'active' && configuredUser.role === 'admin' && role === 'developer') {
      this.database.prepare("UPDATE users SET role = 'developer' WHERE id = ?").run(String(configuredUser.id));
      return userFromRow(this.database.prepare('SELECT * FROM users WHERE id = ?').get(String(configuredUser.id)) as Row);
    }
    const existingAdmin = this.database.prepare("SELECT * FROM users WHERE role IN ('developer', 'admin') AND status = 'active' LIMIT 1").get() as Row | undefined;
    if (existingAdmin) return userFromRow(existingAdmin);
    const existing = configuredUser;
    const now = new Date().toISOString();
    if (existing) {
      const salt = randomBytes(16).toString('hex');
      this.database.prepare(`
        UPDATE users SET role = ?, status = 'active', display_name = ?,
          password_hash = ?, password_salt = ?, password_changed_at = ?, reviewed_at = ?
        WHERE id = ?
      `).run(
        role, username,
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
      ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
    `).run(id, username, username, role, passwordHash(password, salt), salt, now, now, now);
    return this.getUser(id);
  }

  register(input: { username: string; password: string }) {
    const username = normalizedUsername(input.username);
    const validation = validateUsername(username) || validatePassword(input.password);
    if (validation) throw new Error(validation);
    const salt = randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    const user: AuthUser = {
      id: randomUUID(),
      username,
      displayName: username,
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
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    const now = new Date();
    this.database.prepare(`
      INSERT INTO user_sessions (
        id, user_id, token_hash, csrf_hash, created_at, expires_at, last_seen_at, user_agent, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), userId, tokenHash(token), tokenHash(csrfToken), now.toISOString(), PERSISTENT_SESSION_MARKER,
      now.toISOString(), String(context.userAgent ?? '').slice(0, 300), String(context.ipAddress ?? '').slice(0, 100),
    );
    const sessionRow = this.database.prepare('SELECT id FROM user_sessions WHERE token_hash = ?').get(tokenHash(token)) as Row;
    this.database.prepare(`
      INSERT INTO user_access_events (id, user_id, session_id, occurred_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), userId, String(sessionRow.id), now.toISOString(),
      String(context.ipAddress ?? '').slice(0, 100), String(context.userAgent ?? '').slice(0, 300),
    );
    return { token, csrfToken };
  }

  getSession(token: string) {
    if (!token) return null;
    const row = this.database.prepare(`
      SELECT sessions.id AS session_id, sessions.csrf_hash, users.*
      FROM user_sessions sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND users.status = 'active'
    `).get(tokenHash(token)) as Row | undefined;
    if (!row) return null;
    this.database.prepare('UPDATE user_sessions SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), String(row.session_id));
    return { id: String(row.session_id), csrfHash: String(row.csrf_hash), user: userFromRow(row) };
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
    return Number((this.database.prepare("SELECT COUNT(*) AS count FROM users WHERE role IN ('developer', 'admin') AND status = 'active'").get() as Row).count) > 0;
  }

  getUser(id: string) {
    const row = this.database.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined;
    return row ? userFromRow(row) : null;
  }

  reviewUser(id: string, input: { status: Exclude<UserStatus, 'pending'>; role?: UserRole; reviewerId: string }) {
    const current = this.getUser(id);
    if (!current) return null;
    const reviewer = this.getUser(input.reviewerId);
    if (!reviewer) throw new Error('No se encontró al responsable del cambio.');
    if ((current.role === 'developer' || input.role === 'developer') && reviewer.role !== 'developer') {
      throw new Error('Sólo un Developer puede modificar cuentas Developer.');
    }
    if (current.id === input.reviewerId && input.status !== 'active') throw new Error('No podés bloquear tu propia cuenta.');
    if (['developer', 'admin'].includes(current.role) && current.status === 'active' && (input.status !== 'active' || input.role === 'office')) {
      const activeAdmins = Number((this.database.prepare("SELECT COUNT(*) AS count FROM users WHERE role IN ('developer', 'admin') AND status = 'active'").get() as Row).count);
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

  recordActivity(sessionId: string, userId: string, requestedSeconds: number, requestedView = '') {
    const seconds = Math.max(0, Math.min(60, Math.round(requestedSeconds)));
    if (!seconds) return 0;
    const viewId = ACTIVITY_VIEWS.has(requestedView) ? requestedView : 'unknown';
    const now = new Date();
    const previous = this.database.prepare('SELECT last_recorded_at, last_view FROM user_activity_heartbeats WHERE session_id = ? AND user_id = ?')
      .get(sessionId, userId) as Row | undefined;
    const elapsed = previous
      ? Math.max(0, Math.floor((now.getTime() - new Date(String(previous.last_recorded_at)).getTime()) / 1000) + 2)
      : seconds;
    const accepted = Math.min(seconds, elapsed);
    this.database.prepare(`
      INSERT INTO user_activity_heartbeats (session_id, user_id, last_recorded_at, last_view) VALUES (?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        user_id = excluded.user_id, last_recorded_at = excluded.last_recorded_at, last_view = excluded.last_view
    `).run(sessionId, userId, now.toISOString(), viewId);
    if (!accepted) return 0;
    this.database.prepare(`
      INSERT INTO user_activity_daily (user_id, activity_date, active_seconds, heartbeat_count, last_active_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(user_id, activity_date) DO UPDATE SET
        active_seconds = user_activity_daily.active_seconds + excluded.active_seconds,
        heartbeat_count = user_activity_daily.heartbeat_count + 1,
        last_active_at = excluded.last_active_at
    `).run(userId, localDate(now), accepted, now.toISOString());
    this.database.prepare(`
      INSERT INTO user_activity_by_view (
        user_id, activity_date, view_id, active_seconds, heartbeat_count, visit_count, last_active_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(user_id, activity_date, view_id) DO UPDATE SET
        active_seconds = user_activity_by_view.active_seconds + excluded.active_seconds,
        heartbeat_count = user_activity_by_view.heartbeat_count + 1,
        visit_count = user_activity_by_view.visit_count + excluded.visit_count,
        last_active_at = excluded.last_active_at
    `).run(userId, localDate(now), viewId, accepted, previous?.last_view === viewId ? 0 : 1, now.toISOString());
    return accepted;
  }

  recordChange(input: { userId: string; sessionId: string; method: string; path: string; action: string; detail?: string }) {
    this.database.prepare(`
      INSERT INTO user_change_log (id, user_id, session_id, method, path, action, detail, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), input.userId, input.sessionId, input.method.slice(0, 10),
      input.path.slice(0, 500), input.action.slice(0, 200), String(input.detail ?? '').slice(0, 500), new Date().toISOString(),
    );
  }

  developerActivity(periodDays = 30): DeveloperActivityPayload {
    const days = [0, 7, 30, 90, 365].includes(periodDays) ? periodDays : 30;
    const since = days ? localDate(new Date(Date.now() - (days - 1) * 86_400_000)) : '0000-01-01';
    const sinceTime = days ? new Date(`${since}T00:00:00-03:00`).toISOString() : '0000-01-01T00:00:00.000Z';
    const users = this.listUsers();
    const metrics = this.database.prepare(`
      SELECT users.id,
        (SELECT COUNT(*) FROM user_access_events access WHERE access.user_id = users.id AND access.occurred_at >= ?) AS access_count,
        COALESCE((SELECT SUM(active_seconds) FROM user_activity_daily activity WHERE activity.user_id = users.id AND activity.activity_date >= ?), 0) AS active_seconds,
        COALESCE((SELECT active_seconds FROM user_activity_daily activity WHERE activity.user_id = users.id AND activity.activity_date = ?), 0) AS active_seconds_today,
        (SELECT COUNT(*) FROM user_activity_daily activity WHERE activity.user_id = users.id AND activity.activity_date >= ?) AS active_days,
        (SELECT MAX(last_active_at) FROM user_activity_daily activity WHERE activity.user_id = users.id AND activity.activity_date >= ?) AS last_active_at,
        (SELECT COUNT(*) FROM user_change_log changes WHERE changes.user_id = users.id AND changes.occurred_at >= ?) AS change_count,
        (SELECT view_id FROM user_activity_by_view view_activity WHERE view_activity.user_id = users.id AND view_activity.activity_date >= ? GROUP BY view_id ORDER BY SUM(active_seconds) DESC LIMIT 1) AS top_view_id
      FROM users
    `).all(sinceTime, since, localDate(), since, since, sinceTime, since) as Row[];
    const metricsByUser = new Map(metrics.map((row) => [String(row.id), row]));
    const accesses = (this.database.prepare(`
      SELECT id, user_id, occurred_at, ip_address, user_agent
      FROM user_access_events WHERE occurred_at >= ? ORDER BY occurred_at DESC LIMIT 2000
    `).all(sinceTime) as Row[]).map((row): UserAccessRecord => ({
      id: String(row.id),
      userId: String(row.user_id),
      occurredAt: String(row.occurred_at),
      ipAddress: String(row.ip_address),
      userAgent: String(row.user_agent),
    }));
    const changes = (this.database.prepare(`
      SELECT id, user_id, method, path, action, detail, occurred_at
      FROM user_change_log WHERE occurred_at >= ? ORDER BY occurred_at DESC LIMIT 3000
    `).all(sinceTime) as Row[]).map((row): UserChangeRecord => ({
      id: String(row.id),
      userId: String(row.user_id),
      method: String(row.method),
      path: String(row.path),
      action: String(row.action),
      detail: String(row.detail ?? ''),
      occurredAt: String(row.occurred_at),
    }));
    const views = (this.database.prepare(`
      SELECT user_id, view_id, SUM(active_seconds) AS active_seconds,
        SUM(visit_count) AS visit_count, MAX(last_active_at) AS last_active_at
      FROM user_activity_by_view WHERE activity_date >= ?
      GROUP BY user_id, view_id ORDER BY active_seconds DESC
    `).all(since) as Row[]).map((row): UserViewActivityRecord => ({
      userId: String(row.user_id),
      viewId: String(row.view_id),
      activeSeconds: Number(row.active_seconds),
      visitCount: Number(row.visit_count),
      lastActiveAt: String(row.last_active_at),
    }));
    return {
      generatedAt: new Date().toISOString(),
      antiAfkMinutes: ANTI_AFK_MINUTES,
      periodDays: days,
      users: users.map((user) => {
        const metric = metricsByUser.get(user.id) ?? {};
        return {
          user,
          accessCount: Number(metric.access_count ?? 0),
          activeSeconds: Number(metric.active_seconds ?? 0),
          activeSecondsToday: Number(metric.active_seconds_today ?? 0),
          activeDays: Number(metric.active_days ?? 0),
          lastActiveAt: metric.last_active_at == null ? null : String(metric.last_active_at),
          changeCount: Number(metric.change_count ?? 0),
          topViewId: metric.top_view_id == null ? null : String(metric.top_view_id),
        };
      }),
      views,
      accesses,
      changes,
    };
  }

  private ensureColumn(table: string, column: string, definition: string) {
    const columns = this.database.prepare(`PRAGMA table_info(${table})`).all() as Row[];
    if (!columns.some((item) => String(item.name) === column)) {
      this.database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  private ensureDeveloperRoleConstraint() {
    const definition = this.database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get() as Row | undefined;
    if (String(definition?.sql ?? '').includes("'developer'")) return;
    this.database.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN IMMEDIATE;
      CREATE TABLE users_next (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('developer', 'admin', 'office')),
        status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'rejected', 'disabled')),
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        password_changed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        reviewed_at TEXT,
        reviewed_by TEXT,
        last_login_at TEXT,
        FOREIGN KEY(reviewed_by) REFERENCES users_next(id)
      );
      INSERT INTO users_next SELECT * FROM users;
      DROP TABLE users;
      ALTER TABLE users_next RENAME TO users;
      COMMIT;
      PRAGMA foreign_keys = ON;
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status, created_at);
    `);
  }

}

let defaultStore: AuthStore | null = null;

export function authStore() {
  defaultStore ??= new AuthStore();
  return defaultStore;
}
