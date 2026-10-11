import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const db = vi.hoisted(() => ({ row: null as unknown, rpc: vi.fn() }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'test@example.com' } }) }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: db.row }) }) }) }),
    rpc: db.rpc,
  },
}))

import { TestAccountReset } from './TestAccountReset'

// Scott, 2026-10-11: start a test account over without the terminal.
describe('TestAccountReset', () => {
  const assign = vi.fn()
  beforeEach(() => {
    db.row = null; db.rpc.mockReset(); assign.mockReset()
    Object.defineProperty(window, 'location', { value: { ...window.location, assign }, writable: true })
  })

  it('shows nothing on an ordinary account', async () => {
    const { container } = render(<TestAccountReset />)
    await new Promise((r) => setTimeout(r, 0))
    expect(container).toBeEmptyDOMElement()
  })

  it('asks first, then empties the account and starts fresh on Today', async () => {
    db.row = { user_id: 'u1' }
    db.rpc.mockResolvedValue({ data: 12, error: null })
    render(<TestAccountReset />)
    fireEvent.click(await screen.findByRole('button', { name: 'Start this test account over' }))
    expect(db.rpc).not.toHaveBeenCalled()
    expect(screen.getByText(/Empty test@example.com\?/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Empty it' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/today'))
    expect(db.rpc).toHaveBeenCalledWith('reset_test_account')
  })

  it('says so when the reset fails and stays put', async () => {
    db.row = { user_id: 'u1' }
    db.rpc.mockResolvedValue({ data: null, error: { message: 'nope' } })
    render(<TestAccountReset />)
    fireEvent.click(await screen.findByRole('button', { name: 'Start this test account over' }))
    fireEvent.click(screen.getByRole('button', { name: 'Empty it' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Didn't reset")
    expect(assign).not.toHaveBeenCalled()
  })
})
