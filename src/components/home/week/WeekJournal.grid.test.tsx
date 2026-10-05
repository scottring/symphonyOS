import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

// The fixtures are the week of Sat Oct 3, 2026. Read from that Saturday, so
// the weekend is still ahead and the band stands whole (from Monday it folds).
beforeEach(() => {
  try { localStorage.clear() } catch { /* fine */ }
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 3, 9))
})
afterEach(() => { vi.useRealTimers() })

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
    // Sunday: Saturday is past, and the weekend is still open to read.
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 4, 12))
    const days = week(new Date(2026, 9, 3))
    days[2].entries.push({ id: 'task-x', kind: 'task', title: 'Dentist', completed: true, time: new Date(2026, 9, 5, 9), end: new Date(2026, 9, 5, 17) })
    days[0].entries.push({ id: 'task-y', kind: 'task', title: 'Porch', completed: false })
    renderGrid(days, { satIndex: 0, sunIndex: 1, sometime: [] })
    expect(within(screen.getByTestId('journal-day-2026-10-05')).getByText('Free 7–9a · 5–9p')).toBeInTheDocument()
    expect(within(screen.getByTestId('journal-day-2026-10-03')).queryByText(/^Free|No free time/)).toBeNull()
    vi.useRealTimers()
  })

  // Scott, 2026-10-04: "a way to hide daily routines … and show them".
  it('shows every-day routines in their days when asked', () => {
    const days = week(new Date(2026, 9, 3))
    days.forEach((d) => d.entries.push({ id: `routine-jax-${d.key}`, kind: 'routine', title: 'Walk Jax', completed: false, routineId: 'jax', time: new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate(), 18) }))
    render(<DndContext><WeekJournal layout="grid" dailyRoutines days={days} weekend={{ satIndex: 0, sunIndex: 1, sometime: [] }} spans={[]} onSelectItem={vi.fn()} onToggleEntry={vi.fn()} /></DndContext>)
    expect(screen.getAllByText('Walk Jax')).toHaveLength(7)
  })

  // The page's job (2026-10-04): who carries what.
  it('shows who carries each row', () => {
    const days = week(new Date(2026, 9, 3))
    days[2].entries.push({ id: 'routine-math-x', kind: 'routine', title: 'Math time', completed: false, routineId: 'math', people: ['ella'] })
    const members = [{ id: 'ella', name: 'Ella', initials: 'E', color: 'amber' }] as never
    render(<DndContext><WeekJournal layout="grid" members={members} days={days} weekend={{ satIndex: 0, sunIndex: 1, sometime: [] }} spans={[]} onSelectItem={vi.fn()} onToggleEntry={vi.fn()} /></DndContext>)
    expect(within(screen.getByTestId('journal-day-2026-10-05')).getByLabelText('Ella')).toBeInTheDocument()
  })

  // Scott, 2026-10-04: "can't move should be calendared events only".
  it('on Can’t move, shows only what is on the calendar', () => {
    const days = week(new Date(2026, 9, 3))
    days[2].entries.push(
      { id: 'event-j', kind: 'event', title: 'Jury duty', time: new Date(2026, 9, 5, 8, 30), completed: false },
      { id: 'routine-m', kind: 'routine', title: 'Math time', time: new Date(2026, 9, 5, 17, 30), completed: false, routineId: 'm' },
      { id: 'task-t', kind: 'task', title: 'Call the plumber', time: new Date(2026, 9, 5, 10), completed: false },
    )
    render(<DndContext><WeekJournal layout="grid" show="fixed" days={days} weekend={{ satIndex: 0, sunIndex: 1, sometime: [] }} spans={[]} onSelectItem={vi.fn()} onToggleEntry={vi.fn()} /></DndContext>)
    const mon = within(screen.getByTestId('journal-day-2026-10-05'))
    expect(mon.getByText('Jury duty')).toBeInTheDocument()
    expect(mon.queryByText('Math time')).toBeNull()
    expect(mon.queryByText('Call the plumber')).toBeNull()
  })

  it('on Can’t move, adding to a day puts an event on the calendar, at its time', () => {
    const onAddEvent = vi.fn(); const onAddToDay = vi.fn()
    render(<DndContext><WeekJournal layout="grid" show="fixed" days={week(new Date(2026, 9, 3))} weekend={{ satIndex: 0, sunIndex: 1, sometime: [] }} spans={[]} onSelectItem={vi.fn()} onToggleEntry={vi.fn()} onAddToDay={onAddToDay} onAddEvent={onAddEvent} /></DndContext>)
    const mon = within(screen.getByTestId('journal-day-2026-10-05'))
    fireEvent.click(mon.getByRole('button', { name: 'Add an event to Monday' }))
    fireEvent.change(mon.getByLabelText('New event on Monday'), { target: { value: 'Dentist' } })
    fireEvent.change(mon.getByLabelText('Time on Monday'), { target: { value: '15:00' } })
    fireEvent.submit(mon.getByLabelText('New event on Monday').closest('form')!)
    expect(onAddEvent).toHaveBeenCalledWith(expect.objectContaining({ key: '2026-10-05' }), 'Dentist', '15:00')
    expect(onAddToDay).not.toHaveBeenCalled()
  })

})

