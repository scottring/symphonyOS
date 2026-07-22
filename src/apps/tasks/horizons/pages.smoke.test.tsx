// src/apps/tasks/horizons/pages.smoke.test.tsx
//
// Smoke tests for the per-page extraction (Task 1 of the week/month
// unification plan): each page must mount with empty data and no crash, and
// show a landmark unique to that horizon. This is the RED/GREEN gate for the
// mechanical HorizonView split — it does not test behavior beyond "renders".

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { render as rtlRender } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PlaceProvider } from '@/hooks/usePlace'
import { DomainProvider } from '@/hooks/useDomain'

// ── Context/selection hooks that throw without a real provider: mock them
// directly (same pattern as src/components/omnibox/OmniboxResults.test.tsx). ──
vi.mock('@/shell/providers/SelectionProvider', () => ({
  useSelection: () => ({ selection: null, setSelection: vi.fn() }),
}))
vi.mock('@/contexts/ListsContext', () => ({
  useListsContext: () => ({ lists: [], listsByCategory: {} }),
}))
vi.mock('@/contexts/GoalsContext', () => ({
  useGoalsContext: () => ({ areas: [], goals: [], addGoal: vi.fn() }),
}))

// ── Data hooks: empty fixtures are enough for an empty-state smoke render. ──
vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => ({
    tasks: [], addTask: vi.fn(), toggleTask: vi.fn(), toggleWaiting: vi.fn(),
    deleteTask: vi.fn(), updateTask: vi.fn(), updateTasksBulk: vi.fn(),
    pushTask: vi.fn(), setBucket: vi.fn(),
  }),
}))
vi.mock('@/hooks/useEventNotes', () => ({
  useEventNotes: () => ({
    notes: new Map(), updateEventAssignment: vi.fn(), updateEventAssignmentAll: vi.fn(),
    updateEventContext: vi.fn(), updateEventProject: vi.fn(),
  }),
}))
vi.mock('@/hooks/useContacts', () => ({
  useContacts: () => ({ contacts: [], contactsMap: new Map(), addContact: vi.fn(), searchContacts: vi.fn() }),
}))
vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({ projects: [], projectsMap: new Map(), addProject: vi.fn(), deleteProject: vi.fn() }),
}))
vi.mock('@/hooks/useRoutines', () => ({
  useRoutines: () => ({ routines: [], updateRoutine: vi.fn(), deleteRoutine: vi.fn() }),
}))
vi.mock('@/hooks/useActionableInstances', () => ({
  useActionableInstances: () => ({ markDone: vi.fn(), undoDone: vi.fn(), skip: vi.fn(), reschedule: vi.fn() }),
}))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({ members: [], getCurrentUserMember: () => undefined }),
}))
vi.mock('@/hooks/useHiddenCalendarEvents', () => ({
  useHiddenCalendarEvents: () => ({ hideEvent: vi.fn() }),
}))
vi.mock('@/hooks/useCalendarDomainMappings', () => ({
  useCalendarDomainMappings: () => ({ getDomainForCalendar: vi.fn() }),
}))
vi.mock('@/hooks/usePlanningSession', () => ({
  usePlanningSession: () => ({ notes: {}, patchNotes: vi.fn(), loading: false }),
}))

import { WeekPage } from './WeekPage'
import { MonthPage } from './MonthPage'
import { SeasonPage } from './SeasonPage'
import { YearPage } from './YearPage'
import { SomedayPage } from './SomedayPage'

describe('horizon pages (smoke)', () => {
  it('WeekPage renders the week scaffold with an empty pool', () => {
    render(<WeekPage />)
    // Two "Plan the week" buttons exist with an empty pool (header + empty
    // state) — the header one is the only one with this title, so it's the
    // unique landmark.
    expect(screen.getByTitle('Plan the week')).toBeInTheDocument()
  })

  it('WeekPage masthead shows the rhythm h1 and placed/pool subtitle', () => {
    render(<WeekPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'This Week' })).toBeInTheDocument()
    expect(screen.getByText(/0 placed, 0 to place/)).toBeInTheDocument()
  })

  it('MonthPage renders the calendar grid weekday header', () => {
    render(<MonthPage />)
    expect(screen.getByText('Sun')).toBeInTheDocument()
    expect(screen.getByText('Mon')).toBeInTheDocument()
  })

  it('MonthPage masthead shows the rhythm h1 and placed/pool subtitle', () => {
    render(<MonthPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'This Month' })).toBeInTheDocument()
    expect(screen.getByText(/0 placed, 0 to place/)).toBeInTheDocument()
  })

  it("SeasonPage renders the season's picks panel", () => {
    render(<SeasonPage />)
    expect(screen.getByText("The season's picks")).toBeInTheDocument()
  })

  it('YearPage renders the plan-the-year door', () => {
    render(<YearPage />)
    // Exact match — "Plan the year together" (the empty-goals invitation) is
    // a distinct button and must not satisfy this assertion.
    expect(screen.getByRole('button', { name: 'Plan the year' })).toBeInTheDocument()
  })

  it('SomedayPage renders the timeless-pool empty state', () => {
    render(<SomedayPage />)
    expect(screen.getByText(/Timeless — review during seasonal planning\./i)).toBeInTheDocument()
  })

  it('WeekPage anchors on `?start=` — header shows that week, not the current one', () => {
    // A MemoryRouter (not the shared test-utils BrowserRouter) so the initial
    // location — and therefore useSearchParams() — is deterministic.
    rtlRender(
      <MemoryRouter initialEntries={['/week?start=2026-07-05']}>
        <PlaceProvider>
          <DomainProvider>
            <WeekPage />
          </DomainProvider>
        </PlaceProvider>
      </MemoryRouter>
    )
    expect(screen.getByText(/Week of Jul 5/)).toBeInTheDocument()
  })
})
