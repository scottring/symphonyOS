# Paper pipeline fixes — Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The review sheet reads what the page says, shares by domain, never invents a date, and lands you on the page you filled.

**Architecture:** Pure rules live in `src/lib/planParse.ts` (+ a new `src/lib/planAssign.ts` and `src/lib/planTitle.ts`) and are mirrored in the edge function's `parse.ts` so both layers agree. The sheet (`PageReviewSheet`) becomes a thin editor over those rules; `useCommitPage` writes domain/scope/notes/phone/lineage on the INSERT and returns a landing route; `PageFromPaperFlow` navigates.

**Tech Stack:** React 19 + TS strict, Vitest + RTL, Supabase (PostgREST + Deno edge fn `parse-page`).

**Spec:** `docs/superpowers/specs/2026-09-06-demo-run-2-fixes-and-first-week-card-design.md` — Parts A, B1, C.

## Global Constraints

- Node 22.14.0 (`export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:$PATH"`); tests via `npx vitest run <file>`; typecheck via `npx tsc -p tsconfig.app.json --noEmit`.
- Worktree: `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/demo-run-2-fixes`, branch `fix/demo-run-2`. Never touch the main worktree.
- Scope is DERIVED (`scopeForDomain`), never chosen. No scope picker anywhere.
- Every field a task needs rides the INSERT (`addTask` options) — never addTask-then-update.
- No emoji; lucide icons. Copy in sentence case. No counts on Today.
- `connectors/` needs `npm install` in this worktree or pre-push fails — already done.
- Commit after every task with the trailer:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01NKRodBgnQgrLjvYjYB12n8`.
- Edge function deploy (Task 11) is `npx supabase functions deploy parse-page --use-api --project-ref mwadppyrqzuzgstmwpuy` — deploy BEFORE the client that depends on it reaches main.

---

### Task 1: `PlanItem` carries dateHint / kind / recurring / phone; validate reads them; emphasis notes dropped

**Files:**
- Modify: `src/lib/planParse.ts`
- Test: `src/lib/planParse.test.ts` (append)

**Interfaces:**
- Produces:
  ```ts
  export interface PlanRecurring { days: Array<'sun'|'mon'|'tue'|'wed'|'thu'|'fri'|'sat'>; until: string | null }
  export interface PlanItem {
    title: string; placement: PlanPlacement; goal?: boolean; time: string | null
    assigneeId: string | null; note: string | null
    /** The raw YYYY-MM-DD the line named, even when the row was degraded. */
    dateHint: string | null
    /** 'dayfact' = "no school" / holiday; 'recurring' = "every Sat" / "Sat mornings thru Nov". */
    kind: 'task' | 'dayfact' | 'recurring'
    recurring: PlanRecurring | null
    phone: string | null
    /** Set by the sheet's duplicate pass: link the new row to this existing task. */
    sourceId?: string
  }
  export const EMPHASIS_NOTE = /^(starred|star|priority|important|underlined|circled|highlighted)$/i
  export function isEmphasisNote(note: string | null): boolean
  ```

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/planParse.test.ts`:

```ts
describe('validatePlanItems — new fields', () => {
  const win = ['2026-09-06', '2026-09-07', '2026-09-08']
  const members = new Set(['m1'])

  it('keeps the raw date_hint even when the row is degraded out of window', () => {
    const [item] = validatePlanItems({ items: [{ title: 'Recital', day: 'season', date_hint: '2026-12-12', time: null, assignee_id: null, note: null }] }, win, members, 'season')
    expect(item.placement).toEqual({ kind: 'season' })
    expect(item.dateHint).toBe('2026-12-12')
  })

  it('reads kind and recurring', () => {
    const [a, b] = validatePlanItems({ items: [
      { title: 'No school – Labor Day', day: '2026-09-07', kind: 'dayfact', time: null, assignee_id: null, note: null },
      { title: 'Liam soccer', day: 'season', kind: 'recurring', recurring: { days: ['sat'], until: '2026-11-30' }, time: '09:00', assignee_id: null, note: null },
    ] }, win, members, 'season')
    expect(a.kind).toBe('dayfact')
    expect(b.kind).toBe('recurring')
    expect(b.recurring).toEqual({ days: ['sat'], until: '2026-11-30' })
    // a recurring row keeps its time even though its placement is not a date
    expect(b.time).toBe('09:00')
  })

  it('defaults kind to task and drops junk recurring days', () => {
    const [item] = validatePlanItems({ items: [{ title: 'x', day: 'week', kind: 'recurring', recurring: { days: ['sat', 'caturday'], until: 'soon' } }] }, win, members)
    expect(item.kind).toBe('recurring')
    expect(item.recurring).toEqual({ days: ['sat'], until: null })
  })

  it('reads a phone number and drops emphasis-only notes', () => {
    const [a, b] = validatePlanItems({ items: [
      { title: 'Call Dr. Park', day: 'week', phone: '410-555-0142', note: 'ask for Renee' },
      { title: 'Less phone at dinner', day: 'goal', note: 'starred' },
    ] }, win, members, 'year')
    expect(a.phone).toBe('410-555-0142')
    expect(a.note).toBe('ask for Renee')
    expect(b.note).toBeNull()
  })

  it('drops a note that only repeats the title', () => {
    const [a] = validatePlanItems({ items: [{ title: 'Book dentist checkups for both kids', day: 'month', note: 'both kids' }] }, win, members, 'month')
    expect(a.note).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/planParse.test.ts`
Expected: FAIL — `dateHint`/`kind` undefined, emphasis note kept.

- [ ] **Step 3: Implement**

In `src/lib/planParse.ts`:

```ts
export type PlanDay = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
const PLAN_DAYS: readonly PlanDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
export interface PlanRecurring { days: PlanDay[]; until: string | null }

export interface PlanItem {
  title: string
  placement: PlanPlacement
  goal?: boolean
  time: string | null
  assigneeId: string | null
  note: string | null
  /** The raw YYYY-MM-DD the line named, kept even when the row was degraded
   *  out of the window — so a chip flip can put the date back (spec C2). */
  dateHint: string | null
  /** A day-fact ("no school") is not a to-do; a recurring line is a routine. */
  kind: 'task' | 'dayfact' | 'recurring'
  recurring: PlanRecurring | null
  phone: string | null
  /** Lineage chosen on the sheet: the existing task this row is a copy of. */
  sourceId?: string
}

/** A ★, an underline, a circle on the page is emphasis, not content. */
export const EMPHASIS_NOTE = /^(starred|star|priority|important|underlined|circled|highlighted)\.?$/i
export function isEmphasisNote(note: string | null): boolean {
  return !!note && EMPHASIS_NOTE.test(note.trim())
}

const PHONE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/

function cleanNote(title: string, note: unknown): string | null {
  if (typeof note !== 'string') return null
  const n = note.trim()
  if (!n || isEmphasisNote(n)) return null
  // "both kids" under "Book dentist checkups for both kids" says nothing new.
  if (title.toLowerCase().includes(n.toLowerCase())) return null
  return n
}

function readRecurring(raw: unknown): PlanRecurring | null {
  const r = raw as { days?: unknown; until?: unknown } | null
  if (!r || typeof r !== 'object') return null
  const days = Array.isArray(r.days) ? r.days.filter((d): d is PlanDay => typeof d === 'string' && (PLAN_DAYS as readonly string[]).includes(d)) : []
  const until = typeof r.until === 'string' && YMD.test(r.until) ? r.until : null
  return { days, until }
}
```

