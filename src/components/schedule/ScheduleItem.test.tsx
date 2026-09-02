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

  // "Free" events are informational-only — no swipe-to-complete.
  it('a free event ignores a complete swipe', () => {
    const { card, onToggleComplete } = renderRow({ type: 'event', isFree: true })
    swipe(card, 200, 100) // dx = -100, past the 80px commit threshold
    expect(onToggleComplete).not.toHaveBeenCalled()
  })
})

describe('ScheduleItem — swipe runtime', () => {
  it('updates the card transform via inline style on touchmove', async () => {
    const { container } = render(
      <ScheduleItem
        item={baseTask}
        onSelect={vi.fn()}
        onToggleComplete={vi.fn()}
      />,
    )
    const card = container.querySelector('[data-selectable]') as HTMLElement
    fireEvent.touchStart(card, { touches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchMove(card, { touches: [{ clientX: 140, clientY: 100 }] })
    // Flush the rAF tick scheduled by touchmove.
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    // The card's inline transform must reflect the drag delta directly,
    // proving the gesture is driven by ref-based DOM writes rather than a
    // React re-render path.
    expect(card.style.transform).toMatch(/translateX\(-60px\)/)
  })
})

describe('ScheduleItem — static rows (no suggestion chips)', () => {
  it('does not render suggestion chips even when suggestions prop is passed', () => {
    const { queryByRole } = render(
      <ScheduleItem
        item={baseTask}
        onSelect={vi.fn()}
        onToggleComplete={vi.fn()}
        suggestions={[{ id: 'sg-1', title: 'Call now', suggestionType: 'call', actionType: 'call', actionPayload: { phoneNumber: '555-1234' } } as never]}
        onActSuggestion={vi.fn()}
      />,
    )
    // Suggestion chip buttons are not rendered anywhere in the row
    expect(queryByRole('button', { name: /call now/i })).toBeNull()
  })
})

// Per-person items (spec §4.4): the rows an extracted email writes under a
// block must be visible on the phone too — that is where they get read.
describe('ScheduleItem — per-person items inline (mobile)', () => {
  const members = [
    { id: 'm-liam', name: 'Liam', initials: 'L', color: 'blue' },
    { id: 'm-mia', name: 'Mia', initials: 'M', color: 'purple' },
  ] as never

  const emailBlock = {
    ...baseTask,
    id: 'task-picture-day',
    title: 'Picture Day',
    captureId: 'cap-1',
    subtaskCount: 2,
    subtaskCompletedCount: 0,
    originalTask: {
      id: 'picture-day',
      subtasks: [
        { id: 's1', title: 'Wear a collared shirt', completed: false, assignedTo: 'm-liam' },
        { id: 's2', title: 'Bring the order form', completed: false, assignedTo: 'm-mia' },
      ],
    },
  } as unknown as TimelineItem

  it('renders the assigned subtasks inline without expanding steps', () => {
    const { getByText } = render(
      <ScheduleItem
        item={emailBlock}
        familyMembers={members}
        onSelect={vi.fn()}
        onToggleComplete={vi.fn()}
      />,
    )
    expect(getByText('Wear a collared shirt')).toBeInTheDocument()
    expect(getByText('Bring the order form')).toBeInTheDocument()
    expect(getByText('L')).toBeInTheDocument()
  })

  it('completing an inline item calls onToggleSubtask with the subtask id', () => {
    const onToggleSubtask = vi.fn()
    const { getByRole } = render(
      <ScheduleItem
        item={emailBlock}
        familyMembers={members}
        onSelect={vi.fn()}
        onToggleComplete={vi.fn()}
        onToggleSubtask={onToggleSubtask}
      />,
    )
    fireEvent.click(getByRole('button', { name: 'Complete Wear a collared shirt' }))
    expect(onToggleSubtask).toHaveBeenCalledWith('s1')
  })

  // The card centres its columns, which is right for a one-line row and wrong
  // the moment the inline items make the title column tall: the time and the
  // type tile drifted to the vertical middle of the whole card, away from the
  // title they label. Desktop already pins its leading column with self-start
  // when anything renders below the title; the phone now mirrors that.
  it('top-aligns the leading columns when inline items make the row tall', () => {
    const { container } = render(
      <ScheduleItem
        item={emailBlock}
        familyMembers={members}
        onSelect={vi.fn()}
        onToggleComplete={vi.fn()}
      />,
    )
    const card = container.querySelector('[data-selectable]') as HTMLElement
    expect(card.className).toContain('items-start')
    expect(card.className).not.toContain('items-center')
  })

  it('keeps a plain one-line row centred', () => {
    const { container } = render(
      <ScheduleItem item={baseTask} onSelect={vi.fn()} onToggleComplete={vi.fn()} />,
    )
    const card = container.querySelector('[data-selectable]') as HTMLElement
    expect(card.className).toContain('items-center')
  })

  it('shows the "From an email" badge on a row with a captureId', () => {
    const { getByText } = render(
      <ScheduleItem item={emailBlock} onSelect={vi.fn()} onToggleComplete={vi.fn()} />,
    )
    expect(getByText('From an email')).toBeInTheDocument()
  })

  it('shows no badge and no inline items for plain subtasks with no captureId', () => {
    const { queryByText } = render(
      <ScheduleItem
        item={{
          ...baseTask,
          subtaskCount: 1,
          subtaskCompletedCount: 0,
          originalTask: {
            id: 'plain',
            subtasks: [{ id: 's9', title: 'Research destinations', completed: false }],
          },
        } as unknown as TimelineItem}
        onSelect={vi.fn()}
        onToggleComplete={vi.fn()}
      />,
    )
    expect(queryByText('Research destinations')).toBeNull()
    expect(queryByText('From an email')).toBeNull()
  })

  it('does not render an already-completed per-person item', () => {
    const { queryByText } = render(
      <ScheduleItem
        item={{
          ...emailBlock,
          originalTask: {
            id: 'picture-day',
            subtasks: [
              { id: 's1', title: 'Wear a collared shirt', completed: true, assignedTo: 'm-liam' },
            ],
          },
        } as unknown as TimelineItem}
        familyMembers={members}
        onSelect={vi.fn()}
        onToggleComplete={vi.fn()}
      />,
    )
    expect(queryByText('Wear a collared shirt')).toBeNull()
  })
})

// Projects are HIDDEN from the product (2026-09-02). The mobile card used to
// carry a Tag icon and put the project name on its small context line.
describe('ScheduleItem — Projects hidden (mobile card)', () => {
  it('never shows the project name on the mobile context line', () => {
    const { queryByText } = render(
      <ScheduleItem
        item={{ ...baseTask, projectId: 'proj-1' } as TimelineItem}
        projectName="Kitchen renovation"
        projectId="proj-1"
        onSelect={vi.fn()}
        onToggleComplete={vi.fn()}
      />,
    )
    expect(queryByText('Kitchen renovation')).toBeNull()
  })
})
