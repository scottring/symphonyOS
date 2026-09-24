import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Its own build so the harness never joins the app bundle.
//   npx vite build --config outputs/plan-keyboard/vite.config.mts
//   node outputs/plan-keyboard/check-keyboard.mjs
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  build: { outDir: 'dist', emptyOutDir: true },
  css: { postcss: fileURLToPath(new URL('../..', import.meta.url)) },
})
