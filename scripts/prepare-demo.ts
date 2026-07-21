import { rebuildLocalDemoData } from '../server/local-demo-data.js';
import { ensureOperationalDatabase } from '../server/operational-store.js';

const paths = rebuildLocalDemoData();
const operations = ensureOperationalDatabase();
console.log('SMART Salice synthetic demo data is ready.');
console.log(`Snapshot: ${paths.snapshot}`);
console.log(`Commercial analytics: ${paths.commercial}`);
console.log(`Pending balances: ${paths.pendingBalances}`);
console.log(`Operational workflow: ${operations}`);
