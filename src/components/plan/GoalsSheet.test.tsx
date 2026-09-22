import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'
import { periodBounds } from '@/lib/planning/periodPage'

const now = new Date()
let n = 0
const goal = (over: Partial<Goal>): Goal => ({
  id: `g${++n}`, areaId: null, name: 'G', year: now.getFullYear(), status: 'active', sortOrder: 0,
  actions: [], milestones: [], context: null, createdAt: new Date(), updatedAt: new Date(), ...over,
} as Goal)
const task = (over: Partial<Task>): Task => ({
  id: `t${++n}`, title: 'T', completed: false, createdAt: new Date(2026, 0, 1, 0, 0, n),
  updatedAt: new Date(), context: null, ...over,
} as Task)

const state: { tasks: Task[]; goals: Goal[] } = { tasks: [], goals: [] }
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ tasks: state.tasks, loading: false }) }))
vi.mock('@/hooks/useDomain', () => ({ useDomain: () => ({ layers: new Set(['work', 'family', 'personal', 'unsorted']) }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ getCurrentUserMember: () => ({ id: 'me' }) }) }))
vi.mock('@/hooks/useHouseholdSeasons', () => ({
  useHouseholdSeasons: () => ({ seasons: DEFAULT_SEASONS, loading: false, canEdit: false, setSeasons: vi.fn() }),
}))
vi.mock('@/contexts/GoalsContext', () => ({
  GoalsProvider: ({ children }: { children: ReactNode }) => children,
  useGoalsContext: () => ({ goals: state.goals }),
}))

const { GoalsSheet } = await import('./GoalsSheet')

const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
const seasonStart = periodBounds('season', now, DEFAULT_SEASONS).start

beforeEach(() => {
  state.tasks = []
  state.goals = []
})
afterEach(cleanup)

const open = (onClose = vi.fn()) => {
  render(<MemoryRouter><GoalsSheet open onClose={onClose} /></MemoryRouter>)
  return onClose
}

describe('GoalsSheet', () => {
  it('shows the year, the season and the month, each with a way in', () => {
    state.goals = [goal({ name: 'Be well', strategy: 'Sleep first' })]
    state.tasks = [
      task({ title: 'Season goal', isGoal: true, bucket: 'quarter', seasonStart }),
      task({ title: 'Month goal', isGoal: true, bucket: 'month', monthStart }),
    ]
    open()
    const sheet = screen.getByRole('dialog', { name: 'Goals' })
    expect(within(sheet).getByText('For reference. Edit them on their pages.')).toBeInTheDocument()
    expect(within(sheet).getByText('Be well')).toBeInTheDocument()
    expect(within(sheet).getByText('Sleep first')).toBeInTheDocument()
    expect(within(sheet).getByText('Season goal')).toBeInTheDocument()
    expect(within(sheet).getByText('Month goal')).toBeInTheDocument()
    expect(within(sheet).getAllByRole('link', { name: 'Open →' })).toHaveLength(3)
    expect(within(sheet).getAllByRole('link', { name: 'Open →' }).map(a => a.getAttribute('href')))
      .toEqual(['/year', '/season', '/month'])
  })

  it('says "Nothing yet." for a level with no goals', () => {
    open()
    expect(screen.getAllByText('Nothing yet.')).toHaveLength(3)
  })

  it('closes on Escape and on the scrim', () => {
    const onClose = open()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes when a level is opened, so the page behind is visible', () => {
    const onClose = open()
    fireEvent.click(screen.getAllByRole('link', { name: 'Open →' })[0])
    expect(onClose).toHaveBeenCalled()
  })

  it('is absent when closed', () => {
    render(<MemoryRouter><GoalsSheet open={false} onClose={vi.fn()} /></MemoryRouter>)
    const sheet = document.querySelector('[role="dialog"][aria-label="Goals"]')
    expect(sheet).toBeNull()
    expect(screen.queryByText('Nothing yet.')).not.toBeInTheDocument()
  })
})
