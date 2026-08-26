import { describe, expect, it } from 'vitest';
import { GUIDED_EXPERIENCES, TASK_JOURNEYS, TUTORIALS } from './TutorialOverlay';

describe('tutoriales interactivos v2.1.3', () => {
  it('ofrece un tutorial independiente para cada sección principal del menú', () => {
    expect(new Set(Object.keys(TUTORIALS))).toEqual(new Set(['daily-work', 'clients-sales', 'planning', 'reports']));
    expect(TUTORIALS['daily-work'].steps.length).toBeGreaterThanOrEqual(7);
    expect(TUTORIALS['clients-sales'].steps.length).toBeGreaterThanOrEqual(7);
    expect(TUTORIALS.planning.steps.length).toBeGreaterThanOrEqual(4);
    expect(TUTORIALS.reports.steps.length).toBeGreaterThanOrEqual(11);
  });

  it('recorre los módulos actuales que corresponden a cada sección', () => {
    const views = (section: keyof typeof TUTORIALS) => new Set(TUTORIALS[section].steps.map((step) => step.view));
    expect(views('daily-work')).toEqual(new Set(['home', 'agenda', 'finance', 'receivables']));
    expect(views('clients-sales')).toEqual(new Set(['clients', 'sellers', 'sales-explorer', 'products', 'brands']));
    expect(views('planning')).toEqual(new Set(['map', 'routes']));
    expect(views('reports')).toContain('report-center');
  });

  it('explica en cada paso qué muestra, cómo usarlo y qué límite respetar', () => {
    for (const tutorial of Object.values(TUTORIALS)) {
      for (const step of tutorial.steps) {
        expect(step.description.length).toBeGreaterThan(80);
        expect(step.details).toHaveLength(2);
        expect(step.details.every((detail) => detail.length > 60)).toBe(true);
        expect(step.tip.length).toBeGreaterThan(45);
      }
    }
  });

  it('conserva los tutoriales generales y agrega recorridos prácticos independientes', () => {
    expect(Object.keys(TASK_JOURNEYS)).toEqual([
      'review-client',
      'manage-collection',
      'find-document',
      'review-month',
    ]);
    expect(Object.keys(GUIDED_EXPERIENCES)).toHaveLength(8);
    for (const journey of Object.values(TASK_JOURNEYS)) {
      expect(journey.steps.length).toBeGreaterThanOrEqual(4);
      expect(journey.steps.every((step) => step.target.length > 0 && step.view.length > 0)).toBe(true);
    }
  });
});
