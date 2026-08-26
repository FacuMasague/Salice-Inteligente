import type { ReportViewId } from './report-center';

export type ReportLinkFilters = Record<string, string>;

const VIEW_PARAM = 'view';
const FILTER_PREFIX = 'f.';

export function buildReportLink(view: ReportViewId, filters: ReportLinkFilters, location = window.location) {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set(VIEW_PARAM, view);
  Object.entries(filters)
    .filter(([, value]) => value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([key, value]) => url.searchParams.set(`${FILTER_PREFIX}${key}`, value));
  return url.toString();
}

export function reportViewFromLocation(location = window.location): ReportViewId | null {
  const value = new URLSearchParams(location.search).get(VIEW_PARAM);
  return value as ReportViewId | null;
}

export function reportFiltersFromLocation<ViewFilters extends ReportLinkFilters>(
  view: ReportViewId,
  defaults: ViewFilters,
  location = window.location,
): ViewFilters {
  const params = new URLSearchParams(location.search);
  if (params.get(VIEW_PARAM) !== view) return defaults;
  const next = { ...defaults };
  Object.keys(defaults).forEach((key) => {
    const value = params.get(`${FILTER_PREFIX}${key}`);
    if (value != null) next[key as keyof ViewFilters] = value as ViewFilters[keyof ViewFilters];
  });
  return next;
}

export function replaceViewInLocation(view: string, location = window.location, history = window.history) {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set(VIEW_PARAM, view);
  history.replaceState(history.state, '', url);
}
