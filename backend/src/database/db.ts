import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { CONFIG } from '../config/env.js';

type SqlParameters = unknown[];

export interface SqlStatement {
  text: string;
  parameters?: SqlParameters;
}

export interface RunResult {
  changes: number;
}

/**
 * Lightweight compatibility layer around Neon HTTP queries.
 *
 * The application intentionally keeps SQL in its repositories. This layer
 * centralises the serverless connection, parameter handling and the small
 * better-sqlite3-like surface the repositories need, while keeping all I/O
 * asynchronous for Cloudflare Workers.
 */
export class NeonDatabase {
  constructor(private readonly sql: NeonQueryFunction<false, false>) {}

  prepare(query: string): NeonStatement {
    return new NeonStatement(this.sql, query);
  }

  async transaction(statements: SqlStatement[]): Promise<void> {
    if (statements.length === 0) return;

    await this.sql.transaction((transaction) =>
      statements.map((statement) =>
        transaction.query(normalizePlaceholders(statement.text), statement.parameters || [])
      )
    );
  }
}

export class NeonStatement {
  constructor(
    private readonly sql: NeonQueryFunction<false, false>,
    private readonly text: string
  ) {}

  async all<T extends Record<string, unknown> = Record<string, unknown>>(...parameters: SqlParameters): Promise<T[]> {
    return (await this.sql.query(normalizePlaceholders(this.text), parameters)) as T[];
  }

  async get<T extends Record<string, unknown> = Record<string, unknown>>(...parameters: SqlParameters): Promise<T | undefined> {
    const rows = await this.all<T>(...parameters);
    return rows[0];
  }

  async run(...parameters: SqlParameters): Promise<RunResult> {
    const result = await this.sql.query(normalizePlaceholders(this.text), parameters, { fullResults: true });
    return { changes: Number(result.rowCount || 0) };
  }
}

let dbInstance: NeonDatabase | null = null;

export function getDatabase(): NeonDatabase {
  if (dbInstance) return dbInstance;

  if (!CONFIG.database.url) {
    throw new Error('DATABASE_URL é obrigatória para a persistência PostgreSQL/Neon.');
  }

  dbInstance = new NeonDatabase(neon(CONFIG.database.url));
  return dbInstance;
}

/** HTTP driver has no open socket to close; retained for test compatibility. */
export async function closeDatabase(): Promise<void> {
  dbInstance = null;
}

/**
 * Existing repository SQL uses SQLite-style `?` parameters. Translating them
 * at the database boundary keeps the queries parameterised while targeting
 * PostgreSQL's `$1`, `$2`, ... syntax.
 */
function normalizePlaceholders(query: string): string {
  let index = 0;
  return query.replace(/\?/g, () => `$${++index}`);
}
