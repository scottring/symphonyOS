// src/components/planning/horizon/MonthCalendarGrid.test.tsx
//
// The month grid's week-start ordering must follow the cadence config
// (`weekStartsOn`), never a hardcoded Sunday-first layout. See
// src/lib/cadence/config.ts orderedWeekDays/orderedDayKeys — the single
// source of ordering for the app.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MonthCalendarGrid } from './MonthCalendarGrid'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const tasks: Task[] = []
const events: CalendarEvent[] = []

function firstCellDay(container: HTMLElement): string | null {
  // Day cells render their date in a trailing `<span>`; the day-number grid
  // is the second `grid-cols-7` block (the first is the weekday header row).
  const dayGrids = container.querySelectorAll('.grid.grid-cols-7')
  const dayGrid = dayGrids[1]
  const firstCell = dayGrid?.querySelector('span')
  return firstCell?.textContent ?? null
}

describe('MonthCalendarGrid week-start ordering', () => {
  it('defaults to Sunday-first (weekStartsOn 0): current behavior preserved', () => {
    const { container } = render(<MonthCalendarGrid month={new Date(2026, 6, 1)} tasks={tasks} events={events} weekStartsOn={0} />)
    const headers = screen.getAllByText(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/)
    expect(headers[0]).toHaveTextContent('Sun')
    // First cell of the grid is Sun Jun 28 2026.
    expect(firstCellDay(container)).toBe('28')
  })

  it('honors weekStartsOn 1 (Monday-first): header and first cell shift', () => {
    const { container } = render(<MonthCalendarGrid month={new Date(2026, 6, 1)} tasks={tasks} events={events} weekStartsOn={1} />)
    const headers = screen.getAllByText(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/)
    expect(headers[0]).toHaveTextContent('Mon')
    // First cell of the grid is Mon Jun 29 2026.
    expect(firstCellDay(container)).toBe('29')
  })
})

describe('MonthCalendarGrid seam — Open week chip', () => {
  it('shows "Open week →" on hover and calls onOpenWeek with the row\'s local-date week start', () => {
    const onOpenWeek = vi.fn()
    // July 2026, Monday-first: gridStart is Mon Jun 29; row 2 (Jul 13–19)
    // contains Wed Jul 15 — hovering it should open the week starting Mon Jul 13.
    render(
      <MonthCalendarGrid
        month={new Date(2026, 6, 1)}
        tasks={tasks}
        events={events}
        weekStartsOn={1}
        onOpenWeek={onOpenWeek}
      />
    )

    expect(screen.queryByText('Open week →')).not.toBeInTheDocument()

    const dayCell = screen.getByText('15').closest('div')
    expect(dayCell).not.toBeNull()
    fireEvent.mouseEnter(dayCell!)

    const chip = screen.getByText('Open week →')
    expect(chip).toBeInTheDocument()

    fireEvent.click(chip)
    expect(onOpenWeek).toHaveBeenCalledTimes(1)
    const weekStart: Date = onOpenWeek.mock.calls[0][0]
    expect(weekStart.getFullYear()).toBe(2026)
    expect(weekStart.getMonth()).toBe(6) // July (0-indexed)
    expect(weekStart.getDate()).toBe(13) // Monday of that row
  })

  it('renders no chip without onOpenWeek', () => {
    const { container } = render(
      <MonthCalendarGrid month={new Date(2026, 6, 1)} tasks={tasks} events={events} weekStartsOn={1} />
    )
    const dayCell = screen.getByText('15').closest('div')
    fireEvent.mouseEnter(dayCell!)
    expect(screen.queryByText('Open week →')).not.toBeInTheDocument()
    expect(container).toBeTruthy()
  })
})

