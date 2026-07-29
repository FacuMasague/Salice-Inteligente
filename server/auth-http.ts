import type express from 'express';
import type { AuthUser, UserRole, UserStatus } from '../shared/auth.js';
import { authStore } from './auth-store.js';

const SESSION_COOKIE = 'salice_session';
const CSRF_COOKIE = 'salice_csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LOCAL_DEVELOPMENT_ORIGINS = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]);
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const registrationAttempts = new Map<string, { count: number; resetAt: number }>();

export interface RequestAuth {
  sessionId: string;
  user: AuthUser;
}

function parseCookies(header: string | undefined) {
  const values: Record<string, string> = {};
  for (const part of String(header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    try { values[key] = decodeURIComponent(part.slice(index + 1).trim()); } catch { /* cookie inválida */ }
  }
  return values;
}

function secureCookie() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
}

function cookieValue(name: string, value: string, options: { httpOnly?: boolean; maxAge?: number } = {}) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Strict',
    options.httpOnly ? 'HttpOnly' : '',
    secureCookie() ? 'Secure' : '',
    options.maxAge == null ? '' : `Max-Age=${Math.max(0, Math.floor(options.maxAge))}`,
  ].filter(Boolean);
  return attributes.join('; ');
}

function clearAuthCookies(res: express.Response) {
  res.append('Set-Cookie', cookieValue(SESSION_COOKIE, '', { httpOnly: true, maxAge: 0 }));
  res.append('Set-Cookie', cookieValue(CSRF_COOKIE, '', { maxAge: 0 }));
}

function requestKey(req: express.Request, username = '') {
  return `${req.ip}|${username.toLocaleLowerCase('es-AR')}`;
}

function rateLimited(bucket: Map<string, { count: number; resetAt: number }>, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = bucket.get(key);
  if (!current || current.resetAt <= now) {
    bucket.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > limit;
}

function validRequestOrigin(req: express.Request) {
  if (SAFE_METHODS.has(req.method)) return true;
  const origin = req.get('origin');
  if (!origin) return true;
  if (!secureCookie() && LOCAL_DEVELOPMENT_ORIGINS.has(origin)) return true;
  const host = req.get('x-forwarded-host') || req.get('host');
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  return Boolean(host && origin === `${protocol}://${host}`);
}

export function currentAuth(res: express.Response) {
  return res.locals.auth as RequestAuth;
}

export function installSecurityHeaders(app: express.Express) {
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    next();
  });
}

export function installPublicAuthRoutes(app: express.Express) {
  const store = authStore();
  const bootstrap = store.bootstrapAdmin(
    process.env.SALICE_INITIAL_ADMIN_USERNAME,
    process.env.SALICE_INITIAL_ADMIN_PASSWORD,
  );
  if (bootstrap) store.assignLegacySavedViews(bootstrap.id);
  if (!store.hasActiveAdmin()) {
    console.error('Acceso bloqueado: configurá SALICE_INITIAL_ADMIN_USERNAME y SALICE_INITIAL_ADMIN_PASSWORD para crear el primer administrador.');
  }

  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, version: process.env.npm_package_version ?? '1.2.0' });
  });

  app.get('/api/auth/session', (req, res) => {
    const token = parseCookies(req.get('cookie'))[SESSION_COOKIE] ?? '';
    const session = store.getSession(token);
    if (!session) {
      clearAuthCookies(res);
      return res.status(401).json({ authenticated: false, user: null });
    }
    const csrfToken = store.rotateCsrf(session.id);
    const maxAge = Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
    res.append('Set-Cookie', cookieValue(CSRF_COOKIE, csrfToken, { maxAge }));
    return res.json({ authenticated: true, user: session.user });
  });

  app.post('/api/auth/register', (req, res) => {
    if (!validRequestOrigin(req)) return res.status(403).json({ error: 'Origen de solicitud no permitido.' });
    if (rateLimited(registrationAttempts, requestKey(req), 5, 60 * 60_000)) {
      return res.status(429).json({ error: 'Se alcanzó el límite de solicitudes. Intentá nuevamente más tarde.' });
    }
    try {
      const user = store.register({
        username: String(req.body?.username ?? ''),
        password: String(req.body?.password ?? ''),
      });
      return res.status(201).json({
        user,
        message: 'La solicitud fue enviada. Un administrador debe aprobarla antes de que puedas ingresar.',
      });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo crear la solicitud.' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    if (!validRequestOrigin(req)) return res.status(403).json({ error: 'Origen de solicitud no permitido.' });
    const username = String(req.body?.username ?? '');
    const key = requestKey(req, username);
    if (rateLimited(loginAttempts, key, 8, 15 * 60_000)) {
      return res.status(429).json({ error: 'Demasiados intentos. Esperá unos minutos antes de volver a probar.' });
    }
    const result = store.authenticate(username, String(req.body?.password ?? ''));
    if (!result.ok) {
      const pendingMessage = result.reason === 'pending'
        ? 'Tu solicitud todavía está pendiente de aprobación.'
        : result.reason === 'rejected' || result.reason === 'disabled'
          ? 'Tu cuenta no tiene acceso habilitado.'
          : 'Usuario o contraseña incorrectos.';
      return res.status(result.reason === 'invalid' ? 401 : 403).json({ error: pendingMessage });
    }
    loginAttempts.delete(key);
    const session = store.createSession(result.user.id, { userAgent: req.get('user-agent'), ipAddress: req.ip });
    const maxAge = Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000);
    res.append('Set-Cookie', cookieValue(SESSION_COOKIE, session.token, { httpOnly: true, maxAge }));
    res.append('Set-Cookie', cookieValue(CSRF_COOKIE, session.csrfToken, { maxAge }));
    return res.json({ authenticated: true, user: result.user });
  });
}

