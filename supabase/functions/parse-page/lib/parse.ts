// Pure prompt-building and response-parsing for parse-page. Deno-free so
// Vitest runs it (vitest.config.ts includes supabase/functions/**).

export interface CalendarDay { ymd: string; weekday: string }
/** `role` is the household role_label ("parent", "child", …) when known. It
 *  tells the model who can actually DO a line — a child's name on "dentist
 *  10am" says who the appointment is about, not who drives. */
export interface Member { id: string; name: string; role?: string | null }
export interface PageItemRaw { title: string; day: string; time: string | null; assignee_id: string | null; note: string | null }

/** Which page the user photographed. The altitude decides what an undated
 *  line means and which placements the model may use. `week` is the daily
 *  scratchpad / week plan — the only altitude before 2026-09-05. */
export type PageAltitude = 'week' | 'month' | 'season' | 'year'
export const ALTITUDES: readonly PageAltitude[] = ['week', 'month', 'season', 'year']
export function isAltitude(v: unknown): v is PageAltitude {
  return typeof v === 'string' && (ALTITUDES as readonly string[]).includes(v)
}

/** Where a line lands when it names no day. Also where an out-of-window date
 *  degrades to — the page's own altitude, so a month page never strands a
 *  misread date in the week pool. */
export function defaultPlacement(altitude: PageAltitude): string {
  return altitude === 'year' ? 'goal' : altitude
}

const HORIZON_DAYS = new Set(['week', 'month', 'season', 'someday', 'inbox'])
export interface PageNoteRaw { title: string; content: string }
export interface PageParseResult { items: PageItemRaw[]; notes: PageNoteRaw[]; unclear: string[] }

const MAX_ITEMS = 40
const MAX_NOTES = 20
const MAX_UNCLEAR = 20
const YMD = /^\d{4}-\d{2}-\d{2}$/
// 24-hour HH:MM. A clock time on a paper line is a real appointment, not trivia.
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

/** The dates of the window, inclusive, as local YYYY-MM-DD plus weekday names. */
export function windowCalendar(placeStart: string, placeEnd: string): CalendarDay[] {
  const out: CalendarDay[] = []
  const [y, m, d] = placeStart.split('-').map(Number)
  const cursor = new Date(y, m - 1, d)
  // A season window is 92 days; the cap only guards a malformed placeEnd.
  for (let i = 0; i < 120; i++) {
    const ymd = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    out.push({ ymd, weekday: cursor.toLocaleDateString('en-US', { weekday: 'long' }) })
    if (ymd === placeEnd) return out
    cursor.setDate(cursor.getDate() + 1)
  }
  return out // malformed placeEnd — the caller validates before we get here
}

const ALTITUDE_GUIDE: Record<PageAltitude, string> = {
  week: `This is a WEEK page: a daily scratchpad or a plan for the coming days. "day" for an item is:
- "YYYY-MM-DD" from the calendar above if the line sits under a day heading or names a day;
- "week" if it should happen in the coming days but names no day;
- "month" if the line says it is for later this month; "season" or "someday" only if the page says so;
- "inbox" if it has no time frame at all.`,
  month: `This is a MONTH page: the user is planning the month ahead. "day" for an item is:
- "YYYY-MM-DD" from the calendar above if the line names a date or a day of the month (the calendar covers the rest of this month and all of next month);
- "month" for a line with no date — the default on this page;
- "week" only if the line says it must happen this week or in the next few days;
- "season" for something explicitly pushed past this month; "someday" for a wish with no timeframe;
- "inbox" only for a line that is clearly a capture, not a plan.`,
  season: `This is a SEASON page: the user is planning the next three months. "day" for an item is:
- "season" for a line with no date — the default on this page;
- "YYYY-MM-DD" from the calendar above only when the line names an actual date;
- "month" only when the line says it is for THIS month (the month today falls in). A line naming a later month stays "season" — put the month name in "note";
- "week" only when the line says it must happen this week;
- "someday" for a wish with no timeframe; "inbox" only for a clear capture.`,
  year: `This is a YEAR page: the user's goals and intentions for the year. There is no calendar; do not place items on dates. "day" for an item is:
- "goal" for a goal, theme, or outcome for the year — the default on this page ("Run a half marathon", "Finish the basement", "Read 20 books");
- "season" for a concrete task the page places in the coming months;
- "someday" for a wish with no timeframe;
- "inbox" only for a clear capture.
Keep a goal's title as the outcome, not an action: "Half marathon in October", not "Sign up for a half marathon".`,
}

