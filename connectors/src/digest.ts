import type { Config, ConnectorMessage, DigestPayload, WatchedSource } from './types.ts'
import { renderTranscript } from './render.ts'

export interface DigestBatch {
  source: WatchedSource
  messages: ConnectorMessage[]
}

/** POST the day's batches — every source in ONE request — to school-digest,
 * which summarizes them and emails the household.
 *
 * `newest` per source is returned ONLY on a 2xx. The caller advances each
 * high-water mark from that value, so a failure leaves every mark where it
 * was and the whole day is re-sent next tick. There is no server-side
 * dedupe any more (nothing is written to Symphony), so the marks are the
 * only thing standing between one digest and the same digest twice. */
export async function sendDigest({
  batches,
  config,
  fetchImpl = fetch,
}: {
  batches: DigestBatch[]
  config: Config
  fetchImpl?: typeof fetch
}): Promise<{ delivered: boolean; newest: Map<string, Date>; error?: string }> {
  const live = batches.filter((b) => b.messages.length > 0)
  if (live.length === 0) return { delivered: true, newest: new Map() }

  const payload: DigestPayload = {
    user_id: config.userId,
    timezone: config.timezone,
    to: config.digestTo,
    sources: live.map((b) => ({ label: b.source.sourceLabel, text: renderTranscript(b.messages, config.timezone) })),
  }

  try {
    const res = await fetchImpl(`${config.supabaseUrl}/functions/v1/school-digest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-capture-secret': config.captureSecret },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      return { delivered: false, newest: new Map(), error: `school-digest returned ${res.status}` }
    }
    const newest = new Map<string, Date>()
    for (const b of live) {
      newest.set(
        b.source.sourceKey,
        b.messages.reduce<Date>((acc, m) => (m.timestamp.getTime() > acc.getTime() ? m.timestamp : acc), b.messages[0]!.timestamp),
      )
    }
    return { delivered: true, newest }
  } catch (e) {
    return { delivered: false, newest: new Map(), error: String(e) }
  }
}
