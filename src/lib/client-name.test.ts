import { describe, expect, it } from 'vitest';
import { clientInitials, clientPrimaryName, clientSecondaryName } from './client-name';

describe('identidad visible del cliente', () => {
  it('usa la razón social como nombre principal y la fantasía como subtítulo', () => {
    const client = { name: 'Salice Distribuciones S.A.', tradeName: 'Salice' };
    expect(clientPrimaryName(client)).toBe('Salice Distribuciones S.A.');
    expect(clientSecondaryName(client)).toBe('Salice');
    expect(clientInitials(client)).toBe('SD');
  });

  it('no repite el subtítulo cuando ambos nombres son equivalentes', () => {
    expect(clientSecondaryName({ name: 'Droopy', tradeName: '  DROOPY  ' })).toBe('');
  });

  it('conserva una salida legible cuando falta la razón social', () => {
    expect(clientPrimaryName({ name: '', tradeName: 'El Molino' })).toBe('El Molino');
  });
});
