import Database, { Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config/env.js';

let dbInstance: DatabaseType | null = null;

export function getDatabase(): DatabaseType {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = CONFIG.database.path;

  // Garante que o diretório pai existe
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  dbInstance = new Database(dbPath);

  // Performance e Concorrência
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  // Inicializa as tabelas de persistência
  initSchema(dbInstance);

  return dbInstance;
}

function initSchema(db: DatabaseType) {
  db.exec(`
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
      guardrail_applied INTEGER DEFAULT 0,
      cards TEXT,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session_time 
      ON chat_messages (session_id, timestamp);

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_client 
      ON chat_sessions (client_id);
  `);
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
