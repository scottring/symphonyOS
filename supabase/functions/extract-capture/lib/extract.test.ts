import { describe, it, expect } from 'vitest'
import { buildExtractPrompt, parseExtractResponse } from './extract'

describe('buildExtractPrompt', () => {
  it('includes the body and asks for strict JSON', () => {
    const p = buildExtractPrompt('Eleanor party Sat 2pm, RSVP to mom', 'whatsapp:3B Parents')
    expect(p).toContain('Eleanor party Sat 2pm')
    expect(p).toContain('whatsapp:3B Parents')
    expect(p).toContain('strict JSON')
  })
})

describe('parseExtractResponse', () => {
  it('parses a well-formed result', () => {
    const raw = JSON.stringify({
      candidates: [{ category: 'event', title: "Eleanor's birthday", startTime: '2026-06-06T14:00:00',
        location: '123 Main St', rsvp: { needed: true, to: 'mom' }, giftsExpected: 'books',
        cost: null, forWho: 'Ella', confidence: 0.9 }],
      summary: 'Mostly logistics chatter.',
      gaps: [],
    })
    const r = parseExtractResponse(raw)
    expect(r.candidates).toHaveLength(1)
    expect(r.candidates[0].title).toBe("Eleanor's birthday")
    expect(r.summary).toBe('Mostly logistics chatter.')
  })

  it('strips code fences', () => {
    const r = parseExtractResponse('```json\n{"candidates":[],"summary":"none","gaps":[]}\n```')
    expect(r.candidates).toEqual([])
    expect(r.summary).toBe('none')
  })

  it('returns an empty result on malformed JSON', () => {
    const r = parseExtractResponse('not json')
    expect(r).toEqual({ candidates: [], summary: '', gaps: [] })
  })

  it('drops candidates missing required fields', () => {
    const raw = JSON.stringify({ candidates: [{ title: 'no category' }, { category: 'task', title: 'ok', confidence: 0.5 }], summary: 's', gaps: [] })
    const r = parseExtractResponse(raw)
    expect(r.candidates.map((c) => c.title)).toEqual(['ok'])
  })

  it('extracts the JSON object even when wrapped in prose', () => {
    const raw = 'Here is the result:\n{"candidates":[{"category":"task","title":"ok","confidence":0.5}],"summary":"s","gaps":[]}\nHope that helps!'
    const r = parseExtractResponse(raw)
    expect(r.candidates.map((c) => c.title)).toEqual(['ok'])
    expect(r.summary).toBe('s')
  })
})
