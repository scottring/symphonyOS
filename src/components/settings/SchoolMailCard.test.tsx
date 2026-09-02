import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

const h = vi.hoisted(() => ({
  retry: vi.fn().mockResolvedValue(undefined),
  state: {
    address: 'p7k2mq4x@symphony-os.com' as string | null,
    loading: false,
    error: null as string | null,
    recent: [] as Array<{
      id: string; subject: string | null; sourceLabel: string | null
      status: string; error: string | null; createdAt: string
    }>,
  },
}))

vi.mock('@/hooks/useSchoolMail', () => ({
  useSchoolMail: () => ({ ...h.state, retry: h.retry, refresh: vi.fn() }),
}))

import { SchoolMailCard } from './SchoolMailCard'

const writeText = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  h.retry.mockClear()
  writeText.mockClear()
  h.state.address = 'p7k2mq4x@symphony-os.com'
  h.state.loading = false
  h.state.error = null
  h.state.recent = []
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText }, configurable: true, writable: true,
  })
})

describe('SchoolMailCard', () => {
  it('shows the household forwarding address and the password warning', () => {
    render(<SchoolMailCard />)
    expect(screen.getByText('School mail')).toBeInTheDocument()
    expect(screen.getByText('p7k2mq4x@symphony-os.com')).toBeInTheDocument()
    expect(screen.getByText(/Treat this address like a password/i)).toBeInTheDocument()
  })

  it('copies the address and flips the button label', async () => {
    render(<SchoolMailCard />)
    const copy = screen.getByRole('button', { name: /copy/i })
    await act(async () => { fireEvent.click(copy) })

    expect(writeText).toHaveBeenCalledWith('p7k2mq4x@symphony-os.com')
    await waitFor(() => expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument())
  })

  it('offers Retry only on a failed capture, and calls retry with its id', async () => {
    h.state.recent = [
      {
        id: 'c1', subject: 'Field trip Friday', sourceLabel: 'Sunrise Elementary',
        status: 'extracted', error: null, createdAt: '2026-09-02T14:00:00Z',
      },
      {
        id: 'c2', subject: 'Picture day', sourceLabel: 'ClassDojo',
        status: 'failed', error: 'model timeout', createdAt: '2026-09-01T09:00:00Z',
      },
    ]
    render(<SchoolMailCard />)

    expect(screen.getByText('Field trip Friday')).toBeInTheDocument()
    expect(screen.getByText('Picture day')).toBeInTheDocument()
    const retryButtons = screen.getAllByRole('button', { name: /retry/i })
    expect(retryButtons).toHaveLength(1)

    await act(async () => { fireEvent.click(retryButtons[0]) })
    expect(h.retry).toHaveBeenCalledWith('c2')
  })

  it('says nothing has arrived yet when there are no captures', () => {
    render(<SchoolMailCard />)
    expect(screen.getByText(/No email has arrived yet/i)).toBeInTheDocument()
  })

  it('renders no address block while the address is still unknown', () => {
    h.state.address = null
    h.state.loading = true
    render(<SchoolMailCard />)
    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull()
  })

  // The card used to swallow all three of the hook's other states: a load that
  // failed, a load still running, and a signed-in user with no household. All
  // three rendered as the flat lie "No email has arrived yet."
  it('shows a skeleton, not "nothing yet", while the load is still running', () => {
    h.state.loading = true
    render(<SchoolMailCard />)
    expect(screen.getByTestId('school-mail-skeleton')).toBeInTheDocument()
    expect(screen.queryByText(/No email has arrived yet/i)).toBeNull()
  })

  it('says so quietly when the load failed', () => {
    h.state.error = 'permission denied for table captures'
    render(<SchoolMailCard />)
    expect(screen.getByText(/permission denied for table captures/)).toBeInTheDocument()
  })

  // No household means there is no address to mint — the fix is to join one,
  // and saying nothing left the reader staring at an empty card.
  it('points a household-less user at the thing that would give them an address', () => {
    h.state.address = null
    h.state.loading = false
    render(<SchoolMailCard />)
    expect(screen.getByText(/Join or create a household/i)).toBeInTheDocument()
  })

  it('says nothing about households while the address is still loading', () => {
    h.state.address = null
    h.state.loading = true
    render(<SchoolMailCard />)
    expect(screen.queryByText(/Join or create a household/i)).toBeNull()
  })
})