and in `validatePlanItems`, extend the entry type and the pushed object:

```ts
    const e = entry as { title?: unknown; day?: unknown; time?: unknown; assignee_id?: unknown; note?: unknown; date_hint?: unknown; kind?: unknown; recurring?: unknown; phone?: unknown }
    ...
    const kind: PlanItem['kind'] = e.kind === 'dayfact' || e.kind === 'recurring' ? e.kind : 'task'
    const recurring = kind === 'recurring' ? (readRecurring(e.recurring) ?? { days: [], until: null }) : null
    const title = e.title.trim()
    out.push({
      title,
      placement,
      ...(goalOnPage ? { goal: true } : {}),
      // A time survives on a real date, or on a recurring line (it becomes the routine's time).
      time: (placement.kind === 'date' || kind === 'recurring') && typeof e.time === 'string' && HHMM.test(e.time.trim()) ? e.time.trim() : null,
      assigneeId: typeof e.assignee_id === 'string' && memberIds.has(e.assignee_id) ? e.assignee_id : null,
      note: cleanNote(title, e.note),
      dateHint: typeof e.date_hint === 'string' && YMD.test(e.date_hint) ? e.date_hint : (YMD.test(day) ? day : null),
      kind,
      recurring,
      phone: typeof e.phone === 'string' && PHONE.test(e.phone) ? e.phone.trim() : null,
    })
```

Update every literal `PlanItem` in the repo that now fails to typecheck (sheet `promoteToTask`, tests, `useCommitPage.test.ts` fixtures): add `dateHint: null, kind: 'task', recurring: null, phone: null`.

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/lib/planParse.test.ts src/lib/pageParse.test.ts src/hooks/useCommitPage.test.ts && npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planParse.ts src/lib/planParse.test.ts src/components/capture/PageReviewSheet.tsx src/hooks/useCommitPage.test.ts
git commit -m "feat(paper): PlanItem carries dateHint, kind, recurring, phone; emphasis and echo notes dropped"
```

---

### Task 2: Re-windowing — `planWindowDates` takes an explicit period start; `rewindowPlanItems` moves dates in and out

**Files:**
- Modify: `src/lib/planParse.ts`
- Test: `src/lib/planParse.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function planWindowDates(today: Date, altitude?: PageAltitude, seasons?: Seasons, periodStart?: Date): string[]
  /** Re-place items against a new window without a second model call (spec C2). */
  export function rewindowPlanItems(items: PlanItem[], windowDates: string[], altitude: PageAltitude): PlanItem[]
  ```

- [ ] **Step 1: Failing tests**

```ts
describe('planWindowDates with an explicit period start', () => {
  const seasons = [
    { name: 'Winter', month: 12, day: 1 }, { name: 'Spring', month: 3, day: 1 },
    { name: 'Summer', month: 6, day: 1 }, { name: 'Fall', month: 9, day: 1 },
  ] as const
  it('a month page for October, snapped Sep 6, runs Sep 6 → Oct 31', () => {
    const d = planWindowDates(new Date(2026, 8, 6), 'month', seasons, new Date(2026, 9, 1))
    expect(d[0]).toBe('2026-09-06'); expect(d[d.length - 1]).toBe('2026-10-31')
  })
  it('a season page for Fall, snapped Aug 20, runs Aug 20 → Nov 30', () => {
    const d = planWindowDates(new Date(2026, 7, 20), 'season', seasons, new Date(2026, 8, 1))
    expect(d[0]).toBe('2026-08-20'); expect(d[d.length - 1]).toBe('2026-11-30')
  })
})

describe('rewindowPlanItems', () => {
  const base = { time: null, assigneeId: null, note: null, kind: 'task' as const, recurring: null, phone: null }
  it('a degraded row whose dateHint is now inside the window becomes a date again', () => {
    const [r] = rewindowPlanItems([{ ...base, title: 'Recital', placement: { kind: 'season' }, dateHint: '2026-12-12' }], ['2026-12-11', '2026-12-12'], 'season')
    expect(r.placement).toEqual({ kind: 'date', date: '2026-12-12' })
  })
  it('a dated row that falls outside the new window degrades to the altitude and keeps its hint', () => {
    const [r] = rewindowPlanItems([{ ...base, title: 'Flights', placement: { kind: 'date', date: '2026-10-01' }, dateHint: '2026-10-01', time: '09:00' }], ['2026-09-06'], 'month')
    expect(r.placement).toEqual({ kind: 'month' })
    expect(r.dateHint).toBe('2026-10-01')
    expect(r.time).toBeNull()
  })
  it('leaves horizon rows without a hint alone', () => {
    const [r] = rewindowPlanItems([{ ...base, title: 'x', placement: { kind: 'someday' }, dateHint: null }], ['2026-09-06'], 'week')
    expect(r.placement).toEqual({ kind: 'someday' })
  })
})
```

- [ ] **Step 2: Run** — `npx vitest run src/lib/planParse.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
export function planWindowDates(today: Date, altitude: PageAltitude = 'week', seasons: Seasons = readSeasons(), periodStart?: Date): string[] {
  if (altitude === 'year') return []
  const cursor = new Date(today); cursor.setHours(0, 0, 0, 0)
  const end = new Date(cursor)
  if (altitude === 'month') {
    // Through the end of the month the page is FOR (default: next month's end).
    const target = periodStart ?? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    end.setTime(new Date(target.getFullYear(), target.getMonth() + 1, 0).getTime())
  } else if (altitude === 'season') {
    const start = periodStart ?? pageSeasonStart(cursor, seasons)
    const exclusiveEnd = seasonEndFor(start, seasons)
    end.setTime(exclusiveEnd.getTime()); end.setDate(end.getDate() - 1)
  } else {
    end.setDate(end.getDate() + PLAN_WINDOW_DAYS - 1)
  }
  const out: string[] = []
  while (cursor <= end) { out.push(localYmd(cursor)); cursor.setDate(cursor.getDate() + 1) }
  return out
}

export function rewindowPlanItems(items: PlanItem[], windowDates: string[], altitude: PageAltitude): PlanItem[] {
  const win = new Set(windowDates)
  return items.map((item) => {
    if (item.placement.kind === 'goal' || item.placement.kind === 'inbox' || item.placement.kind === 'someday') return item
    if (item.dateHint && win.has(item.dateHint)) {
      return { ...item, placement: { kind: 'date', date: item.dateHint } }
    }
    if (item.placement.kind === 'date' && !win.has(item.placement.date)) {
      return { ...item, placement: defaultPlacement(altitude), time: null, ...(altitude === 'month' || altitude === 'season' ? {} : {}) }
    }
    return item
  })
}
```

Note: the previous default for a month page (today → end of NEXT month) is preserved when `periodStart` is absent — `pageMonthStart` callers keep their behaviour.

- [ ] **Step 4: Run** — PASS. `npx tsc -p tsconfig.app.json --noEmit` clean.
- [ ] **Step 5: Commit** — `git commit -am "feat(paper): window for an explicit period; rewindowPlanItems moves dates in and out"`

---

### Task 3: Page title decides the period — `periodFromTitle`

**Files:**
- Create: `src/lib/planTitle.ts`
- Test: `src/lib/planTitle.test.ts`
- Modify: `src/lib/pageParse.ts` (read `page_title` echo → `PageResult.titlePeriod`)

**Interfaces:**
- Produces:
  ```ts
  export type TitlePeriod = { kind: 'season'; start: Date; label: string } | { kind: 'month'; start: Date } | { kind: 'year'; year: number } | null
  export function periodFromTitle(title: string | null | undefined, today: Date, seasons: Seasons): TitlePeriod
  // PageResult gains: pageTitle: string | null; titlePeriod: TitlePeriod
  ```

- [ ] **Step 1: Failing tests** (`src/lib/planTitle.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { periodFromTitle } from '@/lib/planTitle'
const seasons = [
  { name: 'Winter', month: 12, day: 1 }, { name: 'Spring', month: 3, day: 1 },
  { name: 'Summer', month: 6, day: 1 }, { name: 'Fall', month: 9, day: 1 },
] as const
const today = new Date(2026, 8, 6)

