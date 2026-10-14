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

function renderRail(overrides: Partial<TimelineItem> = {}) {
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
        onContextChange={vi.fn()}
        onAssignAll={vi.fn()}
        familyMembers={[]}
        assignedToAll={[]}
      />
    </ScheduleActionsProvider>
  )
}

const slots = (container: HTMLElement) => container.querySelectorAll('[data-rail-slot]')

// Slot order: assignee | context | verb | spare. Named rather than inlined
// so re-ordering the rail is one edit here, not a hunt through every index —
// these tests care WHICH control sits in a cell, not where the cell falls.
const WHO = 0
const CONTEXT = 1
const VERB = 2
const SPARE = 3
/** The three plain 28px icon cells — everything except the wider assignee cell. */
const ICON_SLOTS = [CONTEXT, VERB, SPARE]

describe('RowActionRail', () => {
  // The whole point of the rail: the same number of cells on every row, so the
  // controls form columns down the page. Before this, a task rendered six
  // trailing controls, an event five, a routine three — and nothing lined up.
  describe('always four slots, whatever the row is', () => {
    const cases: Array<[string, Partial<TimelineItem>]> = [
      ['an open task', { type: 'task' }],
      ['a completed task', { type: 'task', completed: true }],
      ['a waiting task', { type: 'task', isWaiting: true }],
      ['an open routine', { type: 'routine', id: 'routine-1' }],
      ['a skipped routine', { type: 'routine', id: 'routine-1', skipped: true }],
      ['a timed event', { type: 'event', id: 'event-1', allDay: false }],
      ['an all-day event', { type: 'event', id: 'event-1', allDay: true }],
    ]

    it.each(cases)('renders exactly four slots for %s', (_label, overrides) => {
      const { container } = renderRail(overrides)
      expect(slots(container)).toHaveLength(4)
    })
  })

  describe('the verb slot', () => {
    // Today, trimmed (2026-10-14): a task row is tick, drag and tap — its day
    // and time change in the item panel.
    it('is empty on an open task — no Reschedule button', () => {
      const { container } = renderRail({ type: 'task' })
      expect(slots(container)[VERB].querySelector('button')).toBeNull()
      expect(container.querySelector('[aria-label="Reschedule"]')).toBeNull()
    })

    it('holds Move or skip for an open routine', () => {
      const { container } = renderRail({ type: 'routine', id: 'routine-1' })
      expect(slots(container)[VERB].querySelector('[aria-label="Move or skip"]')).toBeTruthy()
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
      for (const overrides of [
        { type: 'task' },
        { type: 'routine', id: 'routine-1' },
        { type: 'event', id: 'event-1', allDay: false },
      ] as Array<Partial<TimelineItem>>) {
        const { container, unmount } = renderRail(overrides)
        expect(slots(container)[VERB].querySelectorAll('button').length).toBeLessThanOrEqual(1)
        unmount()
      }
    })
  })

  // The row ⋯ menu is gone; its cell stays, empty, so the rail is as wide as
  // RoutineCollectionRow's and the people column still lines up.
  describe('the spare slot', () => {
    it.each([
      ['a task', { type: 'task' }],
      ['a routine', { type: 'routine', id: 'routine-1' }],
      ['an event', { type: 'event', id: 'event-1', allDay: false }],
    ] as Array<[string, Partial<TimelineItem>]>)('is empty on %s — no Item actions menu', (_l, overrides) => {
      const { container } = renderRail(overrides)
      expect(slots(container)[SPARE].childElementCount).toBe(0)
      expect(container.querySelector('[aria-label="Item actions"]')).toBeNull()
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
      // 3 initials + "+N" at 24px with -4px overlap = 84px (layout system).
      expect(who.className).toContain('w-[5.25rem]')
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
