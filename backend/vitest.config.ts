import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 35000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      AI_PROVIDER: 'hybrid',
      DB_PATH: ':memory:',
    },
  },
});
