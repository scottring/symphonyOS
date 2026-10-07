// The wall's scratchpad (Scott, 2026-10-07; mockup "Wall Scratchpad"): quick
// notes and things to talk about, jotted at the kitchen wall and triaged to
// Done or to someone's Inbox. It took the Specials box's place — today's
// specials already sit on Today.
//
// One list: notes written at the wall, plus the tasks and events someone
// flagged "Bring up" in the app (the old For Discussion overlay). Pure helpers
// here; the data lives in useScratchpad.

export type ScratchpadKind = 'note' | 'talk'
export type ScratchpadStatus = 'open' | 'done' | 'sent'

export interface ScratchpadNote {
  id: string
  body: string
  kind: ScratchpadKind
  authorMemberId: string | null
  status: ScratchpadStatus
  resolution: string | null
  sentToMemberId: string | null
  createdAt: Date
  resolvedAt: Date | null
}

export interface DbScratchpadNote {
  id: string
  body: string
  kind: string
  author_member_id: string | null
  status: string
  resolution: string | null
  sent_to_member_id: string | null
  created_at: string
  resolved_at: string | null
}

export function dbToScratchpadNote(row: DbScratchpadNote): ScratchpadNote {
  return {
    id: row.id,
    body: row.body,
    kind: row.kind === 'talk' ? 'talk' : 'note',
    authorMemberId: row.author_member_id,
    status: row.status === 'done' || row.status === 'sent' ? row.status : 'open',
    resolution: row.resolution?.trim() || null,
    sentToMemberId: row.sent_to_member_id,
    createdAt: new Date(row.created_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
  }
}

/** Sorted notes stay in "Done this week" this long; the rows themselves are kept. */
export const DONE_WINDOW_DAYS = 7

/** A "Bring up" flag from the app, already reduced to what the wall shows. */
export interface FlaggedItem {
  kind: 'task' | 'event'
  id: string
  title: string
  note?: string | null
}

export interface ScratchpadRow {
  /** Unique across sources: `note:<id>`, `task:<id>`, `event:<id>`. */
  key: string
  source: 'note' | 'task' | 'event'
  id: string
  text: string
  kind: ScratchpadKind
  authorMemberId: string | null
  createdAt: Date | null
  /** A flagged item's own discussion note. */
  detail: string | null
}

/** The open list: wall notes newest first, then what was brought up in the app. */
export function openScratchpadRows(notes: ScratchpadNote[], flagged: FlaggedItem[]): ScratchpadRow[] {
  const own = notes
    .filter((n) => n.status === 'open')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map<ScratchpadRow>((n) => ({
      key: `note:${n.id}`, source: 'note', id: n.id, text: n.body, kind: n.kind,
      authorMemberId: n.authorMemberId, createdAt: n.createdAt, detail: null,
    }))
  const brought = flagged.map<ScratchpadRow>((f) => ({
    key: `${f.kind}:${f.id}`, source: f.kind, id: f.id, text: f.title, kind: 'talk',
    authorMemberId: null, createdAt: null, detail: f.note?.trim() || null,
  }))
  return [...own, ...brought]
}

/** Notes sorted in the last week, most recent first. */
export function recentlySorted(notes: ScratchpadNote[], now: Date): ScratchpadNote[] {
  const since = now.getTime() - DONE_WINDOW_DAYS * 86_400_000
  return notes
    .filter((n) => n.status !== 'open' && n.resolvedAt && n.resolvedAt.getTime() >= since)
    .sort((a, b) => (b.resolvedAt as Date).getTime() - (a.resolvedAt as Date).getTime())
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** "Just now", "12 min ago", "This morning", "Yesterday", "Mon", "Sep 28". */
export function whenWritten(d: Date, now: Date): string {
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (days === 0) {
    const h = d.getHours()
    return h < 12 ? 'This morning' : h < 17 ? 'This afternoon' : 'This evening'
  }
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** The second line under a row: "Talk about · Iris · Yesterday". */
export function rowByline(row: ScratchpadRow, nameOf: (id: string) => string | undefined, now: Date): string {
  if (row.source !== 'note') {
    return row.detail ?? (row.source === 'event' ? 'Brought up from the calendar' : 'Brought up from a task')
  }
  const author = row.authorMemberId ? nameOf(row.authorMemberId) : undefined
  return [row.kind === 'talk' ? 'Talk about' : 'Note', author, row.createdAt ? whenWritten(row.createdAt, now) : null]
    .filter(Boolean).join(' · ')
}
