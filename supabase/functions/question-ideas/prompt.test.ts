import { describe, expect, it } from 'vitest'
import { buildIdeasPrompt, ideasFromResponse, parseIdeasBody } from './prompt'

describe('question-ideas body', () => {
  it('keeps the last ten real turns and drops junk', () => {
    const turns = Array.from({ length: 14 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i}` }))
    const parsed = parseIdeasBody({ question: 'What day?', today: '2026-10-24', conversation: [...turns, { role: 'system', content: 'x' }, { role: 'user', content: '  ' }, null] })
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.conversation).toHaveLength(10)
    expect(parsed.conversation.at(-1)).toEqual({ role: 'assistant', content: 'turn 13' })
    expect(parsed.today).toBe('2026-10-24')
  })
  it('needs a question', () => {
    expect(parseIdeasBody({ question: '  ' })).toHaveProperty('error')
    expect(parseIdeasBody({ question: 3 })).toHaveProperty('error')
    expect(parseIdeasBody(null)).toHaveProperty('error')
  })
})

describe('question-ideas prompt', () => {
  it('offers options, never a recommendation, from the conversation only', () => {
    const { system, user } = buildIdeasPrompt('What day and time?', [{ role: 'user', content: 'A weekly mail routine' }], '2026-10-24')
    expect(system).toMatch(/do not rank/i)
    expect(system).toMatch(/never invent/i)
    expect(user).toContain('PERSON: A weekly mail routine')
    expect(user).toContain('What day and time?')
  })
})

describe('question-ideas reply', () => {
  it('reads the forced tool call', () => {
    expect(ideasFromResponse({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'give_ideas', input: { ideas: [{ answer: ' Sunday 7pm ', why: 'Quiet evening' }, { answer: '' , why: 'x' }] } }] }))
      .toEqual([{ answer: 'Sunday 7pm', why: 'Quiet evening' }])
  })
  it('a cut-off or empty reply is nothing', () => {
    expect(ideasFromResponse({ stop_reason: 'max_tokens', content: [{ type: 'tool_use', name: 'give_ideas', input: { ideas: [{ answer: 'a', why: '' }] } }] })).toBeNull()
    expect(ideasFromResponse({ stop_reason: 'end_turn', content: [{ type: 'text' }] })).toBeNull()
  })
})
