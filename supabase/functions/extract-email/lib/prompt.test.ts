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

  it('asks for a truncated gap only when the body was cut', () => {
    const args = { subject: 'Weekly Update', sender: 'Hillside', body: 'Picture Day Thursday', members, todayYmd: '2026-09-02' }
    expect(buildEmailPrompt(args)).not.toContain('emit a gap of kind truncated')
    expect(buildEmailPrompt({ ...args, truncated: true })).toContain('The email was truncated at the end; emit a gap of kind truncated.')
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
    expect(r.good_to_know).toEqual([{ text: 'Early dismissal Friday', for: 'everyone' }])
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
  it('treats an echoed "omit" placeholder as absent', () => {
    const r = parseEmailExtraction(JSON.stringify({
      events: [{ title: 'A', date: '2026-09-10', time: 'omit', location: 'omit', for: 'everyone', items: [], source_quote: 'q', confidence: 0.9 }],
      todos: [], good_to_know: [], gaps: [],
    }))
    expect(r.events[0].location).toBeUndefined()
    expect(r.events[0].time).toBeUndefined()
  })
  it('returns an empty extraction on garbage', () => {
    expect(parseEmailExtraction('not json at all')).toEqual({ events: [], todos: [], good_to_know: [], gaps: [] })
  })
})

describe('parseEmailExtraction — homework, detail, addressed good_to_know', () => {
  it('reads kind and detail on todos and items; unknown kind is a todo', () => {
    const r = parseEmailExtraction(JSON.stringify({
      events: [{ title: 'Field trip', date: '2026-09-10', for: 'everyone',
        items: [{ text: 'Return permission slip', for: ['Liam'], needed: 'night_before', kind: 'homework', detail: 'Aquarium, $12' },
                { text: 'Pack lunch', for: 'everyone', needed: 'day_of', kind: 'what' }],
        source_quote: 'q', confidence: 0.9 }],
      todos: [{ title: 'Reading log', kind: 'homework', detail: 'omit', source_quote: 'q', confidence: 0.8 },
              { title: 'Pay fee', source_quote: 'q', confidence: 0.8 }],
      good_to_know: [], gaps: [],
    }))
    expect(r.events[0].items.map((i) => [i.kind, i.detail])).toEqual([['homework', 'Aquarium, $12'], ['todo', undefined]])
    expect(r.todos.map((t) => [t.kind, t.detail])).toEqual([['homework', undefined], ['todo', undefined]])
  })

  it('good_to_know accepts strings (everyone) and addressed objects', () => {
    const r = parseEmailExtraction(JSON.stringify({ events: [], todos: [], gaps: [],
      good_to_know: ['Early dismissal Friday', { text: 'PE is Tue/Thu', for: ['Liam'] }, { text: '' }, 7] }))
    expect(r.good_to_know).toEqual([{ text: 'Early dismissal Friday', for: 'everyone' }, { text: 'PE is Tue/Thu', for: ['Liam'] }])
  })

  it('the prompt asks for kind, detail and addressed good_to_know', () => {
    const p = buildEmailPrompt({ subject: 's', sender: 'x', body: 'b', members, todayYmd: '2026-09-02' })
    expect(p).toContain('"kind":"homework|todo"')
    expect(p).toContain('"detail":"...|omit"')
    expect(p).toContain('"good_to_know":[{"text":"...","for":["Name"]|"everyone"}]')
  })
})
