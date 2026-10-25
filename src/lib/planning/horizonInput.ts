// src/lib/planning/horizonInput.ts
//
// Typing on any horizon (Scott, 2026-10-25: "AI assisted / natural language
// input — Appointment at dentist for K and E Nov 23 at 9am at cross keys").
// Reads a sentence the way it is said: who it is for ("for K and E", "with
// Iris", "for the kids"), when (parseQuickInput's dates and times), and where
// ("at Cross Keys"). The date decides the horizon it lands on, so typing on
// any page is safe: a date outside the page's period goes to that date.
//
// The rest of the quick-input grammar (#project, -name, !!) still works: the
// sentence is handed on to parseQuickInput once who and where are taken out.

import { parseQuickInput, type ParsedQuickInput, type ParserContext } from '@/lib/quickInputParser'

export interface HorizonMember { id: string; name: string; role_label?: string | null }

export interface HorizonParse {
  title: string
  /** Household member ids it is for. */
  people: string[]
  /** A date (and maybe a time) the sentence named. */
  date?: Date
  hasTime: boolean
  location?: string
  /** The full quick-input read, for its other fields (project, context …). */
  quick: ParsedQuickInput
}

const JOIN = /\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/i
const KID_WORDS = /^(?:the\s+)?kids$/i
const isKid = (m: HorizonMember) => /child|kid|son|daughter/i.test(m.role_label ?? '')
const first = (m: HorizonMember) => m.name.trim().split(/\s+/)[0].toLowerCase()
const titleCase = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase())
/** "Appointment at the dentist" reads as "Dentist appointment". */
const GENERIC = /^(?:an?\s+)?(appointment|meeting|visit|lunch|dinner|breakfast|checkup|check-up)$/i

/** One name, initial or "the kids" → member ids; null when it names no one. */
function membersFor(word: string, members: HorizonMember[]): string[] | null {
  const w = word.trim().toLowerCase().replace(/[.!?]$/, '')
  if (!w) return null
  if (KID_WORDS.test(w)) { const kids = members.filter(isKid); return kids.length ? kids.map((m) => m.id) : null }
  const byName = members.filter((m) => first(m) === w || m.name.toLowerCase() === w)
  if (byName.length === 1) return [byName[0].id]
  // A single letter names someone only when exactly one member starts with it.
  if (/^\p{L}$/u.test(w)) {
    const byInitial = members.filter((m) => first(m).startsWith(w))
    if (byInitial.length === 1) return [byInitial[0].id]
  }
  return null
}

/** "for K and E", "with Iris", "for the kids": every word in the run must name someone. */
function takePeople(text: string, members: HorizonMember[]): { text: string; people: string[] } {
  if (!members.length) return { text, people: [] }
  const re = /\b(for|with)\s+((?:the\s+)?[\p{L}][\p{L}'-]*(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*)(?:the\s+)?[\p{L}][\p{L}'-]*)*)/giu
  for (const m of text.matchAll(re)) {
    // Try the longest run of names first, then shorter ones ("for E Nov 23").
    const words = m[2].split(JOIN)
    for (let n = words.length; n > 0; n--) {
      const ids = words.slice(0, n).map((w) => membersFor(w, members))
      if (ids.some((x) => !x)) continue
      const said = `${m[1]} ${words.slice(0, n).join(' and ')}`
      // Cut exactly what was matched: the prefix of m[0] covering n words.
      const cut = new RegExp(`^${m[1]}\\s+` + words.slice(0, n).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(JOIN.source.replace(/^/, '(?:').concat(')')), 'i')
      const span = m[0].match(cut)?.[0] ?? said
      const at = m.index ?? text.indexOf(m[0])
      const people = [...new Set(ids.flat() as string[])]
      return { text: (text.slice(0, at) + text.slice(at + span.length)).replace(/\s+/g, ' ').trim(), people }
    }
  }
  return { text, people: [] }
}

/** "… at Cross Keys": the last "at" that isn't a time. */
function takePlace(title: string): { title: string; location?: string } {
  const lower = title.toLowerCase()
  const at = lower.lastIndexOf(' at ')
  if (at <= 0) return { title }
  const place = title.slice(at + 4).trim().replace(/[.,;]$/, '')
  if (!place || /^\d|^(?:noon|midnight|night|home|work|school)\b/i.test(place)) return { title }
  const before = title.slice(0, at).trim()
  if (GENERIC.test(before)) return { title: `${titleCase(place)} ${before.replace(/^(?:an?\s+)/i, '').toLowerCase()}` }
  return { title: before, location: titleCase(place) }
}

export function parseHorizonInput(input: string, members: HorizonMember[], ctx: Omit<ParserContext, 'familyMembers'> = { projects: [], contacts: [] }): HorizonParse {
  const raw = input.trim().replace(/\s+/g, ' ')
  const { text, people } = takePeople(raw, members)
  const quick = parseQuickInput(text, { ...ctx, familyMembers: members })
  const placed = takePlace(quick.title)
  let title = placed.title
  // "Appointment at the dentist" with nothing else: subject first.
  const lone = title.match(/^(?:an?\s+)?(appointment|meeting|visit|checkup|check-up)\s+(?:at|with)\s+(?:the\s+)?(.+)$/i)
  if (lone) title = `${titleCase(lone[2])} ${lone[1].toLowerCase()}`
  title = title ? title[0].toUpperCase() + title.slice(1) : raw
  return {
    title,
    people: [...new Set([...people, ...(quick.assignedMemberIds ?? [])])],
    date: quick.dueDate,
    hasTime: quick.hasTime,
    location: placed.location,
    quick,
  }
}

/** Where a typed thing lands, from its date and the page it was typed on. */
export type HorizonLanding =
  | { kind: 'day'; date: Date; inPeriod: boolean }
  | { kind: 'period' }

export function landingFor(parse: Pick<HorizonParse, 'date'>, period: { start: Date; end: Date }, fallbackDay?: Date): HorizonLanding {
  const date = parse.date ?? fallbackDay
  if (!date) return { kind: 'period' }
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  return { kind: 'day', date, inPeriod: d >= period.start && d <= period.end }
}
