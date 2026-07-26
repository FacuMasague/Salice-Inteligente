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

  return withoutEvidenceIds.replace(NUMBER_TOKEN, (token) => {
    const percentage = token.includes('%');
    const parsed = parseNumberToken(token, percentage);
    if (!Number.isFinite(parsed.value)) return token;
    if (!percentage && !parsed.hasDecimals) return token;

    const formatted = new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: percentage ? 2 : 0,
      maximumFractionDigits: percentage ? 2 : 0,
    }).format(parsed.value);
    return percentage ? `${formatted} %` : formatted;
  });
}
