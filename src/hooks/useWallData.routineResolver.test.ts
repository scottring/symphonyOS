// Task 8b: useWallData adopts resolveRoutine for rungs 1/2/4 (rung 3 —
// show_on_timeline — stays deliberately overridden until the data audit; see
// docs/superpowers/specs/assets/2026-08-26-show-on-timeline-audit.md).
//
// These tests exercise the REAL hook end-to-end (renderHook), not a
// reimplementation of its filtering, because the thing being verified is
// "which routines reach day.items" — the hook's actual output — not a
// paraphrase of it. Supabase is mocked at the `.from(table)` boundary; every
// chain method returns a thenable that resolves with that table's fixture
// data regardless of which filter method is called last, so the mock does
// not need to mirror each query's exact shape.
//
// Every "is absent" assertion here is paired with a positive control in the
// same test — a routine that DOES reach day.items from the same fetch — so a
// bug that empties the day entirely cannot masquerade as correct filtering.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useWallData } from './useWallData'
import { createMockRoutine } from '@/test/mocks/factories'
import type { Routine } from '@/types/actionable'
import type { TimelineItem } from '@/types/timeline'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}))

vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({ isConnected: false, fetchEvents: vi.fn() }),
}))

let ROUTINES: Routine[] = []

function thenable(getData: () => unknown[]) {
  // Every Supabase query-builder method returns the SAME object, and that
  // object is itself a thenable that resolves to { data, error } — so it
  // does not matter which method in the chain is awaited last.
  const chain: Record<string, unknown> = {}
  const passthrough = () => chain
  for (const m of ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'or', 'order']) {
    chain[m] = passthrough
  }
  chain.then = (resolve: (v: { data: unknown[]; error: null }) => void) => {
    resolve({ data: getData(), error: null })
    return Promise.resolve()
  }
  return chain
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'routines') return thenable(() => ROUTINES)
      // Every other table: no rows needed for this test's assertions (tasks,
      // instances, contacts, milestones, screen time, completions).
      return thenable(() => [])
    },
  },
}))

async function fetchDays() {
  const { result } = renderHook(() => useWallData())
  await waitFor(() => expect(result.current.loading).toBe(false))
  return result.current.days
}

/**
 * Every routine-typed TimelineItem across every section of TODAY only
 * (days[0]). Restricted to one day so a daily routine appears at most once —
 * the 7-day wall window would otherwise repeat it once per day and break
 * exact-equality assertions.
 */
function routineNamesOnWall(days: Awaited<ReturnType<typeof fetchDays>>): string[] {
  const names: string[] = []
  const today = days[0]
  for (const section of Object.values(today.items) as TimelineItem[][]) {
    for (const item of section) {
      if (item.type === 'routine') names.push(item.title)
    }
  }
  return names
}

beforeEach(() => {
  ROUTINES = []
})