describe('periodFromTitle', () => {
  it('names a season with a year', () => {
    expect(periodFromTitle('Fall 2026', today, seasons)).toEqual({ kind: 'season', start: new Date(2026, 8, 1), label: 'Fall 2026' })
  })
  it('a season with no year is the next occurrence on or after this season', () => {
    expect(periodFromTitle('winter', today, seasons)).toEqual({ kind: 'season', start: new Date(2026, 11, 1), label: 'Winter 2026' })
  })
  it('a bare month is this year unless it has passed, then next year', () => {
    expect(periodFromTitle('September', today, seasons)).toEqual({ kind: 'month', start: new Date(2026, 8, 1) })
    expect(periodFromTitle('October', today, seasons)).toEqual({ kind: 'month', start: new Date(2026, 9, 1) })
    expect(periodFromTitle('March', today, seasons)).toEqual({ kind: 'month', start: new Date(2027, 2, 1) })
  })
  it('a year', () => { expect(periodFromTitle('2026', today, seasons)).toEqual({ kind: 'year', year: 2026 }) })
  it('anything else is null', () => {
    expect(periodFromTitle('Week of Sept 7', today, seasons)).toBeNull()
    expect(periodFromTitle(null, today, seasons)).toBeNull()
  })
})
```

- [ ] **Step 2: Run** → FAIL (module missing).

- [ ] **Step 3: Implement** `src/lib/planTitle.ts`

```ts
import type { Seasons } from '@/lib/cadence/seasons'

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december']
const MONTH_ABBR: Record<string, number> = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, sept:8, oct:9, nov:10, dec:11 }

export type TitlePeriod =
  | { kind: 'season'; start: Date; label: string }
  | { kind: 'month'; start: Date }
  | { kind: 'year'; year: number }
  | null

/** What period a page's heading names, if any. "Fall 2026" beats the calendar. */
export function periodFromTitle(title: string | null | undefined, today: Date, seasons: Seasons): TitlePeriod {
  if (!title) return null
  const t = title.trim().toLowerCase().replace(/\s+/g, ' ')
  const yearOnly = /^(20\d{2})$/.exec(t)
  if (yearOnly) return { kind: 'year', year: Number(yearOnly[1]) }

  const season = seasons.find((s) => t === s.name.toLowerCase() || t.startsWith(`${s.name.toLowerCase()} `))
  if (season) {
    const y = /(20\d{2})/.exec(t)
    let year = y ? Number(y[1]) : today.getFullYear()
    let start = new Date(year, season.month - 1, season.day)
    if (!y) {
      // No year written: the next time this season starts, counting the one we are in.
      const thisSeasonEnd = new Date(start); // the season's exclusive end is the next boundary; a start earlier than today's season start means it already passed
      const passed = start < today && !isWithinSeason(today, start, seasons)
      if (passed) { year += 1; start = new Date(year, season.month - 1, season.day) }
      void thisSeasonEnd
    }
    return { kind: 'season', start, label: `${season.name} ${start.getFullYear()}` }
  }

  const m = /^([a-z]+)(?: (20\d{2}))?$/.exec(t)
  if (m) {
    const idx = MONTHS.indexOf(m[1]) >= 0 ? MONTHS.indexOf(m[1]) : (MONTH_ABBR[m[1]] ?? -1)
    if (idx >= 0) {
      let year = m[2] ? Number(m[2]) : today.getFullYear()
      if (!m[2] && idx < today.getMonth()) year += 1
      return { kind: 'month', start: new Date(year, idx, 1) }
    }
  }
  return null
}

function isWithinSeason(date: Date, start: Date, seasons: Seasons): boolean {
  const idx = seasons.findIndex((s) => s.month - 1 === start.getMonth() && s.day === start.getDate())
  const next = idx < seasons.length - 1
    ? new Date(start.getFullYear(), seasons[idx + 1].month - 1, seasons[idx + 1].day)
    : new Date(start.getFullYear() + 1, seasons[0].month - 1, seasons[0].day)
  return date >= start && date < next
}
```

Then in `src/lib/pageParse.ts`: read `r.page_title` (string) into `pageTitle` and compute `titlePeriod: periodFromTitle(pageTitle, new Date(), readSeasons())`; add both to `PageResult` and to the `EMPTY` result in `usePageFromPaper.ts` (`pageTitle: null, titlePeriod: null`).

- [ ] **Step 4: Run** `npx vitest run src/lib/planTitle.test.ts src/lib/pageParse.test.ts` → PASS; tsc clean.
- [ ] **Step 5: Commit** — `git commit -am "feat(paper): the page title names its period (periodFromTitle)"`

---

### Task 4: Assignment is a rule — `src/lib/planAssign.ts`

**Files:**
- Create: `src/lib/planAssign.ts`, `src/lib/planAssign.test.ts`
- Modify: `src/lib/pageParse.ts` (apply after validation; needs members with roles → change `validatePageResult(raw, members: PlanMember[], …)` where `PlanMember = { id: string; name: string; role: string | null }`; keep a `memberIds` Set internally). Update the two callers (`usePageFromPaper.ts`, tests).

**Interfaces:**
```ts
export interface PlanMember { id: string; name: string; role: string | null }
export interface AssignDecision { title: string; assigneeId: string | null; contactMemberId: string | null }
/** The one rule: a named adult does it; a named kid is who it is ABOUT unless the verb is theirs. */
export function decideAssignment(title: string, modelAssigneeId: string | null, members: PlanMember[], isGoal: boolean): AssignDecision
```

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { decideAssignment } from '@/lib/planAssign'
const M = [
  { id: 'a', name: 'Alex', role: 'parent' }, { id: 'e', name: 'Edith', role: 'parent' },
  { id: 'l', name: 'Liam', role: 'child' }, { id: 'm', name: 'Mia', role: 'child' },
]
describe('decideAssignment', () => {
  it('"Edith: sign field trip form" → Edith does it, prefix stripped', () => {
    expect(decideAssignment('Edith: sign field trip form', null, M, false)).toEqual({ title: 'Sign field trip form', assigneeId: 'e', contactMemberId: null })
  })
  it("\"Renew Edith's passport\" keeps the name and assigns Edith", () => {
    expect(decideAssignment("Renew Edith's passport", null, M, false)).toEqual({ title: "Renew Edith's passport", assigneeId: 'e', contactMemberId: null })
  })
  it('"Mia: dentist 10am" → nobody (an adult drives), Mia is the contact, title says whom', () => {
    expect(decideAssignment('Mia: dentist', 'm', M, false)).toEqual({ title: 'Take Mia to dentist', assigneeId: null, contactMemberId: 'm' })
  })
  it('a kid does their own homework and practice', () => {
    expect(decideAssignment('Liam: finish science poster', null, M, false).assigneeId).toBe('l')
    expect(decideAssignment('Liam soccer practice', 'l', M, false).assigneeId).toBe('l')
    expect(decideAssignment('Liam soccer game', null, M, false).assigneeId).toBe('l')
  })
  it('a goal never carries an assignee', () => {
    expect(decideAssignment('Liam reads 20 min every night', 'l', M, true).assigneeId).toBeNull()
  })
  it('an unknown name is left alone', () => {
    expect(decideAssignment('Call Mom back', null, M, false)).toEqual({ title: 'Call Mom back', assigneeId: null, contactMemberId: null })
  })
  it('a model assignee that is an adult is kept even without a name in the title', () => {
    expect(decideAssignment('Book flights', 'e', M, false).assigneeId).toBe('e')
  })
})
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

```ts
export interface PlanMember { id: string; name: string; role: string | null }
export interface AssignDecision { title: string; assigneeId: string | null; contactMemberId: string | null }

