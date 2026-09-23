import { describe, it, expect } from 'vitest'
import {
  ANALYSIS_SCHEMA, REVISION_SCHEMA, buildAnalysisPrompt, buildRevisionPrompt, normalizeAnalysis,
  classifyModelHttpError, isOwnPagePath, boundContext, LIMITS, applyRevision, type PlanContext,
} from './plan'

const ctx: PlanContext = {
  today: '2026-09-23',
  year: 2026,
  seasons: [{ label: 'Fall 2026', start: '2026-09-01', end: '2026-12-31' }],
  members: [{ id: 'm1', name: 'Ada', role: 'parent' }],
  yearGoals: [{ id: 'g1', title: 'Read together more' }],
  periodGoals: [],
  openTasks: [{ id: 't1', title: 'Buy a rain barrel', placement: 'month' }],
  routines: [],
}

/** Structured outputs require every object to close its properties and require all of them. */
function everyObjectIsStrict(node: unknown): boolean {
  if (!node || typeof node !== 'object') return true
  const n = node as Record<string, unknown>
  if (n.type === 'object') {
    const keys = Object.keys(n.properties as object)
    if (n.additionalProperties !== false) return false
    if (JSON.stringify([...(n.required as string[])].sort()) !== JSON.stringify([...keys].sort())) return false
  }
  return Object.values(n).every(everyObjectIsStrict)
}

