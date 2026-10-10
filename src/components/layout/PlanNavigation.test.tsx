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

describe('PlanNavigation', () => {
  it('has no ◎ Goals control at any width (2026-09-28: the planning pages hold the goals)', () => {
    render(<MemoryRouter initialEntries={['/month']}><PlanNavigation /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Goals' })).not.toBeInTheDocument()
    cleanup()
    render(<MemoryRouter initialEntries={['/season']}><PlanNavigation mobile /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Goals' })).not.toBeInTheDocument()
  })

  it('each rail link opens the period it names — the one on screen keeps its date (2026-09-29)', () => {
    render(<MemoryRouter initialEntries={['/month?start=2026-10-01']}><PlanNavigation /></MemoryRouter>)
    const rail = screen.getByRole('navigation', { name: 'Planning period' })
    const month = rail.querySelector('a[aria-current="page"]')!
    // Words only on the rail (2026-10-07); the period it opens is in the tooltip.
    expect(month.textContent).toBe('Plan')
    expect(month.getAttribute('title')).toBe('Plan across all horizons')
    expect(month.getAttribute('href')).toBe('/month?start=2026-10-01&view=constellation&horizon=2')
    // The other steps follow the period on screen (decision D, 2026-09-29):
    // the week holding October 1, not the clock's week. Today stays today.
    expect(rail.querySelector('a[href^="/week?start="]')).toBeTruthy()
    expect(rail.querySelector('a[href="/today?view=alongside"]')).toBeTruthy()
  })

  // Scott, 2026-09-30: ascending, Today first — the same order as the phone's menu.
  it('runs Today → Week → Month → Season → Year on desktop', () => {
    render(<MemoryRouter initialEntries={['/week']}><PlanNavigation /></MemoryRouter>)
    const rail = screen.getByRole('navigation', { name: 'Planning period' })
    expect([...rail.querySelectorAll('a')].map((a) => a.getAttribute('aria-label'))).toEqual(['Today', 'Week', 'Plan'])
  })

  it('switches horizons on a phone from the title menu, one horizon at a time', () => {
    render(<MemoryRouter initialEntries={['/season']}><PlanNavigation mobile /></MemoryRouter>)
    expect(screen.queryByRole('navigation', { name: 'Planning period' })).not.toBeInTheDocument()
    const title = screen.getByRole('button', { name: 'Plan. Switch horizon' })
    fireEvent.click(title)
    const items = screen.getAllByRole('menuitemradio')
    expect(items.map((i) => i.textContent?.split(/(?=[A-Z])/)[0])).toEqual(['Today', 'Week', 'Plan'])
    expect(screen.getByRole('menuitemradio', { name: /^Plan/ })).toHaveAttribute('aria-checked', 'true')
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
