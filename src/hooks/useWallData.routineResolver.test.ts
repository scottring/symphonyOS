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

  it('a collection Step (parent_routine_id set) is absent (rung 6), its sibling non-Step is present', async () => {
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
    expect(names).not.toContain('Pack Lunch')
    expect(names).not.toContain('Camp Mornings') // reference parent never renders itself either
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

  it('the one expected delta: a collection parent + Steps fixture drops ONLY the Steps, never a non-Step routine', async () => {
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
    // Only the non-Step routine reaches day.items. The parent never rendered
    // itself before this migration either (it was 'reference', filtered by
    // the old hand-rolled rung 1), and the Steps are the one expected delta —
    // dropped at the source now instead of downstream in wallGantt/wallV2Adapter.
    expect(names).toEqual(['Take Out Trash'])
  })
})
