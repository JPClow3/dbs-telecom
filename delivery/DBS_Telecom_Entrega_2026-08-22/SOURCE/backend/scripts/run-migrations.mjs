#!/usr/bin/env node
/**
 * Runner de migrações PostgreSQL (Neon) do backend DBS Telecom.
 *
 * Uso:
 *   cd backend
 *   npm run migrate              # aplica as migrações pendentes
 *   npm run migrate -- --dry-run # apenas lista o que seria aplicado
 *
 * Comportamento:
 *   - Garante a tabela de controle `schema_migrations` (name, applied_at).
 *   - Aplica cada arquivo de backend/migrations/00*.sql ainda não registrado,
 *     em ordem, dentro de uma transação por arquivo (via sql.transaction do
 *     driver HTTP do Neon, que não mantém sessão entre chamadas).
 *   - Instruções que o PostgreSQL não aceita dentro de transação (ex.:
 *     CREATE INDEX CONCURRENTLY) são detectadas e executadas fora do lote.
 *
 * Requer DATABASE_URL. Sem ela o script falha de forma controlada, sem
 * aplicar nada e sem imprimir stack trace.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(scriptDir, '..');
const migrationsDir = join(backendDir, 'migrations');
const TRACKING_TABLE = 'schema_migrations';

const dryRun = process.argv.includes('--dry-run');

// O backend carrega backend/.env em desenvolvimento; o runner faz o mesmo,
// sem sobrescrever variáveis já exportadas no shell (padrão do dotenv).
dotenv.config({ path: resolve(backendDir, '.env') });

/** Lista ordenada dos arquivos de migração (prefixo numérico obrigatório). */
function listMigrationFiles() {
  return readdirSync(migrationsDir)
    .filter((name) => /^\d+.*\.sql$/i.test(name))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Divide o conteúdo de um arquivo .sql em instruções individuais,
 * respeitando comentários (-- e /* *​/), strings com escape (''), identificadores
 * delimitados ("") e dollar-quoted strings ($tag$...$tag$).
 */
function splitSqlStatements(sqlText) {
  const statements = [];
  let current = '';
  let i = 0;
  const n = sqlText.length;

  while (i < n) {
    const char = sqlText[i];
    const next = sqlText[i + 1] ?? '';

    // Comentário de linha: preservado, copia até o fim da linha.
    if (char === '-' && next === '-') {
      const end = sqlText.indexOf('\n', i);
      const stop = end === -1 ? n : end + 1;
      current += sqlText.slice(i, stop);
      i = stop;
      continue;
    }

    // Comentário de bloco (aninhável, conforme o padrão SQL).
    if (char === '/' && next === '*') {
      let depth = 1;
      current += '/*';
      i += 2;
      while (i < n && depth > 0) {
        if (sqlText[i] === '/' && sqlText[i + 1] === '*') {
          depth += 1;
          current += '/*';
          i += 2;
        } else if (sqlText[i] === '*' && sqlText[i + 1] === '/') {
          depth -= 1;
          current += '*/';
          i += 2;
        } else {
          current += sqlText[i];
          i += 1;
        }
      }
      continue;
    }

    // String literal: '' é escape, não fechamento.
    if (char === "'") {
      current += sqlText[i];
      i += 1;
      while (i < n) {
        const c = sqlText[i];
        current += c;
        i += 1;
        if (c === "'") {
          if (sqlText[i] === "'") {
            current += sqlText[i];
            i += 1;
          } else {
            break;
          }
        }
      }
      continue;
    }

    // Identificador delimitado: "" é escape, não fechamento.
    if (char === '"') {
      current += sqlText[i];
      i += 1;
      while (i < n) {
        const c = sqlText[i];
        current += c;
        i += 1;
        if (c === '"') {
          if (sqlText[i] === '"') {
            current += sqlText[i];
            i += 1;
          } else {
            break;
          }
        }
      }
      continue;
    }

    // Dollar-quoted string ($$...$$ ou $tag$...$tag$): ponto e vírgula
    // interno não separa instruções.
    if (char === '$') {
      const tagMatch = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sqlText.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        const close = sqlText.indexOf(tag, i + tag.length);
        const stop = close === -1 ? n : close + tag.length;
        current += sqlText.slice(i, stop);
        i = stop;
        continue;
      }
    }

    if (char === ';') {
      statements.push(current);
      current = '';
      i += 1;
      continue;
    }

    current += char;
    i += 1;
  }

  if (current.trim().length > 0) statements.push(current);

  // Descarta blocos que só contêm comentários/whitespace.
  return statements
    .map((statement) => statement.trim())
    .filter((statement) => stripComments(statement).trim().length > 0);
}

/** Remoção simplificada de comentários, apenas para análise do texto. */
function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Instruções que precisam rodar fora de transação no PostgreSQL.
 * CREATE INDEX CONCURRENTLY é o caso clássico; REINDEX CONCURRENTLY e
 * ALTER TYPE ... ADD VALUE também não são transacionáveis.
 */
function requiresStandaloneExecution(statement) {
  const stripped = stripComments(statement);
  return (
    /\bCREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i.test(stripped) ||
    /\bREINDEX\s+CONCURRENTLY\b/i.test(stripped) ||
    /\bALTER\s+TYPE\b[\s\S]*\bADD\s+VALUE\b/i.test(stripped)
  );
}

/** Host/banco para log, sem expor usuário ou senha. */
function describeDatabaseUrl(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    return `${url.host}${url.pathname}`;
  } catch {
    return '(URL inválida)';
  }
}

