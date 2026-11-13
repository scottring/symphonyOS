/**
 * Shared provisioning for the integration suites. Every account any suite
 * makes starts with EMAIL_PREFIX, so `sweepStaleAccounts` can clear a crashed
 * run and can never reach a real account.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL
export const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

/** Without the service key there is no way to provision or clean up. Skip loudly. */
export const canRun = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_KEY)

/** Every account these suites make starts here, so a crashed run is sweepable. */
export const EMAIL_PREFIX = 'symphony-rlstest-'
export const PASSWORD = 'rls-test-only-not-a-real-account'

export interface Person {
  label: string
  email: string
  userId: string
  /** Signed in with the ANON key — the same client the browser app uses. */
  client: SupabaseClient
}

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Delete anything a previous crashed run left behind. Scoped to this suite's
 * own email prefix — it cannot reach a real account.
 */
export async function sweepStaleAccounts(admin: SupabaseClient): Promise<void> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw error
  const stale = data.users.filter((u) => (u.email ?? '').startsWith(EMAIL_PREFIX))
  for (const u of stale) {
    await admin.from('household_members').delete().eq('user_id', u.id)
    await admin.from('households').delete().eq('owner_id', u.id)
    await admin.auth.admin.deleteUser(u.id)
  }
}

export async function createPerson(admin: SupabaseClient, label: string, runId: string): Promise<Person> {
  const email = `${EMAIL_PREFIX}${label}-${runId}@gmail.com`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error) throw new Error(`could not create ${label}: ${error.message}`)
  const userId = data.user!.id

  const client = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (signIn.error) throw new Error(`could not sign in ${label}: ${signIn.error.message}`)

  return { label, email, userId, client }
}

/** The household this person is an active member of (every account has one from sign-up). */
export async function householdOf(admin: SupabaseClient, person: Person): Promise<string> {
  const { data, error } = await admin
    .from('household_members')
    .select('household_id')
    .eq('user_id', person.userId)
    .eq('status', 'active')
  if (error) throw new Error(`could not read ${person.label}'s membership: ${error.message}`)
  if (data?.length !== 1) throw new Error(`${person.label} has ${data?.length ?? 0} active memberships, expected 1`)
  return data[0].household_id as string
}

/**
 * Put `joiner` into `owner`'s household the legitimate way: the owner invites,
 * the joiner accepts through the RPC. (Accepting leaves the joiner's own
 * household, deleting it when it is left empty.)
 */
export async function joinHousehold(owner: Person, joiner: Person, householdId: string): Promise<void> {
  const { data: inv, error: invError } = await owner.client
    .from('household_invitations')
    .insert({ household_id: householdId, email: joiner.email, invited_by: owner.userId })
    .select('token')
    .single()
  if (invError) throw new Error(`${owner.label} could not invite ${joiner.label}: ${invError.message}`)
  const { error } = await joiner.client.rpc('accept_household_invitation', { invitation_token: inv.token })
  if (error) throw new Error(`${joiner.label} could not join: ${error.message}`)
}

/** Remove a throwaway user, tolerating one that is already gone. */
export async function removePerson(admin: SupabaseClient, person: Person | undefined): Promise<void> {
  if (!person) return
  await admin.from('household_members').delete().eq('user_id', person.userId)
  const { error } = await admin.auth.admin.deleteUser(person.userId)
  if (error && !/not found/i.test(error.message)) throw error
}

/** Call an edge function as a signed-in person, returning status and parsed JSON. */
export async function callFunction(
  person: Person,
  name: string,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const { data } = await person.client.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error(`${person.label} has no session`)
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, apikey: ANON_KEY! },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}
