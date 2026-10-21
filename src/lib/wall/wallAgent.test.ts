import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { apiMessages, askWallAgent, wallAgentFunctionName, type WallTurn } from './wallAgent'

const sse = (...events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')

/** A streamed response split mid-frame, as the network delivers it. */
function streamed(body: string, cut = 17): Response {
  const enc = new TextEncoder()
  return new Response(new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(body.slice(0, cut)))
      c.enqueue(enc.encode(body.slice(cut)))
      c.close()
    },
  }))
}

function mockFetch(...responses: Response[]) {
  const fetch = vi.fn(async () => responses.shift() ?? new Response('', { status: 500 }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
const sentBody = (fetch: ReturnType<typeof mockFetch>, i = 0) =>
  JSON.parse((fetch.mock.calls[i] as unknown as [string, RequestInit])[1].body as string)
const sentUrl = (fetch: ReturnType<typeof mockFetch>, i = 0) => (fetch.mock.calls[i] as unknown as [string])[0]

beforeEach(() => {
  vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session: { access_token: 't' } }, error: null } as never)
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('askWallAgent', () => {
  it('asks the agent with surface wall and returns the spoken reply', async () => {
    const fetch = mockFetch(streamed(sse(
      { type: 'tool', name: 'symphony_read_week' },
      { type: 'text', text: 'Soccer is at 4:15 ' },
      { type: 'text', text: 'and dinner is tacos.' },
      { type: 'done', reply: 'Soccer is at 4:15 and dinner is tacos.', sessionId: null },
    )))
    const r = await askWallAgent('What’s on tonight?')
    expect(sentUrl(fetch)).toMatch(/\/functions\/v1\/symphony-agent$/)
    const body = sentBody(fetch)
    expect(body.surface).toBe('wall')
    expect(body.messages).toEqual([{ role: 'user', content: 'What’s on tonight?' }])
    expect(body).not.toHaveProperty('workspaceContext')
    expect(r.reply).toBe('Soccer is at 4:15 and dinner is tacos.')
    expect(r.changeSet).toBeUndefined()
    expect(r.history).toEqual([
      { role: 'user', content: 'What’s on tonight?' },
      { role: 'assistant', content: 'Soccer is at 4:15 and dinner is tacos.' },
    ])
  })

  it('returns the change card and what it pointed at', async () => {
    const set = { key: 'k', title: '1 change', ops: [{ key: 'k:0', op: 'place', taskId: 'a', title: 'Piano', date: '2026-10-15', time: '18:30' }] }
    mockFetch(streamed(sse(
      { type: 'point', dates: ['2026-10-15'], taskIds: ['a'] },
      { type: 'change_set', set },
      { type: 'done', reply: 'Piano at 6:30 is on the card for a grown-up to approve.', sessionId: null },
    )))
    const r = await askWallAgent('Move piano to 6:30 tomorrow')
    expect(r.changeSet).toEqual(set)
    expect(r.pointed).toEqual({ dates: ['2026-10-15'], taskIds: ['a'] })
  })

  it('speaks the closing words, not what was said before a tool ran', async () => {
    mockFetch(streamed(sse(
      { type: 'text', text: 'Let me check the week.' },
      { type: 'tool', name: 'symphony_propose_changes' },
      { type: 'text', text: 'It’s on the card for a grown-up to approve.' },
      { type: 'done', reply: 'Let me check the week.It’s on the card for a grown-up to approve.', sessionId: null },
    )))
    const r = await askWallAgent('Move piano to 6:30')
    expect(r.reply).toBe('It’s on the card for a grown-up to approve.')
    expect(r.history.at(-1)).toEqual({ role: 'assistant', content: 'It’s on the card for a grown-up to approve.' })
  })

  it('reports what it saved so the wall can Undo', async () => {
    mockFetch(streamed(sse(
      { type: 'tool_result', name: 'symphony_add_to_scratchpad', ok: true, ids: ['n1'] },
      { type: 'done', reply: 'It’s on the list to talk about.', sessionId: null },
    )))
    const r = await askWallAgent('Can Max come over Saturday?')
    expect(r.saved).toEqual([{ name: 'symphony_add_to_scratchpad', ids: ['n1'] }])
  })

  it('carries history, the last change card and a test copy across turns', async () => {
    const fetch = mockFetch(
      streamed(sse({ type: 'done', reply: 'Piano is at 5.', sessionId: null })),
      streamed(sse({ type: 'done', reply: 'Moved to the card.', sessionId: null })),
    )
    const first = await askWallAgent('When is piano?', [], { functionName: 'symphony-agent-wall-test' })
    const changeCard = { state: 'dismissed' as const, title: '1 change', ops: [], at: '2026-10-14T09:00:00.000Z' }
    await askWallAgent('Make it 6', first.history, { functionName: 'symphony-agent-wall-test', changeCard, turnId: 't2' })
    expect(sentUrl(fetch, 1)).toMatch(/\/functions\/v1\/symphony-agent-wall-test$/)
    const body = sentBody(fetch, 1)
    expect(body.messages).toEqual([
      { role: 'user', content: 'When is piano?' },
      { role: 'assistant', content: 'Piano is at 5.' },
      { role: 'user', content: 'Make it 6' },
    ])
    expect(body.changeCard).toEqual(changeCard)
    expect(body.turnId).toBe('t2')
  })

  it('says which days the family is planning, on every turn of it', async () => {
    const fetch = mockFetch(streamed(sse({ type: 'done', reply: 'What else is on Wednesday?', sessionId: null })))
    await askWallAgent('Help me plan the rest of this week, Wed, Oct 21 – Fri, Oct 23.', [], { plan: { from: '2026-10-21', to: '2026-10-23' } })
    expect(sentBody(fetch, 0).wallPlan).toEqual({ from: '2026-10-21', to: '2026-10-23' })
  })

  it('uses the preview build’s wall test copy when one is named', async () => {
    vi.stubEnv('VITE_WALL_AGENT_FUNCTION', 'symphony-agent-wall-test')
    expect(wallAgentFunctionName()).toBe('symphony-agent-wall-test')
    const fetch = mockFetch(streamed(sse({ type: 'done', reply: 'ok', sessionId: null })))
    await askWallAgent('hi')
    expect(sentUrl(fetch)).toMatch(/symphony-agent-wall-test$/)
    vi.stubEnv('VITE_WALL_AGENT_FUNCTION', '../evil')
    expect(wallAgentFunctionName()).toBeUndefined()
  })

  it('rejects on an agent error, an offline function or no answer', async () => {
    mockFetch(streamed(sse({ type: 'error', message: 'Agent failed' })))
    await expect(askWallAgent('hi')).rejects.toThrow('Agent failed')
    mockFetch(new Response('nope', { status: 500 }))
    await expect(askWallAgent('hi')).rejects.toThrow('Assistant offline')
    mockFetch(streamed(sse({ type: 'text', text: 'half an ans' })))
    await expect(askWallAgent('hi')).rejects.toThrow('No answer')
    await expect(askWallAgent('   ')).rejects.toThrow('Nothing was asked')
  })
})

describe('apiMessages', () => {
  it('starts with the person, alternates, and appends the new question', () => {
    const h: WallTurn[] = [
      { role: 'assistant', content: 'stray greeting' },
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' },
      { role: 'assistant', content: '' },
    ]
    expect(apiMessages(h, 'c')).toEqual([{ role: 'user', content: 'a\nb\nc' }])
  })
  it('keeps only the recent turns', () => {
    const h: WallTurn[] = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }))
    const out = apiMessages(h, 'now')
    expect(out[0].role).toBe('user')
    expect(out.length).toBeLessThanOrEqual(13)
    expect(out.at(-1)).toEqual({ role: 'user', content: 'now' })
  })
})
