import { describe, expect, it } from 'vitest'
import { MAX_SUGGESTION, buildUserContent, parseSuggestBody, suggestionsFromResponse, tidy, type SuggestBody } from './prompt'

const body = {
  level: 'month', area: 'Health', period: 'December', today: '2026-11-17',
  above: [{ level: 'season', title: 'Come up with a nutrition plan' }, { level: 'year', title: 'Get back to 175 pounds' }],
  have: ['Meet with Kristen'],
}

describe('parseSuggestBody', () => {
  it('reads a whole request', () => {
    expect(parseSuggestBody(body)).toEqual(body)
  })
  it('tidies spaces, drops what it does not know, and keeps optional parts optional', () => {
    const parsed = parseSuggestBody({ level: 'week', above: [{ level: 'month', title: '  Book   the plumber ' }], period: 'this week', extra: 1 })
    expect(parsed).toEqual({ level: 'week', area: null, above: [{ level: 'month', title: 'Book the plumber' }], period: 'this week', today: null, have: [] })
  })
  it.each([
    [null], [{}], [{ ...body, level: 'year' }], [{ ...body, level: 'today' }], [{ ...body, above: [] }],
    [{ ...body, above: new Array(5).fill(body.above[0]) }], [{ ...body, above: [{ level: 'season', title: '' }] }],
    [{ ...body, above: [{ level: 'decade', title: 'x' }] }], [{ ...body, above: [{ level: 'year', title: 'x'.repeat(201) }] }],
    [{ ...body, period: '' }], [{ ...body, period: 'x'.repeat(41) }],
  ])('refuses %j', (bad) => {
    expect(parseSuggestBody(bad)).toHaveProperty('error')
  })
  it('ignores a day it cannot read and keeps at most twelve of what they have', () => {
    const parsed = parseSuggestBody({ ...body, today: 'tomorrow', have: Array.from({ length: 20 }, (_, i) => `goal ${i}`) }) as SuggestBody
    expect(parsed.today).toBeNull()
    expect(parsed.have).toHaveLength(12)
  })
})

describe('buildUserContent', () => {
  it('reads from the year down to the goal the question is about', () => {
    expect(buildUserContent(parseSuggestBody(body) as SuggestBody)).toBe([
      'Area of life: Health',
      'Their year goal: Get back to 175 pounds',
      'Their season goal: Come up with a nutrition plan',
      'The question is about: Come up with a nutrition plan',
      'They are choosing goals for: December (one month)',
      'They already have: Meet with Kristen',
      'Today is Tuesday, 2026-11-17.',
    ].join('\n'))
  })
  it('leaves out what it was not given', () => {
    const b = parseSuggestBody({ level: 'season', above: [{ level: 'year', title: 'Run a 5K' }], period: 'this winter' }) as SuggestBody
    expect(buildUserContent(b)).toBe('Their year goal: Run a 5K\nThe question is about: Run a 5K\nThey are choosing goals for: this winter (a season, about three months)')
  })
})

const reply = (suggestions: unknown, extra: Record<string, unknown> = {}) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: JSON.stringify({ suggestions }) }],
  ...extra,
})

describe('suggestionsFromResponse', () => {
  it('reads the text block wherever it stands', () => {
    expect(suggestionsFromResponse(reply(['Lose 5 pounds by March', 'Weigh in every Friday', 'Pick a food log to use'])))
      .toEqual(['Lose 5 pounds by March', 'Weigh in every Friday', 'Pick a food log to use'])
  })
  it('tidies each one, and drops the too long, the repeats and what they already have', () => {
    expect(suggestionsFromResponse(reply(['"Weigh in every Friday."', 'weigh in every friday', 'x'.repeat(MAX_SUGGESTION + 1), 'Meet with Kristen', 7, 'Log meals   for a week']), ['meet with kristen']))
      .toEqual(['Weigh in every Friday', 'Log meals for a week'])
  })
  it('keeps three at most', () => {
    expect(suggestionsFromResponse(reply(['One thing', 'Two things', 'Three things', 'Four things']))).toHaveLength(3)
  })
  it.each([
    [null], [{}], [reply([])], [reply(['', ' '])], [reply('no')], [{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }],
    [reply(['Lose 5 pounds'], { stop_reason: 'refusal' })], [{ stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '' }] }],
  ])('is null for %j', (bad) => {
    expect(suggestionsFromResponse(bad)).toBeNull()
  })
})

describe('tidy', () => {
  it('keeps a plain line as it is', () => {
    expect(tidy('Call the plumber on Monday')).toBe('Call the plumber on Monday')
  })
  it('is null for what is not a line', () => {
    expect(tidy(null)).toBeNull()
    expect(tidy('ab')).toBeNull()
  })
})
