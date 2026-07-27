export interface GesiCredentials {
  baseUrl: string;
  username: string;
  password: string;
  empresaId?: string;
  sucursalId?: string;
}

interface LoginResponse {
  success: boolean;
  token?: string;
  refresh_token?: string;
  error?: { code: number; message: string };
}

export class GesiClient {
  private token = '';

  constructor(private readonly config: GesiCredentials) {}

  async login() {
    let lastError: unknown;
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let retryableStatus = false;
      try {
        const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/api/Autenticacion/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', GrupoESI: '' },
          body: JSON.stringify({ username: this.config.username, password: this.config.password }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) {
          retryableStatus = response.status === 429 || response.status >= 500;
          throw new Error(`GESI login respondió HTTP ${response.status}`);
        }
        const payload = await response.json() as LoginResponse;
        if (!payload.success || !payload.token) {
          throw new Error(payload.error?.message || 'GESI no devolvió un token válido');
        }
        this.token = payload.token;
        return;
      } catch (error) {
        lastError = error;
        const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
        if ((!timedOut && !retryableStatus) || attempt === maxAttempts) break;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`GESI login falló luego de ${maxAttempts} intentos: ${reason}`);
  }

  private headers() {
    if (!this.token) throw new Error('La sesión GESI todavía no fue autenticada');
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      GrupoESI: '',
      'Content-Type': 'application/json',
    };
    if (this.config.empresaId) headers.empresaID = this.config.empresaId;
    if (this.config.sucursalId) headers.sucursalID = this.config.sucursalId;
    return headers;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let lastError: unknown;
    const maxAttempts = 5;
    let rateLimited = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}${path}`, {
          ...init,
          headers: { ...this.headers(), ...(init.headers ?? {}) },
          signal: AbortSignal.timeout(55_000),
        });
        if (!response.ok) {
          const error = new Error(`${path} respondió HTTP ${response.status}`);
          // En GetItem, HTTP 500 suele indicar que una de las claves del lote
          // fue rechazada. El capturador divide ese lote para aislarla; repetir
          // la misma carga cinco veces sólo consume el límite de GESI.
          if ((response.status < 500 && response.status !== 429) || response.status === 500) throw error;
          rateLimited = response.status === 429;
          lastError = error;
        } else {
          const payload = await response.json() as T & { success?: boolean; error?: { message?: string } };
          if (payload.success === false) throw new Error(payload.error?.message || `GESI rechazó ${path}`);
          return payload;
        }
      } catch (error) {
        lastError = error;
        const retryable = error instanceof DOMException && error.name === 'TimeoutError';
        if (!retryable && !rateLimited || attempt === maxAttempts) break;
      }
      if (attempt < maxAttempts) {
        const wait = rateLimited ? attempt * 1_500 : attempt * 750;
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`${path} falló luego de ${maxAttempts} intentos: ${reason}`);
  }

  async getAll<T>(path: string, collectionKey: string, pageSize = 1000): Promise<T[]> {
    return this.collectWithCompletenessRetry<T>(path, collectionKey, pageSize);
  }

  async postAll<T>(path: string, collectionKey: string, body: unknown, pageSize = 500): Promise<T[]> {
    return this.collectWithCompletenessRetry<T>(path, collectionKey, pageSize, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  private async collectWithCompletenessRetry<T>(
    path: string,
    collectionKey: string,
    pageSize: number,
    init: RequestInit = {},
  ): Promise<T[]> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.collectPages<T>(path, collectionKey, pageSize, init);
      } catch (error) {
        lastError = error;
        const incomplete = error instanceof Error && /registros (anunciados|esperados)/.test(error.message);
        if (!incomplete || attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
      }
    }
    throw lastError;
  }

  private async collectPages<T>(
    path: string,
    collectionKey: string,
    pageSize: number,
    init: RequestInit = {},
  ): Promise<T[]> {
    const all: T[] = [];
    let pageNumber = 1;
    let totalPages = 1;
    let expectedTotal = 0;
    do {
      const separator = path.includes('?') ? '&' : '?';
      const pagePath = `${path}${separator}pageNumber=${pageNumber}&pageSize=${pageSize}`;
      let pageItems: T[] = [];
      let pagination: { totalPaginas?: number; totalElementos?: number } | undefined;
      let expectedOnPage = 0;
      for (let completenessAttempt = 1; completenessAttempt <= 5; completenessAttempt += 1) {
        const payload = await this.request<Record<string, unknown>>(pagePath, init);
        pageItems = Array.isArray(payload[collectionKey]) ? payload[collectionKey] as T[] : [];
        pagination = payload.paginacion as { totalPaginas?: number; totalElementos?: number } | undefined;
        const advertisedTotal = Number(pagination?.totalElementos || 0);
        const advertisedPages = Math.max(
          1,
          Number(pagination?.totalPaginas || 1),
          Math.ceil(advertisedTotal / pageSize),
        );
        const allowedLiveDrift = Math.max(2, Math.ceil(advertisedTotal * 0.0001));
        expectedOnPage = pageNumber < advertisedPages
          ? pageSize
          : Math.max(0, advertisedTotal - (pageNumber - 1) * pageSize);
        const acceptableOnPage = pageNumber === advertisedPages
          ? Math.max(0, expectedOnPage - allowedLiveDrift)
          : expectedOnPage;
        if (pageItems.length >= acceptableOnPage) {
          if (pageItems.length < expectedOnPage) {
            console.warn(`${pagePath} anunció ${expectedOnPage} registros finales y entregó ${pageItems.length}; diferencia dentro de la tolerancia de datos vivos (${allowedLiveDrift}).`);
          }
          break;
        }
        if (completenessAttempt === 5) {
          throw new Error(`${pagePath} devolvió ${pageItems.length} de ${expectedOnPage} registros esperados en la página`);
        }
        await new Promise((resolve) => setTimeout(resolve, completenessAttempt * 750));
      }
      all.push(...pageItems);
      expectedTotal = Math.max(expectedTotal, Number(pagination?.totalElementos || 0));
      totalPages = Math.max(
        1,
        Number(pagination?.totalPaginas || 1),
        Math.ceil(expectedTotal / pageSize),
      );
      pageNumber += 1;
    } while (pageNumber <= totalPages);
    const allowedLiveDrift = Math.max(2, Math.ceil(expectedTotal * 0.0001));
    if (expectedTotal && all.length < expectedTotal - allowedLiveDrift) {
      throw new Error(`${path} devolvió ${all.length} de ${expectedTotal} registros anunciados`);
    }
    return all;
  }
}
