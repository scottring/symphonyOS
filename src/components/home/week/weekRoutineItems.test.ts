import { describe, it, expect } from 'vitest'
import { buildWeekRoutineItems } from './weekRoutineItems'
import { createMockRoutine, createMockActionableInstance } from '@/test/mocks/factories'
import { ALL_LAYERS } from '@/lib/domains'
import type { ActionableInstance } from '@/types/actionable'

const monday = new Date(2026, 4, 18) // Mon 2026-05-18
const PREFS = { hideRoutines: false, layers: ALL_LAYERS }

function build(routines: Parameters<typeof buildWeekRoutineItems>[0]['routines'], instances: ActionableInstance[] = []) {
  return buildWeekRoutineItems({ routines, weekStart: monday, dayCount: 7, instances, prefs: PREFS })
}

/** Start time of the block rendered on `dayIdx`, or undefined if none is. */
function startOn(items: ReturnType<typeof build>, routineId: string, dayIdx: number) {
  return items.find((i) => i.id === `routine-${routineId}-day${dayIdx}`)?.startTime ?? undefined
}

describe('buildWeekRoutineItems', () => {
  it('places a routine at its rule time when no instance overrides it', () => {
    const routine = createMockRoutine({ id: 'r1', name: 'Long run', time_of_day: '07:00' })

    const items = build([routine])

    expect(items).toHaveLength(7) // daily
    expect(startOn(items, 'r1', 0)?.getHours()).toBe(7)
  })

  it('honors a same-day retime — the drag the grid used to throw away', () => {
    // The reported bug: dragging a routine to a new time on the same day wrote
    // status:'pending' + deferred_to, and the grid re-rendered it at 07:00
    // anyway, through a refresh and forever after.
    const routine = createMockRoutine({ id: 'r1', name: 'Long run', time_of_day: '07:00' })
    const retimed = createMockActionableInstance({
      entity_type: 'routine',
      entity_id: 'r1',
      date: '2026-05-20', // Wednesday
      status: 'pending',
      deferred_to: new Date(2026, 4, 20, 16, 30).toISOString(),
    })

    const items = build([routine], [retimed])

    const wednesday = startOn(items, 'r1', 2)
    expect(wednesday?.getHours()).toBe(16)
    expect(wednesday?.getMinutes()).toBe(30)
    // Every other day still reads the rule.
    expect(startOn(items, 'r1', 3)?.getHours()).toBe(7)
  })

  it('moves a routine deferred to another day, leaving no ghost behind', () => {
    const routine = createMockRoutine({ id: 'r1', name: 'Long run', time_of_day: '07:00' })
    const moved = createMockActionableInstance({
      entity_type: 'routine',
      entity_id: 'r1',
      date: '2026-05-20', // from Wednesday
      status: 'deferred',
      deferred_to: new Date(2026, 4, 22, 9, 0).toISOString(), // to Friday 09:00
    })

    const items = build([routine], [moved])

    expect(startOn(items, 'r1', 2)).toBeUndefined() // gone from Wednesday
    expect(startOn(items, 'r1', 4)?.getHours()).toBe(9) // lands on Friday
  })

  it('renders a routine deferred onto a day its pattern does not cover', () => {
    // Monday-only routine dragged onto Thursday. Rung 2 must not veto a day
    // the user explicitly put it on.
    const routine = createMockRoutine({
      id: 'r1',
      name: 'Long run',
      time_of_day: '07:00',
      recurrence_pattern: { type: 'weekly', days: ['monday'] },
    })
    const moved = createMockActionableInstance({
      entity_type: 'routine',
      entity_id: 'r1',
      date: '2026-05-18',
      status: 'deferred',
      deferred_to: new Date(2026, 4, 21, 8, 15).toISOString(), // Thursday
    })

    const items = build([routine], [moved])

    expect(startOn(items, 'r1', 0)).toBeUndefined() // left Monday
    expect(startOn(items, 'r1', 3)?.getHours()).toBe(8) // arrived Thursday
    expect(items).toHaveLength(1)
  })

  it('still hides a routine the resolver rejects, however it was deferred', () => {
    // A deferral overrides recurrence (rung 2) and nothing else — a routine
    // that belongs to someone else stays hidden wherever it was dropped.
    const routine = createMockRoutine({ id: 'r1', name: 'Long run', assigned_to: 'iris' })
    const moved = createMockActionableInstance({
      entity_type: 'routine',
      entity_id: 'r1',
      date: '2026-05-18',
      status: 'deferred',
      deferred_to: new Date(2026, 4, 21, 8, 15).toISOString(),
    })

    const items = buildWeekRoutineItems({
      routines: [routine],
      weekStart: monday,
      dayCount: 7,
      instances: [moved],
      member: ['scott'],
      prefs: PREFS,
    })

    expect(items).toEqual([])
  })

  it('ignores instances belonging to other entity types', () => {
    const routine = createMockRoutine({ id: 'r1', name: 'Long run', time_of_day: '07:00' })
    const eventInstance = createMockActionableInstance({
      entity_type: 'calendar_event',
      entity_id: 'r1',
      date: '2026-05-20',
      status: 'deferred',
      deferred_to: new Date(2026, 4, 22, 9, 0).toISOString(),
    })

    const items = build([routine], [eventInstance])

    expect(startOn(items, 'r1', 2)?.getHours()).toBe(7)
  })

  it('leaves an untimed routine untimed rather than inventing a slot', () => {
    const routine = createMockRoutine({ id: 'r1', name: 'Stretch', time_of_day: null })

    const items = build([routine])

    expect(items).toHaveLength(7)
    expect(items[0].startTime).toBeNull()
  })
})
