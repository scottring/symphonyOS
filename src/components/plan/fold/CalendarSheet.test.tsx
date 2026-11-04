import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SheetRoutines } from './CalendarSheet'

// Routines are dated commitments (spec 2026-11-04): the period's routines
// sit on its calendar sheet, each with its dates in the period.
const d = (m: number, day: number) => new Date(2026, m - 1, day)
/** Each line as it is read (the repeat glyph is drawn, not read). */
const read = (li: HTMLElement) => { const c = li.cloneNode(true) as HTMLElement; c.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove()); return c.textContent }
const items = () => screen.getAllByRole('listitem').map(read)

describe('SheetRoutines', () => {
  it('Month: “Routines this month”, each with its dates, once each and compact', () => {
    render(<SheetRoutines word="month" routines={[
      { id: 'w', title: 'Wash comforters', dates: [d(11, 7), d(11, 8)] },
      { id: 'f', title: 'Pay FFG', dates: [d(11, 10)] },
    ]} />)
    const section = screen.getByRole('region', { name: 'Routines this month' })
    expect(within(section).getByRole('heading', { name: 'Routines this month' })).toBeInTheDocument()
    expect(items()).toEqual(['Wash comforters · Sat Nov 7 · Sun Nov 8', 'Pay FFG · Tue Nov 10'])
    // Each with the repeat glyph, drawn, not read.
    expect(Array.from(section.querySelectorAll('li > [aria-hidden="true"]')).map((n) => n.textContent)).toEqual(['↻', '↻'])
    // For reading: nothing here is a control.
    expect(section.querySelectorAll('button,a,input,textarea')).toHaveLength(0)
    // The Maintenance and fun step points here.
    expect(section).toHaveAttribute('data-guide-anchor', 'routines')
  })

  it('more than three dates read as their weekdays: “every Tue”', () => {
    render(<SheetRoutines word="month" routines={[
      { id: 'b', title: 'Boxing', dates: [d(11, 3), d(11, 10), d(11, 17), d(11, 24)] },
      { id: 'g', title: 'Garden', dates: [d(11, 7), d(11, 8), d(11, 14), d(11, 15)] },
      { id: 's', title: 'Stretch', dates: [d(11, 2), d(11, 3), d(11, 4), d(11, 5)] },
      { id: 't', title: 'Trash', dates: [d(11, 3), d(11, 6), d(11, 10)] },
    ]} />)
    expect(items()).toEqual([
      'Boxing · every Tue',
      'Garden · every Sat and Sun',
      'Stretch · 4 days',
      'Trash · Tue Nov 3 · Fri Nov 6 · Tue Nov 10',
    ])
  })

  it('Year: “Routines this year”, dates without the weekday', () => {
    render(<SheetRoutines word="year" routines={[{ id: 'tx', title: 'File taxes', dates: [d(4, 15)] }]} />)
    expect(screen.getByRole('heading', { name: 'Routines this year' })).toBeInTheDocument()
    expect(items()).toEqual(['File taxes · Apr 15'])
  })

  it('none: says so quietly', () => {
    render(<SheetRoutines word="month" routines={[]} />)
    expect(screen.getByRole('region', { name: 'Routines this month' })).toHaveTextContent('No monthly routines.')
    expect(screen.queryByRole('list')).toBeNull()
  })
})
