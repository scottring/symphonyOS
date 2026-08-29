import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, act } from '@/test/test-utils'
import { MonthView } from './MonthView'
import { createMockRoutine } from '@/test/mocks/factories'
import { writeHideRoutines } from '@/lib/hideRoutinesSignal'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'
import { ALL_LAYERS } from '@/lib/domains'

// August 2026: the 42-cell grid runs Mon Jul 27 - Sun Sep 6, so day-of-month
// 17 (Mon Aug 17) and 18 (Tue Aug 18) each appear exactly once — no adjacent-
// month overflow collides with either number, which keeps the day-number
// lookups below unambiguous.
const monthStart = new Date(2026, 7, 1)

const defaultProps = {
  tasks: [] as Task[],
  events: [] as CalendarEvent[],
  routines: [] as Routine[],
  dateInstances: [],
  monthStart,
  onMonthChange: vi.fn(),
  onSelectDay: vi.fn(),
  layers: ALL_LAYERS,
}

/** The routine dot for a given day number, if any ("N routines" title). */
function routineDot(dayNum: string) {
  const button = screen.getByText(dayNum).closest('button')
  if (!button) throw new Error(`No day cell found for "${dayNum}"`)
  return within(button).queryByTitle(/routines?$/)
}

/** The routine dot's title text ("N routines"), or null if no dot. MonthView
 *  renders one aggregated dot per day (a count), not one element per
 *  routine, so distinguishing "routine A survived, routine B didn't" has to
 *  go through this count rather than a per-routine query. */
function routineCountTitle(dayNum: string): string | null {
  return routineDot(dayNum)?.getAttribute('title') ?? null
}

describe('MonthView routine day-matching', () => {
  // Regression test for a real bug: the old hand-rolled day matcher compared
  // a FULL weekday name ('monday') against `recurrence_pattern.days`, which
  // the write path always populates with the SHORT key ('mon') — see
  // WEEKDAY_KEYS in routineUtils.ts. That mismatch meant a weekly routine
  // counted ZERO routines on every single day, including its own weekday.
  it('counts a weekly Monday routine on Mondays only', () => {
    const routines = [
      createMockRoutine({ recurrence_pattern: { type: 'weekly', days: ['mon'] } }),
    ]
    render(<MonthView {...defaultProps} routines={routines} />)

    expect(routineDot('17')).not.toBeNull() // Mon Aug 17
    expect(routineDot('18')).toBeNull() // Tue Aug 18
  })

  // Regression test for a second bug in the same matcher: it only understood
  // `daily` and `weekly` recurrence, so monthly/quarterly/yearly/
  // specific_days/since_last routines were never counted on ANY day.
  it('counts a monthly routine on its day_of_month only', () => {
    const routines = [
      createMockRoutine({ recurrence_pattern: { type: 'monthly', day_of_month: 17 } }),
    ]
    render(<MonthView {...defaultProps} routines={routines} />)

    expect(routineDot('17')).not.toBeNull() // the 17th
    expect(routineDot('18')).toBeNull() // the 18th
  })
})

describe('MonthView responds to the "hide daily routines" toggle', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  // Regression test: MonthView used to hardcode `hideRoutines: false` at its
  // resolveRoutine call site, so this app-wide toggle (symphony-hide-routines)
  // silently did nothing here even though Today/Week already honored it. An
  // everyday (daily, unpinned) routine must be visible with the toggle off
  // and gone once it's flipped on — both assertions in play so neither can
  // pass vacuously.
  it('hides an everyday routine once the toggle is switched on, and shows it again when off', () => {
    const routines = [createMockRoutine({ name: 'Daily Routine' })] // factory default: daily, unpinned

    render(<MonthView {...defaultProps} routines={routines} />)

    expect(routineDot('17')).not.toBeNull()

    act(() => writeHideRoutines(true))

    expect(routineDot('17')).toBeNull()

    act(() => writeHideRoutines(false))

    expect(routineDot('17')).not.toBeNull()
  })

  // rung 7 of resolveRoutine (routineUtils.ts) has an explicit escape: a
  // pinned (pin_to_timeline) or dosed (times_per_day) everyday routine must
  // SURVIVE the "hide daily routines" sweep — that's how medication/PT
  // tracking stays visible even with the toggle on. MonthView renders one
  // aggregated count-dot per day rather than one element per routine, so the
  // proof here is the count dropping from 2 (both routines) to 1 (pinned
  // only) — the drop-by-exactly-one is itself the positive control: it
  // proves the sweep actually ran (the plain routine got swept), so the
  // pinned routine's survival can't be a false pass from the sweep simply
  // never firing.
  it('sweeps a plain everyday routine but keeps a pinned one, once the toggle is on', () => {
    const routines = [
      createMockRoutine({ name: 'Daily Routine' }), // factory default: daily, unpinned
      createMockRoutine({ name: 'Pinned Daily Routine', pin_to_timeline: true }),
    ]

    render(<MonthView {...defaultProps} routines={routines} />)

    expect(routineCountTitle('17')).toBe('2 routines')

    act(() => writeHideRoutines(true))

    expect(routineCountTitle('17')).toBe('1 routines')

    act(() => writeHideRoutines(false))

    expect(routineCountTitle('17')).toBe('2 routines')
  })
})
