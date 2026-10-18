// OAuth `state` that binds the round trip to the signed-in person (B05,
// 2026-10-15). Before this the state was a plain base64 of {userId}; the
// callback never compared it with the caller, so a crafted callback link
// could attach someone else's Google account to a signed-in person. The
// state now carries a nonce and an HMAC over user, provider, access and
// nonce, keyed by a server secret; the callback refuses a state that does not
// verify or names another user. The JSON shape is kept, so the client's
// providerFromOAuthState still reads `provider`.

/** Where a calendar sign-in may return to. Each provider's app registration
 *  must list the same URIs, exactly. */
export const ALLOWED_REDIRECTS = ['http://localhost:5173/calendar-callback', 'https://symphony-rebuild.vercel.app/calendar-callback', 'https://symphony-os.com/calendar-callback', 'https://www.symphony-os.com/calendar-callback', 'https://app.symphony-os.com/calendar-callback']

export interface OAuthStateBody { userId: string; provider: 'google' | 'microsoft'; access?: string; redirectUri: string; expiresAt: number; nonce: string; sig?: string }

const enc = new TextEncoder()
const toB64 = (s: string) => btoa(unescape(encodeURIComponent(s)))
const fromB64 = (s: string) => decodeURIComponent(escape(atob(s)))
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function hmac(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(text)))
}
const payload = (b: Omit<OAuthStateBody, 'sig'>) => JSON.stringify([b.userId, b.provider, b.access ?? '', b.redirectUri, b.expiresAt, b.nonce])

export async function signOAuthState(secret: string, body: Omit<OAuthStateBody, 'nonce' | 'sig' | 'expiresAt'>, now = Date.now()): Promise<string> {
  const nonce = crypto.randomUUID()
  const signed = { ...body, expiresAt: now + 10 * 60_000, nonce }
  const sig = await hmac(secret, payload(signed))
  return toB64(JSON.stringify({ ...signed, sig }))
}

/** The verified body, or null when the state is missing, malformed, unsigned,
 *  forged, or for another person. */
export async function verifyOAuthState(secret: string, state: unknown, expectUserId: string, expectProvider: OAuthStateBody['provider'], redirectUri: string, now = Date.now()): Promise<OAuthStateBody | null> {
  if (typeof state !== 'string' || !state) return null
  let body: OAuthStateBody
  try { body = JSON.parse(fromB64(state)) } catch { return null }
  if (!body || typeof body !== 'object' || typeof body.sig !== 'string' || typeof body.nonce !== 'string') return null
  if (body.userId !== expectUserId || body.provider !== expectProvider) return null
  if (body.redirectUri !== redirectUri || !Number.isSafeInteger(body.expiresAt) || body.expiresAt <= now || body.expiresAt > now + 10 * 60_000) return null
  const expected = await hmac(secret, payload(body))
  if (expected.length !== body.sig.length) return null
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ body.sig.charCodeAt(i)
  return diff === 0 ? body : null
}
