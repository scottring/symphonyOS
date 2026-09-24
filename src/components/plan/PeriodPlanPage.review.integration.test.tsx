// Review, end to end, against a CONTROLLED PERSISTENCE BOUNDARY.
//
// Codex, 2026-09-24: "Use an isolated local integration/browser test with
// actual page/session/writer code and controlled persistence boundary; seed
// only synthetic records, simulate one failed write, assert persisted
// verdicts and no duplicate retry."
//
// WHAT IS REAL HERE, and what is not — because the difference is the whole
// point of the test:
//
//   REAL   PeriodPlanPage (the page), its `monthOrSeasonWriters`,
//          usePlanSessionHost (draft persistence, resume, the save/retry
//          state machine), applySession (write order, progress, idempotency),
//          PlanSession (the review UI), and localStorage.
//
//   STAND-IN   `store` below — an in-memory task table standing exactly where
//          useSupabaseTasks sits. It is NOT a database: no RLS, no triggers,
//          no placement cache maintained server-side. So this file proves what
//          the CLIENT does with a write that fails and a save that is retried.
//          It cannot prove what Postgres does with the rows, and does not try.
//
//   NOT PROVEN, and needing a real isolated Supabase project to prove:
//          that keepForward / dropCommitment / completeTask themselves write
//          the right commitment rows, that the bucket/monthStart cache
//          triggers follow, and that RLS admits the write. See
//          docs/planning/2026-09-24-implementation-progress.md.
//
// Every row here is synthetic, created in this file and thrown away with it.
// Nothing reads or writes the shared demo account.
import { useState } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Task } from '@/types/task'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'
import { readDraft } from '@/lib/planning/sessionDraft'

const now = new Date(2026, 8, 10, 9, 0)
const pinClock = () => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) }
const thisMonth = new Date(2026, 8, 1)
const lastMonth = new Date(2026, 7, 1)

// ── The persistence boundary ────────────────────────────────────────────────
/**
 * One in-memory table, and a log of every write attempted against it. `fail`
 * names ONE writer that refuses, once — the half-failed Save the acceptance
 * asks about. Everything above this object is the app's own code.
 */
const store = {
  rows: [] as Task[],
  log: [] as string[],
  fail: null as string | null,
  /** Refuse once, then behave. */
  refuse(name: string) {
    if (store.fail !== name) return false
    store.fail = null
    store.log.push(`${name}:REFUSED`)
    return true
  },
  row: (id: string) => store.rows.find((t) => t.id === id),
}
let bump = () => {}

const writers = {
  addTask: async (title: string, _a?: unknown, _b?: unknown, _c?: unknown, o?: Record<string, unknown>) => {
    const id = (o?.id as string) ?? `gen-${store.rows.length}`
    if (store.refuse('addTask')) return undefined
    // A pre-generated id is what makes a retry idempotent: the row is already
    // there, so the second attempt finds it instead of writing a second copy.
    // (Postgres does this with a primary key; here, explicitly.)
    const existing = store.row(id)
    if (existing) { store.log.push(`addTask:${id}:ALREADY`); return id }
    store.log.push(`addTask:${id}:${title}`)
    store.rows.push({ id, title, completed: false, createdAt: new Date(), updatedAt: new Date(), bucket: 'month', ...o } as Task)
    bump()
    return id
  },
  keepForward: async (id: string, place: Record<string, Date>, _prev: Date) => {
    if (store.refuse('keepForward')) return undefined
    const t = store.row(id)
    if (!t) return undefined
    store.log.push(`keepForward:${id}`)
    Object.assign(t, place, { updatedAt: new Date() })
    bump()
    return id
  },
  dropCommitment: async (id: string, _level: string, _prev: Date) => {
    if (store.refuse('dropCommitment')) return false
    const t = store.row(id)
    if (!t) return false
    store.log.push(`dropCommitment:${id}`)
    Object.assign(t, { monthStart: undefined, bucket: 'inbox', dropped: true })
    bump()
    return true
  },
  completeTask: async (id: string) => {
    if (store.refuse('completeTask')) return false
    const t = store.row(id)
    if (!t) return false
    store.log.push(`completeTask:${id}`)
    Object.assign(t, { completed: true, updatedAt: new Date() })
    bump()
    return true
  },
  updateTask: async (id: string, patch: Record<string, unknown>) => {
    if (store.refuse('updateTask')) return false
    const t = store.row(id)
    if (!t) return false
    store.log.push(`updateTask:${id}:${Object.keys(patch).join(',')}`)
    Object.assign(t, patch, { updatedAt: new Date() })
    bump()
    return true
  },
  toggleTask: vi.fn(), deleteTask: vi.fn(), updateTasksBulk: vi.fn(), setGoal: vi.fn(), pushTask: vi.fn(),
}

vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => {
    const [, force] = useState(0)
    bump = () => force((n) => n + 1)
    return { tasks: [...store.rows], loading: false, ...writers }
  },
}))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: (raw: Record<string, unknown>) => raw }))
vi.mock('@/hooks/useDomain', () => ({ useDomain: () => ({ layers: new Set(['work', 'family', 'personal', 'unsorted']), soleDomain: 'family' }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ getCurrentUserMember: () => ({ id: 'me' }) }) }))
vi.mock('@/hooks/useHouseholdSeasons', () => ({ useHouseholdSeasons: () => ({ seasons: DEFAULT_SEASONS, loading: false, canEdit: true, setSeasons: vi.fn() }) }))
vi.mock('@/hooks/useRoutines', () => ({ useRoutines: () => ({ activeRoutines: [], routines: [], loading: false }) }))
vi.mock('@/contexts/GoalsContext', () => ({
  GoalsProvider: ({ children }: { children: React.ReactNode }) => children,
  useGoalsContext: () => ({ goals: [], areas: [{ id: 'a1', name: 'General' }], addGoal: vi.fn(), updateGoal: vi.fn(), deleteGoal: vi.fn(), addArea: vi.fn() }),
}))
vi.mock('@/lib/today/domainFilter', () => ({ filterTasksForLayers: (t: Task[]) => t, matchesLayers: () => true }))

