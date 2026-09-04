import { describe, it, expect } from 'vitest'
import { planWrites, titlesMatch, itemsMatch, sameAudience, MIN_EVENT_CONFIDENCE } from './plan'
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
    { text: 'Payment envelope in backpack', for: ['Liam'], needed: 'night_before' as const, kind: 'todo' as const },
    { text: 'Wear school colors', for: 'everyone' as const, needed: 'day_of' as const, kind: 'todo' as const },
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
      { title: 'Return the field trip form', due: '2026-09-15', for: ['Liam'], kind: 'todo', source_quote: 'Forms due 9/15', confidence: 0.8 },
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
    const p = planWrites({ ...base, extraction: { ...empty, good_to_know: [{ text: 'Early dismissal Friday', for: 'everyone' }], gaps: [{ kind: 'truncated', note: 'Email cut off' }] } })
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

describe('planWrites — homework and notices', () => {
  it('a homework item becomes a homework subtask with the detail in its notes', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay({ items: [
      { text: 'Return permission slip', for: ['Liam'], needed: '2026-09-08', kind: 'homework', detail: 'Aquarium trip, $12, to the front office' },
    ] })] } })
    const [c] = p.events[0].children
    expect(c).toMatchObject({ category: 'homework', assigned_to: 'k1', needed_on: '2026-09-08' })
    expect(c.notes).toBe('From Hillside Elementary · Weekly Update\n\nAquarium trip, $12, to the front office')
  })

  it('a plain item without detail keeps notes null and category task', () => {
    const p = planWrites({ ...base, extraction: { ...empty, events: [pictureDay()] } })
    expect(p.events[0].children[0]).toMatchObject({ category: 'task', notes: null })
  })

  it('a homework todo is a homework inbox row with detail after the source line', () => {
    const p = planWrites({ ...base, extraction: { ...empty, todos: [
      { title: 'Reading log', due: '2026-09-11', for: ['Mia'], kind: 'homework', detail: 'Sign each night', source_quote: 'Logs due Friday', confidence: 0.8 },
    ] } })
    expect(p.inbox[0]).toMatchObject({ category: 'homework', assigned_to: 'k2', needed_on: '2026-09-11' })
    expect(p.inbox[0].notes).toBe('From Hillside Elementary · Weekly Update\n\nSign each night\n\n“Logs due Friday”')
  })

  it('good_to_know fans out into notices per member; everyone and strangers → null member', () => {
    const p = planWrites({ ...base, extraction: { ...empty, good_to_know: [
      { text: 'PE is Tue/Thu', for: ['Liam', 'Mia'] },
      { text: 'Early dismissal Friday', for: 'everyone' },
      { text: 'Ask Ms. Park', for: ['Nobody'] },
    ] } })
    const row = (family_member_id: string | null, text: string) =>
      ({ user_id: 'u1', family_member_id, text, sender_label: 'Hillside Elementary', received_on: '2026-09-02', capture_id: 'cap1' })
    expect(p.notices).toEqual([
      row('k1', 'PE is Tue/Thu'), row('k2', 'PE is Tue/Thu'), row(null, 'Early dismissal Friday'), row(null, 'Ask Ms. Park'),
    ])
    expect(p.note?.content).toContain('- PE is Tue/Thu')
  })

  it('no good_to_know → no notices', () => {
    expect(planWrites({ ...base, extraction: empty }).notices).toEqual([])
  })
})

describe('planWrites — class-wide homework is every child\'s', () => {
  const todo = (over: Record<string, unknown>) => ({
    title: 'Return blue planning sheet', due: '2026-09-04', kind: 'homework', source_quote: 'q', confidence: 0.9, ...over,
  })
  const run = (t: Record<string, unknown>) =>
    planWrites({ ...base, extraction: { events: [], todos: [todo(t) as never], good_to_know: [], gaps: [] } })

  // ONE row carrying every child, not one row per child. Per-child rows put
  // every class-wide instruction on Today once per kid, and — because the
  // cross-capture dedupe compares audiences — made the same sheet arriving
  // from each kid's teacher look like two different instructions. The wall
  // reads assigned_to_all and still gives each kid the row on their own track.
  it('with no name, one row carrying every child', () => {
    const rows = run({}).inbox
    expect(rows).toHaveLength(1)
    expect(rows[0].assigned_to).toBeNull()
    expect([...(rows[0].assigned_to_all ?? [])].sort()).toEqual(['k1', 'k2'])
    expect(rows[0].category).toBe('homework')
  })
  it('for "everyone", the same', () => {
    const rows = run({ for: 'everyone' }).inbox
    expect(rows).toHaveLength(1)
    expect([...(rows[0].assigned_to_all ?? [])].sort()).toEqual(['k1', 'k2'])
  })
  it('several named children are one row naming both', () => {
    const rows = run({ for: ['Liam', 'Mia'] }).inbox
    expect(rows).toHaveLength(1)
    expect([...(rows[0].assigned_to_all ?? [])].sort()).toEqual(['k1', 'k2'])
  })
  it('one named child is still that child\'s own row', () => {
    const rows = run({ for: ['Mia'] }).inbox
    expect(rows.map((r) => r.assigned_to)).toEqual(['k2'])
    expect(rows[0].assigned_to_all ?? null).toBeNull()
  })
  it('a plain todo with no name stays one unassigned row', () => {
    expect(run({ kind: 'todo' }).inbox.map((r) => r.assigned_to)).toEqual([null])
  })
})

