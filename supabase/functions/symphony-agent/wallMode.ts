// WALL MODE — the full Symphony agent on the kitchen wall, family layer only
// (Kitchen wall v2, stage 2).
//
// The wall is signed in as one adult (a real user JWT), but whoever stands in
// the kitchen is talking: a partner, a child, a guest. So with
// `surface: 'wall'` the agent:
//  - reads ONLY what the household shares. "Family-visible" is the wall's own
//    rule (src/hooks/useWallData.ts): a task, routine or project whose life
//    area is Family (context = 'family'; Family is the one shared domain,
//    src/lib/domains.ts, and Work/Personal are private whatever their stored
//    scope). Calendar events are family when their calendar is mapped to the
//    family domain and to no other (the wall's fetchEvents(..., 'family'));
//    lists when visibility = 'family'. Everything else is closed. The
//    filter is applied to the database client every tool reads through
//    (fenceDb), so private rows never reach the model, and every count a tool
//    reports is counted from the fenced rows.
//  - writes directly only what the wall already writes itself: a line on a
//    family list (groceries) and a scratchpad note / talk-about. Every other
//    change is a proposal on the change card (symphony_propose_changes), which
//    a grown-up approves.
//
// Nothing here applies when `surface` is absent: toolsForSurface,
// systemForSurface and fenceDb hand back exactly what they were given.

export type Surface = 'wall'

/** The request's `surface`. Absent → the desktop/phone agent, unchanged. */
export function parseSurface(raw: unknown): { surface: Surface | null } | { error: string } {
  if (raw === undefined || raw === null) return { surface: null }
  if (raw === 'wall') return { surface: 'wall' }
  return { error: 'surface must be "wall" when given' }
}

export const SCRATCHPAD_TOOL = {
  name: 'symphony_add_to_scratchpad',
  description: 'Post to the family scratchpad on the kitchen wall. kind "talk" puts it on the talk-about list (anything social or asking permission, e.g. "Can Max come over Saturday?"); kind "note" is a plain note for everyone. Saved at once; the wall offers Undo.',
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'One short line in the speaker\'s own words, e.g. "Can Max come over Saturday?"' },
      kind: { type: 'string', enum: ['talk', 'note'] },
    },
    required: ['text', 'kind'],
  },
}

/** What the wall may read: every one goes through the family fence. */
export const WALL_READ_TOOLS: ReadonlySet<string> = new Set([
  'symphony_read_week',
  'symphony_list_tasks',
  'symphony_list_routines',
  'symphony_list_projects',
  'symphony_list_household_members',
  'symphony_daily_summary',
  'symphony_list_events',
  'symphony_list_lists',
  'symphony_get_list_items',
])

/** The only direct writes on the wall: what the wall already saves itself. */
export const WALL_WRITE_TOOLS: ReadonlySet<string> = new Set([
  'symphony_add_list_item',
  SCRATCHPAD_TOOL.name,
])

/** Shown on the wall, never written: the change card and pointing. */
export const WALL_SHOW_TOOLS: ReadonlySet<string> = new Set([
  'symphony_propose_changes',
  'symphony_point',
])

export const WALL_TOOL_NAMES: ReadonlySet<string> = new Set([...WALL_READ_TOOLS, ...WALL_WRITE_TOOLS, ...WALL_SHOW_TOOLS])

/** May this tool run for this surface? Desktop: anything it was offered. */
export function toolAllowed(name: string, surface: Surface | null): boolean {
  return !surface || WALL_TOOL_NAMES.has(name)
}

/** The Symphony tools to offer. Desktop gets the very same list back. */
export function toolsForSurface<T extends { name?: string }>(tools: readonly T[], surface: Surface | null): readonly T[] {
  if (!surface) return tools
  return [...tools.filter((t) => !!t.name && WALL_TOOL_NAMES.has(t.name)), SCRATCHPAD_TOOL as unknown as T]
}

export const WALL_PROMPT_SECTION = `On the kitchen wall (this conversation). These rules override anything above.
- You are talking out loud on the family's kitchen wall to whoever is standing there: a parent, a child, a guest. Do not assume it is Scott. Answer in one or two short spoken sentences, even when asked for everything (summarise; offer more): no lists, no markdown, no emoji; times as people say them ("6:30"). Say nothing before your tool calls; speak once, at the end.
- You see only what the household shares: family tasks, family routines, the family calendars, family lists and the scratchpad. Work and personal items, email, notes and goals are not available here. Never mention, hint at or count anything private. If asked about work or personal plans, say the wall only shows the family's plans.
- Never change plans yourself. To move, add, assign or set aside a family task, call symphony_propose_changes; the change card waits for a grown-up to approve it. Say it is on the card waiting for approval; never say it is done.
- Routines (like Feed Jax dinner) cannot go on the change card yet. Do not try: say the wall can't move a routine yet and offer to put the request on the talk-about list.
- Anything social or asking permission ("can Max come over", "can I have a sleepover") goes on the talk-about list with symphony_add_to_scratchpad (kind "talk"); then say it is on the list to talk about. Never grant or refuse permission yourself.
- The only things you save yourself: a line on a family list (groceries, with symphony_add_list_item) and a scratchpad note or talk-about.
- Use web search only for general facts (a cooking time, store hours), never to look up people in the household.`

