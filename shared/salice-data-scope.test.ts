import { describe, expect, it } from 'vitest';
import {
  hasExplicitForeignCompanyScope,
  isExcludedSaliceClient,
  isSaliceCompany,
} from './salice-data-scope';

describe('alcance canónico de datos Salice', () => {
  it('acepta únicamente movimientos de empresa 3', () => {
    expect(isSaliceCompany(3)).toBe(true);
    expect(isSaliceCompany('3')).toBe(true);
    expect(isSaliceCompany(7)).toBe(false);
    expect(isSaliceCompany(undefined)).toBe(false);
  });

  it('reconoce Via Salice por ID o razón social normalizada', () => {
    expect(isExcludedSaliceClient(30033)).toBe(true);
    expect(isExcludedSaliceClient(null, 'VÍA SALICE MDP SA')).toBe(true);
    expect(isExcludedSaliceClient(101, 'Cliente Salice')).toBe(false);
  });

  it('sólo excluye un maestro por empresa cuando declara un alcance extranjero inequívoco', () => {
    expect(hasExplicitForeignCompanyScope([{ empresaID: 7, sucursalID: 3 }])).toBe(true);
    expect(hasExplicitForeignCompanyScope([{ empresaID: 3 }, { empresaID: 7 }])).toBe(false);
    expect(hasExplicitForeignCompanyScope([])).toBe(false);
    expect(hasExplicitForeignCompanyScope(undefined)).toBe(false);
  });
});
