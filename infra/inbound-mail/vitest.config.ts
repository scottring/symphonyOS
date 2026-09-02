import { defineConfig } from 'vitest/config'

// Standalone config so this package's tests run in isolation from the repo
// root's vitest.config.ts (infra/ is not in the root's test include, and this
// package has no need for the root's happy-dom/setupFiles/react-plugin setup).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
})
