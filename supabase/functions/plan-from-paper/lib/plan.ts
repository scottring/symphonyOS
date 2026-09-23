// Pure core of plan-from-paper: types, the response schema, prompts and
// validation. Deno-free so Vitest runs it (vitest.config.ts includes
// supabase/functions/**). The client imports the same types.
//
// "Help me turn this into a plan": transcription is the first step, then a
// PROPOSED plan the user edits and discusses. Nothing here writes — the
// client saves only what the user approves.

export type Level = 'year' | 'season' | 'month' | 'week' | 'someday' | 'none'
export type PeriodLevel = 'year' | 'season' | 'month' | 'week' | 'unknown'
export type ItemKind = 'goal' | 'task' | 'routine' | 'note'
export type RelationType = 'derived_from' | 'supports' | 'part_of'
export type TargetKind = 'item' | 'year_goal' | 'period_goal' | 'task'
export type FlagType = 'uncertain_handwriting' | 'uncertain_date' | 'possible_duplicate' | 'ambiguous_kind'

export interface Line { id: string; text: string; uncertain: boolean; uncertainty: string | null; struck: boolean }
export interface Page {
  page: number
  image: number
  side: 'left' | 'right' | 'single'
  heading: string | null
  period: { level: PeriodLevel; label: string; start: string | null; end: string | null }
  lines: Line[]
}
export interface Relationship { type: RelationType; target_kind: TargetKind; target_id: string; target_label: string; reason: string }
export interface Flag { type: FlagType; detail: string; target_id: string | null }
export interface RoutineDetail { cadence: string; time: string | null; who: string | null; steps: string[] }
export interface Item {
  id: string
  kind: ItemKind
  /** The page's own words, joined across wrapped lines. Never paraphrased. */
  original: string
  /** What would be saved — the original wording unless the user edits it. */
  title: string
  page: number
  source_lines: string[]
  placement: { level: Level; label: string; start: string | null }
  /** A date as written on the line ("9/21", "Oct 16th"), and the resolved day when sure. */
  date_text: string | null
  date: string | null
  relationships: Relationship[]
  flags: Flag[]
  routine: RoutineDetail | null
  why: string | null
}
export interface Analysis {
  summary: string
  pages: Page[]
  items: Item[]
  questions: string[]
}
export interface RevisionResult { reply: string; changes: string[]; analysis: Analysis }

/** What the household already has — so a line is linked or flagged, not duplicated. */
export interface PlanContext {
  today: string
  year: number
  /** The household's seasons around today, e.g. Fall 2026 = 2026-09-01..2026-11-30. */
  seasons: { label: string; start: string; end: string }[]
  members: { id: string; name: string; role: string | null }[]
  yearGoals: { id: string; title: string }[]
  periodGoals: { id: string; title: string; level: 'season' | 'month'; start: string }[]
  openTasks: { id: string; title: string; placement: string }[]
  routines: { id: string; title: string }[]
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })
const str = { type: 'string' }
const obj = (properties: Record<string, unknown>) => ({
  type: 'object', additionalProperties: false, properties, required: Object.keys(properties),
})

const LINE = obj({ id: str, text: str, uncertain: { type: 'boolean' }, uncertainty: nullable(str), struck: { type: 'boolean' } })
const PAGE = obj({
  page: { type: 'integer' },
  image: { type: 'integer' },
  side: { type: 'string', enum: ['left', 'right', 'single'] },
  heading: nullable(str),
  period: obj({ level: { type: 'string', enum: ['year', 'season', 'month', 'week', 'unknown'] }, label: str, start: nullable(str), end: nullable(str) }),
  lines: { type: 'array', items: LINE },
})
const ITEM = obj({
  id: str,
  kind: { type: 'string', enum: ['goal', 'task', 'routine', 'note'] },
  original: str,
  title: str,
  page: { type: 'integer' },
  source_lines: { type: 'array', items: str },
  placement: obj({ level: { type: 'string', enum: ['year', 'season', 'month', 'week', 'someday', 'none'] }, label: str, start: nullable(str) }),
  date_text: nullable(str),
  date: nullable(str),
  relationships: {
    type: 'array',
    items: obj({
      type: { type: 'string', enum: ['derived_from', 'supports', 'part_of'] },
      target_kind: { type: 'string', enum: ['item', 'year_goal', 'period_goal', 'task'] },
      target_id: str, target_label: str, reason: str,
    }),
  },
  flags: {
    type: 'array',
    items: obj({
      type: { type: 'string', enum: ['uncertain_handwriting', 'uncertain_date', 'possible_duplicate', 'ambiguous_kind'] },
      detail: str, target_id: nullable(str),
    }),
  },
  routine: nullable(obj({ cadence: str, time: nullable(str), who: nullable(str), steps: { type: 'array', items: str } })),
  why: nullable(str),
})
export const ANALYSIS_SCHEMA = obj({
  summary: str,
  pages: { type: 'array', items: PAGE },
  items: { type: 'array', items: ITEM },
  questions: { type: 'array', items: str },
})
// A revision returns only what changes, never the whole proposal: the full
// analysis schema nested here compiles to a grammar the API refuses as too
// large (2026-09-23), and re-emitting 50 unchanged items costs ~18k output
// tokens a turn. applyRevision merges it on the server.
export const REVISION_SCHEMA = obj({
  reply: str,
  changes: { type: 'array', items: str },
  upserts: { type: 'array', items: ITEM },
  remove: { type: 'array', items: str },
  line_fixes: { type: 'array', items: obj({ line_id: str, text: str, uncertain: { type: 'boolean' } }) },
  questions: nullable({ type: 'array', items: str }),
})

