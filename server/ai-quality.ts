import type { AiFunctionKey, AiQualityStatus } from '../shared/ai.js';

export const AI_QUALITY_CHECK_VERSION = 3;

export interface AiQualityAuditResult {
  status: AiQualityStatus;
  issues: string[];
}

export interface AiQualityCandidate {
  artifactId: string;
  functionKey: AiFunctionKey;
  output: unknown;
  evidence: unknown;
  evidenceRefs: string[];
}

interface Claim {
  text: string;
  evidenceIds: string[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function collectStrings(value: unknown, values: string[] = [], key = ''): string[] {
  if (typeof value === 'string') {
    if (key !== 'evidenceIds' && key !== 'id') values.push(value);
    return values;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, values, key));
    return values;
  }
  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>)
      .forEach(([childKey, child]) => collectStrings(child, values, childKey));
  }
  return values;
}

function collectNumbers(value: unknown, values: number[] = [], key = ''): number[] {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (!/id$/i.test(key)) values.push(value);
    return values;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectNumbers(item, values, key));
    return values;
  }
  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>)
      .forEach(([childKey, child]) => collectNumbers(child, values, childKey));
  }
  return values;
}

function collectClaims(value: unknown, claims: Claim[] = []): Claim[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectClaims(item, claims));
    return claims;
  }
  if (!value || typeof value !== 'object') return claims;
  const item = value as Record<string, unknown>;
  const text = typeof item.text === 'string'
    ? item.text
    : typeof item.answer === 'string'
      ? item.answer
      : '';
  if (text || Object.hasOwn(item, 'evidenceIds')) {
    claims.push({
      text,
      evidenceIds: Array.isArray(item.evidenceIds)
        ? item.evidenceIds.filter((id): id is string => typeof id === 'string')
        : [],
    });
  }
  Object.values(item).forEach((child) => collectClaims(child, claims));
  return claims;
}

function parseLocalizedNumbers(value: string, percentage = false) {
  const compact = value.replace(/\s/g, '').replace('−', '-');
  const lastDot = compact.lastIndexOf('.');
  const lastComma = compact.lastIndexOf(',');
  const index = Math.max(lastDot, lastComma);
  if (index < 0) return [Number(compact)];
  const separators = [...compact].filter((character) => character === '.' || character === ',');
  const fractionLength = compact.length - index - 1;
  const integer = compact.slice(0, index).replace(/[.,]/g, '');
  const decimal = compact.slice(index + 1).replace(/[.,]/g, '');
  const decimalValue = Number(`${integer}.${decimal}`);
  return !percentage && separators.length === 1 && fractionLength === 3
    ? [decimalValue, Number(compact.replace(/[.,]/g, ''))]
    : [decimalValue];
}

function numericClaims(text: string) {
  const values: Array<{ value: number; alternatives: number[]; percentage: boolean }> = [];
  const pattern = /([−-]?\d(?:[\d.,]*\d)?)\s*(mil|k|millones?|M)?\s*(%|kg|ARS|clientes?|cuentas?|facturas?|documentos?)/gi;
  for (const match of text.matchAll(pattern)) {
    const percentage = match[3] === '%';
    const parsed = parseLocalizedNumbers(match[1], percentage);
    const scale = !match[2] ? 1 : /^(mil|k)$/i.test(match[2]) ? 1_000 : 1_000_000;
    const alternatives = parsed.filter(Number.isFinite).map((item) => item * scale);
    if (alternatives.length) values.push({ value: alternatives[0], alternatives, percentage });
  }
  const scorePattern = /\b[CoP]\s*=\s*([−-]?\d(?:[\d.,]*\d)?)/g;
  for (const match of text.matchAll(scorePattern)) {
    const alternatives = parseLocalizedNumbers(match[1]).filter(Number.isFinite);
    if (alternatives.length) values.push({ value: alternatives[0], alternatives, percentage: false });
  }
  return values;
}

function hasComparableEvidence(evidence: unknown) {
  const serialized = JSON.stringify(evidence).toLocaleLowerCase('es');
  return /compar|anterior|variación|diferencia|objetivo|previous|comparison/.test(serialized);
}

