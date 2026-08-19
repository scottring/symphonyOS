import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import { ScheduleItem } from './ScheduleItem'
import type { TimelineItem } from '@/types/timeline'

// Desktop branch only — the "Today" chip is desktop-only (`hidden md:inline-flex`),
// mirroring the discussion flag it sits beside.
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => false }))

const baseItem: TimelineItem = {
  id: 'task-1',
  type: 'task',
  title: 'Call plumber',
  startTime: null,
  endTime: null,
  completed: false,
  originalTask: { id: '1', title: 'Call plumber' },
} as unknown as TimelineItem

function renderItem(item: Partial<TimelineItem>, ctxOverrides: Partial<ScheduleActionsValue> = {}) {
  const onSetNeededToday = vi.fn()
  const value = {
    onToggleTask: vi.fn(),
    projects: [], contacts: [], familyMembers: [], lists: [],
    onSetNeededToday,
    ...ctxOverrides,
  } as unknown as ScheduleActionsValue
  render(
    <ScheduleActionsProvider value={value}>
      <ScheduleItem
        item={{ ...baseItem, ...item } as TimelineItem}
        onSelect={vi.fn()}
        onToggleComplete={vi.fn()}
      />
    </ScheduleActionsProvider>
  )
  return { onSetNeededToday }
}

describe('ScheduleItem — needed today chip', () => {
  it('renders the "Today" chip when marked on the viewed day', () => {
    const viewedDate = new Date(2026, 7, 19)
    renderItem({ neededOn: new Date(2026, 7, 19, 8, 30) }, { viewedDate })
    expect(screen.getByText('Today')).toBeInTheDocument()
  })

  // The read model (src/lib/today/neededToday.ts) defines "marked" as
  // isSameDay(neededOn, viewedDate) — the mark expires by ceasing to match the
  // day, nothing ever clears the column. A stale mark from a different day must
  // NOT render the chip, or the note and the row disagree about the same task.
  it('does NOT render the chip for a task marked on a DIFFERENT day', () => {
    const yesterday = new Date(2026, 7, 18)
    const viewedDate = new Date(2026, 7, 19)
    renderItem({ neededOn: yesterday }, { viewedDate })
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
  })

  it('clicking the chip clears the mark', () => {
    const viewedDate = new Date(2026, 7, 19)
    const { onSetNeededToday } = renderItem(
      { neededOn: new Date(2026, 7, 19, 8, 30) },
      { viewedDate },
    )
    fireEvent.click(screen.getByText('Today'))
    expect(onSetNeededToday).toHaveBeenCalledWith('1', null)
  })

  it('does not render the chip once the task is completed', () => {
    const viewedDate = new Date(2026, 7, 19)
    renderItem({ neededOn: new Date(2026, 7, 19), completed: true }, { viewedDate })
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
  })

  // Regression: onSetNeededToday must stamp the VIEWED day, not the real
  // current day. A write of `new Date()` while browsing a different day would
  // disagree with the read side (isSameDay against viewedDate) — the click
  // would produce a mark with zero visible feedback: no chip here, and the
  // item would silently show up back on today's real page instead. This is a
  // full round trip (menu write → chip read) against a viewedDate far from the
  // real "now", so it fails on the pre-fix `new Date()` write regardless of
  // what day the suite happens to run on.
  it('marking via the menu while viewing a different day makes the chip appear on THAT day (not the real today)', () => {
    function StatefulItem() {
      const viewedDate = new Date(2026, 0, 5) // Jan 5, 2026 — not "real today"
      const [neededOn, setNeededOn] = useState<Date | undefined>(undefined)
      const value = {
        onToggleTask: vi.fn(),
        projects: [], contacts: [], familyMembers: [], lists: [],
        onSetNeededToday: (_id: string, d: Date | null) => setNeededOn(d ?? undefined),
        viewedDate,
      } as unknown as ScheduleActionsValue
      return (
        <ScheduleActionsProvider value={value}>
          <ScheduleItem
            item={{ ...baseItem, neededOn } as TimelineItem}
            onSelect={vi.fn()}
            onToggleComplete={vi.fn()}
          />
        </ScheduleActionsProvider>
      )
    }

    render(<StatefulItem />)
    expect(screen.queryByText('Today')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Item actions'))
    fireEvent.click(screen.getByText('Need today'))

    expect(screen.getByText('Today')).toBeInTheDocument()
  })
})
