// WALK-SUGGEST — what goes to the model and what comes back. Pure, no Deno
// or URL imports, so vitest can load it.
//
// The walk asks "What part of <goal> belongs to <period>?". When the person
// asks for examples, this writes three answers that follow from that goal:
// their own goal read for what it is after ("Get back to 175 pounds" is
// losing weight), then three steps sized to the period.

export type Level = 'season' | 'month' | 'week'
export type AboveLevel = 'year' | 'season' | 'month' | 'week'
export interface Above { level: AboveLevel; title: string }
export interface SuggestBody {
  level: Level
  area: string | null
  /** The goal the step is about, then the goals above it. Nearest first. */
  above: Above[]
  /** The period in the app's words: "this winter", "December", "this week". */
  period: string
  /** YYYY-MM-DD, the person's own day. */
  today: string | null
  /** What they already have for this period under the goal. */
  have: string[]
}

const LEVELS: Level[] = ['season', 'month', 'week']
const ABOVE_LEVELS: AboveLevel[] = ['year', 'season', 'month', 'week']
export const MAX_TITLE = 200
/** One flag in the walk: the longest a suggestion may be. */
export const MAX_SUGGESTION = 44

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t.length > 0 && t.length <= max ? t : null
}

export function parseSuggestBody(raw: unknown): SuggestBody | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Body must be an object' }
  const b = raw as Record<string, unknown>
  if (!LEVELS.includes(b.level as Level)) return { error: 'level must be season, month or week' }
  if (!Array.isArray(b.above) || b.above.length < 1 || b.above.length > 4) return { error: 'above must hold one to four goals' }
  const above: Above[] = []
  for (const item of b.above) {
    const a = item as Record<string, unknown> | null
    const title = text(a?.title, MAX_TITLE)
    if (!a || !ABOVE_LEVELS.includes(a.level as AboveLevel) || !title) return { error: 'each goal above needs a level and a title' }
    above.push({ level: a.level as AboveLevel, title })
  }
  const period = text(b.period, 40)
  if (!period) return { error: 'period is required' }
  const today = typeof b.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.today) && !Number.isNaN(Date.parse(b.today)) ? b.today : null
  const have = Array.isArray(b.have)
    ? b.have.slice(0, 12).map((h) => text(h, MAX_TITLE)).filter((h): h is string => h !== null)
    : []
  return { level: b.level as Level, area: text(b.area, 60), above, period, today, have }
}

export const SYSTEM = `You help one person break their own goal into smaller goals in a planning app. The app has just asked them what part of a goal belongs to a shorter period, and they asked for ideas. Write three answers they could tap and keep as their own.

First work out what the goal is really after. "Get back to 175 pounds" is about losing weight until they weigh 175. "Finally finish the basement" is about a building job with an end. Read the goals above it too: they say why this goal matters.

Then write three suggestions:
- Each one leads directly to this goal. Not general good habits, and nothing about a different goal.
- Use the person's own numbers, names and words where they gave any. Never invent facts about their life: no person, place, tool, membership or detail they did not mention.
- Size each to the period. A season is about three months: a milestone to reach or a routine to hold. A month is something that can be finished or settled within it. A week is one small task for a single sitting.
- Make the three different in kind where the goal allows: a result to reach, a routine to keep, a first thing to set up.
- Write each as the person would write their own goal: plain everyday words, sentence case, no full stop, no quotation marks, no emoji, 40 characters at most.
- For a week only, end each with a day: " on Monday" to " on Sunday", or " today". Use days from today to the end of this week.
- Ordinary steps only: nothing that is medical, legal or investment advice.
- Do not repeat or reword anything they already have.`

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SIZE: Record<Level, string> = { season: 'a season, about three months', month: 'one month', week: 'this week' }

export function buildUserContent(b: SuggestBody): string {
  const lines: string[] = []
  if (b.area) lines.push(`Area of life: ${b.area}`)
  // Highest first, so it reads down to the goal the question is about.
  for (const a of [...b.above].reverse()) lines.push(`Their ${a.level} goal: ${a.title}`)
  lines.push(`The question is about: ${b.above[0].title}`)
  lines.push(`They are choosing goals for: ${b.period} (${SIZE[b.level]})`)
  if (b.have.length) lines.push(`They already have: ${b.have.join('; ')}`)
  if (b.today) {
    const day = new Date(`${b.today}T12:00:00Z`)
    lines.push(`Today is ${WEEKDAYS[day.getUTCDay()]}, ${b.today}.`)
  }
  return lines.join('\n')
}

export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: { suggestions: { type: 'array', items: { type: 'string' } } },
  required: ['suggestions'],
  additionalProperties: false,
} as const

/** One suggestion as a flag: spaces tidied, wrapping quotes and a closing
 *  full stop dropped; null when it is empty or too long to fit. */
export function tidy(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.replace(/\s+/g, ' ').trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').replace(/[.。]+$/, '').trim()
  return t.length >= 3 && t.length <= MAX_SUGGESTION ? t : null
}

/** The model's reply as up to three suggestions: its JSON text block read,
 *  each tidied, none twice and none the person already has. Null when the
 *  model refused, or nothing usable came back. */
export function suggestionsFromResponse(reply: unknown, have: string[] = []): string[] | null {
  const r = reply as { stop_reason?: unknown; content?: unknown } | null
  if (!r || r.stop_reason === 'refusal' || !Array.isArray(r.content)) return null
  const block = r.content.find((c) => c && typeof c === 'object' && (c as { type?: unknown }).type === 'text') as { text?: unknown } | undefined
  if (typeof block?.text !== 'string') return null
  let parsed: unknown
  try { parsed = JSON.parse(block.text) } catch { return null }
  const list = (parsed as { suggestions?: unknown } | null)?.suggestions
  if (!Array.isArray(list)) return null
  const seen = new Set(have.map((h) => h.toLowerCase()))
  const out: string[] = []
  for (const item of list) {
    const s = tidy(item)
    if (!s || seen.has(s.toLowerCase())) continue
    seen.add(s.toLowerCase())
    out.push(s)
    if (out.length === 3) break
  }
  return out.length ? out : null
}
