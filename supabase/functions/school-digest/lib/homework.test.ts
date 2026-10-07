import { describe, it, expect } from 'vitest'
import { buildHomeworkPrompt, parseHomework, planHomework, nextSchoolDay, type HomeworkItem } from './homework.ts'
import type { Member } from '../../extract-email/lib/types.ts'

const members: Member[] = [
  { id: 'scott', name: 'Scott Kaufman', isChild: false },
  { id: 'iris', name: 'Iris Leviner', isChild: false },
  { id: 'ella', name: 'Ella', isChild: true },
  { id: 'kaleb', name: 'Kaleb', isChild: true },
]
const TODAY = '2026-10-07' // a Wednesday

const item = (over: Partial<HomeworkItem>): HomeworkItem => ({
  title: 'Reading log', for: ['Ella'], due: '2026-10-09', source: 'HEMs Third Graders',
  source_quote: 'Reading logs are due Friday.', confidence: 0.9, ...over,
})

describe('parseHomework', () => {
  it('reads the list, drops empty titles, and treats omit as absent', () => {
    const raw = 'Here you go:\n' + JSON.stringify({ homework: [
      { title: 'Spelling test — study list 5', for: ['Kaleb'], due: '2026-10-09', detail: 'omit', source: 'ClassDojo · Ms. R', source_quote: 'Test Friday', confidence: 0.8 },
      { title: '', for: 'everyone' },
      { title: 'Math worksheet p. 12', for: 'everyone', due: 'omit', confidence: 0.7 },
    ] })
    const out = parseHomework(raw)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ title: 'Spelling test — study list 5', for: ['Kaleb'], due: '2026-10-09', detail: undefined })
    expect(out[1]).toMatchObject({ for: 'everyone', due: undefined })
  })

  it('returns nothing for anything that is not the expected JSON', () => {
    expect(parseHomework('no work today')).toEqual([])
    expect(parseHomework('{"homework": "none"}')).toEqual([])
  })
})

describe('planHomework', () => {
  const plan = (items: HomeworkItem[], existing: Parameters<typeof planHomework>[0]['existing'] = []) =>
    planHomework({ items, members, userId: 'scott', todayYmd: TODAY, existing })

  it('gives each piece of work to its child, dated the day it is due, as family homework', () => {
    const [row] = plan([item({})])
    expect(row).toMatchObject({
      title: 'Reading log', category: 'homework', context: 'family', scope: 'compound',
      bucket: 'timed', is_all_day: true, needed_on: '2026-10-09', assigned_to: 'ella', assigned_to_all: null,
    })
    expect(row.scheduled_for.startsWith('2026-10-09')).toBe(true)
    expect(row.notes).toContain('HEMs Third Graders')
  })

  it('puts class-wide work on both kids as one row', () => {
    const [row] = plan([item({ for: 'everyone' })])
    expect(row).toMatchObject({ assigned_to: null, assigned_to_all: ['ella', 'kaleb'] })
  })

  it('never pins work on an adult or a name it does not know', () => {
    expect(plan([item({ for: ['Scott'] })])).toEqual([])
    expect(plan([item({ for: ['Maya'] })])).toEqual([])
  })

  it('skips work already open for the same child, and repeats within the same day', () => {
    expect(plan([item({})], [{ title: 'Reading log due Friday', assigned_to: 'ella' }])).toEqual([])
    expect(plan([item({})], [{ title: 'Reading log', assigned_to: 'kaleb' }])).toHaveLength(1)
    expect(plan([item({}), item({ title: 'Reading log!' })])).toHaveLength(1)
  })

  it('drops a guess, and dates undated or past work for the next school day', () => {
    expect(plan([item({ confidence: 0.4 })])).toEqual([])
    expect(plan([item({ due: undefined })])[0].needed_on).toBe('2026-10-08')
    expect(plan([item({ due: '2026-10-01' })])[0].needed_on).toBe('2026-10-08')
  })
})

describe('nextSchoolDay', () => {
  it('skips the weekend', () => {
    expect(nextSchoolDay('2026-10-09')).toBe('2026-10-12') // Fri → Mon
    expect(nextSchoolDay('2026-10-07')).toBe('2026-10-08')
  })
})

describe('buildHomeworkPrompt', () => {
  it('names the children, today, and the transcripts', () => {
    const p = buildHomeworkPrompt([{ label: 'ClassDojo · Ms. R', text: 'Spelling test Friday!' }], members, TODAY, 'Wednesday')
    expect(p).toContain('CHILDREN: Ella, Kaleb')
    expect(p).toContain('Wednesday 2026-10-07')
    expect(p).toContain('### ClassDojo · Ms. R\nSpelling test Friday!')
  })
})
