/**
 * Converts numbers written with Argentine conventions (`1.234,56`) to their
 * internal representation. JSON numbers and dot-decimal notation are also accepted.
 */
export function parseLocalizedNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value ?? '').trim().replace(/[\s$]/g, '');
  if (!raw) return null;

  const sign = raw.startsWith('-') ? '-' : '';
  const unsigned = raw.replace(/^[+-]/, '');
  if (!/^\d[\d.,]*$/.test(unsigned)) return null;

  let normalized = unsigned;
  if (unsigned.includes(',')) {
    if ((unsigned.match(/,/g) ?? []).length > 1) return null;
    normalized = unsigned.replaceAll('.', '').replace(',', '.');
  } else {
    const dots = unsigned.match(/\./g)?.length ?? 0;
    if (dots > 1) normalized = unsigned.replaceAll('.', '');
    else if (dots === 1 && /^\d{1,3}(?:\.\d{3})+$/.test(unsigned)) normalized = unsigned.replaceAll('.', '');
  }

  const parsed = Number(`${sign}${normalized}`);
  return Number.isFinite(parsed) ? parsed : null;
}

export function localizedEditableNumber(value: number | null | undefined, maximumFractionDigits = 2) {
  if (value == null || !Number.isFinite(value)) return '';
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits }).format(value);
}
