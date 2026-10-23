// The sign-in lock, with a limit on how long it waits (2026-10-22).
//
// supabase-js keeps one sign-in lock across every tab of the app and, for
// most of its work, waits for it with no time limit. A tab that holds the
// lock and then freezes (a background tab on a Fire tablet, the old wall page
// behind a new one) leaves every other tab waiting for ever: the page loads,
// sign-in never finishes, and pairing sits on "Pairing…". Seen on the kitchen
// Fire, 2026-10-22: realtime connected, not one auth or data request after.
//
// Here an unlimited wait becomes ten seconds; then this tab takes the lock
// (`steal`) and carries on. Waits supabase-js asks to limit itself, and
// browsers without the lock API, behave exactly as before.

import { navigatorLock } from '@supabase/supabase-js'

export const LOCK_WAIT_MS = 10_000

export async function patientLock<R>(name: string, acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const locks = globalThis.navigator?.locks
  if (!locks) return fn()
  if (acquireTimeout >= 0) return navigatorLock(name, acquireTimeout, fn)
  let started = false
  try {
    return await navigatorLock(name, LOCK_WAIT_MS, () => { started = true; return fn() })
  } catch (e) {
    // Only a wait that ran out is taken over; an error from the work itself
    // goes back to the caller as it always did.
    if (started || !(e instanceof Error && e.name === 'AbortError')) throw e
    console.warn(`Sign-in lock "${name}" held over ${LOCK_WAIT_MS / 1000}s by another tab; taking it over.`)
    return locks.request(name, { steal: true }, () => fn()) as Promise<R>
  }
}
