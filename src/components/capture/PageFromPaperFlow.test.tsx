import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@/test/test-utils'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PlanItem } from '@/lib/planParse'
import type { SessionDraft } from '@/lib/planning/session'
import type { Task } from '@/types/task'
import { ALL_LAYERS } from '@/lib/domains'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'

const mocks = vi.hoisted(() => ({
  parseFromBlob: vi.fn(),
  reset: vi.fn(),
  retry: vi.fn(),
  status: 'idle' as string,
  items: [] as PlanItem[],
  altitude: 'week' as string,
  tasks: [] as Task[],
  commitPage: vi.fn(),
  readDraft: vi.fn(),
  writeDraft: vi.fn(),
}))

vi.mock('@/hooks/usePageFromPaper', () => ({
  usePageFromPaper: () => ({
    status: mocks.status,
    result: { items: mocks.items, notes: [], unclear: [], windowDates: [], altitude: mocks.altitude, storagePath: 'pages/p.jpg', pageTitle: null, titlePeriod: null },
    error: null,
    parseFromBlob: mocks.parseFromBlob,
    retry: mocks.retry,
    reset: mocks.reset,
  }),
}))
vi.mock('@/hooks/useCommitPage', () => ({ useCommitPage: () => ({ commitPage: mocks.commitPage }) }))
vi.mock('@/hooks/useSupabaseTasks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSupabaseTasks')>()
  return { ...actual, useSupabaseTasks: () => ({ tasks: mocks.tasks }) }
})
vi.mock('@/hooks/useDomain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useDomain')>()
  return { ...actual, useDomain: () => ({ layers: ALL_LAYERS, soleDomain: null }) }
})
vi.mock('@/hooks/useFamilyMembers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useFamilyMembers')>()
  return { ...actual, useFamilyMembers: () => ({ getCurrentUserMember: () => null, members: [] }) }
})
vi.mock('@/hooks/useHouseholdSeasons', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useHouseholdSeasons')>()
  return { ...actual, useHouseholdSeasons: () => ({ seasons: DEFAULT_SEASONS, loading: false }) }
})
vi.mock('@/contexts/GoalsContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/GoalsContext')>()
  return { ...actual, useGoalsContext: () => ({ goals: [] }) }
})
vi.mock('@/lib/planning/sessionDraft', () => ({
  readDraft: mocks.readDraft, writeDraft: mocks.writeDraft, writeDraftAndAnnounce: mocks.writeDraft, clearDraft: vi.fn(),
  DRAFT_CHANGED_EVENT: 'symphony:plan-draft-changed',
}))
vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase')>()
  return { ...actual, getAuthUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) }
})
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn() }
})

import { PageFromPaperFlow } from './PageFromPaperFlow'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.status = 'idle'
  mocks.items = []
  mocks.altitude = 'week'
  mocks.tasks = []
  mocks.readDraft.mockReturnValue(null)
  mocks.commitPage.mockResolvedValue({ route: '/week', createdTaskIds: [], createdNoteIds: [] })
})

