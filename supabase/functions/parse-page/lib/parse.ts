// Pure prompt-building and response-parsing for parse-page. Deno-free so
// Vitest runs it (vitest.config.ts includes supabase/functions/**).

export interface CalendarDay { ymd: string; weekday: string }
export interface Member { id: string; name: string }
export interface PageItemRaw { title: string; day: string; assignee_id: string | null; note: string | null }
export interface PageNoteRaw { title: string; content: string }
export interface PageParseResult { items: PageItemRaw[]; notes: PageNoteRaw[]; unclear: string[] }

const MAX_ITEMS = 40
const MAX_NOTES = 20
const MAX_UNCLEAR = 20
const YMD = /^\d{4}-\d{2}-\d{2}$/

/** The dates of the window, inclusive, as local YYYY-MM-DD plus weekday names. */
export function windowCalendar(placeStart: string, placeEnd: string): CalendarDay[] {
  const out: CalendarDay[] = []
  const [y, m, d] = placeStart.split('-').map(Number)
  const cursor = new Date(y, m - 1, d)
  for (let i = 0; i < 60; i++) {
    const ymd = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    out.push({ ymd, weekday: cursor.toLocaleDateString('en-US', { weekday: 'long' }) })
    if (ymd === placeEnd) return out
    cursor.setDate(cursor.getDate() + 1)
  }
  return out // malformed placeEnd — the caller validates before we get here
}

export function buildPagePrompt(calendar: CalendarDay[], members: Member[], today: string): string {
  const calendarLines = calendar.map((c) => `- ${c.ymd} (${c.weekday})`).join('\n')
  const memberLines = members.length ? members.map((m) => `- ${m.id}: ${m.name}`).join('\n') : '(none)'
  return `You are the capture assistant for Symphony, a personal task app. The user keeps a handwritten daily scratchpad on an e-ink tablet and has exported a page. A scratchpad page mixes registers: some lines are things to do, some are notes and reference and thinking, and some are simply hard to read. Sort the page into those three registers. Do not force everything into tasks.

Today is ${today}. The ONLY dates a task may be placed on (day headers like "Mon" or "Tue 8/18" map to these):
${calendarLines}

Household members (id: name) — assign a task ONLY when the line clearly names one (e.g. "Iris: return library books"):
${memberLines}

Respond with ONLY a JSON object (no markdown fences, no prose):

{
  "items": [
    {
      "title": "Short imperative task title, cleaned up from the handwriting",
      "day": "YYYY-MM-DD from the calendar above if the line sits under a day heading or names a day; \\"week\\" if it should happen soon but names no day; \\"inbox\\" if it has no time frame at all",
      "assignee_id": "member id from the list above, or null",
      "note": "extra detail written on that line beyond the action itself (phone number, store, quantity, 'before 3pm'), or null"
    }
  ],
  "notes": [
    { "title": "Short heading naming what this is about", "content": "The prose as written, lightly cleaned up. Keep the user's words." }
  ],
  "unclear": ["a line you could not read confidently, transcribed as your best guess"]
}

Rules:
- A line naming an action — something to do, obtain, decide, or contact — is an ITEM. One item per distinct action. Do not invent, do not merge.
- A paragraph, a list of facts, a caption, a piece of reasoning, a phone number or address with no action attached, is a NOTE.
- A line you cannot read confidently goes in UNCLEAR, verbatim best guess. NEVER promote a guess to an item — a wrong task is worse than an unread line.
- Skip crossed-out lines and anything ticked or checked. It was already done on paper.
- Skip page titles, dates written as headers, decorations, and doodles.
- A day name with no date (e.g. "Wed") means the NEXT such weekday in the calendar above.
- If a named day is NOT in the calendar (e.g. a past day), use "week".
- If the page holds nothing at all, return {"items":[],"notes":[],"unclear":[]}.`
}

function parseItems(raw: unknown, calendar: Set<string>, memberIds: Set<string>): PageItemRaw[] {
  if (!Array.isArray(raw)) return []
  const out: PageItemRaw[] = []
  for (const entry of raw.slice(0, MAX_ITEMS)) {
    const e = entry as Partial<PageItemRaw>
    if (typeof e.title !== 'string' || !e.title.trim()) continue
    let day = typeof e.day === 'string' ? e.day : 'inbox'
    // Out-of-window degrades to 'week' rather than being dropped — the review
    // sheet lets the user fix it, and a silently vanished line is worse.
    if (day !== 'week' && day !== 'inbox' && !(YMD.test(day) && calendar.has(day))) day = 'week'
    out.push({
      title: e.title.trim().slice(0, 200),
      day,
      assignee_id: typeof e.assignee_id === 'string' && memberIds.has(e.assignee_id) ? e.assignee_id : null,
      note: typeof e.note === 'string' && e.note.trim() ? e.note.trim().slice(0, 1000) : null,
    })
  }
  return out
}

function parseNotes(raw: unknown): PageNoteRaw[] {
  if (!Array.isArray(raw)) return []
  const out: PageNoteRaw[] = []
  for (const entry of raw.slice(0, MAX_NOTES)) {
    const e = entry as Partial<PageNoteRaw>
    if (typeof e.content !== 'string' || !e.content.trim()) continue
    const content = e.content.trim().slice(0, 5000)
    const title =
      typeof e.title === 'string' && e.title.trim()
        ? e.title.trim().slice(0, 80)
        : content.split('\n')[0].trim().slice(0, 80)
    out.push({ title, content })
  }
  return out
}

function parseUnclear(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((l): l is string => typeof l === 'string')
    .map((l) => l.trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, MAX_UNCLEAR)
}

/** Throws when the model's text is not JSON at all, so the caller can retry once. */
export function parsePageResponse(raw: string, calendar: Set<string>, memberIds: Set<string>): PageParseResult {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const parsed = JSON.parse(stripped) as { items?: unknown; notes?: unknown; unclear?: unknown }
  return {
    items: parseItems(parsed.items, calendar, memberIds),
    notes: parseNotes(parsed.notes),
    unclear: parseUnclear(parsed.unclear),
  }
}
