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
export interface IDatabase {
  prepare(query: string): IStatement;
  transaction(statements: SqlStatement[]): Promise<void>;
}

export interface IStatement {
  all<T extends Record<string, unknown> = Record<string, unknown>>(...parameters: SqlParameters): Promise<T[]>;
  get<T extends Record<string, unknown> = Record<string, unknown>>(...parameters: SqlParameters): Promise<T | undefined>;
  run(...parameters: SqlParameters): Promise<RunResult>;
}

/**
 * Lightweight compatibility layer around Neon HTTP queries.
 *
 * The application intentionally keeps SQL in its repositories. This layer
 * centralises the serverless connection, parameter handling and the small
 * better-sqlite3-like surface the repositories need, while keeping all I/O
 * asynchronous for Cloudflare Workers.
 */
export class NeonDatabase implements IDatabase {
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

export class NeonStatement implements IStatement {
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

/**
 * SQLite In-Memory Database Adapter para execução rápida de testes locais sem credenciais de nuvem.
 */
class SqliteDatabaseAdapter implements IDatabase {
  private sqlite: any;

  constructor() {
    try {
      const BetterSqlite = require('better-sqlite3');
      this.sqlite = new BetterSqlite(':memory:');
      this.initSchema();
    } catch (e) {
      console.warn('[SqliteDatabaseAdapter] better-sqlite3 indisponível:', e);
    }
  }

