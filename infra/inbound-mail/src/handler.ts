// Pure Worker logic. index.ts wires postal-mime and the Cloudflare email event.
export interface ParsedMail {
  messageId?: string
  from?: { name?: string; address?: string }
  subject?: string
  text?: string
  html?: string
}
export interface InboundPayload {
  token: string; message_id?: string; from: string; subject: string; text: string; received_at: string
}
export interface Env { SUPABASE_URL: string; CAPTURE_SHARED_SECRET: string }

const TOKEN = /^[0-9a-f]{16}$/

export function tokenFromAddress(to: string): string | null {
  const local = to.split('@')[0]?.trim() ?? ''
  return TOKEN.test(local) ? local : null
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

export function buildPayload(msg: ParsedMail, to: string, receivedAt: Date): InboundPayload | null {
  const token = tokenFromAddress(to)
  if (!token) return null
  const text = msg.text?.trim() || (msg.html ? htmlToText(msg.html) : '')
  const from = msg.from?.name && msg.from.address
    ? `${msg.from.name} <${msg.from.address}>`
    : msg.from?.address ?? msg.from?.name ?? 'unknown'
  return {
    token, message_id: msg.messageId, from, subject: msg.subject?.trim() || '(no subject)',
    text, received_at: receivedAt.toISOString(),
  }
}

/** POST to inbound-email. 5xx throws (Cloudflare retries); 4xx is final and dropped. */
export async function deliver(payload: InboundPayload, env: Env, fetchFn: typeof fetch = fetch): Promise<void> {
  const res = await fetchFn(`${env.SUPABASE_URL}/functions/v1/inbound-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-capture-secret': env.CAPTURE_SHARED_SECRET },
    body: JSON.stringify(payload),
  })
  if (res.status >= 500) throw new Error(`inbound-email returned ${res.status}`)
}
