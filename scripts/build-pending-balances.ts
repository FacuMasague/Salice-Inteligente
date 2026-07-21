import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { GesiRawCapture } from '../server/gesi/types.js';
import { buildPendingBalancesDatabase } from '../server/pending-balances-build.js';

const capturePath = resolve(process.env.SALICE_CAPTURE_PATH ?? 'data/raw/gesi-salice-latest.json');
const capture = JSON.parse(await readFile(capturePath, 'utf8')) as GesiRawCapture;
const result = buildPendingBalancesDatabase(capture, resolve(process.env.SALICE_PENDING_BALANCES_OUTPUT_PATH ?? 'data/pending-balances.sqlite'));
console.log('Base de Saldos Pendientes construida desde la captura GESI.');
console.log(JSON.stringify(result, null, 2));
