# Supernote Scratchpad Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page exported from Scott's Supernote lands in Dropbox, gets read by Claude vision, and is offered back in Symphony as editable tasks and notes that nothing writes until he confirms them.

**Architecture:** A new `parse-page` edge function generalizes the shipped `parse-plan` — it returns `{items, notes, unclear}` instead of tasks-only, and echoes the placement window it was given so a page parsed overnight is reviewed against the same dates. `parse-page` supersedes `parse-plan`, which this plan deletes. Phase 2 adds a `dropbox-poll` edge function on `pg_cron` that watches `/Supernote/EXPORT`, stages each new file as a `captures` row, and lets the inbox surface it for review.

**Tech Stack:** React 19 + TypeScript strict, Vitest (runs `src/**`, `vite/**` **and** `supabase/functions/**` test files — see `vitest.config.ts`), Supabase edge functions (Deno), Supabase Storage, `pg_cron` + `pg_net`, Anthropic Messages API (`claude-sonnet-4-6`).

**Spec:** `docs/superpowers/specs/2026-08-25-supernote-scratchpad-ingest-design.md`

## Global Constraints

- **Worktree:** all work happens in `.worktrees/supernote-ingest` on branch `feat/supernote-ingest`. Never edit or commit in the main worktree.
- **Node:** 22.14.0. Check `node -v` first. If wrong: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- **Tests:** `npm test` is watch mode. Always use `npx vitest run <path>`.
- **Type-check:** `npx tsc --noEmit` at root is a no-op. Use `npx tsc --noEmit -p tsconfig.app.json`.
- **No emojis in UI copy.** Use `lucide-react` icons.
- **Never partial-`upsert` the `tasks` table.** Use `.update().eq()`.
- **Never call `supabase.auth.getUser()` client-side.** Use `getAuthUser()` from `@/lib/supabase`.
- **Task writes ride the INSERT.** Never `addTask` then `setBucket` — the follow-up update is dropped before the temp→real id swap.
- **A `bucket='week'` row must say which week** — always stamp `weekStart`.
- **Model:** `claude-sonnet-4-6` for vision calls, matching `parse-plan` and `analyze-attachment`.
- **Edge-function pure logic lives in a `lib/` subfolder** with a colocated `.test.ts` (the `extract-capture/lib` layout) so Vitest can run it without Deno.
- **DDL is hand-run by Scott.** Never attempt the Management API curl — the request classifier blocks it. Print the SQL and stop.

---

### Task 1: `pageParse` — client-side validation of a page result

**Files:**
- Create: `src/lib/pageParse.ts`
- Create: `src/lib/pageParse.test.ts`

**Interfaces:**
- Consumes: `PlanItem`, `validatePlanItems` from `@/lib/planParse` (already shipped).
- Produces:
  ```ts
  export interface PageNote { title: string; content: string }
  export interface PageResult {
    items: PlanItem[]
    notes: PageNote[]
    unclear: string[]
    windowDates: string[]
    storagePath: string | null
  }
  export function validatePageResult(
    raw: unknown,
    memberIds: Set<string>,
    fallbackWindow: string[],
  ): PageResult
  ```

The echoed `window` in the response is authoritative — a page may sit parsed overnight, so recomputing the window at review time would drift off the dates the model was actually shown. `fallbackWindow` only covers a response from an older deploy that did not echo one.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pageParse.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validatePageResult } from './pageParse'

const MEMBERS = new Set(['m-iris'])
const FALLBACK = ['2026-08-25', '2026-08-26']

