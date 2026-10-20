import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { textBudget } from '../_shared/aiBudget.ts'

const h = vi.hoisted(() => ({
  serve: vi.fn(),
  paidFetch: vi.fn(),
}))
vi.mock(
  'https://esm.sh/@supabase/supabase-js@2',
  () => ({ createClient: () => ({}) }),
)
vi.mock('../_shared/aiUsage.ts', () => ({
  guardedAiFetchFor: () => h.paidFetch,
  AiUsageError: class extends Error {},
}))
let handler: (request: Request) => Promise<Response>
beforeAll(async () => {
  vi.stubGlobal('Deno', {
    serve: h.serve,
    env: {
      get: (key: string) => ({
        CAPTURE_SHARED_SECRET: 'test-secret',
        SUPABASE_URL: 'https://example.invalid',
        SUPABASE_SERVICE_ROLE_KEY: 'test-only',
        ANTHROPIC_API_KEY: 'test-only',
      }[key]),
    },
  })
  await import('./index.ts')
  handler = h.serve.mock.calls[0][0]
})
afterAll(() => vi.unstubAllGlobals())

describe('school digest boundary', () => {
  // 2026-10-16 to 10-20: the digest asked for an unpriced model, the budget
  // reservation refused every call, and the 5pm email silently stopped.
  it('requests a bounded text model present in the deployed pricing configuration', async () => {
    h.paidFetch.mockRejectedValue(new Error('stop after the first provider call'))
    await handler(new Request('https://example.invalid', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-capture-secret': 'test-secret' },
      body: JSON.stringify({ user_id: 'parent', sources: [{ label: 'Class', text: 'Bring sneakers Tuesday.' }] }),
    }))
    const budget = textBudget(h.paidFetch.mock.calls[0][1])
    expect(budget).not.toBeNull()
    const prices = readFileSync('supabase/migrations/20261015150000_ai_spend_ledger.sql', 'utf8')
    const configuredModels = [...prices.matchAll(/\('([^']+)',\s*\d+,\s*\d+,\s*null,/g)].map((match) => match[1])
    expect(configuredModels).toContain(budget?.model)
  })
})