function friendlyError(err) {
  return err instanceof Error ? err.message : String(err);
}

async function main() {
  const files = listMigrationFiles();
  if (files.length === 0) {
    console.log(`[migrate] Nenhum arquivo de migração encontrado em ${migrationsDir}.`);
    return;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim() || '';
  if (!databaseUrl) {
    console.error('[migrate] ERRO: DATABASE_URL não está configurada — nada foi aplicado.');
    console.error('[migrate] Defina a string de conexão do Neon em backend/.env (veja backend/.env.example)');
    console.error('[migrate] ou exporte DATABASE_URL antes de executar este script.');
    console.error('');
    console.error(
      dryRun
        ? '[migrate] Migrações existentes (sem conexão não é possível verificar quais já foram aplicadas):'
        : '[migrate] Migrações existentes:'
    );
    for (const name of files) console.error(`  - ${name}`);
    process.exit(1);
  }

  if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    console.error('[migrate] ERRO: DATABASE_URL deve começar com postgres:// ou postgresql://.');
    console.error(`[migrate] Valor recebido começa com: ${databaseUrl.slice(0, 20).replace(/:[^@/]*@/, ':***@')}...`);
    process.exit(1);
  }

  const sql = neon(databaseUrl);
  console.log(`[migrate] Banco de dados: ${describeDatabaseUrl(databaseUrl)}`);

  // 1. Garante a tabela de controle (idempotente).
  await sql.query(`
    CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // 2. Descobre o que já foi aplicado.
  const appliedRows = (await sql.query(`SELECT name FROM ${TRACKING_TABLE}`));
  const applied = new Set(appliedRows.map((row) => String(row.name)));
  const pending = files.filter((name) => !applied.has(name));

  if (dryRun) {
    console.log('[migrate] Modo dry-run — nenhuma alteração será aplicada.');
    console.log(`[migrate] Aplicadas: ${applied.size} | Pendentes: ${pending.length}`);
    if (applied.size > 0) console.log(`[migrate] Já aplicadas: ${[...applied].sort().join(', ')}`);
    if (pending.length === 0) {
      console.log('[migrate] Nenhuma migração pendente. Banco em conformidade.');
      return;
    }
    console.log('[migrate] Migrações pendentes que SERIAM aplicadas (nesta ordem):');
    for (const name of pending) console.log(`  - ${name}`);
    return;
  }

  // 3. Aplica em ordem: instruções normais em uma transação por arquivo
  //    (junto com o registro em schema_migrations); instruções CONCURRENTLY
  //    fora da transação, como o PostgreSQL exige.
  for (const name of pending) {
    const content = readFileSync(join(migrationsDir, name), 'utf8');
    const statements = splitSqlStatements(content);

    try {
      if (statements.length === 0) {
        await sql.query(`INSERT INTO ${TRACKING_TABLE} (name) VALUES ($1)`, [name]);
        console.log(`[migrate] ✓ ${name} (nenhuma instrução executável; apenas registrado)`);
        continue;
      }

      let batch = [];
      const flushBatch = async (extra) => {
        if (batch.length === 0 && !extra) return;
        if (extra) batch.push(extra);
        if (batch.length > 0) await sql.transaction(batch);
        batch = [];
      };

      for (const statement of statements) {
        if (requiresStandaloneExecution(statement)) {
          await flushBatch();
          console.log('[migrate]   • executando fora da transação (CONCURRENTLY/não transacionável)');
          await sql.query(statement);
        } else {
          batch.push(sql.query(statement));
        }
      }

      await flushBatch(sql.query(`INSERT INTO ${TRACKING_TABLE} (name) VALUES ($1)`, [name]));
      console.log(`[migrate] ✓ ${name} (${statements.length} instrução/ões)`);
    } catch (err) {
      console.error(`[migrate] ✗ Falha ao aplicar ${name}: ${friendlyError(err)}`);
      console.error('[migrate] As migrações seguintes NÃO foram aplicadas. Corrija o problema e execute novamente.');
      process.exit(1);
    }
  }

  console.log(`[migrate] Concluído: ${pending.length} migração/ões aplicada(s).`);
}

main().catch((err) => {
  console.error(`[migrate] Falha ao executar migrações: ${friendlyError(err)}`);
  console.error('[migrate] Verifique a DATABASE_URL (host, credenciais, sslmode) e a conectividade com o Neon.');
  process.exit(1);
});
