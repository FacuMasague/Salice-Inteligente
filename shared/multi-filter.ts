export function decodeMultiFilter(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  const text = String(value ?? '').trim();
  if (!text || text === 'all') return [];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return [...new Set(parsed.map((item) => String(item).trim()).filter(Boolean))];
    } catch {
      return [];
    }
  }
  return [text];
}

export function encodeMultiFilter(values: string[]) {
  const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (!unique.length) return '';
  return unique.length === 1 ? unique[0] : JSON.stringify(unique);
}

export function normalizeMultiFilter(value: unknown, allowed: readonly string[]) {
  const allowedSet = new Set(allowed);
  return encodeMultiFilter(decodeMultiFilter(value).filter((item) => allowedSet.has(item)));
}

export function matchesMultiFilter(candidate: string, value: unknown) {
  const selected = decodeMultiFilter(value);
  return !selected.length || selected.includes(candidate);
}

export function multiFilterLabel(value: unknown, allLabel = 'Todos') {
  const selected = decodeMultiFilter(value);
  if (!selected.length) return allLabel;
  if (selected.length === 1) return selected[0];
  return `${selected.length} seleccionados`;
}