const KID_ROLES = new Set(['child', 'kid', 'family'])
// Verbs a kid does for themselves. Everything else about a kid is an adult's errand.
const KID_OWN_VERBS = /\b(finish|do|study|practice|practise|read|reading|homework|clean|tidy|pack|soccer|piano|game|practice|lesson|club|chores?)\b/i
const APPOINTMENT_LIKE = /\b(dentist|doctor|dr\.?|orthodont|checkup|appointment|physical|haircut|shots?)\b/i

function isKid(m: PlanMember): boolean { return !!m.role && KID_ROLES.has(m.role.toLowerCase()) }

function nameAt(title: string, members: PlanMember[]): { member: PlanMember; form: 'prefix' | 'possessive' | 'mention' } | null {
  for (const m of members) {
    const n = m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`^${n}\\s*:`, 'i').test(title)) return { member: m, form: 'prefix' }
    if (new RegExp(`\\b${n}'s\\b`, 'i').test(title)) return { member: m, form: 'possessive' }
    if (new RegExp(`\\b${n}\\b`, 'i').test(title)) return { member: m, form: 'mention' }
  }
  return null
}

export function decideAssignment(title: string, modelAssigneeId: string | null, members: PlanMember[], isGoal: boolean): AssignDecision {
  const clean = title.trim()
  if (isGoal) return { title: clean, assigneeId: null, contactMemberId: null }
  const hit = nameAt(clean, members)
  if (!hit) {
    const model = members.find((m) => m.id === modelAssigneeId)
    // Trust the model only for an adult; a kid with no name in the line is a misread.
    return { title: clean, assigneeId: model && !isKid(model) ? model.id : null, contactMemberId: null }
  }
  const { member, form } = hit
  const rest = form === 'prefix' ? clean.replace(/^[^:]+:\s*/, '') : clean
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  if (!isKid(member)) {
    return { title: cap(rest), assigneeId: member.id, contactMemberId: null }
  }
  // A kid: theirs if the verb is theirs; otherwise an adult's errand ABOUT them.
  if (KID_OWN_VERBS.test(rest) && !APPOINTMENT_LIKE.test(rest)) {
    return { title: cap(form === 'prefix' ? rest : clean), assigneeId: member.id, contactMemberId: null }
  }
  const spoken = form === 'prefix' ? `Take ${member.name} to ${rest.replace(/^(to|the)\s+/i, '')}` : clean
  return { title: cap(spoken), assigneeId: null, contactMemberId: member.id }
}
```

Apply in `validatePageResult`: after `validatePlanItems`, map each item through `decideAssignment(item.title, item.assigneeId, members, item.placement.kind === 'goal' || !!item.goal)` → set `title`, `assigneeId`, and a new `PlanItem.contactMemberId: string | null` (add to the interface in Task 1's shape; `planItemToAddTaskArgs` passes it as `options.contactId` only if `addTask` options support `contactId` — check `useSupabaseTasks.ts:560–600`; if not supported, drop the field on commit but keep it on the item for the sheet's avatar).

- [ ] **Step 4: Run** the four test files + tsc → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(paper): assignment by household role, not by vibe (decideAssignment)"`

---

### Task 5: Commit writes domain, goal notes/scope, phone, lineage, routines, day-facts; returns a landing route

**Files:**
- Modify: `src/hooks/useCommitPage.ts`, `src/lib/planParse.ts` (`PlanCommitContext.context` is now required non-null; add `contactId`, `phoneNumber`, `sourceId` to `PlanAddTaskArgs.options`), `src/hooks/useGoals.ts` + `src/contexts/GoalsContext.tsx` (addGoal signature), `src/components/plan/PeriodPlanPage.tsx` (call site), `src/hooks/useNotes.ts` (no change needed — verify `context` → scope).
- Create: `supabase/migrations/2026-09-06_goals_scope_and_area_optional.sql`
- Test: `src/hooks/useCommitPage.test.ts`, `src/lib/planParse.test.ts`

**Interfaces:**
```ts
export interface CommitPagePayload {
  items: PlanItem[]; notes: PageNote[]; domain: 'work' | 'family' | 'personal'
  monthStart?: Date; seasonStart?: Date; storagePath: string | null
  altitude: PageAltitude
  /** Day-facts that matched a calendar event are dropped by the sheet; the rest arrive here as items with kind 'dayfact'. */
}
export interface CommitPageResult { tasksCreated: number; goalsCreated: number; notesCreated: number; routinesCreated: number; failures: number; route: string; periodLabel: string }
// useGoals: addGoal(areaId: string | null, name: string, context?: 'work'|'family'|'personal', extra?: { notes?: string | null; scope?: Scope }): Promise<Goal | null>
```

Migration (`supabase/migrations/2026-09-06_goals_scope_and_area_optional.sql`):

```sql
-- Goals join the scope axis (tasks/routines/notes have had it since 2026-06-07).
-- A year page written by one partner was invisible to the other: goals were
-- owner-only. Also: an area is optional — a first year page should not have to
-- invent a "General" area to land.
alter table public.goals add column if not exists scope text
  check (scope in ('individual','couple','compound')) not null default 'individual';
alter table public.goals alter column area_id drop not null;
update public.goals set scope = 'compound' where context = 'family' and scope = 'individual';
create index if not exists idx_goals_scope on public.goals(user_id, scope) where scope <> 'individual';

drop policy if exists "Users can read their own goals" on public.goals;
create policy "Users can read household goals" on public.goals for select
  using (auth.uid() = user_id or (scope in ('couple','compound') and users_share_household(auth.uid(), user_id)));
drop policy if exists "Users can update their own goals" on public.goals;
create policy "Users can update household goals" on public.goals for update
  using (auth.uid() = user_id or (scope in ('couple','compound') and users_share_household(auth.uid(), user_id)));
-- insert/delete stay owner-only.
notify pgrst, 'reload schema';
```

