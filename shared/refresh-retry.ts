export const REFRESH_TIMEOUT_EXIT_CODE = 75;
export const AUTOMATIC_REFRESH_RETRY_DELAY_MS = 60 * 60 * 1_000;
export const AUTOMATIC_REFRESH_MAX_ATTEMPTS = 3;

export type AutomaticRefreshTrigger = 'scheduled' | 'bootstrap';

export function isRefreshTimeoutMessage(value: unknown) {
  const description = String(value ?? '').toLocaleLowerCase('en');
  return [
    'timeouterror',
    'timeout',
    'timed out',
    'operation was aborted',
    'etimedout',
  ].some((signal) => description.includes(signal));
}

export function automaticRefreshTrigger(base: AutomaticRefreshTrigger, attempt: number) {
  const normalizedAttempt = Math.max(1, Math.min(AUTOMATIC_REFRESH_MAX_ATTEMPTS, Math.floor(attempt)));
  return normalizedAttempt === 1 ? base : `${base}-retry-${normalizedAttempt}`;
}

export function automaticRefreshAttempt(value: string) {
  const match = /^(scheduled|bootstrap)(?:-retry-([23]))?$/.exec(value);
  if (!match) return null;
  return {
    base: match[1] as AutomaticRefreshTrigger,
    attempt: Number(match[2] ?? 1),
  };
}
