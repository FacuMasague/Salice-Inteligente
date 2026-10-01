import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  captureCacheMatchesActiveBundle,
  canReuseSptHistory,
  documentCoverageStartsBy,
  gesiDocumentQueryFrom,
  logisticsQueryFrom,
  resolveLogisticsInvoiceValidationFrom,
  resolveLogisticsFetchFrom,
  resolveSptFetchFrom,
} from './capture-window.js';

describe('comparación de cobertura documental en auditorías', () => {
  it.each(['2025-01-01', '2025-01-01T00:00:00.000Z', '2025-01-01T06:00:46.500Z', '2024-12-31T23:59:59Z'])(
    'acepta cobertura completa por día: %s', (value) => {
      expect(documentCoverageStartsBy(value, '2025-01-01')).toBe(true);
    },
  );
  it.each([undefined, null, '', '2025-01-02', '2025-01-02T00:00:00.000Z', '2025-02-29',
    '2025-01-01basura', '2025-01-01T25:00:00Z', '2025-01-01Tbasura', 0])(
    'rechaza cobertura ausente, inválida o posterior: %s', (value) => {
      expect(documentCoverageStartsBy(value, '2025-01-01')).toBe(false);
    },
  );

  it('ejecuta la auditoría real con el ISO de Render y mantiene los bloqueos por histórico incompleto', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'salice-date-audit-'));
    const script = resolve('scripts/audit-spt-gesi.ts');
    const loader = resolve('node_modules/tsx/dist/loader.mjs');
    const cases = [
      { coverage: '2025-01-01T00:00:00.000Z', failure: null },
      { coverage: '2025-01-01', failure: null },
      { coverage: '2025-01-02T00:00:00.000Z', failure: 'coverageStartsIn2025' },
      { coverage: '', failure: 'coverageStartsIn2025' },
      { coverage: '2025-01-01T00:00:00.000Z', missingMonth: 9, failure: 'all2025MonthsPresent' },
      { coverage: '2025-01-01T00:00:00.000Z', continuity: 0, failure: 'historyUsesCompleteBoundaryDays' },
      { coverage: '2025-01-01T00:00:00.000Z', company: 7, failure: 'onlyCompany3Branch3' },
    ];
    try {
      for (const [index, scenario] of cases.entries()) {
        const databasePath = resolve(directory, `${index}.sqlite`);
        const outputPath = resolve(directory, `${index}.json`);
        const db = new DatabaseSync(databasePath);
        db.exec(`CREATE TABLE report_meta (key TEXT, value TEXT);
          CREATE TABLE movements (source_document_key TEXT, source_item_id INTEGER,
            source_kind TEXT, sale_date TEXT, kilos REAL, client_id INTEGER,
            product_id TEXT, company_id INTEGER, branch_id INTEGER);`);
        const meta = db.prepare('INSERT INTO report_meta VALUES (?, ?)');
        for (const [key, value] of Object.entries({ coverage_from: scenario.coverage,
          history_continuity_version: String(scenario.continuity ?? 1), company_scope: '3',
          branch_scope: '3', source_document_count: '12', unavailable_document_count: '0' })) meta.run(key, value);
        const movement = db.prepare('INSERT INTO movements VALUES (?, 1, ?, ?, 1, 1, ?, ?, 3)');
        for (let month = 1; month <= 12; month += 1) {
          if (month !== scenario.missingMonth) movement.run(`TEST-${month}`, 'invoice',
            `2025-${String(month).padStart(2, '0')}-02`, 'TEST-PRODUCT', scenario.company ?? 3);
        }
        db.close();
        const process = spawnSync(globalThis.process.execPath, ['--import', loader, script], {
          cwd: directory, encoding: 'utf8', timeout: 15_000,
          env: { ...globalThis.process.env, SALICE_SPT_DB_PATH: databasePath, SALICE_SPT_AUDIT_OUTPUT_PATH: outputPath },
        });
        expect(process.status, process.stderr).toBe(scenario.failure ? 1 : 0);
        const result = JSON.parse(readFileSync(outputPath, 'utf8')) as { failures: string[] };
        expect(result.failures).toEqual(scenario.failure ? [scenario.failure] : []);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('resolveSptFetchFrom', () => {
  const historyFrom = '2025-07-28T00:00:00.000Z';

  it('usa el histórico completo sólo al inicializar un disco vacío', () => {
    expect(resolveSptFetchFrom({
      hasExistingCapture: false,
      historyFrom,
      bootstrapHistoryFrom: '2025-01-01',
    })).toBe('2025-01-01');
  });

  it('protege una instalación local nueva aunque falte la variable de bootstrap', () => {
    expect(resolveSptFetchFrom({
      hasExistingCapture: false,
      historyFrom,
    })).toBe('2025-01-01');
  });

  it('usa la ventana móvil cuando ya existe una captura persistida', () => {
    expect(resolveSptFetchFrom({
      hasExistingCapture: true,
      historyFrom,
      bootstrapHistoryFrom: '2025-01-01',
    })).toBe(historyFrom);
  });

  it('respeta un rango explícito para tareas operativas excepcionales', () => {
    expect(resolveSptFetchFrom({
      hasExistingCapture: true,
      historyFrom,
      explicitHistoryFrom: '2024-01-01',
      bootstrapHistoryFrom: '2025-01-01',
    })).toBe('2024-01-01');
  });
});

describe('resolveLogisticsFetchFrom', () => {
  const historyFrom = '2025-08-25T00:00:00.000Z';
  const rollingFrom = '2026-07-11T00:00:00.000Z';

  it('carga el año móvil completo al inicializar una captura', () => {
    expect(resolveLogisticsFetchFrom({
      hasExistingCapture: false,
      historyFrom,
      rollingFrom,
    })).toBe(historyFrom);
  });

  it('amplía una captura anterior limitada a 45 días', () => {
    expect(resolveLogisticsFetchFrom({
      hasExistingCapture: true,
      historyFrom,
      rollingFrom,
      existingCoverageFrom: '2026-07-11T00:00:00.000Z',
    })).toBe(historyFrom);
  });

  it('reutiliza el histórico y consulta sólo la ventana reciente una vez completado', () => {
    expect(resolveLogisticsFetchFrom({
      hasExistingCapture: true,
      historyFrom,
      rollingFrom,
      existingCoverageFrom: historyFrom,
    })).toBe(rollingFrom);
  });

  it('respeta un inicio explícito para una auditoría excepcional', () => {
    expect(resolveLogisticsFetchFrom({
      hasExistingCapture: true,
      historyFrom,
      rollingFrom,
      existingCoverageFrom: historyFrom,
      explicitFrom: '2026-01-01',
    })).toBe('2026-01-01');
  });
});

describe('seguridad del histórico logístico', () => {
  it('sólo reutiliza el raw que produjo el paquete activo', () => {
    expect(captureCacheMatchesActiveBundle('2026-08-24T22:16:39.310Z', '2026-08-24T22:16:39.310Z')).toBe(true);
    expect(captureCacheMatchesActiveBundle('2026-08-25T10:00:00.000Z', '2026-08-24T22:16:39.310Z')).toBe(false);
    expect(captureCacheMatchesActiveBundle(null, '2026-08-24T22:16:39.310Z')).toBe(false);
  });

  it('consulta un solapamiento para no perder fojas que cruzan el corte', () => {
    expect(logisticsQueryFrom('2025-08-25T00:00:00.000Z')).toBe('2025-07-11T00:00:00.000Z');
  });

  it('conserva un día de facturas auxiliares al avanzar la cobertura aprobada', () => {
    expect(resolveLogisticsInvoiceValidationFrom({
      sheetFetchFrom: '2026-07-12T00:00:00.000Z',
      salesFetchFrom: '2025-08-26T00:00:00.000Z',
      previousCoverageFrom: '2025-08-25T00:00:00.000Z',
    })).toBe('2025-08-25T00:00:00.000Z');
  });

  it('no amplía facturas cuando ventas ya cubre toda la validación logística', () => {
    expect(resolveLogisticsInvoiceValidationFrom({
      sheetFetchFrom: '2025-07-11T00:00:00.000Z',
      salesFetchFrom: '2025-01-01',
      previousCoverageFrom: '2025-08-25T00:00:00.000Z',
    })).toBe('2025-01-01');
  });
});

describe('continuidad del histórico comercial al avanzar el año móvil', () => {
  it('consulta el día completo que deja de conservarse como histórico', () => {
    const previous = ['2025-09-29T00:00:00', '2025-09-30T00:00:00'];
    const cut = gesiDocumentQueryFrom('2025-09-30T06:00:46.500Z');
    expect(cut).toBe('2025-09-30T00:00:00.000Z');
    const retained = previous.filter((date) => date.slice(0, 10) < cut.slice(0, 10));
    const fetched = previous.filter((date) => Date.parse(date + 'Z') >= Date.parse(cut));
    expect([...retained, ...fetched]).toEqual(previous);
    expect(new Set([...retained, ...fetched]).size).toBe(previous.length);
  });
  it('reconstruye una captura antigua o fallida antes de habilitar el modo incremental', () => {
    expect(canReuseSptHistory(true, undefined)).toBe(false);
    expect(canReuseSptHistory(false, 1)).toBe(false);
    expect(canReuseSptHistory(true, 1)).toBe(true);
    const from = resolveSptFetchFrom({ hasExistingCapture: canReuseSptHistory(true, undefined), historyFrom: '2025-10-01T06:00:00Z' });
    expect(gesiDocumentQueryFrom(from)).toBe('2025-01-01T00:00:00.000Z');
  });
  it('mantiene fechas explícitas válidas y rechaza cortes malformados', () => {
    expect(gesiDocumentQueryFrom('2024-02-29')).toBe('2024-02-29T00:00:00.000Z');
    expect(() => gesiDocumentQueryFrom('2025-02-29')).toThrow(/inválido/);
    expect(() => gesiDocumentQueryFrom('sin fecha')).toThrow(/inválido/);
  });
});
