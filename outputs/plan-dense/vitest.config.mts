import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// A config of its own so the emitter can live outside src/ without joining the
// app's test run. See emit.spec.tsx.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: [fileURLToPath(new URL('../../src/test/setup.ts', import.meta.url))],
    include: ['outputs/plan-dense/emit.spec.tsx'],
  },
})
