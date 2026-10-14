import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScheduleItem } from './ScheduleItem'
import { TodayDraggableRow } from './TodayDraggableRow'
import { TodayDragProvider } from './TodayDragProvider'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import type { TimelineItem } from '@/types/timeline'

// Today, trimmed (2026-10-14): a row is tick, drag and tap. The reschedule
// button, the row ⋯ menu, the when-chip and the hover bulk-select checkbox
// are gone — their jobs live in the item panel the tap opens.
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => false }))

const task = {
  id: 'task-1',
  type: 'task',
  title: 'Reply to Christian',
  startTime: null,
  endTime: null,
  allDay: true,
  completed: false,
  skipped: false,
  isWaiting: false,
  needsDiscussion: false,
  subtaskCount: 0,
  subtaskCompletedCount: 0,
  originalTask: { id: '1', title: 'Reply to Christian' },
} as unknown as TimelineItem

const ctx = {
  onToggleTask: vi.fn(),
  onUpdateTask: vi.fn(),
  onDeleteTask: vi.fn(),
  onSetNeededToday: vi.fn(),
  onSkipEvent: vi.fn(),
  projects: [], contacts: [], familyMembers: [], lists: [],
  projectsMap: new Map(),
} as unknown as ScheduleActionsValue

function renderRow(item: TimelineItem = task) {
  const onSelect = vi.fn()
  const onToggleComplete = vi.fn()
  const utils = render(
    <ScheduleActionsProvider value={ctx}>
      <ScheduleItem
        item={item}
        onSelect={onSelect}
        onToggleComplete={onToggleComplete}
        // Everything TodaySectionList still passes for the retired controls:
        // accepted, and drawn as nothing.
        bulkSelectable
        bulkSelected={false}
        showBulkAffordance
        onToggleBulkSelect={vi.fn()}
        belowTitleAccessory={<button type="button">Any time</button>}
        onUpdateDiscussion={vi.fn()}
        onContextChange={vi.fn()}
      />
    </ScheduleActionsProvider>,
  )
  return { ...utils, onSelect, onToggleComplete }
}

describe('ScheduleItem on Today — tick, drag, tap', () => {
  it.each([
    ['a task', task],
    ['an event', { ...task, id: 'event-1', type: 'event', allDay: false, startTime: new Date(2026, 9, 14, 17, 15), originalTask: undefined }],
  ] as Array<[string, TimelineItem]>)('draws no Reschedule, Item actions, when-chip or select box on %s', (_l, item) => {
    renderRow(item)
    expect(screen.queryByRole('button', { name: 'Reschedule' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Item actions' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Any time' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^(Select|Deselect) item$/ })).toBeNull()
  })

  it('tapping the row opens it (the item panel)', () => {
    const { onSelect } = renderRow()
    fireEvent.click(screen.getByText('Reply to Christian'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('ticking completes it without opening it', () => {
    const { onSelect, onToggleComplete } = renderRow()
    fireEvent.click(screen.getByRole('button', { name: /complete/i }))
    expect(onToggleComplete).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('lets the press that starts a drag reach the draggable wrapper', () => {
    const reached = vi.fn()
    render(
      <TodayDragProvider resolve={() => []} onIntents={vi.fn()} renderOverlay={() => null}>
        <TodayDraggableRow itemId="task-1">
          <ScheduleActionsProvider value={ctx}>
            <ScheduleItem item={task} onSelect={vi.fn()} onToggleComplete={vi.fn()} />
          </ScheduleActionsProvider>
        </TodayDraggableRow>
      </TodayDragProvider>,
    )
    const wrapper = screen.getByTestId('today-row-task-1')
    expect(wrapper).not.toHaveAttribute('data-drag-disabled')
    wrapper.addEventListener('mousedown', reached)
    fireEvent.mouseDown(screen.getByText('Reply to Christian'))
    expect(reached).toHaveBeenCalledTimes(1)
  })
})
