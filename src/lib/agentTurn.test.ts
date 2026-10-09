import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/agentStream', () => ({
  streamSymphonyAgent: vi.fn(),
}))

import { streamSymphonyAgent, type StreamHandlers } from '@/lib/agentStream'
import { runAgentTurn } from '@/lib/agentTurn'

describe('runAgentTurn', () => {
  it('concatenates deltas within one text segment with no separator', async () => {
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h: StreamHandlers) => {
      h.onText?.('Hel')
      h.onText?.('lo')
      h.onDone?.('Hello', null)
    })

    const turn = await runAgentTurn([])
    expect(turn.text).toBe('Hello')
  })

  it('inserts a paragraph break between text that straddles a tool call', async () => {
    const streamed: string[] = []
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h: StreamHandlers) => {
      h.onText?.('Let me look.')
      h.onTool?.('symphony_get_task')
      h.onText?.('The task is waiting on you.')
      h.onDone?.('Let me look.The task is waiting on you.', null)
    })

    const turn = await runAgentTurn([], { onText: (chunk) => streamed.push(chunk) })

    expect(turn.text).toBe('Let me look.\n\nThe task is waiting on you.')
    // The separator must reach the streaming consumer too, not just the
    // final accumulated text — the UI appends deltas as they arrive.
    expect(streamed.join('')).toBe('Let me look.\n\nThe task is waiting on you.')
  })

  it('does not double up a separator when the text before a tool call already ends in whitespace', async () => {
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h: StreamHandlers) => {
      h.onText?.('Checking that now.\n\n')
      h.onTool?.('symphony_get_task')
      h.onText?.('Done.')
      h.onDone?.('Checking that now.\n\nDone.', null)
    })

    const turn = await runAgentTurn([])
    expect(turn.text).toBe('Checking that now.\n\nDone.')
  })

  it('adds no separator when a tool call happens before any text has streamed', async () => {
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h: StreamHandlers) => {
      h.onTool?.('symphony_get_task')
      h.onText?.('The task is waiting on you.')
      h.onDone?.('The task is waiting on you.', null)
    })

    const turn = await runAgentTurn([])
    expect(turn.text).toBe('The task is waiting on you.')
  })

  it('separates multiple tool calls in a row from the text that follows', async () => {
    vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages, h: StreamHandlers) => {
      h.onText?.('Looking.')
      h.onTool?.('symphony_get_task')
      h.onTool?.('symphony_list_tasks')
      h.onText?.('Found it.')
      h.onDone?.('Looking.Found it.', null)
    })

    const turn = await runAgentTurn([])
    expect(turn.text).toBe('Looking.\n\nFound it.')
  })
})

it('forwards canvas navigation without treating it as a data write',async()=>{
 const onWorkspace=vi.fn()
 vi.mocked(streamSymphonyAgent).mockImplementation(async(_messages,h)=>{
  h.onWorkspace?.('month','2026-10-01');h.onDone?.('Opening October.',null)
 })
 const result=await runAgentTurn([],{onWorkspace})
 expect(onWorkspace).toHaveBeenCalledWith('month','2026-10-01')
 expect(result.didWrite).toBe(false)
})

it('refreshes the workspace after linking an existing plan item',async()=>{
 vi.mocked(streamSymphonyAgent).mockImplementation(async(_messages,h)=>{
  h.onTool?.('symphony_link_plan_item');h.onDone?.('Linked.',null)
 })
 expect((await runAgentTurn([])).didWrite).toBe(true)
})

it('delivers saved nodes before the reply finishes, even when the connection later drops', async () => {
 const onPlanSaved=vi.fn()
 vi.mocked(streamSymphonyAgent).mockImplementation(async (_messages,h)=>{
   h.onPlanSaved?.({id:'new-milestone',level:2,date:'2026-10-01'})
   expect(onPlanSaved).toHaveBeenCalledWith({id:'new-milestone',level:2,date:'2026-10-01'})
   throw new Error('disconnected after save')
 })
 const result=await runAgentTurn([],{onPlanSaved})
 expect(result.error).toBe('Connection dropped')
 expect(onPlanSaved).toHaveBeenCalledTimes(1)
})
