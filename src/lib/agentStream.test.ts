import { describe, it, expect, afterEach, vi } from 'vitest'
import { parseSSEChunk, agentFunctionName, voiceFunctionName, streamSymphonyAgent, describeRefusal } from './agentStream'
import { supabase } from '@/lib/supabase'

describe('parseSSEChunk', () => {
  it('extracts complete events and returns the remainder buffer', () => {
    const input =
      'data: {"type":"text","text":"hi"}\n\n' +
      'data: {"type":"tool","name":"symphony_create_task"}\n\n' +
      'data: {"type":"done"'
    const { events, rest } = parseSSEChunk(input)
    expect(events).toEqual([
      { type: 'text', text: 'hi' },
      { type: 'tool', name: 'symphony_create_task' },
    ])
    expect(rest).toBe('data: {"type":"done"')
  })

  it('returns no events when no full frame is present', () => {
    const { events, rest } = parseSSEChunk('data: {"type":"te')
    expect(events).toEqual([])
    expect(rest).toBe('data: {"type":"te')
  })

  it('skips malformed JSON frames without throwing', () => {
    const { events } = parseSSEChunk('data: not-json\n\ndata: {"type":"text","text":"ok"}\n\n')
    expect(events).toEqual([{ type: 'text', text: 'ok' }])
  })

  it('passes a change_set event through intact', () => {
    const set = { key: 'tu1', title: '2 changes', ops: [{ key: 'tu1:0', op: 'someday', taskId: 'a', title: 'Paper mail' }] }
    const { events } = parseSSEChunk(`data: ${JSON.stringify({ type: 'change_set', set })}\n\n`)
    expect(events).toEqual([{ type: 'change_set', set }])
  })

  it('passes a point event through intact', () => {
    const { events } = parseSSEChunk('data: {"type":"point","dates":["2026-10-18"],"taskIds":[]}\n\n')
    expect(events).toEqual([{ type: 'point', dates: ['2026-10-18'], taskIds: [] }])
  })
})

describe('agentFunctionName', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is symphony-agent unless a preview build names another', () => {
    expect(agentFunctionName()).toBe('symphony-agent')
    vi.stubEnv('VITE_AGENT_FUNCTION', 'symphony-agent-v2')
    expect(agentFunctionName()).toBe('symphony-agent-v2')
    vi.stubEnv('VITE_AGENT_FUNCTION', '../evil')
    expect(agentFunctionName()).toBe('symphony-agent')
  })
})

describe('voiceFunctionName', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is workspace-voice unless a preview build names another', () => {
    expect(voiceFunctionName()).toBe('workspace-voice')
    vi.stubEnv('VITE_VOICE_FUNCTION', 'workspace-voice-v2')
    expect(voiceFunctionName()).toBe('workspace-voice-v2')
    vi.stubEnv('VITE_VOICE_FUNCTION', '../evil')
    expect(voiceFunctionName()).toBe('workspace-voice')
  })
})

describe('streamSymphonyAgent request', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('carries the last change card to the agent', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session: { access_token: 't' } }, error: null } as never)
    const fetch = vi.fn(async () => new Response('data: {"type":"done","reply":"ok"}\n\n'))
    vi.stubGlobal('fetch', fetch)
    const changeCard = { state: 'approved' as const, title: '2 changes', ops: [{ op: 'someday', title: 'Paper mail', where: '→ Someday' }], at: '2026-10-14T09:00:00.000Z' }
    await streamSymphonyAgent([{ role: 'user', content: 'next' }], { changeCard })
    const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.changeCard).toEqual(changeCard)
  })
})

describe('describeRefusal', () => {
  it('says the allowance message and reset, never the raw body', async () => {
    const res = { status: 429, text: async () => JSON.stringify({ error: 'The AI allowance for this day has been reached. It resets at 2026-10-16T00:00:00.000Z (UTC). You can still view and change your plans directly.', code: 'ai_daily_limit' }) }
    expect(await describeRefusal(res)).toMatch(/^The AI allowance for this day has been reached/)
  })
  it('an expired session and an unexplained failure keep their plain words', async () => {
    expect(await describeRefusal({ status: 401 })).toBe('Session expired')
    expect(await describeRefusal({ status: 500, text: async () => 'boom' })).toBe('Assistant offline')
    expect(await describeRefusal({ status: 429, text: async () => JSON.stringify({ error: 'rate', code: 'other' }) })).toBe('Assistant offline')
  })
})
