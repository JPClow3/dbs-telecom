import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const mobileDir = resolve(repoRoot, 'mobile');
const backendDir = resolve(repoRoot, 'backend');
const mobileDist = resolve(mobileDir, 'dist');
const runner = process.platform === 'win32' ? 'npx.cmd' : 'npx';

// The export is generated output and is intentionally rebuilt for every E2E run.
// Removing only this exact directory prevents tests from accidentally serving a
// bundle produced by an older checkout. On Windows, antivirus/indexer handles
// can briefly lock fresh files, so retry before giving up.
if (existsSync(mobileDist)) {
  let removed = false;
  let lastError;
  for (let attempt = 0; attempt < 5 && !removed; attempt++) {
    try {
      rmSync(mobileDist, { recursive: true, force: true });
      removed = true;
    } catch (err) {
      lastError = err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, true, 1000 * (attempt + 1));
    }
  }
  if (!removed) {
    console.error(`[serve-current-mobile] Não foi possível remover ${mobileDist}:`, lastError);
    process.exit(1);
  }
}

const build = spawnSync(runner, ['expo', 'export', '--platform', 'web'], {
  cwd: mobileDir,
  stdio: 'inherit',
  // Windows resolves npx.cmd through the command shell; shell:false yields
  // EINVAL before Expo can start.
  shell: process.platform === 'win32',
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

// Isolamento obrigatório de ambiente para o backend dos testes E2E.
//
// O servidor cai automaticamente em SQLite :memory: quando DATABASE_URL está
// ausente ou vazia (ver backend/src/database/db.ts). Portanto NUNCA herde
// DATABASE_URL/DIRECT_URL/NEON_* do shell pai: um valor exportado apontaria
// os testes para o banco de produção (Neon), gravando dados de teste nele.
// Valores vazios explícitos vencem qualquer herança de processo pai.
const BLOCKLISTED_ENV_KEYS = Object.keys(process.env)
  .filter((key) => /^(DATABASE_URL|DIRECT_URL|NEON_[A-Z0-9_]*)(=.*)?$/i.test(key));

const isolatedEnv = {
  ...process.env,
  NODE_ENV: 'development',
  DBS_DEMO_MODE: 'true',
  // Demo mode explícito também via DEMO_MODE (aceito pelo env.ts).
  DEMO_MODE: 'true',
  AI_PROVIDER: 'mock',
  GEMINI_API_KEY: '',
  OPENAI_API_KEY: '',
  IXC_TOKEN: '',
  IXC_BASE_URL: 'https://provider.invalid/webservice/v1',
};

for (const key of BLOCKLISTED_ENV_KEYS) {
  isolatedEnv[key] = '';
}
if (!BLOCKLISTED_ENV_KEYS.includes('DATABASE_URL')) {
  isolatedEnv.DATABASE_URL = '';
}

const scrubbedSensitiveKeys = [
  ...new Set(
    Object.keys(process.env).filter((key) =>
      /(^|_)(TOKEN|SECRET|API_KEY|PASSWORD|PASSWD|PRIVATE_KEY)($|_)/i.test(key) ||
      /^(EXPO_TOKEN|EAS_[A-Z0-9_]*|JWT_SECRET|PIX_WEBHOOK_SECRET|GEMINI_API_KEY|OPENAI_API_KEY|IXC_TOKEN|DATABASE_URL|DIRECT_URL|NEON_[A-Z0-9_]*)$/i.test(key)
    )
  ),
];
if (scrubbedSensitiveKeys.length > 0) {
  console.log(
    `[serve-current-mobile] Variáveis sensíveis isoladas/neutralizadas (${scrubbedSensitiveKeys.length}): ${scrubbedSensitiveKeys.join(', ')}`
  );
} else {
  console.log('[serve-current-mobile] Nenhuma variável sensível presente no shell pai.');
}

const backend = spawn(runner, ['tsx', 'src/server.ts'], {
  cwd: backendDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...isolatedEnv,
    JWT_SECRET: 'e2e-throwaway-secret-not-used-in-production-0123456789abcdef',
    DATABASE_URL: '',
    DIRECT_URL: '',
  },
});

console.log(
  '[serve-current-mobile] Backend iniciado em modo demo isolado: sem DATABASE_URL (SQLite em memória), provedores de IA mock.'
);

const stop = (signal) => {
  if (!backend.killed) backend.kill(signal);
};

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

backend.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
