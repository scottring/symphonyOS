// Pure prompt-building and response-parsing for parse-page. Deno-free so
// Vitest runs it (vitest.config.ts includes supabase/functions/**).

export interface CalendarDay { ymd: string; weekday: string }
/** `role` is the household role_label ("parent", "child", …) when known. It
 *  tells the model who can actually DO a line — a child's name on "dentist
 *  10am" says who the appointment is about, not who drives. */
export interface Member { id: string; name: string; role?: string | null }
/** A repeating line ("every Sat", "Sat mornings thru Nov"). */
export interface PageRecurringRaw { days: string[]; until: string | null }
export interface PageItemRaw {
  title: string
  day: string
  time: string | null
  assignee_id: string | null
  note: string | null
  /** The real date named on the line, when it falls outside the calendar
   *  window (or when the model reports one explicitly) — kept alongside
   *  "day" so the review sheet can show it instead of a silently moved date. */
  date_hint: string | null
  /** "task" (default) — a thing to do; "dayfact" — a fact about a day
   *  ("Labor Day, no school"); "recurring" — a repeating line. */
  kind: 'task' | 'dayfact' | 'recurring'
  recurring: PageRecurringRaw | null
  phone: string | null
}

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
export interface PageParseResult { items: PageItemRaw[]; notes: PageNoteRaw[]; unclear: string[]; page_title: string | null }

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
- "goal" for a line the page marks as a goal, intention, or outcome for the month rather than a thing to do (under a "Goals" heading, or phrased as an outcome: "Read more", "Be home for dinner");
- "week" only if the line says it must happen this week or in the next few days;
- "season" for something explicitly pushed past this month; "someday" for a wish with no timeframe;
- "inbox" only for a line that is clearly a capture, not a plan.`,
  season: `This is a SEASON page: the user is planning the next three months. "day" for an item is:
- "season" for a line with no date — the default on this page;
- "goal" for a line the page marks as a goal, intention, or outcome for the season rather than a thing to do (under a "Goals" heading, or phrased as an outcome);
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

A name on a line says who the line is ABOUT; it is the assignee only if that person will do the work themselves. A child does their own homework, practice, reading and chores ("Liam: finish science poster" -> Liam) — the verb is theirs when it is finish, do, study, practice, read, homework, chores, soccer, piano, game, lesson, or club. Appointments, doctor calls, pickups, forms, errands and purchases FOR a child are done by an adult: leave assignee_id null and keep the child's name in the title ("Mia: dentist 10am" -> "Take Mia to dentist", assignee_id null; "call Dr. Park re Mia's inhaler" -> assignee_id null). A member listed without a role is an adult. When no one is named, assignee_id is null.

Respond with ONLY a JSON object (no markdown fences, no prose):

{
  "items": [
    {
      "title": "Short imperative task title, cleaned up from the handwriting",
      "day": "one of the placements described above: a YYYY-MM-DD date${altitude !== 'week' ? ', \\"goal\\"' : ''}, \\"week\\", \\"month\\", \\"season\\", \\"someday\\", or \\"inbox\\"",
      "date_hint": "if the line names a real date that falls outside the calendar above, that date as YYYY-MM-DD; otherwise null",
      "time": "\\"HH:MM\\" in 24-hour form if the line names a clock time (\\"2pm\\" -> \\"14:00\\", \\"7:30\\" -> \\"19:30\\"), otherwise null",
      "assignee_id": "member id from the list above, or null",
      "kind": "\\"task\\" (default) for a thing to do, \\"dayfact\\" for a fact about a day, or \\"recurring\\" for a line that repeats",
      "recurring": "when kind is \\"recurring\\": {\\"days\\": [\\"sat\\"], \\"until\\": \\"YYYY-MM-DD\\" or null}; otherwise null",
      "phone": "a phone number written on the line, or null",
      "note": "extra detail written on that line beyond the action itself (store, quantity, a constraint like 'before 3pm'), or null"
    }
  ],
  "notes": [
    { "title": "Short heading naming what this is about", "content": "The prose as written, lightly cleaned up. Keep the user's words." }
  ],
  "unclear": ["a line you could not read confidently, transcribed as your best guess"],
  "page_title": "the page's own heading as written (e.g. \\"Fall 2026\\", \\"Week of Sept 7\\"), or null"
}

