import { describe, it, expect } from 'vitest'
import { LIMITS, messagesBody, parseRequest, parseToolInput, type GuideRequest } from './planningConversation'

const labels = { year: '2026', season: 'Fall', month: 'October', week: 'Oct 3 – 9', today: 'Thursday' }
const base = {
  horizon: 'month', labels,
  goals: [{ ref: 'g1', title: 'Get strong again' }, { ref: 'g2', title: 'Finish the home office' }],
  lines: [{ goal: 'g1', horizon: 'season', text: 'Training three times a week', existing: true }],
  focus: 'g1',
  turns: [{ role: 'user', text: 'I want to sort my food and get some kit for home' }],
}
const req = (over: Record<string, unknown> = {}) => parseRequest(JSON.stringify({ ...base, ...over }))
const ok = (over: Record<string, unknown> = {}) => { const r = req(over); if (!r.ok) throw new Error(r.error); return r.value }

describe('planning-conversation: what a request may carry', () => {
  it('takes what is on screen, with goals named by refs', () => {
    expect(ok()).toMatchObject({ horizon: 'month', focus: 'g1', goals: [{ ref: 'g1' }, { ref: 'g2' }] })
  })

  it('refuses row ids, unknown refs, unknown horizons, and a reply-last history', () => {
    expect(req({ goals: [{ ref: '6f1c2c1e-0000-4000-8000-000000000000', title: 'x' }] }).ok).toBe(false)
    expect(req({ lines: [{ goal: 'g9', horizon: 'month', text: 'x' }] }).ok).toBe(false)
    expect(req({ horizon: 'decade' }).ok).toBe(false)
    expect(req({ focus: 'g7' }).ok).toBe(false)
    expect(req({ turns: [{ role: 'assistant', text: 'Hello' }] }).ok).toBe(false)
  })

  it('is bounded: too many goals, lines or turns, or too much text, is refused', () => {
    expect(req({ goals: Array.from({ length: LIMITS.goals + 1 }, (_, i) => ({ ref: `g${i + 1}`, title: 't' })) }).ok).toBe(false)
    expect(req({ turns: Array.from({ length: LIMITS.turns + 1 }, () => ({ role: 'user', text: 'x' })) }).ok).toBe(false)
    const big = req({ lines: Array.from({ length: 50 }, () => ({ goal: null, horizon: 'week', text: 'x'.repeat(300) })) })
    expect(big).toMatchObject({ ok: false, status: 413 })
  })
})

describe('planning-conversation: what a reply may propose', () => {
  const r: GuideRequest = ok()
  it('keeps only proposals at the horizon on screen, for goals that were sent (or none), without duplicates', () => {
    const out = parseToolInput({
      reply: 'Three good priorities. Which matters most this month?',
      proposals: [
        { level: 'month', goal: 'g1', text: 'Plan a week of meals' },
        { level: 'month', goal: 'g1', text: 'Buy dumbbells and a mat' },
        { level: 'month', goal: 'g1', text: 'plan a week of meals' },
        { level: 'month', goal: 'g9', text: 'An unknown goal is dropped, not re-pointed' },
        { level: 'month', goal: 7, text: 'A malformed goal is dropped' },
        { level: 'week', goal: 'g1', text: 'Another horizon is dropped' },
        { level: 'decade', goal: 'g1', text: 'dropped' },
        { level: 'month', goal: null, text: 'Picnic in the park' },
      ],
    }, r)
    expect(out?.proposals).toEqual([
      { level: 'month', goal: 'g1', text: 'Plan a week of meals' },
      { level: 'month', goal: 'g1', text: 'Buy dumbbells and a mat' },
      { level: 'month', goal: null, text: 'Picnic in the park' },
    ])
  })

  it('a reply with no words is no reply; proposals are capped', () => {
    expect(parseToolInput({ reply: '  ', proposals: [] }, r)).toBeNull()
    const many = Array.from({ length: 9 }, (_, i) => ({ level: 'month', goal: 'g2', text: `Line ${i}` }))
    expect(parseToolInput({ reply: 'ok', proposals: many }, r)?.proposals).toHaveLength(LIMITS.proposals)
  })
})

describe('planning-conversation: the model request', () => {
  it('is bounded, forces the one tool, and carries the screen with the latest turn', () => {
    const body = messagesBody(ok(), 'model-x')
    expect(body).toMatchObject({ model: 'model-x', max_tokens: LIMITS.maxTokens, tool_choice: { type: 'tool', name: 'propose' } })
    expect(body.messages.at(-1)?.content).toContain('g1: Get strong again')
    expect(body.messages.at(-1)?.content).toContain('Training three times a week — for g1 "Get strong again" (already on the plan)')
    expect(body.system).toContain('You cannot save anything')
  })
})
