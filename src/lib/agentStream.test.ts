import { describe, it, expect } from 'vitest'
import { parseSSEChunk } from './agentStream'

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
})
