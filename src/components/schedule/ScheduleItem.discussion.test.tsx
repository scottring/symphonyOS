import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleItem } from './ScheduleItem'
import { consumeDiscussionOpen, _resetDiscussionOpenIntent } from '@/lib/discussions/openIntent'
import type { TimelineItem } from '@/types/timeline'

// The desktop row: the discussion bubble lives with the title chips there.
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => false }))
vi.mock('@/contexts/ScheduleActionsContext', () => ({
  useScheduleActionsContext: () => ({
    onToggleTask: () => {},
    onSetNeededToday: () => {},
    viewedDate: new Date('2026-09-22T09:00:00'),
    onStartMeeting: undefined,
  }),
  ScheduleActionsProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/hooks/useTravelTime', () => ({ useTravelTime: () => null }))

const flagged: TimelineItem = {
  id: 'task-t1',
  type: 'task',
  title: 'Iris re front gate by Matt',
  startTime: null,
  endTime: null,
  allDay: true,
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
  needsDiscussion: true,
  discussionNote: 'Which contractor?',
  subtaskCount: 0,
  subtaskCompletedCount: 0,
} as unknown as TimelineItem

// Scott, 2026-09-22: "i can't click on the bubble to see the conversation".
describe('ScheduleItem — the discussion bubble is the door to the conversation', () => {
  beforeEach(() => { _resetDiscussionOpenIntent() })

  it('opens the item with its Discussion asked for, without toggling completion', () => {
    const onSelect = vi.fn()
    const onToggleComplete = vi.fn()
    render(<ScheduleItem item={flagged} onSelect={onSelect} onToggleComplete={onToggleComplete} />)
    const bubble = screen.getByRole('button', { name: 'Open discussion: Which contractor?' })
    fireEvent.click(bubble)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onToggleComplete).not.toHaveBeenCalled()
    // The panel that mounts for this task consumes the intent; nobody else does.
    expect(consumeDiscussionOpen('task', 'other')).toBe(false)
    expect(consumeDiscussionOpen('task', 't1')).toBe(true)
  })

  it('draws no bubble on a row that is not flagged', () => {
    render(<ScheduleItem item={{ ...flagged, needsDiscussion: false, discussionNote: '' }} onSelect={vi.fn()} onToggleComplete={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Open discussion/ })).toBeNull()
  })
})
