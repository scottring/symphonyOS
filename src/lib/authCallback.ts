/**
 * Email links that come back broken.
 *
 * When a confirmation (or other email) link can't be used, Supabase redirects
 * to the app with the reason in the URL instead of a session — in the hash for
 * the implicit flow, in the query for PKCE:
 *
 *   /#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
 *
 * Before this module the app ignored it and showed a plain Sign In form, so a
 * new user who opened the older of two confirmation emails had no idea why
 * nothing worked and no way to get a fresh link (live, 2026-10-08).
 *
 * This holds the pure parts: reading the reason, removing it from the address
 * bar, and turning resend failures into plain language. It never reads or
 * touches a successful callback (access_token / code) — supabase-js owns that.
 */

/** Codes that mean "this link is spent or stale; a newer one will work". */
const EXPIRED_LINK_CODES = new Set([
  'otp_expired',
  'flow_state_expired',
  'flow_state_not_found',
])

/** The URL keys Supabase uses to report a failed email link. `sb` is a marker
 *  GoTrue adds to its own redirects; it means nothing once the error is read. */
const ERROR_PARAM_KEYS = ['error', 'error_code', 'error_description', 'sb'] as const

/** Long enough for any real provider message, short enough that a crafted URL
 *  can't fill the card. */
const MAX_DESCRIPTION_LENGTH = 200

export const SUPPORT_EMAIL = 'hello@symphony-os.com'

export interface AuthCallbackError {
  /** 'expired' = used or stale link; 'other' = anything we don't recognise. */
  kind: 'expired' | 'other'
  code: string | null
  /** The provider's own explanation, as plain text. Never contains a token. */
  description: string | null
}

function hashParams(hash: string): URLSearchParams | null {
  if (!hash || hash.length < 2 || !hash.includes('=')) return null
  try {
    return new URLSearchParams(hash.slice(1))
  } catch {
    return null
  }
}

/**
 * The auth error carried by `href`, or null when there is none.
 *
 * Requires `error_code` or `error_description` — a bare `?error=` is too
 * generic to claim (Supabase always sends a description). Returns null for
 * anything that looks like a successful callback, so that flow is untouched.
 */
export function readAuthCallbackError(href: string): AuthCallbackError | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const fromHash = hashParams(url.hash)
  const get = (key: string) => url.searchParams.get(key) ?? fromHash?.get(key) ?? null

  if (get('access_token') || get('refresh_token') || get('code')) return null

  const code = get('error_code')?.trim() || null
  const rawDescription = get('error_description')?.trim() || null
  if (!code && !rawDescription) return null

  const description = rawDescription
    ? rawDescription.replace(/\s+/g, ' ').slice(0, MAX_DESCRIPTION_LENGTH)
    : null

  const expired =
    (code !== null && EXPIRED_LINK_CODES.has(code)) ||
    // Older GoTrue builds sent only the description.
    (code === null && /invalid or has expired/i.test(description ?? ''))

  return { kind: expired ? 'expired' : 'other', code, description }
}

/**
 * `href` with the auth error params removed from both query and hash, leaving
 * everything else (path, other params, a router hash) as it was. Returns the
 * input unchanged when there is nothing to remove.
 */
export function withoutAuthCallbackError(href: string): string {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return href
  }
  let changed = false
  for (const key of ERROR_PARAM_KEYS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key)
      changed = true
    }
  }
  const fromHash = hashParams(url.hash)
  if (fromHash) {
    for (const key of ERROR_PARAM_KEYS) {
      if (fromHash.has(key)) {
        fromHash.delete(key)
        changed = true
      }
    }
    if (changed) {
      const rest = fromHash.toString()
      url.hash = rest ? `#${rest}` : ''
    }
  }
  return changed ? url.toString() : href
}

/** Remove the auth error from the address bar without a navigation, so a
 *  reload or a shared screenshot doesn't carry it. */
export function stripAuthCallbackErrorFromLocation(): void {
  try {
    const next = withoutAuthCallbackError(window.location.href)
    if (next !== window.location.href) {
      window.history.replaceState(window.history.state, '', next)
    }
  } catch {
    // A locked-down browser context: leaving the params is harmless.
  }
}

/** A failed `auth.resend`, in words a person can act on. */
export function describeResendError(error: {
  message?: string | null
  status?: number
  code?: string
  name?: string
}): string {
  const message = error.message ?? ''
  const code = error.code ?? ''
  const wait = message.match(/after (\d+) seconds?/i)

  if (wait) {
    return `Please wait ${wait[1]} seconds, then try again.`
  }
  if (error.status === 429 || /rate.?limit/i.test(code) || /rate limit/i.test(message)) {
    return 'Too many emails have been sent to this address recently. Wait a few minutes, then try again.'
  }
  if (code === 'email_address_invalid' || code === 'validation_failed' || /invalid.*email|email.*invalid/i.test(message)) {
    return "That doesn't look like a complete email address. Check it and try again."
  }
  if (error.name === 'AuthRetryableFetchError' || /failed to fetch|network/i.test(message)) {
    return "We couldn't reach Symphony. Check your connection and try again."
  }
  return `We couldn't send a new link just now. Try again in a minute, or email ${SUPPORT_EMAIL}.`
}

/**
 * What an email link was for. Supabase reports an expired confirmation link
 * and an expired password-reset link with the same `otp_expired`, so the
 * broken-link screen can't tell them apart from the URL. This browser
 * remembers which kind of email it last asked for, so the screen can start on
 * the right recovery; the person can always switch (review, 2026-10-08).
 */
export type AuthEmailFlow = 'signup' | 'recovery'

const FLOW_KEY = 'symphony.authEmailFlow'
/** Longer than any link stays valid; after that the hint is noise. */
const FLOW_TTL_MS = 2 * 24 * 60 * 60 * 1000

export function rememberAuthEmailFlow(flow: AuthEmailFlow, now: number = Date.now()): void {
  try { localStorage.setItem(FLOW_KEY, JSON.stringify({ flow, at: now })) } catch { /* private mode: no hint */ }
}

export function readAuthEmailFlow(now: number = Date.now()): AuthEmailFlow | null {
  try {
    const raw = localStorage.getItem(FLOW_KEY)
    if (!raw) return null
    const { flow, at } = JSON.parse(raw) as { flow?: unknown; at?: unknown }
    if ((flow !== 'signup' && flow !== 'recovery') || typeof at !== 'number' || now - at > FLOW_TTL_MS) return null
    return flow
  } catch {
    return null
  }
}
