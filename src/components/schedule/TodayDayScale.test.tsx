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
  it('draws every kind of thing the same way, and opens its details on a click', () => {
    const props = renderScale([
      item({ id: 'event-boxing', type: 'event', title: 'Boxing', startTime: at(9), endTime: at(10, 15) }),
      item({ id: 'task-pickup', title: 'School pickup', startTime: at(16) }),
      item({ id: 'routine-r1', type: 'routine', title: 'Meds', startTime: at(20) }),
    ])
    const boxing = screen.getByRole('button', { name: 'Boxing, 9:00 AM to 10:15 AM' })
    expect(boxing).toHaveTextContent('9:00–10:15 · Boxing')
    expect(screen.getByRole('button', { name: 'School pickup, 4:00 PM' })).toHaveTextContent('4:00 · School pickup')
    // One look: the same block class, no kind-specific styling, no checks.
    const blocks = [...document.querySelectorAll('.today-scale-item')]
    expect(blocks.map((b) => b.className.replace(/\s+/g, ' ').trim())).toEqual(['today-scale-item', 'today-scale-item', 'today-scale-item'])
    expect(screen.queryByRole('button', { name: /^Done: / })).toBeNull()
    fireEvent.click(boxing)
    expect(props.onSelect).toHaveBeenCalledWith('event-boxing')
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
})