describe('useWallData — resolveRoutine adoption (Task 8b)', () => {
  it('a plain active family routine reaches the wall (positive control)', async () => {
    ROUTINES = [createMockRoutine({ name: 'Plain Family Routine', context: 'family' })]
    const names = routineNamesOnWall(await fetchDays())
    expect(names).toContain('Plain Family Routine')
  })

  it('a work-context routine is absent (rung 4), a family routine from the same fetch is present', async () => {
    ROUTINES = [
      createMockRoutine({ name: 'Work Routine', context: 'work' }),
      createMockRoutine({ name: 'Family Control', context: 'family' }),
    ]
    const names = routineNamesOnWall(await fetchDays())
    expect(names).not.toContain('Work Routine')
    expect(names).toContain('Family Control')
  })

  it('a resting routine is absent (rung 1), an active routine from the same fetch is present', async () => {
    ROUTINES = [
      createMockRoutine({ name: 'Resting Routine', context: 'family', visibility: 'reference' }),
      createMockRoutine({ name: 'Active Control', context: 'family' }),
    ]
    const names = routineNamesOnWall(await fetchDays())
    expect(names).not.toContain('Resting Routine')
    expect(names).toContain('Active Control')
  })

  it('a routine whose recurrence does not match today is absent (rung 2), a matching one is present', async () => {
    // CORPUS-style: weekly on a day that cannot be "today" for both a Monday
    // and a Saturday run — pick the day that is not today's weekday.
    const notToday = new Date()
    notToday.setDate(notToday.getDate() + 2)
    const notTodayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][notToday.getDay()]
    ROUTINES = [
      createMockRoutine({
        name: 'Wrong Day Routine',
        context: 'family',
        recurrence_pattern: { type: 'weekly', days: [notTodayKey] },
      }),
      createMockRoutine({ name: 'Daily Control', context: 'family' }),
    ]
    const names = routineNamesOnWall(await fetchDays())
    expect(names).not.toContain('Wrong Day Routine')
    expect(names).toContain('Daily Control')
  })

  // A rung-6 exception, not a rung-6 adoption: days[].items also feeds the
  // live /morning and /bedtime kid checklists (MorningLaunchView,
  // BedtimeView), which filter on assignedTo only — a collection's Steps are
  // exactly what populates a kid's checklist there. Dropping Steps at this
  // source would silently replace a kid's real checklist with the hardcoded
  // DEFAULT_MORNING_STEPS/DEFAULT_BEDTIME_STEPS fallback, whose taps do not
  // persist. So a Step MUST still reach day.items — the reference parent
  // itself still does not (unchanged from before this migration: it was
  // 'reference', filtered by the old hand-rolled rung 1, and still is by
  // resolveRoutine's own rung 1).
  it('a collection Step (parent_routine_id set) still reaches the wall; its reference parent does not', async () => {
    const parent = createMockRoutine({
      name: 'Camp Mornings',
      context: null,
      visibility: 'reference',
      time_of_day: '07:30',
    })
    const step = createMockRoutine({
      name: 'Pack Lunch',
      context: 'family',
      parent_routine_id: parent.id,
    })
    ROUTINES = [
      parent,
      step,
      createMockRoutine({ name: 'Standalone Control', context: 'family' }),
    ]
    const names = routineNamesOnWall(await fetchDays())
    expect(names).toContain('Pack Lunch')
    expect(names).not.toContain('Camp Mornings') // reference parent never renders itself
    expect(names).toContain('Standalone Control')
  })

  // THE single most important assertion in this task: the kids' morning and
  // bedtime routines rely on show_on_timeline=false as a Today-declutter
  // workaround. If the wall ever honoured rung 3 naively, they would vanish
  // from the kiosk. The override in useWallData.ts must keep them showing.
  it('an off-timeline routine (show_on_timeline: false) STILL reaches the wall', async () => {
    ROUTINES = [
      createMockRoutine({
        name: 'Morning Routine (kids)',
        context: 'family',
        show_on_timeline: false,
      }),
      createMockRoutine({ name: 'On-Timeline Control', context: 'family' }),
    ]
    const names = routineNamesOnWall(await fetchDays())
    expect(names).toContain('Morning Routine (kids)')
    expect(names).toContain('On-Timeline Control')
  })

  // The companion to the Step-still-reaches-the-wall test above, phrased as
  // the actual consumer scenario a fix-round review found missing: a kid's
  // assigned collection Step (the exact shape MorningLaunchView/BedtimeView
  // read via item.assignedTo) must still reach day.items, with a sibling
  // non-Step control from the same fetch.
  it('a kid-assigned collection Step still reaches days[].items (feeds /morning and /bedtime)', async () => {
    const parent = createMockRoutine({
      name: 'Bedtime Collection',
      context: null,
      visibility: 'reference',
      time_of_day: '19:30',
    })
    const kidStep = createMockRoutine({
      name: 'Brush Teeth',
      context: 'family',
      parent_routine_id: parent.id,
      assigned_to: 'kid-1',
    })
    const nonStep = createMockRoutine({ name: 'Take Out Trash', context: 'family' })
    ROUTINES = [parent, kidStep, nonStep]

    const days = await fetchDays()
    const today = days[0]
    const routineItems = (Object.values(today.items) as TimelineItem[])
      .flat()
      .filter((i) => i.type === 'routine')
    const brushTeeth = routineItems.find((i) => i.title === 'Brush Teeth')
    expect(brushTeeth).toBeDefined()
    expect(brushTeeth?.assignedTo).toBe('kid-1')
    expect(routineItems.map((i) => i.title)).toContain('Take Out Trash')
  })

  it('the one expected outcome: a collection parent + Steps fixture population is IDENTICAL to pre-migration — only the reference parent is absent', async () => {
    const parent = createMockRoutine({
      name: 'Bedtime Collection',
      context: null,
      visibility: 'reference',
      time_of_day: '19:30',
    })
    const stepA = createMockRoutine({ name: 'Brush Teeth', context: 'family', parent_routine_id: parent.id })
    const stepB = createMockRoutine({ name: 'Read Book', context: 'family', parent_routine_id: parent.id })
    const nonStep = createMockRoutine({ name: 'Take Out Trash', context: 'family' })
    ROUTINES = [parent, stepA, stepB, nonStep]

    const names = routineNamesOnWall(await fetchDays())
    // Both Steps AND the non-Step routine reach day.items — the parent_routine_id
    // override at the useWallData call site means rung 6 is excepted here, same
    // as pre-migration. Only the 'reference' parent is absent (rung 1, unchanged).
    expect(names.sort()).toEqual(['Brush Teeth', 'Read Book', 'Take Out Trash'])
  })
})