export interface RevisionPatch {
  upserts?: unknown[]
  remove?: unknown[]
  line_fixes?: { line_id?: unknown; text?: unknown; uncertain?: unknown }[]
  questions?: unknown[] | null
}

/** The current proposal with a revision applied: removed ids dropped, each
 *  upsert replacing the item with its id (or appended), transcription lines
 *  corrected. Normalised again, so the result is as safe as an analysis. */
export function applyRevision(current: Analysis, patch: RevisionPatch): Analysis {
  const remove = new Set((Array.isArray(patch.remove) ? patch.remove : []).filter((x): x is string => typeof x === 'string'))
  const upserts = (Array.isArray(patch.upserts) ? patch.upserts : []) as Item[]
  const byId = new Map(upserts.filter((u) => u && typeof u.id === 'string').map((u) => [u.id, u]))
  const items: unknown[] = current.items.filter((i) => !remove.has(i.id)).map((i) => byId.get(i.id) ?? i)
  const kept = new Set(current.items.map((i) => i.id))
  for (const u of upserts) if (u && typeof u.id === 'string' && !kept.has(u.id) && !remove.has(u.id)) items.push(u)
  const fixes = new Map((Array.isArray(patch.line_fixes) ? patch.line_fixes : [])
    .filter((f) => f && typeof f.line_id === 'string' && typeof f.text === 'string')
    .map((f) => [f.line_id as string, f]))
  const pages = current.pages.map((p) => ({
    ...p,
    lines: p.lines.map((l) => {
      const f = fixes.get(l.id)
      return f ? { ...l, text: f.text as string, uncertain: !!f.uncertain, uncertainty: f.uncertain ? l.uncertainty : null } : l
    }),
  }))
  const questions = Array.isArray(patch.questions) ? patch.questions : current.questions
  return normalizeAnalysis({ summary: current.summary, pages, items, questions })
}

function contextBlock(ctx: PlanContext): string {
  const list = <T,>(rows: T[], fmt: (r: T) => string) => (rows.length ? rows.map(fmt).join('\n') : '(none)')
  return `Today is ${ctx.today}. The planning year is ${ctx.year}.

Household seasons (label: first day .. last day):
${list(ctx.seasons, (s) => `- ${s.label}: ${s.start} .. ${s.end}`)}

Household members (id: name, role):
${list(ctx.members, (m) => `- ${m.id}: ${m.name}${m.role ? ` (${m.role})` : ''}`)}

Existing YEAR goals — keep them; link lines that serve one ("supports", target_kind "year_goal"):
${list(ctx.yearGoals, (g) => `- ${g.id}: ${g.title}`)}

Existing season and month goals (target_kind "period_goal"):
${list(ctx.periodGoals, (g) => `- ${g.id}: ${g.title} (${g.level} from ${g.start})`)}

Existing open tasks — a line that repeats one is a possible duplicate (flag it, target_id = that task's id):
${list(ctx.openTasks, (t) => `- ${t.id}: ${t.title} [${t.placement}]`)}

Existing routines (a routine line that repeats one is a possible duplicate):
${list(ctx.routines, (r) => `- ${r.id}: ${r.title}`)}`
}

