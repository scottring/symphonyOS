import { describe, it, expect } from 'vitest'
import { planWrites, titlesMatch, itemsMatch, MIN_EVENT_CONFIDENCE } from './plan'
import type { EmailExtraction, Member } from './types'

const members: Member[] = [
  { id: 'p1', name: 'Jess', isChild: false },
  { id: 'p2', name: 'Sam', isChild: false },
  { id: 'k1', name: 'Liam', isChild: true },
  { id: 'k2', name: 'Mia', isChild: true },
]
const capture = { id: 'cap1', user_id: 'u1', subject: 'Weekly Update', sender_label: 'Hillside Elementary' }
const base = { members, todayYmd: '2026-09-02', tz: 'America/New_York', capture, existing: [] }
const empty: EmailExtraction = { events: [], todos: [], good_to_know: [], gaps: [] }

const pictureDay = (over: Partial<EmailExtraction['events'][number]> = {}) => ({
  title: 'School Picture Day', date: '2026-09-10', for: 'everyone' as const,
  items: [
    { text: 'Payment envelope in backpack', for: ['Liam'], needed: 'night_before' as const },
    { text: 'Wear school colors', for: 'everyone' as const, needed: 'day_of' as const },
  ],
  source_quote: 'Students should bring payment and wear school colors on Thursday.',
  confidence: 0.92, ...over,
})

describe('planWrites — a dated event', () => {
  it('becomes one all-day family block on its date with the source in notes', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay()] } })
    expect(p.events).toHaveLength(1)
    const parent = p.events[0].parent
    expect('row' in parent).toBe(true)
    if (!('row' in parent)) return
    expect(parent.row).toMatchObject({
      user_id: 'u1', title: 'School Picture Day', bucket: 'timed', category: 'event',
      context: 'family', scope: 'compound', is_all_day: true, capture_id: 'cap1',
      assigned_to: null, assigned_to_all: ['k1', 'k2'], parent_task_id: null, needed_on: null,
    })
    expect(parent.row.scheduled_for).toBe('2026-09-10T04:00:00.000Z')
    expect(parent.row.notes).toContain('From Hillside Elementary · Weekly Update')
    expect(parent.row.notes).toContain('Students should bring payment')
  })
  it('keeps a stated time and is not all-day', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay({ time: '15:30' })] } })
    const parent = p.events[0].parent
    if (!('row' in parent)) throw new Error('expected new row')
    expect(parent.row.scheduled_for).toBe('2026-09-10T19:30:00.000Z')
    expect(parent.row.is_all_day).toBe(false)
  })
  it('fans items out per child with needed_on night-before / day-of', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay()] } })
    const kids = p.events[0].children
    expect(kids.map((c) => [c.title, c.assigned_to, c.needed_on])).toEqual([
      ['Payment envelope in backpack', 'k1', '2026-09-09'],
      ['Wear school colors', 'k1', '2026-09-10'],
      ['Wear school colors', 'k2', '2026-09-10'],
    ])
    for (const c of kids) expect(c).toMatchObject({ bucket: 'inbox', category: 'task', context: 'family', scope: 'compound', capture_id: 'cap1', assigned_to_all: null })
  })
  it('a single named child becomes the parent assignee', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay({ for: ['Mia'], items: [] })] } })
    const parent = p.events[0].parent
    if (!('row' in parent)) throw new Error('expected new row')
    expect(parent.row.assigned_to).toBe('k2')
    expect(parent.row.assigned_to_all).toBeNull()
  })
  it('an unmatched name stays in the item text, unassigned', () => {
    const ev = pictureDay({ items: [{ text: 'Bring a snack', for: ["Ms. Reyes' class"], needed: 'day_of' }] })
    const p = planWrites({ ...base, extraction: { ...empty, events: [ev] } })
    expect(p.events[0].children).toEqual([expect.objectContaining({ title: "Bring a snack — Ms. Reyes' class", assigned_to: null })])
  })
})

