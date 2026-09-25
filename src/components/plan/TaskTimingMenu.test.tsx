// The detail pane named no date (S2-26) and hid "remove the day" at the
// bottom of the Schedule popover (S2-27). The row's control, shared.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TaskTimingMenu } from './TaskTimingMenu'
import type { Task } from '@/types/task'

const toastSpy = vi.fn()
vi.mock('@/hooks/useToast', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  showToast: (...args: unknown[]) => toastSpy(...args),
}))

const WEEK = new Date(2026, 8, 20)
const TUE = new Date(2026, 8, 22)
const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Call the plumber', completed: false, createdAt: WEEK, updatedAt: WEEK,
  bucket: 'timed', scheduledFor: TUE, isAllDay: true, weekStart: WEEK,
  commitments: [{ level: 'week', periodStart: WEEK, status: 'open' }],
  ...over,
} as Task)

const show = (t: Task, onUpdateTask = vi.fn().mockResolvedValue(true)) => {
  render(<TaskTimingMenu task={t} onUpdateTask={onUpdateTask} periodStart={TUE} fallbackWeekStart={WEEK} />)
  return onUpdateTask
}

describe('TaskTimingMenu', () => {
  beforeEach(() => toastSpy.mockClear())

  it('states the task’s own day', () => {
    show(task())
    expect(screen.getByRole('button', { name: /Choose a week or a day for Call the plumber/ })).toHaveTextContent(/Tue, Sep 22/)
  })

  it('removes the day, says what is kept, and offers Undo', async () => {
    const onUpdateTask = show(task())
    fireEvent.click(screen.getByRole('button', { name: /Choose a week or a day/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Remove Tue, Sep 22/ }))
    expect(onUpdateTask).toHaveBeenCalledWith('t1', expect.objectContaining({ scheduledFor: undefined }))
    await waitFor(() => expect(toastSpy).toHaveBeenCalled())
    const [message, , , action] = toastSpy.mock.calls[0]
    expect(message).toMatch(/Removed Tue, Sep 22/)
    expect(action).toMatchObject({ label: 'Undo' })
  })

  it('confirms nothing when the write was refused', async () => {
    show(task(), vi.fn().mockResolvedValue(false))
    fireEvent.click(screen.getByRole('button', { name: /Choose a week or a day/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Remove Tue, Sep 22/ }))
    await new Promise((r) => setTimeout(r, 0))
    expect(toastSpy).not.toHaveBeenCalled()
  })
})
