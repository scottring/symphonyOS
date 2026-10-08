import { supabase } from '@/lib/supabase'
import { setHomeCoords } from '@/hooks/useWeather'
import type { GeocodedPlace } from '@/lib/geocode'
import type { FamilyMemberColor } from '@/types/family'

/**
 * First-run household setup: shown once to a fresh signup, never to an
 * account that already has data or that joined someone else's household.
 */

export interface FirstRunSignals {
  /** user_profiles.onboarding_completed_at is set. */
  completed: boolean
  /** Any task visible to this account (own or shared). */
  hasTasks: boolean
  /** family_members rows visible to this account. */
  memberCount: number
}

export function needsFirstRun(s: FirstRunSignals): boolean {
  if (s.completed) return false
  if (s.hasTasks) return false          // an account that has been used
  if (s.memberCount > 1) return false   // joined an existing household
  return true
}

const flagKey = (userId: string) => `symphony.firstRun.done.${userId}`

export function isFirstRunDoneLocally(userId: string): boolean {
  try { return localStorage.getItem(flagKey(userId)) === '1' } catch { return false }
}

export function markFirstRunDoneLocally(userId: string) {
  try { localStorage.setItem(flagKey(userId), '1') } catch { /* ignore */ }
}

export async function loadFirstRunSignals(userId: string): Promise<FirstRunSignals> {
  const [profile, tasks, members] = await Promise.all([
    supabase.from('user_profiles').select('onboarding_completed_at').eq('user_id', userId).maybeSingle(),
    supabase.from('tasks').select('id', { count: 'exact', head: true }),
    supabase.from('family_members').select('id', { count: 'exact', head: true }),
  ])
  return {
    completed: !!profile.data?.onboarding_completed_at,
    hasTasks: (tasks.count ?? 0) > 0,
    memberCount: members.count ?? 0,
  }
}

/** Stamp the profile so no other browser shows setup again. */
export async function markFirstRunComplete(userId: string, extra: Record<string, unknown> = {}) {
  const { error } = await supabase.from('user_profiles').upsert(
    { user_id: userId, onboarding_completed_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...extra },
    { onConflict: 'user_id' },
  )
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Saving the setup form


export type HouseholdRole = 'parent' | 'child'

export interface FirstRunForm {
  householdName: string
  yourName: string
  /** `id` is this person's row id, made when the form row is added and kept
   *  across retries, so a retry updates the same person instead of adding or
   *  skipping one. */
  others: Array<{ id?: string; name: string; role: HouseholdRole }>
  /** Rows this form added earlier and has since removed or blanked: a retry
   *  after a partial save deletes these (and only these). */
  removedIds?: string[]
  home: GeocodedPlace | null
}

export function initialsFor(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0] ?? '').join('').substring(0, 2).toUpperCase() || '?'
}

// Self takes blue (matches the auto-seed in useFamilyMembers); others cycle the rest.
const OTHER_COLORS: FamilyMemberColor[] = ['purple', 'green', 'orange', 'pink', 'teal', 'blue']

/** A required part of setup did not save. The message is for the person. */
export class FirstRunSaveError extends Error {
  readonly detail?: string
  constructor(message: string, detail?: string) {
    super(message)
    this.name = 'FirstRunSaveError'
    this.detail = detail
  }
}

const RETRY = 'Check your connection and try again. What you entered is still here.'

function required(error: { message: string } | null, what: string) {
  if (!error) return
  console.warn(`[first-run] ${what} failed:`, error.message)
  throw new FirstRunSaveError(`We couldn't save ${what}. ${RETRY}`, error.message)
}

/** The household and its owner membership (idempotent; renames if it exists). */
async function ensureHousehold(name: string | null) {
  const rpc = await supabase.rpc('setup_household', { p_name: name })
  required(rpc.error, 'your household')
}

async function stampComplete(userId: string, extra: Record<string, unknown> = {}) {
  try {
    await markFirstRunComplete(userId, extra)
  } catch (err) {
    required({ message: (err as { message?: string } | null)?.message ?? String(err) }, 'your setup')
  }
}

/**
 * Persist the first-run form. The household, your own row, and the people you
 * listed are required: if any fails, this throws and the profile is NOT
 * stamped, so setup stays open with the form intact. Every step is safe to
 * repeat: a retry after a partial save renames rather than re-creates, and
 * adds only the people not already saved. Home is optional.
 */
