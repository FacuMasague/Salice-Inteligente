import { createHash } from 'node:crypto';

const FORBIDDEN_KEYS = /(^|_)(cuit|cuil|dni|telefono|phone|celular|email|correo|direccion|address|password|credential|secret|api_?key|token)($|_)/i;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(',')}}`;
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function assertCompactSafeEvidence(value: unknown, maxBytes: number) {
  const visit = (current: unknown, path: string) => {
    if (current === null || typeof current !== 'object') return;
    if (Array.isArray(current)) {
      current.forEach((child, index) => visit(child, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.test(key)) throw new Error(`El paquete de evidencia contiene un campo no permitido: ${path}.${key}`);
      visit(child, `${path}.${key}`);
    }
  };
  visit(value, '$');
  const serialized = canonicalJson(value);
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > maxBytes) throw new Error(`El paquete de evidencia ocupa ${bytes} bytes y supera el límite de ${maxBytes}.`);
  return { serialized, bytes, estimatedTokens: Math.ceil(bytes / 4) };
}

export function semanticRequestHash(input: {
  functionKey: string;
  entityType: string;
  entityId: string;
  model: string;
  effort: string;
  promptVersion: number;
  schemaVersion: number;
  evidenceJson: string;
}) {
  return sha256(canonicalJson(input));
}