const RULES = `How to read and propose:

1. TRANSCRIBE FIRST. For every page, list every line in order, exactly as written — spelling, abbreviations, capitals and punctuation as on the page. Continue a wrapped line into one line when the handwriting clearly continues it. Give each line an id "p{page}-l{n}". Mark "uncertain": true with a short "uncertainty" note when any word is a guess. Mark "struck": true for crossed-out words or lines (keep their text).
2. A two-page spread in one photo is TWO pages ("side" left and right). The user's note says what each page is; believe it over your own guess.
3. Each page's "period": the level and dates it plans. A season page's start/end come from the household seasons; a month page is that month of the planning year. Use "unknown" rather than inventing.
4. PROPOSE one item per distinct line of intent. Kinds:
   - "goal": an outcome or intention for the page's period ("Calmer mornings", "Read together more"). A goal's placement is the page's period.
   - "task": a concrete action someone can finish ("Buy a rain barrel", "Book the piano tuner").
   - "routine": a repeating practice or schedule ("Plan weekly on Sunday nights", a bedtime routine with times). Fill "routine" with cadence, time, who and steps as written. A routine is only proposed — it will not be switched on.
   - "note": reference, context, a sketch or thinking — not something to do.
   Do not force every task under a goal. Do not invent items the page does not hold. Never drop a line silently: a line that is not an item stays in the transcription, and an unreadable line is flagged, not guessed into a task.
5. "original" is the item's words as transcribed (joined lines allowed). "title" starts identical to "original". Do not rephrase, summarise or fix grammar in "title".
6. PLACEMENT: the page's own period ("season" + the season's label/start, "month" + the month label/start as YYYY-MM-01, "year" + the year label/start as YYYY-01-01). Use "week" only when the line says this week, "someday" only for an explicit wish with no time, "none" for notes. Never place anything on a specific day — a date on the line goes in "date_text" (as written) and "date" (YYYY-MM-DD, only when unambiguous in the planning year; otherwise null and flag "uncertain_date").
7. RELATIONSHIPS, stated explicitly with a one-line "reason":
   - "derived_from": a month item that carries a season item down (October's "Draft the garden plan" from Autumn's "Plan the garden"). target_kind "item", target_id the season item's id.
   - "supports": an item that serves a goal — a goal proposed here (target_kind "item") or an existing year/season/month goal (target_kind "year_goal" / "period_goal", target_id the listed id). Only when the connection is clear.
   - "part_of": a step under another proposed item (a routine's detail, a sub-point).
8. FLAGS: "uncertain_handwriting" (any guessed word), "uncertain_date", "possible_duplicate" (repeats an existing task/goal/routine — target_id its id — or another item on these pages — target_id that item id), "ambiguous_kind" (could be goal or task; say which you chose and why in "detail").
9. "questions": at most five short questions whose answers would change the plan (a date, whether a line is done). "summary": two or three sentences on what the pages hold.`

export function buildAnalysisPrompt(ctx: PlanContext, imageCount: number, instructions: string | null): string {
  return `You help a family turn photographed paper planning pages into a plan in Symphony, their planning app. There ${imageCount === 1 ? 'is 1 image' : `are ${imageCount} images`}, numbered in the order given.

${contextBlock(ctx)}

${instructions?.trim() ? `The user explains the pages:\n"""\n${instructions.trim()}\n"""\nFollow this explanation.` : 'The user gave no explanation; infer each page\'s period from its heading.'}

${RULES}`
}

