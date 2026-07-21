import { existsSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export class ReloadableReadonlyDatabase {
  private database: DatabaseSync | null = null;
  private mtimeMs = -1;
  private openedPath = '';

  constructor(private readonly source: string | (() => string)) {}

  path() {
    return typeof this.source === 'function' ? this.source() : this.source;
  }

  get(): { database: DatabaseSync; changed: boolean } | null {
    const path = this.path();
    if (!existsSync(path)) {
      this.close();
      return null;
    }
    const nextMtime = statSync(path).mtimeMs;
    const changed = !this.database || path !== this.openedPath || nextMtime !== this.mtimeMs;
    if (changed) {
      this.close();
      this.database = new DatabaseSync(path, { readOnly: true });
      this.database.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 5000;');
      this.mtimeMs = nextMtime;
      this.openedPath = path;
    }
    return { database: this.database!, changed };
  }

  close() {
    if (this.database) this.database.close();
    this.database = null;
    this.mtimeMs = -1;
    this.openedPath = '';
  }
}
