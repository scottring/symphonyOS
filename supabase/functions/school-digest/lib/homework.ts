// The kids' work, out of the day's school feed (Scott, 2026-10-07: "parse the
// daily email digest as well as ClassDojo for specific work that Kaleb and
// Ella have to do … for posting on the kiosk/wall").
//
// The same transcripts the 5pm digest reads (ClassDojo + the school WhatsApp
// groups) get a second, narrow pass: only what a CHILD does or hands in —
// homework, a reading log, studying for a test, a form to return. Each becomes
// one open homework task for its child, dated the day it is due, which the
// wall already draws on that child's card and page. Nothing else is written:
// no notes, no events, no parent to-dos (the automatic feed was turned off on
// 2026-09-12 for overstuffing notes; this is the one thing let back in).
//
// Pure: the prompt, the parser and the plan. The handler does the I/O.
import { matchMembers } from '../../extract-email/lib/members.ts'
import { itemsMatch, sameAudience, scopeFor, type MailRowAudience } from '../../extract-email/lib/plan.ts'
import type { Member, Scope, Who } from '../../extract-email/lib/types.ts'
import type { DigestSource } from './digest.ts'

export interface HomeworkItem {
  title: string
  for: Who
  /** YYYY-MM-DD the work is due (or handed in). */
  due?: string
  detail?: string
  source: string
  source_quote: string
  confidence: number
}

/** Below this the model is guessing; the wall would show a guess as fact. */
export const MIN_CONFIDENCE = 0.6

export function buildHomeworkPrompt(sources: DigestSource[], members: Member[], todayYmd: string, weekday: string): string {
  const kids = members.filter((m) => m.isChild).map((m) => m.name.split(' ')[0])
  const transcript = sources.map((s) => `### ${s.label}\n${s.text}`).join('\n\n')
  return `You read a family's school messages from today (${weekday} ${todayYmd}) — ClassDojo posts and parent WhatsApp groups — and list ONLY the work a child has to do.

CHILDREN: ${kids.join(', ') || '(none listed)'}

Work = something a STUDENT does or hands in: homework, a worksheet, a reading log, a project, studying for a test or quiz, practising for a performance, a form or slip the student brings back. NOT work: things a parent pays, packs, buys or signs up for; events, schedule changes, dress-up days, reminders to the class in general with nothing to do; chatter and photos.

For each piece of work:
- "title": short and concrete, as the child would say it ("Spelling test — study list 5", "Reading log", "Return field trip slip"). No child's name in the title.
- "for": the children's first names from CHILDREN it is for, or "everyone" when it is addressed to a whole class/grade without naming a child. A class that only one child is in counts as that child when the group's name makes it clear (e.g. a third-grade group and only one child is in third grade) — otherwise "everyone".
- "due": YYYY-MM-DD when it is due or handed in. Resolve weekday names relative to today (${weekday} ${todayYmd}). Nightly homework with no stated day is due the next school day. If you cannot tell, omit it.
- "detail": one sentence a parent needs to help (pages, what to bring back), or omit.
- "source": the section heading it came from.
- "source_quote": the exact sentence(s) you took it from.
- "confidence": 0–1.

Do not invent work. Do not list the same work twice. If there is none, return an empty list.

Return JSON only:
{"homework":[{"title":"...","for":["Name"]|"everyone","due":"YYYY-MM-DD|omit","detail":"...|omit","source":"...","source_quote":"...","confidence":0.0}]}

${transcript}`
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const absent = (s: string) => !s || /^(omit|null|none|n\/a)$/i.test(s)

export function parseHomework(raw: string): HomeworkItem[] {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  let data: unknown
  try { data = JSON.parse(raw.slice(start, end + 1)) } catch { return [] }
  const list = (data as { homework?: unknown })?.homework
  if (!Array.isArray(list)) return []
  return list.flatMap((o): HomeworkItem[] => {
    if (!o || typeof o !== 'object') return []
    const r = o as Record<string, unknown>
    const title = str(r.title)
    if (absent(title)) return []
    const forRaw = r.for
    const who: Who = forRaw === 'everyone'
      ? 'everyone'
      : Array.isArray(forRaw) ? forRaw.map(str).filter((n) => !absent(n)) : 'everyone'
    const due = str(r.due)
    const detail = str(r.detail)
    const confidence = typeof r.confidence === 'number' ? r.confidence : 0
    return [{
      title,
      for: Array.isArray(who) && who.length === 0 ? 'everyone' : who,
      due: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : undefined,
      detail: absent(detail) ? undefined : detail,
      source: str(r.source),
      source_quote: str(r.source_quote),
      confidence,
    }]
  })
}

/** One homework task as written. Family content, shared like the rest of school mail. */
export interface HomeworkRow {
  user_id: string
  title: string
  completed: false
  bucket: 'timed'
  context: 'family'
  scope: Scope
  category: 'homework'
  scheduled_for: string
  is_all_day: true
  needed_on: string
  notes: string
  assigned_to: string | null
  assigned_to_all: string[] | null
}

export interface ExistingHomework extends MailRowAudience { title: string }

/** The next school day after `ymd` (Mon–Fri). */
export function nextSchoolDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  do d.setUTCDate(d.getUTCDate() + 1)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6)
  return d.toISOString().slice(0, 10)
}

/**
 * The rows to write: one per piece of work, for its children only, skipping
 * anything already open for the same child (the same reading log mentioned
 * on Monday and again on Tuesday is one row). A piece of work for nobody in
 * the household is dropped, never pinned on a guess.
 */
export function planHomework(i: {
  items: HomeworkItem[]
  members: Member[]
  userId: string
  todayYmd: string
  existing: ExistingHomework[]
}): HomeworkRow[] {
  const out: HomeworkRow[] = []
  const kids = i.members.filter((m) => m.isChild)
  for (const item of i.items) {
    if (item.confidence < MIN_CONFIDENCE) continue
    const { matched } = matchMembers(item.for, i.members)
    const forKids = matched.filter((m) => m.isChild)
    // "everyone" is the children; named adults are not homework.
    const who = item.for === 'everyone' ? kids : forKids
    if (who.length === 0) continue
    const audience: MailRowAudience = who.length === 1
      ? { assigned_to: who[0].id, assigned_to_all: null }
      : { assigned_to: null, assigned_to_all: who.map((k) => k.id) }
    const seen = [...i.existing, ...out]
    if (seen.some((e) => itemsMatch(e.title, item.title) && sameAudience(e, audience))) continue
    const due = item.due && item.due >= i.todayYmd ? item.due : nextSchoolDay(i.todayYmd)
    const from = item.source ? `From ${item.source} · school digest` : 'From the school digest'
    out.push({
      user_id: i.userId,
      title: item.title,
      completed: false,
      bucket: 'timed',
      context: 'family',
      // The app's one scope rule (family content is the household's).
      scope: scopeFor('family', who.map((k) => k.id), null),
      category: 'homework',
      // All day, at noon UTC: the same calendar day in every US zone.
      scheduled_for: `${due}T12:00:00.000Z`,
      is_all_day: true,
      needed_on: due,
      notes: [from, item.detail, item.source_quote ? `“${item.source_quote}”` : ''].filter(Boolean).join('\n\n'),
      assigned_to: audience.assigned_to ?? null,
      assigned_to_all: audience.assigned_to_all ?? null,
    })
  }
  return out
}
