import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, PREFERENCES_STORAGE_KEY, readPreferences } from './preferences';

function storageWith(value: string | null) {
  return { getItem: vi.fn(() => value) };
}

describe('preferencias de interfaz', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('usa la densidad compacta cuando todavía no hay una preferencia', () => {
    vi.stubGlobal('localStorage', storageWith(null));
    expect(readPreferences().density).toBe(DEFAULT_PREFERENCES.density);
    expect(localStorage.getItem).toHaveBeenCalledWith(PREFERENCES_STORAGE_KEY);
  });

  it('conserva la vista amplia y migra la opción histórica comfortable', () => {
    vi.stubGlobal('localStorage', storageWith(JSON.stringify({ density: 'wide' })));
    expect(readPreferences().density).toBe('wide');

    vi.stubGlobal('localStorage', storageWith(JSON.stringify({ density: 'comfortable' })));
    expect(readPreferences().density).toBe('wide');
  });

  it('descarta una densidad desconocida y vuelve a compacta', () => {
    vi.stubGlobal('localStorage', storageWith(JSON.stringify({ density: 'invalid' })));
    expect(readPreferences().density).toBe('compact');
  });
});
