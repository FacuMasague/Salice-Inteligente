export type AiReasoningEffort = 'low' | 'medium' | 'high';
export type AiRunTrigger = 'refresh' | 'manual' | 'manual-resume';
export type AiRunStatus = 'running' | 'completed' | 'partial' | 'failed' | 'skipped';
export type AiArtifactStatus = 'valid' | 'reused' | 'failed' | 'invalid' | 'skipped';
export type AiAttemptStatus = 'success' | 'transient_error' | 'provider_error' | 'structural_error';
export type AiFeedbackRating = 'useful' | 'not_useful' | 'incorrect' | 'incomplete';
export type AiQualityStatus = 'passed' | 'warning' | 'blocked';
export type AiBudgetAlert = 'normal' | 'warning' | 'exceeded';

export type AiFunctionKey =
  | 'product_vectorization'
  | 'report_narrative'
  | 'executive_summary'
  | 'commercial_inbox_explanation'
  | 'seller_summary'
  | 'report_coherence';

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

export interface AiPricing {
  version: string;
  currency: 'USD';
  inputPerMillion: number;
  cachedInputPerMillion: number;
  cacheWritePerMillion: number;
  outputPerMillion: number;
}

export interface AiProviderRequest {
  functionKey: AiFunctionKey;
  model: string;
  effort: AiReasoningEffort;
  prompt: string;
  promptVersion: number;
  schemaVersion: number;
  schemaName: string;
  schema: Record<string, unknown>;
  evidence: unknown;
  maxOutputTokens: number;
  requestHash: string;
}

export interface AiProviderResponse {
  responseId: string | null;
  output: unknown;
  usage: AiUsage;
  durationMs: number;
}

export interface AiProvider {
  readonly name: string;
  analyze(request: AiProviderRequest): Promise<AiProviderResponse>;
}

export interface AiEvidenceJob {
  entityType: string;
  entityId: string;
  evidence: unknown;
  evidenceRefs: string[];
}

export interface AiFunctionDefinition {
  key: AiFunctionKey;
  model: string;
  effort: AiReasoningEffort;
  prompt: string;
  promptVersion: number;
  schemaVersion: number;
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens: number;
  buildJobs(snapshot: unknown): Promise<AiEvidenceJob[]> | AiEvidenceJob[];
  validateOutput?(
    output: unknown,
    job: AiEvidenceJob,
    snapshot: unknown,
  ): { valid: true } | { valid: false; error: string };
}

export interface AiLimits {
  maxEntitiesPerFunction: number;
  maxEntitiesPerRun: number;
  maxInputBytesPerEntity: number;
  maxEstimatedInputTokensPerRun: number;
  maxOutputTokensPerRequest: number;
  maxEstimatedCostUsdPerRun: number;
  maxAttempts: 1 | 2;
}

export interface AiEvidenceStatement {
  text: string;
  evidenceIds: string[];
}

export interface AiFrequentlyAskedQuestion {
  question: string;
  answer: string;
  evidenceIds: string[];
}

export interface AiReportNarrative {
  title: string;
  currentState: string;
  findings: AiEvidenceStatement[];
  drivers: AiEvidenceStatement[];
  reviewItems: AiEvidenceStatement[];
  limitations: string[];
  faqs: AiFrequentlyAskedQuestion[];
}

export interface AiExecutiveBrief {
  currentState: string;
  keyIssues: AiEvidenceStatement[];
  favorableIndicators: AiEvidenceStatement[];
  reviewItems: AiEvidenceStatement[];
  limitations: string[];
  faqs: AiFrequentlyAskedQuestion[];
}

export interface AiCommercialExplanation {
  clientId: number;
  primaryReason: string;
  secondaryReasons: string[];
  explanation: string;
  evidenceIds: string[];
  commercialOpportunity: string;
  caution: string;
}

export interface AiSellerSummary {
  seller: string;
  summary: string;
  portfolioSignals: AiEvidenceStatement[];
  reviewItems: AiEvidenceStatement[];
  limitations: string[];
}

export interface AiStoredArtifact<T> {
  artifactId: string;
  snapshotAt: string;
  functionKey: AiFunctionKey;
  entityType: string;
  entityId: string;
  model: string;
  effort: AiReasoningEffort;
  promptVersion: number;
  schemaVersion: number;
  generatedAt: string;
  output: T;
  quality?: {
    status: AiQualityStatus;
    issues: string[];
    reviewedAt: string;
  } | null;
}

export interface AiFunctionStatusSummary {
  functionKey: AiFunctionKey;
  completed: number;
  reused: number;
  failed: number;
  skipped: number;
  model: string;
  effort: AiReasoningEffort;
}

export interface AiRunSummary {
  id: string;
  snapshotAt: string;
  bundleId: string | null;
  trigger: AiRunTrigger;
  status: AiRunStatus;
  startedAt: string;
  completedAt: string | null;
  functions: AiFunctionStatusSummary[];
  entities: number;
  completed: number;
  reused: number;
  failed: number;
  skipped: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  estimatedCostUsd: number;
  error: string | null;
}

export interface AiSystemStatus {
  configured: boolean;
  provider: string;
  activeSnapshotAt: string;
  current: AiRunSummary | null;
  lastRun: AiRunSummary | null;
  activeSnapshotRun: AiRunSummary | null;
  artifactCounts: {
    valid: number;
    reused: number;
    failed: number;
    invalid: number;
    skipped: number;
  };
  limits: AiLimits;
  pricing: AiPricing;
  usage: {
    currentMonth: AiUsagePeriodSummary;
    allTime: AiUsagePeriodSummary;
    functions: AiFunctionUsageSummary[];
    recentRuns: AiRunSummary[];
  };
  budget: {
    recommendedPerRunUsd: number;
    monthlyLimitUsd: number;
    warningPercent: number;
    spentUsd: number;
    remainingUsd: number;
    usedPercent: number;
    alert: AiBudgetAlert;
  };
  quality: {
    total: number;
    passed: number;
    warnings: number;
    blocked: number;
    issues: number;
  };
  feedback: {
    total: number;
    useful: number;
    notUseful: number;
    incorrect: number;
    incomplete: number;
    corrections: number;
  };
}

export interface AiUsagePeriodSummary {
  attempts: number;
  retries: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  estimatedCostUsd: number;
}

export interface AiFunctionUsageSummary extends AiUsagePeriodSummary {
  functionKey: AiFunctionKey;
  completed: number;
  reused: number;
  failed: number;
  skipped: number;
}

export interface AiFeedbackRecord {
  id: string;
  artifactId: string;
  snapshotAt: string;
  promptVersion: number;
  subjectEntityType: string;
  subjectEntityId: string;
  correctionVersion: number;
  rating: AiFeedbackRating;
  correction: string;
  actor: string;
  createdAt: string;
}

export interface AiQualityReview {
  id: string;
  artifactId: string;
  status: AiQualityStatus;
  checkVersion: number;
  issues: string[];
  createdAt: string;
}
