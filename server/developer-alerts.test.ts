import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const directory = mkdtempSync(join(tmpdir(), 'salice-alerts-'));
const previousDatabasePath = process.env.SALICE_OPERATIONS_DB_PATH;
process.env.SALICE_OPERATIONS_DB_PATH = join(directory, 'operations.sqlite');
delete process.env.SALICE_ALERT_SMTP_HOST;
delete process.env.SALICE_ALERT_SMTP_USER;
delete process.env.SALICE_ALERT_SMTP_PASS;
vi.resetModules();

afterAll(() => {
  if (previousDatabasePath == null) delete process.env.SALICE_OPERATIONS_DB_PATH;
  else process.env.SALICE_OPERATIONS_DB_PATH = previousDatabasePath;
  rmSync(directory, { recursive: true, force: true });
});

describe('alertas privadas para Developer', () => {
  it('audita el evento aunque SMTP no esté configurado y oculta secretos', async () => {
    const { developerAlertStatus, sendDeveloperAlert } = await import('./developer-alerts.js');
    const result = await sendDeveloperAlert({
      kind: 'test-error',
      severity: 'error',
      title: 'Falla de prueba',
      detail: 'password=secreta OPENAI_API_KEY=sk-prueba token: abc123',
      source: 'prueba automatizada',
    });
    expect(result.delivery).toBe('not_configured');
    const status = developerAlertStatus();
    expect(status).toMatchObject({ configured: false, recipient: 'facumasague@gmail.com' });
    expect(status.recent[0]).toMatchObject({ title: 'Falla de prueba', delivery: 'not_configured' });
    expect(status.recent[0].detail).not.toContain('secreta');
    expect(status.recent[0].detail).not.toContain('sk-prueba');
    expect(status.recent[0].detail).not.toContain('abc123');
  });
});
