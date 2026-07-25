// The year landscape answers ONE question — what is already claimed this year —
// and every assertion here is about keeping it at that altitude.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { YearCalendarGrid } from './YearCalendarGrid'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const YEAR = 2026

function task(title: string, month: number, day = 15): Task {
  return {
    id: `t-${title}`, title, completed: false, bucket: 'timed',
    scheduledFor: new Date(YEAR, month, day),
    createdAt: new Date(), updatedAt: new Date(),
  } as Task
}
function event(title: string, month: number, day = 10): CalendarEvent {
  return { id: `e-${title}`, title, start_time: new Date(YEAR, month, day, 9).toISOString() } as CalendarEvent
}

describe('YearCalendarGrid', () => {
  it('names calendar claims but only COUNTS tasks', () => {
    render(<YearCalendarGrid year={YEAR} tasks={[task('Lay out clothes for the interview', 6)]} events={[event('Summer camp', 6)]} />)
    expect(screen.getByText('Summer camp')).toBeInTheDocument()
    // The leak this view used to have: a Today-altitude errand read on the year page.
    expect(screen.queryByText('Lay out clothes for the interview')).not.toBeInTheDocument()
    expect(screen.getByText('1 item planned')).toBeInTheDocument()
  })

  it('expands the cell in place rather than opening a day grid', () => {
    const claims = Array.from({ length: 6 }, (_, i) => event(`Claim ${i}`, 6, i + 1))
    render(<YearCalendarGrid year={YEAR} tasks={[]} events={claims} />)
    // Collapsed: four shown, the rest behind a "+N more".
    expect(screen.getByText('Claim 0')).toBeInTheDocument()
    expect(screen.queryByText('Claim 5')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('+2 more'))
    expect(screen.getByText('Claim 5')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // And it collapses again.
    fireEvent.click(screen.getByText('Show less'))
    expect(screen.queryByText('Claim 5')).not.toBeInTheDocument()
  })

  it('offers the walk-down link only when the caller supplies one', () => {
    const onGoToMonth = vi.fn()
    const { unmount } = render(<YearCalendarGrid year={YEAR} tasks={[]} events={[event('Trip', 6)]} onGoToMonth={onGoToMonth} />)
    fireEvent.click(screen.getByLabelText(/July — 1 on the calendar/))
    fireEvent.click(screen.getByText('Open the month →'))
    expect(onGoToMonth).toHaveBeenCalledWith(6)
    unmount()

    // A session has no business wandering off mid-arc, so it passes no handler.
    render(<YearCalendarGrid year={YEAR} tasks={[]} events={[event('Trip', 6)]} />)
    fireEvent.click(screen.getByLabelText(/July — 1 on the calendar/))
    expect(screen.queryByText('Open the month →')).not.toBeInTheDocument()
  })

  it('a month with nothing claimed is inert, not a button that does nothing', () => {
    render(<YearCalendarGrid year={YEAR} tasks={[]} events={[]} />)
    expect(screen.queryByLabelText(/January/)).not.toBeInTheDocument()
    expect(screen.getByText('January')).toBeInTheDocument()
  })
})
