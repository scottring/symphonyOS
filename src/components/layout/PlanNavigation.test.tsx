import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/components/reference/ReferenceListsContext', () => ({ useReferenceLists: () => null }))
vi.mock('@/components/plan/GoalsSheet', () => ({
  GoalsSheet: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Goals" /> : null),
}))

vi.mock('@/components/domain/DomainSwitcher', () => ({ DomainSwitcher: () => <button type="button">Layers</button> }))

const { PlanNavigation, usePlanDestination } = await import('./PlanNavigation')

afterEach(cleanup)

describe('PlanNavigation — the ◎ Goals control', () => {
  it('toggles the Goals reference on a planning page', () => {
    render(<MemoryRouter initialEntries={['/month']}><PlanNavigation /></MemoryRouter>)
    const button = screen.getByRole('button', { name: 'Goals' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog', { name: 'Goals' })).not.toBeInTheDocument()

    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: 'Goals' })).toBeInTheDocument()

    fireEvent.click(button)
    expect(screen.queryByRole('dialog', { name: 'Goals' })).not.toBeInTheDocument()
  })

  it('offers it on the phone too — one component at every width', () => {
    render(<MemoryRouter initialEntries={['/season']}><PlanNavigation mobile /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Goals' })).toBeInTheDocument()
  })

  it('switches horizons on a phone from the title menu, one horizon at a time', () => {
    render(<MemoryRouter initialEntries={['/season']}><PlanNavigation mobile /></MemoryRouter>)
    expect(screen.queryByRole('navigation', { name: 'Planning period' })).not.toBeInTheDocument()
    const title = screen.getByRole('button', { name: 'Season. Switch horizon' })
    fireEvent.click(title)
    const items = screen.getAllByRole('menuitemradio')
    expect(items.map((i) => i.textContent?.split(/(?=[A-Z])/)[0])).toEqual(['Today', 'Week', 'Month', 'Season', 'Year'])
    expect(screen.getByRole('menuitemradio', { name: /^Season/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('usePlanDestination — Today is one click away', () => {
  function Probe() {
    return <span data-testid="destination">{usePlanDestination()}</span>
  }

  it('points at Today from a page outside the planner', () => {
    render(<MemoryRouter initialEntries={['/routines']}><Probe /></MemoryRouter>)
    expect(screen.getByTestId('destination')).toHaveTextContent('/today')
  })

  it('still points at Today after a visit to a further-out horizon (S1-11)', () => {
    // The old behaviour remembered the last horizon in localStorage, so once
    // you had opened Month, "Planner" took you back to Month and Today cost a
    // second click for the rest of the session.
    render(<MemoryRouter initialEntries={['/month']}><Probe /></MemoryRouter>)
    cleanup()
    render(<MemoryRouter initialEntries={['/inbox']}><Probe /></MemoryRouter>)
    expect(screen.getByTestId('destination')).toHaveTextContent('/today')
  })

  it('reads as "you are here" while you are on a planner page', () => {
    render(<MemoryRouter initialEntries={['/season']}><Probe /></MemoryRouter>)
    expect(screen.getByTestId('destination')).toHaveTextContent('/season')
  })
})
