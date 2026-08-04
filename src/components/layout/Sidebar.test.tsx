import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { DomainProvider } from '@/hooks/useDomain'

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
})
