import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScheduleItemActionsMenu } from './ScheduleItemActionsMenu'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import type { TimelineItem } from '@/types/timeline'

function taskItem(overrides: Partial<TimelineItem> & { id: string }): TimelineItem {
  const { id, ...rest } = overrides
  return {
    id: `task-${id}`,
    type: 'task',
    title: 'Test task',
    completed: false,
    originalTask: { id, title: 'Test task' },
    ...rest,
  } as unknown as TimelineItem
}

function renderMenu({
  item,
  onSetNeededToday,
}: {
  item: TimelineItem
  onSetNeededToday: (taskId: string, neededOn: Date | null) => void
}) {
  const value = {
    onToggleTask: vi.fn(),
    projects: [], contacts: [], familyMembers: [], lists: [],
    onSetNeededToday,
  } as unknown as ScheduleActionsValue
  render(
    <ScheduleActionsProvider value={value}>
      <ScheduleItemActionsMenu item={item} onOpenDetail={vi.fn()} />
    </ScheduleActionsProvider>
  )
}

describe('ScheduleItemActionsMenu — needed today', () => {
  it('offers "Need today" for a task and calls the handler', () => {
    const onSetNeededToday = vi.fn()
    renderMenu({ item: taskItem({ id: 'a' }), onSetNeededToday })
    fireEvent.click(screen.getByLabelText('Item actions'))
    fireEvent.click(screen.getByText('Need today'))
    expect(onSetNeededToday).toHaveBeenCalledWith('a', expect.any(Date))
  })

  it('offers to clear it when already marked', () => {
    const onSetNeededToday = vi.fn()
    renderMenu({ item: taskItem({ id: 'a', neededOn: new Date() }), onSetNeededToday })
    fireEvent.click(screen.getByLabelText('Item actions'))
    fireEvent.click(screen.getByText('Not needed today'))
    expect(onSetNeededToday).toHaveBeenCalledWith('a', null)
  })
})