const task = (title: string): PlanItem => ({
  title, placement: { kind: 'week' }, time: null, assigneeId: null, note: null,
  dateHint: null, kind: 'task', recurring: null, phone: null, contactMemberId: null,
})
/** The week actually in progress as the test runs — the offer is about now. */
function currentWeekYmd(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const openDraft: SessionDraft = {
  level: 'week', periodStart: currentWeekYmd(), prevStart: currentWeekYmd(),
  verdicts: {}, actionTitles: {}, wentWell: '', didnt: '',
  newGoals: [], newTasks: [], takenFromAbove: [], keptAlready: [], actionIds: {}, created: [],
}

describe('PageFromPaperFlow', () => {
  it('shows the camera by default, with no initialBlob', () => {
    render(<PageFromPaperFlow members={[]} onClose={vi.fn()} />)
    expect(mocks.parseFromBlob).not.toHaveBeenCalled()
    // The camera modal renders some capture affordance rather than a loading/review state.
    expect(screen.queryByText(/Reading your page/i)).not.toBeInTheDocument()
  })

  it('skips the camera and parses an initialBlob on mount, on the given altitude', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    render(<PageFromPaperFlow members={[]} onClose={vi.fn()} initialBlob={blob} initialAltitude="week" />)

    await waitFor(() => expect(mocks.parseFromBlob).toHaveBeenCalledWith(blob, 'week'))
  })

  describe('the plan being written', () => {
    const addToDraft = /Add to the plan I.m writing/i

    it('offers nothing when no session is in progress', async () => {
      mocks.status = 'ready'
      mocks.items = [task('Order the mulch')]
      render(<PageFromPaperFlow members={[]} onClose={vi.fn()} />)

      await screen.findByDisplayValue('Order the mulch')
      expect(screen.queryByRole('button', { name: addToDraft })).not.toBeInTheDocument()
    })

    it('offers the open draft, and merges the page into it', async () => {
      mocks.status = 'ready'
      mocks.items = [task('Order the mulch')]
      mocks.readDraft.mockReturnValue(openDraft)
      const onClose = vi.fn()
      render(<PageFromPaperFlow members={[]} onClose={onClose} />)

      const button = await screen.findByRole('button', { name: addToDraft })
      await userEvent.click(button)

      await waitFor(() => expect(mocks.writeDraft).toHaveBeenCalled())
      const written = mocks.writeDraft.mock.calls[0][1] as SessionDraft
      expect(written.newTasks.map((t) => t.title)).toEqual(['Order the mulch'])
      // The page was all task lines, so nothing is left to create — but the
      // commit still runs, to pin the page image to the period.
      expect(mocks.commitPage).toHaveBeenCalledTimes(1)
      expect(mocks.commitPage.mock.calls[0][0]).toMatchObject({ items: [], storagePath: 'pages/p.jpg' })
      await waitFor(() => expect(onClose).toHaveBeenCalled())
    })

    it('skips a line the PREVIOUS period left open, end to end', async () => {
      const sep = new Date(2026, 8, 1)
      mocks.status = 'ready'
      mocks.altitude = 'month'
      mocks.items = [task('Three roof bids'), task('Order the mulch')]
      mocks.tasks = [{
        id: 'p1', title: 'Three roof bids', completed: false, createdAt: sep, updatedAt: sep,
        bucket: 'month', commitments: [{ level: 'month', periodStart: sep, status: 'open' }],
      } as Task]
      mocks.readDraft.mockImplementation((_u: string | null, level: string, periodStart: string) =>
        (level === 'month' && periodStart === '2026-10-01'
          ? { ...openDraft, level: 'month', periodStart: '2026-10-01', prevStart: '2026-09-01' }
          : null))
      render(<PageFromPaperFlow members={[]} onClose={vi.fn()} today={new Date(2026, 9, 5)} />)

      await userEvent.click(await screen.findByRole('button', { name: addToDraft }))

      await waitFor(() => expect(mocks.writeDraft).toHaveBeenCalled())
      const written = mocks.writeDraft.mock.calls[0][1] as SessionDraft
      // The roof bids were already open on September: not added a second time.
      expect(written.newTasks.map((t) => t.title)).toEqual(['Order the mulch'])
    })

    it('withdraws the offer when the chip moves off every planned period', async () => {
      mocks.status = 'ready'
      mocks.altitude = 'month'
      mocks.items = [task('Order the mulch')]
      mocks.readDraft.mockImplementation((_u: string | null, level: string, periodStart: string) =>
        (level === 'month' && periodStart === '2026-10-01'
          ? { ...openDraft, level: 'month', periodStart: '2026-10-01', prevStart: '2026-09-01' }
          : null))
      render(<PageFromPaperFlow members={[]} onClose={vi.fn()} today={new Date(2026, 9, 5)} />)

      expect(await screen.findByRole('button', { name: addToDraft })).toBeInTheDocument()
      // The chip moves to November, which nobody is planning.
      await userEvent.click(screen.getByRole('button', { name: /Next month/i }))
      await waitFor(() => expect(screen.queryByRole('button', { name: addToDraft })).not.toBeInTheDocument())
    })
  })
})
