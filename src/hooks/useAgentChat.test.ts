import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@/lib/agentStream', () => ({
  streamAgentChat: vi.fn(),
}))
vi.mock('@/lib/openBrain', () => ({
  getAgentChatHistory: vi.fn().mockResolvedValue([]),
  resetAgentSession: vi.fn().mockResolvedValue(true),
}))

import { streamAgentChat } from '@/lib/agentStream'
import { useAgentChat } from './useAgentChat'

describe('useAgentChat', () => {
  beforeEach(() => vi.clearAllMocks())

  it('appends streamed text to a single assistant message and clears loading on done', async () => {
    vi.mocked(streamAgentChat).mockImplementation(async (_m, _c, h) => {
      h.onText?.('Hello ')
      h.onText?.('Scott.')
      h.onDone?.('Hello Scott.', 's1')
    })

    const { result } = renderHook(() => useAgentChat())
    await act(async () => { await result.current.sendMessage('hi') })

    await waitFor(() => expect(result.current.loading).toBe(false))
    const msgs = result.current.messages
    expect(msgs.map(m => m.role)).toEqual(['user', 'assistant'])
    expect(msgs[1].content).toBe('Hello Scott.')
  })

  it('records tool activity from onTool', async () => {
    vi.mocked(streamAgentChat).mockImplementation(async (_m, _c, h) => {
      h.onTool?.('symphony_create_task')
      h.onText?.('Created.')
      h.onDone?.('Created.', 's1')
    })
    const { result } = renderHook(() => useAgentChat())
    await act(async () => { await result.current.sendMessage('add a task') })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.toolActivity).toContain('symphony_create_task')
  })

  it('surfaces errors', async () => {
    vi.mocked(streamAgentChat).mockImplementation(async (_m, _c, h) => {
      h.onError?.('Assistant offline')
    })
    const { result } = renderHook(() => useAgentChat())
    await act(async () => { await result.current.sendMessage('hi') })
    await waitFor(() => expect(result.current.error).toBe('Assistant offline'))
  })
})
