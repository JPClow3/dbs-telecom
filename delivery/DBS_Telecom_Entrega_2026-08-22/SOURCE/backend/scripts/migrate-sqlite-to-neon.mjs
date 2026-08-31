import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const sourcePath = process.env.SQLITE_PATH || './data/dbs_telecom.sqlite';
const connectionString = process.env.DATABASE_URL;

if (process.env.MIGRATE_SQLITE_TO_NEON !== 'confirm') {
  throw new Error('Set MIGRATE_SQLITE_TO_NEON=confirm before importing persistent data.');
}
if (!connectionString) throw new Error('DATABASE_URL is required.');
if (!existsSync(sourcePath)) throw new Error(`SQLite source was not found: ${sourcePath}`);

const tables = [
  'chat_sessions',
  'chat_messages',
  'queue_entries',
  'csat_feedbacks',
  'support_diagnostics',
  'user_tickets',
  'user_accounts',
  'otp_codes',
  'wifi_configurations',
  'notifications',
  'referrals',
];

const source = new Database(sourcePath, { readonly: true });
const sql = neon(connectionString);

try {
  for (const table of tables) {
    const tableExists = source.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    if (!tableExists) {
      console.log(`${table}: skipped (not present in SQLite)`);
      continue;
    }

    const columns = source.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map((column) => column.name);
    const rows = source.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all();
    if (rows.length === 0) {
      console.log(`${table}: 0 row(s)`);
      continue;
    }

    const columnList = columns.map(quoteIdentifier).join(', ');
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    const statement = `INSERT INTO ${quoteIdentifier(table)} (${columnList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

    for (const batch of chunk(rows, 100)) {
      await sql.transaction(batch.map((row) => sql.query(statement, columns.map((column) => row[column]))));
    }

    console.log(`${table}: ${rows.length} row(s) imported`);
  }
} finally {
  source.close();
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function* chunk(values, size) {
  for (let index = 0; index < values.length; index += size) yield values.slice(index, index + size);
}
