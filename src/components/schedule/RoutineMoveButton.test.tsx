import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RoutineMoveButton } from './RoutineMoveButton'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import type { TimelineItem } from '@/types/timeline'

const item = { id: 'routine-r1', type: 'routine', title: 'Wash comforters' } as unknown as TimelineItem

function renderButton(actions: Partial<ScheduleActionsValue>) {
  render(
    <ScheduleActionsProvider value={actions as ScheduleActionsValue}>
      <RoutineMoveButton item={item} />
    </ScheduleActionsProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Move or skip' }))
}

describe('RoutineMoveButton', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // Thursday, Oct 1 2026 — the day Wash comforters came due.
    vi.setSystemTime(new Date(2026, 9, 1, 9, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('moves this occurrence to tomorrow', () => {
    const onMoveRoutineToDay = vi.fn().mockResolvedValue(true)
    renderButton({ onMoveRoutineToDay, onSkipRoutine: vi.fn() })
    fireEvent.click(screen.getByText('Tomorrow'))
    const [id, day] = onMoveRoutineToDay.mock.calls[0]
    expect(id).toBe('r1')
    expect((day as Date).toDateString()).toBe(new Date(2026, 9, 2).toDateString())
  })

  it('offers each weekend day on its own, so Saturday lands on Saturday', () => {
    const onMoveRoutineToDay = vi.fn().mockResolvedValue(true)
    renderButton({ onMoveRoutineToDay })
    const saturday = screen.getByText('Sat, Oct 3', { exact: false })
    fireEvent.click(saturday)
    expect((onMoveRoutineToDay.mock.calls[0][1] as Date).toDateString()).toBe(new Date(2026, 9, 3).toDateString())
  })

  it('still skips, from the same popover', () => {
    const onSkipRoutine = vi.fn()
    renderButton({ onMoveRoutineToDay: vi.fn(), onSkipRoutine })
    fireEvent.click(screen.getByText('Skip this time'))
    expect(onSkipRoutine).toHaveBeenCalledWith('r1')
  })

  it('offers no pool targets — an occurrence has to be on a day', () => {
    renderButton({ onMoveRoutineToDay: vi.fn() })
    expect(screen.queryByText('Someday')).toBeNull()
    expect(screen.queryByText('This month')).toBeNull()
  })
})
