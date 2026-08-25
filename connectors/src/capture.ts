import type { Config, ConnectorMessage, FlushPayload, WatchedSource } from './types.ts'
import { renderTranscript } from './render.ts'

const KIND: Record<WatchedSource['connector'], FlushPayload['kind']> = {
  whatsapp: 'whatsapp_export',
  classdojo: 'classdojo_thread',
}

/** POST one source's new messages to capture-to-inbox.
 *
 * `newest` is returned ONLY on a 2xx. The caller advances its high-water mark
 * from that value, so a failure leaves the mark where it was and the batch is
 * re-sent next tick. Re-sending is safe: capture_checkpoints dedupes
 * server-side by timestamp, so a duplicate batch extracts nothing twice. */
export async function deliver({
  source,
  messages,
  config,
  fetchImpl = fetch,
}: {
  source: WatchedSource
  messages: ConnectorMessage[]
  config: Config
  fetchImpl?: typeof fetch
}): Promise<{ delivered: boolean; newest: Date | null; error?: string }> {
  if (messages.length === 0) return { delivered: true, newest: null }

  const payload: FlushPayload = {
    user_email: config.userEmail,
    kind: KIND[source.connector],
    source_key: source.sourceKey,
    source_label: source.sourceLabel,
    text: renderTranscript(messages, config.timezone),
  }

  try {
    const res = await fetchImpl(`${config.supabaseUrl}/functions/v1/capture-to-inbox`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-capture-secret': config.captureSecret },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      return { delivered: false, newest: null, error: `capture-to-inbox returned ${res.status}` }
    }
    const newest = messages.reduce<Date>(
      (acc, m) => (m.timestamp.getTime() > acc.getTime() ? m.timestamp : acc),
      messages[0]!.timestamp,
    )
    return { delivered: true, newest }
  } catch (e) {
    return { delivered: false, newest: null, error: String(e) }
  }
}
