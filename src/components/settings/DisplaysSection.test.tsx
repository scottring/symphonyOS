import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn(), revoke: vi.fn() }))
vi.mock('@/lib/display/pairing', () => ({ createPairingCode: mocks.create, listDisplays: mocks.list, revokeDisplay: mocks.revoke }))
const thoughtMocks = vi.hoisted(() => ({ list: vi.fn(), reviewed: vi.fn() }))
vi.mock('@/lib/kids/kidThoughts', () => ({ listOpenThoughts: thoughtMocks.list, markThoughtReviewed: thoughtMocks.reviewed, kindLabel: (k: string | null) => (k === 'ask' ? 'Ask a grown-up' : null) }))

import { DisplaysSection } from './DisplaysSection'
import type { FamilyMember } from '@/types/family'

beforeEach(() => {
  mocks.create.mockReset(); mocks.list.mockReset(); mocks.revoke.mockReset()
  mocks.list.mockResolvedValue([])
  thoughtMocks.list.mockReset().mockResolvedValue([]); thoughtMocks.reviewed.mockReset().mockResolvedValue(true)
})

const kaleb = { id: 'kaleb', name: 'Kaleb', role_label: 'child', is_full_user: false, member_type: 'core' } as unknown as FamilyMember
const scott = { id: 'scott', name: 'Scott', role_label: 'parent', is_full_user: true, member_type: 'core' } as unknown as FamilyMember

describe('a kid’s tablet in Settings', () => {
  it('pairs a tablet for one kid, with how it shows the day', async () => {
    mocks.create.mockResolvedValue({ ok: true, code: { code: 'KAL234', expiresAt: new Date(Date.now() + 10 * 60_000) } })
    render(<DisplaysSection members={[scott, kaleb]} />)
    const forSelect = screen.getByLabelText('For')
    expect(Array.from((forSelect as HTMLSelectElement).options).map((o) => o.text)).toEqual(['The kitchen wall', 'Kaleb’s tablet'])
    fireEvent.change(forSelect, { target: { value: 'kaleb' } })
    fireEvent.click(screen.getByLabelText('A list, in any order'))
    fireEvent.click(screen.getByRole('button', { name: 'Pair a display' }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith('Kaleb’s tablet', { familyMemberId: 'kaleb', layout: 'list' }))
  })
  it('names the kid a paired tablet is for', async () => {
    mocks.list.mockResolvedValue([{ id: 'd1', name: 'Kaleb’s tablet', pairedAt: new Date(), lastSeenAt: null, revokedAt: null, familyMemberId: 'kaleb', layout: 'trail' }])
    render(<DisplaysSection members={[scott, kaleb]} />)
    expect(await screen.findByText(/Shows Kaleb’s day, one thing at a time/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See it' })).toHaveAttribute('href', '/kid/kaleb?layout=trail')
  })
  it('a grown-up marks a saved thought gone over', async () => {
    thoughtMocks.list.mockResolvedValue([{ id: 't1', familyMemberId: 'kaleb', text: 'Library on Saturday?', kind: 'ask', createdAt: new Date(2026, 9, 21, 16, 58), reviewedAt: null }])
    render(<DisplaysSection members={[scott, kaleb]} />)
    expect(await screen.findByText('Library on Saturday?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Went over it' }))
    await waitFor(() => expect(screen.queryByText('Library on Saturday?')).not.toBeInTheDocument())
    expect(thoughtMocks.reviewed).toHaveBeenCalledWith('t1')
  })
})

describe('DisplaysSection', () => {
  it('does not describe an unavailable list as no paired displays',async()=>{
    mocks.list.mockRejectedValueOnce(new Error('Offline'))
    render(<DisplaysSection/>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not check paired displays')
    expect(screen.queryByText('No paired displays found.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Check paired displays'}))
    expect(await screen.findByText('No paired displays found.')).toBeInTheDocument()
  })
  it('makes expired codes and network failures recoverable',async()=>{
    mocks.create.mockRejectedValueOnce(new Error('Network')).mockResolvedValueOnce({ok:true,code:{code:'OLD123',expiresAt:new Date(Date.now()-1000)}})
    render(<DisplaysSection/>)
    fireEvent.click(await screen.findByRole('button',{name:'Pair a display'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not make a pairing code')
    fireEvent.click(screen.getByRole('button',{name:'Pair a display'}))
    expect(await screen.findByText(/This code expired/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Pairing code')).not.toBeInTheDocument()
  })
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
