import { describe, expect, it } from 'vitest';
import { TUTORIALS } from './TutorialOverlay';

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
});
