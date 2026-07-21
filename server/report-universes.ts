import { REPORT_UNIVERSES } from '../shared/metrics.js';
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
  spt: { id: 'spt-main', companies: [3], branches: [3], allowedIssuers: [], excludedCategories: ['Promotional'] },
  commercialSales: { id: 'commercial-sales', companies: [3], branches: [3], allowedIssuers: ['SMART Salice Demo Company'], excludedClients: [] },
  mars: { id: 'mars', companies: [3], branches: [3], allowedIssuers: ['SMART Salice Demo Company'], includedProductGroups: ['Orbit Nutrition'], excludedClients: [] },
  nutripet: { id: 'nutripet', companies: [3], branches: [3], allowedIssuers: ['SMART Salice Demo Company'], includedProductGroups: ['Nova Pet'], excludedCategories: ['Promotional'], excludedClients: [] },
  baires: { id: 'baires', companies: [3], branches: [3], allowedIssuers: ['SMART Salice Demo Company'], includedProductGroups: ['Harbor SPT', 'Harbor Retail'], excludedCategories: ['Promotional'], excludedClients: [] },
  nonBuyers: { id: 'non-buyers', companies: [3], branches: [3], allowedIssuers: ['SMART Salice Demo Company'], clientStatuses: ['Active'], excludedClients: [], excludedProductGroups: [], excludedCategories: ['Promotional'], excludedSellers: [], textComparison: 'exact' },
  general: { id: 'general-status', companies: [3], branches: [3], allowedIssuers: ['SMART Salice Demo Company'], textComparison: 'exact' },
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
  include('company_id', universe.companies);
  include('branch_id', universe.branches);
  include('issuer_name', universe.allowedIssuers, true);
  include('product_group', universe.includedProductGroups ?? [], true);
  include('client_status', universe.clientStatuses ?? [], true);
  exclude('client_name', universe.excludedClients ?? []);
  exclude('category', universe.excludedCategories ?? []);
  exclude('product_group', universe.excludedProductGroups ?? []);
  exclude('branch_seller', universe.excludedSellers ?? []);
  return { sql: clauses.length ? clauses.join(' AND ') : '1 = 1', parameters };
}

export function validateExecutableUniverses() {
  return Object.values(EXECUTABLE_UNIVERSES).flatMap((runtime) => {
    const documented = REPORT_UNIVERSES.find((universe) => universe.id === runtime.id);
    if (!documented) return [`${runtime.id}: universe is not documented`];
    const issues: string[] = [];
    if (JSON.stringify(runtime.companies) !== JSON.stringify(documented.companies)) issues.push(`${runtime.id}: companies do not match`);
    if (JSON.stringify(runtime.branches) !== JSON.stringify(documented.branches)) issues.push(`${runtime.id}: branches do not match`);
    if (JSON.stringify(runtime.allowedIssuers) !== JSON.stringify(documented.allowedIssuers)) issues.push(`${runtime.id}: issuers do not match`);
    return issues;
  });
}
