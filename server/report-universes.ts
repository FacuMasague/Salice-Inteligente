import { REPORT_UNIVERSES } from '../shared/metrics.js';
import { EXCLUDED_HISTORICAL_SELLERS } from '../shared/commercial-seller-scope.js';
import {
  EXCLUDED_SALICE_CLIENT_NAMES,
  SALICE_COMPANY_ID,
  SALICE_PRIMARY_BRANCH_ID,
} from '../shared/salice-data-scope.js';
import type { SqlValue } from './report-metrics.js';

export interface ExecutableMovementUniverse {
  id: string;
  companies: number[];
  branches: number[];
  allowedIssuers: string[];
  includedProductGroups?: string[];
  excludedClients?: string[];
  excludedCategories?: string[];
  clientStatuses?: string[];
  excludedProductGroups?: string[];
  excludedSellers?: string[];
  textComparison?: 'exact' | 'upper';
}

export const EXECUTABLE_UNIVERSES = {
  spt: { id: 'spt-main', companies: [SALICE_COMPANY_ID], branches: [SALICE_PRIMARY_BRANCH_ID], allowedIssuers: [], excludedClients: [...EXCLUDED_SALICE_CLIENT_NAMES], excludedCategories: ['POP', 'Promociones'] },
  commercialSales: { id: 'commercial-sales', companies: [SALICE_COMPANY_ID], branches: [SALICE_PRIMARY_BRANCH_ID], allowedIssuers: ['Salice Distribuciones S.A.'], excludedClients: [...EXCLUDED_SALICE_CLIENT_NAMES, 'Consumidor Final', 'GBA M6 S.A.'] },
  mars: { id: 'mars', companies: [3], branches: [3], allowedIssuers: ['Salice Distribuciones S.A.'], includedProductGroups: ['Pet Nutrition'], excludedClients: ['Via Salice MDP S.A.'] },
  nutripet: { id: 'nutripet', companies: [3], branches: [3], allowedIssuers: ['Salice Distribuciones S.A.'], includedProductGroups: ['Nutri Pet'], excludedCategories: ['POP'], excludedClients: ['Via Salice MDP S.A.'] },
  baires: { id: 'baires', companies: [3], branches: [3], allowedIssuers: ['Salice Distribuciones S.A.'], includedProductGroups: ['Baires SPT', 'Baires Masivo'], excludedCategories: ['POP'], excludedClients: ['Via Salice MDP S.A.'] },
  nonBuyers: { id: 'non-buyers', companies: [3], branches: [3], allowedIssuers: ['Salice Distribuciones S.A.'], clientStatuses: ['Activo'], excludedClients: ['Consumidor Final', '', '*** ANULADO ***'], excludedProductGroups: ['Drovet', 'Kualcos'], excludedCategories: ['POP', 'Promociones'], excludedSellers: ['Administración', 'Carolina', ''], textComparison: 'exact' },
  general: { id: 'general-status', companies: [3], branches: [3], allowedIssuers: ['Salice Distribuciones S.A.'], textComparison: 'exact' },
} as const satisfies Record<string, ExecutableMovementUniverse>;

function placeholders(values: readonly unknown[]) {
  return values.map(() => '?').join(', ');
}

export function compileMovementUniverse(universe: ExecutableMovementUniverse) {
  const clauses: string[] = [];
  const parameters: SqlValue[] = [];
  const upperText = universe.textComparison !== 'exact';
  const include = (column: string, values: readonly (string | number)[], textual = false) => {
    if (!values.length) return;
    clauses.push(`${textual ? (upperText ? `UPPER(TRIM(${column}))` : `TRIM(${column})`) : column} IN (${placeholders(values)})`);
    parameters.push(...(textual && upperText ? values.map((value) => String(value).toUpperCase()) : values));
  };
  const exclude = (column: string, values: readonly string[]) => {
    if (!values.length) return;
    clauses.push(`${upperText ? `UPPER(TRIM(${column}))` : `TRIM(${column})`} NOT IN (${placeholders(values)})`);
    parameters.push(...(upperText ? values.map((value) => value.toUpperCase()) : values));
  };
  const excludeExact = (column: string, values: readonly string[]) => {
    if (!values.length) return;
    clauses.push(`TRIM(${column}) NOT IN (${placeholders(values)})`);
    parameters.push(...values);
  };
  include('company_id', universe.companies);
  include('branch_id', universe.branches);
  include('issuer_name', universe.allowedIssuers, true);
  include('product_group', universe.includedProductGroups ?? [], true);
  include('client_status', universe.clientStatuses ?? [], true);
  exclude('client_name', universe.excludedClients ?? []);
  exclude('category', universe.excludedCategories ?? []);
  exclude('product_group', universe.excludedProductGroups ?? []);
  // SQLite no transforma letras acentuadas con UPPER sin una extensión ICU.
  // Los nombres provienen del maestro GESI y se comparan con su texto exacto.
  excludeExact('seller', EXCLUDED_HISTORICAL_SELLERS);
  excludeExact('branch_seller', EXCLUDED_HISTORICAL_SELLERS);
  exclude('branch_seller', universe.excludedSellers ?? []);
  return { sql: clauses.length ? clauses.join(' AND ') : '1 = 1', parameters };
}

export function validateExecutableUniverses() {
  return Object.values(EXECUTABLE_UNIVERSES).flatMap((runtime) => {
    const documented = REPORT_UNIVERSES.find((universe) => universe.id === runtime.id);
    if (!documented) return [`${runtime.id}: no está documentado`];
    const issues: string[] = [];
    if (JSON.stringify(runtime.companies) !== JSON.stringify(documented.companies)) issues.push(`${runtime.id}: empresas no coinciden`);
    if (JSON.stringify(runtime.branches) !== JSON.stringify(documented.branches)) issues.push(`${runtime.id}: sucursales no coinciden`);
    if (JSON.stringify(runtime.allowedIssuers) !== JSON.stringify(documented.allowedIssuers)) issues.push(`${runtime.id}: emisores no coinciden`);
    return issues;
  });
}
