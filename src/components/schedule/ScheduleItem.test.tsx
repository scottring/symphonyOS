import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleItem } from './ScheduleItem'
import type { TimelineItem } from '@/types/timeline'

// Force the mobile branch of ScheduleItem to render.
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => true }))

// Defensive: ScheduleItem's desktop branch calls useScheduleActionsContext,
// which throws without a provider. The mobile branch never reaches those
// sub-components today, but mocking the context here keeps these tests safe
// against future refactors that pull a context consumer into the mobile path.
vi.mock('@/contexts/ScheduleActionsContext', () => ({
  useScheduleActionsContext: () => ({
    onToggleTask: () => {},
    onStartMeeting: undefined,
  }),
  ScheduleActionsProvider: ({ children }: { children: React.ReactNode }) => children,
}))

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
  // The TimelineItem type carries the original entity; tests don't need it.
} as unknown as TimelineItem

function renderRow(overrides: Partial<TimelineItem> = {}) {
  const onToggleComplete = vi.fn()
  const onSelect = vi.fn()
  const utils = render(
    <ScheduleItem
      item={{ ...baseTask, ...overrides }}
      onSelect={onSelect}
      onToggleComplete={onToggleComplete}
    />,
  )
  // The mobile draggable card carries `data-selectable`.
  const card = utils.container.querySelector('[data-selectable]') as HTMLElement
  return { ...utils, card, onToggleComplete, onSelect }
}

function swipe(card: HTMLElement, fromX: number, toX: number) {
  fireEvent.touchStart(card, { touches: [{ clientX: fromX, clientY: 100 }] })
  fireEvent.touchMove(card, { touches: [{ clientX: toX, clientY: 100 }] })
  fireEvent.touchEnd(card)
}

describe('ScheduleItem — mobile swipe gesture', () => {
  beforeEach(() => vi.clearAllMocks())

  it('right-to-left swipe past the commit threshold fires complete', () => {
    const { card, onToggleComplete, onSelect } = renderRow()
    swipe(card, 200, 100) // dx = -100, past the 80px commit threshold
    expect(onToggleComplete).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('left-to-right swipe past the commit threshold fires edit (onSelect)', () => {
    const { card, onToggleComplete, onSelect } = renderRow()
    swipe(card, 100, 200) // dx = +100, past the 80px commit threshold
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onToggleComplete).not.toHaveBeenCalled()
  })

  it('does nothing below the commit threshold', () => {
    const { card, onToggleComplete, onSelect } = renderRow()
    swipe(card, 100, 150) // dx = +50, under 80px
    expect(onSelect).not.toHaveBeenCalled()
    expect(onToggleComplete).not.toHaveBeenCalled()
  })

  it('a primarily vertical drag is treated as scroll and fires nothing', () => {
    const { card, onToggleComplete, onSelect } = renderRow()
    fireEvent.touchStart(card, { touches: [{ clientX: 100, clientY: 100 }] })
    fireEvent.touchMove(card, { touches: [{ clientX: 110, clientY: 250 }] })
    fireEvent.touchEnd(card)
    expect(onSelect).not.toHaveBeenCalled()
    expect(onToggleComplete).not.toHaveBeenCalled()
  })
})
