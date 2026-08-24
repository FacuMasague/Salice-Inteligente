import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, PREFERENCES_STORAGE_KEY, readPreferences } from './preferences';

function storageWith(value: string | null) {
  return { getItem: vi.fn(() => value) };
}

describe('preferencias de interfaz', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('usa la densidad compacta cuando todavía no hay una preferencia', () => {
    vi.stubGlobal('localStorage', storageWith(null));
    expect(readPreferences()).toMatchObject({ density: DEFAULT_PREFERENCES.density, informationView: 'complete' });
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

  it('conserva la vista simple y descarta valores desconocidos', () => {
    vi.stubGlobal('localStorage', storageWith(JSON.stringify({ informationView: 'simple' })));
    expect(readPreferences().informationView).toBe('simple');

    vi.stubGlobal('localStorage', storageWith(JSON.stringify({ informationView: 'minimal' })));
    expect(readPreferences().informationView).toBe('complete');
  });
});
