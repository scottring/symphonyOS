import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { WeekJournal, type JournalDay, type JournalEntry, type JournalWeekend } from './WeekJournal'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const week = (start: Date): JournalDay[] => Array.from({ length: 7 }, (_, i) => {
  const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
  return { date, key: ymd(date), notes: [], entries: [], foldedRoutines: [], available: [], dinners: [] }
})
const routine = (id: string, title: string, completed = false): JournalEntry => ({ id: `routine-${id}-day0`, kind: 'routine', title, completed, routineId: id })
const renderGrid = (days: JournalDay[], weekend: JournalWeekend | null) => render(
  <DndContext><WeekJournal layout="grid" days={days} weekend={weekend} spans={[]} onSelectItem={vi.fn()} onToggleEntry={vi.fn()} /></DndContext>,
)

beforeEach(() => { try { localStorage.clear() } catch { /* fine */ } })

// Scott, 2026-10-03: the days as a grid — the weekend as one band, the
// weekdays across — instead of one long column beside two short ones.
describe('WeekJournal — the grid', () => {
  it('the weekend band holds Saturday, Sunday and Sometime this weekend, in that order', () => {
    const days = week(new Date(2026, 9, 3))
    renderGrid(days, { satIndex: 0, sunIndex: 1, sometime: [routine('w', 'Yard weeding')] })
    const band = screen.getByRole('region', { name: /The weekend/ })
    const cells = within(band).getAllByTestId(/^(journal-day-|weekend-sometime)/).map((el) => el.getAttribute('data-testid'))
    expect(cells).toEqual(['journal-day-2026-10-03', 'journal-day-2026-10-04', 'weekend-sometime'])
    expect(within(band).getByText('Yard weeding')).toBeInTheDocument()
  })

  it('the weekdays sit together after it', () => {
    renderGrid(week(new Date(2026, 9, 3)), { satIndex: 0, sunIndex: 1, sometime: [] })
    const weekdays = screen.getByRole('region', { name: 'Weekdays' })
    expect(within(weekdays).getAllByTestId(/^journal-day-/)).toHaveLength(5)
  })

  it('a day’s untimed routines fold to one line, and open on a click', () => {
    const days = week(new Date(2026, 9, 3))
    days[0].foldedRoutines = ['Paper mail', 'Kids clean rooms', 'Shower night'].map((t, i) => routine(`r${i}`, t))
    renderGrid(days, { satIndex: 0, sunIndex: 1, sometime: [] })
    const sat = within(screen.getByTestId('journal-day-2026-10-03'))
    const fold = sat.getByRole('button', { name: /Routines · 3/ })
    expect(fold).toHaveAttribute('aria-expanded', 'false')
    expect(sat.queryByText('Paper mail')).toBeNull()
    fireEvent.click(fold)
    expect(sat.getByText('Paper mail')).toBeInTheDocument()
  })

  it('reads “Routines · done” when every one is ticked', () => {
    const days = week(new Date(2026, 9, 3))
    days[2].foldedRoutines = [routine('a', 'Pack lunches', true), routine('b', 'Take Home Folder', true)]
    renderGrid(days, { satIndex: 0, sunIndex: 1, sometime: [] })
    expect(within(screen.getByTestId('journal-day-2026-10-05')).getByRole('button', { name: /Routines · done/ })).toBeInTheDocument()
  })

  it('a Sunday-start week has no band; Sometime stands after Saturday', () => {
    renderGrid(week(new Date(2026, 9, 4)), { satIndex: 6, sunIndex: null, sometime: [routine('w', 'Yard weeding')] })
    const band = screen.getByRole('region', { name: /The weekend/ })
    expect(within(band).getAllByTestId(/^(journal-day-|weekend-sometime)/).map((el) => el.getAttribute('data-testid')))
      .toEqual(['journal-day-2026-10-10', 'weekend-sometime'])
    expect(within(screen.getAllByRole('region', { name: 'Weekdays' })[0]).getAllByTestId(/^journal-day-/)).toHaveLength(6)
  })
})
