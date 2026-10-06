import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import type { TimelineItem } from '@/types/timeline'
import { TodayDayScale } from './TodayDayScale'

vi.mock('@/hooks/useTravelTime', () => ({ useTravelTime: () => null }))

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m)

function item(over: Partial<TimelineItem> & { id: string }): TimelineItem {
  return { type: 'task', title: over.id, startTime: null, endTime: null, completed: false, ...over } as TimelineItem
}

function renderScale(items: TimelineItem[], over: Record<string, unknown> = {}) {
  const props = {
    items, viewedDate: at(0), now: null, isMobile: false, selectedItemId: null,
    peopleOf: () => [], isReadOnlyEvent: () => false,
    onToggleTask: vi.fn(), onCompleteRoutine: vi.fn(),
    renderRow: (i: TimelineItem) => <div>row for {i.title}</div>,
    ...over,
  }
  render(<DndContext><TodayDayScale {...props} /></DndContext>)
  return props
}

describe('TodayDayScale', () => {
  it('lifts a block’s own row into a card on a click, and puts it back on Escape', () => {
    renderScale([item({ id: 'event-boxing', type: 'event', title: 'Boxing', startTime: at(9), endTime: at(10, 15) })])
    const block = screen.getByRole('button', { name: 'Boxing, 9:00 AM to 10:15 AM' })
    expect(block).toHaveTextContent('9:00 – 10:15')
    fireEvent.click(block)
    expect(block).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('group', { name: 'Boxing' })).toHaveTextContent('row for Boxing')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('group', { name: 'Boxing' })).toBeNull()
  })

  it('ticks a timed task and a routine from the day, and offers no tick for an event', () => {
    const props = renderScale([
      item({ id: 'task-pickup', title: 'School pickup', startTime: at(16) }),
      item({ id: 'routine-r1#2', type: 'routine', title: 'Meds', startTime: at(20) }),
      item({ id: 'event-e', type: 'event', title: 'Marta', startTime: at(9, 30), endTime: at(11, 30) }),
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Done: School pickup' }))
    expect(props.onToggleTask).toHaveBeenCalledWith('pickup')
    fireEvent.click(screen.getByRole('button', { name: 'Done: Meds' }))
    expect(props.onCompleteRoutine).toHaveBeenCalledWith('r1#2', true)
    expect(screen.queryByRole('button', { name: 'Done: Marta' })).toBeNull()
  })

  it('draws a step under its parent, not as its own block', () => {
    renderScale([
      item({ id: 'task-p', title: 'Pack', startTime: at(8) }),
      item({ id: 'task-c', title: 'Lunch box', startTime: at(8), isSubtask: true, parentTaskId: 'p' }),
    ])
    expect(screen.queryByText('Lunch box')).toBeNull()
  })
})
