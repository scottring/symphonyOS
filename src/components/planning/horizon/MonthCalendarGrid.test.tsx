// src/components/planning/horizon/MonthCalendarGrid.test.tsx
//
// The month rung draws WEEK STRIPS — the unit it places into — and nothing
// finer. It used to build 42 day cells under a `Sun Mon Tue…` header and then
// refuse every one of them; these tests hold the drawing to the decision.
//
// Week boundaries still follow the cadence config (`weekStartsOn`), never a
// hardcoded Sunday-first layout. See src/lib/cadence/config.ts.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MonthCalendarGrid } from './MonthCalendarGrid'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const tasks: Task[] = []
const events: CalendarEvent[] = []
const JULY = new Date(2026, 6, 1)
const NOW = new Date(2026, 6, 25)

describe('MonthCalendarGrid draws weeks, not days', () => {
  it('renders no weekday header and no day cells', () => {
    render(<MonthCalendarGrid month={JULY} tasks={tasks} events={events} weekStartsOn={0} now={NOW} />)
    expect(screen.queryByText('Tue')).not.toBeInTheDocument()
    expect(screen.queryByText('Sun')).not.toBeInTheDocument()
    // The 15th was a day cell in the old grid; nothing names a bare date now.
    expect(screen.queryByText('15')).not.toBeInTheDocument()
  })

  it('renders one row per week of the month', () => {
    const { container } = render(
      <MonthCalendarGrid month={JULY} tasks={tasks} events={events} weekStartsOn={0} now={NOW} />,
    )
    const rows = container.querySelectorAll('[data-testid^="week-col-"]')
    expect(rows.length).toBeGreaterThanOrEqual(5)
    expect(rows.length).toBeLessThanOrEqual(6)
  })

  it('marks the week that holds today', () => {
    const { container } = render(
      <MonthCalendarGrid month={JULY} tasks={tasks} events={events} weekStartsOn={0} now={NOW} />,
    )
    const current = container.querySelectorAll('[data-current-week="true"]')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('this week')
  })
})

describe('MonthCalendarGrid week-start ordering', () => {
  it('defaults to Sunday-first (weekStartsOn 0)', () => {
    render(<MonthCalendarGrid month={JULY} tasks={tasks} events={events} weekStartsOn={0} now={NOW} />)
    // First row of July 2026, Sunday-first, starts Sun Jun 28.
    expect(screen.getByTestId('week-col-0')).toHaveTextContent('Jun 28')
  })

  it('honors weekStartsOn 1 (Monday-first)', () => {
    render(<MonthCalendarGrid month={JULY} tasks={tasks} events={events} weekStartsOn={1} now={NOW} />)
    // Monday-first shifts the first row to Mon Jun 29.
    expect(screen.getByTestId('week-col-0')).toHaveTextContent('Jun 29')
  })
})

describe('MonthCalendarGrid seam — Open week chip', () => {
  it('shows "Open week →" on row hover and calls onOpenWeek with that row\'s week start', () => {
    const onOpenWeek = vi.fn()
    render(
      <MonthCalendarGrid
        month={JULY} tasks={tasks} events={events}
        weekStartsOn={1} onOpenWeek={onOpenWeek} now={NOW}
      />,
    )
    expect(screen.queryByText('Open week →')).not.toBeInTheDocument()

    // Monday-first: row 0 = Jun 29, row 1 = Jul 6, row 2 = Jul 13.
    fireEvent.mouseEnter(screen.getByTestId('week-col-2'))
    fireEvent.click(screen.getByText('Open week →'))

    expect(onOpenWeek).toHaveBeenCalledTimes(1)
    const weekStart: Date = onOpenWeek.mock.calls[0][0]
    expect(weekStart.getFullYear()).toBe(2026)
    expect(weekStart.getMonth()).toBe(6)
    expect(weekStart.getDate()).toBe(13)
  })

  it('renders no chip without onOpenWeek', () => {
    render(<MonthCalendarGrid month={JULY} tasks={tasks} events={events} weekStartsOn={1} now={NOW} />)
    fireEvent.mouseEnter(screen.getByTestId('week-col-2'))
    expect(screen.queryByText('Open week →')).not.toBeInTheDocument()
  })
})

