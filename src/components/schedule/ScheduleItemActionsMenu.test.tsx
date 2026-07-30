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
  it('shows Delete routine (but NOT Skip today) for a routine and fires the handler', () => {
    const onDeleteRoutine = vi.fn()
    renderMenu(routineItem, { onDeleteRoutine })

    // Routine skip is surfaced by the inline SkipRoutineButton on the row now,
    // so the menu no longer duplicates it.
    expect(screen.queryByText('Skip today')).not.toBeInTheDocument()

    // confirm delete (two-step)
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

  const taskItem = {
    id: 'task-11', type: 'task', title: 'Invite Guy + Jess for pizza', completed: false,
    originalTask: { id: '11', title: 'Invite Guy + Jess for pizza' },
  } as unknown as TimelineItem

  it('captures WHAT you are waiting for and stamps the clock on a new wait', () => {
    const onUpdateTask = vi.fn()
    renderMenu(taskItem, { onUpdateTask })

    fireEvent.click(screen.getByText('Waiting for…'))
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: "Guy's response about pizza Saturday" },
    })
    fireEvent.click(screen.getByText('Save'))

    expect(onUpdateTask).toHaveBeenCalledWith('11', expect.objectContaining({
      isWaiting: true,
      waitingFor: "Guy's response about pizza Saturday",
      waitingSince: expect.any(Date),
    }))
  })

  it('does NOT reset waitingSince when only editing the sentence', () => {
    const waitingItem = {
      ...taskItem, id: 'task-12', isWaiting: true, waitingFor: 'old text',
      originalTask: { id: '12', title: 'x' },
    } as unknown as TimelineItem
    const onUpdateTask = vi.fn()
    renderMenu(waitingItem, { onUpdateTask })

    fireEvent.click(screen.getByText('Edit what you’re waiting for'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'new text' } })
    fireEvent.click(screen.getByText('Save'))

    // Resetting the clock would make the wait never age, so the assistant would
    // never surface it.
    const patch = onUpdateTask.mock.calls[0][1]
    expect(patch.waitingFor).toBe('new text')
    expect(patch).not.toHaveProperty('waitingSince')
  })

  it('pre-fills the existing sentence when editing', () => {
    const waitingItem = {
      ...taskItem, id: 'task-13', isWaiting: true, waitingFor: 'Guy’s reply',
      originalTask: { id: '13', title: 'x' },
    } as unknown as TimelineItem
    renderMenu(waitingItem, { onUpdateTask: vi.fn() })
    fireEvent.click(screen.getByText('Edit what you’re waiting for'))
    expect(screen.getByRole('textbox')).toHaveValue('Guy’s reply')
  })

  it('clears the wait entirely via "Not waiting anymore"', () => {
    const waitingItem = {
      ...taskItem, id: 'task-14', isWaiting: true, waitingFor: 'something',
      originalTask: { id: '14', title: 'x' },
    } as unknown as TimelineItem
    const onUpdateTask = vi.fn()
    renderMenu(waitingItem, { onUpdateTask })

    fireEvent.click(screen.getByText('Edit what you’re waiting for'))
    fireEvent.click(screen.getByText('Not waiting anymore'))

    expect(onUpdateTask).toHaveBeenCalledWith('14', {
      isWaiting: false, waitingFor: undefined, waitingSince: undefined,
    })
  })

  it('offers no clear option on a task that is not waiting yet', () => {
    renderMenu(taskItem, { onUpdateTask: vi.fn() })
    fireEvent.click(screen.getByText('Waiting for…'))
    expect(screen.queryByText('Not waiting anymore')).not.toBeInTheDocument()
  })

  it('omits the waiting item for events', () => {
    renderMenu(eventItem, { onUpdateTask: vi.fn() })
    expect(screen.queryByText('Waiting for…')).not.toBeInTheDocument()
  })

  it('omits the waiting item for routines', () => {
    renderMenu(routineItem, { onUpdateTask: vi.fn() })
    expect(screen.queryByText('Waiting for…')).not.toBeInTheDocument()
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
