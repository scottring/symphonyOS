import { describe, it, expect } from 'vitest'
import { MONTH_TO_SEASON, WEEK_TO_MONTH, groupByParent, hasUnseenParent, parentOf, relinkUpdates, untouchedCount } from './journalGroups'
import { linkedLine } from '@/lib/week/monthLinks'
import type { Task } from '@/types/task'

const t = (o: Partial<Task>) => ({ id: 'x', title: 'x', completed: false, createdAt: new Date(), ...o }) as Task
const fall = [t({ id: 's1', title: 'Garden beds ready' }), t({ id: 's2', title: 'Calmer mornings' })]

describe('groupByParent — each line beside what was written for it', () => {
  it('month lines group under their Fall line by source_id, then supports_goal_task_id; the rest are general', () => {
    const lines = [
      t({ id: 'm1', title: 'Order bulbs', sourceId: 's1' }),
      t({ id: 'm2', title: 'Legacy month goal', isGoal: true, supportsGoalTaskId: 's2' }),
      t({ id: 'm3', title: 'Unlinked' }),
      t({ id: 'm4', title: 'Year goal only', goalId: 'y1' }), // goal_id is the year, never a season parent
    ]
    const { groups, general } = groupByParent(fall, lines, MONTH_TO_SEASON)
    expect(groups.map((g) => [g.parent.id, g.entries.map((e) => e.id)])).toEqual([['s1', ['m1']], ['s2', ['m2']]])
    expect(general.map((e) => e.id)).toEqual(['m3', 'm4'])
  })

  it('a parent the reader cannot see makes no group and no title — its entries are general', () => {
    const lines = [t({ id: 'm5', title: 'For a hidden Fall line', sourceId: 'hidden-s9' })]
    const { groups, general } = groupByParent(fall, lines, MONTH_TO_SEASON)
    expect(groups.every((g) => g.entries.length === 0)).toBe(true)
    expect(general.map((e) => e.id)).toEqual(['m5'])
    expect(JSON.stringify(groups)).not.toContain('hidden-s9')
    expect(hasUnseenParent(lines[0], MONTH_TO_SEASON, new Set(['s1', 's2']))).toBe(true)
  })

  it('the week reads its month line exactly as the “↳ for October” annotation does', () => {
    const oct = [t({ id: 'o1', title: 'Plan the trip' }), t({ id: 'o2', title: 'Clear the shed' })]
    const week = [
      t({ id: 'w1', sourceId: 'o1' }), t({ id: 'w2', sourceId: 'o1' }), // several actions for one priority
      t({ id: 'w3', goalTaskId: 'o2' }),                               // older row: goal_task_id
      t({ id: 'w4', sourceId: 'gone', goalTaskId: 'o2' }),             // first-set: source_id decides, as linkedLine
      t({ id: 'w5' }),
    ]
    const { groups, general } = groupByParent(oct, week, WEEK_TO_MONTH)
    expect(groups.map((g) => g.entries.map((e) => e.id))).toEqual([['w1', 'w2'], ['w3']])
    expect(general.map((e) => e.id)).toEqual(['w4', 'w5'])
    for (const w of week) {
      const shown = linkedLine(w, [...oct, ...week])?.id ?? null
      expect(parentOf(w, WEEK_TO_MONTH, new Set(['o1', 'o2']))?.id ?? null).toBe(shown && ['o1', 'o2'].includes(shown) ? shown : null)
    }
  })

  it('the same row committed to both periods stays visible, in its own section, as itself — and counts', () => {
    // "Into this week" keeps ONE row with a month and a week commitment: the
    // month line and the week item have the same id.
    const october = t({ id: 'o1', title: 'Book the boiler service', bucket: 'week',
      commitments: [{ level: 'month', periodStart: new Date(2026, 9, 1), status: 'open' }, { level: 'week', periodStart: new Date(2026, 9, 3), status: 'open' }] })
    const oct = [october, t({ id: 'o2', title: 'Clear the shed' })]
    const week = [october, t({ id: 'w1', sourceId: 'o1' })]
    const { groups, general } = groupByParent(oct, week, WEEK_TO_MONTH)
    expect(groups[0]).toMatchObject({ itself: true })
    expect(groups[0].entries.map((e) => e.id)).toEqual(['o1', 'w1'])
    expect(groups[1]).toMatchObject({ itself: false, entries: [] })
    expect(general).toEqual([])
    expect(untouchedCount(groups, (e) => !e.completed)).toBe(1)
  })

  it('a row linking to itself is not its own parent', () => {
    const { groups, general } = groupByParent(fall, [t({ id: 'm9', sourceId: 'm9' })], MONTH_TO_SEASON)
    expect(groups.every((g) => !g.entries.length)).toBe(true)
    expect(general.map((e) => e.id)).toEqual(['m9'])
  })

  it('untouched parents are counted; a done entry is not a next step', () => {
    const { groups } = groupByParent(fall, [t({ id: 'm1', sourceId: 's1', completed: true })], MONTH_TO_SEASON)
    expect(untouchedCount(groups, (e) => !e.completed)).toBe(2)
  })
})

describe('relinkUpdates — the link shown is the link changed', () => {
  const visible = new Set(['s1', 's2'])
  it('sets through source_id only', () => {
    expect(relinkUpdates(t({ id: 'm', supportsGoalTaskId: 's2' }), 's1', MONTH_TO_SEASON, visible)).toEqual({ updates: { sourceId: 's1' }, revealed: null })
  })
  it('removes the shown legacy supports link, and every field naming that same line', () => {
    expect(relinkUpdates(t({ id: 'm', supportsGoalTaskId: 's2' }), null, MONTH_TO_SEASON, visible).updates).toEqual({ supportsGoalTaskId: undefined })
    expect(relinkUpdates(t({ id: 'm', sourceId: 's1', supportsGoalTaskId: 's1' }), null, MONTH_TO_SEASON, visible)).toEqual({ updates: { sourceId: undefined, supportsGoalTaskId: undefined }, revealed: null })
  })
  it('keeps a different line named by another field and says it now shows', () => {
    expect(relinkUpdates(t({ id: 'm', sourceId: 's1', supportsGoalTaskId: 's2' }), null, MONTH_TO_SEASON, visible)).toEqual({ updates: { sourceId: undefined }, revealed: 's2' })
  })
  it('never touches a link to a parent the reader cannot see', () => {
    expect(relinkUpdates(t({ id: 'm', sourceId: 'hidden' }), null, MONTH_TO_SEASON, visible)).toEqual({ updates: {}, revealed: null })
  })
})
