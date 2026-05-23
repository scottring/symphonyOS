import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WeeklyPlanningSession } from './WeeklyPlanningSession'
import { writeHideRoutines } from '@/lib/hideRoutinesSignal'
import type { Routine } from '@/types/actionable'

const baseProps = {
  tasks: [], events: [], routines: [],
  onUpdateTask: vi.fn(), onPushTask: vi.fn(),
  onSavePlanToVault: vi.fn().mockResolvedValue({ ok: true }),
  onClose: vi.fn(),
}

function makeRoutine(over: Partial<Routine> & Pick<Routine, 'name' | 'recurrence_pattern'>): Routine {
  return {
    id: over.name.replace(/\s+/g, '-').toLowerCase(),
    user_id: 'u1',
    description: null,
    default_assignee: null,
    assigned_to: null,
    assigned_to_all: null,
    visibility: 'active',
    paused_until: null,
    time_of_day: '08:00',
    raw_input: null,
    show_on_timeline: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('WeeklyPlanningSession', () => {
  beforeEach(() => {
    writeHideRoutines(false)
  })

  it('starts on step 1 of 4 and advances with Next', async () => {
    const { user } = render(<WeeklyPlanningSession {...baseProps} />)
    expect(screen.getByText(/step 1 of 4/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/step 2 of 4/i)).toBeInTheDocument()
  })

  it('calls onSelectDay with the clicked day on the week-ahead step', async () => {
    const onSelectDay = vi.fn()
    // 2026-05-20 is a Wednesday; sundayOfWeek anchors the grid on Sun 5/17.
    const { user } = render(
      <WeeklyPlanningSession {...baseProps} onSelectDay={onSelectDay} initialDate={new Date('2026-05-20T12:00:00')} />,
    )
    await user.click(screen.getByText('Wed').closest('button')!)
    expect(onSelectDay).toHaveBeenCalledTimes(1)
    const arg = onSelectDay.mock.calls[0][0] as Date
    expect(arg).toBeInstanceOf(Date)
    expect(arg.getDay()).toBe(3) // Wednesday
  })

  it('shows Finish on the last step and calls onSavePlanToVault', async () => {
    const onSavePlanToVault = vi.fn().mockResolvedValue({ ok: true })
    const { user } = render(<WeeklyPlanningSession {...baseProps} onSavePlanToVault={onSavePlanToVault} />)
    await user.click(screen.getByRole('button', { name: 'Next' })) // 2
    await user.click(screen.getByRole('button', { name: 'Next' })) // 3
    await user.click(screen.getByRole('button', { name: 'Next' })) // 4
    await user.click(screen.getByRole('button', { name: /finish/i }))
    expect(onSavePlanToVault).toHaveBeenCalled()
  })

  describe('routines this week (step 2)', () => {
    it('lists active, non-daily, untimed routines and excludes everyday, timed, and reference ones', async () => {
      const untimed = makeRoutine({ name: 'Food shopping', recurrence_pattern: { type: 'weekly', days: ['sat'] }, time_of_day: null })
      const everyday = makeRoutine({ name: 'Brush teeth', recurrence_pattern: { type: 'daily' }, time_of_day: null })
      const timed = makeRoutine({ name: 'Morning walk', recurrence_pattern: { type: 'weekly', days: ['sat'] }, time_of_day: '09:00' })
      const reference = makeRoutine({ name: 'Old chore', recurrence_pattern: { type: 'weekly', days: ['sat'] }, time_of_day: null, visibility: 'reference' })
      const { user } = render(
        <WeeklyPlanningSession {...baseProps} allRoutines={[untimed, everyday, timed, reference]} />,
      )
      await user.click(screen.getByRole('button', { name: 'Next' })) // to step 2
      expect(screen.getByText(/routines this week/i)).toBeInTheDocument()
      expect(screen.getByText('Food shopping')).toBeInTheDocument()
      expect(screen.queryByText('Brush teeth')).not.toBeInTheDocument()
      expect(screen.queryByText('Morning walk')).not.toBeInTheDocument()
      expect(screen.queryByText('Old chore')).not.toBeInTheDocument()
    })

    it('selecting a routine adds it to this week’s priority list', async () => {
      const weekly = makeRoutine({ name: 'Food shopping', recurrence_pattern: { type: 'weekly', days: ['sat'] }, time_of_day: null })
      const { user } = render(
        <WeeklyPlanningSession {...baseProps} allRoutines={[weekly]} />,
      )
      await user.click(screen.getByRole('button', { name: 'Next' })) // step 2
      // Not in the priority list yet
      expect(screen.queryByTestId('priority-routines')).not.toBeInTheDocument()
      // Check it on the left
      await user.click(screen.getByRole('checkbox', { name: 'Food shopping' }))
      const priorityRoutines = screen.getByTestId('priority-routines')
      expect(within(priorityRoutines).getByText('Food shopping')).toBeInTheDocument()
    })

    it('carries a selected routine into the step-3 schedule drawer', async () => {
      const weekly = makeRoutine({ name: 'Food shopping', recurrence_pattern: { type: 'weekly', days: ['sat'] }, time_of_day: null })
      const { user } = render(
        <WeeklyPlanningSession {...baseProps} allRoutines={[weekly]} onUpdateRoutine={vi.fn()} />,
      )
      await user.click(screen.getByRole('button', { name: 'Next' })) // step 2
      await user.click(screen.getByRole('checkbox', { name: 'Food shopping' }))
      await user.click(screen.getByRole('button', { name: 'Next' })) // step 3
      // The schedule drawer offers it as a draggable chip
      expect(screen.getByText(/drag tasks onto the calendar/i)).toBeInTheDocument()
      expect(screen.getByText('Food shopping')).toBeInTheDocument()
    })

    it('renders a timed routine on the step-3 grid for the day it recurs', async () => {
      // 2026-05-23 is a Saturday; the grid opens on that day.
      const initial = new Date(2026, 4, 23)
      const timedSat = makeRoutine({
        name: 'Soccer practice',
        recurrence_pattern: { type: 'weekly', days: ['sat'] },
        time_of_day: '10:00',
      })
      const { user } = render(
        <WeeklyPlanningSession {...baseProps} initialDate={initial} allRoutines={[timedSat]} onUpdateRoutine={vi.fn()} />,
      )
      await user.click(screen.getByRole('button', { name: 'Next' })) // step 2
      await user.click(screen.getByRole('button', { name: 'Next' })) // step 3
      // A timed routine recurring on the visible day must show on the grid,
      // not just in the (untimed) drawer — this is what makes a dropped
      // routine "land" instead of disappearing.
      expect(screen.getByText('Soccer practice')).toBeInTheDocument()
    })
  })

  describe('hide daily chores', () => {
    const daily = makeRoutine({ name: 'Brush teeth', recurrence_pattern: { type: 'daily' } })
    const weekly = makeRoutine({ name: 'Take out trash', recurrence_pattern: { type: 'weekly', days: ['mon'] } })

    it('shows daily and non-daily routines on the week-ahead step when not hiding', () => {
      writeHideRoutines(false)
      render(<WeeklyPlanningSession {...baseProps} routines={[daily, weekly]} />)
      expect(screen.getAllByText(/Brush teeth/).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Take out trash/).length).toBeGreaterThan(0)
    })

    it('hides daily routines but keeps non-daily ones when the app-wide pref is on', () => {
      writeHideRoutines(true)
      render(<WeeklyPlanningSession {...baseProps} routines={[daily, weekly]} />)
      expect(screen.queryByText(/Brush teeth/)).not.toBeInTheDocument()
      expect(screen.getAllByText(/Take out trash/).length).toBeGreaterThan(0)
    })

    it('reacts to toggling the in-page Hide daily control', async () => {
      writeHideRoutines(false)
      const { user } = render(<WeeklyPlanningSession {...baseProps} routines={[daily, weekly]} />)
      expect(screen.getAllByText(/Brush teeth/).length).toBeGreaterThan(0)
      await user.click(screen.getByRole('button', { name: /hide daily/i }))
      expect(screen.queryByText(/Brush teeth/)).not.toBeInTheDocument()
      expect(screen.getAllByText(/Take out trash/).length).toBeGreaterThan(0)
    })
  })
})
