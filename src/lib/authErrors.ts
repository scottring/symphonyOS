// src/lib/authErrors.ts
//
// A Supabase-backed session can end while the tab is open (token expired,
// signed out elsewhere). When that happens mid-flow, the failure isn't "the
// parse/save failed" — it's "you're no longer signed in" — and the caller
// should offer to sign in again, not "try again" against the same dead
// session. `SessionExpiredError` marks that case so a catch block can tell
// the two apart.

export const SESSION_EXPIRED_MESSAGE = 'Your session ended. Sign in again to continue.'

export class SessionExpiredError extends Error {
  readonly name = 'SessionExpiredError'
  constructor() {
    super(SESSION_EXPIRED_MESSAGE)
  }
}

/** Accepts either the Error instance or the bare message a hook re-surfaced
 *  as a string (state that only ever holds `error.message`, never the error
 *  object itself). */
export function isSessionExpired(e: unknown): boolean {
  if (e instanceof SessionExpiredError) return true
  if (e instanceof Error) return e.name === 'SessionExpiredError'
  return e === SESSION_EXPIRED_MESSAGE
}
