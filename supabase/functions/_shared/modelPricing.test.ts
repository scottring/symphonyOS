import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Since the 2026-10-16 budget reservation, a model with no enabled price is
// refused before the provider call. Until 2026-10-20 nine functions named
// unpriced models and every one of their calls was silently refused.
const FUNCTIONS = 'supabase/functions'

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : []
  })
}

describe('Claude models named in edge functions', () => {
  it('are all present in the deployed pricing configuration', () => {
    const prices = readFileSync('supabase/migrations/20261015150000_ai_spend_ledger.sql', 'utf8')
    const priced = new Set([...prices.matchAll(/\('([^']+)',\s*\d+,\s*\d+,\s*null,/g)].map((match) => match[1]))
    const unpriced = sources(FUNCTIONS).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/['"`](claude-(?:opus|sonnet|haiku)-[0-9a-z-]+)['"`]/g)]
        .map((match) => match[1])
        .filter((model) => !priced.has(model))
        .map((model) => `${file}: ${model}`))
    expect(unpriced).toEqual([])
  })
})
