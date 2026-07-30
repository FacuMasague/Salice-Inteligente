export const SALICE_COMPANY_ID = 3;
export const SALICE_PRIMARY_BRANCH_ID = 3;

export const EXCLUDED_SALICE_CLIENT_IDS = [30033] as const;
export const EXCLUDED_SALICE_CLIENT_NAMES = ['Via Salice MDP S.A.'] as const;

const identity = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLocaleLowerCase('es')
  .replace(/[^a-z0-9]+/g, '');

const excludedClientIDs = new Set<number>(EXCLUDED_SALICE_CLIENT_IDS);
const excludedClientNames = new Set(EXCLUDED_SALICE_CLIENT_NAMES.map(identity));

export function isSaliceCompany(value: unknown) {
  return Number(value) === SALICE_COMPANY_ID;
}

export function isExcludedSaliceClient(clientID: unknown, ...names: unknown[]) {
  const numericID = Number(clientID);
  return (Number.isFinite(numericID) && excludedClientIDs.has(numericID))
    || names.some((name) => excludedClientNames.has(identity(name)));
}

export function hasExplicitForeignCompanyScope(
  definitions: Array<Record<string, unknown>> | undefined,
) {
  const companyIDs = (definitions ?? [])
    .map((definition) => Number(definition.empresaID))
    .filter((companyID) => Number.isFinite(companyID) && companyID > 0);
  return companyIDs.length > 0 && !companyIDs.includes(SALICE_COMPANY_ID);
}