describe('plan-from-paper schema', () => {
  it('is valid for structured outputs: every object closed, every property required', () => {
    expect(everyObjectIsStrict(ANALYSIS_SCHEMA)).toBe(true)
    expect(everyObjectIsStrict(REVISION_SCHEMA)).toBe(true)
  })

  it('uses no numeric or length constraints (unsupported by structured outputs)', () => {
    const text = JSON.stringify(ANALYSIS_SCHEMA)
    for (const k of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems']) expect(text).not.toContain(k)
  })
})

describe('prompts', () => {
  it('carries the user\'s explanation and the household\'s goals, tasks and seasons', () => {
    const p = buildAnalysisPrompt(ctx, 2, 'Left page is Fall, right page is October.')
    expect(p).toContain('Left page is Fall, right page is October.')
    expect(p).toContain('g1: Read together more')
    expect(p).toContain('t1: Buy a rain barrel')
    expect(p).toContain('Fall 2026: 2026-09-01 .. 2026-12-31')
    expect(p).toContain('are 2 images')
  })

  it('asks for verbatim transcription, never placing anything on a day, and routines only proposed', () => {
    const p = buildAnalysisPrompt(ctx, 1, null)
    expect(p).toMatch(/exactly as written/)
    expect(p).toMatch(/Never place anything on a specific day/)
    expect(p).toMatch(/will not be switched on/)
    expect(p).toMatch(/Do not force every task under a goal/)
  })

  it('revision keeps ids and original wording, and never claims to save', () => {
    const p = buildRevisionPrompt(ctx, null)
    expect(p).toMatch(/Keep item ids stable/)
    expect(p).toMatch(/"original" exactly as transcribed/)
    expect(p).toMatch(/never say it was saved/)
    expect(p).toMatch(/Return ONLY what changes/)
  })
})

describe('normalizeAnalysis', () => {
  it('keeps items, defaults title to the original words, and drops relationships that point nowhere', () => {
    const out = normalizeAnalysis({
      summary: 's', questions: ['q'],
      pages: [{ page: 1, image: 1, side: 'left', heading: 'Fall', period: { level: 'season', label: 'Fall', start: '2026-09-01', end: 'bad' }, lines: [{ id: 'p1-l1', text: 'Plan the garden', uncertain: false, uncertainty: null, struck: false }] }],
      items: [
        { id: 'a', kind: 'goal', original: 'Plan the garden', title: '', page: 1, source_lines: ['p1-l1'], placement: { level: 'season', label: 'Fall', start: '2026-09-01' }, date_text: null, date: null, relationships: [], flags: [], routine: null, why: null },
        { id: 'b', kind: 'task', original: 'Draft garden plan', title: 'Draft garden plan', page: 2, source_lines: [], placement: { level: 'month', label: 'October', start: '2026-10-01' }, date_text: '9/21', date: 'not-a-date',
          relationships: [{ type: 'derived_from', target_kind: 'item', target_id: 'a', target_label: 'Plan the garden', reason: 'carried down' }, { type: 'supports', target_kind: 'item', target_id: 'zzz', target_label: '?', reason: '' }],
          flags: [{ type: 'uncertain_date', detail: 'year unclear', target_id: null }, { type: 'bogus', detail: '', target_id: null }], routine: null, why: null },
        { id: 'c', kind: 'task', original: '   ', title: '', page: 1, source_lines: [], placement: { level: 'month', label: '', start: null }, date_text: null, date: null, relationships: [], flags: [], routine: null, why: null },
      ],
    })
    expect(out.items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(out.items[0].title).toBe('Plan the garden')
    expect(out.items[1].relationships).toEqual([{ type: 'derived_from', target_kind: 'item', target_id: 'a', target_label: 'Plan the garden', reason: 'carried down' }])
    expect(out.items[1].flags.map((f) => f.type)).toEqual(['uncertain_date'])
    expect(out.items[1].date).toBeNull()
    expect(out.items[1].date_text).toBe('9/21')
    expect(out.pages[0].period.end).toBeNull()
  })

  it('makes duplicate item ids unique so edits and relationships stay unambiguous', () => {
    const item = { id: 'x', kind: 'task', original: 'One', title: 'One', page: 1, source_lines: [], placement: { level: 'month', label: '', start: null }, date_text: null, date: null, relationships: [], flags: [], routine: null, why: null }
    const out = normalizeAnalysis({ summary: '', pages: [], questions: [], items: [item, { ...item, original: 'Two', title: 'Two' }] })
    expect(new Set(out.items.map((i) => i.id)).size).toBe(2)
  })

  it('survives a reply that is not an object at all', () => {
    expect(normalizeAnalysis(null)).toEqual({ summary: '', pages: [], items: [], questions: [] })
  })
})

describe('applyRevision', () => {
  const base = normalizeAnalysis({
    summary: 's', questions: ['q1'],
    pages: [{ page: 1, image: 1, side: 'single', heading: 'Autumn', period: { level: 'season', label: 'Autumn', start: '2026-09-01', end: null },
      lines: [{ id: 'p1-l1', text: 'Plan the gardn', uncertain: true, uncertainty: 'last word', struck: false }, { id: 'p1-l2', text: 'Buy a rain barrel', uncertain: false, uncertainty: null, struck: false }] }],
    items: [
      { id: 'a', kind: 'goal', original: 'Plan the gardn', title: 'Plan the gardn', page: 1, source_lines: ['p1-l1'], placement: { level: 'season', label: 'Autumn', start: '2026-09-01' }, date_text: null, date: null, relationships: [], flags: [{ type: 'uncertain_handwriting', detail: 'gardn?', target_id: null }], routine: null, why: null },
      { id: 'b', kind: 'task', original: 'Buy a rain barrel', title: 'Buy a rain barrel', page: 1, source_lines: ['p1-l2'], placement: { level: 'season', label: 'Autumn', start: '2026-09-01' }, date_text: null, date: null, relationships: [{ type: 'supports', target_kind: 'item', target_id: 'a', target_label: 'Plan the gardn', reason: 'garden' }], flags: [], routine: null, why: null },
    ],
  })

  it('replaces changed items, appends new ones, drops removed ones and leaves the rest untouched', () => {
    const out = applyRevision(base, {
      upserts: [
        { ...base.items[0], title: 'Plan the garden', flags: [] },
        { ...base.items[1], id: 'c', original: 'Oil the gate', title: 'Oil the gate', relationships: [] },
      ],
      remove: [],
      line_fixes: [{ line_id: 'p1-l1', text: 'Plan the garden', uncertain: false }],
      questions: null,
    })
    expect(out.items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(out.items[0].title).toBe('Plan the garden')
    expect(out.items[0].flags).toEqual([])
    expect(out.items[1]).toEqual(base.items[1])
    expect(out.pages[0].lines[0]).toMatchObject({ text: 'Plan the garden', uncertain: false, uncertainty: null })
    expect(out.questions).toEqual(['q1'])
  })

  it('removing an item also drops relationships that pointed at it', () => {
    const out = applyRevision(base, { remove: ['a'], upserts: [], line_fixes: [], questions: [] })
    expect(out.items.map((i) => i.id)).toEqual(['b'])
    expect(out.items[0].relationships).toEqual([])
    expect(out.questions).toEqual([])
  })
})

describe('classifyModelHttpError', () => {
  it('marks busy/overloaded as retryable and oversize as too long', () => {
    expect(classifyModelHttpError(529).code).toBe('model_busy')
    expect(classifyModelHttpError(429).code).toBe('model_busy')
    expect(classifyModelHttpError(503).code).toBe('model_busy')
    expect(classifyModelHttpError(413).code).toBe('too_long')
    expect(classifyModelHttpError(400).code).toBe('bad_request')
  })
})

describe('access checks', () => {
  const me = '11111111-2222-3333-4444-555555555555'
  const other = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const imp = '99999999-8888-7777-6666-555555555555'

  it('accepts only the caller\'s own page images', () => {
    expect(isOwnPagePath(`${me}/paper-plan/${imp}/page-1.jpg`, me)).toBe(true)
    expect(isOwnPagePath(`${me}/paper-plan/${imp}/page-1-left.jpg`, me)).toBe(true)
  })

  it('refuses another user\'s folder, traversal, other folders and non-images', () => {
    expect(isOwnPagePath(`${other}/paper-plan/${imp}/page-1.jpg`, me)).toBe(false)
    expect(isOwnPagePath(`${me}/../${other}/paper-plan/${imp}/page-1.jpg`, me)).toBe(false)
    expect(isOwnPagePath(`${me}/paper-plan/${imp}/../../${other}/x.jpg`, me)).toBe(false)
    expect(isOwnPagePath(`${me}/page/${imp}.jpg`, me)).toBe(false)
    expect(isOwnPagePath(`${me}/paper-plan/${imp}/page-1.pdf`, me)).toBe(false)
    expect(isOwnPagePath(`${me}/paper-plan/${imp}/page-1.jpg?x=1`, me)).toBe(false)
    expect(isOwnPagePath(123, me)).toBe(false)
  })

  it('bounds the context the caller sends: rows, title length, required today', () => {
    expect(boundContext({})).toBeNull()
    expect(boundContext({ today: 'yesterday' })).toBeNull()
    const many = Array.from({ length: 1000 }, (_, i) => ({ id: `t${i}`, title: 'x'.repeat(5000), placement: 'month' }))
    const out = boundContext({ today: '2026-09-23', openTasks: many, members: [{ id: 'm', name: 'Ada', role: 7 }] })!
    expect(out.openTasks).toHaveLength(LIMITS.contextRows)
    expect(out.openTasks[0].title).toHaveLength(LIMITS.contextTitleChars)
    expect(out.members[0].role).toBeNull()
    expect(out.year).toBe(2026)
  })
})