describe('planWrites — what goes to inbox instead', () => {
  it('a low-confidence event goes to inbox with its quote, never dropped', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay({ confidence: MIN_EVENT_CONFIDENCE - 0.01 })] } })
    expect(p.events).toEqual([])
    expect(p.inbox).toHaveLength(1)
    expect(p.inbox[0]).toMatchObject({ title: 'School Picture Day', bucket: 'inbox', scheduled_for: null, capture_id: 'cap1' })
    expect(p.inbox[0].notes).toContain('2026-09-10')
  })
  it('keeps the stated time in the why line', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay({ time: '15:30', confidence: MIN_EVENT_CONFIDENCE - 0.01 })] } })
    expect(p.inbox[0].notes).toContain('Dated 2026-09-10 15:30 (')
  })
  it('an event more than a day in the past goes to inbox', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay({ date: '2026-08-30' })] } })
    expect(p.events).toEqual([])
    expect(p.inbox).toHaveLength(1)
  })
  it('yesterday still places (the email may have arrived late)', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay({ date: '2026-09-01' })] } })
    expect(p.events).toHaveLength(1)
  })
  it('todos become inbox tasks, assigned when they name one member', () => {
    const p = planWrites({ ...base, extraction: { ...empty, todos: [
      { title: 'Return the field trip form', due: '2026-09-15', for: ['Liam'], source_quote: 'Forms due 9/15', confidence: 0.8 },
    ] } })
    expect(p.inbox[0]).toMatchObject({ title: 'Return the field trip form', assigned_to: 'k1', needed_on: '2026-09-15', bucket: 'inbox' })
  })
})

describe('planWrites — dedupe against existing blocks', () => {
  it('attaches only new items to a matching existing block', () => {
    const existing = [{ id: 'old1', title: 'School Picture Day!', ymd: '2026-09-10', childTitles: ['Wear school colors'] }]
    const p = planWrites({ ...base, existing, extraction: { ...empty, events: [pictureDay()] } })
    expect(p.events[0].parent).toEqual({ existingId: 'old1' })
    expect(p.events[0].children.map((c) => c.title)).toEqual(['Payment envelope in backpack'])
  })
  it('does not match a different date', () => {
    const existing = [{ id: 'old1', title: 'School Picture Day', ymd: '2026-09-17', childTitles: [] }]
    const p = planWrites({ ...base, existing, extraction: { ...empty, events: [pictureDay()] } })
    expect('row' in p.events[0].parent).toBe(true)
  })
})

describe('planWrites — the note', () => {
  it('writes one note with good-to-know and gaps, none when both are empty', () => {
    const p = planWrites({ ...base, extraction: { ...empty, good_to_know: ['Early dismissal Friday'], gaps: [{ kind: 'truncated', note: 'Email cut off' }] } })
    expect(p.note).toMatchObject({ user_id: 'u1', title: 'From Hillside Elementary: Weekly Update', context: 'family', scope: 'compound', source: 'import', type: 'general', external_id: 'capture:cap1' })
    expect(p.note?.content).toContain('Good to know:\n- Early dismissal Friday')
    expect(p.note?.content).toContain('Needs another look:\n- Email cut off')
    expect(planWrites({ ...base, extraction: empty }).note).toBeNull()
  })
})

describe('itemsMatch', () => {
  it('treats a re-phrased item as the same item', () => {
    expect(itemsMatch('bring payment envelope', 'Payment envelope in backpack')).toBe(true)
    expect(itemsMatch('Wear school colors', 'school colors laid out')).toBe(true)
    expect(itemsMatch('Bring a hat', 'Payment envelope')).toBe(false)
  })
  it('a retry does not duplicate a re-phrased child under an existing block', () => {
    const existing = [{ id: 'old1', title: 'School Picture Day', ymd: '2026-09-10', childTitles: ['bring payment envelope', 'school colors laid out'] }]
    const p = planWrites({ ...base, existing, extraction: { ...empty, events: [pictureDay()] } })
    expect(p.events).toEqual([])
  })
})

describe('titlesMatch', () => {
  it('ignores case and punctuation and tolerates one extra word', () => {
    expect(titlesMatch('School Picture Day!', 'school picture day')).toBe(true)
    expect(titlesMatch('Picture Day', 'School Picture Day')).toBe(false)   // 2/3 < 0.8
    expect(titlesMatch('Fall Concert', 'Spring Concert')).toBe(false)
  })
})
