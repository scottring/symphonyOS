import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleItem } from './ScheduleItem'
import type { TimelineItem } from '@/types/timeline'

// These tests exercise the DESKTOP branch (the inline Skip icon lives there),
// so force useMobile off — unlike ScheduleItem.test.tsx which forces it on.
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => false }))

const onSkipRoutine = vi.fn()

// The desktop branch's SkipRoutineButton and ScheduleItemActionsMenu both read
// from the schedule-actions context; provide onSkipRoutine so a click is wired.
vi.mock('@/contexts/ScheduleActionsContext', () => ({
  useScheduleActionsContext: () => ({ onSkipRoutine }),
  ScheduleActionsProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const baseRoutine: TimelineItem = {
  id: 'routine-abc',
  type: 'routine',
  title: 'Morning stretch',
  startTime: new Date('2026-05-28T07:00:00'),
  endTime: null,
  allDay: false,
  completed: false,
  skipped: false,
  context: 'personal',
  projectId: null,
  contactId: null,
  parentTaskId: null,
  location: null,
  locationPlaceId: null,
  assignedTo: null,
  attendees: [],
  category: 'routine',
  isWaiting: false,
  needsDiscussion: false,
  discussionNote: '',
  subtaskCount: 0,
  subtaskCompletedCount: 0,
} as unknown as TimelineItem

function renderRow(overrides: Partial<TimelineItem> = {}) {
  return render(
    <ScheduleItem
      item={{ ...baseRoutine, ...overrides }}
      onSelect={vi.fn()}
      onToggleComplete={vi.fn()}
    />,
  )
}

describe('ScheduleItem — inline Skip button (routines)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a visible Skip control on an active routine row', () => {
    const { queryByRole } = renderRow()
    expect(queryByRole('button', { name: /skip today/i })).not.toBeNull()
  })

  it('skips the single instance for the day on click, without opening the panel', () => {
    const onSelect = vi.fn()
    const { getByRole } = render(
      <ScheduleItem item={baseRoutine} onSelect={onSelect} onToggleComplete={vi.fn()} />,
    )
    fireEvent.click(getByRole('button', { name: /skip today/i }))
    expect(onSkipRoutine).toHaveBeenCalledTimes(1)
    expect(onSkipRoutine).toHaveBeenCalledWith('abc') // id minus the 'routine-' prefix
    expect(onSelect).not.toHaveBeenCalled() // click is stopped from selecting the row
  })

  it('hides the Skip control once the routine is completed', () => {
    const { queryByRole } = renderRow({ completed: true })
    expect(queryByRole('button', { name: /skip today/i })).toBeNull()
  })

  it('hides the Skip control once the routine is already skipped', () => {
    const { queryByRole } = renderRow({ skipped: true })
    expect(queryByRole('button', { name: /skip today/i })).toBeNull()
  })

  it('does not show the Skip control on task rows', () => {
    const { queryByRole } = renderRow({ id: 'task-1', type: 'task', category: 'task' })
    expect(queryByRole('button', { name: /skip today/i })).toBeNull()
  })

  it('does not show the Skip control on the minimal variant', () => {
    const { queryByRole } = render(
      <ScheduleItem
        item={baseRoutine}
        variant="minimal"
        onSelect={vi.fn()}
        onToggleComplete={vi.fn()}
      />,
    )
    expect(queryByRole('button', { name: /skip today/i })).toBeNull()
  })
})
