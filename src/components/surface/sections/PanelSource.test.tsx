import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { PanelSource } from './PanelSource'
import type { Capture } from '@/hooks/useCapture'

let mockCapture: Capture | null = null
let mockLoading = false

vi.mock('@/hooks/useCapture', () => ({
  useCapture: (id: string | undefined) => {
    void id
    return { capture: mockCapture, loading: mockLoading }
  },
}))

const capture: Capture = {
  id: 'c1',
  subject: 'Field trip Friday',
  sender: 'office@school.org',
  sourceLabel: 'Lower School',
  rawText: 'Please send a bag lunch and a water bottle.',
  createdAt: '2026-09-02T14:00:00Z',
}

describe('PanelSource', () => {
  beforeEach(() => {
    mockCapture = capture
    mockLoading = false
  })

  it('renders nothing when there is no capture', () => {
    mockCapture = null
    const { container } = render(<PanelSource captureId="c1" />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the sender and subject', () => {
    render(<PanelSource captureId="c1" />)
    expect(screen.getByText(/office@school\.org/)).toBeInTheDocument()
    expect(screen.getByText(/Field trip Friday/)).toBeInTheDocument()
  })

  it('shows the received date', () => {
    render(<PanelSource captureId="c1" />)
    expect(screen.getByText(/Sep 2/)).toBeInTheDocument()
  })

  it('keeps the raw text hidden until "Open original" is clicked', async () => {
    const user = userEvent.setup()
    render(<PanelSource captureId="c1" />)
    expect(screen.queryByText(/Please send a bag lunch/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open original' }))
    expect(screen.getByText(/Please send a bag lunch/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hide original' }))
    expect(screen.queryByText(/Please send a bag lunch/)).not.toBeInTheDocument()
  })

  it('offers no toggle when the capture kept no raw text', () => {
    mockCapture = { ...capture, rawText: null }
    render(<PanelSource captureId="c1" />)
    expect(screen.queryByRole('button', { name: 'Open original' })).not.toBeInTheDocument()
  })
})
