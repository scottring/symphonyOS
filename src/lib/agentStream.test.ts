import { describe, it, expect, afterEach, vi } from 'vitest'
import { parseSSEChunk, agentFunctionName } from './agentStream'

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
