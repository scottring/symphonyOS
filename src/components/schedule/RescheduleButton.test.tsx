import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RescheduleButton } from './RescheduleButton'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import type { TimelineItem } from '@/types/timeline'

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
})
