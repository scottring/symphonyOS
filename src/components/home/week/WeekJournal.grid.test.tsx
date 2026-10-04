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

  // Scott, 2026-10-04: no fold and no count — the every-day routines are
  // written once above, so a day's own routines read in the day.
  it('a day’s own routines read in the day, with no fold and no count', () => {
    const days = week(new Date(2026, 9, 3))
    days[0].foldedRoutines = ['Paper mail', 'Kids clean rooms', 'Shower night'].map((t, i) => routine(`r${i}`, t))
    renderGrid(days, { satIndex: 0, sunIndex: 1, sometime: [] })
    const sat = within(screen.getByTestId('journal-day-2026-10-03'))
    expect(sat.getByText('Paper mail')).toBeInTheDocument()
    expect(sat.queryByRole('button', { name: /Routines ·/ })).toBeNull()
  })

  // Scott, 2026-10-04: the every-day box had no job here — "take it out".
  it('leaves every-day routines off the week; they still take their time', () => {
    const days = week(new Date(2026, 9, 3))
    days.forEach((d) => d.entries.push({ id: `routine-jax-${d.key}`, kind: 'routine', title: 'Walk Jax', completed: false, routineId: 'jax', time: new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate(), 18), end: new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate(), 19) }))
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 3, 9))
    renderGrid(days, { satIndex: 0, sunIndex: 1, sometime: [] })
    vi.useRealTimers()
    expect(screen.queryByText('Walk Jax')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Every week' })).toBeNull()
    expect(within(screen.getByTestId('journal-day-2026-10-05')).getByText('Free 7a–6p · 7–9p')).toBeInTheDocument()
  })

  it('says how much of each day is free', () => {
    const days = week(new Date(2026, 9, 3))
    days[2].entries.push({ id: 'event-x', kind: 'event', title: 'Jury duty', completed: false, time: new Date(2026, 9, 5, 9), end: new Date(2026, 9, 5, 17) })
    renderGrid(days, { satIndex: 0, sunIndex: 1, sometime: [] })
    expect(within(screen.getByTestId('journal-day-2026-10-05')).getByText('Free 7–9a · 5–9p')).toBeInTheDocument()
    expect(within(screen.getByTestId('journal-day-2026-10-06')).getByText('Free all day')).toBeInTheDocument()
  })

  it('a Sunday-start week has no band; Sometime stands after Saturday', () => {
    renderGrid(week(new Date(2026, 9, 4)), { satIndex: 6, sunIndex: null, sometime: [routine('w', 'Yard weeding')] })
    const band = screen.getByRole('region', { name: /The weekend/ })
    expect(within(band).getAllByTestId(/^(journal-day-|weekend-sometime)/).map((el) => el.getAttribute('data-testid')))
      .toEqual(['journal-day-2026-10-10', 'weekend-sometime'])
    expect(within(screen.getAllByRole('region', { name: 'Weekdays' })[0]).getAllByTestId(/^journal-day-/)).toHaveLength(6)
  })

  it('a done timed thing still took its time; a past day says nothing about free time', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 5, 12))
    const days = week(new Date(2026, 9, 3))
    days[2].entries.push({ id: 'task-x', kind: 'task', title: 'Dentist', completed: true, time: new Date(2026, 9, 5, 9), end: new Date(2026, 9, 5, 17) })
    days[0].entries.push({ id: 'task-y', kind: 'task', title: 'Porch', completed: false })
    renderGrid(days, { satIndex: 0, sunIndex: 1, sometime: [] })
    expect(within(screen.getByTestId('journal-day-2026-10-05')).getByText('Free 7–9a · 5–9p')).toBeInTheDocument()
    expect(within(screen.getByTestId('journal-day-2026-10-03')).queryByText(/^Free|No free time/)).toBeNull()
    vi.useRealTimers()
  })
})
