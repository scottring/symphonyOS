// S2-08: a hard load of /task/:id said "Task not found" for several seconds,
// while the tasks were still on their way.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const state = { loading: true }
// Stable values: a mock that returns a fresh array each render feeds the
// container's effects a new dependency every time and never settles.
const m = vi.hoisted(() => {
  const fn = () => () => undefined
  return {
    none: [] as never[], map: new Map(), fn,
    tasks: { addTask: fn(), addSubtask: fn(), deleteTask: fn(), toggleTask: fn(), updateTask: fn(), pushTask: fn() },
    contacts: { contacts: [], contactsMap: new Map(), addContact: fn(), searchContacts: fn() },
    projects: { projects: [], projectsMap: new Map(), addProject: fn(), searchProjects: fn() },
    notes: { addNote: fn(), addEntityLink: fn(), getNotesForEntity: async () => [] },
    seasons: { seasons: undefined }, goals: { goals: [] }, vault: { createVaultNote: fn() },
    routines: { activeRoutines: [] }, auth: { user: { id: 'u1' } }, choices: { forWeek: () => undefined },
  }
})
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ ...m.tasks, tasks: m.none, loading: state.loading }) }))
vi.mock('@/hooks/useContacts', () => ({ useContacts: () => m.contacts }))
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => m.projects }))
vi.mock('@/contexts/NotesContext', () => ({ useNotesContext: () => m.notes }))
vi.mock('@/hooks/useHouseholdSeasons', () => ({ useHouseholdSeasons: () => m.seasons }))
vi.mock('@/contexts/GoalsContext', () => ({ useGoalsContext: () => m.goals }))
vi.mock('@/hooks/useVaultWrite', () => ({ useVaultWrite: () => m.vault }))
vi.mock('@/hooks/useRoutines', () => ({ useRoutines: () => m.routines }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => m.auth }))
vi.mock('@/hooks/useDayChoices', () => ({ useDayChoices: () => m.choices }))
vi.mock('@/components/lazy', () => ({ TaskView: () => null }))
vi.mock('@/components/plan/GoalPeriodShelves', () => ({ GoalPeriodShelves: () => null }))

import { TaskViewContainer } from './TaskViewContainer'

const show = () => render(<MemoryRouter><TaskViewContainer taskId="t1" onBack={vi.fn()} /></MemoryRouter>)

describe('TaskViewContainer before the tasks arrive', () => {
  beforeEach(() => { state.loading = true })

  it('shows a loading state, not "Task not found"', () => {
    show()
    expect(screen.queryByText(/Task not found/)).toBeNull()
  })

  it('says not found only once loading has finished', () => {
    state.loading = false
    show()
    expect(screen.getByText(/Task not found/)).toBeInTheDocument()
  })
})