- [ ] **Step 1: Failing tests** (append to `src/hooks/useCommitPage.test.ts`; follow the file's existing mock pattern — it mocks `useSupabaseTasks`, `useNotes`, `useFamilyMembers`, `GoalsContext`; add a `useRoutines` mock returning `{ addRoutine: vi.fn(async () => ({ id: 'r1' })) }`)

```ts
it('writes the page domain as context on every task and note', async () => {
  const { result } = renderHook(() => useCommitPage())
  await act(() => result.current.commitPage({ items: [ITEM], notes: [{ title: 'n', content: 'c' }], domain: 'family', storagePath: null, altitude: 'week' }))
  expect(addTask).toHaveBeenCalledWith('Buy milk', undefined, undefined, undefined, expect.objectContaining({ context: 'family' }))
  expect(addNote).toHaveBeenCalledWith(expect.objectContaining({ context: 'family' }))
})

it('a year goal keeps its note and gets the derived scope; no area is invented', async () => {
  const { result } = renderHook(() => useCommitPage())
  await act(() => result.current.commitPage({ items: [{ ...GOAL, note: 'Chicago does not count' }], notes: [], domain: 'family', storagePath: null, altitude: 'year' }))
  expect(addGoal).toHaveBeenCalledWith(null, GOAL.title, 'family', { notes: 'Chicago does not count', scope: 'compound' })
  expect(addArea).not.toHaveBeenCalled()
})

it('a recurring row becomes a routine, not a task', async () => {
  const { result } = renderHook(() => useCommitPage())
  const rec = { ...ITEM, title: 'Liam soccer', kind: 'recurring' as const, recurring: { days: ['sat' as const], until: '2026-11-30' }, time: '09:00', assigneeId: 'l' }
  const res = await act(() => result.current.commitPage({ items: [rec], notes: [], domain: 'family', storagePath: null, altitude: 'season' }))
  expect(addRoutine).toHaveBeenCalledWith(expect.objectContaining({ name: 'Liam soccer', context: 'family', time_of_day: '09:00', recurrence_pattern: expect.objectContaining({ type: 'weekly', days: ['sat'] }) }))
  expect(addTask).not.toHaveBeenCalled()
  expect(res.routinesCreated).toBe(1)
})

it('a day-fact becomes a dated note, not a task', async () => {
  const { result } = renderHook(() => useCommitPage())
  const fact = { ...ITEM, title: 'No school – Labor Day', kind: 'dayfact' as const, placement: { kind: 'date' as const, date: '2026-09-07' }, dateHint: '2026-09-07' }
  await act(() => result.current.commitPage({ items: [fact], notes: [], domain: 'family', storagePath: null, altitude: 'month' }))
  expect(addTask).not.toHaveBeenCalled()
  expect(addNote).toHaveBeenCalledWith(expect.objectContaining({ title: 'Mon, Sep 7 · No school – Labor Day' }))
})

it('returns the landing route for the altitude', async () => {
  const { result } = renderHook(() => useCommitPage())
  const r = await act(() => result.current.commitPage({ items: [], notes: [], domain: 'family', storagePath: null, altitude: 'season', seasonStart: new Date(2026, 8, 1) }))
  expect(r.route).toBe('/season?start=2026-09-01')
  const y = await act(() => result.current.commitPage({ items: [], notes: [], domain: 'family', storagePath: null, altitude: 'year' }))
  expect(y.route).toBe('/year')
})

it('phone and lineage ride the INSERT', async () => {
  const { result } = renderHook(() => useCommitPage())
  await act(() => result.current.commitPage({ items: [{ ...ITEM, phone: '410-555-0142', sourceId: 'src-1' }], notes: [], domain: 'family', storagePath: null, altitude: 'week' }))
  expect(addTask).toHaveBeenCalledWith(expect.any(String), undefined, undefined, undefined, expect.objectContaining({ phoneNumber: '410-555-0142', sourceId: 'src-1' }))
})
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`planParse.ts` — `PlanCommitContext.context: TaskContext` (non-null); `PlanAddTaskArgs.options` gains `contactId?: string; phoneNumber?: string; sourceId?: string`; `planItemToAddTaskArgs` base becomes:

```ts
  const base = {
    assignedTo: item.assigneeId ?? undefined,
    contactId: item.contactMemberId ?? undefined,
    context: ctx.context,
    notes: item.note ?? undefined,
    phoneNumber: item.phone ?? undefined,
    sourceId: item.sourceId,
  }
```
(Check `addTask` options in `useSupabaseTasks.ts:555–600` for the exact names `phoneNumber`, `sourceId`, `contactId`; if `contactId` is absent there, omit it from `base` and leave it on the item.)

`useGoals.ts` — `addGoal(areaId: string | null, name, context?, extra?: { notes?: string | null; scope?: Scope })`: insert `{ …, area_id: areaId, notes: extra?.notes ?? null, scope: extra?.scope ?? scopeForDomain(context ?? null, [], null) }`; optimistic row `areaId: areaId ?? ''` — check `Goal.areaId: string` → make it `string | null` in `src/types/goal.ts` and fix the few readers (`goals.filter(g => g.areaId === area.id)` keeps working). `GoalsContext.tsx` type updated identically. `useGoals` select: remove any `.eq('user_id', user.id)` on the goals/goal_areas reads so RLS returns household goals (verify with grep; if the select filters by user, delete that filter).

`useCommitPage.ts`:

```ts
import { useRoutines } from '@/hooks/useRoutines'
import { scopeForDomain } from '@/lib/scope'
import { localYmd, parseLocalYmd } from '@/lib/cadence/config'
import { seasonLabel } from '@/lib/cadence/seasons'
...
const { addRoutine } = useRoutines()
...
const commitPage = useCallback(async ({ items, notes, storagePath, monthStart, seasonStart, domain, altitude }: CommitPagePayload) => {
  const context = domain
  const now = new Date()
  const commitCtx = { currentWeekStart: weekStartAnchor(now, readCadenceConfig().weekStartsOn), monthStart: monthStart ?? pageMonthStart(now), seasonStart: seasonStart ?? pageSeasonStart(now, readSeasons()), context }
  const defaultAssigneeId = getCurrentUserMember()?.id
  let firstTaskId: string | undefined; let tasksCreated = 0; let failures = 0; let routinesCreated = 0

  const tasks = items.filter((i) => i.placement.kind !== 'goal' && i.kind === 'task')
  for (const item of tasks) { /* unchanged loop body */ }

  // A recurring line is a routine: weekly on the named days, at the named time.
  for (const item of items.filter((i) => i.kind === 'recurring')) {
    const days = item.recurring?.days.length ? item.recurring.days : ['sat' as const]
    const created = await addRoutine({ name: item.title, context, recurrence_pattern: { type: 'weekly', days }, time_of_day: item.time ?? undefined, assigned_to: item.assigneeId ?? undefined })
    if (created) routinesCreated += 1; else failures += 1
  }

  // A day-fact is a note pinned to its day by title — never a checkbox.
  const dayfactNotes: PageNote[] = items.filter((i) => i.kind === 'dayfact').map((i) => {
    const day = i.placement.kind === 'date' ? parseLocalYmd(i.placement.date) : i.dateHint ? parseLocalYmd(i.dateHint) : null
    const stamp = day ? day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' : ''
    return { title: `${stamp}${i.title}`, content: i.note ?? i.title }
  })

  // Goals: no invented area; note + derived scope ride the row.
  let goalsCreated = 0
  for (const item of items.filter((i) => i.placement.kind === 'goal')) {
    const created = await addGoal(areas[0]?.id ?? null, item.title, context, { notes: item.note, scope: scopeForDomain(context, [], null) })
    if (created) goalsCreated += 1; else failures += 1
  }

  /* notes loop: use [...dayfactNotes, ...notes] and `context` */

  const periodLabel = altitude === 'year' ? `${now.getFullYear()}`
    : altitude === 'season' ? seasonLabel(commitCtx.seasonStart, readSeasons())
    : altitude === 'month' ? commitCtx.monthStart.toLocaleDateString('en-US', { month: 'long' })
    : 'this week'
  const route = altitude === 'year' ? '/year'
    : altitude === 'season' ? `/season?start=${localYmd(commitCtx.seasonStart)}`
    : altitude === 'month' ? `/month?start=${localYmd(commitCtx.monthStart)}`
    : '/week'

  const parts = [tasks…, goals…, `${routinesCreated} routine(s)`, notes…].filter(Boolean)
  // toast: `Added ${parts.join(', ')} to ${periodLabel}` (success) — keep the failure branch as is.
  return { tasksCreated, goalsCreated, notesCreated, routinesCreated, failures, route, periodLabel }
}, [addTask, addNote, addRoutine, getCurrentUserMember, areas, addGoal])
```

Remove the `addArea('General')` path entirely. Update `PeriodPlanPage`'s `addGoal(g.areaId, g.name, g.context ?? undefined)` — unchanged call still typechecks (areaId may be null now).

- [ ] **Step 4: Run** `npx vitest run src/hooks/useCommitPage.test.ts src/lib/planParse.test.ts src/hooks/useGoals.test.ts` (if the last exists) + tsc → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(paper): commit writes domain, goal notes+scope, phone, lineage, routines, day-facts; returns the landing route" && git add supabase/migrations/2026-09-06_goals_scope_and_area_optional.sql && git commit -m "db: goals join the scope axis; area optional"`

---

### Task 6: The sheet — domain row, title-period chip, re-window on flip, goal toggle as a control, Routine/Day-fact rows, duplicates, calendar matches

**Files:**
- Modify: `src/components/capture/PageReviewSheet.tsx`
- Create: `src/lib/planDuplicates.ts` (+ test), `src/components/capture/PageReviewSheet.test.tsx` (extend if it exists)

**Interfaces:**
```ts
// planDuplicates.ts
export interface ExistingTask { id: string; title: string; bucket?: string | null; seasonStart?: Date | null; monthStart?: Date | null }
/** Jaccard ≥ 0.6 on word sets (stopwords out), or one title contained in the other. */
export function findLikelyDuplicate(title: string, existing: ExistingTask[]): ExistingTask | null
// PageReviewSheetProps gains:
//   titlePeriod?: TitlePeriod; pageTitle?: string | null
//   existingTasks?: ExistingTask[]              // open tasks (for the Link line)
//   calendarTitlesByDay?: Map<string, string[]> // 'YYYY-MM-DD' → event titles (for day-fact matches)
//   initialDomain?: 'work'|'family'|'personal'  // default from localStorage in the flow
// PageReviewPayload gains: domain; and items may carry sourceId
```

- [ ] **Step 1: Failing tests**

`src/lib/planDuplicates.test.ts`:
```ts
import { findLikelyDuplicate } from '@/lib/planDuplicates'
it('matches gutters lines across pages', () => {
  const ex = [{ id: '1', title: 'Get gutters cleaned before the leaves' }, { id: '2', title: 'Pay water bill' }]
  expect(findLikelyDuplicate('Get quotes on gutters', ex)?.id).toBeUndefined()   // 1 shared word of 4/5 → no
  expect(findLikelyDuplicate('Get gutters cleaned', ex)?.id).toBe('1')          // containment
  expect(findLikelyDuplicate('Go to pumpkin patch', [{ id: '3', title: 'Pumpkin patch' }])?.id).toBe('3')
})
```

`PageReviewSheet.test.tsx` (RTL, using `render` from `@/test/test-utils`):
```ts
it('shows the domain row defaulting to Family and reports it on commit', async () => {
  const onCommit = vi.fn()
  render(<PageReviewSheet items={[item]} notes={[]} unclear={[]} windowDates={win} altitude="week" members={[]} committing={false} onCommit={onCommit} onClose={() => {}} />)
  expect(screen.getByRole('radio', { name: 'Family' })).toBeChecked()
  await userEvent.click(screen.getByRole('radio', { name: 'Work' }))
  await userEvent.click(screen.getByRole('button', { name: /^Add/ }))
  expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ domain: 'work' }))
})
it('opens the season chip on the page title and says so', () => {
  render(<PageReviewSheet … altitude="season" titlePeriod={{ kind: 'season', start: new Date(2026, 8, 1), label: 'Fall 2026' }} pageTitle="Fall 2026" today={new Date(2026, 8, 6)} seasons={seasons} … />)
  expect(screen.getByText('Fall 2026')).toBeInTheDocument()
  expect(screen.getByText(/Your page says/)).toBeInTheDocument()
})
it('flipping the chip re-windows: a Dec 12 hint becomes a date on the Fall list', async () => {
  const recital = { …base, title: 'Recital', placement: { kind: 'season' }, dateHint: '2026-12-12' }
  render(<PageReviewSheet … altitude="season" items={[recital]} windowDates={['2026-09-06']} today={new Date(2026, 8, 6)} seasons={seasons} … />)
  // Summer is the calendar default under these seasons only if today < Sep 1; with Fall Sep 1 today is already Fall: press › once to Winter, ‹ back to Fall, then assert
  await userEvent.click(screen.getByRole('button', { name: 'Next season' }))
  expect(screen.getByRole('combobox', { name: 'When' })).toHaveValue('2026-12-12')
})
it('a day-fact that matches a calendar event is listed under Already on your calendar and not committed', async () => {
  const fact = { …base, title: 'Labor Day', kind: 'dayfact', placement: { kind: 'date', date: '2026-09-07' }, dateHint: '2026-09-07' }
  const onCommit = vi.fn()
  render(<PageReviewSheet … items={[fact]} calendarTitlesByDay={new Map([['2026-09-07', ['Labor Day']]])} onCommit={onCommit} … />)
  expect(screen.getByText('Already on your calendar')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /^Add/ }))
  expect(onCommit.mock.calls[0][0].items).toHaveLength(0)
})
it('a likely duplicate offers Link and sets sourceId', async () => {
  const onCommit = vi.fn()
  render(<PageReviewSheet … items={[{ …base, title: 'Pumpkin patch', placement: { kind: 'date', date: '2026-10-03' } }]} existingTasks={[{ id: 'x1', title: 'Go to pumpkin patch' }]} onCommit={onCommit} … />)
  await userEvent.click(screen.getByRole('button', { name: /^Link/ }))
  await userEvent.click(screen.getByRole('button', { name: /^Add/ }))
  expect(onCommit.mock.calls[0][0].items[0].sourceId).toBe('x1')
})
it('the Goal control is a labelled button to the right of When, not a badge', () => {
  render(<PageReviewSheet … altitude="month" items={[{ …base, title: 'Read a book', placement: { kind: 'month' } }]} … />)
  expect(screen.getByRole('button', { name: 'Make "Read a book" a goal' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByText('Task')).toBeInTheDocument() // the kind badge stays
})
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`src/lib/planDuplicates.ts`:
```ts
const STOP = new Set(['a','an','the','to','for','of','on','in','at','and','with','get','go','do','up','out','my','our','some'])
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)))
export function findLikelyDuplicate(title: string, existing: ExistingTask[]): ExistingTask | null {
  const a = words(title); if (a.size === 0) return null
  const norm = (s: string) => [...words(s)].join(' ')
  const na = norm(title)
  let best: { t: ExistingTask; score: number } | null = null
  for (const t of existing) {
    const b = words(t.title); if (b.size === 0) continue
    const nb = norm(t.title)
    const contained = na.length >= 8 && (na.includes(nb) || nb.includes(na))
    let inter = 0; for (const w of a) if (b.has(w)) inter++
    const jaccard = inter / (a.size + b.size - inter)
    const score = contained ? 1 : jaccard
    if (score >= 0.6 && (!best || score > best.score)) best = { t, score }
  }
  return best?.t ?? null
}
```

`PageReviewSheet.tsx` changes (keep existing structure):
1. State: `domain` (init `initialDomain ?? 'family'`), `monthStart`/`seasonStart` init from `titlePeriod` when its kind matches the altitude, else the existing guess. `windowNow = useMemo(() => planWindowDates(today, altitude, seasons, altitude === 'month' ? monthStart : seasonStart), …)` for month/season; `windowDates` prop otherwise. On chip change: `setItemRows(rows => rewindowPlanItems(rows, newWindow, altitude).map(keepIncluded))`.
2. Header, under the blurb: `{pageTitle && titlePeriod && <p className="mt-0.5 text-[12px] text-neutral-500">Your page says <b>{pageTitle}</b></p>}` and a domain row:
   ```tsx
   <div role="radiogroup" aria-label="This page is" className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
     <span className="text-neutral-500">This page is</span>
     {DOMAINS.map((d) => (
       <label key={d.id} className={`cursor-pointer rounded-full border px-2.5 py-0.5 font-medium ${domain === d.id ? 'border-primary-300 bg-primary-50 text-primary-800' : 'border-neutral-200 bg-white text-neutral-600'}`}>
         <input type="radio" name="page-domain" value={d.id} checked={domain === d.id} onChange={() => setDomain(d.id)} className="sr-only" aria-label={d.label} />
         {d.label}
       </label>
     ))}
     <span className="text-neutral-400">{domain === 'family' ? 'Family pages are shared with everyone in the house.' : 'Only you will see this page.'}</span>
   </div>
   ```
   (`DOMAINS` from `@/lib/domains` or wherever `DOMAINS` is exported — grep `export const DOMAINS`.)
3. Row left edge: always `<TaskKindBadge … kind={row.kind === 'recurring' ? 'routine' : row.kind === 'dayfact' ? 'task' : undefined} label />` (a day-fact shows "Day" via a small neutral pill instead of TaskKindBadge). The Goal control moves to the right cluster, after the When select: `<button aria-pressed={!!row.goal} aria-label={`Make "${row.title}" a goal`} …>{row.goal ? <><Target/>Goal</> : 'Make a goal'}</button>` — visible only when `canBeGoal`.
4. Day-fact rows whose `placement.kind === 'date'` and whose title (case-insensitive, minus "no school", "–", "holiday") matches any entry in `calendarTitlesByDay.get(date)` are removed from `itemRows` at init and rendered under a heading **Already on your calendar** as plain text lines.
5. Duplicates: at init compute `dupFor = new Map<number, ExistingTask>()` via `findLikelyDuplicate(row.title, existingTasks)`; render under the row: `Looks like <i>{dup.title}</i> · <button>Link</button> · <button>Keep separate</button>`; Link sets `sourceId` on the row and the line reads "Linked"; Keep separate hides the line.
6. Recurring rows: the When select is replaced by a static "Routine · Sat" label + the time input; the assignee select stays.
7. `commit()` passes `domain` and keeps `sourceId` on items. Persist `localStorage.setItem(`symphony.paper.domain.${altitude}`, domain)` in commit.

- [ ] **Step 4: Run** `npx vitest run src/lib/planDuplicates.test.ts src/components/capture/PageReviewSheet.test.tsx` + tsc → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(paper): the sheet asks the domain once, obeys the page title, re-windows on flip, labels the goal control, catches day-facts and duplicates"`

