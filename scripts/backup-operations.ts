import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { backupOperationalDatabase } from '../server/operations-backup.js';

const source = resolve(process.env.SALICE_OPERATIONS_DB_PATH ?? 'data/operations.sqlite');
const directory = resolve(process.env.SALICE_OPERATIONS_BACKUP_DIR ?? 'data/operations-backups');
const retain = Math.max(3, Number(process.env.SALICE_OPERATIONS_BACKUP_RETENTION ?? 10));
if (!existsSync(source)) {
  console.log('La base operativa todavía no existe; se creará al iniciar el programa.');
  process.exit(0);
}
const result = await backupOperationalDatabase(source, directory, retain);
console.log(JSON.stringify(result, null, 2));
