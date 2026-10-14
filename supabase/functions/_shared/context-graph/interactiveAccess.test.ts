// Exercises the actual HTTP entry points with isolated auth/provider doubles.
// This proves client selection and auth ordering, not deployed database RLS.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient, assembleContext } = vi.hoisted(() => ({ createClient: vi.fn(), assembleContext: vi.fn() }))
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient }))
vi.mock('./assemble.ts', () => ({ assembleContext }))

type Handler = (request: Request) => Promise<Response>
let handler: Handler
const values: Record<string, string> = {
  SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'public-test-key',
  ANTHROPIC_API_KEY: 'test-only',
  // Deliberately no service-role key. Interactive routes must not need it.
}

const bundle = {
  ref: { entityType: 'task', entityId: 't1', userId: 'u1' },
  entity: { id: 't1', title: 'Call the bank', links: [] },
  people: [], lineage: {}, facts: [], knowledge: [], history: [], time: { ageDays: 0 }, degraded: [],
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => values[name] },
    serve: (next: Handler) => { handler = next },
  })
  assembleContext.mockResolvedValue(bundle)
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
    content: [{ type: 'text', text: '{"suggestions":["the bank to reply"]}' }], stop_reason: 'end_turn',
  })))))
})
afterEach(() => vi.unstubAllGlobals())

describe.each(['agent', 'waiting'] as const)('%s interactive context', (route) => {
  async function request(authorized = true) {
    const db = {
      auth: { getUser: vi.fn().mockResolvedValue(authorized
        ? { data: { user: { id: 'u1' } }, error: null }
        : { data: { user: null }, error: { message: 'Invalid token' } }) },
      from: vi.fn(() => ({ select: () => ({ order: () => Promise.resolve({ data: [] }) }) })),
      rpc: vi.fn(async () => ({ data: { allowed: true }, error: null })),
    }
    createClient.mockReturnValue(db)
    if (route === 'agent') await import('../../symphony-agent/index.ts')
    else await import('../../suggest-waiting-for/index.ts')
    const response = await handler(new Request('https://example.invalid/functions/v1/test', {
      method: 'POST', headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify(route === 'agent'
        ? { messages: [{ role: 'user', content: 'Help with this task' }], taskContext: { id: 't1', title: 'Call the bank' } }
        : { taskId: 't1' }),
    }))
    await response.text() // Finish the agent stream before checking effects.
    return { response, db }
  }

  it('reads item context using only the validated caller’s client', async () => {
    const { response, db } = await request()
    expect(response.status).toBe(200)
    expect(createClient).toHaveBeenCalledTimes(1)
    expect(createClient).toHaveBeenCalledWith(values.SUPABASE_URL, values.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: 'Bearer user-token' } },
    })
    expect(db.auth.getUser).toHaveBeenCalledWith('user-token')
    expect(assembleContext).toHaveBeenCalledWith(
      expect.objectContaining({ client: db, openAiKey: undefined }), { entityType: 'task', entityId: 't1', userId: 'u1' },
    )
  })

  it('rejects invalid authentication before retrieval or paid provider calls', async () => {
    const { response } = await request(false)
    expect(response.status).toBe(401)
    expect(assembleContext).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})
