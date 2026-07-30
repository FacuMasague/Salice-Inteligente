import { describe, expect, it } from 'vitest';
import {
  hasExplicitForeignDataScope,
  isExcludedSaliceClient,
  isSaliceBranch,
  isSaliceCompany,
  isSaliceDataScope,
} from './salice-data-scope';

describe('alcance canónico de datos Salice', () => {
  it('acepta únicamente movimientos de empresa 3 y sucursal 3', () => {
    expect(isSaliceCompany(3)).toBe(true);
    expect(isSaliceCompany('3')).toBe(true);
    expect(isSaliceCompany(7)).toBe(false);
    expect(isSaliceCompany(undefined)).toBe(false);
    expect(isSaliceBranch(3)).toBe(true);
    expect(isSaliceBranch(6)).toBe(false);
    expect(isSaliceDataScope(3, 3)).toBe(true);
    expect(isSaliceDataScope(3, 6)).toBe(false);
    expect(isSaliceDataScope(7, 3)).toBe(false);
  });

  it('reconoce Via Salice por ID o razón social normalizada', () => {
    expect(isExcludedSaliceClient(30033)).toBe(true);
    expect(isExcludedSaliceClient(null, 'VÍA SALICE MDP SA')).toBe(true);
    expect(isExcludedSaliceClient(101, 'Cliente Salice')).toBe(false);
  });

  it('excluye un maestro cuando sólo declara empresas o sucursales ajenas', () => {
    expect(hasExplicitForeignDataScope([{ empresaID: 7, sucursalID: 3 }])).toBe(true);
    expect(hasExplicitForeignDataScope([{ empresaID: 3, sucursalID: 6 }])).toBe(true);
    expect(hasExplicitForeignDataScope([{ empresaID: 3, sucursalID: 3 }, { empresaID: 3, sucursalID: 6 }])).toBe(false);
    expect(hasExplicitForeignDataScope([{ empresaID: 3 }, { empresaID: 7 }])).toBe(false);
    expect(hasExplicitForeignDataScope([])).toBe(false);
    expect(hasExplicitForeignDataScope(undefined)).toBe(false);
  });
});
