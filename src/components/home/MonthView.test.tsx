import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@/test/test-utils'
import { MonthView } from './MonthView'
import { createMockRoutine } from '@/test/mocks/factories'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'

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
}

/** The routine dot for a given day number, if any ("N routines" title). */
function routineDot(dayNum: string) {
  const button = screen.getByText(dayNum).closest('button')
  if (!button) throw new Error(`No day cell found for "${dayNum}"`)
  return within(button).queryByTitle(/routines?$/)
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