---

### Task 7: The flow — pass existing tasks/events/domain default, navigate after commit, 401 → session path

**Files:**
- Modify: `src/components/capture/PageFromPaperFlow.tsx`, `src/hooks/usePageFromPaper.ts`, `src/apps/tasks/HomeViewContainer.tsx` (pass `tasks` + `events` into the flow), `src/components/capture/CameraCaptureModal.tsx`

- [ ] **Step 1: Failing test** (`src/hooks/usePageFromPaper.test.ts` — create if absent, mocking `@/lib/supabase`):
```ts
it('a 401 from parse-page throws SessionExpiredError, not a parse failure', async () => {
  invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: { status: 401 } }) })
  const { result } = renderHook(() => usePageFromPaper([]))
  await act(() => result.current.parseFromBlob(new Blob(['x'], { type: 'image/jpeg' }), 'week'))
  expect(result.current.error).toBe('Your session ended. Sign in again to continue.')
})
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**
  - `usePageFromPaper.ts`: after `invoke`, `if (fnErr) { const status = (fnErr as { context?: { status?: number } }).context?.status; if (status === 401) throw new SessionExpiredError() ; throw new Error(fnErr.message) }` where `export class SessionExpiredError extends Error { constructor() { super('Your session ended. Sign in again to continue.') } }` lives in `src/lib/authErrors.ts` (Plan 2 Task E1 reuses it). Also read `data?.page_title`.
  - `PageFromPaperFlow.tsx`: `const navigate = useNavigate()`; after `commitPage` returns `{ route }`, `close(); navigate(route)`. Read `initialDomain` from `localStorage.getItem(`symphony.paper.domain.${altitude}`)`. Accept props `existingTasks?: ExistingTask[]` and `calendarTitlesByDay?: Map<string,string[]>`; pass through to the sheet along with `titlePeriod`, `pageTitle`. When `error` is a `SessionExpiredError`, render a "Sign in again" button that calls `window.location.assign('/?return=' + encodeURIComponent(location.pathname))` instead of "Try again".
  - `HomeViewContainer.tsx`: where `<PageFromPaperFlow members=… />` is mounted, pass `existingTasks={tasks.filter(t => !t.completed).map(t => ({ id: t.id, title: t.title }))}` and `calendarTitlesByDay` built from the container's `events` (`localYmd(new Date(ev.start_time))` → titles).
  - `CameraCaptureModal.tsx` `startStream` catch: `if (name === 'AbortError') return` (our own restart) before the generic branch. On desktop (`!('ontouchstart' in window)`) with no remembered device, render the picker button as the primary action (`btn-primary`) and "Use camera" secondary; do not auto-start the stream until "Use camera" is pressed.
- [ ] **Step 4: Run** flow/hook tests + tsc → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(paper): land on the page you filled; 401 reads as a session problem; desktop picks a file first"`