// ── The row is the drop target, because the month rung's one decision is
// "which week" — not which Tuesday. ──
describe('MonthCalendarGrid week placement', () => {
  const monthTask = (over: Partial<Task>): Task => ({
    id: 'rock', title: 'Order the vanity', completed: false, bucket: 'month',
    createdAt: new Date(), updatedAt: new Date(), ...over,
  })

  it('dropping on a row places the rock on that ROW\'s week', () => {
    const onPlaceTasksInWeek = vi.fn()
    render(
      <MonthCalendarGrid
        month={JULY} tasks={[monthTask({})]} events={events}
        weekStartsOn={1} onPlaceTasksInWeek={onPlaceTasksInWeek} now={NOW}
      />,
    )
    fireEvent.drop(screen.getByTestId('week-col-2'), {
      dataTransfer: { getData: (f: string) => (f === 'text/task-id' ? 'rock' : '') },
    })
    expect(onPlaceTasksInWeek).toHaveBeenCalledTimes(1)
    const [ids, weekStart] = onPlaceTasksInWeek.mock.calls[0]
    expect(ids).toEqual(['rock'])
    expect(weekStart.getMonth()).toBe(6)
    expect(weekStart.getDate()).toBe(13)
  })

  // Without the lane a dropped rock would have no date (no cell) and no longer
  // be bucket='month' (no shelf) — it would vanish, and vanishing reads as loss.
  it("shows a week-placed item in its row's lane, so a placement is visible", () => {
    render(
      <MonthCalendarGrid
        month={JULY}
        tasks={[monthTask({ id: 'placed', title: 'Book the mover', bucket: 'week', weekStart: new Date(2026, 6, 13) })]}
        events={events} weekStartsOn={1} onPlaceTasksInWeek={vi.fn()} now={NOW}
      />,
    )
    // It lands in ITS week's column (Mon-first: Jul 13–19 is column 2), not
    // loose on the page and not repeated across every column.
    expect(screen.getByTestId('week-col-2')).toHaveTextContent('Book the mover')
    expect(screen.getByTestId('week-col-1')).not.toHaveTextContent('Book the mover')
  })

  it('a legacy week item (no weekStart) appears in NO row — it has no week of its own', () => {
    render(
      <MonthCalendarGrid
        month={JULY}
        tasks={[monthTask({ id: 'legacy', title: 'Legacy week item', bucket: 'week' })]}
        events={events} weekStartsOn={1} onPlaceTasksInWeek={vi.fn()} now={NOW}
      />,
    )
    expect(screen.queryByText('Legacy week item')).not.toBeInTheDocument()
  })

  it('the rail asks for a week — the only grain this rung accepts', () => {
    render(
      <MonthCalendarGrid
        month={JULY} tasks={[monthTask({})]} events={events}
        weekStartsOn={1} onPlaceTasksInWeek={vi.fn()} now={NOW}
      />,
    )
    expect(screen.getByText(/Drag onto a week to place/)).toBeInTheDocument()
    expect(screen.queryByText(/Drag onto a day to place/)).not.toBeInTheDocument()
  })

  it('read-only rows place nothing', () => {
    const onPlaceTasksInWeek = vi.fn()
    render(
      <MonthCalendarGrid
        month={JULY} tasks={[monthTask({})]} events={events}
        weekStartsOn={1} onPlaceTasksInWeek={onPlaceTasksInWeek} readOnly now={NOW}
      />,
    )
    fireEvent.drop(screen.getByTestId('week-col-2'), {
      dataTransfer: { getData: (f: string) => (f === 'text/task-id' ? 'rock' : '') },
    })
    expect(onPlaceTasksInWeek).not.toHaveBeenCalled()
  })
})

