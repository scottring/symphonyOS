import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import { ScheduleItem } from './ScheduleItem'
import { useMobile } from '@/hooks/useMobile'
import type { TimelineItem } from '@/types/timeline'

// Controllable per-test — the desktop describe block below needs `false`
// (the calendar-icon checkbox and Free chip both live only in the desktop
// render), the mobile block needs `true` (mobile has no check-circle at all,
// but still needs its own Free chip and swipe no-op).
vi.mock('@/hooks/useMobile', () => ({ useMobile: vi.fn() }))

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
  beforeEach(() => { vi.mocked(useMobile).mockReturnValue(false) })

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

describe('ScheduleItem — free events (mobile)', () => {
  beforeEach(() => { vi.mocked(useMobile).mockReturnValue(true) })

  it('a free event renders the Free chip in the mobile meta row', () => {
    renderRow({ isFree: true })
    expect(screen.getByText('Free')).toBeInTheDocument()
  })

  it('a non-free event renders no Free chip', () => {
    renderRow({ isFree: false })
    expect(screen.queryByText('Free')).not.toBeInTheDocument()
  })

  it('a free event ignores a complete swipe', () => {
    const { container, onToggleComplete } = renderRow({ isFree: true })
    const card = container.querySelector('[data-selectable]') as HTMLElement
    fireEvent.touchStart(card, { touches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchMove(card, { touches: [{ clientX: 100, clientY: 100 }] }) // dx = -100, past the 80px commit threshold
    fireEvent.touchEnd(card)
    expect(onToggleComplete).not.toHaveBeenCalled()
  })
})
