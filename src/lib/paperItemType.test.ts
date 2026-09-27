import { describe, it, expect } from 'vitest'
import { itemTypeOf, itemTypeProblem, normalizeForSave, withItemType, PAPER_ITEM_TYPES, type PaperItemType, type TypedItem } from './paperItemType'
import { planItemToAddTaskArgs, type PageAltitude, type PlanItem } from './planParse'

const row = (over: Partial<PlanItem> = {}): TypedItem => ({
  title: 'Swim lesson', placement: { kind: 'date', date: '2026-10-07' }, time: '16:30',
  assigneeId: 'm-iris', note: 'Bring goggles', dateHint: '2026-10-07', kind: 'task', category: 'task',
  recurring: null, phone: null, contactMemberId: 'm-mia', sourceId: 'src-1', ...over,
})

const TYPES: PaperItemType[] = PAPER_ITEM_TYPES.map((t) => t.id)
const SHARED = { title: 'Swim lesson', note: 'Bring goggles', assigneeId: 'm-iris', contactMemberId: 'm-mia', sourceId: 'src-1' }

describe('PAPER_ITEM_TYPES', () => {
  it('is the one five-way answer to "What is this?"', () => {
    expect(PAPER_ITEM_TYPES.map((t) => t.label)).toEqual(['Goal or project', 'Action / task', 'Appointment', 'Activity', 'Routine'])
  })
})

describe('withItemType', () => {
  // Every one of the 20 conversions keeps what the user wrote and chose, and
  // going back restores the where-and-when the row had.
  for (const from of TYPES) {
    for (const to of TYPES) {
      if (from === to) continue
      it(`${from} → ${to} → ${from} keeps title, note, person, lineage — and restores its own timing`, () => {
        const start = withItemType(row(), from, 'month')
        const there = withItemType(start, to, 'month')
        expect(itemTypeOf(there)).toBe(to)
        expect(there).toMatchObject(SHARED)
        const back = withItemType(there, from, 'month')
        expect(itemTypeOf(back)).toBe(from)
        expect(back).toMatchObject(SHARED)
        expect({ placement: back.placement, time: back.time, recurring: back.recurring })
          .toEqual({ placement: start.placement, time: start.time, recurring: start.recurring })
      })
    }
  }

  it('an action, appointment or activity keeps its day and time', () => {
    for (const to of ['appointment', 'activity'] as const) {
      expect(withItemType(row(), to, 'week')).toMatchObject({ placement: { kind: 'date', date: '2026-10-07' }, time: '16:30' })
    }
  })

  it('a dated line becomes a routine on its weekday, keeping its time', () => {
    const item = withItemType(row(), 'routine', 'week')
    expect(item.kind).toBe('recurring')
    expect(item.recurring).toEqual({ days: ['wed'], until: null })
    expect(item.time).toBe('16:30')
  })

  it('an undated line becomes a routine with no days yet — which blocks saving', () => {
    const item = withItemType(row({ placement: { kind: 'week' }, time: null }), 'routine', 'week')
    expect(item.recurring?.days).toEqual([])
    expect(itemTypeProblem(item)).toMatch(/days/)
  })

  it('a routine read off the page keeps its days through a round trip', () => {
    const r = row({ kind: 'recurring', category: undefined, recurring: { days: ['sat', 'sun'], until: null }, placement: { kind: 'week' } })
    const back = withItemType(withItemType(r, 'activity', 'week'), 'routine', 'week')
    expect(back.recurring?.days).toEqual(['sat', 'sun'])
    expect(back.placement).toEqual({ kind: 'week' })
  })

  it.each([
    ['year', { kind: 'goal' }, undefined],
    ['season', { kind: 'season' }, true],
    ['month', { kind: 'month' }, true],
    // A week holds actions: its goal is the month's.
    ['week', { kind: 'month' }, true],
  ] as const)('a goal on a %s page lands on its list, never a day', (altitude, placement, goal) => {
    const g = withItemType(row(), 'goal', altitude as PageAltitude)
    expect(itemTypeOf(g)).toBe('goal')
    expect(g.placement).toEqual(placement)
    expect(g.time).toBeNull()
    expect(g.recurring).toBeNull()
    if (goal) expect(g.goal).toBe(true)
  })

  it('a month or season goal made an action stays on that list', () => {
    const g = row({ placement: { kind: 'season' }, goal: true, time: null })
    const a = withItemType(g, 'task', 'season')
    expect(a).toMatchObject({ placement: { kind: 'season' }, goal: false, category: 'task' })
  })

  it('a year goal made an action goes to Someday (a year page has no days)', () => {
    const g = row({ placement: { kind: 'goal' }, time: null, category: undefined })
    expect(withItemType(g, 'task', 'year')).toMatchObject({ placement: { kind: 'someday' }, goal: false })
    expect(withItemType(g, 'routine', 'year').kind).toBe('recurring')
  })

  it('leaves day-facts alone', () => {
    const fact = row({ kind: 'dayfact', category: undefined })
    expect(withItemType(fact, 'routine', 'week')).toBe(fact)
  })
})

