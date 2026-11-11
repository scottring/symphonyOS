// How the school feeds stand, for Settings → School feeds (Scott, 2026-11-11:
// the worker stopped on Nov 8 and re-linking WhatsApp meant a QR in server
// logs). Pure: connector_health rows in, plain lines out.

export interface FeedHealthRow {
  connector: 'whatsapp' | 'classdojo'
  last_ok_at: string | null
  last_error: string | null
  last_error_at: string | null
  heartbeat_at: string | null
  last_flush_at: string | null
  pair_qr: string | null
  pair_qr_at: string | null
}

export type FeedTone = 'ok' | 'warn' | 'bad'
export interface FeedLine { label: string; text: string; tone: FeedTone }
export interface FeedStatus {
  lines: FeedLine[]
  /** A code to scan now, while it is fresh; null when there is none. */
  pairQr: string | null
  /** WhatsApp is waiting to be linked (a code is shown, or will be). */
  needsLink: boolean
}

/** WhatsApp replaces a code every ~20 seconds; older than this, it is spent. */
export const QR_FRESH_MS = 60_000
const DEAD_AFTER_MS = 30 * 60_000

const t = (s: string | null) => (s ? new Date(s).getTime() : null)
const failing = (r: FeedHealthRow) => (t(r.last_error_at) ?? 0) > (t(r.last_ok_at) ?? 0)

export function feedStatus(rows: readonly FeedHealthRow[], now: Date, formatWhen: (d: Date) => string): FeedStatus {
  const wa = rows.find((r) => r.connector === 'whatsapp')
  const dojo = rows.find((r) => r.connector === 'classdojo')
  const lines: FeedLine[] = []
  const beat = t(wa?.heartbeat_at ?? null)
  const dead = beat !== null && now.getTime() - beat > DEAD_AFTER_MS

  if (dead) lines.push({ label: 'Worker', text: `Stopped — last heard from ${formatWhen(new Date(beat))}`, tone: 'bad' })

  const qrAt = t(wa?.pair_qr_at ?? null)
  const pairQr = !dead && wa?.pair_qr && qrAt !== null && now.getTime() - qrAt < QR_FRESH_MS ? wa.pair_qr : null
  const unlinked = !!wa && failing(wa) && /unlinked/i.test(wa.last_error ?? '')
  const needsLink = !dead && (unlinked || pairQr !== null)

  if (wa && !dead) {
    lines.push(needsLink
      ? { label: 'WhatsApp', text: 'Needs linking', tone: 'bad' }
      : failing(wa)
        ? { label: 'WhatsApp', text: 'Reconnecting', tone: 'warn' }
        : { label: 'WhatsApp', text: 'Connected', tone: 'ok' })
  }
  if (dojo) {
    lines.push(failing(dojo)
      ? { label: 'ClassDojo', text: /one-time code|otc/i.test(dojo.last_error ?? '') ? 'Needs a new sign-in code' : 'Couldn’t be read at the last run', tone: 'bad' }
      : { label: 'ClassDojo', text: 'Working', tone: 'ok' })
  }
  const flushed = t(wa?.last_flush_at ?? null)
  if (flushed !== null) lines.push({ label: 'Last digest run', text: formatWhen(new Date(flushed)), tone: 'ok' })

  return { lines, pairQr, needsLink }
}
