import type { UserRole } from '../../shared/auth';

export const APP_VIEW_IDS = [
  'home',
  'agenda',
  'finance',
  'receivables',
  'clients',
  'sellers',
  'sales-explorer',
  'products',
  'brands',
  'map',
  'routes',
  'report-center',
  'reports',
  'spt',
  'commercial-sales',
  'mars',
  'nutripet',
  'baires',
  'non-buyers',
  'pending-balances',
  'settings',
  'help',
  'users',
  'user-activity',
] as const;

export type AppViewId = typeof APP_VIEW_IDS[number];

const APP_VIEW_ID_SET = new Set<string>(APP_VIEW_IDS);
export const VIEW_HISTORY_USER_KEY = 'saliceViewUserId';

export const lastViewStorageKey = (userId: string) => `salice-last-view-v213-${userId}`;

export function isAppViewAllowed(value: unknown, role: UserRole): value is AppViewId {
  if (typeof value !== 'string' || !APP_VIEW_ID_SET.has(value)) return false;
  if (value === 'user-activity') return role === 'developer';
  if (value === 'users') return role === 'developer' || role === 'admin';
  return true;
}

export function resolveInitialAppView({
  userId,
  role,
  location,
  storage,
  historyState,
}: {
  userId: string;
  role: UserRole;
  location: Pick<Location, 'search'>;
  storage: Pick<Storage, 'getItem'>;
  historyState?: unknown;
}): AppViewId {
  const linked = new URLSearchParams(location.search).get('view');
  const historyOwner = historyState && typeof historyState === 'object'
    ? (historyState as Record<string, unknown>)[VIEW_HISTORY_USER_KEY]
    : null;
  if ((historyOwner == null || historyOwner === userId) && isAppViewAllowed(linked, role)) return linked;

  try {
    const stored = storage.getItem(lastViewStorageKey(userId));
    if (isAppViewAllowed(stored, role)) return stored;
  } catch {
    // El almacenamiento del navegador puede estar deshabilitado. Inicio sigue siendo seguro.
  }
  return 'home';
}

export function storeLastAppView(
  userId: string,
  view: AppViewId,
  storage: Pick<Storage, 'setItem'>,
) {
  try {
    storage.setItem(lastViewStorageKey(userId), view);
  } catch {
    // La navegación no debe depender de que localStorage esté disponible.
  }
}
