import { resolve } from 'node:path';
import { checkOperationalIntegrity } from '../server/operations-backup.js';

const source = resolve(process.env.SALICE_OPERATIONS_DB_PATH ?? 'data/operations.sqlite');
console.log(JSON.stringify({ path: source, ...checkOperationalIntegrity(source) }, null, 2));