// The rule that let a duplicate through on 2026-09-04. Two teachers, two kids
// in mirror-image classes, the same sheet: the old check compared assignees
// for EQUALITY, so Ella's row and Kaleb's row were "different" instructions
// and Today showed both.
describe('sameAudience — one instruction, two teachers', () => {
  it('treats overlapping audiences as the same instruction', () => {
    expect(sameAudience({ assigned_to: 'ella' }, { assigned_to_all: ['ella', 'kaleb'] })).toBe(true)
    expect(sameAudience({ assigned_to_all: ['ella', 'kaleb'] }, { assigned_to: 'kaleb' })).toBe(true)
  })

  it('treats two class-wide rows, naming nobody, as the same instruction', () => {
    expect(sameAudience({ assigned_to: null }, { assigned_to: null })).toBe(true)
    expect(sameAudience({ assigned_to_all: [] }, {})).toBe(true)
  })

  it('keeps genuinely different people apart', () => {
    expect(sameAudience({ assigned_to: 'ella' }, { assigned_to: 'kaleb' })).toBe(false)
    expect(sameAudience({ assigned_to_all: ['ella'] }, { assigned_to_all: ['kaleb'] })).toBe(false)
  })

  // A named row and a class-wide row are NOT the same: "Ella: bring your
  // recorder" must not be swallowed by a class-wide row that happens to share
  // words with it.
  it('does not merge a named row into an unassigned one', () => {
    expect(sameAudience({ assigned_to: null }, { assigned_to: 'ella' })).toBe(false)
    expect(sameAudience({ assigned_to: 'ella' }, { assigned_to: null })).toBe(false)
  })

  it('prefers assigned_to_all over the legacy single column', () => {
    expect(sameAudience({ assigned_to: 'ella', assigned_to_all: ['kaleb'] }, { assigned_to: 'kaleb' })).toBe(true)
  })
})

// A standing instruction is not a task. "Send the take-home folder daily" as a
// dated row is wrong twice: left open it carries forward every day forever,
// and ticking it off claims the household is done sending the folder.
describe('planWrites — standing instructions become routines', () => {
  const todo = (over: Record<string, unknown>) => ({
    title: 'Send take-home folder', kind: 'todo', source_quote: 'send it daily', confidence: 0.9, ...over,
  })
  const run = (t: Record<string, unknown>) =>
    planWrites({ ...base, extraction: { events: [], todos: [todo(t) as never], good_to_know: [], gaps: [] } })

  it('writes a daily routine and no task row', () => {
    const plan = run({ repeat: { type: 'daily' } })
    expect(plan.inbox).toHaveLength(0)
    expect(plan.routines).toHaveLength(1)
    expect(plan.routines[0].recurrence_pattern).toEqual({ type: 'daily' })
    expect(plan.routines[0].name).toBe('Send take-home folder')
  })

  it('carries the named weekdays for a weekly instruction', () => {
    const plan = run({ repeat: { type: 'weekly', days: ['tue', 'thu'] } })
    expect(plan.routines[0].recurrence_pattern).toEqual({ type: 'weekly', days: ['tue', 'thu'] })
  })

  it('leaves the time unset, so Today files it under Unscheduled', () => {
    expect(run({ repeat: { type: 'daily' } }).routines[0].time_of_day).toBeNull()
  })

  it('is family-scoped so the whole household can see the chore', () => {
    const r = run({ repeat: { type: 'daily' } }).routines[0]
    expect(r.context).toBe('family')
    expect(r.scope).toBe('compound')
  })

  it('names one child when the instruction names one, and all of them otherwise', () => {
    expect(run({ repeat: { type: 'daily' }, for: ['Mia'] }).routines[0].assigned_to).toBe('k2')
    const classWide = run({ repeat: { type: 'daily' } }).routines[0]
    expect(classWide.assigned_to).toBeNull()
    expect([...(classWide.assigned_to_all ?? [])].sort()).toEqual(['k1', 'k2'])
  })

  // The whole point: without a repeat it stays a task, so nothing that is
  // genuinely done once becomes a chore the household sees every day.
  it('leaves a one-off todo as a task', () => {
    const plan = run({})
    expect(plan.routines).toHaveLength(0)
    expect(plan.inbox).toHaveLength(1)
  })
})
