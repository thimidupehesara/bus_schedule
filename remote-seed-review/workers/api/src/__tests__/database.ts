import { createRequire } from 'node:module';
const { DatabaseSync } = createRequire(import.meta.url)(
  'node:sqlite',
) as typeof import('node:sqlite');
import { readFileSync } from 'node:fs';
/** Real SQLite constraints/transactions, behind the narrow D1 API used by this worker. */
export function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8'));
  sqlite.exec(
    readFileSync(new URL('../../migrations/0002_mobile_qr_suggestions.sql', import.meta.url), 'utf8'),
  );
  class Statement {
    constructor(
      private query: string,
      private values: (string | number | null)[] = [],
    ) {}
    bind(...args: (string | number | null)[]) {
      return new Statement(this.query, args);
    }
    execute() {
      const statement = sqlite.prepare(this.query);
      if (statement.columns().length)
        return { success: true, results: statement.all(...this.values), meta: {} };
      const result = statement.run(...this.values);
      return { success: true, results: [], meta: { changes: Number(result.changes) } };
    }
    async first() {
      return this.execute().results[0] ?? null;
    }
    async all() {
      return this.execute();
    }
    async run() {
      return this.execute();
    }
  }
  const db = {
    prepare(query: string) {
      return new Statement(query);
    },
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((s) => s.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db: db as unknown as D1Database, sqlite };
}