---

### Task 8: Kind inference tweaks

**Files:** `src/lib/taskVisualKind.ts`, `src/lib/taskVisualKind.test.ts`

- [ ] **Step 1: Failing tests**
```ts
it('a call is a call before it is an appointment', () => { expect(inferTaskVisualKind({ title: 'Call Dr. Park re inhaler' })).toBe('call') })
it('a birthday lunch out is an appointment, not a meal plan', () => { expect(inferTaskVisualKind({ title: "Grandma's 80th birthday lunch at Petit Louis" })).toBe('appointment') })
it('dry cleaning is an errand task', () => { expect(inferTaskVisualKind({ title: 'Pick up dry cleaning' })).toBe('task') })
it('meal planning is still a meal', () => { expect(inferTaskVisualKind({ title: 'Meal plan and grocery run' })).toBe('shopping') })
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — order: `CALL_RE` (anchored `^\s*(call|phone|text|email)\b`) first; `MEAL_OUT_RE = /\b(lunch|dinner|brunch|breakfast)\b.*\bat\b/i` → appointment before `MEAL_RE`; `ACTIVITY_RE` loses `pickup|pick up` and gains nothing; add `ERRAND_RE = /\b(dry cleaning|post office|return .* books|drop off)\b/i` → task, checked before activity.
- [ ] **Step 4: Run** → PASS (also run the existing kind tests). **Step 5: Commit** — `git commit -am "fix(kinds): calls are calls, lunch out is an appointment, dry cleaning is an errand"`

---

### Task 9: Routines — slot-add under a lens assigns or shares; the form gets a Who select

**Files:** `src/apps/routines/RoutinesApp.tsx`, `src/components/routine/rhythm/SlotAdd.tsx` (draft carries `assigned_to?`), `src/components/routine/RhythmPage.tsx` (pass `memberId` into the slot draft), `src/components/routine/RoutineForm.tsx`, tests: `src/apps/routines/RoutinesApp.test.tsx` (if present) else `src/components/routine/rhythm/SlotAdd.test.tsx`.

- [ ] **Step 1: Failing test** — assert `addRoutine` called with `{ context: 'family' }` when the lens is Everyone and no domain lens is active; with `{ assigned_to: 'e' }` when the Edith lens is active.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — `handleCreateRoutineInSlot(draft)`: `addRoutine({ name, recurrence_pattern, time_of_day, context: soleDomain ?? (draft.assigned_to ? undefined : 'family'), assigned_to: draft.assigned_to })`. `RhythmPage` passes `memberId` into the slot draft. `RoutineForm`: add a "Who" `<select>` (Everyone in the house · members) bound to `assigned_to` and saved via `onUpdate(id, { assigned_to })`; `useRoutines.updateRoutine` already re-derives scope.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -am "feat(routines): slot-add shares by lens; the form asks who"`