/** The system prompt for this surface. Desktop gets the very same string back. */
export function systemForSurface(base: string, surface: Surface | null): string {
  return surface ? `${base}\n\n${WALL_PROMPT_SECTION}` : base
}

/** The wall's clock line: "tonight" and "tomorrow" are the household's, not UTC's. */
export function wallClockLine(now: Date, tz: string): string {
  const when = now.toLocaleString('en-US', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return `\n(On the kitchen wall. It is now ${when}, household time (${tz}). Times in tool results are UTC: convert them to household time before you say them.)`
}

// ── The fence ──────────────────────────────────────────────────────

export interface WallFence {
  /** Calendars mapped to the family domain (and to no other domain). */
  familyCalendarIds: string[]
  /** Lists with visibility 'family'. */
  familyListIds: string[]
}

/** A value no real id equals: an empty `in` list must still match nothing. */
const NO_ID = '00000000-0000-0000-0000-000000000000'
const nonEmpty = (ids: string[]) => (ids.length ? ids : [NO_ID])

/** Tables whose rows carry a life area (context). */
const LAYERED_TABLES = new Set(['tasks', 'routines', 'projects'])
/** Tables with nothing private in them: the roster, the week start, the
 *  scratchpad (household-shared by RLS: src/lib/wall/addScratchpadNote.ts). */
const OPEN_TABLES = new Set(['family_members', 'households', 'scratchpad_notes'])
const INSERT_TABLES = new Set(['list_items', 'scratchpad_notes'])

// deno-lint-ignore no-explicit-any
type Query = any

/** The family filter for one table's read, or null when the table is closed. */
export function familyFilter(table: string, q: Query, fence: WallFence): Query | null {
  if (LAYERED_TABLES.has(table)) return q.eq('context', 'family')
  if (table === 'calendar_events') return q.in('calendar_id', nonEmpty(fence.familyCalendarIds))
  if (table === 'lists') return q.eq('visibility', 'family')
  if (table === 'list_items') return q.in('list_id', nonEmpty(fence.familyListIds))
  if (OPEN_TABLES.has(table)) return q
  return null
}

const refused = (what: string) => new Error(`${what} is not available on the kitchen wall`)

/**
 * The database client the wall's tools read through. Every select on a table
 * is narrowed to the family layer; tables with no family layer (goals, notes,
 * contacts, attachments …) refuse; updates and deletes refuse; inserts are
 * allowed only for a family list's items and the scratchpad. Desktop (no
 * fence) gets the very same client back.
 */
export function fenceDb<D extends { from: (table: string) => Query }>(db: D, fence: WallFence | null): D {
  if (!fence) return db
  const fenced = {
    from(table: string) {
      return {
        select(...args: unknown[]) {
          const q = familyFilter(table, db.from(table).select(...args), fence)
          if (!q) throw refused(`Reading ${table}`)
          return q
        },
        insert(rows: unknown, ...rest: unknown[]) {
          if (!INSERT_TABLES.has(table)) throw refused(`Saving to ${table}`)
          if (table === 'list_items') {
            const all = Array.isArray(rows) ? rows : [rows]
            const ok = all.every((r) => !!r && typeof r === 'object' && fence.familyListIds.includes(String((r as { list_id?: unknown }).list_id)))
            if (!ok) throw refused('That list')
          }
          return db.from(table).insert(rows, ...rest)
        },
        update() { throw refused(`Changing ${table}`) },
        upsert() { throw refused(`Changing ${table}`) },
        delete() { throw refused(`Deleting from ${table}`) },
      }
    },
    rpc() { throw refused('That search') },
  }
  return fenced as unknown as D
}

/** Read the fence's id sets as the signed-in user. Fails closed: an error
 *  leaves a set empty, which matches nothing. */
export async function loadWallFence(db: { from: (table: string) => Query }, userId: string): Promise<WallFence> {
  const [maps, lists] = await Promise.all([
    db.from('calendar_domain_mappings').select('calendar_id, domain').eq('user_id', userId),
    db.from('lists').select('id').eq('visibility', 'family'),
  ])
  return {
    familyCalendarIds: maps.error ? [] : familyCalendars(maps.data ?? []),
    familyListIds: lists.error ? [] : ((lists.data ?? []) as { id: string }[]).map((l) => l.id),
  }
}

/** Calendars mapped to family and never to work or personal. */
export function familyCalendars(rows: { calendar_id: string; domain: string | null }[]): string[] {
  const elsewhere = new Set(rows.filter((r) => r.domain !== 'family').map((r) => r.calendar_id))
  return [...new Set(rows.filter((r) => r.domain === 'family' && !elsewhere.has(r.calendar_id)).map((r) => r.calendar_id))]
}

/** symphony_add_to_scratchpad: the wall's own scratchpad write (spoken: no
 *  author), through the fenced client. */
export async function addToScratchpad(db: { from: (table: string) => Query }, userId: string, input: Record<string, unknown>): Promise<string> {
  const text = typeof input.text === 'string' ? input.text.trim().slice(0, 500) : ''
  const kind = input.kind === 'note' ? 'note' : input.kind === 'talk' ? 'talk' : null
  if (!text || !kind) return 'Error: text and kind ("talk" or "note") are required'
  try {
    const { data, error } = await db.from('scratchpad_notes')
      .insert({ user_id: userId, body: text, kind, author_member_id: null })
      .select('id, body, kind').single()
    if (error) return `Error: ${error.message}`
    return JSON.stringify(data)
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`
  }
}
