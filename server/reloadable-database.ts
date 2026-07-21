import { existsSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export class ReloadableReadonlyDatabase {
  private database: DatabaseSync | null = null;
  private mtimeMs = -1;

  constructor(private readonly path: string) {}

  get(): { database: DatabaseSync; changed: boolean } | null {
    if (!existsSync(this.path)) {
      this.close();
      return null;
    }
    const nextMtime = statSync(this.path).mtimeMs;
    const changed = !this.database || nextMtime !== this.mtimeMs;
    if (changed) {
      this.close();
      this.database = new DatabaseSync(this.path, { readOnly: true });
      this.database.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 5000;');
      this.mtimeMs = nextMtime;
    }
    return { database: this.database!, changed };
  }

  close() {
    if (this.database) this.database.close();
    this.database = null;
    this.mtimeMs = -1;
  }
}
