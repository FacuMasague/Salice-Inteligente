import { describe, expect, it } from 'vitest';
import { reportActiveFilterCount } from './ReportExperience';

describe('conteo de filtros de reportes', () => {
  it('no presenta como activos los valores predeterminados de la vista', () => {
    const filters = { month: '2026-08', status: 'all', seller: '' };
    expect(reportActiveFilterCount(filters, filters)).toBe(0);
  });

  it('cuenta un valor vacío cuando amplía un default obligatorio', () => {
    expect(reportActiveFilterCount(
      { channelGroup: '', brand: '' },
      { channelGroup: 'Especializado', brand: '' },
    )).toBe(1);
  });

  it('cuenta conjuntamente cambios de período y criterios comerciales', () => {
    expect(reportActiveFilterCount(
      { month: '2026-07', seller: 'Edgardo Larrea', brand: '' },
      { month: '2026-08', seller: '', brand: '' },
    )).toBe(2);
  });
});
