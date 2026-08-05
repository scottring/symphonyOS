import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import type { TimelineItem } from '@/types/timeline'
import type { UpNextSelection } from '@/lib/today/upNext'
import { UpNextHero } from './UpNextHero'

// UpNextHero renders the same triage set an ordinary Today row carries — when,
// context, assign — but only for tasks. selectUpNext can also surface an event
// or a routine, which have no task id to write through, so those controls must
// not render dead affordances for them.

function baseCtx(overrides: Partial<ScheduleActionsValue> = {}): ScheduleActionsValue {
  return {
    onToggleTask: vi.fn(),
    familyMembers: [],
    ...overrides,
  } as ScheduleActionsValue
}

function taskItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'task-t1',
    type: 'task',
    title: 'Call the vet',
    startTime: new Date('2026-08-04T09:10:00'),
    endTime: null,
    completed: false,
    allDay: false,
    context: null,
    assignedTo: null,
    originalTask: { id: 't1', title: 'Call the vet', assignedToAll: [] } as never,
    ...overrides,
  }
}

function eventItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'event-e1',
    type: 'event',
    title: 'Dentist appointment',
    startTime: new Date('2026-08-04T09:10:00'),
    endTime: new Date('2026-08-04T09:40:00'),
    completed: false,
    allDay: false,
    ...overrides,
  }
}

function routineItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'routine-r1',
    type: 'routine',
    title: 'Morning stretch',
    startTime: new Date('2026-08-04T09:10:00'),
    endTime: null,
    completed: false,
    allDay: false,
    ...overrides,
  }
}

function renderHero(item: TimelineItem, ctxOverrides: Partial<ScheduleActionsValue> = {}) {
  const selection: UpNextSelection = { item, status: 'upcoming', minutes: 10 }
  return render(
    <ScheduleActionsProvider value={baseCtx(ctxOverrides)}>
      <UpNextHero selection={selection} onSelectItem={vi.fn()} onToggleTask={vi.fn()} />
    </ScheduleActionsProvider>
  )
}

describe('UpNextHero triage set', () => {
  it('shows the when, context and assign pickers for a task item', () => {
    renderHero(taskItem(), {
      onUpdateTask: vi.fn(),
      onAssignTaskAll: vi.fn(),
      familyMembers: [{ id: 'm1', name: 'Iris', initials: 'I', color: 'blue' } as never],
    })
    expect(screen.getByTitle('Change time')).toBeInTheDocument()
    expect(screen.getByLabelText('Set context')).toBeInTheDocument()
    expect(screen.getByLabelText(/assigned\. click to change/i)).toBeInTheDocument()
  })

  it('renders none of the pickers for an event item', () => {
    renderHero(eventItem(), {
      onUpdateTask: vi.fn(),
      onAssignTaskAll: vi.fn(),
      familyMembers: [{ id: 'm1', name: 'Iris', initials: 'I', color: 'blue' } as never],
    })
    expect(screen.queryByTitle('Change time')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Set context')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/assigned\. click to change/i)).not.toBeInTheDocument()
  })

  it('renders none of the pickers for a routine item', () => {
    renderHero(routineItem(), {
      onUpdateTask: vi.fn(),
      onAssignTaskAll: vi.fn(),
      familyMembers: [{ id: 'm1', name: 'Iris', initials: 'I', color: 'blue' } as never],
    })
    expect(screen.queryByTitle('Change time')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Set context')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/assigned\. click to change/i)).not.toBeInTheDocument()
  })

  it('does not show the assign picker for a task when there are no family members', () => {
    renderHero(taskItem(), { onUpdateTask: vi.fn(), onAssignTaskAll: vi.fn(), familyMembers: [] })
    expect(screen.queryByLabelText(/assigned\. click to change/i)).not.toBeInTheDocument()
    // When/context are independent of family members and still render.
    expect(screen.getByTitle('Change time')).toBeInTheDocument()
    expect(screen.getByLabelText('Set context')).toBeInTheDocument()
  })
})

// The hero is the same commitment as a timeline row, lifted to the top of the
// page — so it completes with the same gesture. It used to carry a bespoke
// "Done" pill, which made the most prominent card on the page the one place
// the app's own check circle didn't appear.
describe('UpNextHero completion gesture', () => {
  function renderTask(item: TimelineItem = taskItem()) {
    const onToggleTask = vi.fn()
    const selection: UpNextSelection = { item, status: 'upcoming', minutes: 10 }
    render(
      <ScheduleActionsProvider value={baseCtx()}>
        <UpNextHero selection={selection} onSelectItem={vi.fn()} onToggleTask={onToggleTask} />
      </ScheduleActionsProvider>
    )
    return { onToggleTask }
  }

  it('completes a task with the check circle, not a Done pill', () => {
    renderTask()
    expect(screen.getByLabelText(/mark complete/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^done$/i })).not.toBeInTheDocument()
  })

  // TaskCheckbox completes on mouse-UP via useLongPress (a 1.5s hold means
  // "waiting" instead), so a bare click() never fires it.
  it('toggles the task through the check circle', () => {
    const { onToggleTask } = renderTask()
    const circle = screen.getByLabelText(/mark complete/i)
    fireEvent.mouseDown(circle)
    fireEvent.mouseUp(circle)
    expect(onToggleTask).toHaveBeenCalledWith('t1')
  })

  it('offers a completed task the way back, same as a row', () => {
    renderTask(taskItem({ completed: true }))
    expect(screen.getByLabelText(/mark incomplete/i)).toBeInTheDocument()
  })

  // An event has nothing to check off, so it keeps an explicit way in.
  it('gives a non-task no check circle but keeps Open', () => {
    renderHero(eventItem())
    expect(screen.queryByLabelText(/mark complete/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Open')).toBeInTheDocument()
  })

  it('drops Open for a task — the card itself opens', () => {
    renderTask()
    expect(screen.queryByLabelText('Open')).not.toBeInTheDocument()
  })
})
