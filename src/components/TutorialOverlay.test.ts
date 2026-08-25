import { describe, expect, it } from 'vitest';
import { GUIDED_EXPERIENCES, TASK_JOURNEYS, TUTORIALS } from './TutorialOverlay';

describe('tutoriales interactivos v1.2.1', () => {
  it('ofrece recorridos extensos e independientes para las tres áreas', () => {
    expect(Object.keys(TUTORIALS)).toEqual(['operations', 'administration', 'reports']);
    expect(TUTORIALS.operations.steps.length).toBeGreaterThanOrEqual(10);
    expect(TUTORIALS.administration.steps.length).toBeGreaterThanOrEqual(9);
    expect(TUTORIALS.reports.steps.length).toBeGreaterThanOrEqual(11);
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
    expect(Object.keys(GUIDED_EXPERIENCES)).toHaveLength(7);
    for (const journey of Object.values(TASK_JOURNEYS)) {
      expect(journey.steps.length).toBeGreaterThanOrEqual(4);
      expect(journey.steps.every((step) => step.target.length > 0 && step.view.length > 0)).toBe(true);
    }
  });
});
