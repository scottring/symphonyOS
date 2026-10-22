import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSession: vi.fn(),
  signInAnonymously: vi.fn(),
  signOut: vi.fn(),
  from: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    auth: { getSession: mocks.getSession, signInAnonymously: mocks.signInAnonymously, signOut: mocks.signOut },
    from: mocks.from,
  },
}))

import { claimPairingCode, createPairingCode, isDisplaySession, isPairing, listDisplays, myDisplay, revokeDisplay } from './pairing'

beforeEach(() => { vi.clearAllMocks() })

describe('createPairingCode', () => {
  it('returns the code and its expiry', async () => {
    mocks.rpc.mockResolvedValue({ data: { code: 'ABC234', expires_at: '2026-10-15T10:10:00Z' }, error: null })
    const r = await createPairingCode('Kitchen wall')
    expect(mocks.rpc).toHaveBeenCalledWith('create_display_pairing_code', { p_name: 'Kitchen wall' })
    expect(r).toEqual({ ok: true, code: { code: 'ABC234', expiresAt: new Date('2026-10-15T10:10:00Z') } })
  })
  it('passes the server’s refusal through (a member, not an owner)', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Only a household owner or admin can pair a display' } })
    expect(await createPairingCode()).toEqual({ ok: false, error: 'Only a household owner or admin can pair a display' })
  })
})

describe('a kid’s tablet', () => {
  it('pairs for one family member, with how it lays out the day', async () => {
    mocks.rpc.mockResolvedValue({ data: { code: 'KAL234', expires_at: '2026-10-21T10:10:00Z' }, error: null })
    await createPairingCode('Kaleb’s tablet', { familyMemberId: 'kaleb', layout: 'trail' })
    expect(mocks.rpc).toHaveBeenCalledWith('create_display_pairing_code', { p_name: 'Kaleb’s tablet', p_family_member_id: 'kaleb', p_layout: 'trail' })
  })
  it('claims and says which kid it is for', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } })
    mocks.rpc.mockResolvedValue({ data: { household_id: 'h1', name: 'Ella’s tablet', family_member_id: 'ella' }, error: null })
    expect(await claimPairingCode('ELL234')).toEqual({ ok: true, householdId: 'h1', name: 'Ella’s tablet', familyMemberId: 'ella' })
  })
  it('reads its own display: the kid and the layout', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 'd1', name: 'Kaleb’s tablet', household_id: 'h1', family_member_id: 'kaleb', layout: 'trail' }, error: null })
    expect(await myDisplay()).toEqual({ id: 'd1', name: 'Kaleb’s tablet', householdId: 'h1', familyMemberId: 'kaleb', layout: 'trail' })
    expect(mocks.rpc).toHaveBeenCalledWith('my_display')
  })
  it('is null for a person, or a server without the function', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    expect(await myDisplay()).toBeNull()
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'function my_display() does not exist' } })
    expect(await myDisplay()).toBeNull()
  })
})

describe('claimPairingCode', () => {
  it('refuses a malformed code before touching the network', async () => {
    expect(await claimPairingCode('ab')).toEqual({ ok: false, error: 'A code is six letters and digits.' })
    expect(mocks.getSession).not.toHaveBeenCalled()
  })
  it('never turns a person’s signed-in account into a display', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: false } } } })
    const r = await claimPairingCode('abc234')
    expect(r.ok).toBe(false)
    expect(mocks.signInAnonymously).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('signs in anonymously when signed out, then claims the upper-cased code', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    mocks.signInAnonymously.mockResolvedValue({ error: null })
    mocks.rpc.mockResolvedValue({ data: { household_id: 'h1', name: 'Kitchen wall' }, error: null })
    expect(await claimPairingCode(' abc234 ')).toEqual({ ok: true, householdId: 'h1', name: 'Kitchen wall', familyMemberId: null })
    expect(mocks.signInAnonymously).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('claim_display_pairing', { p_code: 'ABC234' })
  })
  it('says plainly when anonymous sign-in is not enabled on the project', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    mocks.signInAnonymously.mockResolvedValue({ error: { message: 'Anonymous sign-ins are disabled' } })
    const r = await claimPairingCode('abc234')
    expect(r).toEqual({ ok: false, error: 'Display sign-in is not enabled for this Symphony yet.' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('an already-anonymous session claims without signing in again', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } })
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'That code is not valid or has expired' } })
    expect(await claimPairingCode('abc234')).toEqual({ ok: false, error: 'That code is not valid or has expired' })
    expect(mocks.signInAnonymously).not.toHaveBeenCalled()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
  it('is pairing from the sign-in until the claim answers, so nothing signs the new session out meanwhile', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    const seen: boolean[] = []
    mocks.signInAnonymously.mockImplementation(async () => { seen.push(isPairing()); return { error: null } })
    mocks.rpc.mockImplementation(async () => { seen.push(isPairing()); return { data: { household_id: 'h1', name: 'Kaleb’s tablet', family_member_id: 'kaleb' }, error: null } })
    expect(isPairing()).toBe(false)
    expect((await claimPairingCode('KAL234')).ok).toBe(true)
    expect(seen).toEqual([true, true])
    expect(isPairing()).toBe(false)
  })
  it('a refused code signs out the sign-in it just made, so the pairing screen stays with the reason', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    mocks.signInAnonymously.mockResolvedValue({ error: null })
    mocks.signOut.mockImplementation(async () => { expect(isPairing()).toBe(true); return { error: null } })
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'That code is not valid or has expired' } })
    expect(await claimPairingCode('abc234')).toEqual({ ok: false, error: 'That code is not valid or has expired' })
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
    expect(isPairing()).toBe(false)
  })
})

describe('displays', () => {
  it('isDisplaySession is true or false only when the server says so', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 'display', error: null })
    expect(await isDisplaySession()).toBe(true)
    mocks.rpc.mockResolvedValueOnce({ data: 'member', error: null })
    expect(await isDisplaySession()).toBe(false)
    // It cannot say (offline, a server error): not a reason to sign a tablet out.
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
    expect(await isDisplaySession()).toBeNull()
  })
  it('lists displays newest first and parses dates', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: 'd1', name: 'Kitchen wall', paired_at: '2026-10-15T10:00:00Z', last_seen_at: null, revoked_at: null }], error: null })
    mocks.from.mockReturnValue({ select: () => ({ order }) })
    const rows = await listDisplays()
    expect(order).toHaveBeenCalledWith('paired_at', { ascending: false })
    expect(rows).toEqual([{ id: 'd1', name: 'Kitchen wall', pairedAt: new Date('2026-10-15T10:00:00Z'), lastSeenAt: null, revokedAt: null, familyMemberId: null, layout: null }])
  })
  it('revokeDisplay calls the RPC and reports a refusal', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { revoked: true }, error: null })
    expect(await revokeDisplay('d1')).toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('revoke_display', { p_display_id: 'd1' })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Only a household owner or admin can revoke a display' } })
    expect(await revokeDisplay('d1')).toEqual({ ok: false, error: 'Only a household owner or admin can revoke a display' })
  })
})
