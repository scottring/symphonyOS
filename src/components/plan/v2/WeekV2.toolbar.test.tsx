import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const session = { saved: null as null | { authorId: string; at: Date }, mine: null, loading: false, loadedToken: '', error: null, reload: vi.fn(), save: vi.fn() }

vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => session, weekToken: () => '2026-9-27' }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ toggleTask: vi.fn(), updateTask: vi.fn(), pushTask: vi.fn(), updateTasksBulk: vi.fn(), keepForward: vi.fn(), dropCommitment: vi.fn(), addTask: vi.fn() }) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: () => ({ updateTask: vi.fn(), pushTask: vi.fn() }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [] }) }))
vi.mock('@/hooks/useActionableInstances', () => ({ useActionableInstances: () => ({ setPlanned: vi.fn(), reschedule: vi.fn() }) }))
vi.mock('./AddArea', () => ({ useAddArea: () => ({ area: undefined, picker: null }) }))
vi.mock('./FromPaper', () => ({ FromPaper: () => null }))
vi.mock('./RefShelves', () => ({ WeekRefShelves: () => null }))

import { WeekV2 } from './WeekV2'

const renderWeek = () => render(
  <MemoryRouter>
    <WeekV2 tasks={[]} weekStart={new Date(2026, 8, 27)} meId="me" isCurrent days={null} onSelectTask={vi.fn()} />
  </MemoryRouter>,
)

describe('WeekV2 toolbar — an unplanned week says what to do', () => {
  beforeEach(() => { session.saved = null; session.loading = false })

  it('"No plan for week N yet" carries a "Plan your week" link that starts the weekly review', () => {
    renderWeek()
    expect(screen.getByText(/No plan for week \d+ yet/)).toBeTruthy()
    // The link is the one loud ask; the review button stays quiet beside it.
    expect(screen.getByRole('button', { name: 'Weekly review' }).className).toBe('pv2-qbtn')
    fireEvent.click(screen.getByRole('button', { name: /Plan your week/ }))
    expect(screen.getByRole('region', { name: /Weekly review, week \d+/ })).toBeTruthy()
  })

  it('an agreed week shows no link', () => {
    session.saved = { authorId: 'me', at: new Date(2026, 8, 26) }
    renderWeek()
    expect(screen.queryByRole('button', { name: /Plan your week/ })).toBeNull()
    expect(screen.getByText(/Our week \d+ plan/)).toBeTruthy()
  })

  it('no link while the session is still loading', () => {
    session.loading = true
    renderWeek()
    expect(screen.queryByRole('button', { name: /Plan your week/ })).toBeNull()
  })
})
