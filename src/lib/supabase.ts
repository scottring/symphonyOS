import { createClient, type User } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

// ── Who am I, without a network round trip ───────────────────────────────────
//
// `supabase.auth.getUser()` asks the auth server every single time, and
// supabase-js serialises those calls behind one lock. With ~40 call sites, a
// Today load fired 17 of them back to back and spent its first 8.5 SECONDS on
// nothing else — every data query waits for the token. Measured on prod.
//
// The session already lives in local storage and `onAuthStateChange` keeps it
// current, so the answer is in memory. RLS still enforces identity server-side
// on every request; validating the token client-side bought nothing.
let cachedUser: User | null = null
let userInFlight: Promise<User | null> | null = null

supabase.auth.onAuthStateChange((_event, session) => {
  cachedUser = session?.user ?? null
})

/**
 * Drop-in for `supabase.auth.getUser()` — same shape, no request. Reads the
 * stored session once and then answers from memory.
 */
export async function getAuthUser(): Promise<{ data: { user: User | null }; error: null }> {
  if (cachedUser) return { data: { user: cachedUser }, error: null }
  if (!userInFlight) {
    userInFlight = supabase.auth
      .getSession()
      .then(({ data }) => {
        cachedUser = data.session?.user ?? null
        return cachedUser
      })
      .finally(() => { userInFlight = null })
  }
  return { data: { user: await userInFlight }, error: null }
}
