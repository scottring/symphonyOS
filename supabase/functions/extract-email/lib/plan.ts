import type { EmailEvent, EmailExtraction, ExistingBlock, Member, NoteRow, TaskRow } from './types.ts'
import { matchMembers } from './members.ts'
import { addDays, zonedIso } from './dates.ts'

export const MIN_EVENT_CONFIDENCE = 0.75

export interface PlanInput {
  extraction: EmailExtraction
  members: Member[]
  todayYmd: string
  tz: string
  capture: { id: string; user_id: string; subject: string; sender_label: string }
  existing: ExistingBlock[]
}
export interface EventPlan {
  parent: { row: TaskRow } | { existingId: string }
  children: Omit<TaskRow, 'parent_task_id'>[]
}
export interface WritePlan { events: EventPlan[]; inbox: TaskRow[]; note: NoteRow | null }

export function normaliseTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Jaccard overlap of normalised tokens ≥ 0.8. */
export function titlesMatch(a: string, b: string): boolean {
  const A = new Set(normaliseTitle(a).split(' ').filter(Boolean))
  const B = new Set(normaliseTitle(b).split(' ').filter(Boolean))
  if (A.size === 0 || B.size === 0) return false
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  const union = A.size + B.size - inter
  return inter / union >= 0.8
}

// Mirror of src/lib/scope.ts scopeForDomain for family rows: family → compound.
const FAMILY = { context: 'family' as const, scope: 'compound' as const }

function sourceNote(c: PlanInput['capture'], quote: string, extra?: string): string {
  const head = `From ${c.sender_label} · ${c.subject}`
  const parts = [head]
  if (extra) parts.push(extra)
  if (quote) parts.push(`“${quote}”`)
  return parts.join('\n\n')
}

function baseRow(i: PlanInput, title: string): TaskRow {
  return {
    user_id: i.capture.user_id, title, completed: false, bucket: 'inbox', ...FAMILY, category: 'task',
    scheduled_for: null, is_all_day: null, location: null, notes: null, capture_id: i.capture.id,
    assigned_to: null, assigned_to_all: false, parent_task_id: null, needed_on: null,
  }
}

function neededYmd(needed: EmailEvent['items'][number]['needed'], eventYmd: string): string {
  if (needed === 'night_before') return addDays(eventYmd, -1)
  if (needed === 'day_of') return eventYmd
  return needed
}

function childrenFor(i: PlanInput, ev: EmailEvent, skipTitles: string[]): EventPlan['children'] {
  const out: EventPlan['children'] = []
  for (const item of ev.items) {
    const { matched, unmatched } = matchMembers(item.for, i.members)
    const ymd = neededYmd(item.needed, ev.date)
    const push = (title: string, assigned: string | null) => {
      if (skipTitles.some((t) => titlesMatch(t, title))) return
      const { parent_task_id: _omit, ...row } = baseRow(i, title)
      out.push({ ...row, assigned_to: assigned, needed_on: ymd })
    }
    for (const m of matched) push(item.text, m.id)
    if (unmatched.length) push(`${item.text} — ${unmatched.join(', ')}`, null)
    if (matched.length === 0 && unmatched.length === 0) push(item.text, null)
  }
  return out
}

export function planWrites(i: PlanInput): WritePlan {
  const events: EventPlan[] = []
  const inbox: TaskRow[] = []
  const yesterday = addDays(i.todayYmd, -1)

  for (const ev of i.extraction.events) {
    const placeable = ev.confidence >= MIN_EVENT_CONFIDENCE && ev.date >= yesterday
    if (!placeable) {
      const why = ev.date < yesterday ? `Dated ${ev.date} (already past)` : `Dated ${ev.date} (needs a look — confidence ${ev.confidence.toFixed(2)})`
      const itemLines = ev.items.map((it) => `- ${it.text}${it.for === 'everyone' ? '' : ` (${it.for.join(', ')})`}`).join('\n')
      inbox.push({ ...baseRow(i, ev.title), category: 'event', location: ev.location ?? null,
        notes: sourceNote(i.capture, ev.source_quote, itemLines ? `${why}\n\nItems:\n${itemLines}` : why) })
      continue
    }

    const match = i.existing.find((b) => b.ymd === ev.date && titlesMatch(b.title, ev.title))
    if (match) {
      // Attach only items not already on the existing block. If every item is
      // already there, this event yields no new rows on purpose — the
      // household already has it, and there is nothing new to write.
      const children = childrenFor(i, ev, match.childTitles)
      if (children.length) events.push({ parent: { existingId: match.id }, children })
      continue
    }

    const { matched } = matchMembers(ev.for, i.members)
    const single = ev.for !== 'everyone' && matched.length === 1 ? matched[0].id : null
    const row: TaskRow = {
      ...baseRow(i, ev.title), bucket: 'timed', category: 'event',
      scheduled_for: zonedIso(ev.date, ev.time ?? null, i.tz), is_all_day: !ev.time,
      location: ev.location ?? null, notes: sourceNote(i.capture, ev.source_quote),
      assigned_to: single, assigned_to_all: ev.for === 'everyone',
    }
    events.push({ parent: { row }, children: childrenFor(i, ev, []) })
  }

  for (const t of i.extraction.todos) {
    const { matched } = t.for ? matchMembers(t.for, i.members) : { matched: [] as Member[] }
    inbox.push({ ...baseRow(i, t.title), needed_on: t.due ?? null, assigned_to: matched.length === 1 ? matched[0].id : null,
      notes: sourceNote(i.capture, t.source_quote) })
  }

  const gtk = i.extraction.good_to_know
  const gaps = i.extraction.gaps
  const note: NoteRow | null = gtk.length || gaps.length
    ? {
        user_id: i.capture.user_id,
        title: `From ${i.capture.sender_label}: ${i.capture.subject}`,
        content: [
          gtk.length ? 'Good to know:\n' + gtk.map((g) => `- ${g}`).join('\n') : '',
          gaps.length ? 'Needs another look:\n' + gaps.map((g) => `- ${g.note}`).join('\n') : '',
        ].filter(Boolean).join('\n\n'),
        ...FAMILY, source: 'import', type: 'general', external_id: `capture:${i.capture.id}`,
      }
    : null

  return { events, inbox, note }
}
