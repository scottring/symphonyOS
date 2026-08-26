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
    expect(r).toEqual({ candidates: [], summary: '', announcements: [], gaps: [] })
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


describe('announcements — what matters but cannot be done', () => {
  // A school thread carries three kinds of content: things to do, things you
  // must KNOW (attendance rules, dismissal procedure, curriculum changes),
  // and chatter. Only the first should become a task. The second used to be
  // compressed into the one-sentence noise summary and effectively vanished —
  // which is how "students arriving after 7:36 a.m. will be marked late" went
  // unseen. It now comes back named.
  it('parses announcements out of the response', () => {
    const out = parseExtractResponse(JSON.stringify({
      candidates: [],
      summary: 'Teachers shared classroom videos.',
      announcements: [
        'Students arriving after 7:36 a.m. are marked late.',
        'Third graders meeting siblings dismiss out the front door.',
      ],
      gaps: [],
    }))
    expect(out.announcements).toEqual([
      'Students arriving after 7:36 a.m. are marked late.',
      'Third graders meeting siblings dismiss out the front door.',
    ])
  })

  it('defaults to none when the model omits the field', () => {
    expect(parseExtractResponse(JSON.stringify({ candidates: [], summary: 'x' })).announcements).toEqual([])
  })

  it('keeps only strings, so a malformed entry cannot reach the note', () => {
    const out = parseExtractResponse(JSON.stringify({
      candidates: [], summary: '', announcements: ['real', 42, null, { a: 1 }],
    }))
    expect(out.announcements).toEqual(['real'])
  })

  it('asks for announcements separately from the noise summary', () => {
    const prompt = buildExtractPrompt('body', 'label')
    expect(prompt).toMatch(/announcements/)
  })
})

describe('who sent it', () => {
  it('carries the sender through to the candidate', () => {
    const out = parseExtractResponse(JSON.stringify({
      candidates: [{ category: 'task', title: 'Bring a pouch', confidence: 0.9, from: 'Ms. Rozanc' }],
      summary: '', gaps: [],
    }))
    expect(out.candidates[0]!.from).toBe('Ms. Rozanc')
  })

  it('asks the model who posted each item', () => {
    expect(buildExtractPrompt('body', 'label')).toMatch(/who (posted|sent)/i)
  })
})
