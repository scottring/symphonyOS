import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import path from 'path'

// The integration suite is DELIBERATELY separate from `vitest.config.ts`.
//
// These tests talk to the real Supabase project — they create throwaway auth
// users, write rows, and read them back through RLS as two different people.
// They need the service key, they need the network, and they take seconds, not
// milliseconds. None of that belongs in the unit suite that the pre-push hook
// runs on every push to `main`.
//
// Run them on purpose: `npm run test:integration`.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.integration.test.ts'],
    // One at a time: each file provisions accounts and tears them down, and
    // parallel files racing the same household would make failures unreadable.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Every var in `.env`, unprefixed — the service key has no VITE_ prefix on
    // purpose (it must never reach a browser bundle).
    env: loadEnv('test', process.cwd(), ''),
  },
})
