// src/lib/display/pairing.ts
//
// A kitchen wall's own identity (migration 20261015100000_household_displays).
// An owner or admin makes a short-lived code in Settings; the display signs
// in anonymously and claims it. From then on the server treats that session
// as the wall whatever it asks for, and the database refuses the writes a
// wall never makes. Revoking fails the device closed at once.

import { supabase } from '@/lib/supabase'

export interface PairingCode { code: string; expiresAt: Date }
export interface HouseholdDisplay { id: string; name: string; pairedAt: Date; lastSeenAt: Date | null; revokedAt: Date | null }

const message = (e: unknown, fallback: string) => (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') ? (e as { message: string }).message : fallback

/** Owner or admin: a six-character code, good for ten minutes. */
export async function createPairingCode(name = 'Kitchen wall'): Promise<{ ok: true; code: PairingCode } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('create_display_pairing_code', { p_name: name })
  if (error) return { ok: false, error: message(error, 'Could not make a code') }
  const row = data as { code?: unknown; expires_at?: unknown } | null
  if (!row || typeof row.code !== 'string' || typeof row.expires_at !== 'string') return { ok: false, error: 'Could not make a code' }
  return { ok: true, code: { code: row.code, expiresAt: new Date(row.expires_at) } }
}

/** The display: sign in anonymously (if not already) and claim the code.
 *  Refused for a person's account: a display must never be an adult's login. */
export async function claimPairingCode(code: string): Promise<{ ok: true; householdId: string; name: string } | { ok: false; error: string }> {
  const trimmed = code.trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(trimmed)) return { ok: false, error: 'A code is six letters and digits.' }
  const { data: { session } } = await supabase.auth.getSession()
  if (session && !session.user.is_anonymous) return { ok: false, error: 'Sign out first: a display uses its own sign-in, not a person’s account.' }
  if (!session) {
    const { error } = await supabase.auth.signInAnonymously()
    if (error) return { ok: false, error: /anonymous sign-ins are disabled/i.test(error.message) ? 'Display sign-in is not enabled for this Symphony yet.' : message(error, 'Could not start the display’s sign-in') }
  }
  const { data, error } = await supabase.rpc('claim_display_pairing', { p_code: trimmed })
  if (error) return { ok: false, error: message(error, 'That code did not work') }
  const row = data as { household_id?: unknown; name?: unknown } | null
  if (!row || typeof row.household_id !== 'string') return { ok: false, error: 'That code did not work' }
  return { ok: true, householdId: row.household_id, name: typeof row.name === 'string' ? row.name : 'Kitchen wall' }
}

/** Is this session a paired display? Asks the server; false when it cannot
 *  say (an unpaired or pre-migration session is treated as a member). */
export async function isDisplaySession(): Promise<boolean> {
  const { data, error } = await supabase.rpc('my_surface')
  return !error && data === 'display'
}

export async function listDisplays(): Promise<HouseholdDisplay[]> {
  const { data, error } = await supabase.from('household_displays').select('id, name, paired_at, last_seen_at, revoked_at').order('paired_at', { ascending: false })
  if (error || !data) return []
  return (data as { id: string; name: string; paired_at: string; last_seen_at: string | null; revoked_at: string | null }[])
    .map((d) => ({ id: d.id, name: d.name, pairedAt: new Date(d.paired_at), lastSeenAt: d.last_seen_at ? new Date(d.last_seen_at) : null, revokedAt: d.revoked_at ? new Date(d.revoked_at) : null }))
}

export async function revokeDisplay(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('revoke_display', { p_display_id: id })
  return error ? { ok: false, error: message(error, 'Could not revoke that display') } : { ok: true }
}
