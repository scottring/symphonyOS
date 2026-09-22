import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'

vi.mock('@/hooks/useHouseholdSeasons', () => ({
  useHouseholdSeasons: () => ({ seasons: DEFAULT_SEASONS, loading: false }),
}))

const index: { completed: Set<string>; neverPlanned: boolean; loading: boolean; error: string | null; reload: () => void } =
  { completed: new Set<string>(), neverPlanned: true, loading: false, error: null, reload: vi.fn() }
vi.mock('@/hooks/usePlanningSessionsIndex', () => ({ usePlanningSessionsIndex: () => index }))

import { PlanningNudge, PLAN_NUDGE_DISMISSED_KEY } from './PlanningNudge'

const mount = () => render(<MemoryRouter><PlanningNudge uid="u1" /></MemoryRouter>)

describe('PlanningNudge', () => {
  afterAll(() => { vi.useRealTimers() })
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // A date with no month/week/season/year window open, so it only shows
    // whatever a test explicitly puts in play (first-use, or nothing).
    vi.setSystemTime(new Date(2026, 9, 14, 9))
    localStorage.clear()
    index.completed = new Set()
    index.neverPlanned = true
    index.loading = false
  })

  it('shows the first-use nudge and dismisses it for good, writing the dismissal key', () => {
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

  it('renders nothing on a read error — no nudge, no empty wrapper', () => {
    index.error = 'network error'
    const { container } = mount()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(container.querySelector('.pt-2')).not.toBeInTheDocument()
    index.error = null
  })

  it('renders nothing once every period is planned', () => {
    index.neverPlanned = false
    index.completed = new Set(['year:2026', 'season:2026-fall', 'month:2026-10', 'week:2026-10-4'])
    mount()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('dismissing the year nudge reveals the week nudge, not nothing — and never shows the year token again', () => {
    // Monday Dec 21 2026: the year window is open (December) with nothing
    // saved, so the year nudge wins on precedence; the week window is also
    // open (Mon/Tue → this week), so it's what should surface once the year
    // token is dismissed.
    vi.setSystemTime(new Date(2026, 11, 21, 9))
    index.neverPlanned = false
    index.completed = new Set()
    mount()

    expect(screen.getByRole('status')).toHaveTextContent(/2027 isn't planned yet/)
    expect(screen.getByText('Plan 2027 →')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Not now'))
    expect(localStorage.getItem(PLAN_NUDGE_DISMISSED_KEY('u1'))).toBe('2027')

    // A DIFFERENT nudge, not silence: the dismissal is scoped to the year
    // token, so the week candidate underneath it still shows.
    expect(screen.getByRole('status')).toHaveTextContent(/isn't planned yet/)
    expect(screen.queryByText('Plan 2027 →')).not.toBeInTheDocument()
    expect(screen.getByText('Plan the week →')).toBeInTheDocument()
  })

  it('advances past a stale week nudge as the clock crosses the week boundary', () => {
    // Saturday Oct 10 2026 → the coming week isn't planned yet.
    vi.setSystemTime(new Date(2026, 9, 10, 9))
    index.neverPlanned = false
    index.completed = new Set()
    mount()
    expect(screen.getByRole('status')).toHaveTextContent(/isn't planned yet/)

    // Jump to Wednesday Oct 14 — outside every candidate's window — and let
    // the 60s refresh interval notice, without any data refetch happening.
    act(() => {
      vi.setSystemTime(new Date(2026, 9, 14, 9))
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
