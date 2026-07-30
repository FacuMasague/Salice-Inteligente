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

export function isSaliceBranch(value: unknown) {
  return Number(value) === SALICE_PRIMARY_BRANCH_ID;
}

export function isSaliceDataScope(companyID: unknown, branchID: unknown) {
  return isSaliceCompany(companyID) && isSaliceBranch(branchID);
}

export function isExcludedSaliceClient(clientID: unknown, ...names: unknown[]) {
  const numericID = Number(clientID);
  return (Number.isFinite(numericID) && excludedClientIDs.has(numericID))
    || names.some((name) => excludedClientNames.has(identity(name)));
}

export function hasExplicitForeignDataScope(
  definitions: Array<Record<string, unknown>> | undefined,
) {
  const explicitDefinitions = (definitions ?? []).filter((definition) => (
    Number.isFinite(Number(definition.empresaID))
    && Number(definition.empresaID) > 0
    && Number.isFinite(Number(definition.sucursalID))
    && Number(definition.sucursalID) > 0
  ));
  return explicitDefinitions.length > 0
    && !explicitDefinitions.some((definition) => (
      isSaliceDataScope(definition.empresaID, definition.sucursalID)
    ));
}
