import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScheduleItemActionsMenu } from './ScheduleItemActionsMenu'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import type { TimelineItem } from '@/types/timeline'

function renderMenu(
  item: TimelineItem,
  overrides: Partial<ScheduleActionsValue> = {},
  onOpenDetail: () => void = vi.fn(),
) {
  const value = {
    onToggleTask: vi.fn(),
    projects: [], contacts: [], familyMembers: [], lists: [],
    ...overrides,
  } as unknown as ScheduleActionsValue
  render(
    <ScheduleActionsProvider value={value}>
      <ScheduleItemActionsMenu item={item} onOpenDetail={onOpenDetail} />
    </ScheduleActionsProvider>
  )
  // open the menu
  fireEvent.click(screen.getByLabelText('Item actions'))
  return { value, onOpenDetail }
}

const routineItem = { id: 'routine-1', type: 'routine', title: 'Trash', completed: false } as unknown as TimelineItem
const eventItem = {
  id: 'event-9', type: 'event', title: 'Dentist', completed: false,
  originalEvent: { id: '9', title: 'Dentist' },
} as unknown as TimelineItem

describe('ScheduleItemActionsMenu', () => {
  it('shows Skip today + Delete routine for a routine and fires the handlers', () => {
    const onSkipRoutine = vi.fn()
    const onDeleteRoutine = vi.fn()
    renderMenu(routineItem, { onSkipRoutine, onDeleteRoutine })

    fireEvent.click(screen.getByText('Skip today'))
    expect(onSkipRoutine).toHaveBeenCalledWith('1')

    // re-open, then confirm delete (two-step)
    fireEvent.click(screen.getByLabelText('Item actions'))
    fireEvent.click(screen.getByText('Delete routine'))
    fireEvent.click(screen.getByText('Confirm delete'))
    expect(onDeleteRoutine).toHaveBeenCalledWith('1')
  })

  it('shows Skip today + Delete for an event and fires the handlers', () => {
    const onSkipEvent = vi.fn()
    const onDeleteEvent = vi.fn()
    renderMenu(eventItem, { onSkipEvent, onDeleteEvent })

    fireEvent.click(screen.getByText('Skip today'))
    expect(onSkipEvent).toHaveBeenCalledWith('9')

    fireEvent.click(screen.getByLabelText('Item actions'))
    fireEvent.click(screen.getByText('Delete'))
    expect(onDeleteEvent).toHaveBeenCalledWith(eventItem.originalEvent)
  })

  it('Reschedule opens the detail panel for an event', () => {
    const onOpenDetail = vi.fn()
    renderMenu(eventItem, {}, onOpenDetail)
    fireEvent.click(screen.getByText('Reschedule'))
    expect(onOpenDetail).toHaveBeenCalled()
  })

  it('a TASK has NO Reschedule item in the menu (dedicated button owns it)', () => {
    const taskItem = {
      id: 'task-7', type: 'task', title: 'Go to sketchers', completed: false,
      originalTask: { id: '7', title: 'Go to sketchers' },
    } as unknown as TimelineItem
    renderMenu(taskItem, {})
    expect(screen.queryByText('Reschedule')).not.toBeInTheDocument()
  })

  it('a TASK still offers Edit details (full panel)', () => {
    const taskItem = {
      id: 'task-8', type: 'task', title: 'x', completed: false, originalTask: { id: '8', title: 'x' },
    } as unknown as TimelineItem
    const onOpenDetail = vi.fn()
    renderMenu(taskItem, {}, onOpenDetail)
    fireEvent.click(screen.getByText('Edit details'))
    expect(onOpenDetail).toHaveBeenCalled()
  })
})
