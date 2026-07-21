import { resolve } from 'node:path';

export interface ActiveDataPaths {
  snapshot: string;
  staging: string;
  commercial: string;
  pendingBalances: string;
  manifest: null;
  bundleId: null;
  platformAudit: string;
  vectorAudit: string;
  sptAudit: string;
}

/**
 * The hackathon build has one deterministic, local-only demo data pack.
 * There are no remote capture, activation, or credential-dependent paths.
 */
export function resolveActiveDataPaths(workspace = process.cwd()): ActiveDataPaths {
  return {
    snapshot: resolve(workspace, 'data/snapshot.json'),
    staging: resolve(workspace, 'data/staging/snapshot-demo.json'),
    commercial: resolve(workspace, 'data/commercial-demo.sqlite'),
    pendingBalances: resolve(workspace, 'data/pending-balances-demo.sqlite'),
    manifest: null,
    bundleId: null,
    platformAudit: resolve(workspace, 'data/quality/platform-audit.json'),
    vectorAudit: resolve(workspace, 'data/quality/product-vector-audit.json'),
    sptAudit: resolve(workspace, 'data/quality/commercial-data-audit.json'),
  };
}
