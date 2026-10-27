import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SnoozeButton } from './SnoozeButton'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import type { TimelineItem } from '@/types/timeline'
import { getBaseDate } from '@/lib/dateHelpers'

const today = getBaseDate(0)
const task = {
  id: 't1',
  title: 'frame the posters',
  bucket: 'timed',
  scheduledFor: today,
  isAllDay: true,
  focus: [],
  deferCount: 2,
}
const item = { id: 'task-t1', type: 'task', title: task.title, originalTask: task } as unknown as TimelineItem

function show(overrides: Partial<ScheduleActionsValue> = {}) {
  const value = {
    onToggleTask: vi.fn(),
    onPushTask: vi.fn().mockResolvedValue(true),
    onUpdateTask: vi.fn(),
    onRegisterUndo: vi.fn(),
    ...overrides,
  } as unknown as ScheduleActionsValue
  render(<ScheduleActionsProvider value={value}><SnoozeButton item={item} /></ScheduleActionsProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Snooze' }))
  return value
}

describe('SnoozeButton', () => {
  it('offers later days only — never today', () => {
    show()
    const menu = screen.getByRole('dialog', { name: 'Snooze until' })
    expect(menu.textContent).toContain('Tomorrow')
    expect(menu.textContent).toContain('This weekend')
    expect(menu.textContent).toContain('Next week')
    expect(menu.textContent).toMatch(/Pick date/)
    expect(menu.textContent).not.toMatch(/Today|Tonight|Someday/)
  })

  it('pushes the task to tomorrow and offers Undo that restores it', async () => {
    const ctx = show()
    fireEvent.click(screen.getByText('Tomorrow'))
    await waitFor(() => expect(ctx.onRegisterUndo).toHaveBeenCalled())
    expect(ctx.onPushTask).toHaveBeenCalledWith('t1', getBaseDate(1))
    const [message, undo] = (ctx.onRegisterUndo as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(message).toMatch(/^Snoozed to /)
    undo()
    expect(ctx.onUpdateTask).toHaveBeenCalledWith('t1', {
      bucket: 'timed', scheduledFor: today, isAllDay: true, focus: [], deferCount: 2,
    })
  })

  it('offers no Undo when nothing was written (a cancelled gate)', async () => {
    const ctx = show({ onPushTask: vi.fn().mockResolvedValue(false) })
    fireEvent.click(screen.getByText('Tomorrow'))
    await waitFor(() => expect(ctx.onPushTask).toHaveBeenCalled())
    expect(ctx.onRegisterUndo).not.toHaveBeenCalled()
  })
})
