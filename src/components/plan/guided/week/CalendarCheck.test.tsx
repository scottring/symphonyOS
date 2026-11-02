import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { CalendarCheck } from './CalendarCheck'

const weekStart = new Date(2026, 10, 1) // Sunday
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m)

describe('CalendarCheck — step 3, the week’s fixed times', () => {
  it('walks the days and flags overlaps and tight moves on the day they happen', () => {
    render(<CalendarCheck weekStart={weekStart} events={[
      { id: 'a', title: 'Dentist', start: at(2, 9), end: at(2, 10), place: 'Main St' },
      { id: 'b', title: 'Team call', start: at(2, 9, 30), end: at(2, 10, 30) },
      { id: 'c', title: 'Drop-off', start: at(4, 8), end: at(4, 8, 30), place: 'Home' },
      { id: 'd', title: 'Swim', start: at(4, 8, 35), end: at(4, 9, 30), place: 'Pool' },
    ]} />)
    expect(screen.getAllByRole('listitem', { name: /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) / })).toHaveLength(7)
    const mon = within(screen.getByRole('listitem', { name: /^Mon 2/ }))
    expect(mon.getByText('Dentist')).toBeInTheDocument()
    expect(mon.getByText('Overlap: Dentist and Team call')).toBeInTheDocument()
    const wed = within(screen.getByRole('listitem', { name: /^Wed 4/ }))
    expect(wed.getByText('Tight: Drop-off, then Swim somewhere else 5 minutes later')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: /^Tue 3/ })).getByText('Nothing fixed')).toBeInTheDocument()
    expect(screen.getByText('2 to look at')).toBeInTheDocument()
  })

  it('an all-day event is on each day it covers, so that day is not "Nothing fixed"; it is never a clash (walk 2026-11-02)', () => {
    render(<CalendarCheck weekStart={weekStart} events={[{ id: 'a', title: 'Dentist', start: at(5, 9), end: at(5, 10) }]}
      allDay={[{ id: 'trip', title: 'Beach trip', first: '2026-11-05', last: '2026-11-07' }, { id: 'h', title: 'Election Day', first: '2026-11-03', last: '2026-11-03' }]} />)
    const tue = within(screen.getByRole('listitem', { name: /^Tue 3/ }))
    expect(tue.getByText('Election Day')).toBeInTheDocument()
    expect(tue.queryByText('Nothing fixed')).toBeNull()
    for (const d of ['Thu 5', 'Fri 6', 'Sat 7']) expect(within(screen.getByRole('listitem', { name: new RegExp(`^${d}`) })).getByText('Beach trip')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: /^Wed 4/ })).getByText('Nothing fixed')).toBeInTheDocument()
    expect(screen.getByText('No overlaps or tight moves.')).toBeInTheDocument()
  })

  it('a clear week says so', () => {
    render(<CalendarCheck weekStart={weekStart} events={[{ id: 'a', title: 'Dentist', start: at(2, 9), end: at(2, 10) }]} />)
    expect(screen.getByText('No overlaps or tight moves.')).toBeInTheDocument()
  })
})