describe('MonthCalendarGrid cluster drop', () => {
  const monthTask = (over: Partial<Task>): Task => ({
    id: 'rock', title: 'Order the vanity', completed: false, bucket: 'month',
    createdAt: new Date(), updatedAt: new Date(), ...over,
  })

  // Placing 24 moves one at a time is the actual chore the board exists to
  // kill, so a block header hands the whole cluster over in one gesture.
  it('a text/task-ids drop places every id in that row\'s week', () => {
    const onPlaceTasksInWeek = vi.fn()
    render(
      <MonthCalendarGrid
        month={JULY} tasks={[monthTask({})]} events={events}
        weekStartsOn={1} onPlaceTasksInWeek={onPlaceTasksInWeek} now={NOW}
      />,
    )
    fireEvent.drop(screen.getByTestId('week-col-2'), {
      dataTransfer: { getData: (f: string) => (f === 'text/task-ids' ? 'a,b,c' : '') },
    })
    expect(onPlaceTasksInWeek).toHaveBeenCalledTimes(1)
    const [ids, weekStart] = onPlaceTasksInWeek.mock.calls[0]
    expect(ids).toEqual(['a', 'b', 'c'])
    expect(weekStart.getDate()).toBe(13)
  })

  // Single pills never changed their payload — the new MIME type is purely
  // additive, so PlacementChip and the wizard keep working untouched.
  it('a text/task-id drop still places exactly one', () => {
    const onPlaceTasksInWeek = vi.fn()
    render(
      <MonthCalendarGrid
        month={JULY} tasks={[monthTask({})]} events={events}
        weekStartsOn={1} onPlaceTasksInWeek={onPlaceTasksInWeek} now={NOW}
      />,
    )
    fireEvent.drop(screen.getByTestId('week-col-2'), {
      dataTransfer: { getData: (f: string) => (f === 'text/task-id' ? 'rock' : '') },
    })
    expect(onPlaceTasksInWeek).toHaveBeenCalledWith(['rock'], expect.any(Date))
  })

  it('read-only rows refuse a cluster drop too', () => {
    const onPlaceTasksInWeek = vi.fn()
    render(
      <MonthCalendarGrid
        month={JULY} tasks={[monthTask({})]} events={events}
        weekStartsOn={1} onPlaceTasksInWeek={onPlaceTasksInWeek} readOnly now={NOW}
      />,
    )
    fireEvent.drop(screen.getByTestId('week-col-2'), {
      dataTransfer: { getData: (f: string) => (f === 'text/task-ids' ? 'a,b' : '') },
    })
    expect(onPlaceTasksInWeek).not.toHaveBeenCalled()
  })

  it('an empty payload places nothing', () => {
    const onPlaceTasksInWeek = vi.fn()
    render(
      <MonthCalendarGrid
        month={JULY} tasks={[monthTask({})]} events={events}
        weekStartsOn={1} onPlaceTasksInWeek={onPlaceTasksInWeek} now={NOW}
      />,
    )
    fireEvent.drop(screen.getByTestId('week-col-2'), {
      dataTransfer: { getData: () => '' },
    })
    expect(onPlaceTasksInWeek).not.toHaveBeenCalled()
  })
})

describe('MonthCalendarGrid week content', () => {
  it('names a multi-day claim in every week it spans, and counts the rest', () => {
    const trip = [
      { id: 'e1', title: 'Beech vacation', start_time: '2026-07-10T12:00:00Z', end_time: '2026-07-14T12:00:00Z', all_day: true },
    ] as unknown as CalendarEvent[]
    render(<MonthCalendarGrid month={JULY} tasks={tasks} events={trip} weekStartsOn={1} now={NOW} />)
    // Mon-first: Jul 10 falls in row 1 (Jul 6–12), Jul 14 in row 2 (Jul 13–19).
    expect(screen.getByTestId('week-col-1')).toHaveTextContent('Beech vacation')
    expect(screen.getByTestId('week-col-2')).toHaveTextContent('Beech vacation')
    expect(screen.getByTestId('week-col-0')).toHaveTextContent('nothing claimed yet')
  })
})

describe('MonthCalendarGrid hideRail', () => {
  it('hides the rail copy but keeps row drops working', () => {
    const onPlaceTasksInWeek = vi.fn()
    render(
      <MonthCalendarGrid
        month={JULY}
        tasks={[{ id: 'rock', title: 'Order the vanity', completed: false, bucket: 'month', createdAt: new Date(), updatedAt: new Date() } as Task]}
        events={events} weekStartsOn={1} onPlaceTasksInWeek={onPlaceTasksInWeek} hideRail now={NOW}
      />,
    )
    expect(screen.queryByText(/Drag onto a week to place/)).not.toBeInTheDocument()

    fireEvent.drop(screen.getByTestId('week-col-2'), {
      dataTransfer: { getData: (f: string) => (f === 'text/task-id' ? 'rock' : '') },
    })
    expect(onPlaceTasksInWeek).toHaveBeenCalledTimes(1)
    expect(onPlaceTasksInWeek.mock.calls[0][1].getDate()).toBe(13)
  })
})