export function buildRevisionPrompt(ctx: PlanContext, instructions: string | null): string {
  return `You help a family refine a plan proposed from their photographed paper pages. You have the transcription (the pages' own words) and the current proposal as JSON — the user may already have edited it by hand; keep their edits unless asked otherwise. Reply briefly and plainly in "reply", and list what you changed in "changes" (empty when you only answered).

Return ONLY what changes: in "upserts" the complete new version of every item you change or add, in "remove" the ids of items to drop, in "line_fixes" any corrected transcription lines (by line id), and in "questions" the updated open questions (null to keep them). Items you do not list stay exactly as they are.

Only change what the user asks for, and keep every item's "original" exactly as transcribed. Keep item ids stable; give a new item a new id. If the user corrects a reading, fix the transcription line (line_fixes) and the item together, and clear the matching flag. Nothing is saved until the user approves, so never say it was saved.

In "reply" and "changes", name items by their words ("Moved 'Buy a rain barrel' to October"), never by id. If a change would leave two items that say the same thing on one list, say so in "reply" and flag the pair "possible_duplicate" rather than silently merging them.

${contextBlock(ctx)}

${instructions?.trim() ? `The user's explanation of the pages:\n"""\n${instructions.trim()}\n"""` : ''}

${RULES}`
}

const LEVELS = new Set(['year', 'season', 'month', 'week', 'someday', 'none'])
const KINDS = new Set(['goal', 'task', 'routine', 'note'])
const YMD = /^\d{4}-\d{2}-\d{2}$/

/** Defensive normalisation on top of the schema: trims, dedupes ids, drops
 *  relationships pointing nowhere, and caps sizes, so a malformed reply can
 *  never reach the save. */
export function normalizeAnalysis(raw: unknown): Analysis {
  const a = (raw ?? {}) as Partial<Analysis>
  const pages: Page[] = (Array.isArray(a.pages) ? a.pages : []).slice(0, 8).map((p, i) => ({
    page: Number.isInteger(p?.page) ? p.page : i + 1,
    image: Number.isInteger(p?.image) ? p.image : 1,
    side: p?.side === 'left' || p?.side === 'right' ? p.side : 'single',
    heading: typeof p?.heading === 'string' && p.heading.trim() ? p.heading.trim() : null,
    period: {
      level: ['year', 'season', 'month', 'week'].includes(p?.period?.level as string) ? p.period.level : 'unknown',
      label: typeof p?.period?.label === 'string' ? p.period.label : '',
      start: typeof p?.period?.start === 'string' && YMD.test(p.period.start) ? p.period.start : null,
      end: typeof p?.period?.end === 'string' && YMD.test(p.period.end) ? p.period.end : null,
    },
    lines: (Array.isArray(p?.lines) ? p.lines : []).slice(0, 120).map((l, j) => ({
      id: typeof l?.id === 'string' && l.id ? l.id : `p${i + 1}-l${j + 1}`,
      text: typeof l?.text === 'string' ? l.text : '',
      uncertain: !!l?.uncertain,
      uncertainty: typeof l?.uncertainty === 'string' && l.uncertainty.trim() ? l.uncertainty.trim() : null,
      struck: !!l?.struck,
    })).filter((l) => l.text.trim()),
  }))

  const seen = new Set<string>()
  const items: Item[] = []
  for (const [i, it] of (Array.isArray(a.items) ? a.items : []).slice(0, 150).entries()) {
    if (!it || typeof it.original !== 'string' || !it.original.trim()) continue
    let id = typeof it.id === 'string' && it.id.trim() ? it.id.trim() : `i${i + 1}`
    while (seen.has(id)) id = `${id}-${i + 1}`
    seen.add(id)
    const level = LEVELS.has(it.placement?.level as string) ? it.placement.level : 'none'
    items.push({
      id,
      kind: KINDS.has(it.kind as string) ? it.kind : 'task',
      original: it.original.trim(),
      title: typeof it.title === 'string' && it.title.trim() ? it.title.trim() : it.original.trim(),
      page: Number.isInteger(it.page) ? it.page : 1,
      source_lines: (Array.isArray(it.source_lines) ? it.source_lines : []).filter((s): s is string => typeof s === 'string'),
      placement: {
        level,
        label: typeof it.placement?.label === 'string' ? it.placement.label : '',
        start: typeof it.placement?.start === 'string' && YMD.test(it.placement.start) ? it.placement.start : null,
      },
      date_text: typeof it.date_text === 'string' && it.date_text.trim() ? it.date_text.trim() : null,
      date: typeof it.date === 'string' && YMD.test(it.date) ? it.date : null,
      relationships: (Array.isArray(it.relationships) ? it.relationships : []).filter((r) =>
        r && ['derived_from', 'supports', 'part_of'].includes(r.type) && typeof r.target_id === 'string' && r.target_id)
        .map((r) => ({ type: r.type, target_kind: r.target_kind, target_id: r.target_id, target_label: r.target_label ?? '', reason: r.reason ?? '' })),
      flags: (Array.isArray(it.flags) ? it.flags : []).filter((f) =>
        f && ['uncertain_handwriting', 'uncertain_date', 'possible_duplicate', 'ambiguous_kind'].includes(f.type))
        .map((f) => ({ type: f.type, detail: f.detail ?? '', target_id: typeof f.target_id === 'string' ? f.target_id : null })),
      routine: it.routine && typeof it.routine === 'object'
        ? {
            cadence: typeof it.routine.cadence === 'string' ? it.routine.cadence : '',
            time: typeof it.routine.time === 'string' ? it.routine.time : null,
            who: typeof it.routine.who === 'string' ? it.routine.who : null,
            steps: (Array.isArray(it.routine.steps) ? it.routine.steps : []).filter((s): s is string => typeof s === 'string'),
          }
        : null,
      why: typeof it.why === 'string' && it.why.trim() ? it.why.trim() : null,
    })
  }
  // A relationship to an item that is not in the proposal points at nothing.
  const itemIds = new Set(items.map((i) => i.id))
  for (const it of items) it.relationships = it.relationships.filter((r) => r.target_kind !== 'item' || (itemIds.has(r.target_id) && r.target_id !== it.id))

  return {
    summary: typeof a.summary === 'string' ? a.summary : '',
    pages,
    items,
    questions: (Array.isArray(a.questions) ? a.questions : []).filter((q): q is string => typeof q === 'string').slice(0, 5),
  }
}

/** Stable error codes the client turns into plain, actionable messages. */
export type PlanErrorCode =
  | 'bad_request' | 'unauthorized' | 'forbidden' | 'image_unavailable' | 'model_busy' | 'model_refused'
  | 'reply_unreadable' | 'too_long' | 'server_config' | 'unknown'

export class PlanError extends Error {
  // Plain fields, not parameter properties: the client type-checks this file
  // under erasableSyntaxOnly.
  code: PlanErrorCode
  status: number
  constructor(code: PlanErrorCode, message: string, status = 500) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** Classify an Anthropic HTTP failure. 429/529 and 5xx are worth a retry. */
export function classifyModelHttpError(status: number): PlanError {
  if (status === 429 || status === 529 || status >= 500) return new PlanError('model_busy', `The reading service is busy (${status})`, 503)
  if (status === 413) return new PlanError('too_long', 'The images are too large to read together', 413)
  if (status === 400) return new PlanError('bad_request', 'The reading service rejected the request', 502)
  return new PlanError('unknown', `The reading service returned ${status}`, 502)
}

// ── Access and size checks ────────────────────────────────────────────────
// The endpoint is reachable by anyone holding a valid session, whatever the
// UI does, so it defends itself: a caller may only name images in their OWN
// folder (the service role signs the URL, so this check is the whole
// boundary), and every input is capped so a direct caller cannot inflate the
// model bill. It reads no household data server-side — the context below is
// what the caller's own RLS-filtered reads returned, used only as prompt text.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PAGE_PATH = new RegExp(`^(${UUID})/paper-plan/(${UUID})/[a-z0-9-]{1,64}\\.(jpg|jpeg|png|webp)$`)

/** True only for `<callerId>/paper-plan/<importId>/<name>.<image ext>` —
 *  no traversal, no other user's folder, no non-image objects. */
export function isOwnPagePath(path: unknown, userId: string): path is string {
  if (typeof path !== 'string' || path.length > 200) return false
  const m = PAGE_PATH.exec(path)
  return !!m && m[1] === userId.toLowerCase()
}

export const LIMITS = {
  images: 6,
  instructions: 4000,
  message: 4000,
  conversationTurns: 12,
  conversationChars: 2000,
  analysisJsonChars: 200_000,
  contextRows: 300,
  contextTitleChars: 200,
} as const

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.slice(0, n) : '')

/** The context, bounded and reduced to the fields the prompt uses. */
export function boundContext(raw: unknown): PlanContext | null {
  const c = raw as Partial<PlanContext> | null
  if (!c || typeof c.today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.today)) return null
  const rows = <T,>(v: unknown, map: (r: Record<string, unknown>) => T): T[] =>
    (Array.isArray(v) ? v : []).slice(0, LIMITS.contextRows).filter((r) => r && typeof r === 'object').map((r) => map(r as Record<string, unknown>))
  const t = LIMITS.contextTitleChars
  return {
    today: c.today,
    year: Number.isInteger(c.year) ? (c.year as number) : Number(c.today.slice(0, 4)),
    seasons: rows(c.seasons, (r) => ({ label: clip(r.label, 60), start: clip(r.start, 10), end: clip(r.end, 10) })).slice(0, 8),
    members: rows(c.members, (r) => ({ id: clip(r.id, 64), name: clip(r.name, 60), role: typeof r.role === 'string' ? clip(r.role, 30) : null })).slice(0, 20),
    yearGoals: rows(c.yearGoals, (r) => ({ id: clip(r.id, 64), title: clip(r.title, t) })),
    periodGoals: rows(c.periodGoals, (r) => ({ id: clip(r.id, 64), title: clip(r.title, t), level: r.level === 'month' ? 'month' as const : 'season' as const, start: clip(r.start, 10) })),
    openTasks: rows(c.openTasks, (r) => ({ id: clip(r.id, 64), title: clip(r.title, t), placement: clip(r.placement, 30) })),
    routines: rows(c.routines, (r) => ({ id: clip(r.id, 64), title: clip(r.title, t) })),
  }
}
