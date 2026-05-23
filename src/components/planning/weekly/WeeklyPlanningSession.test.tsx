import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
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
