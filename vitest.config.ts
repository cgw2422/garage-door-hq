import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Database-backed tests share one Postgres schema, so they run serially
    // and start from a clean database.
    fileParallelism: false,
    globalSetup: ['./tests/global-setup.ts'],
    testTimeout: 30_000,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
