import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, createEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import type { TimelineItem } from '@/types/timeline'
import { TodayDayScale } from './TodayDayScale'
import { PLAN_MIME } from '@/lib/planning/planDrag'

vi.mock('@/hooks/useTravelTime', () => ({ useTravelTime: () => null }))

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m)

function item(over: Partial<TimelineItem> & { id: string }): TimelineItem {
  return { type: 'task', title: over.id, startTime: null, endTime: null, completed: false, ...over } as TimelineItem
}

function renderScale(items: TimelineItem[], over: Record<string, unknown> = {}) {
  const props = {
    items, viewedDate: at(0), now: null, isMobile: false, selectedItemId: null,
    peopleOf: () => [], isReadOnlyEvent: () => false,
    onSelect: vi.fn(),
    ...over,
  }
  render(<DndContext><TodayDayScale {...props} /></DndContext>)
  return props
}

describe('TodayDayScale', () => {
  it('keeps recorded tasks visible but makes no open-time claims without calendar coverage', () => {
    renderScale([item({ id: 'task-library', title: 'Library books', startTime: at(10) })], { showOpenTime: false })
    expect(screen.getByRole('button', { name: 'Library books, 10:00 AM' })).toBeInTheDocument()
    expect(document.querySelectorAll('.today-scale-free')).toHaveLength(0)
  })

  it('draws every kind of thing the same way, and opens its details on a click', () => {
    const props = renderScale([
      item({ id: 'event-boxing', type: 'event', title: 'Boxing', startTime: at(9), endTime: at(10, 15) }),
      item({ id: 'task-pickup', title: 'School pickup', startTime: at(16) }),
      item({ id: 'routine-r1', type: 'routine', title: 'Meds', startTime: at(20) }),
    ])
    const boxing = screen.getByRole('button', { name: 'Boxing, 9:00 AM to 10:15 AM' })
    expect(boxing).toHaveTextContent('9:00–10:15 · Boxing')
    expect(screen.getByRole('button', { name: 'School pickup, 4:00 PM' })).toHaveTextContent('4:00 · School pickup')
    // One look: the same block class, no kind-specific styling.
    const blocks = [...document.querySelectorAll('.today-scale-item')]
    expect(blocks.map((b) => b.className.replace(/\s+/g, ' ').trim())).toEqual(['today-scale-item', 'today-scale-item', 'today-scale-item'])
    expect(screen.queryByRole('button', { name: /^Done: / })).toBeNull()
    fireEvent.click(boxing)
    expect(props.onSelect).toHaveBeenCalledWith('event-boxing')
  })

  it('gives a task and a routine a check that ticks it off, and an event none', () => {
    const onToggleDone = vi.fn()
    const props = renderScale([
      item({ id: 'event-boxing', type: 'event', title: 'Boxing', startTime: at(9), endTime: at(10) }),
      item({ id: 'task-pickup', title: 'School pickup', startTime: at(16) }),
      item({ id: 'routine-r1', type: 'routine', title: 'Meds', startTime: at(20), completed: true }),
    ], { onToggleDone })
    expect(screen.queryByRole('button', { name: /Boxing (in)?complete/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mark School pickup complete' }))
    expect(onToggleDone).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-pickup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark Meds incomplete' }))
    expect(onToggleDone).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'routine-r1' }))
    // Ticking off is not opening.
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('draws a step under its parent, not as its own block', () => {
    renderScale([
      item({ id: 'task-p', title: 'Pack', startTime: at(8) }),
      item({ id: 'task-c', title: 'Lunch box', startTime: at(8), isSubtask: true, parentTaskId: 'p' }),
    ])
    expect(screen.queryByText('Lunch box')).toBeNull()
  })

  it('takes a week row dropped on it, at the time it was dropped', () => {
    const onPlanDrop = vi.fn()
    renderScale([], { onPlanDrop })
    const track = screen.getByTestId('today-day-scale')
    // jsdom lays nothing out: pin the column's top so a y reads as a time.
    track.getBoundingClientRect = () => ({ top: 100, left: 0, right: 400, bottom: 800, width: 400, height: 700, x: 0, y: 100, toJSON: () => ({}) })
    const payload = { kind: 'task', id: 't1', date: '2026-10-06', title: 'Call the bank' }
    const dataTransfer = { types: [PLAN_MIME], getData: (k: string) => (k === PLAN_MIME ? JSON.stringify(payload) : ''), dropEffect: 'none' }
    // 7a at the top, 48px an hour: 100 + 7 × 48 is 2:00 PM.
    // jsdom has no DragEvent, so the pointer's y is set by hand.
    const drop = createEvent.drop(track, { dataTransfer })
    Object.defineProperty(drop, 'clientY', { value: 100 + 7 * 48 })
    fireEvent(track, drop)
    expect(onPlanDrop).toHaveBeenCalledOnce()
    const [got, when] = onPlanDrop.mock.calls[0]
    expect(got).toEqual(payload)
    expect([when.getHours(), when.getMinutes()]).toEqual([14, 0])
  })

  // Scott, 2026-10-30: "why can't I drag to resize in The Day grid?"
  it('drags a task’s bottom edge to a new end, in quarter hours', () => {
    const onResize = vi.fn()
    renderScale([
      item({ id: 'task-movie', title: 'Movie', startTime: at(18) }),
      item({ id: 'routine-r1', type: 'routine', title: 'Meds', startTime: at(20) }),
    ], { onResize })
    const handles = screen.getAllByTestId('scale-resize')
    expect(handles).toHaveLength(1) // a routine has no length of its own
    // 48px an hour: from the half hour a bare time gets, down 2h50m of pointer.
    fireEvent.pointerDown(handles[0], { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handles[0], { clientY: 100 + 48 * 2.75 + 3, pointerId: 1 })
    expect(screen.getByRole('button', { name: /^Movie, 6:00 PM to 9:15 PM/ })).toHaveTextContent('6:00–9:15 · Movie')
    fireEvent.pointerUp(handles[0], { clientY: 100 + 48 * 2.75 + 3, pointerId: 1 })
    expect(onResize).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-movie' }), at(21, 15))
  })

  it('offers no edge on a read-only event', () => {
    renderScale([
      item({ id: 'event-shared', type: 'event', title: 'Shared', startTime: at(9), endTime: at(10) }),
    ], { onResize: vi.fn(), isReadOnlyEvent: () => true })
    expect(screen.queryByTestId('scale-resize')).toBeNull()
  })
})