// ── Week mode: the row is the drop target, because the month rung's one
// decision is "which week" — not which Tuesday. ──
describe('MonthCalendarGrid week placement', () => {
  const monthTask = (over: Partial<Task>): Task => ({
    id: 'rock', title: 'Order the vanity', completed: false, bucket: 'month',
    createdAt: new Date(), updatedAt: new Date(), ...over,
  })

  it('dropping anywhere in a row places the rock on that ROW\'s week', () => {
    const onPlaceTaskInWeek = vi.fn()
    render(
      <MonthCalendarGrid
        month={new Date(2026, 6, 1)}
        tasks={[monthTask({})]}
        events={events}
        weekStartsOn={1}
        onPlaceTaskInWeek={onPlaceTaskInWeek}
      />
    )
    // July 2026 Monday-first: the row holding Wed Jul 15 starts Mon Jul 13.
    const cell = screen.getByText('15').closest('div')!
    fireEvent.drop(cell, {
      dataTransfer: { getData: (f: string) => (f === 'text/task-id' ? 'rock' : '') },
    })
    expect(onPlaceTaskInWeek).toHaveBeenCalledTimes(1)
    const [taskId, weekStart] = onPlaceTaskInWeek.mock.calls[0]
    expect(taskId).toBe('rock')
    expect(weekStart.getMonth()).toBe(6)
    expect(weekStart.getDate()).toBe(13) // the row's Monday, not the 15th
  })

  it('a day cell no longer places by day when the caller is in week mode', () => {
    const onPlaceTask = vi.fn()
    const onPlaceTaskInWeek = vi.fn()
    render(
      <MonthCalendarGrid
        month={new Date(2026, 6, 1)}
        tasks={[monthTask({})]}
        events={events}
        weekStartsOn={1}
        onPlaceTask={onPlaceTask}
        onPlaceTaskInWeek={onPlaceTaskInWeek}
      />
    )
    fireEvent.drop(screen.getByText('15').closest('div')!, {
      dataTransfer: { getData: (f: string) => (f === 'text/task-id' ? 'rock' : '') },
    })
    expect(onPlaceTask).not.toHaveBeenCalled()
    expect(onPlaceTaskInWeek).toHaveBeenCalledTimes(1)
  })

  // Without the lane a dropped rock would have no date (no cell) and no longer
  // be bucket='month' (no shelf) — it would vanish, and vanishing reads as loss.
  it("shows a week-placed item in its row's lane, so a placement is visible", () => {
    render(
      <MonthCalendarGrid
        month={new Date(2026, 6, 1)}
        tasks={[monthTask({ id: 'placed', title: 'Book the mover', bucket: 'week', weekStart: new Date(2026, 6, 13) })]}
        events={events}
        weekStartsOn={1}
        onPlaceTaskInWeek={vi.fn()}
      />
    )
    expect(screen.getByText('Book the mover')).toBeInTheDocument()
    expect(screen.getAllByText('This week')).toHaveLength(1) // exactly one row's lane
  })

  it('a legacy week item (no weekStart) appears in NO row — it has no week of its own', () => {
    render(
      <MonthCalendarGrid
        month={new Date(2026, 6, 1)}
        tasks={[monthTask({ id: 'legacy', title: 'Legacy week item', bucket: 'week' })]}
        events={events}
        weekStartsOn={1}
        onPlaceTaskInWeek={vi.fn()}
      />
    )
    // Would otherwise repeat in all six rows.
    expect(screen.queryByText('Legacy week item')).not.toBeInTheDocument()
    expect(screen.queryByText('This week')).not.toBeInTheDocument()
  })

  it('renders no lane and keeps day drops when no week handler is given', () => {
    const onPlaceTask = vi.fn()
    render(
      <MonthCalendarGrid
        month={new Date(2026, 6, 1)}
        tasks={[monthTask({ id: 'placed', title: 'Book the mover', bucket: 'week', weekStart: new Date(2026, 6, 13) })]}
        events={events}
        weekStartsOn={1}
        onPlaceTask={onPlaceTask}
      />
    )
    expect(screen.queryByText('This week')).not.toBeInTheDocument()
    fireEvent.drop(screen.getByText('15').closest('div')!, {
      dataTransfer: { getData: (f: string) => (f === 'text/task-id' ? 'placed' : '') },
    })
    expect(onPlaceTask).toHaveBeenCalledTimes(1)
    expect(onPlaceTask.mock.calls[0][1].getDate()).toBe(15)
  })
})

describe('MonthCalendarGrid hideRail', () => {
  it('hides the rail text when hideRail=true but still calls onPlaceTask on cell drop', () => {
    const onPlaceTask = vi.fn()
    const taskWithSchedule: Task = {
      id: 'task-1',
      title: 'Test Task',
      completed: false,
      bucket: 'timed',
      scheduledFor: new Date(2026, 6, 10),
      sourceId: null,
      context: null,
      created_at: new Date(),
      updated_at: new Date(),
    }

    render(
      <MonthCalendarGrid
        month={new Date(2026, 6, 1)}
        tasks={[taskWithSchedule]}
        events={events}
        onPlaceTask={onPlaceTask}
        hideRail={true}
      />
    )

    // Rail text should not be present
    expect(screen.queryByText(/Drag onto a day to schedule/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Drag a scheduled item here to unschedule/)).not.toBeInTheDocument()

    // But cell drop should still work: drag task-1 onto day 15
    const dayCell = screen.getByText('15').closest('div')
    expect(dayCell).not.toBeNull()

    fireEvent.dragOver(dayCell!, {
      dataTransfer: { getData: () => 'task-1' },
      preventDefault: vi.fn(),
    })

    fireEvent.drop(dayCell!, {
      dataTransfer: { getData: (format: string) => format === 'text/task-id' ? 'task-1' : '' },
      preventDefault: vi.fn(),
    })

    expect(onPlaceTask).toHaveBeenCalledTimes(1)
    const [taskId, targetDate] = onPlaceTask.mock.calls[0]
    expect(taskId).toBe('task-1')
    expect(targetDate.getDate()).toBe(15)
  })
})
