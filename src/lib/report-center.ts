export const REPORT_VIEW_IDS = [
  'reports',
  'commercial-sales',
  'spt',
  'pending-balances',
  'non-buyers',
  'mars',
  'nutripet',
  'baires',
] as const;

export type ReportViewId = typeof REPORT_VIEW_IDS[number];

export interface RecentReport {
  id: ReportViewId;
  openedAt: string;
}

export const isReportViewId = (value: unknown): value is ReportViewId =>
  typeof value === 'string' && REPORT_VIEW_IDS.includes(value as ReportViewId);

export function parseFavoriteReports(raw: string | null): ReportViewId[] {
  if (!raw) return [];
  try {
    const values = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    return [...new Set(values.filter(isReportViewId))];
  } catch {
    return [];
  }
}

export function parseRecentReports(raw: string | null): RecentReport[] {
  if (!raw) return [];
  try {
    const values = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    const seen = new Set<ReportViewId>();
    return values.flatMap((value): RecentReport[] => {
      if (!value || typeof value !== 'object') return [];
      const candidate = value as Partial<RecentReport>;
      if (!isReportViewId(candidate.id) || typeof candidate.openedAt !== 'string' || Number.isNaN(Date.parse(candidate.openedAt)) || seen.has(candidate.id)) return [];
      seen.add(candidate.id);
      return [{ id: candidate.id, openedAt: candidate.openedAt }];
    }).slice(0, 5);
  } catch {
    return [];
  }
}

export function toggleFavoriteReport(current: ReportViewId[], id: ReportViewId) {
  return current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
}

export function rememberRecentReport(current: RecentReport[], id: ReportViewId, openedAt = new Date().toISOString()) {
  return [{ id, openedAt }, ...current.filter((value) => value.id !== id)].slice(0, 5);
}
