import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import { ScheduleItem } from './ScheduleItem'
import type { TimelineItem } from '@/types/timeline'

// Desktop branch — the calendar-icon checkbox and the Free chip both live
// only in the desktop render (mobile has no check-circle at all).
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => false }))

const baseEvent: TimelineItem = {
  id: 'event-1',
  type: 'event',
  title: 'FFG',
  startTime: new Date('2026-05-28T15:00:00'),
  endTime: new Date('2026-05-28T16:00:00'),
  allDay: false,
  completed: false,
  skipped: false,
  context: 'family',
  location: null,
  locationPlaceId: null,
  assignedTo: null,
  attendees: [],
} as unknown as TimelineItem

function renderRow(overrides: Partial<TimelineItem> = {}) {
  const value = {
    onToggleTask: vi.fn(),
    projects: [], contacts: [], familyMembers: [], lists: [],
    projectsMap: new Map(),
    onOpenProject: vi.fn(),
  } as unknown as ScheduleActionsValue
  const onToggleComplete = vi.fn()
  const utils = render(
    <ScheduleActionsProvider value={value}>
      <ScheduleItem
        item={{ ...baseEvent, ...overrides }}
        onSelect={vi.fn()}
        onToggleComplete={onToggleComplete}
      />
    </ScheduleActionsProvider>,
  )
  return { ...utils, onToggleComplete }
}

describe('ScheduleItem — free events (desktop)', () => {
  it('a free event renders the Free chip and no checkbox', () => {
    renderRow({ isFree: true })
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.queryByLabelText('Mark complete')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Mark incomplete')).not.toBeInTheDocument()
  })

  it('a non-free event still renders the checkbox and no Free chip', () => {
    renderRow({ isFree: false })
    expect(screen.queryByText('Free')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Mark complete')).toBeInTheDocument()
  })

  it('clicking the calendar icon on a non-free event calls onToggleComplete', () => {
    const { onToggleComplete } = renderRow({ isFree: false })
    screen.getByLabelText('Mark complete').click()
    expect(onToggleComplete).toHaveBeenCalled()
  })
})
