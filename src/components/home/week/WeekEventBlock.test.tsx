import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { render } from '@/test/test-utils'
import { WeekEventBlock } from './WeekEventBlock'
import type { TimelineItem } from '@/types/timeline'

// Wrap with the same sensor configuration as WeekViewV2 — an 8px activation
// constraint so a click (no movement) fires normally and a drag (>8px) cancels
// the subsequent click. Without this, dnd-kit's default sensors intercept the
// pointer sequence and click handlers never fire in tests.
function DndWrapper({ children }: { children: ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )
  return <DndContext sensors={sensors}>{children}</DndContext>
}
const renderWithDnd = (ui: React.ReactElement) => render(<DndWrapper>{ui}</DndWrapper>)

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
      <DndWrapper>
        <WeekEventBlock item={mkItem({})} weekStart={weekStart} onSelect={onSelect} />
      </DndWrapper>,
    )
    await user.click(screen.getByText('Therapy appt'))
    expect(onSelect).toHaveBeenCalledWith('t1')
  })
})
