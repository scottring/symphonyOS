import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'

vi.mock('@/hooks/useHouseholdSeasons', () => ({
  useHouseholdSeasons: () => ({ seasons: DEFAULT_SEASONS, loading: false }),
}))

const index = { completed: new Set<string>(), neverPlanned: true, loading: false, error: null, reload: vi.fn() }
vi.mock('@/hooks/usePlanningSessionsIndex', () => ({ usePlanningSessionsIndex: () => index }))

import { PlanningNudge, PLAN_NUDGE_DISMISSED_KEY } from './PlanningNudge'

const mount = () => render(<MemoryRouter><PlanningNudge uid="u1" /></MemoryRouter>)

describe('PlanningNudge', () => {
  afterAll(() => { vi.useRealTimers() })
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 9, 6, 9))
    localStorage.clear()
    index.completed = new Set()
    index.neverPlanned = true
    index.loading = false
  })

  it('shows the first-use nudge and dismisses it, writing the dismissal key', () => {
    mount()
    expect(screen.getByRole('status')).toHaveTextContent(/Start with the year/)
    expect(screen.getByText('Plan 2026 →')).toBeInTheDocument()
    expect(screen.getByText('optional')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Not now'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(localStorage.getItem(PLAN_NUDGE_DISMISSED_KEY('u1'))).toBe('first-use')
  })

  it('renders nothing while loading', () => {
    index.loading = true
    mount()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders nothing once every period is planned', () => {
    index.neverPlanned = false
    index.completed = new Set(['year:2026', 'season:2026-fall', 'month:2026-10', 'week:2026-10-4'])
    mount()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
