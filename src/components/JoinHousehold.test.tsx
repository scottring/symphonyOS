import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

// The invitee joined the household but was never linked to their existing
// family_members row (demo run 2026-09-06). The join page now shows who
// invited you and asks which unlinked member is you.

const mocks = vi.hoisted(() => ({
  acceptInvitation: vi.fn(),
  getInvitationByToken: vi.fn(),
  getInvitationPreview: vi.fn(),
  getAuthUser: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ getAuthUser: mocks.getAuthUser }))
vi.mock('@/hooks/useHouseholdInvitations', () => ({
  useHouseholdInvitations: () => ({
    acceptInvitation: mocks.acceptInvitation,
    getInvitationByToken: mocks.getInvitationByToken,
    getInvitationPreview: mocks.getInvitationPreview,
  }),
}))

import { JoinHousehold } from './JoinHousehold'

const invitation = {
  id: 'inv1', household_id: 'h1', email: 'new@example.com', invited_by: 'alex-id',
  token: 'tok', expires_at: '2099-01-01T00:00:00Z', accepted_at: null, created_at: '2026-09-01',
}

function renderJoin() {
  return render(
    <MemoryRouter initialEntries={['/join/tok']}>
      <Routes><Route path="/join/:token" element={<JoinHousehold />} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getAuthUser.mockResolvedValue({ data: { user: { id: 'new-user', email: 'new@example.com' } } })
  mocks.getInvitationByToken.mockResolvedValue(invitation)
  mocks.acceptInvitation.mockResolvedValue({ household_id: 'h1', status: 'joined' })
})

describe('JoinHousehold preview', () => {
  it('greets by inviter and household name, and offers the candidate chooser', async () => {
    mocks.getInvitationPreview.mockResolvedValue({
      household_name: 'Chen Household', inviter_name: 'Alex', candidates: [{ id: 'e', name: 'Edith' }],
    })
    renderJoin()
    await waitFor(() => expect(screen.getByText('Alex invited you to the Chen Household')).toBeInTheDocument())
    expect(screen.getByRole('radio', { name: 'Edith' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: "I'm someone new" })).toBeInTheDocument()
  })

  it('falls back to the plain heading when there is no preview', async () => {
    mocks.getInvitationPreview.mockResolvedValue(null)
    renderJoin()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Join household' })).toBeInTheDocument())
    expect(screen.getByText('Join this household')).toBeInTheDocument()
    expect(screen.queryByText(/Which one is you/)).not.toBeInTheDocument()
  })

  it('requires a choice before Join is enabled, then passes the chosen member_id', async () => {
    mocks.getInvitationPreview.mockResolvedValue({
      household_name: 'Chen Household', inviter_name: 'Alex', candidates: [{ id: 'e', name: 'Edith' }],
    })
    renderJoin()
    const joinButton = await screen.findByRole('button', { name: 'Join household' })
    expect(joinButton).toBeDisabled()

    fireEvent.click(screen.getByRole('radio', { name: 'Edith' }))
    expect(joinButton).toBeEnabled()

    fireEvent.click(joinButton)
    await waitFor(() => expect(mocks.acceptInvitation).toHaveBeenCalledWith('tok', 'e'))
  })

  it('"I\'m someone new" is a valid choice too, passed as null', async () => {
    mocks.getInvitationPreview.mockResolvedValue({
      household_name: 'Chen Household', inviter_name: 'Alex', candidates: [{ id: 'e', name: 'Edith' }],
    })
    renderJoin()
    const joinButton = await screen.findByRole('button', { name: 'Join household' })
    fireEvent.click(screen.getByRole('radio', { name: "I'm someone new" }))
    expect(joinButton).toBeEnabled()
    fireEvent.click(joinButton)
    await waitFor(() => expect(mocks.acceptInvitation).toHaveBeenCalledWith('tok', null))
  })

  it('no candidates: Join is enabled immediately and passes null', async () => {
    mocks.getInvitationPreview.mockResolvedValue({ household_name: 'Chen Household', inviter_name: 'Alex', candidates: [] })
    renderJoin()
    const joinButton = await screen.findByRole('button', { name: 'Join household' })
    expect(joinButton).toBeEnabled()
    fireEvent.click(joinButton)
    await waitFor(() => expect(mocks.acceptInvitation).toHaveBeenCalledWith('tok', null))
  })
})

// Clarity audit 2026-09-29: "Sign in to continue" stashed the token where
// nothing read it, so a new partner ended up in setup making a 2nd household.
describe('JoinHousehold signed out', () => {
  it('"Sign in to continue" remembers the invitation and returns here after sign-in', async () => {
    localStorage.clear()
    mocks.getAuthUser.mockResolvedValue({ data: { user: null } })
    mocks.getInvitationPreview.mockResolvedValue(null)
    render(
      <MemoryRouter initialEntries={['/join/tok']}>
        <Routes>
          <Route path="/join/:token" element={<JoinHousehold />} />
          <Route path="/" element={<ReturnTo />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in to continue' }))
    expect(await screen.findByTestId('return')).toHaveTextContent('/join/tok')
    expect(JSON.parse(localStorage.getItem('symphony.pendingJoin')!).token).toBe('tok')
  })

  it('joining clears the remembered invitation', async () => {
    localStorage.setItem('symphony.pendingJoin', JSON.stringify({ token: 'tok', at: Date.now() }))
    mocks.getInvitationPreview.mockResolvedValue(null)
    renderJoin()
    fireEvent.click(await screen.findByRole('button', { name: /Join/ }))
    await waitFor(() => expect(localStorage.getItem('symphony.pendingJoin')).toBeNull())
  })
})

function ReturnTo() {
  const params = new URLSearchParams(useLocation().search)
  return <p data-testid="return">{params.get('return')}</p>
}