export function auditAiOutput(input: Omit<AiQualityCandidate, 'artifactId'>): AiQualityAuditResult {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const allowedRefs = new Set(input.evidenceRefs);
  const claims = collectClaims(input.output);
  const outputText = collectStrings(input.output).join(' ');
  const evidenceNumbers = collectNumbers(input.evidence);
  const evidenceTextNumbers = numericClaims(collectStrings(input.evidence).join(' '))
    .flatMap((item) => item.alternatives);

  for (const claim of claims) {
    if (claim.text && !claim.evidenceIds.length) {
      blocking.push('Afirmación verificable sin evidencia citada.');
      continue;
    }
    const invalid = claim.evidenceIds.filter((id) => !allowedRefs.has(id));
    if (invalid.length) blocking.push(`Evidencia inexistente: ${invalid.slice(0, 3).join(', ')}.`);
  }

  for (const numeric of numericClaims(outputText)) {
    const tolerance = numeric.percentage ? 0.011 : 1;
    const supported = numeric.alternatives.some((claimed) => (
      [...evidenceNumbers, ...evidenceTextNumbers]
        .some((candidate) => (
          Math.abs(candidate - claimed) <= tolerance
          || Math.abs(Math.abs(candidate) - Math.abs(claimed)) <= tolerance
        ))
    ));
    if (!supported) blocking.push(`Cifra sin respaldo numérico en la evidencia: ${numeric.value}${numeric.percentage ? '%' : ''}.`);
  }

  const evidenceRecord = record(input.evidence);
  if (input.functionKey === 'report_narrative' && Object.hasOwn(evidenceRecord, 'reportId')) {
    if (!String(evidenceRecord.period ?? '').trim()) blocking.push('El universo narrativo no declara un período verificable.');
    if (!String(evidenceRecord.universe ?? '').trim()) blocking.push('El universo narrativo no declara su alcance.');
    if (
      evidenceRecord.partial === true
      && /(?:período|mes) (?:actual|seleccionado) (?:está |es )?completo|datos definitivos al cierre|cierre definitivo del período/i.test(outputText)
    ) {
      blocking.push('La narrativa presenta como completo un período marcado como parcial.');
    }
    if (
      /comparado|comparación|frente a|versus|\bvs\.?\b|creci|aument|disminu|cayó|caída|variación/i.test(outputText)
      && !hasComparableEvidence(input.evidence)
    ) {
      blocking.push('La narrativa compara períodos sin una comparación equivalente en la evidencia.');
    }
  }

  if (!claims.length && ['report_narrative', 'executive_summary', 'seller_summary'].includes(input.functionKey)) {
    warnings.push('La salida no contiene afirmaciones estructuradas para auditar individualmente.');
  }

  return {
    status: blocking.length ? 'blocked' : warnings.length ? 'warning' : 'passed',
    issues: [...new Set([...blocking, ...warnings])],
  };
}

function directionalClaims(candidate: AiQualityCandidate) {
  return collectClaims(candidate.output).flatMap((claim) => {
    const normalized = claim.text.toLocaleLowerCase('es');
    const direction = /crec|aument|mejor|subi|superior|favorable/.test(normalized)
      ? 'positive'
      : /cay|caíd|dismin|baj|retro|inferior|negativ/.test(normalized)
        ? 'negative'
        : null;
    return direction ? claim.evidenceIds.map((evidenceId) => ({
      artifactId: candidate.artifactId,
      evidenceId,
      direction,
    })) : [];
  });
}

export function auditNarrativeContradictions(candidates: AiQualityCandidate[]) {
  const byEvidence = new Map<string, Array<{ artifactId: string; direction: string }>>();
  candidates.flatMap(directionalClaims).forEach((claim) => {
    byEvidence.set(claim.evidenceId, [...(byEvidence.get(claim.evidenceId) ?? []), claim]);
  });
  const issues = new Map<string, string[]>();
  for (const [evidenceId, claims] of byEvidence) {
    const artifacts = new Set(claims.map((claim) => claim.artifactId));
    const directions = new Set(claims.map((claim) => claim.direction));
    if (artifacts.size < 2 || directions.size < 2) continue;
    claims.forEach((claim) => issues.set(claim.artifactId, [
      ...(issues.get(claim.artifactId) ?? []),
      `Contradicción entre narrativas sobre ${evidenceId}.`,
    ]));
  }
  return issues;
}
