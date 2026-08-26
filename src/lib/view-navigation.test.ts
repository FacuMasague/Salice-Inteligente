import { describe, expect, it, vi } from 'vitest';
import {
  isAppViewAllowed,
  lastViewStorageKey,
  resolveInitialAppView,
  storeLastAppView,
} from './view-navigation';

describe('navegación persistente', () => {
  it('prioriza una vista válida del enlace sobre la vista guardada', () => {
    const storage = { getItem: vi.fn(() => 'clients') };
    expect(resolveInitialAppView({
      userId: 'u-1',
      role: 'office',
      location: { search: '?view=products' },
      storage,
    })).toBe('products');
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it('restaura la última vista del usuario cuando no hay un enlace válido', () => {
    const storage = { getItem: vi.fn((key: string) => key === lastViewStorageKey('u-2') ? 'routes' : null) };
    expect(resolveInitialAppView({
      userId: 'u-2',
      role: 'office',
      location: { search: '' },
      storage,
    })).toBe('routes');
  });

  it('no hereda la URL interna de otro usuario del mismo navegador', () => {
    expect(resolveInitialAppView({
      userId: 'u-actual',
      role: 'office',
      location: { search: '?view=products' },
      storage: { getItem: () => 'clients' },
      historyState: { saliceViewUserId: 'u-anterior' },
    })).toBe('clients');
  });

  it('descarta vistas desconocidas o sin permiso', () => {
    expect(isAppViewAllowed('users', 'office')).toBe(false);
    expect(isAppViewAllowed('user-activity', 'admin')).toBe(false);
    expect(isAppViewAllowed('users', 'admin')).toBe(true);
    expect(isAppViewAllowed('user-activity', 'developer')).toBe(true);
    expect(isAppViewAllowed('inventada', 'developer')).toBe(false);

    expect(resolveInitialAppView({
      userId: 'u-3',
      role: 'office',
      location: { search: '?view=user-activity' },
      storage: { getItem: () => 'users' },
    })).toBe('home');
  });

  it('guarda por usuario y no bloquea la navegación si el navegador rechaza la escritura', () => {
    const setItem = vi.fn();
    storeLastAppView('u-4', 'sellers', { setItem });
    expect(setItem).toHaveBeenCalledWith(lastViewStorageKey('u-4'), 'sellers');

    expect(() => storeLastAppView('u-4', 'sellers', {
      setItem: () => { throw new Error('storage disabled'); },
    })).not.toThrow();
  });
});
