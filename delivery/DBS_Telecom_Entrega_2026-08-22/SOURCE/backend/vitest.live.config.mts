import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/live-providers.contract.test.ts'],
    testTimeout: 60_000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'development',
      DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '',
    },
  },
});
