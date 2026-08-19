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
  viewedDate,
}: {
  item: TimelineItem
  onSetNeededToday: (taskId: string, neededOn: Date | null) => void
  viewedDate?: Date
}) {
  const value = {
    onToggleTask: vi.fn(),
    projects: [], contacts: [], familyMembers: [], lists: [],
    onSetNeededToday,
    viewedDate,
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
    const today = new Date()
    renderMenu({ item: taskItem({ id: 'a', neededOn: today }), onSetNeededToday, viewedDate: today })
    fireEvent.click(screen.getByLabelText('Item actions'))
    fireEvent.click(screen.getByText('Not needed today'))
    expect(onSetNeededToday).toHaveBeenCalledWith('a', null)
  })

  // A mark expires by ceasing to match the viewed day (see src/lib/today/neededToday.ts) —
  // nothing ever clears the `neededOn` column. A stale mark from a different day must
  // read as unmarked here too, or re-marking for today takes two clicks instead of one.
  it('offers "Need today" (not "Not needed today") for a task marked on a DIFFERENT day', () => {
    const onSetNeededToday = vi.fn()
    const yesterday = new Date(2026, 7, 18)
    const viewedDate = new Date(2026, 7, 19)
    renderMenu({ item: taskItem({ id: 'a', neededOn: yesterday }), onSetNeededToday, viewedDate })
    fireEvent.click(screen.getByLabelText('Item actions'))
    expect(screen.queryByText('Not needed today')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Need today'))
    expect(onSetNeededToday).toHaveBeenCalledWith('a', expect.any(Date))
  })
})
