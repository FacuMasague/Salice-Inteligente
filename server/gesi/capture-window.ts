interface SptFetchWindowOptions {
  hasExistingCapture: boolean;
  historyFrom: string;
  explicitHistoryFrom?: string;
  bootstrapHistoryFrom?: string;
}

export const DEFAULT_SPT_BOOTSTRAP_HISTORY_FROM = '2025-01-01';

export function resolveSptFetchFrom({
  hasExistingCapture,
  historyFrom,
  explicitHistoryFrom,
  bootstrapHistoryFrom,
}: SptFetchWindowOptions) {
  const explicit = explicitHistoryFrom?.trim();
  if (explicit) return explicit;
  const bootstrap = bootstrapHistoryFrom?.trim();
  if (!hasExistingCapture) return bootstrap || DEFAULT_SPT_BOOTSTRAP_HISTORY_FROM;
  return historyFrom;
}