---

### Task 10: Discussion header offers to share

**Files:** `src/components/discussion/DiscussionThread.tsx`, `src/components/assist/AssistDrawer.tsx`, `src/lib/discussions/sharedWith.ts` (+ test)

- [ ] **Step 1: Failing test** — `sharedWithLabel([], 'individual')` still "Only you"; new `canOfferShare(scope, loginHolders)` returns true when scope is individual and ≥ 2 login-holding members.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — `DiscussionThread` gains `onShare?: () => void`; header renders `{onShare && <button onClick={onShare} className="ml-2 text-[11px] text-primary-700 underline">Share with the house</button>}`. `AssistDrawer` passes `onShare` when `canOfferShare(...)`: `updateTask(taskId, { context: 'family' })` (scope re-derives to compound). Replace the string comparison `sharedWithLabel !== 'Only you'` with `scope !== 'individual'` passed as a prop.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -am "feat(discussions): the header says who can see it and offers to share with the house"`

---

### Task 11: Edge function — new fields, no clamping, title, emphasis, day-facts, recurring, assignment mirror

**Files:** `supabase/functions/parse-page/lib/parse.ts`, `supabase/functions/parse-page/lib/parse.test.ts` (extend/create), `supabase/functions/parse-page/index.ts` (echo `page_title`)

- [ ] **Step 1: Failing tests**
```ts
it('passes date_hint, kind, recurring, phone through and never clamps', () => {
  const r = parsePageResponse(JSON.stringify({ items: [
    { title: 'Book flights', day: 'season', date_hint: '2026-10-01', time: null, assignee_id: null, note: 'deadline Oct 1' },
    { title: 'No school', day: '2026-09-07', kind: 'dayfact' },
    { title: 'Liam soccer', day: 'season', kind: 'recurring', recurring: { days: ['sat'], until: '2026-11-30' }, time: '09:00' },
    { title: 'Call Dr. Park', day: '2026-09-09', phone: '410-555-0142' },
  ], notes: [], unclear: [], page_title: 'Fall 2026' }), new Set(['2026-09-06','2026-09-07','2026-09-09']), new Set(), 'season')
  expect(r.items[0]).toMatchObject({ day: 'season', date_hint: '2026-10-01' })
  expect(r.items[1].kind).toBe('dayfact')
  expect(r.items[2]).toMatchObject({ kind: 'recurring', recurring: { days: ['sat'], until: '2026-11-30' }, time: '09:00' })
  expect(r.items[3].phone).toBe('410-555-0142')
  expect(r.page_title).toBe('Fall 2026')
})
it('the prompt tells the model about date_hint, day-facts, recurring lines, emphasis, and the title', () => {
  const p = buildPagePrompt([], [], '2026-09-06', 'season')
  expect(p).toMatch(/date_hint/); expect(p).toMatch(/dayfact/); expect(p).toMatch(/recurring/); expect(p).toMatch(/emphasis/i); expect(p).toMatch(/page_title/)
})
```
- [ ] **Step 2: Run** `npx vitest run supabase/functions/parse-page` → FAIL.
- [ ] **Step 3: Implement** — `PageItemRaw` gains `date_hint: string | null; kind: 'task'|'dayfact'|'recurring'; recurring: { days: string[]; until: string | null } | null; phone: string | null`; `PageParseResult.page_title: string | null`. `parseItems`: when `day` is a YMD outside the calendar → `date_hint = day`, `day = defaultPlacement(altitude)`; also read an explicit `e.date_hint`. Time survives on `kind === 'recurring'`. Prompt additions (in Rules): "If a line names a date that is NOT in the calendar, do NOT move it to a nearby date. Use "<default>" for "day" and put the real date in "date_hint" as YYYY-MM-DD." · "A line that states a fact about a day ("Labor Day, no school", "half day", a holiday) is kind "dayfact", placed on that day." · "A line that repeats ("every Sat", "Sat mornings thru Nov", "weekly") is kind "recurring" with "recurring": {"days": ["sat"], "until": "YYYY-MM-DD" or null}; keep "time" if written." · "A star, underline, circle or arrow is emphasis, not content — never write "starred" or "important" as a note." · "A phone number on the line goes in "phone", not in "note"." · "Return "page_title": the page's heading as written, or null." Assignment paragraph: append the role rule from `decideAssignment` in prose (adult named = doer; kid named = about, except homework/practice/reading/chores). `index.ts`: include `page_title: parsed.page_title` in the JSON response.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Deploy + commit** — `npx supabase functions deploy parse-page --use-api --project-ref mwadppyrqzuzgstmwpuy` then `git commit -am "feat(parse-page): date_hint, day-facts, recurring lines, phone, page_title; never clamp a date"`. Verify with a curl of the Fall page (recipe in the session: upload as demo user, invoke with altitude season) that `date_hint` and `page_title` come back.

---

### Task 12: Full suite, lint, push

- [ ] `npx vitest run` — all green (note `tend_tests_rot_on_wall_clock` — a date-dependent failure is not yours).
- [ ] `npm run lint` clean; `npx tsc -p tsconfig.app.json --noEmit` clean.
- [ ] `git fetch && git rebase origin/main`; `git push origin HEAD:main` only after Plan 2's Task E-migrations are handed to Scott (the goals migration must be applied BEFORE this ships, or year-page commits fail on `scope`). If Scott has not applied it yet, push the branch (`git push -u origin fix/demo-run-2`) and stop.
