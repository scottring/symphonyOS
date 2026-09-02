import { describe, it, expect } from 'vitest'
import { buildEmailPrompt, parseEmailExtraction } from './prompt'

const members = [
  { id: 'p1', name: 'Jess', isChild: false },
  { id: 'k1', name: 'Liam', isChild: true },
  { id: 'k2', name: 'Mia', isChild: true },
]

describe('buildEmailPrompt', () => {
  it('names the household, the children, and today, and asks for strict JSON', () => {
    const p = buildEmailPrompt({ subject: 'Weekly Update', sender: 'Hillside', body: 'Picture Day Thursday', members, todayYmd: '2026-09-02' })
    expect(p).toContain('Picture Day Thursday')
    expect(p).toContain('Children: Liam, Mia')
    expect(p).toContain('Adults: Jess')
    expect(p).toContain('2026-09-02')
    expect(p).toContain('strict JSON')
  })
})

describe('parseEmailExtraction', () => {
  it('parses a well-formed result and strips a code fence', () => {
    const raw = '```json\n' + JSON.stringify({
      events: [{ title: 'Picture Day', date: '2026-09-10', for: 'everyone',
        items: [{ text: 'Payment envelope', for: ['Liam'], needed: 'night_before' }],
        source_quote: 'Picture Day is Thursday.', confidence: 0.92 }],
      todos: [{ title: 'Sign field trip form', due: '2026-09-15', source_quote: 'Forms due', confidence: 0.8 }],
      good_to_know: ['Early dismissal Friday'],
      gaps: [],
    }) + '\n```'
    const r = parseEmailExtraction(raw)
    expect(r.events).toHaveLength(1)
    expect(r.events[0].items[0].needed).toBe('night_before')
    expect(r.todos[0].due).toBe('2026-09-15')
    expect(r.good_to_know).toEqual(['Early dismissal Friday'])
  })
  it('drops an event without a valid date and an item without text', () => {
    const r = parseEmailExtraction(JSON.stringify({
      events: [
        { title: 'Vague thing', date: 'Thursday', for: 'everyone', items: [], source_quote: 'x', confidence: 0.9 },
        { title: 'Real', date: '2026-09-10', for: ['Mia'], items: [{ text: '', for: 'everyone', needed: 'day_of' }], source_quote: 'y', confidence: 0.9 },
      ], todos: [], good_to_know: [], gaps: [],
    }))
    expect(r.events).toHaveLength(1)
    expect(r.events[0].items).toEqual([])
  })
  it('clamps confidence and normalises needed', () => {
    const r = parseEmailExtraction(JSON.stringify({
      events: [{ title: 'A', date: '2026-09-10', for: 'everyone',
        items: [{ text: 'Bring hat', for: 'everyone', needed: 'whenever' }], source_quote: 'q', confidence: 7 }],
      todos: [], good_to_know: [], gaps: [],
    }))
    expect(r.events[0].confidence).toBe(1)
    expect(r.events[0].items[0].needed).toBe('day_of')
  })
  it('returns an empty extraction on garbage', () => {
    expect(parseEmailExtraction('not json at all')).toEqual({ events: [], todos: [], good_to_know: [], gaps: [] })
  })
})
