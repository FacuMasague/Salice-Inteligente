const CSRF_COOKIE = 'salice_csrf';
export const AUTH_REQUIRED_EVENT = 'salice-auth-required';

function cookie(name: string) {
  const prefix = `${name}=`;
  const value = document.cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(prefix));
  if (!value) return '';
  try { return decodeURIComponent(value.slice(prefix.length)); } catch { return ''; }
}

function apiPath(input: RequestInfo | URL) {
  const value = input instanceof Request ? input.url : String(input);
  const url = new URL(value, window.location.href);
  return url.origin === window.location.origin && url.pathname.startsWith('/api/') ? url.pathname : '';
}

export function installAuthenticatedFetch() {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = apiPath(input);
    if (!path) return original(input, init);
    const requestMethod = input instanceof Request ? input.method : undefined;
    const method = String(init.method ?? requestMethod ?? 'GET').toUpperCase();
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrf = cookie(CSRF_COOKIE);
      if (csrf) headers.set('X-Salice-CSRF', csrf);
    }
    const response = await original(input, { ...init, headers, credentials: 'same-origin' });
    const publicAuth = ['/api/auth/login', '/api/auth/register', '/api/auth/session'].includes(path);
    if (response.status === 401 && !publicAuth) window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
    return response;
  };
}
