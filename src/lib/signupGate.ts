/**
 * Symphony is invite-only while founding households are onboarded by hand.
 *
 * The gate itself lives in the database: a trigger on `auth.users` calls
 * `public.signup_allowed(email)` and raises if the answer is no. GoTrue
 * collapses that exception into a generic `500 unexpected_failure`, which every
 * client renders as "Database error saving new user" — so somebody who simply
 * hasn't been invited yet is told the product is broken.
 *
 * This module holds the two things both clients need to say something truthful
 * instead: the message, and a way to recognise the gate's fingerprint on an
 * error that already came back.
 */

/** What we tell someone the gate turned away. */
export const INVITE_ONLY_MESSAGE =
  "Symphony is invite-only while we set up our founding households by hand. " +
  "Request an invite and we'll write back within a day."

/** Where they can ask for one. */
export const WAITLIST_URL = 'https://www.symphony-os.com/#waitlist'

/**
 * True when an error is the invite gate rather than a real fault.
 *
 * Matches both the message GoTrue substitutes (`Database error saving new
 * user`) and the trigger's own text, in case a future GoTrue passes it through.
 */
export function isInviteGateFailure(
  error: { message?: string | null } | null | undefined
): boolean {
  const message = error?.message?.toLowerCase() ?? ''
  if (!message) return false
  return (
    message.includes('database error saving new user') ||
    message.includes('signups are currently restricted')
  )
}
