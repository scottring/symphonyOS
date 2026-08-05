import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { RowActionRail } from './RowActionRail'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import type { TimelineItem } from '@/types/timeline'

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

function renderRail(overrides: Partial<TimelineItem> = {}, variant: 'full' | 'minimal' = 'full') {
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
      <RowActionRail
        item={{ ...baseTask, ...overrides } as TimelineItem}
        variant={variant}
        onSelect={vi.fn()}
        onContextChange={vi.fn()}
        onUpdateDiscussion={vi.fn()}
        onAssignAll={vi.fn()}
        familyMembers={[]}
        assignedToAll={[]}
      />
    </ScheduleActionsProvider>
  )
}

const slots = (container: HTMLElement) => container.querySelectorAll('[data-rail-slot]')

// Slot order: assignee | context | verb | overflow. Named rather than inlined
// so re-ordering the rail is one edit here, not a hunt through every index —
// these tests care WHICH control sits in a cell, not where the cell falls.
const WHO = 0
const CONTEXT = 1
const VERB = 2
const OVERFLOW = 3
/** The three plain 28px icon cells — everything except the wider assignee cell. */
const ICON_SLOTS = [CONTEXT, VERB, OVERFLOW]

describe('RowActionRail', () => {
  // The whole point of the rail: the same number of cells on every row, so the
  // controls form columns down the page. Before this, a task rendered six
  // trailing controls, an event five, a routine three — and nothing lined up.
  describe('always four slots, whatever the row is', () => {
    const cases: Array<[string, Partial<TimelineItem>, 'full' | 'minimal']> = [
      ['an open task', { type: 'task' }, 'full'],
      ['a completed task', { type: 'task', completed: true }, 'full'],
      ['a waiting task', { type: 'task', isWaiting: true }, 'full'],
      ['an open routine', { type: 'routine', id: 'routine-1' }, 'full'],
      ['a routine on the minimal variant', { type: 'routine', id: 'routine-1' }, 'minimal'],
      ['a skipped routine', { type: 'routine', id: 'routine-1', skipped: true }, 'full'],
      ['a timed event', { type: 'event', id: 'event-1', allDay: false }, 'full'],
      ['an all-day event', { type: 'event', id: 'event-1', allDay: true }, 'full'],
    ]

    it.each(cases)('renders exactly four slots for %s', (_label, overrides, variant) => {
      const { container } = renderRail(overrides, variant)
      expect(slots(container)).toHaveLength(4)
    })
  })

  describe('the verb slot', () => {
    it('holds Reschedule for an open task', () => {
      const { container } = renderRail({ type: 'task' })
      expect(slots(container)[VERB].querySelector('[aria-label="Reschedule"]')).toBeTruthy()
    })

    it('holds Skip today for an open routine', () => {
      const { container } = renderRail({ type: 'routine', id: 'routine-1' })
      expect(slots(container)[VERB].querySelector('[aria-label="Skip today"]')).toBeTruthy()
    })

    it('holds Start meeting for a timed event', () => {
      const { container } = renderRail({ type: 'event', id: 'event-1', allDay: false })
      expect(slots(container)[VERB].querySelector('[aria-label="Start meeting"]')).toBeTruthy()
    })

    it('is empty — but still present — on a completed task', () => {
      const { container } = renderRail({ type: 'task', completed: true })
      expect(slots(container)[VERB].querySelector('button')).toBeNull()
      expect(slots(container)).toHaveLength(4)
    })

    it('is empty on an all-day event, which has no meeting to start', () => {
      const { container } = renderRail({ type: 'event', id: 'event-1', allDay: true })
      expect(slots(container)[VERB].querySelector('button')).toBeNull()
    })

    it('never holds more than one verb', () => {
      for (const [, overrides, variant] of [
        ['t', { type: 'task' }, 'full'],
        ['r', { type: 'routine', id: 'routine-1' }, 'full'],
        ['e', { type: 'event', id: 'event-1', allDay: false }, 'full'],
      ] as Array<[string, Partial<TimelineItem>, 'full' | 'minimal']>) {
        const { container, unmount } = renderRail(overrides, variant)
        expect(slots(container)[VERB].querySelectorAll('button').length).toBeLessThanOrEqual(1)
        unmount()
      }
    })
  })

  describe('the overflow slot', () => {
    it('holds the actions menu on the full variant', () => {
      const { container } = renderRail({ type: 'task' })
      expect(slots(container)[OVERFLOW].querySelector('[aria-label="Item actions"]')).toBeTruthy()
    })

    it('is empty on the minimal variant, which drops the menu', () => {
      const { container } = renderRail({ type: 'routine', id: 'routine-1' }, 'minimal')
      expect(slots(container)[OVERFLOW].querySelector('[aria-label="Item actions"]')).toBeNull()
    })
  })

  describe('sizing', () => {
    it('gives the three icon slots the same 28px box', () => {
      const { container } = renderRail({ type: 'task' })
      ICON_SLOTS.map((i) => slots(container)[i]).forEach((slot) => {
        expect(slot.className).toContain('w-7')
        expect(slot.className).toContain('h-7')
      })
    })

    // The avatar stack is 24px for one person and 72px for four. Sizing it to
    // content would shove its neighbouring cells around whenever assignees
    // change — the bug the rail exists to kill. Reserving the max is what makes
    // the slot order a free choice.
    it('reserves the full avatar-stack width and right-aligns it', () => {
      const { container } = renderRail({ type: 'task' })
      const who = slots(container)[WHO]
      expect(who.className).toContain('w-[4.5rem]')
      expect(who.className).toContain('justify-end')
    })

    it('keeps the assignee cell the same width however many people are on it', () => {
      const one = renderRail({ type: 'task' })
      const oneWidth = slots(one.container)[WHO].className
      one.unmount()

      const many = renderRail({ type: 'task', assignedTo: 'a' })
      expect(slots(many.container)[WHO].className).toBe(oneWidth)
    })

    it('uses the 28px ContextPicker so it matches the other cells', () => {
      const { container } = renderRail({ type: 'task' })
      const trigger = slots(container)[CONTEXT].querySelector('[aria-label="Set context"]')
      expect(trigger?.className).toContain('p-1.5')
    })
  })
})
