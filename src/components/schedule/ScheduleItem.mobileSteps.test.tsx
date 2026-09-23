import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import { ScheduleItem } from './ScheduleItem'
import type { TimelineItem } from '@/types/timeline'

// The phone row showed no steps at all, though the desktop row had a "1/4"
// disclosure. The native app shows a task's steps inside its card.
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => true }))

const item = {
  id: 'task-1', type: 'task', title: 'Birthday prep', startTime: null, endTime: null,
  completed: false, subtaskCount: 2, subtaskCompletedCount: 1,
  originalTask: {
    id: '1', title: 'Birthday prep',
    subtasks: [
      { id: 's1', title: 'Order the cake', completed: false },
      { id: 's2', title: 'Confirm the guest list', completed: true },
    ],
  },
} as unknown as TimelineItem

function renderRow() {
  const onSelect = vi.fn()
  const onToggleSubtask = vi.fn()
  const value = { onToggleTask: vi.fn(), projects: [], contacts: [], familyMembers: [], lists: [] } as unknown as ScheduleActionsValue
  render(
    <ScheduleActionsProvider value={value}>
      <ScheduleItem item={item} onSelect={onSelect} onToggleComplete={vi.fn()} onToggleSubtask={onToggleSubtask} />
    </ScheduleActionsProvider>,
  )
  return { onSelect, onToggleSubtask }
}

describe('ScheduleItem — steps inside the phone card', () => {
  it('shows how many steps are done, and opens them in place without opening the task', () => {
    const { onSelect } = renderRow()
    const toggle = screen.getByRole('button', { name: /1 of 2 steps/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Order the cake')).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByText('Order the cake')).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('ticks one step at a time, and says which way each tap goes', () => {
    const { onSelect, onToggleSubtask } = renderRow()
    fireEvent.click(screen.getByRole('button', { name: /1 of 2 steps/ }))
    expect(screen.getByRole('button', { name: 'Reopen Confirm the guest list' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Complete Order the cake' }))
    expect(onToggleSubtask).toHaveBeenCalledWith('s1')
    expect(onSelect).not.toHaveBeenCalled()
  })
})
