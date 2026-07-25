import { describe, expect, it } from 'vitest';
import { parseFavoriteReports, parseRecentReports, rememberRecentReport, toggleFavoriteReport } from './report-center';

describe('centro de reportes', () => {
  it('conserva únicamente favoritos correspondientes a reportes conocidos', () => {
    expect(parseFavoriteReports(JSON.stringify(['spt', 'desconocido', 'spt', 'mars']))).toEqual(['spt', 'mars']);
    expect(parseFavoriteReports('no es json')).toEqual([]);
  });

  it('alterna un favorito sin duplicarlo', () => {
    expect(toggleFavoriteReport(['spt'], 'mars')).toEqual(['spt', 'mars']);
    expect(toggleFavoriteReport(['spt', 'mars'], 'spt')).toEqual(['mars']);
  });

  it('lleva el último acceso al inicio y limita la historia', () => {
    const base = [
      { id: 'spt' as const, openedAt: '2026-07-20T12:00:00.000Z' },
      { id: 'mars' as const, openedAt: '2026-07-19T12:00:00.000Z' },
    ];
    expect(rememberRecentReport(base, 'mars', '2026-07-24T12:00:00.000Z')).toEqual([
      { id: 'mars', openedAt: '2026-07-24T12:00:00.000Z' },
      { id: 'spt', openedAt: '2026-07-20T12:00:00.000Z' },
    ]);
  });

  it('descarta accesos recientes corruptos o desconocidos', () => {
    expect(parseRecentReports(JSON.stringify([
      { id: 'baires', openedAt: '2026-07-24T12:00:00.000Z' },
      { id: 'otro', openedAt: '2026-07-24T12:00:00.000Z' },
      { id: 'spt', openedAt: 'fecha inválida' },
    ]))).toEqual([{ id: 'baires', openedAt: '2026-07-24T12:00:00.000Z' }]);
  });
});