export function buildPagePrompt(calendar: CalendarDay[], members: Member[], today: string, altitude: PageAltitude = 'week'): string {
  const calendarLines = calendar.map((c) => `- ${c.ymd} (${c.weekday})`).join('\n')
  const memberLines = members.length
    ? members.map((m) => `- ${m.id}: ${m.name}${m.role ? ` (${m.role})` : ''}`).join('\n')
    : '(none)'
  return `You are the capture assistant for Symphony, a personal task app. The user keeps a handwritten daily scratchpad on an e-ink tablet and has exported a page. A scratchpad page mixes registers: some lines are things to do, some are notes and reference and thinking, and some are simply hard to read. Sort the page into those three registers. Do not force everything into tasks.

Today is ${today}.${calendar.length ? ` The ONLY dates a task may be placed on (day headers like "Mon" or "Tue 8/18" map to these):
${calendarLines}` : ''}

${ALTITUDE_GUIDE[altitude]}

Household members (id: name, role when known) — assign a task ONLY when the line clearly names the person who will DO it (e.g. "Iris: return library books"):
${memberLines}

A name on a line says who the line is ABOUT; it is the assignee only if that person will do the work themselves. A child does their own homework, practice, reading and chores ("Liam: finish science poster" -> Liam). Appointments, doctor calls, pickups, forms, errands and purchases FOR a child are done by an adult: leave assignee_id null and keep the child's name in the title ("Mia: dentist 10am" -> "Take Mia to dentist", assignee_id null; "call Dr. Park re Mia's inhaler" -> assignee_id null). A member listed without a role is an adult. When no one is named, assignee_id is null.

Respond with ONLY a JSON object (no markdown fences, no prose):

{
  "items": [
    {
      "title": "Short imperative task title, cleaned up from the handwriting",
      "day": "one of the placements described above: a YYYY-MM-DD date${altitude === 'year' ? ', \\"goal\\"' : ''}, \\"week\\", \\"month\\", \\"season\\", \\"someday\\", or \\"inbox\\"",
      "time": "\\"HH:MM\\" in 24-hour form if the line names a clock time (\\"2pm\\" -> \\"14:00\\", \\"7:30\\" -> \\"19:30\\"), otherwise null",
      "assignee_id": "member id from the list above, or null",
      "note": "extra detail written on that line beyond the action itself (phone number, store, quantity, a constraint like 'before 3pm'), or null"
    }
  ],
  "notes": [
    { "title": "Short heading naming what this is about", "content": "The prose as written, lightly cleaned up. Keep the user's words." }
  ],
  "unclear": ["a line you could not read confidently, transcribed as your best guess"]
}

Rules:
- A line naming an action — something to do, obtain, decide, or contact — is an ITEM. One item per distinct action. Do not invent, do not merge.
- A clock time on an item line ("Dentist 2pm", "soccer 6", "movie night 7pm") goes in "time", NOT in "note" and NOT left in the title. A time written on paper is the appointment; burying it in a note turns a 2pm appointment into an all-day reminder.
- A bare hour with no am/pm on a household page means the EVENING when it is 1 through 6 ("soccer 6" -> "18:00"). 7 and above, and anything with am/pm written, take the hour as written.
- An item with a time must also have a "day". If the line names a time but no day, use today's date from the calendar above.
- A paragraph, a list of facts, a caption, a piece of reasoning, a phone number or address with no action attached, is a NOTE.
- A line you cannot read confidently goes in UNCLEAR, verbatim best guess. NEVER promote a guess to an item — a wrong task is worse than an unread line.
- Skip crossed-out lines and anything ticked or checked. It was already done on paper.
- Skip page titles, dates written as headers, decorations, and doodles.
- A day name with no date (e.g. "Wed") means the NEXT such weekday in the calendar above.
- A page-level heading naming the period ("October", "Fall 2026", "Week of Sept 7", "2026") is a title, not an item.
- If a named day is NOT in the calendar (e.g. a past day), use "${defaultPlacement(altitude)}".
- If the page holds nothing at all, return {"items":[],"notes":[],"unclear":[]}.`
}

function parseItems(raw: unknown, calendar: Set<string>, memberIds: Set<string>, altitude: PageAltitude): PageItemRaw[] {
  if (!Array.isArray(raw)) return []
  const out: PageItemRaw[] = []
  for (const entry of raw.slice(0, MAX_ITEMS)) {
    const e = entry as Partial<PageItemRaw>
    if (typeof e.title !== 'string' || !e.title.trim()) continue
    let day = typeof e.day === 'string' ? e.day : 'inbox'
    // A goal is a year-page placement only; elsewhere it is a wish.
    if (day === 'goal' && altitude !== 'year') day = 'someday'
    // Out-of-window degrades to the page's own altitude rather than being
    // dropped — the review sheet lets the user fix it, and a silently
    // vanished line is worse.
    if (day !== 'goal' && !HORIZON_DAYS.has(day) && !(YMD.test(day) && calendar.has(day))) day = defaultPlacement(altitude)
    // A time only means something on a real date. A horizon placement has
    // no day to hang it on, so it is dropped rather than half-applied.
    const time = typeof e.time === 'string' && HHMM.test(e.time.trim()) && YMD.test(day)
      ? e.time.trim()
      : null
    out.push({
      title: e.title.trim().slice(0, 200),
      day,
      time,
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
export function parsePageResponse(raw: string, calendar: Set<string>, memberIds: Set<string>, altitude: PageAltitude = 'week'): PageParseResult {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const parsed = JSON.parse(stripped) as { items?: unknown; notes?: unknown; unclear?: unknown }
  return {
    items: parseItems(parsed.items, calendar, memberIds, altitude),
    notes: parseNotes(parsed.notes),
    unclear: parseUnclear(parsed.unclear),
  }
}
