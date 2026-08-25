import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { vaultApplicationsPlugin } from './vite/plugin-vault-applications'

export default defineConfig({
  plugins: [react(), vaultApplicationsPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'vite/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}',
      'supabase/functions/**/*.{test,spec}.{ts,mts,cts}',
      'connectors/src/**/*.{test,spec}.{ts,mts,cts}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
  },
})