// Scott, 2026-10-05: the expanded weekend "doesn't make sense when it's past
// the weekend". From Monday it folds to one line and the weekdays lead.
describe('WeekJournal — the weekend once it is behind you', () => {
  const at = (d: Date) => vi.setSystemTime(d)
  const ev = (title: string, d: Date): JournalEntry => ({ id: `event-${title}`, kind: 'event', title, completed: false, time: d })
  const withWeekend = () => {
    const days = week(new Date(2026, 9, 3))
    days[0].entries.push(ev('Theas bday', new Date(2026, 9, 3, 14)), { id: 'task-m', kind: 'task', title: 'Washing machine mold', completed: false })
    days[1].entries.push(ev('Kaleb’s baseball', new Date(2026, 9, 4, 10, 30)))
    return days
  }
  const sometime = { satIndex: 0, sunIndex: 1, sometime: [routine('w', 'Yard weeding')] }

  it('on Monday the weekend is one line: when it was and what happened', () => {
    at(new Date(2026, 9, 5, 9))
    renderGrid(withWeekend(), sometime)
    expect(screen.queryByRole('region', { name: /The weekend/ })).toBeNull()
    const line = screen.getByTestId('weekend-folded')
    expect(line).toHaveTextContent('Sat 3 – Sun 4')
    expect(within(line).getByText('Theas bday')).toBeInTheDocument()
    expect(within(line).getByText('Kaleb’s baseball')).toBeInTheDocument()
    expect(within(line).queryByText('Washing machine mold')).toBeNull()
    expect(screen.queryByText('Yard weeding')).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Weekdays' })).getAllByTestId(/^journal-day-/)).toHaveLength(5)
  })

  it('on Sunday the weekend is still on, and stands whole', () => {
    at(new Date(2026, 9, 4, 9))
    renderGrid(withWeekend(), sometime)
    expect(screen.queryByTestId('weekend-folded')).toBeNull()
    expect(screen.getByRole('region', { name: /The weekend/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Fold it/ })).toBeNull()
  })

  it('a past week stays whole — looking back is why you are there', () => {
    at(new Date(2026, 9, 14, 9))
    renderGrid(withWeekend(), sometime)
    expect(screen.queryByTestId('weekend-folded')).toBeNull()
    expect(screen.getByRole('region', { name: /The weekend/ })).toBeInTheDocument()
  })

  it('opens and folds again, and remembers the choice for that weekend', () => {
    at(new Date(2026, 9, 5, 9))
    const { unmount } = renderGrid(withWeekend(), sometime)
    fireEvent.click(screen.getByRole('button', { name: 'Show the weekend, Oct 3–4' }))
    const band = screen.getByRole('region', { name: /The weekend/ })
    expect(within(band).getByText('Washing machine mold')).toBeInTheDocument()
    unmount()
    renderGrid(withWeekend(), sometime)
    fireEvent.click(screen.getByRole('button', { name: /Fold it/ }))
    expect(screen.getByTestId('weekend-folded')).toBeInTheDocument()
  })

  it('Can’t move keeps the weekend’s days in view', () => {
    at(new Date(2026, 9, 5, 9))
    render(<DndContext><WeekJournal layout="grid" show="fixed" days={withWeekend()} weekend={sometime} spans={[]} onSelectItem={vi.fn()} onToggleEntry={vi.fn()} /></DndContext>)
    expect(screen.queryByTestId('weekend-folded')).toBeNull()
  })
})
