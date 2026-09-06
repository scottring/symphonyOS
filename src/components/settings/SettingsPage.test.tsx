import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

// The Admin tab's "Founding households" block: signup is now gated on an
// approved waitlist row (demo run 2026-09-06 — a founding household could
// not sign up because a live trigger allow-listed six emails). This test
// mounts the real page with the surrounding hooks stubbed, admin forced on.

vi.mock('@/hooks/useIsAppAdmin', () => ({ useIsAppAdmin: () => ({ isAdmin: true, loading: false }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({ members: [], addMember: vi.fn(), updateMember: vi.fn(), deleteMember: vi.fn() }),
}))
vi.mock('@/hooks/useHouseholdInvitations', () => ({
  useHouseholdInvitations: () => ({ invitations: [], createInvitation: vi.fn(), deleteInvitation: vi.fn() }),
}))
vi.mock('@/hooks/useTextSize', () => ({ useTextSize: () => ({ largeText: false, setLargeText: vi.fn() }) }))
vi.mock('./CalendarSettings', () => ({ CalendarSettings: () => null }))
vi.mock('./WaitlistAdmin', () => ({ WaitlistAdmin: () => null }))
vi.mock('./ThemeSelector', () => ({ ThemeSelector: () => null }))
vi.mock('./PlacePicker', () => ({ PlacePicker: () => null }))
vi.mock('./HomeAddressSettings', () => ({ HomeAddressSettings: () => null }))
vi.mock('./PlanningRhythmSettings', () => ({ PlanningRhythmSettings: () => null }))
vi.mock('./SeasonsSettings', () => ({ SeasonsSettings: () => null }))
vi.mock('./DemoControls', () => ({ DemoControls: () => null }))
vi.mock('./SchoolMailCard', () => ({ SchoolMailCard: () => null }))

const mocks = vi.hoisted(() => ({ approve: vi.fn() }))
const state: { rows: { id: string; email: string; createdAt: Date; approvedAt: Date | null }[]; loading: boolean; waitlistApproveError: string | null } = { rows: [], loading: false, waitlistApproveError: null }
vi.mock('@/hooks/useWaitlistAdmin', () => ({
  useWaitlistAdmin: () => ({ rows: state.rows, loading: state.loading, approve: mocks.approve, approveError: state.waitlistApproveError }),
}))

import { SettingsPage } from './SettingsPage'

describe('SettingsPage Admin: Founding households', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.rows = []
    state.loading = false
    state.waitlistApproveError = null
  })

  function openAdminTab() {
    render(<SettingsPage onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Admin/ }))
  }

  it('lists a pending signup with its date and an Approve button', () => {
    state.rows = [{ id: 'w1', email: 'founding@example.com', createdAt: new Date(2026, 8, 4), approvedAt: null }]
    openAdminTab()
    const section = screen.getByText('Founding households').closest('section')!
    expect(within(section).getByText('founding@example.com')).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: /Approve/ })).toBeInTheDocument()
  })

  it('approving calls the hook with the row id', () => {
    state.rows = [{ id: 'w1', email: 'founding@example.com', createdAt: new Date(2026, 8, 4), approvedAt: null }]
    openAdminTab()
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }))
    expect(mocks.approve).toHaveBeenCalledWith('w1')
  })

  it('shows the reason when the database refused an approve', () => {
    // This list IS the signup gate. A silent failure meant an admin telling a
    // founding household they were in while the signup page kept refusing them.
    state.rows = [{ id: 'w1', email: 'founding@example.com', createdAt: new Date(2026, 8, 4), approvedAt: null }]
    state.waitlistApproveError = 'permission denied for table waitlist'
    openAdminTab()
    const section = screen.getByText('Founding households').closest('section')!
    expect(within(section).getByRole('alert')).toHaveTextContent(/permission denied for table waitlist/)
    // And the row is still offered — nothing pretended it worked.
    expect(within(section).getByRole('button', { name: /Approve/ })).toBeInTheDocument()
  })

  it('an approved row shows the approved label instead of the button', () => {
    state.rows = [{ id: 'w1', email: 'done@example.com', createdAt: new Date(2026, 8, 1), approvedAt: new Date(2026, 8, 2) }]
    openAdminTab()
    const section = screen.getByText('Founding households').closest('section')!
    expect(within(section).getByText('approved')).toBeInTheDocument()
    expect(within(section).queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument()
  })
})
