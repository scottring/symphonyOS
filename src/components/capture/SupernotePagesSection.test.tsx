import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { SupernotePagesSection } from './SupernotePagesSection'
import type { PendingPage } from '@/hooks/usePendingPages'

const dismiss = vi.fn().mockResolvedValue(true)
const commitPage = vi.fn()
let pages: PendingPage[] = []

vi.mock('@/hooks/usePendingPages', () => ({
  usePendingPages: () => ({ pages, loading: false, dismiss, refresh: vi.fn() }),
  SUPERNOTE_SOURCE_KEY: 'supernote:export',
}))
vi.mock('@/hooks/useCommitPage', () => ({ useCommitPage: () => ({ commitPage }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({ members: [], getCurrentUserMember: () => undefined }),
}))

const PAGE: PendingPage = {
  captureId: 'c-1',
  label: '20260825_090000.png',
  createdAt: new Date('2026-08-25T09:00:00Z'),
  result: {
    items: [{ title: 'Call dentist', placement: { kind: 'inbox' }, assigneeId: null, note: null }],
    notes: [],
    unclear: [],
    windowDates: ['2026-08-25'],
    storagePath: 'u/supernote/a.png',
  },
}

beforeEach(() => {
  pages = []
  dismiss.mockClear()
  dismiss.mockResolvedValue(true)
  commitPage.mockReset()
  commitPage.mockResolvedValue({ tasksCreated: 1, notesCreated: 0, failures: 0 })
})

describe('SupernotePagesSection', () => {
  it('renders nothing when no page is waiting', () => {
    const { container } = render(<SupernotePagesSection />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows one quiet line per waiting page', () => {
    pages = [PAGE]
    render(<SupernotePagesSection />)
    expect(screen.getByRole('button', { name: /review page/i })).toBeInTheDocument()
  })

  it('opens the review sheet and commits with the page storage path', async () => {
    const user = userEvent.setup()
    pages = [PAGE]
    render(<SupernotePagesSection />)
    await user.click(screen.getByRole('button', { name: /review page/i }))
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    expect(commitPage).toHaveBeenCalledWith({
      items: [expect.objectContaining({ title: 'Call dentist' })],
      notes: [],
      storagePath: 'u/supernote/a.png',
    })
    expect(dismiss).toHaveBeenCalledWith('c-1')
  })

  it('keeps the page when the commit reports a failure', async () => {
    // dismiss HARD DELETES the capture row and a page cannot be re-parsed from
    // Symphony, so a commit that lost anything must leave the row alone.
    const user = userEvent.setup()
    pages = [PAGE]
    commitPage.mockResolvedValue({ tasksCreated: 0, notesCreated: 0, failures: 1 })
    render(<SupernotePagesSection />)
    await user.click(screen.getByRole('button', { name: /review page/i }))
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    expect(commitPage).toHaveBeenCalled()
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('dismisses a page without committing anything', async () => {
    const user = userEvent.setup()
    pages = [PAGE]
    render(<SupernotePagesSection />)
    await user.click(screen.getByRole('button', { name: /dismiss page/i }))
    expect(dismiss).toHaveBeenCalledWith('c-1')
    expect(commitPage).not.toHaveBeenCalled()
  })
})
