// Payload validation for inbound-email. Pure so it runs under vitest.
export interface InboundPayload {
  token: string
  message_id?: string
  from?: string
  subject?: string
  text: string
  received_at?: string
}

export type InboundValidation =
  | { ok: true; body: Required<Pick<InboundPayload, 'token' | 'from' | 'subject' | 'text'>> & Pick<InboundPayload, 'message_id' | 'received_at'> }
  | { ok: false; status: number; error: string }

const TOKEN = /^[0-9a-f]{16}$/

// A mail body past this is a newsletter dump or an inlined attachment; keep the
// head of it rather than rejecting the whole delivery.
export const MAX_TEXT = 200_000

export function validateInbound(p: Partial<InboundPayload>): InboundValidation {
  if (typeof p.token !== 'string' || !TOKEN.test(p.token)) {
    return { ok: false, status: 400, error: 'invalid token' }
  }
  if (typeof p.text !== 'string' || p.text.trim() === '') {
    return { ok: false, status: 400, error: 'text required' }
  }
  return {
    ok: true,
    body: {
      token: p.token,
      text: p.text.slice(0, MAX_TEXT),
      subject: typeof p.subject === 'string' && p.subject.trim() ? p.subject.trim() : '(no subject)',
      from: typeof p.from === 'string' && p.from.trim() ? p.from.trim() : 'unknown',
      message_id: typeof p.message_id === 'string' && p.message_id.trim() ? p.message_id.trim() : undefined,
      received_at: typeof p.received_at === 'string' ? p.received_at : undefined,
    },
  }
}

// FNV-1a 32-bit, hex. Enough to make a repeat forward of the same mail collide
// when a client strips Message-ID; not a security boundary.
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * Deliberately NOT keyed on received_at: that is the Worker's own clock, so it
 * changes on every Cloudflare retry and a redelivery of the same mail would
 * hash to a new key and be captured twice. from+subject+text is what actually
 * identifies the message when the client stripped Message-ID.
 */
export function sourceKeyFor(p: Pick<InboundPayload, 'message_id' | 'from' | 'subject' | 'text'>): string {
  if (p.message_id && p.message_id.trim()) return `email:${p.message_id.trim()}`
  return `email:sha:${fnv1a(`${p.from ?? ''}|${p.subject ?? ''}|${p.text ?? ''}`)}`
}

/** "Hillside Elementary <news@hillside.org>" → "Hillside Elementary"; bare address → its domain. */
export function senderLabel(from: string): string {
  const m = /^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/.exec(from)
  if (m) return m[1].trim()
  const at = from.indexOf('@')
  return at > -1 ? from.slice(at + 1).replace(/>$/, '').trim() : from.trim()
}

/**
 * A forwarded email carries the forwarder's From; the original sender sits in
 * the body's header block ("---------- Forwarded message ---------" / "Begin
 * forwarded message:" followed by "From: Name <addr>"). When the subject says
 * it is a forward, prefer that line so the source reads "Friends of Hampden",
 * not the parent who forwarded it.
 */
export function originalSender(subject: string, text: string, from: string): string {
  if (!/^\s*(fwd?|fw)\s*:/i.test(subject)) return from
  const head = text.slice(0, 4000)
  const m = /^[>\s]*\*?From:\*?\s*(.+?)\s*$/im.exec(head)
  if (!m) return from
  const candidate = m[1].replace(/\s+/g, ' ').trim()
  return candidate.includes('@') || candidate.length > 1 ? candidate : from
}
