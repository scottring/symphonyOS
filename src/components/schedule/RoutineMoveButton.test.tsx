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

  // Updated 2026-10-12 (triage contract): the occurrence gets the same When
  // order as a task. Pools ask for an actual day in them; Someday explains
  // itself instead of being silently missing.
  it('a period asks which day in it, and moves only this occurrence there', async () => {
    const onMoveRoutineToDay = vi.fn().mockResolvedValue(true)
    renderButton({ onMoveRoutineToDay })
    fireEvent.click(screen.getByRole('menuitem', { name: /^This month/ }))
    expect(onMoveRoutineToDay).not.toHaveBeenCalled()
    // The day it is already on says so and is not a move.
    expect(screen.getByRole('menuitem', { name: 'Thu, Oct 1 (it’s on this day)' })).toBeDisabled()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Thu, Oct 15' }))
    expect(onMoveRoutineToDay).toHaveBeenCalledWith('r1', new Date(2026, 9, 15))
  })

  it('Someday is shown, explained, and leads to the scoped alternative — never a silent no-op', () => {
    const onMoveRoutineToDay = vi.fn()
    const onOpen = vi.fn()
    render(
      <ScheduleActionsProvider value={{ onMoveRoutineToDay, onSkipRoutine: vi.fn() } as unknown as ScheduleActionsValue}>
        <RoutineMoveButton item={item} onOpen={onOpen} />
      </ScheduleActionsProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Move or skip' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Someday/ }))
    expect(onMoveRoutineToDay).not.toHaveBeenCalled()
    expect(screen.getByRole('note')).toHaveTextContent(/isn’t available for one time of a routine/)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open routine' }))
    expect(onOpen).toHaveBeenCalled()
  })

  it('a move that did not land says so and offers Retry (no success)', async () => {
    const onMoveRoutineToDay = vi.fn().mockResolvedValue(false)
    const toast = await import('@/hooks/useToast')
    const spy = vi.spyOn(toast, 'showToast')
    renderButton({ onMoveRoutineToDay })
    fireEvent.click(screen.getByText('Tomorrow'))
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(expect.stringMatching(/Didn’t move it/), 'error', expect.any(Number), expect.objectContaining({ label: 'Retry' })))
    spy.mockRestore()
  })
})
