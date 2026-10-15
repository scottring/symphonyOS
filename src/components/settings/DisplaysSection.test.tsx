import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn(), revoke: vi.fn() }))
vi.mock('@/lib/display/pairing', () => ({ createPairingCode: mocks.create, listDisplays: mocks.list, revokeDisplay: mocks.revoke }))

import { DisplaysSection } from './DisplaysSection'

beforeEach(() => {
  mocks.create.mockReset(); mocks.list.mockReset(); mocks.revoke.mockReset()
  mocks.list.mockResolvedValue([])
})

describe('DisplaysSection', () => {
  it('makes a code and shows it with its countdown', async () => {
    mocks.create.mockResolvedValue({ ok: true, code: { code: 'ABC234', expiresAt: new Date(Date.now() + 10 * 60_000) } })
    render(<DisplaysSection />)
    fireEvent.click(await screen.findByRole('button', { name: /pair a display/i }))
    await waitFor(() => expect(screen.getByLabelText('Pairing code')).toHaveTextContent('ABC234'))
    expect(screen.getByText(/Good for 9:5\d|Good for 10:00/)).toBeInTheDocument()
  })
  it('shows the server’s refusal to a member who is not an owner', async () => {
    mocks.create.mockResolvedValue({ ok: false, error: 'Only a household owner or admin can pair a display' })
    render(<DisplaysSection />)
    fireEvent.click(await screen.findByRole('button', { name: /pair a display/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/owner or admin/))
  })
  it('lists live displays (not revoked ones) and revokes on request', async () => {
    mocks.list.mockResolvedValueOnce([
      { id: 'd1', name: 'Kitchen wall', pairedAt: new Date('2026-10-15'), lastSeenAt: null, revokedAt: null },
      { id: 'd2', name: 'Old tablet', pairedAt: new Date('2026-09-01'), lastSeenAt: null, revokedAt: new Date('2026-10-01') },
    ]).mockResolvedValueOnce([])
    mocks.revoke.mockResolvedValue({ ok: true })
    render(<DisplaysSection />)
    expect(await screen.findByText('Kitchen wall')).toBeInTheDocument()
    expect(screen.queryByText('Old tablet')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith('d1'))
    await waitFor(() => expect(screen.queryByText('Kitchen wall')).toBeNull())
  })
})
