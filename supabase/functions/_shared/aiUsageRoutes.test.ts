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
const routes = ['symphony-agent', 'wall-ask', 'wall-say', 'workspace-voice', 'question-ideas'] as const

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  allowed = true; quotaReady = false; providerCalls = 0
  const env: Record<string, string> = {
    SUPABASE_SERVICE_ROLE_KEY:'service-test', SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'public-test', ANTHROPIC_API_KEY: 'test', OPENAI_API_KEY: 'test',
    WORKSPACE_VOICE_ENABLED: '1', WORKSPACE_VOICE_USER_IDS: 'member',
  }
  vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] }, serve: (next: Handler) => { handler = next } })
  rpc.mockImplementation(async (name: string) => name === 'reserve_workspace_voice_start_v2'
    ? { data: true, error: null }
    // The agent's identity check (a paired display or a member) is not a reservation.
    : name === 'my_surface' ? { data: 'member', error: null }
    : { data: quotaReady ? { allowed: true, reservation_id: 'reservation' } : { allowed: false, reason: 'daily_limit', retry_at: '2026-10-15T00:00:00Z' }, error: null })
  createClient.mockReturnValue({
    rpc,
    auth: { getUser: async () => ({ data: { user: allowed ? { id: 'member' } : null }, error: allowed ? null : { message: 'Invalid' } }) },
    from: () => ({ select: () => ({ order: async () => ({ data: [] }), limit: async () => ({ data: [], error: null }) }) }),
  })
  vi.stubGlobal('fetch', vi.fn(async (input:RequestInfo|URL,init?:RequestInit) => {
    if(String(input).includes('/rest/v1/rpc/')) { const result=await rpc(String(input).split('/').at(-1),JSON.parse(String(init?.body)));return new Response(JSON.stringify(result.data),{headers:{'content-type':'application/json'}}) }
    providerCalls++
    // question-ideas forces its one tool; everything else answers in text.
    if (String(init?.body).includes('give_ideas')) return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'give_ideas', input: { ideas: [{ answer: 'Sunday at 7pm', why: 'End of the week' }] } }], stop_reason: 'tool_use' }))
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Answer.' }], stop_reason: 'end_turn' }))
  }))
})
afterEach(() => vi.unstubAllGlobals())

async function run(route: typeof routes[number]) {
  if (route === 'symphony-agent') await import('../symphony-agent/index.ts')
  else if (route === 'wall-ask') await import('../wall-ask/index.ts')
  else if (route === 'wall-say') await import('../wall-say/index.ts')
  else if (route === 'question-ideas') await import('../question-ideas/index.ts')
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
    // Speech and realtime voice are funded at their stated, capped cost (2026-11-11).
    expect((await run(route)).status).toBe(200)
    expect(providerCalls).toBe(1)
    expect(rpc).toHaveBeenCalledWith('reserve_ai_budget', expect.objectContaining({ p_route: route }))
  })

  it('denies an exhausted allowance without any provider request', async () => {
    const result = await run(route)
    expect(providerCalls).toBe(0)
    expect(result.status).toBe(route === 'symphony-agent' ? 200 : 429)
    expect(result.body).toContain('AI allowance')
    expect(result.body).toContain('view and change your plans directly')
    expect(rpc).toHaveBeenCalledWith('reserve_ai_budget', expect.objectContaining({ p_route: route }))
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
  rpc.mockImplementation(async (name: string) => name === 'my_surface'
    ? { data: 'member', error: null }
    : { data: ++reservations === 1 ? { allowed: true, reservation_id:'reservation' } : { allowed: false, reason: 'daily_limit' }, error: null })
  vi.stubGlobal('fetch', vi.fn(async (input:RequestInfo|URL,init?:RequestInit) => {
    if(String(input).includes('/rest/v1/rpc/')) { const result=await rpc(String(input).split('/').at(-1),JSON.parse(String(init?.body)));return new Response(JSON.stringify(result.data),{headers:{'content-type':'application/json'}}) }
    providerCalls++
    return new Response(JSON.stringify({ content: [{ type: 'server_tool_use', name: 'web_search' }], stop_reason: 'pause_turn' }))
  }))
  const response = await run('symphony-agent')
  expect(reservations).toBe(2)
  expect(providerCalls).toBe(1)
  expect(response.body).toContain('AI allowance')
  expect(response.body).not.toContain('"type":"done"')
})

// plan-from-paper called reserve_ai_provider_call, revoked on 2026-10-16, so
// every reading was refused; it now runs on the funded guard (2026-11-11).
describe('plan-from-paper usage guard', () => {
  const revise = () => handler(new Request('https://example.invalid/plan-from-paper', {
    method: 'POST', headers: { Authorization: 'Bearer member-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'revise', message: 'Move it to Friday', context: { today: '2026-11-11' }, analysis: {}, conversation: [] }),
  }))
  const stream = (text: string) => {
    const events = [
      { type: 'message_start', message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 900, output_tokens: 1 } } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 40 } },
      { type: 'message_stop' },
    ]
    return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
  }
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/rest/v1/rpc/')) { const result = await rpc(String(input).split('/').at(-1), JSON.parse(String(init?.body))); return new Response(JSON.stringify(result.data), { headers: { 'content-type': 'application/json' } }) }
      providerCalls++
      expect(JSON.parse(String(init?.body)).stream).toBe(true)
      return stream(JSON.stringify({ reply: 'Moved.', changes: ['Moved to Friday'], upserts: [], remove: [] }))
    }))
  })

  it('reserves, streams the reading, and settles what the stream reported', async () => {
    quotaReady = true
    await import('../plan-from-paper/index.ts')
    const response = await revise()
    expect(response.status).toBe(200)
    expect(JSON.parse(await response.text())).toMatchObject({ ok: true, reply: 'Moved.' })
    expect(providerCalls).toBe(1)
    expect(rpc).toHaveBeenCalledWith('reserve_ai_budget', expect.objectContaining({ p_route: 'plan-from-paper', p_user: 'member', p_model: 'claude-sonnet-4-6', p_output: 32000 }))
    expect(rpc).toHaveBeenCalledWith('settle_ai_budget', { p_id: 'reservation', p_user: 'member', p_input: 900, p_output: 40, p_minutes: 0 })
    expect(rpc).not.toHaveBeenCalledWith('reserve_ai_provider_call', expect.anything())
  })

  it('refuses a spent allowance with its own status, before the reading starts', async () => {
    await import('../plan-from-paper/index.ts')
    const response = await revise()
    expect(response.status).toBe(429)
    expect(JSON.parse(await response.text())).toMatchObject({ code: 'ai_daily_limit' })
    expect(providerCalls).toBe(0)
  })
})
