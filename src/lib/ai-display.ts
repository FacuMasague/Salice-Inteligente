const NUMBER_TOKEN = /-?\d(?:[\d.,]*\d)?(?:\s*%)?/g;

function parseNumberToken(token: string, percentage: boolean) {
  const compact = token.replace(/\s|%/g, '');
  const unsigned = compact.replace(/^-/, '');
  const separators = [...unsigned].filter((character) => character === '.' || character === ',');
  if (!separators.length) return { value: Number(compact), hasDecimals: false };

  const lastDot = unsigned.lastIndexOf('.');
  const lastComma = unsigned.lastIndexOf(',');
  const decimalSeparator = lastDot > lastComma ? '.' : ',';
  const separatorCount = separators.length;
  const fractionLength = unsigned.length - Math.max(lastDot, lastComma) - 1;
  const integerLength = unsigned.slice(0, Math.max(lastDot, lastComma)).replace(/[.,]/g, '').length;
  const hasDecimals = percentage
    || (separatorCount === 1 && (fractionLength !== 3 || integerLength > 3))
    || (separatorCount > 1 && new Set(separators).size > 1 && fractionLength !== 3);

  if (!hasDecimals) {
    return {
      value: Number(compact.replace(/[.,]/g, '')),
      hasDecimals: false,
    };
  }

  const normalized = unsigned
    .replace(new RegExp(`\\${decimalSeparator}`, 'g'), (match, offset) => (
      offset === unsigned.lastIndexOf(decimalSeparator) ? '.' : ''
    ))
    .replace(/[.,]/g, '');
  const decimalIndex = unsigned.lastIndexOf(decimalSeparator);
  const integerDigits = unsigned.slice(0, decimalIndex).replace(/[.,]/g, '');
  const decimalDigits = unsigned.slice(decimalIndex + 1).replace(/[.,]/g, '');
  const value = Number(`${compact.startsWith('-') ? '-' : ''}${integerDigits}.${decimalDigits}`);
  return { value: Number.isFinite(value) ? value : Number(normalized), hasDecimals: true };
}

export function formatAiDisplayText(value: string) {
  const withoutEvidenceIds = value
    .replace(/\s*\[[^\]]+\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const withPlainSignalNames = withoutEvidenceIds
    .replace(/\bseñales?\s+C\s*\/\s*O\s*\/\s*P\b/gi, 'señales de riesgo de cobranza, oportunidad comercial y prioridad de revisión')
    .replace(/\bC\s*,\s*O\s+y\s+P\b/g, 'riesgo de cobranza, oportunidad comercial y prioridad de revisión')
    .replace(/(\briesgo de cobranza[^.!?;,\n]{0,40})\(\s*C\s*=\s*(\d{1,3})\s*\)/gi, '$1($2/100)')
    .replace(/\b(riesgo de cobranza)\s+C\s*=?\s*(\d{1,3})\b/gi, '$1 $2/100')
    .replace(/\boportunidad(?: comercial)?\s+O\s*=?\s*(\d{1,3})\b/gi, 'oportunidad comercial $1/100')
    .replace(/\bprioridad(?: combinada| comercial| de revisión)?\s+P\s*=?\s*(\d{1,3})\b/gi, 'prioridad de revisión $1/100')
    .replace(/\bC\s*[:=]\s*(\d{1,3})\b/g, 'riesgo de cobranza $1/100')
    .replace(/\bO\s*[:=]\s*(\d{1,3})\b/g, 'oportunidad comercial $1/100')
    .replace(/\bP\s*[:=]\s*(\d{1,3})\b/g, 'prioridad de revisión $1/100')
    .replace(/\bO(?=\s+(?:no|sin)\b)/g, 'La oportunidad comercial');

  return withPlainSignalNames.replace(NUMBER_TOKEN, (token, offset: number, source: string) => {
    const percentage = token.includes('%');
    const parsed = parseNumberToken(token, percentage);
    if (!Number.isFinite(parsed.value)) return token;
    if (!percentage && !parsed.hasDecimals) {
      const before = source[offset - 1] ?? '';
      const after = source[offset + token.length] ?? '';
      const context = source.slice(Math.max(0, offset - 10), offset + token.length + 10);
      if (/\d{1,2}-\d{1,2}-\d{4}/.test(context) || token.includes('.') || token.includes(',') || before === '-' || after === '-' || (token.startsWith('-') && /\d/.test(before))) return token;
      return Math.abs(parsed.value) >= 1_000
        ? new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(parsed.value)
        : token;
    }

    const formatted = new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: percentage ? 2 : 0,
      maximumFractionDigits: percentage ? 2 : 0,
    }).format(parsed.value);
    return percentage ? `${formatted} %` : formatted;
  });
}
