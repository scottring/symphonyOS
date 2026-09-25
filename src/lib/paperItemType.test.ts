import { describe, it, expect } from 'vitest'
import { itemTypeOf, itemTypeProblem, normalizeForSave, withItemType, PAPER_ITEM_TYPES, type PaperItemType } from './paperItemType'
import { planItemToAddTaskArgs, type PlanItem } from './planParse'

const row = (over: Partial<PlanItem> = {}): PlanItem => ({
  title: 'Swim lesson', placement: { kind: 'date', date: '2026-10-07' }, time: '16:30',
  assigneeId: 'm-iris', note: 'Bring goggles', dateHint: '2026-10-07', kind: 'task', category: 'task',
  recurring: null, phone: null, contactMemberId: 'm-mia', sourceId: 'src-1', ...over,
})

const TYPES: PaperItemType[] = PAPER_ITEM_TYPES.map((t) => t.id)

describe('withItemType', () => {
  // Every one of the 12 conversions keeps what the user wrote and chose.
  for (const from of TYPES) {
    for (const to of TYPES) {
      if (from === to) continue
      it(`${from} → ${to} keeps title, note, assignee, lineage and the day`, () => {
        const start = withItemType(row(), from).item
        const { item } = withItemType(start, to)
        expect(itemTypeOf(item)).toBe(to)
        expect(item).toMatchObject({
          title: 'Swim lesson', note: 'Bring goggles', assigneeId: 'm-iris', contactMemberId: 'm-mia',
          sourceId: 'src-1', placement: { kind: 'date', date: '2026-10-07' }, time: '16:30',
        })
      })
    }
  }

  it('a dated line becomes a routine on its weekday, keeping its time', () => {
    const { item } = withItemType(row(), 'routine')
    expect(item.kind).toBe('recurring')
    expect(item.recurring).toEqual({ days: ['wed'], until: null })
    expect(item.time).toBe('16:30')
  })

  it('an undated line becomes a routine with no days yet — which blocks saving', () => {
    const { item } = withItemType(row({ placement: { kind: 'week' }, time: null }), 'routine')
    expect(item.recurring?.days).toEqual([])
    expect(itemTypeProblem(item)).toMatch(/days/)
  })

  it('a routine read off the page keeps its days through a round trip', () => {
    const r = row({ kind: 'recurring', category: undefined, recurring: { days: ['sat', 'sun'], until: null }, placement: { kind: 'week' } })
    const back = withItemType(withItemType(r, 'activity').item, 'routine').item
    expect(back.recurring?.days).toEqual(['sat', 'sun'])
    expect(back.placement).toEqual({ kind: 'week' })
  })

  it('a goal stays a goal only as a Task, and says so when it stops', () => {
    const goal = row({ placement: { kind: 'month' }, goal: true, time: null })
    const appt = withItemType(goal, 'appointment')
    expect(appt.item.goal).toBe(false)
    expect(appt.notice).toMatch(/no longer a goal/i)
    const routine = withItemType(goal, 'routine')
    expect(routine.item.goal).toBe(false)
    expect(routine.notice).toMatch(/no longer a goal/i)
    expect(withItemType(row({ goal: false }), 'appointment').notice).toBeNull()
  })

  it('leaves day-facts and year goals alone', () => {
    const fact = row({ kind: 'dayfact', category: undefined })
    expect(withItemType(fact, 'routine').item).toBe(fact)
    const yearGoal = row({ placement: { kind: 'goal' }, category: undefined })
    expect(withItemType(yearGoal, 'appointment').item).toBe(yearGoal)
  })
})

describe('normalizeForSave', () => {
  it('drops a time that has no day to hang on, and a routine pattern on a task', () => {
    const r = withItemType(row({ placement: { kind: 'week' }, recurring: { days: ['mon'], until: null } }), 'appointment').item
    expect(normalizeForSave({ ...r, kind: 'task' })).toMatchObject({ time: null, recurring: null, category: 'event' })
  })

  it('a routine carries no category and is never a goal', () => {
    const r = normalizeForSave(withItemType(row({ goal: true }), 'routine').item)
    expect(r).not.toHaveProperty('category')
    expect(r.goal).toBe(false)
  })
})

describe('the chosen type reaches the addTask insert', () => {
  const ctx = { currentWeekStart: new Date(2026, 9, 5), monthStart: new Date(2026, 9, 1), seasonStart: new Date(2026, 8, 1), context: 'family' as const }
  it.each([['task', 'task'], ['appointment', 'event'], ['activity', 'activity']] as const)('%s → category %s', (type, category) => {
    const item = normalizeForSave(withItemType(row({ category: undefined }), type).item)
    const args = planItemToAddTaskArgs(item, ctx)
    expect(args.options.category).toBe(category)
    // The timing it had is the timing it keeps.
    expect(args.scheduledFor?.getHours()).toBe(16)
    expect(args.options.isAllDay).toBe(false)
  })
})
