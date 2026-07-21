export type FreshnessLevel = 'current' | 'attention' | 'stale' | 'unknown';
export type DataHealthLevel = 'healthy' | 'attention' | 'stale' | 'unavailable';

export interface FreshnessStatus {
  level: FreshnessLevel;
  generatedAt: string;
  ageHours: number | null;
  warningAfterHours: number;
  staleAfterHours: number;
  label: string;
}

export interface DataSourceHealth {
  id: string;
  label: string;
  level: DataHealthLevel;
  capturedAt: string;
  coverageFrom: string;
  coverageThrough: string;
  records: number;
  detail: string;
}

export interface DataHealthPayload {
  generatedAt: string;
  overall: DataHealthLevel;
  freshness: FreshnessStatus;
  sources: DataSourceHealth[];
  coverage: {
    activeGeocodedRate: number;
    pricedProductRate: number;
    validCreditTermRate: number;
    omittedInvoiceDetails: number;
    portfolioReviewClients: number;
  };
  limitations: string[];
  quality: PlatformAuditSummary | null;
}

export interface PlatformAuditSummary {
  generatedAt: string;
  sourceSnapshotAt: string;
  status: 'passed' | 'passed_with_warnings' | 'failed';
  total: number;
  passed: number;
  failed: number;
  warnings: number;
}

export function evaluateFreshness(
  generatedAt: string,
  now = new Date(),
  warningAfterHours = 24,
  staleAfterHours = 48,
): FreshnessStatus {
  const timestamp = new Date(generatedAt).getTime();
  if (!generatedAt || !Number.isFinite(timestamp)) {
    return { level: 'unknown', generatedAt, ageHours: null, warningAfterHours, staleAfterHours, label: 'Unknown snapshot date' };
  }
  const ageHours = Math.max(0, (now.getTime() - timestamp) / 3_600_000);
  if (ageHours > staleAfterHours) {
    return { level: 'stale', generatedAt, ageHours, warningAfterHours, staleAfterHours, label: `Snapshot is stale · ${Math.floor(ageHours)} h` };
  }
  if (ageHours > warningAfterHours) {
    return { level: 'attention', generatedAt, ageHours, warningAfterHours, staleAfterHours, label: `Review snapshot · ${Math.floor(ageHours)} h` };
  }
  return { level: 'current', generatedAt, ageHours, warningAfterHours, staleAfterHours, label: ageHours < 1 ? 'Snapshot updated less than 1 h ago' : `Snapshot updated ${Math.floor(ageHours)} h ago` };
}
