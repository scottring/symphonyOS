import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
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
