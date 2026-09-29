// src/lib/pendingJoin.ts
//
// An invitation someone opened before signing in. "Sign in to continue" on
// /join/:token used to stash the token in sessionStorage that nothing ever
// read — and the email-confirmation link opens a new tab anyway — so an
// invited partner who signed up landed in first-run setup and made a SECOND
// household (clarity audit, 2026-09-29). Kept in localStorage for a week so
// the first-run gate can send them back to the invitation instead.
const KEY = 'symphony.pendingJoin'
const WEEK = 7 * 86400000

export function setPendingJoin(token: string, now = Date.now()): void {
  try { localStorage.setItem(KEY, JSON.stringify({ token, at: now })) } catch { /* private mode */ }
}

export function getPendingJoin(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const { token, at } = JSON.parse(raw) as { token?: string; at?: number }
    if (!token || typeof at !== 'number' || now - at > WEEK) { localStorage.removeItem(KEY); return null }
    return token
  } catch { return null }
}

export function clearPendingJoin(): void {
  try { localStorage.removeItem(KEY) } catch { /* private mode */ }
}
