import { describe, expect, it } from 'vitest';
import { buildReportLink, reportFiltersFromLocation, reportViewFromLocation } from './report-links';

const location = { href: 'http://localhost:5173/?old=value', search: '?view=commercial-sales&f.brand=Mars&f.seller=Ana' } as Location;

describe('report internal links', () => {
  it('creates a stable link with the report and non-empty filters', () => {
    expect(buildReportLink('commercial-sales', { seller: 'Ana', brand: 'Mars', category: '' }, location))
      .toBe('http://localhost:5173/?view=commercial-sales&f.brand=Mars&f.seller=Ana');
  });

  it('restores only known filters for the matching report', () => {
    expect(reportFiltersFromLocation('commercial-sales', { seller: '', brand: '', category: '' }, location))
      .toEqual({ seller: 'Ana', brand: 'Mars', category: '' });
    expect(reportFiltersFromLocation('mars', { seller: '' }, location)).toEqual({ seller: '' });
  });

  it('reads the requested report', () => {
    expect(reportViewFromLocation(location)).toBe('commercial-sales');
  });
});
