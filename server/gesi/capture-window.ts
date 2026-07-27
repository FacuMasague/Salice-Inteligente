interface SptFetchWindowOptions {
  hasExistingCapture: boolean;
  historyFrom: string;
  explicitHistoryFrom?: string;
  bootstrapHistoryFrom?: string;
}

export function resolveSptFetchFrom({
  hasExistingCapture,
  historyFrom,
  explicitHistoryFrom,
  bootstrapHistoryFrom,
}: SptFetchWindowOptions) {
  const explicit = explicitHistoryFrom?.trim();
  if (explicit) return explicit;
  const bootstrap = bootstrapHistoryFrom?.trim();
  if (!hasExistingCapture && bootstrap) return bootstrap;
  return historyFrom;
}