  private initSchema() {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        session_id TEXT PRIMARY KEY,
        client_id TEXT,
        client_name TEXT,
        current_department TEXT NOT NULL DEFAULT 'GERAL',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        department TEXT,
        quick_options TEXT,
        ai_provider TEXT,
        ai_model TEXT,
        guardrail_applied INTEGER NOT NULL DEFAULT 0,
        cards TEXT
      );
      CREATE TABLE IF NOT EXISTS queue_entries (
        queue_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        client_name TEXT NOT NULL,
        department TEXT NOT NULL,
        reason TEXT,
        status TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 1,
        estimated_wait_minutes REAL NOT NULL DEFAULT 2,
        joined_at TEXT NOT NULL,
        assigned_at TEXT,
        completed_at TEXT,
        assigned_agent TEXT
      );
      CREATE TABLE IF NOT EXISTS csat_feedbacks (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        client_name TEXT,
        session_id TEXT,
        rating INTEGER NOT NULL,
        comment TEXT,
        tags TEXT,
        department TEXT,
        context TEXT NOT NULL DEFAULT 'GENERAL',
        target_protocol TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS support_diagnostics (
        client_id TEXT PRIMARY KEY,
        step TEXT NOT NULL,
        multiple_devices INTEGER,
        cables_checked INTEGER,
        restarted INTEGER,
        protocolo TEXT,
        ticket_id TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_tickets (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        id_contrato TEXT,
        tipo TEXT,
        assunto TEXT NOT NULL,
        mensagem TEXT,
        status TEXT NOT NULL,
        status_label TEXT,
        prioridade TEXT,
        protocolo TEXT,
        data_abertura TEXT NOT NULL,
        nome_tecnico TEXT,
        previsao_visita TEXT,
        etapas TEXT
      );
      CREATE TABLE IF NOT EXISTS user_accounts (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL UNIQUE,
        client_name TEXT NOT NULL,
        cpf_cnpj TEXT,
        clean_cpf TEXT,
        login TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        password_hash TEXT,
        default_password_cpf TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS otp_codes (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        code TEXT NOT NULL DEFAULT '[REDACTED]',
        code_hash TEXT,
        channel TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt_at INTEGER,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS wifi_configurations (
        client_id TEXT PRIMARY KEY,
        ssid_2g TEXT NOT NULL,
        ssid_5g TEXT NOT NULL,
        password TEXT NOT NULL,
        guest_ssid TEXT NOT NULL,
        guest_password TEXT NOT NULL,
        guest_enabled INTEGER NOT NULL DEFAULT 1,
        security TEXT NOT NULL DEFAULT 'WPA2-PSK',
        channel_2g INTEGER NOT NULL DEFAULT 6,
        channel_5g INTEGER NOT NULL DEFAULT 36,
        connected_devices INTEGER NOT NULL DEFAULT 5,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        action_type TEXT,
        action_payload TEXT,
        read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS referrals (
        id TEXT PRIMARY KEY,
        referrer_client_id TEXT NOT NULL,
        referred_name TEXT NOT NULL,
        referred_phone TEXT NOT NULL,
        status TEXT NOT NULL,
        discount_month TEXT,
        discount_percentage INTEGER NOT NULL DEFAULT 50,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pix_webhook_events (
        event_id TEXT PRIMARY KEY,
        invoice_id TEXT,
        processed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pix_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        txid TEXT,
        end_to_end_id TEXT,
        amount TEXT NOT NULL,
        paid_at TEXT NOT NULL,
        webhook_event_id TEXT NOT NULL
      );

      -- Índices equivalentes aos da migração Postgres, para que os testes
      -- com o adapter in-memory exerçam planos de consulta semelhantes.
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_queue_client_status ON queue_entries(client_id, status);
      CREATE INDEX IF NOT EXISTS idx_queue_dept_status ON queue_entries(department, status, joined_at);
      CREATE INDEX IF NOT EXISTS idx_csat_client ON csat_feedbacks(client_id);
      CREATE INDEX IF NOT EXISTS idx_user_tickets_client ON user_tickets(client_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_client_read ON notifications(client_id, read);
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_client ON chat_sessions(client_id);
      CREATE INDEX IF NOT EXISTS idx_pix_webhook_events_invoice ON pix_webhook_events(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_pix_payments_invoice ON pix_payments(invoice_id, paid_at DESC);
    `);
  }

  prepare(query: string): IStatement {
    const stmt = this.sqlite.prepare(query);
    return {
      all: async <T extends Record<string, unknown> = Record<string, unknown>>(...params: SqlParameters): Promise<T[]> => {
        return stmt.all(...params) as T[];
      },
      get: async <T extends Record<string, unknown> = Record<string, unknown>>(...params: SqlParameters): Promise<T | undefined> => {
        return stmt.get(...params) as T | undefined;
      },
      run: async (...params: SqlParameters): Promise<RunResult> => {
        const res = stmt.run(...params);
        return { changes: res.changes };
      },
    };
  }

  async transaction(statements: SqlStatement[]): Promise<void> {
    const tx = this.sqlite.transaction((stmts: SqlStatement[]) => {
      for (const s of stmts) {
        this.sqlite.prepare(s.text).run(...(s.parameters || []));
      }
    });
    tx(statements);
  }
}

let dbInstance: IDatabase | null = null;

export function getDatabase(): IDatabase {
  if (dbInstance) return dbInstance;

  if (CONFIG.database.url) {
    dbInstance = new NeonDatabase(neon(CONFIG.database.url));
    return dbInstance;
  }

  // Se DATABASE_URL não estiver configurada (ex: suíte de testes / offline), usa SQLite in-memory
  const isNodeRuntime =
    typeof process !== 'undefined' &&
    typeof (process as NodeJS.Process).versions?.node === 'string' &&
    typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair === 'undefined';
  // Cast estrito: 'typeof globalThis' não tem index signature e o acesso
  // dinâmico quebrava o build sob strict mode.
  const globalScope = globalThis as { __dbsInMemoryWarningLogged?: boolean };
  if (isNodeRuntime && !globalScope.__dbsInMemoryWarningLogged) {
    globalScope.__dbsInMemoryWarningLogged = true;
    console.warn('AVISO: sem DATABASE_URL — usando SQLite em memória (dados não persistem)');
  }
  dbInstance = new SqliteDatabaseAdapter();
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
 *
 * Um `?` dentro de um literal de string ('...') ou de um identificador
 * delimitado ("...") faz parte do dado, não é placeholder — por isso o
 * scanner abaixo só substitui o caractere fora dessas regiões.
 */
function normalizePlaceholders(query: string): string {
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  const chars = Array.from(query);
  return chars
    .map((char, i) => {
      if (char === "'" && !inDoubleQuote) {
        // '' dentro de string literal é escape, não abertura/fechamento.
        inSingleQuote = !inSingleQuote;
      } else if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
      } else if (char === '?' && !inSingleQuote && !inDoubleQuote) {
        // Operadores jsonb ?| e ?& fazem parte da sintaxe, não são placeholders.
        const next = chars[i + 1];
        if (next === '|' || next === '&') return char;
        return `$${++index}`;
      }
      return char;
    })
    .join('');
}
