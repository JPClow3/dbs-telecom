import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const e2ePort = Number(process.env.E2E_PORT || 3000);
const e2eBaseUrl = `http://localhost:${e2ePort}`;

// Defesa em profundidade: os testes E2E NUNCA devem enxergar credenciais de
// banco. O launcher (scripts/serve-current-mobile.mjs) já força o isolamento,
// mas remover aqui garante que nenhum processo filho do Playwright herde a
// string de conexão do Neon (o backend cai para SQLite :memory: sem ela).
for (const key of Object.keys(process.env)) {
  if (/^(DATABASE_URL|DIRECT_URL|NEON_[A-Z0-9_]*)$/i.test(key)) {
    delete process.env[key];
  }
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 1,
  timeout: 45000,
  expect: {
    timeout: 10000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: e2eBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 850 } },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'node scripts/serve-current-mobile.mjs',
    cwd: path.resolve(__dirname),
    url: `${e2eBaseUrl}/api/health`,
    // Reuse would bypass the fresh Expo export and can serve an old bundle.
    reuseExistingServer: false,
    // A clean Expo export (and a cold Metro cache after dependency changes)
    // can take several minutes on Windows.
    timeout: 420000,
  },
});