describe('itemTypeProblem', () => {
  it('an appointment needs a day; an action does not', () => {
    const undated = row({ placement: { kind: 'month' }, time: null })
    expect(itemTypeProblem(withItemType(undated, 'appointment', 'month'))).toMatch(/day/)
    expect(itemTypeProblem(withItemType(undated, 'activity', 'month'))).toBeNull()
    expect(itemTypeProblem(undated)).toBeNull()
    expect(itemTypeProblem(withItemType(undated, 'goal', 'month'))).toBeNull()
  })
})

describe('normalizeForSave', () => {
  it('drops a time that has no day to hang on, and a routine pattern on a task', () => {
    const r = withItemType(row({ placement: { kind: 'week' }, recurring: { days: ['mon'], until: null } }), 'appointment', 'week')
    expect(normalizeForSave({ ...r, kind: 'task' })).toMatchObject({ time: null, recurring: null, category: 'event' })
  })

  it('a routine carries no category and is never a goal', () => {
    const r = normalizeForSave(withItemType(row({ goal: true, placement: { kind: 'month' } }), 'routine', 'month'))
    expect(r).not.toHaveProperty('category')
    expect(r.goal).toBe(false)
  })

  it('a goal carries no day, time or pattern — and no drafts of other types', () => {
    const r = withItemType(withItemType(row(), 'routine', 'month'), 'goal', 'month')
    const saved = normalizeForSave(r)
    expect(saved).toMatchObject({ kind: 'task', placement: { kind: 'month' }, goal: true, time: null, recurring: null })
    expect(saved).not.toHaveProperty('typeDrafts')
  })

  it('a year goal saves as a goals row: goal placement, no list flag', () => {
    const saved = normalizeForSave(withItemType(row(), 'goal', 'year'))
    expect(saved.placement).toEqual({ kind: 'goal' })
    expect(saved).not.toHaveProperty('goal')
  })
})

describe('the chosen type reaches the addTask insert', () => {
  const ctx = { currentWeekStart: new Date(2026, 9, 5), monthStart: new Date(2026, 9, 1), seasonStart: new Date(2026, 8, 1), context: 'family' as const }
  it.each([['task', 'task'], ['appointment', 'event'], ['activity', 'activity']] as const)('%s → category %s', (type, category) => {
    const item = normalizeForSave(withItemType(row({ category: undefined }), type, 'week'))
    const args = planItemToAddTaskArgs(item, ctx)
    expect(args.options.category).toBe(category)
    // The timing it had is the timing it keeps.
    expect(args.scheduledFor?.getHours()).toBe(16)
    expect(args.options.isAllDay).toBe(false)
  })

  it('goal → an is_goal row on the month list, unscheduled', () => {
    const item = normalizeForSave(withItemType(row(), 'goal', 'week'))
    const args = planItemToAddTaskArgs(item, ctx)
    expect(args.scheduledFor).toBeUndefined()
    expect(args.options).toMatchObject({ bucket: 'month', isGoal: true, monthStart: ctx.monthStart })
  })

  it('an action made from a season goal is NOT a goal on the insert', () => {
    const item = normalizeForSave(withItemType(row({ placement: { kind: 'season' }, goal: true, time: null }), 'task', 'season'))
    expect(planItemToAddTaskArgs(item, ctx).options).toMatchObject({ bucket: 'quarter', isGoal: false })
  })
})
