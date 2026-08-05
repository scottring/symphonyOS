import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScheduleItem } from './ScheduleItem'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import type { TimelineItem } from '@/types/timeline'

// The rail lives on the DESKTOP branch — the mobile card is a different layout
// with its own trailing cluster, so force useMobile off here.
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => false }))

const baseTask: TimelineItem = {
  id: 'task-1',
  type: 'task',
  title: 'Call Dr. Smith',
  startTime: new Date('2026-05-28T13:00:00'),
  endTime: null,
  allDay: false,
  completed: false,
  skipped: false,
  context: 'family',
  projectId: null,
  contactId: null,
  parentTaskId: null,
  location: null,
  locationPlaceId: null,
  assignedTo: null,
  attendees: [],
  category: 'task',
  isWaiting: false,
  needsDiscussion: false,
  discussionNote: '',
  subtaskCount: 0,
  subtaskCompletedCount: 0,
  originalTask: { id: '1', title: 'Call Dr. Smith' },
} as unknown as TimelineItem

function renderRow(overrides: Partial<TimelineItem> = {}) {
  const value = {
    onToggleTask: vi.fn(),
    onStartMeeting: vi.fn(),
    onSkipRoutine: vi.fn(),
    onOpenProject: vi.fn(),
    projects: [], contacts: [], familyMembers: [], lists: [],
    projectsMap: new Map(),
  } as unknown as ScheduleActionsValue

  return render(
    <ScheduleActionsProvider value={value}>
      <ScheduleItem
        item={{ ...baseTask, ...overrides } as TimelineItem}
        onSelect={vi.fn()}
        onToggleComplete={vi.fn()}
        onContextChange={vi.fn()}
        onUpdateDiscussion={vi.fn()}
      />
    </ScheduleActionsProvider>
  )
}

describe('ScheduleItem — the action rail', () => {
  it('gives a task row exactly four rail slots', () => {
    const { container } = renderRow({ type: 'task' })
    expect(container.querySelectorAll('[data-rail-slot]')).toHaveLength(4)
  })

  it('gives an event row the same four slots, so the columns line up', () => {
    const { container } = renderRow({ type: 'event', id: 'event-1' })
    expect(container.querySelectorAll('[data-rail-slot]')).toHaveLength(4)
  })

  it('gives a routine row the same four slots', () => {
    const { container } = renderRow({ type: 'routine', id: 'routine-1' })
    expect(container.querySelectorAll('[data-rail-slot]')).toHaveLength(4)
  })

  // The discussion picker moved into the '...' menu. The FLAG has to stay
  // visible, so it moved to the title cluster — state belongs with the title,
  // actions belong in the rail.
  describe('discussion flag', () => {
    it('shows an indicator in the title cluster when flagged, carrying the note', () => {
      renderRow({ needsDiscussion: true, discussionNote: 'ask Iris first' })
      expect(screen.getByLabelText('Needs discussion: ask Iris first')).toBeInTheDocument()
    })

    it('falls back to a bare label when flagged with no note', () => {
      renderRow({ needsDiscussion: true, discussionNote: '' })
      expect(screen.getByLabelText('Needs discussion')).toBeInTheDocument()
    })

    it('shows nothing when the task is not flagged', () => {
      renderRow({ needsDiscussion: false })
      expect(screen.queryByLabelText(/Needs discussion/)).not.toBeInTheDocument()
    })

    it('keeps the indicator out of the rail — it is state, not an action', () => {
      const { container } = renderRow({ needsDiscussion: true, discussionNote: 'ask Iris' })
      const indicator = screen.getByLabelText('Needs discussion: ask Iris')
      const slots = Array.from(container.querySelectorAll('[data-rail-slot]'))
      expect(slots.some((slot) => slot.contains(indicator))).toBe(false)
    })
  })
})
