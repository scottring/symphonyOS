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
  others: Array<{ name: string; role: HouseholdRole }>
  home: GeocodedPlace | null
}

export function initialsFor(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0] ?? '').join('').substring(0, 2).toUpperCase() || '?'
}

// Self takes blue (matches the auto-seed in useFamilyMembers); others cycle the rest.
const OTHER_COLORS: FamilyMemberColor[] = ['purple', 'green', 'orange', 'pink', 'teal', 'blue']

/**
 * Persist the first-run form. Each step is independent so a missing RPC
 * (migration not applied yet) or a failed insert does not strand the user on
 * the setup screen: the profile stamp at the end is what ends first-run.
 */
export async function saveFirstRunSetup(userId: string, form: FirstRunForm): Promise<void> {
  const householdName = form.householdName.trim()
  const yourName = form.yourName.trim() || 'Me'

  // 1. Household row + owner membership (idempotent; renames if it exists).
  const rpc = await supabase.rpc('setup_household', { p_name: householdName || null })
  if (rpc.error) console.warn('[first-run] setup_household failed:', rpc.error.message)

  // 2. Your own member row: adopt the auto-seeded one if it exists.
  const { data: self } = await supabase
    .from('family_members')
    .select('id')
    .eq('user_id', userId)
    .eq('is_full_user', true)
    .is('auth_user_id', null)
    .limit(1)
    .maybeSingle()
  const selfRow = { name: yourName, initials: initialsFor(yourName), role_label: 'parent', member_type: 'core' }
  if (self?.id) {
    const { error } = await supabase.from('family_members').update(selfRow).eq('id', self.id)
    if (error) console.warn('[first-run] self member update failed:', error.message)
  } else {
    const { error } = await supabase
      .from('family_members')
      .insert([{ ...selfRow, user_id: userId, color: 'blue', is_full_user: true, display_order: 0, avatar_url: null }])
    if (error) console.warn('[first-run] self member insert failed:', error.message)
  }

  // 3. Everyone else. Partners get a login later via Settings → Invite partner.
  const others = form.others.map((o) => o.name.trim() && o).filter(Boolean) as FirstRunForm['others']
  if (others.length > 0) {
    const rows = others.map((o, i) => ({
      user_id: userId,
      name: o.name.trim(),
      initials: initialsFor(o.name),
      color: OTHER_COLORS[i % OTHER_COLORS.length],
      is_full_user: false,
      display_order: i + 1,
      avatar_url: null,
      member_type: 'core',
      role_label: o.role,
    }))
    const { error } = await supabase.from('family_members').insert(rows)
    if (error) console.warn('[first-run] member insert failed:', error.message)
  }

  // 4. Home location → weather + directions default.
  if (form.home) {
    setHomeCoords(form.home.lat, form.home.lng)
    try {
      localStorage.setItem('symphony_home_location', JSON.stringify({ name: 'Home', address: form.home.label }))
    } catch { /* ignore */ }
  }

  // 5. Stamp the profile (this is what ends first-run on every device).
  await markFirstRunComplete(userId, form.home
    ? { home_location: form.home.label, home_lat: form.home.lat, home_lng: form.home.lng }
    : {})
}

/** "Skip for now": still make sure a household exists so Invite partner works. */
export async function skipFirstRunSetup(userId: string): Promise<void> {
  const rpc = await supabase.rpc('setup_household', { p_name: null })
  if (rpc.error) console.warn('[first-run] setup_household failed:', rpc.error.message)
  await markFirstRunComplete(userId)
}
