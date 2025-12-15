import { defineConfig, Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// Plugin to mock CSS imports from node_modules
const mockNodeModulesCss = (): Plugin => ({
  name: 'mock-node-modules-css',
  enforce: 'pre',
  resolveId(source, importer) {
    // Mock CSS imports from node_modules
    if (source.endsWith('.css') && importer?.includes('node_modules')) {
      return { id: 'virtual:empty-css', moduleSideEffects: false }
    }
    return null
  },
  load(id) {
    if (id === 'virtual:empty-css') {
      return 'export default {}'
    }
    return null
  },
})

export default defineConfig({
  plugins: [react(), mockNodeModulesCss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Temporarily exclude App.test.tsx due to katex CSS import issue from @copilotkit
    // TODO: Re-enable when CopilotKit properly supports test environments
    exclude: ['src/App.test.tsx', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
  },
})
