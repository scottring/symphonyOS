import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { render } from '@/test/test-utils'
import { WeekEventBlock, laneCalcStrings, titleLinesFor } from './WeekEventBlock'
import type { TimelineItem } from '@/types/timeline'
import type { PlacedItem } from './layoutLanes'

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

// mkItem creates items on May 20 (Wednesday); weekStart is May 17 (Sunday) → dayIdx = 3
function mkPlaced(itemOverrides: Partial<TimelineItem> = {}, placed: Partial<Omit<PlacedItem, 'item'>> = {}): PlacedItem {
  return {
    item: mkItem(itemOverrides),
    dayIdx: 3,
    laneIdx: 0,
    laneCount: 1,
    ...placed,
  }
}

describe('WeekEventBlock', () => {
  const weekStart = new Date(2026, 4, 17) // Sun May 17

  it('renders the title', () => {
    renderWithDnd(
      <WeekEventBlock placedItem={mkPlaced()} weekStart={weekStart} onSelect={vi.fn()} />,
    )
    expect(screen.getByText('Therapy appt')).toBeInTheDocument()
  })

  it('renders a "Routine — view only" hint when item is a routine', () => {
    renderWithDnd(
      <WeekEventBlock
        placedItem={mkPlaced({ type: 'routine', title: 'Brush teeth' })}
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
        <WeekEventBlock placedItem={mkPlaced()} weekStart={weekStart} onSelect={onSelect} />
      </DndWrapper>,
    )
    await user.click(screen.getByText('Therapy appt'))
    expect(onSelect).toHaveBeenCalledWith('t1')
  })

  it('halves the block width when laneCount is 2', () => {
    // happy-dom silently drops calc() strings from inline styles, so we test
    // the pure laneCalcStrings helper directly rather than inspecting the DOM.
    const { left, width } = laneCalcStrings(0, 1, 2)
    expect(width).toContain('/ 2')
    expect(left).toContain('+ ')
  })

  it('uses dayCount=5 in the column divisor for Workweek', () => {
    // Verify that passing dayCount=5 causes the calc strings to divide by 5
    // instead of the default 7, enabling the Workweek (Mon–Fri) view.
    const { left, width } = laneCalcStrings(0, 0, 1, 5)
    expect(left).toContain('/ 5')
    expect(width).toContain('/ 5')
  })
})

describe('titleLinesFor', () => {
  // A block may clip, but it shows as many title lines as its height holds,
  // so the first words name the item without hovering. Height is time, so
  // the count comes FROM the height — the block never grows to fit the title.
  it('gives a minimum-height block one line', () => {
    expect(titleLinesFor(24, {})).toBe(1)
  })
  it('gives a half-hour task block one line', () => {
    expect(titleLinesFor(30, {})).toBe(1)
  })
  it('gives an hour-long task block three lines', () => {
    expect(titleLinesFor(60, {})).toBe(3)
  })
  it('reserves a line for the subtitle', () => {
    expect(titleLinesFor(60, { hasSubtitle: true })).toBe(2)
  })
  it('fits more routine lines in the same height, since routine text is smaller', () => {
    expect(titleLinesFor(60, { isRoutine: true })).toBe(3)
    expect(titleLinesFor(45, { isRoutine: true })).toBe(2)
  })
})

describe('WeekEventBlock title wrapping', () => {
  const weekStart = new Date(2026, 4, 17)
  it('clamps the title to the lines its height allows instead of truncating', () => {
    renderWithDnd(
      <WeekEventBlock placedItem={mkPlaced({ title: 'Rock Steady Boxing Class with Grandpa' })} weekStart={weekStart} onSelect={vi.fn()} />,
    )
    const title = screen.getByText('Rock Steady Boxing Class with Grandpa')
    expect(title.className).not.toMatch(/\btruncate\b/)
    expect(title.getAttribute('data-title-lines')).toBe('3')
  })
})
