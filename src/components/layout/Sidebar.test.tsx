import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { DomainProvider } from '@/hooks/useDomain'
import { PlaceProvider } from '@/hooks/usePlace'
import { onPlanFromPaperRequest, consumePlanFromPaperRequest } from '@/lib/planFromPaperSignal'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/hooks/useHomes', () => ({
  useHomes: () => ({ homes: [], loading: false, addHome: vi.fn() }),
}))
vi.mock('@/hooks/useSpaces', () => ({
  useSpaces: () => ({ spaces: [], rooms: [], zones: [], loading: false, addRoom: vi.fn() }),
}))
vi.mock('@/hooks/useLists', () => ({
  useLists: () => ({ lists: [], loading: false }),
}))

describe('Sidebar', () => {
  it('lists Discussions in the loop with a badge only when something is unread', () => {
    const { rerender } = render(
      <MemoryRouter>
        <DomainProvider><PlaceProvider>
          <Sidebar collapsed={false} onToggle={vi.fn()} activeView="today" onViewChange={vi.fn()} discussionsUnread={0} />
        </PlaceProvider></DomainProvider>
      </MemoryRouter>,
    )
    const row = screen.getByRole('button', { name: /Discussions/ })
    expect(row.textContent).toBe('Discussions')
    rerender(
      <MemoryRouter>
        <DomainProvider><PlaceProvider>
          <Sidebar collapsed={false} onToggle={vi.fn()} activeView="today" onViewChange={vi.fn()} discussionsUnread={2} />
        </PlaceProvider></DomainProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /Discussions/ }).textContent).toBe('Discussions2')
  })

  // Regression test: the House item used to call onViewChange('home-app'),
  // but ShellLayout's handleViewChange has no case for that view, so it
  // silently fell through to `default: navigate('/')` (Today) instead of
  // '/home'. House's own sub-items (rooms) already navigate directly —
  // House itself should too, matching them.
  it('navigates to /home when House is clicked, not through onViewChange', async () => {
    const onViewChange = vi.fn()
    render(
      <MemoryRouter initialEntries={['/today']}>
        <DomainProvider>
          <Sidebar
            // collapsed=true sidesteps PlaceMedallion/WeatherChip (only
            // rendered when expanded), which need providers unrelated to
            // this test. House's aria-label and active styling both work
            // the same collapsed or not.
            collapsed
            onToggle={() => {}}
            activeView="today"
            onViewChange={onViewChange}
          />
        </DomainProvider>
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'House' }))

    expect(mockNavigate).toHaveBeenCalledWith('/home')
    expect(onViewChange).not.toHaveBeenCalled()
  })

  it('highlights House when activeView is home-app', () => {
    render(
      <MemoryRouter initialEntries={['/home']}>
        <DomainProvider>
          <Sidebar
            // collapsed=true sidesteps PlaceMedallion/WeatherChip (only
            // rendered when expanded), which need providers unrelated to
            // this test. House's aria-label and active styling both work
            // the same collapsed or not.
            collapsed
            onToggle={() => {}}
            activeView="home-app"
            onViewChange={() => {}}
          />
        </DomainProvider>
      </MemoryRouter>,
    )
    // navItemClass() adds this active styling only when the item matches activeView.
    expect(screen.getByRole('button', { name: 'House' }).className).toContain('bg-primary-50')
  })
  // Projects is HIDDEN from the product (2026-09-02): the noun read as GTD
  // jargon and confused the household-OS pitch. The data, hooks, types and the
  // ProjectsList/ProjectView components all stay — only the UI goes, the same
  // treatment "Us" and "Jobs" got in the 2026-09-01 pare-down.
  it('offers no Projects entry in the Library group', () => {
    // /routines forces the Library group open (it is one of its members), so
    // the group's children really are in the DOM for this assertion.
    render(
      <MemoryRouter initialEntries={['/routines']}>
        <PlaceProvider>
          <DomainProvider>
            <Sidebar
              collapsed={false}
              onToggle={() => {}}
              activeView="today"
              onViewChange={() => {}}
            />
          </DomainProvider>
        </PlaceProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByText('Projects')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /projects/i })).not.toBeInTheDocument()
  })

  // Goals came back as a Library row on 2026-09-05: a year page in
  // Plan-from-paper writes goals rows, and reference you cannot reach is
  // reference that does not exist.
  it('offers Goals in the Library group as reference', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/routines']}>
        <PlaceProvider>
          <DomainProvider>
            <Sidebar
              collapsed={false}
              onToggle={() => {}}
              activeView="today"
              onViewChange={() => {}}
            />
          </DomainProvider>
        </PlaceProvider>
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'Goals' }))
    expect(mockNavigate).toHaveBeenCalledWith('/goals')
  })
})

describe('Sidebar — Plan from paper', () => {
  const mount = (onViewChange = vi.fn()) => {
    render(
      <MemoryRouter>
        <DomainProvider><PlaceProvider>
          <Sidebar collapsed={false} onToggle={vi.fn()} activeView="contacts" onViewChange={onViewChange} discussionsUnread={0} />
        </PlaceProvider></DomainProvider>
      </MemoryRouter>,
    )
    return onViewChange
  }

  it('is its own row in the nav, from any page', () => {
    mount()
    expect(screen.getByRole('button', { name: /plan from paper/i })).toBeInTheDocument()
  })

  it('a mounted Home view opens the flow in place — no navigation', async () => {
    const cb = vi.fn()
    const off = onPlanFromPaperRequest(cb)
    const onViewChange = mount()
    await userEvent.click(screen.getByRole('button', { name: /plan from paper/i }))
    expect(cb).toHaveBeenCalledTimes(1)
    expect(onViewChange).not.toHaveBeenCalled()
    off()
  })

  it('with no Home view mounted it goes to Today and leaves the request for it', async () => {
    const onViewChange = mount()
    await userEvent.click(screen.getByRole('button', { name: /plan from paper/i }))
    expect(onViewChange).toHaveBeenCalledWith('today')
    expect(consumePlanFromPaperRequest()).toBe(true)
  })
})