export async function saveFirstRunSetup(userId: string, form: FirstRunForm): Promise<void> {
  const householdName = form.householdName.trim()
  const yourName = form.yourName.trim() || 'Me'

  // 1. Household row + owner membership.
  await ensureHousehold(householdName || null)

  // 2. Your own member row: adopt the auto-seeded one if it exists.
  const selfLookup = await supabase
    .from('family_members')
    .select('id')
    .eq('user_id', userId)
    .eq('is_full_user', true)
    .is('auth_user_id', null)
    .limit(1)
    .maybeSingle()
  required(selfLookup.error, 'your name')
  const self = selfLookup.data as { id: string } | null
  const selfRow = { name: yourName, initials: initialsFor(yourName), role_label: 'parent', member_type: 'core' }
  if (self?.id) {
    const { error } = await supabase.from('family_members').update(selfRow).eq('id', self.id)
    required(error, 'your name')
  } else {
    const { error } = await supabase
      .from('family_members')
      .insert([{ ...selfRow, user_id: userId, color: 'blue', is_full_user: true, display_order: 0, avatar_url: null }])
    required(error, 'your name')
  }

  // 3. Everyone else. Partners get a login later via Settings → Invite partner.
  //    A retry after a partial save must leave exactly what the form shows:
  //    rows are matched by the id the form gave them (so an edited name or
  //    role updates that person), people removed from the form are deleted,
  //    and only rows that never saved are inserted. Rows without an id fall
  //    back to matching by name. Nobody else is touched: at first run the only
  //    other people this account owns are ones this form saved.
  const others = form.others.filter((o) => o.name.trim())
  const removedIds = form.removedIds ?? []
  if (others.length > 0 || removedIds.length > 0) {
    const existing = await supabase
      .from('family_members')
      .select('id, name')
      .eq('user_id', userId)
      .eq('is_full_user', false)
    required(existing.error, 'the people in your household')
    const saved = (existing.data as Array<{ id: string; name: string }> | null) ?? []
    const byId = new Map(saved.map((m) => [m.id, m]))
    const byName = new Map(saved.map((m) => [m.name.trim().toLowerCase(), m]))
    const claimed = new Set<string>()

    const gone = removedIds.filter((id) => byId.has(id))
    if (gone.length > 0) {
      const { error } = await supabase.from('family_members').delete()
        .eq('user_id', userId).eq('is_full_user', false).in('id', gone)
      required(error, 'the people in your household')
    }

    const inserts: Array<Record<string, unknown>> = []
    for (const [i, o] of others.entries()) {
      const fields = {
        name: o.name.trim(),
        initials: initialsFor(o.name),
        color: OTHER_COLORS[i % OTHER_COLORS.length],
        display_order: i + 1,
        role_label: o.role,
      }
      const match = o.id ? byId.get(o.id) : byName.get(fields.name.toLowerCase())
      if (match && !claimed.has(match.id)) {
        claimed.add(match.id)
        const { error } = await supabase.from('family_members').update(fields).eq('id', match.id).eq('user_id', userId)
        required(error, 'the people in your household')
      } else {
        inserts.push({ ...(o.id ? { id: o.id } : {}), ...fields, user_id: userId, is_full_user: false, avatar_url: null, member_type: 'core' })
      }
    }
    if (inserts.length > 0) {
      const { error } = await supabase.from('family_members').insert(inserts)
      required(error, 'the people in your household')
    }
  }

  // 4. Home location → weather + directions default (optional, this browser).
  if (form.home) {
    setHomeCoords(form.home.lat, form.home.lng)
    try {
      localStorage.setItem('symphony_home_location', JSON.stringify({ name: 'Home', address: form.home.label }))
    } catch { /* ignore */ }
  }

  // 5. Stamp the profile (this is what ends first-run on every device). Only
  //    reached once everything required above has saved.
  await stampComplete(userId, form.home
    ? { home_location: form.home.label, home_lat: form.home.lat, home_lng: form.home.lng }
    : {})
}

/** "Skip for now": still make sure a household exists so Invite partner works.
 *  Throws (and leaves setup open) if the household could not be created. */
export async function skipFirstRunSetup(userId: string): Promise<void> {
  await ensureHousehold(null)
  await stampComplete(userId)
}
