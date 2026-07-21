import { resolve } from 'node:path';
import { restoreOperationalDatabase } from '../server/operations-backup.js';

const candidate = process.argv.find((argument) => !argument.startsWith('-') && argument !== process.argv[0] && argument !== process.argv[1]);
if (!candidate || !process.argv.includes('--confirm')) {
  throw new Error('Uso: pnpm run restore:operations -- /ruta/al/backup.sqlite --confirm. Cerrá primero Salice Inteligente.');
}
const source = resolve(candidate);
const target = resolve(process.env.SALICE_OPERATIONS_DB_PATH ?? 'data/operations.sqlite');
console.log(JSON.stringify(await restoreOperationalDatabase(source, target), null, 2));
