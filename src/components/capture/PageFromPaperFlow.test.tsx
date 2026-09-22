import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@/test/test-utils'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PlanItem } from '@/lib/planParse'
import type { SessionDraft } from '@/lib/planning/session'

const mocks = vi.hoisted(() => ({
  parseFromBlob: vi.fn(),
  reset: vi.fn(),
  retry: vi.fn(),
  status: 'idle' as string,
  items: [] as PlanItem[],
  commitPage: vi.fn(),
  readDraft: vi.fn(),
  writeDraft: vi.fn(),
}))

vi.mock('@/hooks/usePageFromPaper', () => ({
  usePageFromPaper: () => ({
    status: mocks.status,
    result: { items: mocks.items, notes: [], unclear: [], windowDates: [], altitude: 'week', storagePath: null, pageTitle: null, titlePeriod: null },
    error: null,
    parseFromBlob: mocks.parseFromBlob,
    retry: mocks.retry,
    reset: mocks.reset,
  }),
}))
vi.mock('@/hooks/useCommitPage', () => ({ useCommitPage: () => ({ commitPage: mocks.commitPage }) }))
vi.mock('@/lib/planning/sessionDraft', () => ({ readDraft: mocks.readDraft, writeDraft: mocks.writeDraft, clearDraft: vi.fn() }))
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
  mocks.readDraft.mockReturnValue(null)
})

const task = (title: string): PlanItem => ({
  title, placement: { kind: 'week' }, time: null, assigneeId: null, note: null,
  dateHint: null, kind: 'task', recurring: null, phone: null, contactMemberId: null,
})
const openDraft: SessionDraft = {
  level: 'week', periodStart: '2026-10-04', prevStart: '2026-09-27',
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
      // Nothing was left for the ordinary commit: the page was all task lines.
      expect(mocks.commitPage).not.toHaveBeenCalled()
      await waitFor(() => expect(onClose).toHaveBeenCalled())
    })
  })
})
