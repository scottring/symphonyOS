import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RescheduleButton } from './RescheduleButton'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import type { TimelineItem } from '@/types/timeline'
import { TIME_PRESETS } from '@/lib/dateHelpers'

const taskItem = {
  id: 'task-7', type: 'task', title: 'Go to sketchers', completed: false,
  originalTask: { id: '7', title: 'Go to sketchers' },
} as unknown as TimelineItem

function renderBtn(overrides: Partial<ScheduleActionsValue> = {}) {
  const value = { onToggleTask: vi.fn(), projects: [], contacts: [], familyMembers: [], lists: [], ...overrides } as unknown as ScheduleActionsValue
  render(
    <ScheduleActionsProvider value={value}>
      <RescheduleButton item={taskItem} />
    </ScheduleActionsProvider>
  )
}

describe('RescheduleButton', () => {
  it('opens the WHEN list in one tap and applies a dated reschedule immediately', () => {
    const onPushTask = vi.fn()
    renderBtn({ onPushTask })
    fireEvent.click(screen.getByLabelText('Reschedule'))
    fireEvent.click(screen.getByText('Next weekend'))
    expect(onPushTask).toHaveBeenCalledWith('7', expect.any(Date))
  })

  it('applies a pool target via updateTask', () => {
    const onUpdateTask = vi.fn()
    renderBtn({ onUpdateTask })
    fireEvent.click(screen.getByLabelText('Reschedule'))
    fireEvent.click(screen.getByText('Someday'))
    expect(onUpdateTask).toHaveBeenCalledWith('7', expect.objectContaining({ bucket: 'someday' }))
  })

  it('Pick date & time → schedules a specific timed date', () => {
    const onUpdateTask = vi.fn()
    renderBtn({ onUpdateTask })
    fireEvent.click(screen.getByLabelText('Reschedule'))
    fireEvent.click(screen.getByText(/Pick date/i))
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-06-20' } })
    fireEvent.change(document.querySelector('input[type="time"]')!, { target: { value: '14:30' } })
    fireEvent.click(screen.getByText('Set date & time'))
    expect(onUpdateTask).toHaveBeenCalledWith('7', expect.objectContaining({ bucket: 'timed', isAllDay: false }))
    const [, updates] = onUpdateTask.mock.calls[0]
    const d = updates.scheduledFor as Date
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5) // June
    expect(d.getDate()).toBe(20)
    expect(d.getHours()).toBe(14)
  })

  it('Today → offers the canonical hourly presets, not a coarse subset', () => {
    renderBtn({ onUpdateTask: vi.fn() })
    fireEvent.click(screen.getByLabelText('Reschedule'))
    fireEvent.click(screen.getByText('Today'))
    // Same 6am–10pm hourly granularity the schedule popover offers.
    for (const label of TIME_PRESETS.map((p) => p.label)) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('All day')).toBeInTheDocument()
  })

  it('Today → an hour chip schedules that hour today', () => {
    const onUpdateTask = vi.fn()
    renderBtn({ onUpdateTask })
    fireEvent.click(screen.getByLabelText('Reschedule'))
    fireEvent.click(screen.getByText('Today'))
    fireEvent.click(screen.getByText('7am'))
    expect(onUpdateTask).toHaveBeenCalledWith('7', expect.objectContaining({ bucket: 'timed', isAllDay: false }))
    const [, updates] = onUpdateTask.mock.calls[0]
    const d = updates.scheduledFor as Date
    expect(d.getHours()).toBe(7)
    expect(d.toDateString()).toBe(new Date().toDateString())
  })

  it('Pick date with no time → all-day', () => {
    const onUpdateTask = vi.fn()
    renderBtn({ onUpdateTask })
    fireEvent.click(screen.getByLabelText('Reschedule'))
    fireEvent.click(screen.getByText(/Pick date/i))
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-06-20' } })
    fireEvent.click(screen.getByText('Set date (all day)'))
    expect(onUpdateTask).toHaveBeenCalledWith('7', expect.objectContaining({ bucket: 'timed', isAllDay: true }))
  })
})
