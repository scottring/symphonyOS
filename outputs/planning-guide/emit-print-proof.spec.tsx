// Emits a self-contained copy of the planning guide's four sheets, with the
// app's BUILT stylesheet inlined, so the print layout can be checked in a real
// browser without signing in to the app.
//
//   npm run build                                             (produces dist/)
//   npx vitest run --config outputs/planning-guide/vitest.config.mts
//   node outputs/planning-guide/check-print.mjs
//
// It is not a test of the app: it is the first half of the print check, kept
// as a spec only so it can reuse the repo's React and alias setup.
import { it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PlanningGuide } from '@/components/plan/PlanningGuide'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')

it('emits the printable sheets with the built stylesheet inlined', () => {
  const assets = join(root, 'dist', 'assets')
  // The build splits CSS into chunks, so "the first .css file" is no longer the
  // main stylesheet: take the one that carries the guide's print rules.
  const css = readdirSync(assets)
    .filter((f) => f.endsWith('.css'))
    .map((f) => readFileSync(join(assets, f), 'utf8'))
    .find((c) => c.includes('guide-print-ancestor'))
  if (!css) throw new Error('no built stylesheet with the guide in dist/assets — run npm run build first')

  const body = renderToStaticMarkup(<MemoryRouter><PlanningGuide /></MemoryRouter>)
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Planning guide — print proof</title>
<style>${css}</style>
</head><body>${body}</body></html>`

  mkdirSync(here, { recursive: true })
  writeFileSync(join(here, 'guide-print-proof.html'), html)
})
