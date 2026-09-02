import type { EmailEvent, EmailExtraction, EmailGap, EmailTodo, GoodToKnow, ItemKind, Member, Who } from './types.ts'
import { isYmd } from './dates.ts'

export interface PromptInput { subject: string; sender: string; body: string; members: Member[]; todayYmd: string; truncated?: boolean }

export function buildEmailPrompt(i: PromptInput): string {
  const kids = i.members.filter((m) => m.isChild).map((m) => m.name)
  const adults = i.members.filter((m) => !m.isChild).map((m) => m.name)
  return `You read a school or activity email for a busy household and pull out what they must DO, dated and per person.

TODAY: ${i.todayYmd}
HOUSEHOLD — Adults: ${adults.join(', ') || 'none listed'} · Children: ${kids.join(', ') || 'none listed'}
FROM: ${i.sender}
SUBJECT: ${i.subject}

EMAIL:
${i.body}

Return, in this order:
1. "events": each DATED occasion that needs something from the household (picture day, field trip, spirit week day, concert, early dismissal that changes pickup). For each: title; date as YYYY-MM-DD (resolve weekday names relative to TODAY and the email's own dates; if you cannot resolve a date, it is not an event — put it in todos); time as HH:mm only when stated; location if stated; "for": the children's first names it applies to, or "everyone" when it applies to all students; "items": what each person must bring, wear, sign or pay — text, "for" (names or "everyone"), and "needed": "night_before" for things laid out or packed, "day_of" for things that happen that day, or an explicit YYYY-MM-DD; "kind": "homework" when a STUDENT does or hands it in (a form to sign and return, a reading log, a project, studying for a test, a permission slip), otherwise "todo" (a fee a parent pays, a thing to pack or wear); "detail": one or two sentences of context a person needs when doing it (what the form is for, cost, where to hand it in), never a repeat of the text; "source_quote": the exact sentence(s) you took it from; "confidence" 0–1.
2. "todos": actions with no occasion date (return a form, pay a fee, sign up) — title, due as YYYY-MM-DD if stated, "for" names if specific, "kind" and "detail" as above, source_quote, confidence.
3. "good_to_know": things to KNOW but not DO — policy, dismissal rules, curriculum notes. One short sentence each, with "for": the children it concerns, or "everyone". Never repeat these as events or todos.
4. "gaps": what you could not read — unreadable_attachment, truncated, low_confidence — with a note.

Use only names from the HOUSEHOLD list in "for"; any other name goes in the item text. Do not invent dates. Do not invent items.${i.truncated ? '\nThe email was truncated at the end; emit a gap of kind truncated.' : ''}

Respond with strict JSON only, no prose, no markdown fence:
{"events":[{"title":"...","date":"YYYY-MM-DD","time":"HH:mm|omit","location":"...|omit","for":["Name"]|"everyone","items":[{"text":"...","for":["Name"]|"everyone","needed":"night_before|day_of|YYYY-MM-DD","kind":"homework|todo","detail":"...|omit"}],"source_quote":"...","confidence":0.0}],"todos":[{"title":"...","due":"YYYY-MM-DD|omit","for":["Name"]|omit,"kind":"homework|todo","detail":"...|omit","source_quote":"...","confidence":0.0}],"good_to_know":[{"text":"...","for":["Name"]|"everyone"}],"gaps":[{"kind":"unreadable_attachment|truncated|low_confidence","note":"..."}]}`
}

const EMPTY: EmailExtraction = { events: [], todos: [], good_to_know: [], gaps: [] }

const clamp01 = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
// The prompt shows optional fields as "...|omit"; a model sometimes echoes the
// placeholder instead of leaving the key out. Treat those as absent.
const PLACEHOLDERS = new Set(['omit', 'null', 'none', 'n/a', '-', ''])
const opt = (v: unknown) => { const s = str(v); return PLACEHOLDERS.has(s.toLowerCase()) ? '' : s }

function who(v: unknown): Who | null {
  if (v === 'everyone') return 'everyone'
  if (Array.isArray(v)) {
    const names = v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
    return names.length ? names : null
  }
  return null
}

const kind = (v: unknown): ItemKind => (v === 'homework' ? 'homework' : 'todo')
const detail = (v: unknown): string | undefined => opt(v) || undefined

/** A plain string is the pre-2026-09-02 shape: addressed to everyone. */
function goodToKnow(v: unknown): GoodToKnow | null {
  if (typeof v === 'string') return v.trim() ? { text: v.trim(), for: 'everyone' } : null
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const text = str(o.text)
  return text ? { text, for: who(o.for) ?? 'everyone' } : null
}

function needed(v: unknown): EmailEvent['items'][number]['needed'] {
  if (v === 'night_before' || v === 'day_of') return v
  if (isYmd(v)) return v
  return 'day_of'
}

function event(v: unknown): EmailEvent | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const title = str(o.title)
  if (!title || !isYmd(o.date)) return null
  const w = who(o.for) ?? 'everyone'
  const items = Array.isArray(o.items)
    ? o.items.flatMap((it) => {
        if (!it || typeof it !== 'object') return []
        const io = it as Record<string, unknown>
        const text = str(io.text)
        if (!text) return []
        return [{ text, for: who(io.for) ?? w, needed: needed(io.needed), kind: kind(io.kind), detail: detail(io.detail) }]
      })
    : []
  const time = /^\d{2}:\d{2}$/.test(opt(o.time)) ? opt(o.time) : undefined
  return {
    title, date: o.date, time, location: opt(o.location) || undefined, for: w, items,
    source_quote: str(o.source_quote), confidence: clamp01(o.confidence),
  }
}

function todo(v: unknown): EmailTodo | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const title = str(o.title)
  if (!title) return null
  const w = who(o.for)
  return {
    title, due: isYmd(o.due) ? o.due : undefined, for: Array.isArray(w) ? w : undefined,
    kind: kind(o.kind), detail: detail(o.detail),
    source_quote: str(o.source_quote), confidence: clamp01(o.confidence),
  }
}

function gap(v: unknown): EmailGap | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const kind = o.kind
  if (kind !== 'unreadable_attachment' && kind !== 'truncated' && kind !== 'low_confidence') return null
  return { kind, note: str(o.note) }
}

export function parseEmailExtraction(raw: string): EmailExtraction {
  const trimmed = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    const a = trimmed.indexOf('{'), b = trimmed.lastIndexOf('}')
    if (a === -1 || b <= a) return { ...EMPTY }
    try { parsed = JSON.parse(trimmed.slice(a, b + 1)) } catch { return { ...EMPTY } }
  }
  if (!parsed || typeof parsed !== 'object') return { ...EMPTY }
  const o = parsed as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? v : [])
  return {
    events: list(o.events).map(event).filter((e): e is EmailEvent => e !== null),
    todos: list(o.todos).map(todo).filter((t): t is EmailTodo => t !== null),
    good_to_know: list(o.good_to_know).map(goodToKnow).filter((g): g is GoodToKnow => g !== null),
    gaps: list(o.gaps).map(gap).filter((g): g is EmailGap => g !== null),
  }
}
