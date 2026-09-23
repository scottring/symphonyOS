import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { DayPlanPanel, type DayPlanPanelActions } from './DayPlanPanel'
import type { DayPlan, DayPlanEntry } from '@/lib/today/dayPlan'
import { createMockRoutine } from '@/test/mocks/factories'
import type { RecurrencePattern } from '@/types/actionable'

// "Choose…" on a weekly routine with no day of its own asks when. "All Day"
// used to become a 12:00 AM time override, so the routine sat on the schedule
// at midnight. All Day is a choice of DAY: it must choose the occurrence
// untimed; only a time the user picks — midnight included — places it timed
// (2026-09-23).
afterEach(cleanup)

const day = new Date(2026, 8, 23)
const routine = createMockRoutine({ id: 'f1', name: 'Water the plants', time_of_day: null, recurrence_pattern: { type: 'weekly' } as RecurrencePattern })
const flexible: DayPlanEntry = {
  key: 'routine:f1', kind: 'routine', id: 'f1', title: 'Water the plants', completed: false, planned: false, group: 'plan', routine,
} as unknown as DayPlanEntry

function renderChooser() {
  const actions: DayPlanPanelActions = {
    choose: vi.fn(), unchoose: vi.fn(), complete: vi.fn(), schedule: vi.fn(), commit: vi.fn(),
    chooseOccurrence: vi.fn(async () => true), placeRoutine: vi.fn(),
  }
  const plan = {
    toPlan: [], unfinished: [], carried: [], scheduled: [], available: [], week: [], month: [],
    chooserTasks: [], chooserRoutines: [flexible], counts: { scheduled: 0, available: 0 },
  } as unknown as DayPlan
  render(<DayPlanPanel plan={plan} day={day} actions={actions} />)
  fireEvent.click(screen.getByRole('button', { name: 'Routines' }))
  fireEvent.click(screen.getByRole('button', { name: /Water the plants/ }))
  return actions
}

describe('choosing a flexible routine from the picker', () => {
  it('All Day chooses the day untimed — never a 12:00 AM time', () => {
    const actions = renderChooser()
    fireEvent.click(screen.getByRole('button', { name: /All Day/ }))
    expect(actions.chooseOccurrence).toHaveBeenCalledWith(flexible, expect.any(Date))
    expect(actions.placeRoutine).not.toHaveBeenCalled()
  })

  it('a time the user picks — even midnight — still places it at that time', () => {
    const actions = renderChooser()
    const field = screen.getByPlaceholderText('Type time (e.g., 2:15pm)')
    fireEvent.change(field, { target: { value: '12:00 am' } })
    const options = within(screen.getByRole('listbox')).getAllByRole('option')
    const midnight = options.find((o) => /^12(:00)?\s*am$/i.test(o.textContent?.trim() ?? ''))
    expect(midnight, options.map((o) => o.textContent).join(', ')).toBeTruthy()
    fireEvent.click(midnight!)
    expect(actions.placeRoutine).toHaveBeenCalledTimes(1)
    const when = (actions.placeRoutine as ReturnType<typeof vi.fn>).mock.calls[0][1] as Date
    expect(when.getHours()).toBe(0)
    expect(actions.chooseOccurrence).not.toHaveBeenCalled()
  })
})
