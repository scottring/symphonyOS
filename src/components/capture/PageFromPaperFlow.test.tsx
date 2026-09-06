import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@/test/test-utils'
import { screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  parseFromBlob: vi.fn(),
  reset: vi.fn(),
  retry: vi.fn(),
  status: 'idle' as string,
}))

vi.mock('@/hooks/usePageFromPaper', () => ({
  usePageFromPaper: () => ({
    status: mocks.status,
    result: { items: [], notes: [], unclear: [], windowDates: [], altitude: 'week', storagePath: null, pageTitle: null, titlePeriod: null },
    error: null,
    parseFromBlob: mocks.parseFromBlob,
    retry: mocks.retry,
    reset: mocks.reset,
  }),
}))
vi.mock('@/hooks/useCommitPage', () => ({ useCommitPage: () => ({ commitPage: vi.fn() }) }))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn() }
})

import { PageFromPaperFlow } from './PageFromPaperFlow'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.status = 'idle'
})

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
})
