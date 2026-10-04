import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { SeasonBand, YearRibbon } from './PeriodShape'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'

// Scott, 2026-10-04: "larger fonts and maybe some graphical components for
// the season and year pages".
describe('SeasonBand', () => {
  it('draws the season’s months, where today is, and its landmarks', () => {
    render(<SeasonBand start={new Date(2026, 8, 1)} end={new Date(2026, 11, 1)} today={new Date(2026, 9, 4)}
      marks={[{ id: 'h', title: 'Halloween', at: new Date(2026, 9, 31) }]} />)
    const band = within(screen.getByRole('img', { name: /Fall|September/ }))
    expect(band.getAllByTestId('band-month').map((m) => m.textContent)).toEqual(['September', 'October', 'November'])
    expect(band.getByText('today')).toBeInTheDocument()
    expect(band.getByText('Halloween')).toBeInTheDocument()
  })

  it('has no today mark outside the season', () => {
    render(<SeasonBand start={new Date(2026, 11, 1)} end={new Date(2027, 2, 1)} today={new Date(2026, 9, 4)} marks={[]} />)
    expect(screen.queryByText('today')).toBeNull()
  })
})

describe('YearRibbon', () => {
  it('twelve months, named by the household’s seasons, and today', () => {
    render(<YearRibbon year={2026} seasons={DEFAULT_SEASONS} today={new Date(2026, 9, 4)} />)
    const ribbon = within(screen.getByRole('img', { name: /2026/ }))
    expect(ribbon.getAllByTestId('ribbon-month')).toHaveLength(12)
    expect(ribbon.getAllByTestId('ribbon-season').map((s) => s.textContent)).toEqual(['Winter', 'Spring', 'Summer', 'Fall', 'Winter'])
    expect(ribbon.getByText('today')).toBeInTheDocument()
  })
})
