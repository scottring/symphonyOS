import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import { ScheduleItem } from './ScheduleItem'
import type { TimelineItem } from '@/types/timeline'

// Mobile card has NO entry point today — this is what Task 7 adds. The mobile
// card renders on a completely separate early-return branch in ScheduleItem
// (no RowActionRail, no '...' menu), so this needs its own mock + tests
// distinct from ScheduleItem.neededToday.test.tsx (desktop chip).
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => true }))

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

describe('ScheduleItem — mobile needed today control', () => {
  it('marks the task as needed today, stamping the viewed day', () => {
    const viewedDate = new Date(2026, 7, 19)
    const { onSetNeededToday } = renderItem({ neededOn: undefined }, { viewedDate })

    fireEvent.click(screen.getByLabelText('Need today'))

    expect(onSetNeededToday).toHaveBeenCalledWith('1', viewedDate)
  })

  it('clears the mark when already marked on the viewed day', () => {
    const viewedDate = new Date(2026, 7, 19)
    const { onSetNeededToday } = renderItem(
      { neededOn: new Date(2026, 7, 19, 8, 30) },
      { viewedDate },
    )

    fireEvent.click(screen.getByLabelText('Not needed today'))

    expect(onSetNeededToday).toHaveBeenCalledWith('1', null)
  })

  // Regression guard — the same bug that bit the desktop chip/menu twice:
  // "marked" must be isSameDay(neededOn, viewedDate), not bare truthiness of
  // neededOn. A mark left over from a different day must read as UNMARKED, so
  // tapping the control marks it (viewedDate), not clears it (null).
  it('treats a task marked on a DIFFERENT day as unmarked', () => {
    const yesterday = new Date(2026, 7, 18)
    const viewedDate = new Date(2026, 7, 19)
    const { onSetNeededToday } = renderItem({ neededOn: yesterday }, { viewedDate })

    expect(screen.getByLabelText('Need today')).toBeInTheDocument()
    expect(screen.queryByLabelText('Not needed today')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Need today'))
    expect(onSetNeededToday).toHaveBeenCalledWith('1', viewedDate)
  })

  // The desktop chip has always carried `!item.completed`; the mobile control
  // didn't, so a finished task kept a live amber marker on phones only.
  it('hides the control once the task is completed', () => {
    renderItem(
      { completed: true, neededOn: new Date(2026, 7, 19) },
      { viewedDate: new Date(2026, 7, 19) },
    )

    expect(screen.queryByLabelText('Not needed today')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Need today')).not.toBeInTheDocument()
  })

  it('falls back to "now" when no viewedDate is supplied by the provider', () => {
    const { onSetNeededToday } = renderItem({ neededOn: undefined }, { viewedDate: undefined })

    fireEvent.click(screen.getByLabelText('Need today'))

    expect(onSetNeededToday).toHaveBeenCalledTimes(1)
    const [, arg] = onSetNeededToday.mock.calls[0]
    expect(arg).toBeInstanceOf(Date)
  })
})
