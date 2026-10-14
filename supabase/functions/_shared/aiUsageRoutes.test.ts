// Real endpoint handlers, isolated authentication/database/provider doubles.
// These prove admission ordering and coverage, not deployed grants or billing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient }))
type Handler = (request: Request) => Promise<Response>
let handler: Handler
let allowed: boolean
let quotaReady: boolean
let providerCalls: number
const rpc = vi.fn()
const routes = ['symphony-agent', 'wall-ask', 'wall-say', 'workspace-voice'] as const

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  allowed = true; quotaReady = false; providerCalls = 0
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'public-test', ANTHROPIC_API_KEY: 'test', OPENAI_API_KEY: 'test',
    WORKSPACE_VOICE_ENABLED: '1', WORKSPACE_VOICE_USER_IDS: 'member',
  }
  vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] }, serve: (next: Handler) => { handler = next } })
  rpc.mockImplementation(async (name: string) => name === 'reserve_workspace_voice_start'
    ? { data: true, error: null }
    : { data: quotaReady ? { allowed: true } : { allowed: false, reason: 'daily_limit', retry_at: '2026-10-15T00:00:00Z' }, error: null })
  createClient.mockReturnValue({
    rpc,
    auth: { getUser: async () => ({ data: { user: allowed ? { id: 'member' } : null }, error: allowed ? null : { message: 'Invalid' } }) },
    from: () => ({ select: () => ({ order: async () => ({ data: [] }) }) }),
  })
  vi.stubGlobal('fetch', vi.fn(async () => {
    providerCalls++
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Answer.' }], stop_reason: 'end_turn' }))
  }))
})
afterEach(() => vi.unstubAllGlobals())

async function run(route: typeof routes[number]) {
  if (route === 'symphony-agent') await import('../symphony-agent/index.ts')
  else if (route === 'wall-ask') await import('../wall-ask/index.ts')
  else if (route === 'wall-say') await import('../wall-say/index.ts')
  else await import('../workspace-voice/index.ts')
  const response = await handler(new Request('https://example.invalid/test', {
    method: 'POST', headers: { Authorization: 'Bearer member-token', 'Content-Type': route === 'workspace-voice' ? 'application/sdp' : 'application/json' },
    body: route === 'workspace-voice' ? 'v=0\r\n' : JSON.stringify({
      messages: [{ role: 'user', content: 'What is next?' }], question: 'What is next?', snapshot: 'Lunch at noon.', text: 'Lunch at noon.',
    }),
  }))
  return { status: response.status, body: await response.text() }
}

describe.each(routes)('%s usage guard', (route) => {
  it('calls the provider after a confirmed server reservation', async () => {
    quotaReady = true
    expect((await run(route)).status).toBe(200)
    expect(providerCalls).toBe(1)
    expect(rpc).toHaveBeenCalledWith('reserve_ai_provider_call', { p_route: route })
  })

  it('denies an exhausted allowance without any provider request', async () => {
    const result = await run(route)
    expect(providerCalls).toBe(0)
    expect(result.status).toBe(route === 'symphony-agent' ? 200 : 429)
    expect(result.body).toContain('AI allowance')
    expect(result.body).toContain('view and change your plans directly')
    expect(rpc).toHaveBeenCalledWith('reserve_ai_provider_call', { p_route: route })
  })

  it('authenticates before reserving or spending', async () => {
    allowed = false
    expect((await run(route)).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
    expect(providerCalls).toBe(0)
  })
})

it('reserves the next agent tool-loop attempt and stops when it is refused', async () => {
  let reservations = 0
  rpc.mockImplementation(async () => ({ data: ++reservations === 1 ? { allowed: true } : { allowed: false, reason: 'daily_limit' }, error: null }))
  vi.stubGlobal('fetch', vi.fn(async () => {
    providerCalls++
    return new Response(JSON.stringify({ content: [{ type: 'server_tool_use', name: 'web_search' }], stop_reason: 'pause_turn' }))
  }))
  const response = await run('symphony-agent')
  expect(reservations).toBe(2)
  expect(providerCalls).toBe(1)
  expect(response.body).toContain('AI allowance')
  expect(response.body).not.toContain('"type":"done"')
})