describe('validatePageResult', () => {
  it('clamps items against the window the response echoed, not the fallback', () => {
    const out = validatePageResult(
      {
        window: ['2026-09-01', '2026-09-02'],
        items: [{ title: 'Call dentist', day: '2026-09-02', assignee_id: null, note: null }],
      },
      MEMBERS,
      FALLBACK,
    )
    expect(out.windowDates).toEqual(['2026-09-01', '2026-09-02'])
    expect(out.items[0].placement).toEqual({ kind: 'date', date: '2026-09-02' })
  })

  it('falls back to the caller window when the response echoes none', () => {
    const out = validatePageResult(
      { items: [{ title: 'Call dentist', day: '2026-08-26', assignee_id: null, note: null }] },
      MEMBERS,
      FALLBACK,
    )
    expect(out.windowDates).toEqual(FALLBACK)
    expect(out.items[0].placement).toEqual({ kind: 'date', date: '2026-08-26' })
  })

  it('keeps notes with content and derives a missing title from the first line', () => {
    const out = validatePageResult(
      { notes: [{ content: 'Roof quote thinking\nGutters add 1200' }, { title: 'x', content: '   ' }] },
      MEMBERS,
      FALLBACK,
    )
    expect(out.notes).toEqual([
      { title: 'Roof quote thinking', content: 'Roof quote thinking\nGutters add 1200' },
    ])
  })

  it('trims unclear lines and drops the empty ones', () => {
    const out = validatePageResult({ unclear: ['  call ??? re: fence  ', '', 42] }, MEMBERS, FALLBACK)
    expect(out.unclear).toEqual(['call ??? re: fence'])
  })

  it('carries storagePath through and defaults it to null', () => {
    expect(validatePageResult({ storagePath: 'u/1.png' }, MEMBERS, FALLBACK).storagePath).toBe('u/1.png')
    expect(validatePageResult({}, MEMBERS, FALLBACK).storagePath).toBeNull()
  })

  it('returns an empty result for junk', () => {
    const out = validatePageResult(null, MEMBERS, FALLBACK)
    expect(out).toEqual({ items: [], notes: [], unclear: [], windowDates: FALLBACK, storagePath: null })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pageParse.test.ts`
Expected: FAIL — `Failed to resolve import "./pageParse"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/pageParse.ts`:

```ts
// src/lib/pageParse.ts
//
// Page-from-paper: validates the `parse-page` edge function's response into
// the three registers a scratchpad page actually holds — actions, prose, and
// lines the model could not read. Pure, so the rules that decide what gets
// written are testable without a DOM.

import { validatePlanItems, type PlanItem } from '@/lib/planParse'

export interface PageNote {
  title: string
  content: string
}

export interface PageResult {
  items: PlanItem[]
  notes: PageNote[]
  unclear: string[]
  /** The dates the parser was ALLOWED to place on — echoed by the response. */
  windowDates: string[]
  /** Where the page image lives in the `attachments` bucket, when known. */
  storagePath: string | null
}

const MAX_NOTES = 20
const MAX_UNCLEAR = 20
const TITLE_MAX = 80
const CONTENT_MAX = 5000
const UNCLEAR_MAX = 200

function firstLine(content: string): string {
  return content.split('\n')[0].trim().slice(0, TITLE_MAX)
}

function validateNotes(raw: unknown): PageNote[] {
  if (!Array.isArray(raw)) return []
  const out: PageNote[] = []
  for (const entry of raw.slice(0, MAX_NOTES)) {
    const e = entry as { title?: unknown; content?: unknown }
    if (typeof e.content !== 'string' || !e.content.trim()) continue
    const content = e.content.trim().slice(0, CONTENT_MAX)
    const title =
      typeof e.title === 'string' && e.title.trim()
        ? e.title.trim().slice(0, TITLE_MAX)
        : firstLine(content)
    out.push({ title, content })
  }
  return out
}

function validateUnclear(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((l): l is string => typeof l === 'string')
    .map((l) => l.trim().slice(0, UNCLEAR_MAX))
    .filter(Boolean)
    .slice(0, MAX_UNCLEAR)
}

/**
 * The echoed `window` wins over `fallbackWindow`: a page can sit parsed
 * overnight before it is reviewed, and re-deriving the window at review time
 * would offer dates the model was never shown. (The Tend lesson: two
 * derivations of the same window WILL disagree.)
 */
export function validatePageResult(
  raw: unknown,
  memberIds: Set<string>,
  fallbackWindow: string[],
): PageResult {
  const r = (raw ?? {}) as {
    window?: unknown
    notes?: unknown
    unclear?: unknown
    storagePath?: unknown
  }
  const echoed = Array.isArray(r.window)
    ? r.window.filter((d): d is string => typeof d === 'string')
    : []
  const windowDates = echoed.length ? echoed : fallbackWindow
  return {
    items: validatePlanItems(raw, windowDates, memberIds),
    notes: validateNotes(r.notes),
    unclear: validateUnclear(r.unclear),
    windowDates,
    storagePath: typeof r.storagePath === 'string' ? r.storagePath : null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pageParse.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit -p tsconfig.app.json
git add src/lib/pageParse.ts src/lib/pageParse.test.ts
git commit -m "feat(supernote): validate a parsed page into tasks, notes, and unclear lines"
```

---

### Task 2: `parse-page` prompt and response parser

**Files:**
- Create: `supabase/functions/parse-page/lib/parse.ts`
- Create: `supabase/functions/parse-page/lib/parse.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (Deno-free, pure).
- Produces:
  ```ts
  export interface CalendarDay { ymd: string; weekday: string }
  export interface Member { id: string; name: string }
  export interface PageItemRaw { title: string; day: string; assignee_id: string | null; note: string | null }
  export interface PageNoteRaw { title: string; content: string }
  export interface PageParseResult { items: PageItemRaw[]; notes: PageNoteRaw[]; unclear: string[] }
  export function windowCalendar(placeStart: string, placeEnd: string): CalendarDay[]
  export function buildPagePrompt(calendar: CalendarDay[], members: Member[], today: string): string
  export function parsePageResponse(raw: string, calendar: Set<string>, memberIds: Set<string>): PageParseResult
  ```

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/parse-page/lib/parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { windowCalendar, buildPagePrompt, parsePageResponse } from './parse'

describe('windowCalendar', () => {
  it('walks the window inclusively with weekday names', () => {
    const cal = windowCalendar('2026-08-25', '2026-08-27')
    expect(cal.map((c) => c.ymd)).toEqual(['2026-08-25', '2026-08-26', '2026-08-27'])
    expect(cal[0].weekday).toBe('Tuesday')
  })
})

describe('buildPagePrompt', () => {
  it('embeds the calendar, the members, and the three output registers', () => {
    const prompt = buildPagePrompt(windowCalendar('2026-08-25', '2026-08-26'), [{ id: 'm-1', name: 'Iris' }], '2026-08-25')
    expect(prompt).toContain('2026-08-25 (Tuesday)')
    expect(prompt).toContain('m-1: Iris')
    expect(prompt).toContain('"items"')
    expect(prompt).toContain('"notes"')
    expect(prompt).toContain('"unclear"')
  })
})

describe('parsePageResponse', () => {
  const CAL = new Set(['2026-08-25', '2026-08-26'])
  const MEMBERS = new Set(['m-1'])

  it('parses through markdown fences', () => {
    const out = parsePageResponse(
      '```json\n{"items":[{"title":"Call dentist","day":"2026-08-26","assignee_id":null,"note":null}],"notes":[],"unclear":[]}\n```',
      CAL,
      MEMBERS,
    )
    expect(out.items).toEqual([{ title: 'Call dentist', day: '2026-08-26', assignee_id: null, note: null }])
  })

  it('degrades an out-of-window date to week rather than dropping the item', () => {
    const out = parsePageResponse('{"items":[{"title":"Mow","day":"2025-01-01"}]}', CAL, MEMBERS)
    expect(out.items[0].day).toBe('week')
  })

  it('nulls an assignee id that is not a household member', () => {
    const out = parsePageResponse('{"items":[{"title":"Mow","day":"week","assignee_id":"nope"}]}', CAL, MEMBERS)
    expect(out.items[0].assignee_id).toBeNull()
  })

  it('keeps notes and unclear lines', () => {
    const out = parsePageResponse(
      '{"items":[],"notes":[{"title":"Roof","content":"two quotes in"}],"unclear":["fence ???"]}',
      CAL,
      MEMBERS,
    )
    expect(out.notes).toEqual([{ title: 'Roof', content: 'two quotes in' }])
    expect(out.unclear).toEqual(['fence ???'])
  })

  it('returns an empty result rather than throwing on a missing items array', () => {
    expect(parsePageResponse('{"notes":[]}', CAL, MEMBERS)).toEqual({ items: [], notes: [], unclear: [] })
  })

  it('throws on unparseable text so the caller can retry', () => {
    expect(() => parsePageResponse('I could not read that page.', CAL, MEMBERS)).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/parse-page/lib/parse.test.ts`
Expected: FAIL — `Failed to resolve import "./parse"`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/parse-page/lib/parse.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/parse-page/lib/parse.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/parse-page/lib/
git commit -m "feat(supernote): parse-page prompt and response parser"
```

---

### Task 3: `parse-page` edge function

**Files:**
- Create: `supabase/functions/parse-page/index.ts`

**Interfaces:**
- Consumes: `windowCalendar`, `buildPagePrompt`, `parsePageResponse` from `./lib/parse.ts` (Task 2).
- Produces: `POST /functions/v1/parse-page` returning
  `{ ok: true, items, notes, unclear, window: string[], storagePath }` or `{ error }`.
  Accepts either a user JWT, or the service-role key plus `userId` in the body.

There is no unit test here — it is Deno-serve plumbing over network calls. The logic worth testing already lives in `lib/parse.ts`. Verification is a deploy plus one real curl.

- [ ] **Step 1: Write the implementation**

Create `supabase/functions/parse-page/index.ts`:

```ts
// PARSE-PAGE — given a page image or PDF in the `attachments` bucket, runs
// Claude vision and returns the page sorted into tasks, notes, and lines that
// could not be read. WRITES NOTHING: the review sheet commits only what the
// user confirms. Supersedes parse-plan, which only ever returned tasks.
//
// The CALLER owns the placement window and sends it in the body; this function
// never re-derives it (the Tend lesson: two derivations of the same window WILL
// disagree) and ECHOES it back, because a polled page may be reviewed hours
// later against what would by then be a different "today".
//
// Auth: either a user JWT, or the service-role key plus an explicit `userId`
// (the dropbox-poll caller, which has no user session).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { windowCalendar, buildPagePrompt, parsePageResponse, type Member } from './lib/parse.ts'

const MODEL = 'claude-sonnet-4-6'
const YMD = /^\d{4}-\d{2}-\d{2}$/

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

async function callVision(fileUrl: string, isPdf: boolean, prompt: string, apiKey: string): Promise<string> {
  // A multi-page PDF export is one page-set the model sees together; images go
  // through the image block, the way analyze-attachment already branches.
  const fileBlock = isPdf
    ? { type: 'document', source: { type: 'url', url: fileUrl } }
    : { type: 'image', source: { type: 'url', url: fileUrl } }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: prompt }] }],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic returned ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  const text = data.content?.find((b) => b.type === 'text')?.text
  if (typeof text !== 'string') throw new Error('No text in Anthropic response')
  return text
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing Authorization' }, 401)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!apiKey || !url || !serviceKey) return json({ error: 'Missing server config' }, 500)

  let body: {
    storagePath?: string
    userId?: string
    placeStart?: string
    placeEnd?: string
    today?: string
    members?: Member[]
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const service = createClient(url, serviceKey)
  const token = authHeader.slice('Bearer '.length)

  // Two callers, two shapes of trust: a browser sends its own JWT and may only
  // read paths under its own user id; dropbox-poll sends the service key and
  // names the user explicitly.
  let userId: string
  if (token === serviceKey) {
    if (!body.userId) return json({ error: 'userId required for service-role calls' }, 400)
    userId = body.userId
  } else {
    const { data: { user }, error: authErr } = await service.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Invalid token' }, 401)
    userId = user.id
  }

  const { storagePath, placeStart, placeEnd, today } = body
  if (!storagePath) return json({ error: 'storagePath required' }, 400)
  if (!storagePath.startsWith(`${userId}/`)) return json({ error: 'storagePath must be under the user id' }, 403)
  if (!placeStart || !YMD.test(placeStart) || !placeEnd || !YMD.test(placeEnd) || placeEnd < placeStart) {
    return json({ error: 'placeStart/placeEnd required as YYYY-MM-DD with placeStart <= placeEnd' }, 400)
  }
  if (!today || !YMD.test(today)) return json({ error: 'today required as YYYY-MM-DD' }, 400)

  const members = (body.members ?? [])
    .filter((m): m is Member => typeof m?.id === 'string' && typeof m?.name === 'string')
    .slice(0, 20)

  try {
    const { data: signed, error: signErr } = await service.storage
      .from('attachments')
      .createSignedUrl(storagePath, 600)
    if (signErr || !signed?.signedUrl) throw new Error(`Could not sign file URL: ${signErr?.message}`)

    const calendar = windowCalendar(placeStart, placeEnd)
    const prompt = buildPagePrompt(calendar, members, today)
    const isPdf = storagePath.toLowerCase().endsWith('.pdf')
    const calendarSet = new Set(calendar.map((c) => c.ymd))
    const memberIds = new Set(members.map((m) => m.id))

    // One retry: the failure mode is a model preamble around the JSON, and a
    // second pass almost always comes back clean (the analyze-attachment rule).
    let parsed
    try {
      parsed = parsePageResponse(await callVision(signed.signedUrl, isPdf, prompt, apiKey), calendarSet, memberIds)
    } catch {
      parsed = parsePageResponse(await callVision(signed.signedUrl, isPdf, prompt, apiKey), calendarSet, memberIds)
    }

    return json({ ok: true, ...parsed, window: calendar.map((c) => c.ymd), storagePath })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('parse-page failed:', message)
    return json({ error: message }, 500)
  }
})
```

- [ ] **Step 2: Deploy and smoke-test**

```bash
npx supabase functions deploy parse-page --project-ref mwadppyrqzuzgstmwpuy
```

Then, with a real page already uploaded at `<user-id>/plan/<file>.png` (any image from a previous plan-from-paper run works):

```bash
curl -sS -X POST "https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/parse-page" \
  -H "Authorization: Bearer $SUPABASE_ANON_JWT_FOR_SCOTT" \
  -H "content-type: application/json" \
  -d '{"storagePath":"<user-id>/plan/<file>.png","placeStart":"2026-08-25","placeEnd":"2026-09-07","today":"2026-08-25","members":[]}' | jq
```

Expected: `{"ok":true,"items":[...],"notes":[...],"unclear":[...],"window":["2026-08-25",...],"storagePath":"..."}`

If Scott has no JWT to hand, stop and ask him for one rather than guessing — do not fall back to the service key from a shell.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/parse-page/index.ts
git commit -m "feat(supernote): parse-page edge function reads a page into three registers"
```

---

### Task 4: `PageReviewSheet`

**Files:**
- Create: `src/components/capture/PageReviewSheet.tsx` (from `PlanReviewSheet.tsx`)
- Create: `src/components/capture/PageReviewSheet.test.tsx` (from `PlanReviewSheet.test.tsx`)
- Delete: `src/components/capture/PlanReviewSheet.tsx`, `src/components/capture/PlanReviewSheet.test.tsx`

**Interfaces:**
- Consumes: `PageNote` from `@/lib/pageParse` (Task 1), `PlanItem`/`PlanPlacement` from `@/lib/planParse`, `FamilyMember` from `@/types/family`.
- Produces:
  ```ts
  export interface PageReviewPayload { items: PlanItem[]; notes: PageNote[] }
  export interface PageReviewSheetProps {
    items: PlanItem[]
    notes: PageNote[]
    unclear: string[]
    windowDates: string[]
    members: FamilyMember[]
    committing: boolean
    onCommit: (payload: PageReviewPayload) => void
    onClose: () => void
  }
  export function PageReviewSheet(props: PageReviewSheetProps): JSX.Element
  ```

Start with `git mv` so the diff reads as an extension of a working component rather than a rewrite:

```bash
git mv src/components/capture/PlanReviewSheet.tsx src/components/capture/PageReviewSheet.tsx
git mv src/components/capture/PlanReviewSheet.test.tsx src/components/capture/PageReviewSheet.test.tsx
```

- [ ] **Step 1: Write the failing tests**

Replace the contents of `src/components/capture/PageReviewSheet.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { PageReviewSheet } from './PageReviewSheet'
import type { PlanItem } from '@/lib/planParse'
import type { PageNote } from '@/lib/pageParse'
import type { FamilyMember } from '@/types/family'

const WINDOW = ['2026-08-17', '2026-08-18', '2026-08-19']
const MEMBERS = [{ id: 'm-iris', name: 'Iris' } as FamilyMember]
const ITEMS: PlanItem[] = [
  { title: 'Call dentist', placement: { kind: 'date', date: '2026-08-18' }, assigneeId: null, note: '410-555-0100' },
  { title: 'Return library books', placement: { kind: 'week' }, assigneeId: 'm-iris', note: null },
]
const NOTES: PageNote[] = [{ title: 'Roof quotes', content: 'Two quotes in, gutters add 1200' }]

function renderSheet(overrides: Partial<Parameters<typeof PageReviewSheet>[0]> = {}) {
  const onCommit = vi.fn()
  const onClose = vi.fn()
  render(
    <PageReviewSheet
      items={ITEMS}
      notes={NOTES}
      unclear={[]}
      windowDates={WINDOW}
      members={MEMBERS}
      committing={false}
      onCommit={onCommit}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onCommit, onClose }
}

describe('PageReviewSheet', () => {
  it('renders every parsed item with its note', () => {
    renderSheet()
    expect(screen.getByDisplayValue('Call dentist')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Return library books')).toBeInTheDocument()
    expect(screen.getByText('410-555-0100')).toBeInTheDocument()
  })

  it('renders parsed notes alongside the tasks', () => {
    renderSheet()
    expect(screen.getByDisplayValue('Roof quotes')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Two quotes in, gutters add 1200')).toBeInTheDocument()
  })

  it('commits included items and notes together', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet()
    await user.click(screen.getByRole('button', { name: /add 3 items/i }))
    expect(onCommit).toHaveBeenCalledWith({
      items: [
        expect.objectContaining({ title: 'Call dentist', placement: { kind: 'date', date: '2026-08-18' } }),
        expect.objectContaining({ title: 'Return library books', placement: { kind: 'week' } }),
      ],
      notes: [{ title: 'Roof quotes', content: 'Two quotes in, gutters add 1200' }],
    })
  })

  it('excludes an unchecked note and updates the button count', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet()
    await user.click(screen.getByRole('checkbox', { name: /include note "Roof quotes"/i }))
    await user.click(screen.getByRole('button', { name: /add 2 items/i }))
    expect(onCommit).toHaveBeenCalledWith({ items: expect.any(Array), notes: [] })
  })

  it('excludes an unchecked task row', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet()
    await user.click(screen.getByRole('checkbox', { name: /include "Call dentist"/i }))
    await user.click(screen.getByRole('button', { name: /add 2 items/i }))
    expect(onCommit.mock.calls[0][0].items).toEqual([
      expect.objectContaining({ title: 'Return library books' }),
    ])
  })

  it('commits an edited placement', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet()
    await user.selectOptions(screen.getAllByRole('combobox', { name: /when/i })[0], 'inbox')
    await user.click(screen.getByRole('button', { name: /add 3 items/i }))
    expect(onCommit.mock.calls[0][0].items[0].placement).toEqual({ kind: 'inbox' })
  })

  it('promotes an unclear line to a task', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet({ items: [], notes: [], unclear: ['call ??? re fence'] })
    await user.click(screen.getByRole('button', { name: /make "call \?\?\? re fence" a task/i }))
    expect(screen.getByDisplayValue('call ??? re fence')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    expect(onCommit.mock.calls[0][0].items).toEqual([
      expect.objectContaining({ title: 'call ??? re fence', placement: { kind: 'inbox' } }),
    ])
  })

  it('promotes an unclear line to a note', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet({ items: [], notes: [], unclear: ['fence guy 410'] })
    await user.click(screen.getByRole('button', { name: /keep "fence guy 410" as a note/i }))
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    expect(onCommit.mock.calls[0][0].notes).toEqual([{ title: 'fence guy 410', content: 'fence guy 410' }])
  })

  it('shows the unreadable-page empty state with no commit button', () => {
    renderSheet({ items: [], notes: [], unclear: [] })
    expect(screen.getByText(/couldn.t read anything/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/capture/PageReviewSheet.test.tsx`
Expected: FAIL — `PageReviewSheet` does not export the new props; note and unclear assertions have nothing to find.

- [ ] **Step 3: Write the implementation**

Rewrite `src/components/capture/PageReviewSheet.tsx`. Keep the existing task-row markup exactly as it is (checkbox, title input, When select, Assignee select) and add the two new sections plus the payload shape:

```tsx
import { useMemo, useState } from 'react'
import { X, NotebookPen, HelpCircle } from 'lucide-react'
import { parseLocalYmd } from '@/lib/cadence/config'
import type { PlanItem, PlanPlacement } from '@/lib/planParse'
import type { PageNote } from '@/lib/pageParse'
import type { FamilyMember } from '@/types/family'

export interface PageReviewPayload {
  items: PlanItem[]
  notes: PageNote[]
}

export interface PageReviewSheetProps {
  /** Parsed actions, in page order. */
  items: PlanItem[]
  /** Parsed prose, in page order. */
  notes: PageNote[]
  /** Lines the model could not read. Read-only until promoted. */
  unclear: string[]
  /** The SAME dates the parser was allowed to place on (local YYYY-MM-DD). */
  windowDates: string[]
  members: FamilyMember[]
  committing: boolean
  /** Called with only the checked rows, as edited. */
  onCommit: (payload: PageReviewPayload) => void
  onClose: () => void
}

interface ItemRow extends PlanItem { included: boolean }
interface NoteRow extends PageNote { included: boolean }

const UNASSIGNED = ''

function placementValue(p: PlanPlacement): string {
  return p.kind === 'date' ? p.date : p.kind
}

function placementFromValue(v: string): PlanPlacement {
  if (v === 'week') return { kind: 'week' }
  if (v === 'inbox') return { kind: 'inbox' }
  return { kind: 'date', date: v }
}

function dateLabel(ymd: string): string {
  return parseLocalYmd(ymd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * The review step of page-from-paper: everything the parser read, editable,
 * nothing written until "Add". Handwriting parsing will misread sometimes —
 * this sheet is where trust in the pipeline lives. Unclear lines sit apart
 * and inert precisely because a wrong task costs more than an unread line.
 */
export function PageReviewSheet({
  items, notes, unclear, windowDates, members, committing, onCommit, onClose,
}: PageReviewSheetProps) {
  const [itemRows, setItemRows] = useState<ItemRow[]>(() => items.map((i) => ({ ...i, included: true })))
  const [noteRows, setNoteRows] = useState<NoteRow[]>(() => notes.map((n) => ({ ...n, included: true })))
  const [unread, setUnread] = useState<string[]>(() => unclear)

  const includedCount = useMemo(
    () => itemRows.filter((r) => r.included).length + noteRows.filter((r) => r.included).length,
    [itemRows, noteRows],
  )
  const isEmpty = itemRows.length === 0 && noteRows.length === 0 && unread.length === 0

  const updateItem = (index: number, patch: Partial<ItemRow>) =>
    setItemRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  const updateNote = (index: number, patch: Partial<NoteRow>) =>
    setNoteRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const promoteToTask = (line: string) => {
    setItemRows((prev) => [...prev, { title: line, placement: { kind: 'inbox' }, assigneeId: null, note: null, included: true }])
    setUnread((prev) => prev.filter((l) => l !== line))
  }
  const promoteToNote = (line: string) => {
    setNoteRows((prev) => [...prev, { title: line, content: line, included: true }])
    setUnread((prev) => prev.filter((l) => l !== line))
  }

  const commit = () => {
    onCommit({
      items: itemRows
        .filter((r) => r.included && r.title.trim())
        .map(({ included: _included, ...item }) => ({ ...item, title: item.title.trim() })),
      notes: noteRows
        .filter((r) => r.included && r.content.trim())
        .map(({ included: _included, ...note }) => ({ title: note.title.trim(), content: note.content.trim() })),
    })
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-bg-elevated rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Review page items"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200/60">
          <div className="flex items-center gap-2">
            <NotebookPen className="w-5 h-5 text-primary-600" />
            <h3 className="font-display text-xl text-neutral-900">From your page</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close review" className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isEmpty ? (
          <div className="px-5 py-10 text-center text-neutral-500 text-[15px]">
            Couldn&rsquo;t read anything on this page. Try a straighter, brighter scan.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
            {itemRows.length > 0 && (
              <div className="space-y-2">
                {itemRows.map((row, i) => (
                  <div key={`i-${i}`} className={`flex items-center gap-3 rounded-xl border border-neutral-200/70 px-3 py-2 ${row.included ? 'bg-white' : 'bg-neutral-50 opacity-60'}`}>
                    <input
                      type="checkbox"
                      checked={row.included}
                      onChange={(e) => updateItem(i, { included: e.target.checked })}
                      aria-label={`Include "${row.title}"`}
                      className="w-4 h-4 accent-primary-600 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <input
                        value={row.title}
                        onChange={(e) => updateItem(i, { title: e.target.value })}
                        aria-label="Task title"
                        className="w-full bg-transparent text-[15px] text-neutral-900 focus:outline-none"
                      />
                      {row.note && <p className="text-[13px] text-neutral-500 truncate">{row.note}</p>}
                    </div>
                    <select
                      value={placementValue(row.placement)}
                      onChange={(e) => updateItem(i, { placement: placementFromValue(e.target.value) })}
                      aria-label="When"
                      className="text-[13px] text-neutral-700 bg-neutral-100 rounded-lg px-2 py-1.5 shrink-0"
                    >
                      <option value="inbox">Inbox</option>
                      <option value="week">This week</option>
                      {windowDates.map((d) => (
                        <option key={d} value={d}>{dateLabel(d)}</option>
                      ))}
                    </select>
                    <select
                      value={row.assigneeId ?? UNASSIGNED}
                      onChange={(e) => updateItem(i, { assigneeId: e.target.value === UNASSIGNED ? null : e.target.value })}
                      aria-label="Assignee"
                      className="text-[13px] text-neutral-700 bg-neutral-100 rounded-lg px-2 py-1.5 shrink-0 max-w-[110px]"
                    >
                      <option value={UNASSIGNED}>Me</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {noteRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-[13px] font-medium text-neutral-500">Notes</p>
                {noteRows.map((row, i) => (
                  <div key={`n-${i}`} className={`flex items-start gap-3 rounded-xl border border-neutral-200/70 px-3 py-2 ${row.included ? 'bg-white' : 'bg-neutral-50 opacity-60'}`}>
                    <input
                      type="checkbox"
                      checked={row.included}
                      onChange={(e) => updateNote(i, { included: e.target.checked })}
                      aria-label={`Include note "${row.title}"`}
                      className="w-4 h-4 accent-primary-600 shrink-0 mt-1"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <input
                        value={row.title}
                        onChange={(e) => updateNote(i, { title: e.target.value })}
                        aria-label="Note title"
                        className="w-full bg-transparent text-[15px] text-neutral-900 focus:outline-none"
                      />
                      <textarea
                        value={row.content}
                        onChange={(e) => updateNote(i, { content: e.target.value })}
                        aria-label="Note content"
                        rows={3}
                        className="w-full bg-transparent text-[13px] text-neutral-600 focus:outline-none resize-y"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {unread.length > 0 && (
              <div className="space-y-2">
                <p className="text-[13px] font-medium text-neutral-500 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5" />
                  Couldn&rsquo;t read these
                </p>
                {unread.map((line) => (
                  <div key={line} className="flex items-center gap-3 rounded-xl border border-dashed border-neutral-300 px-3 py-2">
                    <span className="flex-1 min-w-0 text-[14px] text-neutral-500 truncate">{line}</span>
                    <button
                      type="button"
                      onClick={() => promoteToTask(line)}
                      aria-label={`Make "${line}" a task`}
                      className="text-[13px] px-2.5 py-1 rounded-lg text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition-colors shrink-0"
                    >
                      Task
                    </button>
                    <button
                      type="button"
                      onClick={() => promoteToNote(line)}
                      aria-label={`Keep "${line}" as a note`}
                      className="text-[13px] px-2.5 py-1 rounded-lg text-neutral-700 bg-neutral-100 hover:bg-neutral-200 transition-colors shrink-0"
                    >
                      Note
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-neutral-200/60">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[14px] text-neutral-600 hover:bg-neutral-100 transition-colors">
            Cancel
          </button>
          {!isEmpty && (
            <button
              type="button"
              onClick={commit}
              disabled={committing || includedCount === 0}
              className="btn-primary px-4 py-2 rounded-lg text-[14px] disabled:opacity-50"
            >
              {committing ? 'Adding…' : `Add ${includedCount} ${includedCount === 1 ? 'item' : 'items'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/capture/PageReviewSheet.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 5: Type-check and commit**

`PlanFromPaperFlow.tsx` still imports `PlanReviewSheet` and will fail the type-check until Task 5. That is expected — commit anyway so the sheet lands as its own reviewable change, and note the break in the message.

```bash
npx tsc --noEmit -p tsconfig.app.json   # expect ONE error in PlanFromPaperFlow.tsx; Task 5 fixes it
git add -A src/components/capture/
git commit -m "feat(supernote): PageReviewSheet reviews tasks, notes, and unclear lines

PlanFromPaperFlow is left broken until the next commit rewires it."
```

---

### Task 5: `useCommitPage`, the page flow, and retiring `parse-plan`

**Files:**
- Create: `src/hooks/usePageFromPaper.ts` (from `usePlanFromPaper.ts`)
- Create: `src/hooks/useCommitPage.ts`
- Create: `src/components/capture/PageFromPaperFlow.tsx` (from `PlanFromPaperFlow.tsx`)
- Modify: `src/apps/tasks/HomeViewContainer.tsx:21`, `:98`, `:~695-738`
- Delete: `src/hooks/usePlanFromPaper.ts`, `src/components/capture/PlanFromPaperFlow.tsx`, `supabase/functions/parse-plan/`

**Interfaces:**
- Consumes: `validatePageResult`, `PageResult`, `PageNote` (Task 1); `PageReviewSheet`, `PageReviewPayload` (Task 4); `planItemToAddTaskArgs`, `planWindowDates` from `@/lib/planParse`.
- Produces:
  ```ts
  // usePageFromPaper.ts
  export type PageParseStatus = 'idle' | 'parsing' | 'ready' | 'error'
  export function usePageFromPaper(members: FamilyMember[]): {
    status: PageParseStatus
    result: PageResult
    error: string | null
    parseFromBlob: (blob: Blob) => Promise<void>
    retry: () => Promise<void>
    reset: () => void
  }

  // useCommitPage.ts
  export function useCommitPage(): {
    commitPage: (payload: { items: PlanItem[]; notes: PageNote[]; storagePath: string | null }) => Promise<void>
  }
  ```

`parse-page` supersedes `parse-plan` for both callers, so `parse-plan` and its hook go. `planParse.ts` stays — `pageParse` builds on it.

- [ ] **Step 1: Move the hook and flow, and point them at parse-page**

```bash
git mv src/hooks/usePlanFromPaper.ts src/hooks/usePageFromPaper.ts
git mv src/components/capture/PlanFromPaperFlow.tsx src/components/capture/PageFromPaperFlow.tsx
```

In `src/hooks/usePageFromPaper.ts`: keep `toJpeg`, `MAX_DIMENSION`, and the upload/retry/reset shape exactly as they are, and change four things.

1. Rename the exports: `PlanParseStatus` → `PageParseStatus`, `usePlanFromPaper` → `usePageFromPaper`.
2. Replace the `items` + `windowDates` state with one `result` state:

```ts
import { validatePageResult, type PageResult } from '@/lib/pageParse'

const EMPTY: PageResult = { items: [], notes: [], unclear: [], windowDates: [], storagePath: null }
// ...
const [result, setResult] = useState<PageResult>(EMPTY)
```

3. Rewrite `invokeParse` to call `parse-page` and take the window from the response:

```ts
const invokeParse = useCallback(async (storagePath: string) => {
  const dates = planWindowDates(new Date())
  const { data, error: fnErr } = await supabase.functions.invoke('parse-page', {
    body: {
      storagePath,
      placeStart: dates[0],
      placeEnd: dates[dates.length - 1],
      today: localYmd(new Date()),
      members: members.map((m) => ({ id: m.id, name: m.name })),
    },
  })
  if (fnErr) throw new Error(fnErr.message)
  if (data?.error) throw new Error(String(data.error))
  // `dates` is only the fallback — the response echoes the window it actually
  // used, and that is what the review sheet must offer.
  setResult(validatePageResult(data, new Set(members.map((m) => m.id)), dates))
  setStatus('ready')
}, [members])
```

4. In `parseFromBlob`, change the storage path prefix from `plan` to `page`:

```ts
const ext = blob.type === 'application/pdf' ? 'pdf' : 'jpg'
const storagePath = `${user.id}/page/${crypto.randomUUID()}.${ext}`
```

and skip `toJpeg` for PDFs:

```ts
const upload = blob.type === 'application/pdf' ? blob : await toJpeg(blob)
const { error: uploadErr } = await supabase.storage
  .from('attachments')
  .upload(storagePath, upload, { contentType: blob.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg', upsert: true })
```

Finally, `reset()` sets `setResult(EMPTY)` and the hook returns `{ status, result, error, parseFromBlob, retry, reset }`.

- [ ] **Step 2: Write the commit hook**

Create `src/hooks/useCommitPage.ts`:

```ts
// src/hooks/useCommitPage.ts
//
// Commits a reviewed page: one INSERT per confirmed task, one per confirmed
// note, and one attachments row pinning the page image to whatever came off it.
// Shared by the manual upload flow and the inbox's pending-page section so the
// two can never drift.

import { useCallback } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { planItemToAddTaskArgs, type PlanItem } from '@/lib/planParse'
import type { PageNote } from '@/lib/pageParse'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useNotes } from '@/hooks/useNotes'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useDomain } from '@/hooks/useDomain'
import { showToast } from '@/hooks/useToast'

export interface CommitPagePayload {
  items: PlanItem[]
  notes: PageNote[]
  /** Where the page lives in the `attachments` bucket, if we know. */
  storagePath: string | null
}

export function useCommitPage() {
  const { addTask } = useSupabaseTasks()
  const { addNote } = useNotes()
  const { getCurrentUserMember } = useFamilyMembers()
  const { currentDomain } = useDomain()

  const commitPage = useCallback(async ({ items, notes, storagePath }: CommitPagePayload) => {
    const context = currentDomain === 'universal' ? null : currentDomain
    const commitCtx = {
      currentWeekStart: weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn),
      context,
    }
    const defaultAssigneeId = getCurrentUserMember()?.id

    // Everything rides the INSERT — a follow-up update can be dropped before
    // the temp→real id swap lands (the addTask-then-setBucket race).
    let firstTaskId: string | undefined
    for (const item of items) {
      const args = planItemToAddTaskArgs(item, commitCtx)
      const id = await addTask(args.title, undefined, undefined, args.scheduledFor, {
        ...args.options,
        defaultAssigneeId,
      })
      firstTaskId ??= id
    }

    // type 'general', not 'quick_capture': useNotes dual-writes quick captures
    // to the Obsidian vault, and a page already captured into Symphony should
    // not also land there as a second copy.
    let firstNoteId: string | undefined
    for (const note of notes) {
      const created = await addNote({
        title: note.title,
        content: note.content,
        type: 'general',
        source: 'import',
        context: context ?? undefined,
      })
      firstNoteId ??= created?.id
    }

    // The page image is already in the bucket — this only files the row, so it
    // does NOT go through useAttachments (which uploads a File).
    const entityId = firstNoteId ?? firstTaskId
    if (storagePath && entityId) {
      const { data: { user } } = await getAuthUser()
      if (user) {
        await supabase.from('attachments').insert({
          user_id: user.id,
          entity_type: firstNoteId ? 'note' : 'task',
          entity_id: entityId,
          file_name: storagePath.split('/').pop() ?? 'page',
          file_type: storagePath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
          file_size: 0,
          storage_path: storagePath,
        })
      }
    }

    const parts = [
      items.length ? `${items.length} task${items.length === 1 ? '' : 's'}` : '',
      notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : '',
    ].filter(Boolean)
    showToast(`Added ${parts.join(' and ')} from your page`, 'success', 4000)
  }, [addTask, addNote, currentDomain, getCurrentUserMember])

  return { commitPage }
}
```

- [ ] **Step 3: Rewire the flow component**

In `src/components/capture/PageFromPaperFlow.tsx`: rename the component and props to `PageFromPaperFlow` / `PageFromPaperFlowProps`, import `usePageFromPaper` and `PageReviewSheet`, and change:

- `onCommit` prop type → `(payload: PageReviewPayload, storagePath: string | null) => Promise<void>`
- the file input → `accept="image/*,application/pdf"`
- the parsing copy → `Reading your page…`, the error copy → `Couldn't read the page`
- the ready branch:

```tsx
{status === 'ready' && (
  <PageReviewSheet
    items={result.items}
    notes={result.notes}
    unclear={result.unclear}
    windowDates={result.windowDates}
    members={members}
    committing={committing}
    onCommit={(payload) => void handleCommit(payload)}
    onClose={close}
  />
)}
```

with `handleCommit` passing the storage path through:

```tsx
const handleCommit = useCallback(async (payload: PageReviewPayload) => {
  setCommitting(true)
  try {
    await onCommit(payload, result.storagePath)
    close()
  } finally {
    setCommitting(false)
  }
}, [onCommit, close, result.storagePath])
```

- [ ] **Step 4: Rewire HomeViewContainer**

In `src/apps/tasks/HomeViewContainer.tsx`:

- line 21 — `import { PageFromPaperFlow } from '@/components/capture/PageFromPaperFlow';`
- add `import { useCommitPage } from '@/hooks/useCommitPage';`
- add `import type { PageReviewPayload } from '@/components/capture/PageReviewSheet';`
- near line 80, add `const { commitPage } = useCommitPage();`
- replace the whole `handleCommitPlanItems` callback (the `commitCtx` / `for (const item of items)` / `showToast` block ending around line 713) with:

```tsx
  const handleCommitPage = useCallback(
    async (payload: PageReviewPayload, storagePath: string | null) => {
      await commitPage({ ...payload, storagePath });
    },
    [commitPage],
  );
```

- at the mount (line 733), swap the component and handler:

```tsx
      {planFromPaperOpen && (
        <PageFromPaperFlow
          members={familyMembers}
          onCommit={handleCommitPage}
          onClose={() => setPlanFromPaperOpen(false)}
        />
      )}
```

Remove the now-unused `planItemToAddTaskArgs`, `weekStartAnchor`, and `readCadenceConfig` imports **only if nothing else in the file uses them** — grep before deleting.

- [ ] **Step 5: Delete the superseded parse-plan path**

```bash
git rm -r supabase/functions/parse-plan
npx vitest run src/lib src/components/capture
npx tsc --noEmit -p tsconfig.app.json
```
Expected: all tests pass, zero type errors.

Then verify nothing still references the old names:

```bash
grep -rn "parse-plan\|usePlanFromPaper\|PlanFromPaperFlow\|PlanReviewSheet" src supabase
```
Expected: no output.

- [ ] **Step 6: Look at it in the app**

Type-checks are not inspection. Start the dev server, open Today → ⋯ → Plan from paper, pick any page image, and confirm: the sheet shows tasks and (if the page has prose) a Notes section, committing creates the tasks **and** the notes, and the page appears as an attachment on the first note.

```bash
npm run dev
```

- [ ] **Step 7: Commit and push**

```bash
git add -A
git commit -m "feat(supernote): page-from-paper commits tasks and notes, retiring parse-plan"
git push origin HEAD
```

Tell Scott to run `npx supabase functions delete parse-plan --project-ref mwadppyrqzuzgstmwpuy` — deleting the source does not undeploy the function.

---

### Task 6: `selectNewFiles` — which Dropbox entries are new

**Files:**
- Create: `supabase/functions/dropbox-poll/lib/select.ts`
- Create: `supabase/functions/dropbox-poll/lib/select.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  ```ts
  export interface DropboxEntry {
    '.tag': string
    name: string
    path_lower: string
    server_modified: string
    size: number
  }
  export const MAX_FILE_BYTES: number   // 10 * 1024 * 1024
  export const ALLOWED_EXT: string[]    // ['png','jpg','jpeg','pdf']
  export function selectNewFiles(entries: DropboxEntry[], lastProcessedAtIso: string, cap: number): DropboxEntry[]
  export function maxServerModified(entries: DropboxEntry[], fallbackIso: string): string
  ```

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/dropbox-poll/lib/select.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { selectNewFiles, maxServerModified, type DropboxEntry } from './select'

const file = (over: Partial<DropboxEntry>): DropboxEntry => ({
  '.tag': 'file',
  name: 'page.png',
  path_lower: '/supernote/export/page.png',
  server_modified: '2026-08-25T12:00:00Z',
  size: 1024,
  ...over,
})

const SINCE = '2026-08-25T10:00:00Z'

describe('selectNewFiles', () => {
  it('takes files strictly newer than the checkpoint', () => {
    const out = selectNewFiles(
      [
        file({ name: 'old.png', server_modified: '2026-08-25T09:00:00Z' }),
        file({ name: 'boundary.png', server_modified: SINCE }),
        file({ name: 'new.png', server_modified: '2026-08-25T11:00:00Z' }),
      ],
      SINCE,
      10,
    )
    expect(out.map((e) => e.name)).toEqual(['new.png'])
  })

  it('skips folders, deleted entries, and unsupported extensions', () => {
    const out = selectNewFiles(
      [
        file({ '.tag': 'folder', name: 'sub' }),
        file({ '.tag': 'deleted', name: 'gone.png' }),
        file({ name: 'notes.txt' }),
        file({ name: 'scan.PDF' }),
      ],
      SINCE,
      10,
    )
    expect(out.map((e) => e.name)).toEqual(['scan.PDF'])
  })

  it('skips files over the size ceiling', () => {
    const out = selectNewFiles([file({ name: 'huge.pdf', size: 11 * 1024 * 1024 })], SINCE, 10)
    expect(out).toEqual([])
  })

  it('returns oldest first and honours the cap', () => {
    const out = selectNewFiles(
      [
        file({ name: 'c.png', server_modified: '2026-08-25T13:00:00Z' }),
        file({ name: 'a.png', server_modified: '2026-08-25T11:00:00Z' }),
        file({ name: 'b.png', server_modified: '2026-08-25T12:00:00Z' }),
      ],
      SINCE,
      2,
    )
    expect(out.map((e) => e.name)).toEqual(['a.png', 'b.png'])
  })
})

describe('maxServerModified', () => {
  it('returns the newest timestamp among the entries', () => {
    expect(
      maxServerModified(
        [file({ server_modified: '2026-08-25T11:00:00Z' }), file({ server_modified: '2026-08-25T13:00:00Z' })],
        SINCE,
      ),
    ).toBe('2026-08-25T13:00:00Z')
  })

  it('returns the fallback when nothing was processed', () => {
    expect(maxServerModified([], SINCE)).toBe(SINCE)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/dropbox-poll/lib/select.test.ts`
Expected: FAIL — `Failed to resolve import "./select"`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/dropbox-poll/lib/select.ts`:

```ts
// Which entries in the watched Dropbox folder are new work. Pure, so the
// dedupe rule — the one place a missed or double-billed page comes from — is
// testable without Dropbox.

export interface DropboxEntry {
  '.tag': string
  name: string
  path_lower: string
  server_modified: string
  size: number
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'pdf']

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i + 1).toLowerCase()
}

/**
 * Strictly newer than the checkpoint, oldest first, capped. Strictly, because
 * the checkpoint is set to a timestamp we HAVE processed — `>=` would re-bill
 * the last page on every tick.
 */
export function selectNewFiles(entries: DropboxEntry[], lastProcessedAtIso: string, cap: number): DropboxEntry[] {
  const since = Date.parse(lastProcessedAtIso)
  return entries
    .filter((e) => e['.tag'] === 'file')
    .filter((e) => ALLOWED_EXT.includes(extOf(e.name)))
    .filter((e) => e.size <= MAX_FILE_BYTES)
    .filter((e) => Date.parse(e.server_modified) > since)
    .sort((a, b) => Date.parse(a.server_modified) - Date.parse(b.server_modified))
    .slice(0, cap)
}

/**
 * The checkpoint advances only past what this run actually attempted — never
 * to now(). A file that lands mid-run, or falls past the cap, must still be
 * waiting on the next tick.
 */
export function maxServerModified(entries: DropboxEntry[], fallbackIso: string): string {
  return entries.reduce(
    (max, e) => (Date.parse(e.server_modified) > Date.parse(max) ? e.server_modified : max),
    fallbackIso,
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/dropbox-poll/lib/select.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/dropbox-poll/lib/
git commit -m "feat(supernote): select new Dropbox exports since the checkpoint"
```

---

### Task 7: `dropbox-poll` edge function

**Files:**
- Create: `supabase/functions/dropbox-poll/index.ts`

**Interfaces:**
- Consumes: `selectNewFiles`, `maxServerModified`, `DropboxEntry` from `./lib/select.ts` (Task 6); `POST /parse-page` (Task 3).
- Produces: `POST /functions/v1/dropbox-poll` (service-role only) returning `{ ok: true, processed: number, failed: number }`.

The result JSON written to `captures.raw_text` is exactly what `validatePageResult` (Task 1) consumes: `{ items, notes, unclear, window, storagePath }`.

- [ ] **Step 1: Write the implementation**

Create `supabase/functions/dropbox-poll/index.ts`:

```ts
// DROPBOX-POLL — watches ONE Dropbox folder for pages exported from the
// Supernote, stages each new file as a `captures` row, and asks parse-page to
// read it. Writes no tasks and no notes: the inbox's pending-page section is
// where a page becomes data, and only if Scott says so.
//
// Export is the trigger, not sync. The device's .note files rewrite on every
// stroke; /Supernote/EXPORT only receives a file when a page is deliberately
// exported, which makes "newer than the checkpoint" a sound dedupe rule.
//
// Auth: service-role bearer only — pg_cron is the sole caller.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { selectNewFiles, maxServerModified, type DropboxEntry } from './lib/select.ts'

// The Dropbox token is full-account (Supernote syncs to the account root and
// offers no app-folder target). This constant is the mitigation: the poller
// reads one path, never a parameter, never a value from a row.
const WATCH_PATH = '/Supernote/EXPORT'
const PER_RUN_CAP = 10
const SOURCE_KEY = 'supernote:export'
// Single-user assumptions, isolated here so they are cheap to lift later.
const TZ = 'America/New_York'
const WINDOW_DAYS = 14

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

/** YYYY-MM-DD for `now` plus `offsetDays`, in the user's timezone. */
function ymdIn(tz: string, offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86400000)
  // en-CA renders as YYYY-MM-DD.
  return d.toLocaleDateString('en-CA', { timeZone: tz })
}

async function dropboxAccessToken(key: string, secret: string, refresh: string): Promise<string> {
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${btoa(`${key}:${secret}`)}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }),
  })
  if (!res.ok) throw new Error(`Dropbox token exchange failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return ((await res.json()) as { access_token: string }).access_token
}

async function listFolder(accessToken: string): Promise<DropboxEntry[]> {
  const res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ path: WATCH_PATH, recursive: false, limit: 200 }),
  })
  if (res.status === 409) return [] // path_not_found — the folder appears on first export
  if (!res.ok) throw new Error(`Dropbox list_folder failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return ((await res.json()) as { entries: DropboxEntry[] }).entries ?? []
}

async function download(accessToken: string, path: string): Promise<Blob> {
  const res = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'Dropbox-API-Arg': JSON.stringify({ path }) },
  })
  if (!res.ok) throw new Error(`Dropbox download failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return await res.blob()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const appKey = Deno.env.get('DROPBOX_APP_KEY')
  const appSecret = Deno.env.get('DROPBOX_APP_SECRET')
  const refresh = Deno.env.get('DROPBOX_REFRESH_TOKEN')
  const userId = Deno.env.get('SUPERNOTE_USER_ID')
  if (!url || !serviceKey || !appKey || !appSecret || !refresh || !userId) {
    return json({ error: 'Missing server config' }, 500)
  }
  if (req.headers.get('Authorization') !== `Bearer ${serviceKey}`) {
    return json({ error: 'Service role only' }, 401)
  }

  const service = createClient(url, serviceKey)

  try {
    const { data: checkpoint } = await service
      .from('capture_checkpoints')
      .select('last_processed_at')
      .eq('user_id', userId)
      .eq('source_key', SOURCE_KEY)
      .maybeSingle()

    // A cold start ARMS the checkpoint and ingests nothing — linking Dropbox
    // must never sweep in a year of old exports.
    const nowIso = new Date().toISOString()
    if (!checkpoint) {
      await service.from('capture_checkpoints').upsert({
        user_id: userId, source_key: SOURCE_KEY, last_processed_at: nowIso, updated_at: nowIso,
      })
      return json({ ok: true, processed: 0, failed: 0, armed: true })
    }

    const accessToken = await dropboxAccessToken(appKey, appSecret, refresh)
    const fresh = selectNewFiles(await listFolder(accessToken), checkpoint.last_processed_at, PER_RUN_CAP)
    if (fresh.length === 0) return json({ ok: true, processed: 0, failed: 0 })

    const { data: members } = await service
      .from('family_members')
      .select('id, name')
      .eq('user_id', userId)

    const placeStart = ymdIn(TZ, 0)
    const placeEnd = ymdIn(TZ, WINDOW_DAYS - 1)

    let processed = 0
    let failed = 0
    const attempted: DropboxEntry[] = []

    for (const entry of fresh) {
      attempted.push(entry)
      const ext = entry.name.slice(entry.name.lastIndexOf('.') + 1).toLowerCase()
      const storagePath = `${userId}/supernote/${crypto.randomUUID()}.${ext}`
      let captureId: string | null = null
      try {
        const blob = await download(accessToken, entry.path_lower)
        const { error: upErr } = await service.storage
          .from('attachments')
          .upload(storagePath, blob, { contentType: ext === 'pdf' ? 'application/pdf' : `image/${ext}`, upsert: true })
        if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)

        const { data: capture, error: capErr } = await service
          .from('captures')
          .insert({
            user_id: userId,
            kind: 'image',
            source_key: SOURCE_KEY,
            source_label: entry.name,
            status: 'pending',
          })
          .select('id')
          .single()
        if (capErr || !capture) throw new Error(`Capture insert failed: ${capErr?.message}`)
        captureId = capture.id

        const parseRes = await fetch(`${url}/functions/v1/parse-page`, {
          method: 'POST',
          headers: { authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            storagePath,
            userId,
            placeStart,
            placeEnd,
            today: placeStart,
            members: members ?? [],
          }),
        })
        const parsed = await parseRes.json()
        if (!parseRes.ok || parsed?.error) throw new Error(String(parsed?.error ?? `parse-page ${parseRes.status}`))

        // A page the model read as blank is not review-worthy — drop the row
        // rather than surface an empty sheet.
        const empty = !parsed.items?.length && !parsed.notes?.length && !parsed.unclear?.length
        if (empty) {
          await service.from('captures').delete().eq('id', captureId)
        } else {
          await service
            .from('captures')
            .update({
              status: 'extracted',
              raw_text: JSON.stringify({
                items: parsed.items,
                notes: parsed.notes,
                unclear: parsed.unclear,
                window: parsed.window,
                storagePath,
              }),
            })
            .eq('id', captureId)
        }
        processed++
      } catch (e) {
        failed++
        const message = e instanceof Error ? e.message : String(e)
        console.error(`dropbox-poll: ${entry.name} failed:`, message)
        if (captureId) {
          await service.from('captures').update({ status: 'failed', error: message.slice(0, 300) }).eq('id', captureId)
        }
        // Deliberately continue: one unreadable file must not stall the folder.
      }
    }

    // Past what we ATTEMPTED — succeeded or failed — never now(). A file that
    // landed mid-run, or fell past the cap, waits for the next tick.
    const advanced = maxServerModified(attempted, checkpoint.last_processed_at)
    await service.from('capture_checkpoints').upsert({
      user_id: userId, source_key: SOURCE_KEY, last_processed_at: advanced, updated_at: new Date().toISOString(),
    })

    return json({ ok: true, processed, failed })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('dropbox-poll failed:', message)
    return json({ error: message }, 500)
  }
})
```

- [ ] **Step 2: Confirm the family_members column names**

The poller reads `family_members(id, name)` scoped by `user_id`. Verify that shape before deploying:

```bash
grep -rn "from('family_members')" src/hooks/useFamilyMembers.ts | head -3
```

If the scoping column is not `user_id`, match whatever `useFamilyMembers` uses.

- [ ] **Step 3: Type-check and commit**

```bash
npx vitest run supabase/functions/dropbox-poll
git add supabase/functions/dropbox-poll/index.ts
git commit -m "feat(supernote): dropbox-poll stages exported pages for review"
```

---

### Task 8: SQL and provisioning

**Files:**
- Create: `supabase/migrations/2026-08-25_supernote_ingest.sql`
- Create: `docs/supernote-setup.md`

**Interfaces:**
- Consumes: the `dropbox-poll` function (Task 7).
- Produces: the `captures_owner_delete` RLS policy the review sheet needs (Task 9), and a `supernote_poll()` cron job.

**Do not run this SQL yourself.** The Management API curl is blocked by the request classifier. Write the file, print it, and hand it to Scott.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/2026-08-25_supernote_ingest.sql`:

```sql
-- Supernote scratchpad ingest: the RLS gap the review sheet needs, plus the
-- poll job. RUN BY HAND in the Supabase SQL editor — migrations in this repo
-- are out of sync with the deployed database.

-- captures shipped with a SELECT policy only, so a client could see a staged
-- page but never clear it. Reviewing a page deletes its row (the image
-- survives as an attachment, the tasks and notes stand on their own).
DROP POLICY IF EXISTS captures_owner_delete ON captures;
CREATE POLICY captures_owner_delete ON captures
  FOR DELETE USING (auth.uid() = user_id);

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION supernote_poll()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  service_role_key text;
BEGIN
  -- Managed Postgres denies ALTER DATABASE SET for custom GUCs (42501), so the
  -- key lives in Vault; the GUC remains only as a local-stack fallback.
  BEGIN
    SELECT decrypted_secret INTO service_role_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    service_role_key := NULL;
  END;
  IF service_role_key IS NULL THEN
    service_role_key := current_setting('app.settings.service_role_key', true);
  END IF;
  IF service_role_key IS NULL THEN
    RAISE NOTICE 'supernote_poll: no service key in vault or settings; skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/dropbox-poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb,
    -- Up to 10 pages x one vision call each; pg_net's 5s default would record
    -- a misleading timeout on every run that actually had work to do.
    timeout_milliseconds := 300000
  );
END;
$$;

-- SECURITY DEFINER functions in public default to EXECUTE TO PUBLIC, which
-- PostgREST exposes to the anon key — an unauthenticated caller could then
-- trigger LLM-billed runs. pg_cron invokes this as its owner and needs no
-- PostgREST-reachable grant at all.
REVOKE EXECUTE ON FUNCTION supernote_poll() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('supernote-poll')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'supernote-poll');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.schedule('supernote-poll', '*/15 * * * *', 'SELECT supernote_poll();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available; supernote-poll not scheduled.';
END;
$$;
```

- [ ] **Step 2: Write the setup doc**

Create `docs/supernote-setup.md`:

```markdown
# Supernote → Symphony setup

One-time provisioning for the scratchpad ingest pipeline. Spec:
`docs/superpowers/specs/2026-08-25-supernote-scratchpad-ingest-design.md`

## 1. Link the tablet

Supernote → Settings → Sync → Dropbox → link the account. The device creates
`/Supernote/` in the Dropbox root with `Note/`, `Document/`, and `EXPORT/`.

**The trigger is Export, not sync.** Symphony only ever reads
`/Supernote/EXPORT`. A page enters the pipeline when you export it; nothing you
merely write is ingested.

## 2. Create the Dropbox app

Dropbox App Console → Create app → **Scoped access** → **Full Dropbox**.

Full access is unavoidable: Supernote syncs to the account root and offers no
app-folder target. The mitigation is on our side — `dropbox-poll` reads one
hard-coded path and takes no path parameter.

Permissions tab: enable `files.metadata.read` and `files.content.read`, then
**Submit**. Generate a refresh token with `token_access_type=offline`.

## 3. Set the function secrets

```bash
npx supabase secrets set \
  DROPBOX_APP_KEY=... \
  DROPBOX_APP_SECRET=... \
  DROPBOX_REFRESH_TOKEN=... \
  SUPERNOTE_USER_ID=... \
  --project-ref mwadppyrqzuzgstmwpuy
```

`SUPERNOTE_USER_ID` is Scott's `auth.users.id`.

## 4. Deploy the functions

```bash
npx supabase functions deploy parse-page --project-ref mwadppyrqzuzgstmwpuy
npx supabase functions deploy dropbox-poll --project-ref mwadppyrqzuzgstmwpuy
```

## 5. Run the SQL

Paste `supabase/migrations/2026-08-25_supernote_ingest.sql` into the Supabase
SQL editor and run it. It adds the `captures` DELETE policy and schedules
`supernote-poll` every 15 minutes.

## 6. First run

The first poll **arms the checkpoint and ingests nothing** — that is deliberate,
so linking Dropbox does not sweep in a year of old exports. Export a page after
the first run and it appears in the Symphony inbox within 15 minutes.

## Troubleshooting

- **Nothing appears:** `select * from cron.job_run_details where jobname = 'supernote-poll' order by start_time desc limit 5;`
- **A page failed:** `select source_label, status, error from captures where source_key = 'supernote:export' order by created_at desc limit 10;`
- **Reset the watermark:** `delete from capture_checkpoints where source_key = 'supernote:export';` — the next run re-arms it (and still ingests nothing).
```

- [ ] **Step 3: Hand the SQL to Scott and commit**

Print the migration file for him and say plainly that it needs to be run in the SQL editor before Task 9 can be verified.

```bash
git add supabase/migrations/2026-08-25_supernote_ingest.sql docs/supernote-setup.md
git commit -m "chore(supernote): cron job, captures delete policy, and setup doc"
```

---

### Task 9: The pending-page section in the inbox

**Files:**
- Create: `src/hooks/usePendingPages.ts`
- Create: `src/components/capture/SupernotePagesSection.tsx`
- Create: `src/components/capture/SupernotePagesSection.test.tsx`
- Modify: `src/components/schedule/InboxView.tsx` (insert the section immediately after `</header>`, above `<HomeNeedsDetailsSection />`)

**Interfaces:**
- Consumes: `validatePageResult`/`PageResult` (Task 1), `PageReviewSheet`/`PageReviewPayload` (Task 4), `useCommitPage` (Task 5), the `captures` rows written by `dropbox-poll` (Task 7), the DELETE policy (Task 8).
- Produces:
  ```ts
  export interface PendingPage {
    captureId: string
    label: string
    createdAt: Date
    result: PageResult
  }
  export function usePendingPages(memberIds: Set<string>): {
    pages: PendingPage[]
    loading: boolean
    dismiss: (captureId: string) => Promise<void>
    refresh: () => Promise<void>
  }
  ```

- [ ] **Step 1: Write the hook**

Create `src/hooks/usePendingPages.ts`:

```ts
// src/hooks/usePendingPages.ts
//
// Pages the Dropbox poller has read but Scott has not reviewed. A page is
// staged, never committed — the poller runs while he is elsewhere, so the
// review is the only place a page becomes tasks and notes.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { validatePageResult, type PageResult } from '@/lib/pageParse'

export const SUPERNOTE_SOURCE_KEY = 'supernote:export'

export interface PendingPage {
  captureId: string
  label: string
  createdAt: Date
  result: PageResult
}

interface CaptureRow {
  id: string
  source_label: string | null
  raw_text: string | null
  created_at: string
}

export function usePendingPages(memberIds: Set<string>) {
  const [pages, setPages] = useState<PendingPage[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('captures')
      .select('id, source_label, raw_text, created_at')
      .eq('kind', 'image')
      .eq('source_key', SUPERNOTE_SOURCE_KEY)
      .eq('status', 'extracted')
      .order('created_at', { ascending: true })

    const rows = (data ?? []) as CaptureRow[]
    setPages(
      rows.flatMap((row) => {
        if (!row.raw_text) return []
        try {
          // The window comes from the stored result — a page parsed last night
          // must be reviewed against the dates the model was shown, not today's.
          const result = validatePageResult(JSON.parse(row.raw_text), memberIds, [])
          return [{
            captureId: row.id,
            label: row.source_label ?? 'Page',
            createdAt: new Date(row.created_at),
            result,
          }]
        } catch {
          return []
        }
      }),
    )
    setLoading(false)
  }, [memberIds])

  useEffect(() => { void refresh() }, [refresh])

  const dismiss = useCallback(async (captureId: string) => {
    await supabase.from('captures').delete().eq('id', captureId)
    setPages((prev) => prev.filter((p) => p.captureId !== captureId))
  }, [])

  return { pages, loading, dismiss, refresh }
}
```

- [ ] **Step 2: Write the failing component test**

Create `src/components/capture/SupernotePagesSection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { SupernotePagesSection } from './SupernotePagesSection'
import type { PendingPage } from '@/hooks/usePendingPages'

const dismiss = vi.fn()
const commitPage = vi.fn().mockResolvedValue(undefined)
let pages: PendingPage[] = []

vi.mock('@/hooks/usePendingPages', () => ({
  usePendingPages: () => ({ pages, loading: false, dismiss, refresh: vi.fn() }),
  SUPERNOTE_SOURCE_KEY: 'supernote:export',
}))
vi.mock('@/hooks/useCommitPage', () => ({ useCommitPage: () => ({ commitPage }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({ members: [], getCurrentUserMember: () => undefined }),
}))

const PAGE: PendingPage = {
  captureId: 'c-1',
  label: '20260825_090000.png',
  createdAt: new Date('2026-08-25T09:00:00Z'),
  result: {
    items: [{ title: 'Call dentist', placement: { kind: 'inbox' }, assigneeId: null, note: null }],
    notes: [],
    unclear: [],
    windowDates: ['2026-08-25'],
    storagePath: 'u/supernote/a.png',
  },
}

beforeEach(() => {
  pages = []
  dismiss.mockClear()
  commitPage.mockClear()
})

describe('SupernotePagesSection', () => {
  it('renders nothing when no page is waiting', () => {
    const { container } = render(<SupernotePagesSection />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows one quiet line per waiting page', () => {
    pages = [PAGE]
    render(<SupernotePagesSection />)
    expect(screen.getByRole('button', { name: /review page/i })).toBeInTheDocument()
  })

  it('opens the review sheet and commits with the page storage path', async () => {
    const user = userEvent.setup()
    pages = [PAGE]
    render(<SupernotePagesSection />)
    await user.click(screen.getByRole('button', { name: /review page/i }))
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    expect(commitPage).toHaveBeenCalledWith({
      items: [expect.objectContaining({ title: 'Call dentist' })],
      notes: [],
      storagePath: 'u/supernote/a.png',
    })
    expect(dismiss).toHaveBeenCalledWith('c-1')
  })

  it('dismisses a page without committing anything', async () => {
    const user = userEvent.setup()
    pages = [PAGE]
    render(<SupernotePagesSection />)
    await user.click(screen.getByRole('button', { name: /dismiss page/i }))
    expect(dismiss).toHaveBeenCalledWith('c-1')
    expect(commitPage).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/capture/SupernotePagesSection.test.tsx`
Expected: FAIL — `Failed to resolve import "./SupernotePagesSection"`.

- [ ] **Step 4: Write the component**

Create `src/components/capture/SupernotePagesSection.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { NotebookPen, X } from 'lucide-react'
import { usePendingPages } from '@/hooks/usePendingPages'
import { useCommitPage } from '@/hooks/useCommitPage'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { PageReviewSheet, type PageReviewPayload } from '@/components/capture/PageReviewSheet'

/**
 * One quiet line per page the Supernote poller has read and nobody has looked
 * at yet. Deliberately not a count or a scoreboard — a waiting page is a thing
 * to do, and it disappears the moment it is done.
 */
export function SupernotePagesSection() {
  const { members, getCurrentUserMember } = useFamilyMembers()
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members])
  const { pages, dismiss } = usePendingPages(memberIds)
  const { commitPage } = useCommitPage()
  const [openId, setOpenId] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)

  const open = pages.find((p) => p.captureId === openId) ?? null

  const handleCommit = async (payload: PageReviewPayload) => {
    if (!open) return
    setCommitting(true)
    try {
      await commitPage({ ...payload, storagePath: open.result.storagePath })
      await dismiss(open.captureId)
      setOpenId(null)
    } finally {
      setCommitting(false)
    }
  }

  if (pages.length === 0) return null

  return (
    <>
      <div className="mb-6 space-y-2">
        {pages.map((page) => (
          <div key={page.captureId} className="flex items-center gap-3 rounded-xl border border-neutral-200/70 bg-white px-3 py-2">
            <NotebookPen className="w-4 h-4 text-primary-600 shrink-0" />
            <span className="flex-1 min-w-0 text-[14px] text-neutral-700 truncate">
              Page from{' '}
              {page.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => setOpenId(page.captureId)}
              aria-label={`Review page from ${page.label}`}
              className="text-[13px] font-medium px-2.5 py-1 rounded-lg text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors shrink-0"
            >
              Review
            </button>
            <button
              type="button"
              onClick={() => void dismiss(page.captureId)}
              aria-label={`Dismiss page from ${page.label}`}
              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {open && (
        <PageReviewSheet
          items={open.result.items}
          notes={open.result.notes}
          unclear={open.result.unclear}
          windowDates={open.result.windowDates}
          members={members}
          committing={committing}
          onCommit={(payload) => void handleCommit(payload)}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  )
}
```

`getCurrentUserMember` is destructured for parity with the other consumers of the hook; if ESLint flags it as unused, drop it from the destructure.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/capture/SupernotePagesSection.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Mount it in the inbox**

In `src/components/schedule/InboxView.tsx`, add the import beside the other component imports:

```tsx
import { SupernotePagesSection } from '@/components/capture/SupernotePagesSection'
```

and insert the section immediately after the closing `</header>` tag, directly above `<HomeNeedsDetailsSection />`:

```tsx
      </header>

      <SupernotePagesSection />

      <HomeNeedsDetailsSection />
```

- [ ] **Step 7: Verify the whole suite and look at it**

```bash
npx vitest run
npx tsc --noEmit -p tsconfig.app.json
npm run lint
```
Expected: all green.

Then open the app and look. With the SQL from Task 8 run and a real page exported, the Inbox shows one `Page from <date>` line, Review opens the sheet, and committing produces the tasks and notes while the line disappears. If Scott has not provisioned Dropbox yet, verify against a hand-inserted row:

```sql
insert into captures (user_id, kind, source_key, source_label, status, raw_text)
values ('<user-id>', 'image', 'supernote:export', 'test.png', 'extracted',
  '{"items":[{"title":"Call dentist","day":"inbox","assignee_id":null,"note":null}],"notes":[],"unclear":[],"window":["2026-08-25"],"storagePath":null}');
```

- [ ] **Step 8: Commit and push**

```bash
git add -A
git commit -m "feat(supernote): the inbox surfaces pages waiting for review"
git push origin HEAD
```

---

## Rollout

Phase 1 (Tasks 1–5) is independently useful: deploy `parse-page`, and the file
picker reads any page Scott drags out of Dropbox. Phase 2 (Tasks 6–9) needs
Scott's provisioning from `docs/supernote-setup.md` before it can be verified
end to end.

Merge to `main` only after `npx vitest run`, `npx tsc --noEmit -p
tsconfig.app.json`, and `npm run lint` are all green — a push to `main`
auto-deploys to production.
