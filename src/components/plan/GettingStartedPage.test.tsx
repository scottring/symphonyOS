// Scott asked for the "Somewhere to start" box OUT of the planning pages and
// into an independent place (Codex, 2026-09-24).
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GettingStartedPage } from './GettingStartedPage'
import { MORE_GROUPS } from '@/components/layout/moreDestinations'

const show = () => render(<MemoryRouter><GettingStartedPage /></MemoryRouter>)

describe('the Getting Started page', () => {
  beforeEach(() => localStorage.clear())

  it('carries the three optional entries', () => {
    show()
    const doors = within(screen.getByLabelText('Somewhere to start'))
    expect(doors.getByRole('heading', { name: 'Capture something now' })).toBeInTheDocument()
    expect(doors.getByRole('heading', { name: 'Plan the next few weeks' })).toBeInTheDocument()
    expect(doors.getByRole('heading', { name: 'Set a season or a year' })).toBeInTheDocument()
  })

  it('links to the planning guide', () => {
    show()
    expect(screen.getByRole('link', { name: /Open the planning guide/ })).toHaveAttribute('href', '/guide')
  })

  // An existing link must keep working.
  it('preserves the first-week deep link', () => {
    show()
    expect(screen.getByRole('link', { name: /opens\s+on request/ })).toHaveAttribute('href', '/today?welcome=1')
  })

  it('says plainly that none of it is required', () => {
    show()
    expect(screen.getByText(/no right order and no first step you owe anyone/i)).toBeInTheDocument()
  })

  it('is where More sends "Getting started"', () => {
    const entry = MORE_GROUPS.flatMap(([, items]) => items).find((d) => d.label === 'Getting started')
    expect(entry?.route).toBe('/start')
  })
})

// A dismissal made when the doors were an aside must not empty the page you
// navigated to on purpose (seen live, 2026-09-24).
describe('a previous dismissal', () => {
  it('does not hide the content of this page', () => {
    localStorage.setItem('symphony.planningEntryPaths.hidden', '1')
    show()
    expect(screen.getByLabelText('Somewhere to start')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show where to start' })).toBeNull()
  })

  it('offers no "Hide this" here — there is nothing to hide it from', () => {
    show()
    expect(screen.queryByRole('button', { name: 'Hide this' })).toBeNull()
  })
})
