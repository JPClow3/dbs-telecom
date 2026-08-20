import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [...configDefaults.exclude, 'dist/**', 'test/live-providers.contract.test.ts'],
    testTimeout: 35000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      AI_PROVIDER: 'mock',
      GEMINI_API_KEY: '',
      OPENAI_API_KEY: '',
      IXC_TOKEN: '',
      IXC_BASE_URL: 'https://provider.invalid/webservice/v1',
      DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '',
    },
  },
});
