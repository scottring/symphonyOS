import type { Task } from '@/types/task'
import { formatShortDate, formatTimeCompact } from '@/lib/dateHelpers'

/** The School pool: candidates the feed connectors extracted, waiting for a
 * fate. Not a horizon — these sit in the inbox bucket, so selectHorizonPool
 * cannot serve them. Oldest first, matching the backlog's ordering: the
 * stalest school item is the one most likely to be about to expire.
 *
 * Unfiltered by assignee on purpose, like the week/month pools — a pool is a
 * census, not a view. */
export function selectSchoolPool(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => !t.completed && t.bucket === 'inbox' && !!t.captureId)
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
}

/** Everything extract-capture folds into tasks.notes for a candidate.
 *
 * Both ends of this format live in this repo — supabase/functions/
 * extract-capture/index.ts writes it, this reads it — and the tests pin it.
 * If the edge function's note body changes, those tests fail and name the
 * reason, which is the point of parsing it here rather than adding six more
 * columns to tasks. */
export interface CaptureMeta {
  source?: string
  forWho?: string
  location?: string
  rsvp?: string
  cost?: string
  gifts?: string
  /** Who posted the message this came from. A school thread has many voices,
   * and a request from the teacher reads differently from one a parent
   * relayed in the group. */
  from?: string
  /** Verbatim, as written: an ISO date, an ISO datetime, or absent. The
   * extractor writes "unknown" when it could not find one; that reads here
   * as no time at all, because printing "unknown" on a row is worse than
   * printing nothing. */
  proposedTime?: string
}

const LINE = (label: string) => new RegExp(`^${label}:\\s*(.+)$`, 'm')

export function parseCaptureMeta(notes: string | undefined): CaptureMeta {
  if (!notes) return {}
  const out: CaptureMeta = {}
  // "Source: <label> (confidence 0.90)" — the label is everything before the
  // trailing parenthetical.
  const source = /^Source:\s*(.+?)(?:\s*\(confidence[^)]*\))?$/m.exec(notes)
  if (source?.[1]) out.source = source[1].trim()
  for (const [key, label] of [
    ['forWho', 'For'], ['location', 'Location'], ['rsvp', 'RSVP'],
    ['cost', 'Cost'], ['gifts', 'Gifts'], ['from', 'From'],
  ] as const) {
    const m = LINE(label).exec(notes)
    if (m?.[1]) out[key] = m[1].trim()
  }
  const time = LINE('Proposed time').exec(notes)?.[1]?.trim()
  if (time && time !== 'unknown') out.proposedTime = time
  return out
}

/** ISO date or datetime → a local Date. Built field by field on purpose:
 * `new Date('2026-08-28')` is parsed as UTC midnight, which lands on the 27th
 * for anyone west of Greenwich — and every one of these is a local school day. */
const ISO = /(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2})?)?/
function parseLocal(text: string): { date: Date; hasTime: boolean } | undefined {
  const m = ISO.exec(text)
  if (!m) return undefined
  const [, y, mo, d, hh, mi] = m
  const date = new Date(+y, +mo - 1, +d, hh ? +hh : 0, mi ? +mi : 0)
  return Number.isNaN(date.getTime()) ? undefined : { date, hasTime: hh !== undefined }
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** "Today 7:40a", "Yesterday", "Fri, Aug 28".
 *
 * Relative to an explicit `reference` rather than the wall clock: a suite that
 * asserts "Today" against `new Date()` passes until the day it doesn't.
 * Yesterday earns a name alongside Today and Tomorrow because these
 * candidates linger — a pool row is far more often a day late than a day early.
 *
 * `sameDayAs` suppresses the day name when the caller has already printed it;
 * a deadline inside an RSVP usually falls on the day the row already names,
 * and repeating it costs a third of the line. */
function formatWhen(text: string, reference: Date, sameDayAs?: Date): string | undefined {
  const parsed = parseLocal(text)
  if (!parsed) return undefined
  const day = startOfDay(parsed.date)
  if (sameDayAs && day.getTime() === startOfDay(sameDayAs).getTime()) {
    return parsed.hasTime ? formatTimeCompact(parsed.date) : undefined
  }
  const days = Math.round((day.getTime() - startOfDay(reference).getTime()) / 86_400_000)
  const label = days === 0 ? 'Today'
    : days === 1 ? 'Tomorrow'
    : days === -1 ? 'Yesterday'
    : formatShortDate(parsed.date)
  return parsed.hasTime ? `${label} ${formatTimeCompact(parsed.date)}` : label
}

/** The School row's second line: what a candidate is actually asking of you.
 *
 * Glance order — when, where, deadline, cost, who. The source label is the
 * longest and least useful segment (the child already implies the classroom),
 * so it appears only when no child was named, which is how WhatsApp items
 * keep their provenance. The full label lives in the row's tooltip. The
 * sender comes last: useful, but never at the cost of the ask itself. */
export function formatCaptureDetail(meta: CaptureMeta, reference: Date): string | undefined {
  const on = meta.proposedTime ? parseLocal(meta.proposedTime)?.date : undefined
  const when = meta.proposedTime ? formatWhen(meta.proposedTime, reference) : undefined
  // The extractor leaves raw ISO stamps inside its free-text RSVP ("by
  // 2026-08-25T07:30:00"). Unreadable at a glance, so rewrite them in place.
  const rsvp = meta.rsvp?.replace(
    new RegExp(ISO.source, 'g'),
    (stamp) => formatWhen(stamp, reference, on) ?? stamp
  ).replace(/\s+,/g, ',').trim()
  const parts = [when, meta.location, rsvp, meta.cost, meta.gifts, meta.forWho ?? meta.source, meta.from]
    .filter((p): p is string => !!p)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

/** Did this candidate arrive since the pool was last opened?
 *
 * `seenAt` null means never opened, so everything is new — honest on first
 * run, and it clears itself the first time the pool is looked at. An item with
 * no createdAt cannot be judged against a real mark, and is treated as already
 * seen: a missed dot is a smaller failure than a dot that never clears. */
export function isNewSince(task: Task, seenAt: Date | null): boolean {
  if (seenAt === null) return true
  const at = task.createdAt?.getTime()
  return at !== undefined && at > seenAt.getTime()
}

export function countNewSince(tasks: Task[], seenAt: Date | null): number {
  return tasks.reduce((n, t) => (isNewSince(t, seenAt) ? n + 1 : n), 0)
}
