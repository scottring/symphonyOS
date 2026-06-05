import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@/lib/agentStream', () => ({
  streamSymphonyAgent: vi.fn(),
}))

import { streamSymphonyAgent } from '@/lib/agentStream'
import { useSymphonyAssistant } from '@/hooks/useSymphonyAssistant'

describe('useSymphonyAssistant', () => {
  beforeEach(() => vi.clearAllMocks())

  it('appends streamed text to a single assistant message and clears loading on done', async () => {
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => {
      h.onText?.('Hello ')
      h.onText?.('Scott.')
      h.onDone?.('Hello Scott.', null)
    })

    const { result } = renderHook(() => useSymphonyAssistant())
    await act(async () => { await result.current.sendMessage('hi') })

    await waitFor(() => expect(result.current.loading).toBe(false))
    const msgs = result.current.messages
    expect(msgs.map(m => m.role)).toEqual(['user', 'assistant'])
    expect(msgs[1].content).toBe('Hello Scott.')
  })

  it('sends prior history plus the new user turn to the agent', async () => {
    let captured: Array<{ role: string; content: string }> = []
    vi.mocked(streamSymphonyAgent).mockImplementation(async (messages, h) => {
      captured = messages
      h.onText?.('ok')
      h.onDone?.('ok', null)
    })
    const { result } = renderHook(() => useSymphonyAssistant())
    await act(async () => { await result.current.sendMessage('first') })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.sendMessage('second') })
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Second call should include the first user + assistant turns, then "second".
    expect(captured.map(m => m.content)).toEqual(['first', 'ok', 'second'])
  })

  it('records tool activity from onTool', async () => {
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => {
      h.onTool?.('symphony_create_task')
      h.onText?.('Created.')
      h.onDone?.('Created.', null)
    })
    const { result } = renderHook(() => useSymphonyAssistant())
    await act(async () => { await result.current.sendMessage('add a task') })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.toolActivity).toContain('symphony_create_task')
  })

  it('surfaces errors', async () => {
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h) => {
      h.onError?.('Assistant offline')
    })
    const { result } = renderHook(() => useSymphonyAssistant())
    await act(async () => { await result.current.sendMessage('hi') })
    await waitFor(() => expect(result.current.error).toBe('Assistant offline'))
  })
})
