import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { render } from '@/test/test-utils'
import { WeekEventBlock } from './WeekEventBlock'
import type { TimelineItem } from '@/types/timeline'

const renderWithDnd = (ui: React.ReactElement) => render(<DndContext>{ui}</DndContext>)

function mkItem(overrides: Partial<TimelineItem>): TimelineItem {
  const start = new Date(2026, 4, 20, 13, 0)
  const end = new Date(2026, 4, 20, 14, 0)
  return {
    id: 't1',
    type: 'task',
    title: 'Therapy appt',
    completed: false,
    startTime: start,
    endTime: end,
    allDay: false,
    ...overrides,
  } as TimelineItem
}

describe('WeekEventBlock', () => {
  const weekStart = new Date(2026, 4, 17) // Sun May 17

  it('renders the title', () => {
    renderWithDnd(
      <WeekEventBlock item={mkItem({})} weekStart={weekStart} onSelect={vi.fn()} />,
    )
    expect(screen.getByText('Therapy appt')).toBeInTheDocument()
  })

  it('renders a "Routine — view only" hint when item is a routine', () => {
    renderWithDnd(
      <WeekEventBlock
        item={mkItem({ type: 'routine', title: 'Brush teeth' })}
        weekStart={weekStart}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/routine.*view only/i)).toBeInTheDocument()
  })

  it('calls onSelect with item.id when clicked', async () => {
    const onSelect = vi.fn()
    const { user } = render(
      <DndContext>
        <WeekEventBlock item={mkItem({})} weekStart={weekStart} onSelect={onSelect} />
      </DndContext>,
    )
    await user.click(screen.getByText('Therapy appt'))
    expect(onSelect).toHaveBeenCalledWith('t1')
  })
})
