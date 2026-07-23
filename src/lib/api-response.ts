const STALE_SERVER_MESSAGE = 'El servidor abierto corresponde a una versión anterior. Cerrá la ventana de Terminal de Salice y volvé a abrir run-salice.command.';

export async function readApiJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const contentType = response.headers.get('content-type')?.toLocaleLowerCase() ?? '';
  if (!contentType.includes('application/json')) throw new Error(STALE_SERVER_MESSAGE);
  const payload = await response.json().catch(() => null) as { error?: unknown } | null;
  if (!response.ok) {
    const apiMessage = typeof payload?.error === 'string' ? payload.error.trim() : '';
    throw new Error(apiMessage || fallbackMessage);
  }
  if (payload == null) throw new Error(fallbackMessage);
  return payload as T;
}

export { STALE_SERVER_MESSAGE };