export function requireAuthenticatedApi(req: express.Request, res: express.Response, next: express.NextFunction) {
  const cookies = parseCookies(req.get('cookie'));
  const token = cookies[SESSION_COOKIE] ?? '';
  const session = authStore().getSession(token);
  if (!session) {
    clearAuthCookies(res);
    return res.status(401).json({ error: 'Necesitás iniciar sesión para acceder a Salice Inteligente.' });
  }
  if (!validRequestOrigin(req)) return res.status(403).json({ error: 'Origen de solicitud no permitido.' });
  if (!SAFE_METHODS.has(req.method)) {
    const headerToken = req.get('x-salice-csrf') ?? '';
    const cookieToken = cookies[CSRF_COOKIE] ?? '';
    if (!headerToken || headerToken !== cookieToken || !authStore().csrfMatches(session.id, headerToken)) {
      return res.status(403).json({ error: 'La validación de seguridad venció. Recargá la página e intentá nuevamente.' });
    }
  }
  res.locals.auth = { sessionId: session.id, user: session.user } satisfies RequestAuth;
  res.setHeader('Cache-Control', 'private, no-store');
  return next();
}

export function requireAdmin(_req: express.Request, res: express.Response, next: express.NextFunction) {
  const auth = currentAuth(res);
  return auth.user.role === 'admin'
    ? next()
    : res.status(403).json({ error: 'Esta función está reservada para administradores.' });
}

export function installPrivateAuthRoutes(app: express.Express) {
  const store = authStore();
  app.post('/api/auth/logout', (req, res) => {
    const token = parseCookies(req.get('cookie'))[SESSION_COOKIE] ?? '';
    store.deleteSession(token);
    clearAuthCookies(res);
    return res.status(204).end();
  });
  app.get('/api/account/preferences', (_req, res) => res.json({ preferences: store.getPreferences(currentAuth(res).user.id) }));
  app.patch('/api/account/preferences', (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'Preferencias inválidas.' });
    try {
      const userId = currentAuth(res).user.id;
      return res.json({ preferences: store.savePreferences(userId, {
        ...store.getPreferences(userId),
        ...req.body as Record<string, unknown>,
      }) });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Preferencias inválidas.' });
    }
  });
  app.get('/api/system/users', requireAdmin, (_req, res) => res.json({ users: store.listUsers() }));
  app.patch('/api/system/users/:id', requireAdmin, (req, res) => {
    const status = String(req.body?.status ?? '') as UserStatus;
    const role = String(req.body?.role ?? '') as UserRole;
    if (!['active', 'rejected', 'disabled'].includes(status)) return res.status(400).json({ error: 'Estado de usuario inválido.' });
    if (role && !['admin', 'office'].includes(role)) return res.status(400).json({ error: 'Rol de usuario inválido.' });
    try {
      const user = store.reviewUser(String(req.params.id), {
        status: status as Exclude<UserStatus, 'pending'>,
        role: role || undefined,
        reviewerId: currentAuth(res).user.id,
      });
      return user ? res.json({ user }) : res.status(404).json({ error: 'Usuario no encontrado.' });
    } catch (error) {
      return res.status(409).json({ error: error instanceof Error ? error.message : 'No se pudo actualizar el usuario.' });
    }
  });
}
