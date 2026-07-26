import { describe, expect, it } from 'vitest';
import { auditAiOutput, auditNarrativeContradictions } from './ai-quality';

const evidence = {
  reportId: 'general',
  period: '2026-07-01 — 2026-07-24',
  universe: 'Empresa 3, sucursal 3',
  partial: true,
  metrics: [{ id: 'general:metric:completion', value: 62.806, unit: '%' }],
};

describe('control global de calidad de narrativas', () => {
  it('aprueba una afirmación citada y respaldada numéricamente', () => {
    const result = auditAiOutput({
      functionKey: 'report_narrative',
      output: {
        findings: [{ text: 'El cumplimiento es 62,81%.', evidenceIds: ['general:metric:completion'] }],
      },
      evidence,
      evidenceRefs: ['general:metric:completion'],
    });
    expect(result.status).toBe('passed');
  });

  it('interpreta separadores argentinos y abreviaturas de magnitud', () => {
    const result = auditAiOutput({
      functionKey: 'report_narrative',
      output: {
        findings: [
          { text: 'El resultado fue 156.513,32 kg.', evidenceIds: ['general:metric:actual'] },
          { text: 'El objetivo fue 249,2 mil kg.', evidenceIds: ['general:metric:target'] },
        ],
      },
      evidence: {
        ...evidence,
        metrics: [
          { id: 'general:metric:actual', value: 156_513.32, unit: 'kg' },
          { id: 'general:metric:target', value: 249_200, unit: 'kg' },
        ],
      },
      evidenceRefs: ['general:metric:actual', 'general:metric:target'],
    });
    expect(result.status).toBe('passed');
  });

  it('bloquea afirmaciones sin cita, cifras inventadas y períodos parciales declarados completos', () => {
    const result = auditAiOutput({
      functionKey: 'report_narrative',
      output: {
        findings: [{ text: 'El mes completo alcanzó 91,00%.', evidenceIds: [] }],
      },
      evidence,
      evidenceRefs: ['general:metric:completion'],
    });
    expect(result.status).toBe('blocked');
    expect(result.issues.join(' ')).toMatch(/sin evidencia|sin respaldo|parcial/i);
  });

  it('detecta direcciones contradictorias entre narrativas que citan el mismo dato', () => {
    const contradictions = auditNarrativeContradictions([
      {
        artifactId: 'a',
        functionKey: 'report_narrative',
        output: { findings: [{ text: 'La venta aumentó.', evidenceIds: ['metric:sales'] }] },
        evidence: {},
        evidenceRefs: ['metric:sales'],
      },
      {
        artifactId: 'b',
        functionKey: 'executive_summary',
        output: { keyIssues: [{ text: 'La venta cayó.', evidenceIds: ['metric:sales'] }] },
        evidence: {},
        evidenceRefs: ['metric:sales'],
      },
    ]);
    expect(contradictions.get('a')).toHaveLength(1);
    expect(contradictions.get('b')).toHaveLength(1);
  });
});