/** The session record — the other half of persistence, same treatment. */
const sessionStore = { saved: null as null | { at: Date; authorId: string; notes: { wentWell: string; didnt: string } }, fail: false, saves: 0 }
vi.mock('@/hooks/usePlanningSession', () => ({
  usePlanningSession: (_h: string, token: string) => ({
    saved: sessionStore.saved, mine: null, loading: false, loadedToken: token, error: null,
    reload: vi.fn(),
    save: async (notes: { wentWell: string; didnt: string }) => {
      sessionStore.saves++
      if (sessionStore.fail) { sessionStore.fail = false; return false }
      sessionStore.saved = { at: new Date(), authorId: 'u1', notes }
      return true
    },
  }),
  monthToken: (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}`,
  yearToken: (y: number) => String(y),
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => vi.fn(),
}))

import { PeriodPlanPage } from './PeriodPlanPage'

const task = (over: Partial<Task>): Task => ({
  id: 't', title: 'T', completed: false, createdAt: new Date(2026, 0, 1), updatedAt: new Date(), bucket: 'month', context: 'family', ...over,
} as Task)

const renderPage = () => render(<MemoryRouter><PeriodPlanPage level="month" /></MemoryRouter>)
const DRAFT_KEY = 'symphony.planSession.u1.month.2026-09-01'

/** Give a look-back row its verdict. */
const verdict = (title: string, label: string) => {
  const row = screen.getByText(title).closest('li')!
  fireEvent.click(within(row).getByRole('button', { name: label }))
}
const stepTo = async (name: RegExp) => {
  fireEvent.click(await screen.findByRole('button', { name }))
}

describe('Review writes what it says, survives one failed write, and does not write twice', () => {
  beforeEach(() => {
    pinClock()
    localStorage.clear()
    store.rows = [
      // Last month — these are what the look-back offers verdicts on.
      task({ id: 'keep-me', title: 'Finish the porch', monthStart: lastMonth }),
      task({ id: 'drop-me', title: 'Re-tile the hallway', monthStart: lastMonth }),
      task({ id: 'done-me', title: 'Book the chimney sweep', monthStart: lastMonth }),
      // This month — what the review shows as already planned.
      task({ id: 'already', title: 'Order firewood', monthStart: thisMonth }),
    ]
    store.log = []
    store.fail = null
    sessionStore.saved = null; sessionStore.fail = false; sessionStore.saves = 0
  })
  afterEach(() => { vi.useRealTimers() })

  it('a clean Save persists every verdict exactly once, and clears the draft', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Plan September' }))
    verdict('Finish the porch', 'Keep')
    verdict('Re-tile the hallway', 'Drop')
    verdict('Book the chimney sweep', 'Done')
    await stepTo(/^Next: plan September/)
    await stepTo(/^Next: save/)
    fireEvent.click(await screen.findByRole('button', { name: 'Save September' }))

    await waitFor(() => expect(store.row('drop-me')!.bucket).toBe('inbox'))
    // Persisted, not just announced.
    expect(store.row('keep-me')!.monthStart).toEqual(thisMonth)
    expect(store.row('done-me')!.completed).toBe(true)
    expect(sessionStore.saved).not.toBeNull()
    // Once each — no write repeated by a re-render.
    expect(store.log.filter((l) => l.startsWith('keepForward:keep-me'))).toHaveLength(1)
    expect(store.log.filter((l) => l.startsWith('dropCommitment:drop-me'))).toHaveLength(1)
    expect(store.log.filter((l) => l.startsWith('completeTask:done-me'))).toHaveLength(1)
    // A finished save leaves no draft behind.
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).toBeNull())
  })

  it('one refused write keeps its verdict, and Save again retries ONLY that one', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Plan September' }))
    verdict('Finish the porch', 'Keep')
    verdict('Re-tile the hallway', 'Drop')
    verdict('Book the chimney sweep', 'Done')
    await stepTo(/^Next: plan September/)
    // A new goal typed in the review — the "edit, then save" half of the ask.
    const goalBox = screen.getByLabelText(/new goal for September/i)
    fireEvent.change(goalBox, { target: { value: 'Make the house warm for winter' } })
    fireEvent.submit(goalBox.closest('form')!)
    await stepTo(/^Next: save/)

    store.fail = 'dropCommitment'                      // exactly one write refuses
    fireEvent.click(await screen.findByRole('button', { name: 'Save September' }))

    // The page says so, and says the draft is still there.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Some of this didn't save/)
    expect(alert).toHaveTextContent(/Save again retries only these/)

    // What landed, landed. What didn't, didn't.
    expect(store.row('keep-me')!.monthStart).toEqual(thisMonth)
    expect(store.row('done-me')!.completed).toBe(true)
    expect(store.row('drop-me')!.bucket).toBe('month')
    expect(store.rows.filter((t) => t.title === 'Make the house warm for winter')).toHaveLength(1)

    // The PERSISTED draft is the resume point: the refused verdict and nothing else.
    const left = readDraft('u1', 'month', '2026-09-01')!
    expect(Object.keys(left.verdicts)).toEqual(['drop-me'])
    expect(left.newGoals).toHaveLength(0)

    // Retry. The one refusal is spent, so this time it lands.
    const before = store.log.length
    fireEvent.click(screen.getByRole('button', { name: 'Save September' }))
    await waitFor(() => expect(store.row('drop-me')!.bucket).toBe('inbox'))

    // No duplicate work: the retry touched the dropped row and the session
    // record, and nothing that had already succeeded.
    const retried = store.log.slice(before)
    expect(retried.filter((l) => l.startsWith('dropCommitment:'))).toHaveLength(1)
    expect(retried.filter((l) => l.startsWith('keepForward:'))).toHaveLength(0)
    expect(retried.filter((l) => l.startsWith('completeTask:'))).toHaveLength(0)
    expect(retried.filter((l) => l.startsWith('addTask:'))).toHaveLength(0)
    // And still exactly one goal, not two.
    expect(store.rows.filter((t) => t.title === 'Make the house warm for winter')).toHaveLength(1)
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).toBeNull())
  })

  it('a refused SESSION record leaves the row writes alone and does not write them again', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Plan September' }))
    verdict('Book the chimney sweep', 'Done')
    await stepTo(/^Next: plan September/)
    await stepTo(/^Next: save/)

    sessionStore.fail = true
    fireEvent.click(await screen.findByRole('button', { name: 'Save September' }))
    await screen.findByRole('alert')
    expect(store.row('done-me')!.completed).toBe(true)
    const completes = store.log.filter((l) => l.startsWith('completeTask:')).length

    fireEvent.click(screen.getByRole('button', { name: 'Save September' }))
    await waitFor(() => expect(sessionStore.saved).not.toBeNull())
    // The verdict was already written and had been dropped from the draft, so
    // the retry does not tick the same row a second time.
    expect(store.log.filter((l) => l.startsWith('completeTask:'))).toHaveLength(completes)
  })

  it('Close keeps the draft and writes nothing', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Plan September' }))
    verdict('Re-tile the hallway', 'Drop')
    fireEvent.click(screen.getByRole('button', { name: 'Close · keep my draft' }))

    expect(store.log).toHaveLength(0)
    expect(store.row('drop-me')!.bucket).toBe('month')
    const kept = readDraft('u1', 'month', '2026-09-01')!
    expect(kept.verdicts).toEqual({ 'drop-me': 'drop' })

    // Reopening resumes on the same draft rather than starting empty.
    fireEvent.click(screen.getByRole('button', { name: 'Continue planning September' }))
    const row = screen.getByText('Re-tile the hallway').closest('li')!
    expect(within(row).getByRole('button', { name: 'Drop' })).toHaveAttribute('aria-pressed', 'true')
  })
})