Rules:
- A line naming an action — something to do, obtain, decide, or contact — is an ITEM. One item per distinct action. Do not invent, do not merge.
- A clock time on an item line ("Dentist 2pm", "soccer 6", "movie night 7pm") goes in "time", NOT in "note" and NOT left in the title. A time written on paper is the appointment; burying it in a note turns a 2pm appointment into an all-day reminder.
- A bare hour with no am/pm on a household page means the EVENING when it is 1 through 6 ("soccer 6" -> "18:00"). 7 and above, and anything with am/pm written, take the hour as written.
- An item with a time must also have a "day". If the line names a time but no day, use today's date from the calendar above.
- A paragraph, a list of facts, a caption, a piece of reasoning, a phone number or address with no action attached, is a NOTE.
- A line you cannot read confidently goes in UNCLEAR, verbatim best guess. NEVER promote a guess to an item — a wrong task is worse than an unread line.
- Skip crossed-out lines and anything ticked or checked. It was already done on paper.
- Skip decorations and doodles as items.
- A day name with no date (e.g. "Wed") means the NEXT such weekday in the calendar above.
- A page-level heading naming the period ("October", "Fall 2026", "Week of Sept 7", "2026") is the page's title, not an item — put it in "page_title", not in "items".
- If a named day is NOT in the calendar (e.g. a past day), use "${defaultPlacement(altitude)}".
- If a line names a date that is NOT in the calendar, do NOT move it to a nearby date. Use "${defaultPlacement(altitude)}" for "day" and put the real date in "date_hint" as YYYY-MM-DD.
- A line that states a fact about a day ("Labor Day, no school", "half day", a holiday) is kind "dayfact", placed on that day.
- A line that repeats ("every Sat", "Sat mornings thru Nov", "weekly") is kind "recurring" with "recurring": {"days": ["sat"], "until": "YYYY-MM-DD" or null}; keep "time" if written.
- A star, underline, circle or arrow is emphasis, not content — never write "starred" or "important" as a note.
- A phone number on the line goes in "phone", not in "note".
- Return "page_title": the page's heading as written, or null.
- If the page holds nothing at all, return {"items":[],"notes":[],"unclear":[],"page_title":null}.`
}

const KINDS = new Set(['task', 'dayfact', 'recurring'])

function parseRecurring(raw: unknown): PageRecurringRaw | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<PageRecurringRaw>
  if (!Array.isArray(r.days)) return null
  const days = r.days.filter((d): d is string => typeof d === 'string' && d.trim().length > 0).map((d) => d.trim().toLowerCase())
  if (!days.length) return null
  const until = typeof r.until === 'string' && YMD.test(r.until.trim()) ? r.until.trim() : null
  return { days, until }
}

function parseItems(raw: unknown, calendar: Set<string>, memberIds: Set<string>, altitude: PageAltitude): PageItemRaw[] {
  if (!Array.isArray(raw)) return []
  const out: PageItemRaw[] = []
  for (const entry of raw.slice(0, MAX_ITEMS)) {
    const e = entry as Partial<PageItemRaw>
    if (typeof e.title !== 'string' || !e.title.trim()) continue
    let day = typeof e.day === 'string' ? e.day : 'inbox'
    // A goal line: a year goal on a year page, a goal on the list of a month
    // or season page. A week page has no goals, so there it is a wish.
    if (day === 'goal' && altitude === 'week') day = 'someday'
    // An explicit date_hint from the model survives regardless of what
    // happens to "day" below.
    let dateHint = typeof e.date_hint === 'string' && YMD.test(e.date_hint.trim()) ? e.date_hint.trim() : null
    // Out-of-window degrades to the page's own altitude rather than being
    // dropped — the review sheet lets the user fix it, and a silently
    // vanished line is worse. The real date is NEVER discarded: it survives
    // in date_hint so the review sheet can show it instead of a clamp.
    if (day !== 'goal' && !HORIZON_DAYS.has(day) && !(YMD.test(day) && calendar.has(day))) {
      if (YMD.test(day) && !dateHint) dateHint = day
      day = defaultPlacement(altitude)
    }
    const kind = typeof e.kind === 'string' && KINDS.has(e.kind) ? (e.kind as PageItemRaw['kind']) : 'task'
    // A time only means something on a real date — except a recurring line,
    // which names a time of day with no date to hang it on at all.
    const time = typeof e.time === 'string' && HHMM.test(e.time.trim()) && (YMD.test(day) || kind === 'recurring')
      ? e.time.trim()
      : null
    out.push({
      title: e.title.trim().slice(0, 200),
      day,
      time,
      assignee_id: typeof e.assignee_id === 'string' && memberIds.has(e.assignee_id) ? e.assignee_id : null,
      note: typeof e.note === 'string' && e.note.trim() ? e.note.trim().slice(0, 1000) : null,
      date_hint: dateHint,
      kind,
      recurring: kind === 'recurring' ? parseRecurring(e.recurring) : null,
      phone: typeof e.phone === 'string' && e.phone.trim() ? e.phone.trim().slice(0, 40) : null,
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
  const parsed = JSON.parse(stripped) as { items?: unknown; notes?: unknown; unclear?: unknown; page_title?: unknown }
  return {
    items: parseItems(parsed.items, calendar, memberIds, altitude),
    notes: parseNotes(parsed.notes),
    unclear: parseUnclear(parsed.unclear),
    page_title: typeof parsed.page_title === 'string' && parsed.page_title.trim() ? parsed.page_title.trim().slice(0, 120) : null,
  }
}
