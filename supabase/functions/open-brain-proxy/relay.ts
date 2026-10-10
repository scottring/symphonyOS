// Pure rules for the Open Brain relay, kept apart from index.ts so vitest can
// cover them without Deno.

/** The Open Brain routes Symphony calls, and nothing else (no uploads,
 *  attachments, dataview or projects): least privilege for a relay that holds
 *  the key. */
const ALLOWED = /^\/api\/(health|notes|capture|search|messages|agent-chat|briefing|voice\/transcribe)(\/|$)/

/** Only these methods are relayed. */
export const RELAY_METHODS = new Set(['GET', 'POST'])

/**
 * Turn the function's request path ("/open-brain-proxy/api/notes/tasks") into
 * the Open Brain path ("/api/notes/tasks"), or null when it isn't one Symphony
 * may reach. Rejects traversal in raw or percent-encoded form.
 */
export function relayPath(pathname: string): string | null {
  const i = pathname.indexOf('/open-brain-proxy')
  const path = i >= 0 ? pathname.slice(i + '/open-brain-proxy'.length) : pathname
  let decoded: string
  try { decoded = decodeURIComponent(path) } catch { return null }
  if (decoded.includes('..') || decoded.includes('\\') || path.includes('//')) return null
  return ALLOWED.test(path) ? path : null
}

/** Open Brain is one person's vault and messages: only its owner gets through. */
export function isOwner(userId: string | null | undefined, ownerId: string | null | undefined): boolean {
  return Boolean(userId && ownerId && userId === ownerId)
}
