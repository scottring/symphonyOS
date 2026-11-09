/**
 * Symphony is invite-only while founding households are onboarded by hand.
 *
 * The gate itself lives in the database: a trigger on `auth.users` calls
 * `public.signup_allowed(email)` and raises if the answer is no. GoTrue
 * collapses that exception into a generic `500 unexpected_failure`, which every
 * client renders as "Database error saving new user" — so somebody who simply
 * hasn't been invited yet is told the product is broken.
 *
 * This module holds what the web client needs to say something truthful
 * instead: the messages, and a way to tell a known refusal from a fault whose
 * cause we can't see (the same opaque message covers both).
 */

import { SUPPORT_EMAIL } from '@/lib/authCallback'

/** What we tell someone the gate turned away. */
export const INVITE_ONLY_MESSAGE =
  "Symphony is invite-only while we set up our founding households by hand. " +
  "Request an invite and we'll write back within a day."

/** Where they can ask for one. */
export const WAITLIST_URL = 'https://www.symphony-os.com/#waitlist'

/** What we tell someone whose sign-up failed for a reason we can't name. */
export const SIGNUP_FAILED_MESSAGE =
  'Something went wrong creating your account. Try again in a minute, or email ' +
  `${SUPPORT_EMAIL} and we'll sort it out.`

/**
 * What the pre-flight `signup_allowed` check said before the sign-up ran:
 * 'allowed', 'refused', or 'unknown' when the check itself failed or gave no
 * clear answer.
 */
export type GateAnswer = 'allowed' | 'refused' | 'unknown'

/**
 * How to present a sign-up error, given what the gate said beforehand.
 *
 * - 'invite-only': we know the gate turned this address away.
 * - 'unexpected': GoTrue's opaque "Database error saving new user", which the
 *   gate trigger causes but so does any other fault in the new-user path (a
 *   broken trigger, a constraint, an outage). Unless the gate already said no,
 *   we can't tell which — so we must not tell an invited person they aren't.
 * - null: an ordinary, readable error (weak password, bad address) — show it.
 *
 * Only the trigger's own wording counts as proof of a refusal; the opaque
 * message alone never does.
 */
export function classifySignupError(
  error: { message?: string | null } | null | undefined,
  gate: GateAnswer
): 'invite-only' | 'unexpected' | null {
  const message = error?.message?.toLowerCase() ?? ''
  if (!message) return null
  if (message.includes('signups are currently restricted')) return 'invite-only'
  if (message.includes('database error saving new user')) {
    return gate === 'refused' ? 'invite-only' : 'unexpected'
  }
  return null
}
