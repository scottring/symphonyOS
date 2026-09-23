import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/components/reference/ReferenceListsContext', () => ({ useReferenceLists: () => null }))
vi.mock('@/components/plan/GoalsSheet', () => ({
  GoalsSheet: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Goals" /> : null),
}))

vi.mock('@/components/domain/DomainSwitcher', () => ({ DomainSwitcher: () => <button type="button">Layers</button> }))

const { PlanNavigation } = await import('./PlanNavigation')

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
