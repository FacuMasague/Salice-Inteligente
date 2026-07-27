export type InterfaceDensity = 'comfortable' | 'compact';

export interface AppPreferences {
  density: InterfaceDensity;
  contextualHelp: boolean;
  plannedRefreshTimes: string[];
}

export const PREFERENCES_STORAGE_KEY = 'salice-preferences-v010';
export const PREFERENCES_CHANGED_EVENT = 'salice-preferences-changed';

export const DEFAULT_PREFERENCES: AppPreferences = {
  density: 'comfortable',
  contextualHelp: true,
  plannedRefreshTimes: [],
};

export function readPreferences(): AppPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? '{}') as Partial<AppPreferences>;
    return {
      density: saved.density === 'compact' ? 'compact' : 'comfortable',
      contextualHelp: saved.contextualHelp !== false,
      plannedRefreshTimes: Array.isArray(saved.plannedRefreshTimes)
        ? [...new Set(saved.plannedRefreshTimes.filter((value) => /^\d{2}:\d{2}$/.test(value)))].sort()
        : [],
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(value: AppPreferences) {
  localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(PREFERENCES_CHANGED_EVENT, { detail: value }));
}

export function nextPlannedRefresh(times: string[], now = new Date()) {
  if (!times.length) return null;
  const candidates = times.map((time) => {
    const [hours, minutes] = time.split(':').map(Number);
    const candidate = new Date(now);
    candidate.setHours(hours, minutes, 0, 0);
    if (candidate.getTime() <= now.getTime()) candidate.setDate(candidate.getDate() + 1);
    return candidate;
  });
  return candidates.sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
}
