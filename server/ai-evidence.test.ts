import { describe, expect, it } from 'vitest';
import { assertCompactSafeEvidence, canonicalJson, semanticRequestHash } from './ai-evidence';

describe('paquetes compactos de evidencia para IA', () => {
  it('canoniza objetos y produce el mismo hash sin depender del orden de campos', () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
    const base = {
      functionKey: 'report_narrative',
      entityType: 'report',
      entityId: 'general',
      model: 'gpt-5.6-terra',
      effort: 'medium',
      promptVersion: 1,
      schemaVersion: 1,
    };
    expect(semanticRequestHash({ ...base, evidenceJson: canonicalJson({ b: 2, a: 1 }) }))
      .toBe(semanticRequestHash({ ...base, evidenceJson: canonicalJson({ a: 1, b: 2 }) }));
  });

  it('rechaza datos personales, credenciales y paquetes sobredimensionados', () => {
    expect(() => assertCompactSafeEvidence({ cliente: { email: 'privado@ejemplo.com' } }, 1_000)).toThrow(/no permitido/);
    expect(() => assertCompactSafeEvidence({ api_key: 'secreto' }, 1_000)).toThrow(/no permitido/);
    expect(() => assertCompactSafeEvidence({ metrics: 'x'.repeat(2_000) }, 100)).toThrow(/supera el límite/);
  });
});
