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
// bundle produced by an older checkout.
if (existsSync(mobileDist)) {
  rmSync(mobileDist, { recursive: true, force: true });
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

const backend = spawn(runner, ['tsx', 'src/server.ts'], {
  cwd: backendDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    DBS_DEMO_MODE: 'true',
    AI_PROVIDER: 'mock',
    GEMINI_API_KEY: '',
    OPENAI_API_KEY: '',
    IXC_TOKEN: '',
    IXC_BASE_URL: 'https://provider.invalid/webservice/v1',
    DB_PATH: ':memory:',
  },
});

const stop = (signal) => {
  if (!backend.killed) backend.kill(signal);
};

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

backend.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
