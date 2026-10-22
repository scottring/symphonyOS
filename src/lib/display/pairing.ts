// src/lib/display/pairing.ts
//
// A kitchen wall's own identity (migration 20261015100000_household_displays).
// An owner or admin makes a short-lived code in Settings; the display signs
// in anonymously and claims it. From then on the server treats that session
// as the wall whatever it asks for, and the database refuses the writes a
// wall never makes. Revoking fails the device closed at once.

import { useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'

export interface PairingCode { code: string; expiresAt: Date }
/** How a kid's tablet lays out the day (migration 20261021180000_kid_displays):
 *  'trail' is one thing at a time; 'list' is everything for now, any order. */
export type KidLayout = 'trail' | 'list'
export interface HouseholdDisplay { id: string; name: string; pairedAt: Date; lastSeenAt: Date | null; revokedAt: Date | null; familyMemberId: string | null; layout: KidLayout | null }
/** The signed-in display: a kitchen wall (no member) or one kid's tablet. */
export interface MyDisplay { id: string; name: string; householdId: string; familyMemberId: string | null; layout: KidLayout | null }

const asLayout = (v: unknown): KidLayout | null => (v === 'trail' || v === 'list' ? v : null)

const message = (e: unknown, fallback: string) => (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') ? (e as { message: string }).message : fallback

/** Owner or admin: a six-character code, good for ten minutes. A kid's
 *  tablet names the family member it is for and how it lays out the day. */
export async function createPairingCode(name = 'Kitchen wall', forMember?: { familyMemberId: string; layout: KidLayout }): Promise<{ ok: true; code: PairingCode } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('create_display_pairing_code', forMember
    ? { p_name: name, p_family_member_id: forMember.familyMemberId, p_layout: forMember.layout }
    : { p_name: name })
  if (error) return { ok: false, error: message(error, 'Could not make a code') }
  const row = data as { code?: unknown; expires_at?: unknown } | null
  if (!row || typeof row.code !== 'string' || typeof row.expires_at !== 'string') return { ok: false, error: 'Could not make a code' }
  return { ok: true, code: { code: row.code, expiresAt: new Date(row.expires_at) } }
}

/** Owner or admin: the code stops working at once (Settings' "Start over").
 *  A code a display has already claimed is left alone. */
export async function cancelPairingCode(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('cancel_display_pairing_code', { p_code: code })
  return error ? { ok: false, error: message(error, 'Could not cancel that code') } : { ok: true }
}

// Pairing in progress. Between the anonymous sign-in and the claim's answer
// the session is anonymous but not yet a display; the heartbeat would sign
// it out (as revoked) and the screen would drop back to pairing, so it waits,
// and the pairing screen stays up, until this is false again.
let pairing = false
const pairingListeners = new Set<() => void>()
const setPairing = (v: boolean) => { pairing = v; pairingListeners.forEach((l) => l()) }
export const isPairing = (): boolean => pairing
export function subscribePairing(l: () => void): () => void { pairingListeners.add(l); return () => { pairingListeners.delete(l) } }
export function usePairing(): boolean { return useSyncExternalStore(subscribePairing, isPairing, isPairing) }

/** The display: sign in anonymously (afresh each time) and claim the code.
 *  Refused for a person's account: a display must never be an adult's login.
 *  A refused code signs out the sign-in this call made, so the screen stays
 *  on pairing with the reason. */
export async function claimPairingCode(code: string): Promise<{ ok: true; householdId: string; name: string; familyMemberId: string | null } | { ok: false; error: string }> {
  const trimmed = code.trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(trimmed)) return { ok: false, error: 'A code is six letters and digits.' }
  const { data: { session } } = await supabase.auth.getSession()
  if (session && !session.user.is_anonymous) return { ok: false, error: 'Sign out first: a display uses its own sign-in, not a person’s account.' }
  setPairing(true)
  try {
    // Every pairing starts from a fresh display sign-in. An old one (a revoked
    // wall being paired again) already has a display row of its own, and
    // claiming with it would fail.
    if (session) await supabase.auth.signOut({ scope: 'local' })
    const signIn = await supabase.auth.signInAnonymously()
    if (signIn.error) return { ok: false, error: /anonymous sign-ins are disabled/i.test(signIn.error.message) ? 'Display sign-in is not enabled for this Symphony yet.' : message(signIn.error, 'Could not start the display’s sign-in') }
    const refused = async (error: string) => {
      await supabase.auth.signOut().catch(() => undefined)
      return { ok: false as const, error }
    }
    const { data, error } = await supabase.rpc('claim_display_pairing', { p_code: trimmed })
    if (error) return refused(message(error, 'That code did not work'))
    const row = data as { household_id?: unknown; name?: unknown; family_member_id?: unknown } | null
    if (!row || typeof row.household_id !== 'string') return refused('That code did not work')
    return { ok: true, householdId: row.household_id, name: typeof row.name === 'string' ? row.name : 'Kitchen wall', familyMemberId: typeof row.family_member_id === 'string' ? row.family_member_id : null }
  } finally {
    setPairing(false)
  }
}

/** Is this session a paired display? Asks the server: null when it cannot
 *  say (offline, a server error), which is no reason to sign a tablet out. */
export async function isDisplaySession(): Promise<boolean | null> {
  const { data, error } = await supabase.rpc('my_surface')
  return error ? null : data === 'display'
}

/** This session's display, or null for a person (or a pre-migration server). */
export async function myDisplay(): Promise<MyDisplay | null> {
  const { data, error } = await supabase.rpc('my_display')
  if (error || !data || typeof data !== 'object') return null
  const d = data as { id?: unknown; name?: unknown; household_id?: unknown; family_member_id?: unknown; layout?: unknown }
  if (typeof d.id !== 'string' || typeof d.household_id !== 'string') return null
  return {
    id: d.id,
    name: typeof d.name === 'string' ? d.name : 'Display',
    householdId: d.household_id,
    familyMemberId: typeof d.family_member_id === 'string' ? d.family_member_id : null,
    layout: asLayout(d.layout),
  }
}

export async function listDisplays(): Promise<HouseholdDisplay[]> {
  const { data, error } = await supabase.from('household_displays').select('id, name, paired_at, last_seen_at, revoked_at, family_member_id, layout').order('paired_at', { ascending: false })
  if (error || !data) throw new Error('Could not check paired displays.')
  return (data as { id: string; name: string; paired_at: string; last_seen_at: string | null; revoked_at: string | null; family_member_id?: string | null; layout?: string | null }[])
    .map((d) => ({ id: d.id, name: d.name, pairedAt: new Date(d.paired_at), lastSeenAt: d.last_seen_at ? new Date(d.last_seen_at) : null, revokedAt: d.revoked_at ? new Date(d.revoked_at) : null, familyMemberId: d.family_member_id ?? null, layout: asLayout(d.layout) }))
}

/** The display itself: unpair (as a revoke from Settings would) and sign
 *  out. Signs out even when the server cannot be reached, so a grown-up is
 *  never stuck in kid mode; the display then stays listed in Settings to
 *  revoke there. */
export async function leaveDisplay(): Promise<{ unpaired: boolean }> {
  const { error } = await supabase.rpc('display_leave').then((r) => r, () => ({ error: true }))
  await supabase.auth.signOut().catch(() => undefined)
  return { unpaired: !error }
}

export async function revokeDisplay(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('revoke_display', { p_display_id: id })
  return error ? { ok: false, error: message(error, 'Could not revoke that display') } : { ok: true }
}
