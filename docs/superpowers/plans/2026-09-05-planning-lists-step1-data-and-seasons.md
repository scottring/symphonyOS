# Planning Lists — Step 1: Data + Seasons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every month and season list row a period and a task/goal kind, make seasons a household setting, and refuse to place a goal — with no visible UI change except a Seasons editor in Settings.

**Architecture:** Three additive NULL-safe columns on `tasks` (`month_start`, `season_start`, `is_goal`) mirroring the `week_start` pattern exactly; a pure `seasons.ts` module that owns the household's season boundaries (replacing two hard-coded meteorological sites); pure placement predicates in `lib/planning/periodPlacement.ts` twinned with `weekPlacement.ts`; the `useSupabaseTasks` writers stamp periods on the way into a bucket and refuse placement of a goal. Seasons persist in `households.seasons` (jsonb), fetched by `useHouseholdSeasons`, mirrored to localStorage so synchronous callers (`currentSeasonStart()`) work the way `readCadenceConfig()` does.

**Tech Stack:** React 19 + TS strict, Vitest + RTL, Supabase (Postgres, RLS). DDL is applied by hand via the Management API (not by CI).

**Spec:** `docs/superpowers/specs/2026-09-05-planning-lists-and-lookback-design.md` — §1 Data, §2 the fork (only the "week→week is a move" half lands here; copy-down is Step 2), §5 Cadence.

## Global Constraints

- **Node 22.14.0** (`export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"` before every command). Check `node -v` FIRST.
- **Work in `.worktrees/planning-lists`** (branch `feat/planning-lists`), never the main worktree. Rebase onto `origin/main` before every push; push to `main` only when the whole step is green and browser-verified.
- **Type-check with `npx tsc --noEmit -p tsconfig.app.json`** — root `npx tsc --noEmit` is a no-op. `npx vitest run <file>` — `npm test` is watch mode.
- **`date` columns serialize with `localYmd`/`parseLocalYmd`** from `@/lib/cadence/config`, never `toISOString()`/`new Date(str)` (a `date` shifts a day west of Greenwich).
- **NULL = the current period** on `month_start`/`season_start`. No backfill. Two predicates per period, never mixed: `belongsTo*` (NULL → true, for pools) and `isPlacedOn*` (NULL → false, for one-row-per-period surfaces).
- **`is_goal` is refused by every placement writer** in `useSupabaseTasks`, not only in UI. The refusal is a no-op plus `showToast('Goals aren't scheduled — tick it off when it's done', 'info')`.
- **Never partial-`upsert` `tasks`**; use `.update().eq()`. **Never a literal `scope:`** outside `lib/scope.ts` (`scopeDefaultCoverage.test.ts` tripwire).
- **No emojis in UI — lucide icons.** Any new Settings section follows `PlanningRhythmSettings.tsx`'s markup exactly (section → h2 → p → rows in `bg-white rounded-lg border border-neutral-100`).
- **Nothing hard-codes Mar/Jun/Sep/Dec after this step.** `grep -rn "\[2, 5, 8, 11\]\|\[11, 2, 5, 8\]\|meteorological" src/` must return only comments that say "used to".
- **Commit after every task.** Commit trailer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018gVEL1aJaWcFFmUpgjHd3M
  ```

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/2026-09-05_planning_periods.sql` | **Create.** The three task columns + indexes + comments; `households.seasons jsonb`. |
| `src/lib/cadence/seasons.ts` | **Create.** The season model: `Season`, `SeasonBoundary`, `DEFAULT_SEASONS`, `normalizeSeasons`, `seasonStartFor`, `seasonEndFor`, `seasonLabel`, `nextSeasonStart`, `isSeasonBoundary`, `readSeasons`/`cacheSeasons`/`SEASONS_SYNC_EVENT`. Pure except the localStorage mirror. |
| `src/lib/cadence/seasons.test.ts` | **Create.** |
| `src/lib/cadence/periods.ts` | **Modify.** `seasonIndex`/`seasonStart`/`seasonEnd`/`SEASON_NAMES` delegate to `seasons.ts` (reading `readSeasons()`). |
| `src/lib/cadence/config.ts` | **Modify.** `getDueSession` seasonal branch reads the configured boundaries. Delete `seasonToken`/`isSeasonStart`. |
| `src/lib/cadence/config.test.ts` | **Modify.** The "Jun 1" season test becomes a configured-boundary test. |
| `src/lib/planning/periodPlacement.ts` | **Create.** `monthStartOf`, `belongsToMonth`, `isPlacedOnMonth`, `belongsToSeason`, `isPlacedOnSeason`, `monthStartForBucket`, `seasonStartForBucket`, `isPlacement`. |
| `src/lib/planning/periodPlacement.test.ts` | **Create.** |
| `src/types/task.ts` | **Modify.** `Task.monthStart`, `Task.seasonStart`, `Task.isGoal`. |
| `src/hooks/useSupabaseTasks.ts` | **Modify.** `DbTask` + mapper + insert + both update mappers + `AddTaskOptions` + stamping in `pushTask`/`setBucket` + `is_goal` refusal + new `setGoal` writer. |
| `src/hooks/useSupabaseTasks.test.ts` | **Modify.** New describe blocks for stamping, refusal, `setGoal`. |
| `src/test/mocks/factories.ts` | **Modify.** `createMockDbTask` accepts `month_start`, `season_start`, `is_goal`, `bucket`. |
| `src/hooks/useHouseholdSeasons.ts` | **Create.** Fetch/seed/update `households.seasons`; mirrors via `cacheSeasons`. |
| `src/hooks/useHouseholdSeasons.test.ts` | **Create.** |
| `src/components/settings/SeasonsSettings.tsx` | **Create.** Four rows: name + start month + start day; owner edits, members read. |
| `src/components/settings/SeasonsSettings.test.tsx` | **Create.** |
| `src/components/settings/SettingsPage.tsx` | **Modify.** Mount `<SeasonsSettings />` directly under `<PlanningRhythmSettings />`. |

---

### Task 1: Migration — the columns exist

**Files:**
- Create: `supabase/migrations/2026-09-05_planning_periods.sql`

**Interfaces:**
- Produces: `tasks.month_start DATE`, `tasks.season_start DATE`, `tasks.is_goal BOOLEAN NOT NULL DEFAULT false`, `households.seasons JSONB` (NULL until seeded).

- [ ] **Step 1: Write the migration**

```sql
-- 2026-09-05_planning_periods.sql
-- Planning lists (spec: docs/superpowers/specs/2026-09-05-planning-lists-and-lookback-design.md).
--
-- bucket='month' had no month and bucket='quarter' had no season, so a
-- September look-back was impossible: nothing knew what was September's. These
-- mirror week_start exactly — a DATE, NULL = "the current period" so nothing
-- planned before this ships changes behaviour. No backfill.
--
-- is_goal: a goal is an outcome you tick, never a thing you place. The writers
-- refuse to schedule/bucket-move a goal; it can be kept (copied forward),
-- dropped, or turned into a task.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS month_start  DATE,
  ADD COLUMN IF NOT EXISTS season_start DATE,
  ADD COLUMN IF NOT EXISTS is_goal      BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tasks.month_start IS
  'Which month a bucket=month task belongs to (that month''s first day). NULL = the current month, legacy behavior.';
COMMENT ON COLUMN tasks.season_start IS
  'Which season a bucket=quarter task belongs to (that season''s start date, per the household''s configured boundaries). NULL = the current season, legacy behavior.';
COMMENT ON COLUMN tasks.is_goal IS
  'A goal on a month/season list: an outcome to tick, never placed onto a week or day. Writers refuse placement.';

CREATE INDEX IF NOT EXISTS tasks_month_start_idx  ON tasks (month_start)  WHERE month_start  IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_season_start_idx ON tasks (season_start) WHERE season_start IS NOT NULL;

-- The household's own season groupings. Four {name, month, day} boundaries.
-- NULL until first read seeds the default (Oct 1 / Jan 1 / Apr 1 / Jul 1) —
-- Scott's next season starts in October; the others are his to adjust in
-- Settings. Owner-only update per the existing households RLS.
ALTER TABLE households
  ADD COLUMN IF NOT EXISTS seasons JSONB;

COMMENT ON COLUMN households.seasons IS
  'Array of four {name, month (1-12), day (1-31)} season boundaries, in calendar order. NULL = not yet seeded.';
```

- [ ] **Step 2: Apply to prod via the Management API**

Bypass-permissions mode is required (the classifier blocks this curl in auto mode). Run from the worktree root:

```bash
SUPABASE_ACCESS_TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
SQL=$(python3 -c 'import json,sys; print(json.dumps(open("supabase/migrations/2026-09-05_planning_periods.sql").read()))')
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"query\": $SQL}"
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query": "notify pgrst, '"'"'reload schema'"'"';"}'
```

- [ ] **Step 3: Verify the columns**

```bash
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query": "select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='"'"'public'"'"' and ((table_name='"'"'tasks'"'"' and column_name in ('"'"'month_start'"'"','"'"'season_start'"'"','"'"'is_goal'"'"')) or (table_name='"'"'households'"'"' and column_name='"'"'seasons'"'"')) order by table_name, column_name;"}'
```
Expected: four rows; `is_goal` is `NO` nullable with default `false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-09-05_planning_periods.sql
git commit -m "feat(db): month_start, season_start, is_goal on tasks; households.seasons

Applied to prod 2026-09-05. NULL = current period, no backfill, mirrors
week_start. is_goal defaults false so existing rows are all tasks."
```

---

### Task 2: `seasons.ts` — the household's season model

**Files:**
- Create: `src/lib/cadence/seasons.ts`
- Test: `src/lib/cadence/seasons.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SeasonBoundary { name: string; month: number /* 1-12 */; day: number /* 1-31 */ }
  export type Seasons = readonly [SeasonBoundary, SeasonBoundary, SeasonBoundary, SeasonBoundary]
  export const DEFAULT_SEASONS: Seasons
  export function normalizeSeasons(raw: unknown): Seasons          // any junk → a valid, calendar-ordered 4-tuple (DEFAULT on failure)
  export function seasonStartFor(date: Date, seasons: Seasons): Date  // midnight of the boundary on/before `date` (may be in the prior year)
  export function seasonEndFor(date: Date, seasons: Seasons): Date    // midnight of the NEXT boundary (exclusive end)
  export function nextSeasonStart(date: Date, seasons: Seasons): Date // == seasonEndFor
  export function seasonLabel(date: Date, seasons: Seasons): string   // "Fall 2026" — the year of the season's START
  export function seasonToken(date: Date, seasons: Seasons): string   // "2026-fall" (lowercased name) — stable dismissal key
  export function isSeasonBoundary(date: Date, seasons: Seasons): boolean
  export function readSeasons(): Seasons                              // localStorage mirror, DEFAULT if none
  export function cacheSeasons(seasons: Seasons): void                // write mirror + dispatch SEASONS_SYNC_EVENT
  export const SEASONS_SYNC_EVENT = 'symphony:seasons-changed'
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/cadence/seasons.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_SEASONS, normalizeSeasons, seasonStartFor, seasonEndFor, seasonLabel, seasonToken,
  isSeasonBoundary, readSeasons, cacheSeasons, type Seasons,
} from './seasons'

const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

// Scott's stated boundary: the next season starts in October. The other three
// are the seed he adjusts in Settings.
describe('DEFAULT_SEASONS', () => {
  it('starts Fall on October 1 and is calendar-ordered', () => {
    expect(DEFAULT_SEASONS.map((s) => [s.name, s.month, s.day])).toEqual([
      ['Winter', 1, 1], ['Spring', 4, 1], ['Summer', 7, 1], ['Fall', 10, 1],
    ])
  })
})

describe('seasonStartFor', () => {
  it('finds the boundary on or before the date', () => {
    expect(ymd(seasonStartFor(new Date(2026, 8, 5), DEFAULT_SEASONS))).toBe('2026-7-1')   // Sep 5 → Summer (Jul 1)
    expect(ymd(seasonStartFor(new Date(2026, 9, 1), DEFAULT_SEASONS))).toBe('2026-10-1')  // Oct 1 IS the boundary
    expect(ymd(seasonStartFor(new Date(2026, 11, 31), DEFAULT_SEASONS))).toBe('2026-10-1')
  })

  // A date before the year's first boundary belongs to the LAST season of the
  // previous year — the year wrap is where a naive "same year" lookup breaks.
  it('wraps to the previous year before the first boundary', () => {
    const uneven: Seasons = [
      { name: 'Deep winter', month: 2, day: 15 }, { name: 'Spring', month: 4, day: 1 },
      { name: 'Summer', month: 7, day: 1 }, { name: 'Fall', month: 10, day: 1 },
    ]
    expect(ymd(seasonStartFor(new Date(2026, 0, 20), uneven))).toBe('2025-10-1')
  })

  it('returns midnight', () => {
    const s = seasonStartFor(new Date(2026, 8, 5, 14, 30), DEFAULT_SEASONS)
    expect([s.getHours(), s.getMinutes()]).toEqual([0, 0])
  })
})

describe('seasonEndFor', () => {
  it('is the next boundary, exclusive, and wraps into next year from the last season', () => {
    expect(ymd(seasonEndFor(new Date(2026, 8, 5), DEFAULT_SEASONS))).toBe('2026-10-1')
    expect(ymd(seasonEndFor(new Date(2026, 10, 5), DEFAULT_SEASONS))).toBe('2027-1-1')
  })
})

describe('seasonLabel / seasonToken', () => {
  it('names the season by the year it STARTED', () => {
    expect(seasonLabel(new Date(2026, 8, 5), DEFAULT_SEASONS)).toBe('Summer 2026')
    // Late December of an uneven config whose last season started in October: still 2026.
    expect(seasonLabel(new Date(2026, 11, 20), DEFAULT_SEASONS)).toBe('Fall 2026')
  })
  it('token is stable and lowercase', () => {
    expect(seasonToken(new Date(2026, 8, 5), DEFAULT_SEASONS)).toBe('2026-summer')
  })
})

describe('isSeasonBoundary', () => {
  it('is true only on a configured start day', () => {
    expect(isSeasonBoundary(new Date(2026, 9, 1), DEFAULT_SEASONS)).toBe(true)
    expect(isSeasonBoundary(new Date(2026, 8, 1), DEFAULT_SEASONS)).toBe(false) // Sep 1 was meteorological, not ours
    expect(isSeasonBoundary(new Date(2026, 9, 2), DEFAULT_SEASONS)).toBe(false)
  })
})

describe('normalizeSeasons', () => {
  it('accepts a valid array and sorts it into calendar order', () => {
    const out = normalizeSeasons([
      { name: 'Fall', month: 10, day: 1 }, { name: 'Winter', month: 1, day: 1 },
      { name: 'Summer', month: 7, day: 1 }, { name: 'Spring', month: 4, day: 1 },
    ])
    expect(out.map((s) => s.name)).toEqual(['Winter', 'Spring', 'Summer', 'Fall'])
  })
  it('falls back to DEFAULT on junk: wrong length, bad month, missing name, non-array', () => {
    expect(normalizeSeasons(null)).toEqual(DEFAULT_SEASONS)
    expect(normalizeSeasons([{ name: 'X', month: 1, day: 1 }])).toEqual(DEFAULT_SEASONS)
    expect(normalizeSeasons([
      { name: 'A', month: 13, day: 1 }, { name: 'B', month: 4, day: 1 },
      { name: 'C', month: 7, day: 1 }, { name: 'D', month: 10, day: 1 },
    ])).toEqual(DEFAULT_SEASONS)
  })
  // Feb 30 is not a day. Clamp rather than reject so a typo doesn't wipe the config.
  it('clamps an impossible day to the month\'s last day', () => {
    const out = normalizeSeasons([
      { name: 'W', month: 2, day: 30 }, { name: 'Sp', month: 4, day: 1 },
      { name: 'Su', month: 7, day: 1 }, { name: 'F', month: 10, day: 1 },
    ])
    expect(out[0].day).toBe(28)
  })
})

describe('readSeasons / cacheSeasons', () => {
  beforeEach(() => localStorage.clear())
  it('reads DEFAULT when nothing is cached', () => {
    expect(readSeasons()).toEqual(DEFAULT_SEASONS)
  })
  it('round-trips a cached config and survives corrupt storage', () => {
    const custom: Seasons = [
      { name: 'W', month: 1, day: 15 }, { name: 'Sp', month: 4, day: 1 },
      { name: 'Su', month: 7, day: 1 }, { name: 'F', month: 10, day: 1 },
    ]
    cacheSeasons(custom)
    expect(readSeasons()).toEqual(custom)
    localStorage.setItem('symphony-seasons', '{not json')
    expect(readSeasons()).toEqual(DEFAULT_SEASONS)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/cadence/seasons.test.ts`
Expected: FAIL — `Failed to resolve import "./seasons"`.

- [ ] **Step 3: Implement**

```ts
// src/lib/cadence/seasons.ts
//
// The household's seasons. Not meteorological, not fiscal — the four
// boundaries this household plans by ("we're making our own groupings",
// Scott, 2026-09-05; the next one starts October). Everything that says
// "season" reads these: the cadence anchor, the season pool, the Season tab,
// the paper window. Nothing hard-codes Mar/Jun/Sep/Dec any more.
//
// Persisted on households.seasons (jsonb) and mirrored to localStorage so
// synchronous callers — the writers that stamp season_start — have an answer
// before the household row has loaded, the same way readCadenceConfig works.

export interface SeasonBoundary {
  name: string
  /** 1–12 */
  month: number
  /** 1–31, clamped to the month's length */
  day: number
}

export type Seasons = readonly [SeasonBoundary, SeasonBoundary, SeasonBoundary, SeasonBoundary]

export const DEFAULT_SEASONS: Seasons = [
  { name: 'Winter', month: 1, day: 1 },
  { name: 'Spring', month: 4, day: 1 },
  { name: 'Summer', month: 7, day: 1 },
  { name: 'Fall', month: 10, day: 1 },
]

const STORAGE_KEY = 'symphony-seasons'
export const SEASONS_SYNC_EVENT = 'symphony:seasons-changed'

function daysInMonth(month: number, year = 2001): number {
  // 2001 is not a leap year: Feb clamps to 28 so a boundary never lands on a day
  // that exists only every fourth year.
  return new Date(year, month, 0).getDate()
}

/** Any junk → a valid, calendar-ordered 4-tuple. DEFAULT when it can't be made valid. */
export function normalizeSeasons(raw: unknown): Seasons {
  if (!Array.isArray(raw) || raw.length !== 4) return DEFAULT_SEASONS
  const cleaned: SeasonBoundary[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return DEFAULT_SEASONS
    const { name, month, day } = item as Record<string, unknown>
    if (typeof name !== 'string' || !name.trim()) return DEFAULT_SEASONS
    if (typeof month !== 'number' || !Number.isInteger(month) || month < 1 || month > 12) return DEFAULT_SEASONS
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 1) return DEFAULT_SEASONS
    cleaned.push({ name: name.trim(), month, day: Math.min(day, daysInMonth(month)) })
  }
  cleaned.sort((a, b) => a.month - b.month || a.day - b.day)
  return cleaned as unknown as Seasons
}

function boundaryDate(b: SeasonBoundary, year: number): Date {
  return new Date(year, b.month - 1, b.day)
}

/** Midnight of the boundary on or before `date`. Before the year's first
 *  boundary, that is the LAST boundary of the previous year. */
export function seasonStartFor(date: Date, seasons: Seasons): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const year = d.getFullYear()
  for (let i = seasons.length - 1; i >= 0; i--) {
    const start = boundaryDate(seasons[i], year)
    if (start <= d) return start
  }
  return boundaryDate(seasons[seasons.length - 1], year - 1)
}

/** Midnight of the boundary AFTER the one `date` is in — the exclusive end. */
export function seasonEndFor(date: Date, seasons: Seasons): Date {
  const start = seasonStartFor(date, seasons)
  const idx = seasons.findIndex((b) => boundaryDate(b, start.getFullYear()).getTime() === start.getTime())
  if (idx < seasons.length - 1) return boundaryDate(seasons[idx + 1], start.getFullYear())
  return boundaryDate(seasons[0], start.getFullYear() + 1)
}

export function nextSeasonStart(date: Date, seasons: Seasons): Date {
  return seasonEndFor(date, seasons)
}

function boundaryOf(start: Date, seasons: Seasons): SeasonBoundary {
  return seasons.find((b) => b.month - 1 === start.getMonth() && b.day === start.getDate()) ?? seasons[0]
}

/** "Fall 2026" — named for the year the season STARTED, so late December
 *  of a season that began in October is still 2026. */
export function seasonLabel(date: Date, seasons: Seasons): string {
  const start = seasonStartFor(date, seasons)
  return `${boundaryOf(start, seasons).name} ${start.getFullYear()}`
}

/** "2026-fall" — the stable key a nudge dismissal is scoped to. */
export function seasonToken(date: Date, seasons: Seasons): string {
  const start = seasonStartFor(date, seasons)
  return `${start.getFullYear()}-${boundaryOf(start, seasons).name.toLowerCase().replace(/\s+/g, '-')}`
}

export function isSeasonBoundary(date: Date, seasons: Seasons): boolean {
  return seasons.some((b) => b.month - 1 === date.getMonth() && b.day === date.getDate())
}

export function readSeasons(): Seasons {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SEASONS
    return normalizeSeasons(JSON.parse(raw))
  } catch {
    return DEFAULT_SEASONS
  }
}

export function cacheSeasons(seasons: Seasons): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seasons))
    window.dispatchEvent(new Event(SEASONS_SYNC_EVENT))
  } catch {
    // private browsing / quota — the in-memory value still flows through the hook
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/cadence/seasons.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cadence/seasons.ts src/lib/cadence/seasons.test.ts
git commit -m "feat(cadence): the household's seasons — four configurable boundaries

Not meteorological, not fiscal: the groupings this household plans by. Pure
model + localStorage mirror so synchronous writers have an answer before the
household row loads, like readCadenceConfig."
```

---

### Task 3: Retire the two hard-coded season sites

**Files:**
- Modify: `src/lib/cadence/periods.ts:11-35` (`SEASON_NAMES`, `seasonIndex`, `seasonStart`, `seasonEnd`)
- Modify: `src/lib/cadence/config.ts:112-121` (`seasonToken`, `isSeasonStart`) and `:141-144` (the seasonal branch of `getDueSession`)
- Modify: `src/lib/cadence/config.test.ts:63-68`
- Test: `src/lib/cadence/periods.test.ts` (existing — check what it pins)

**Interfaces:**
- Consumes: `seasonStartFor`, `seasonEndFor`, `seasonToken`, `isSeasonBoundary`, `readSeasons` from Task 2.
- Produces: `periods.ts` keeps its exports (`seasonStart(now)`, `seasonEnd(now)`, `seasonIndex(d)`, `SEASON_NAMES`) so callers don't change; they now read the configured seasons.

- [ ] **Step 1: Read what `periods.test.ts` pins about seasons**

Run: `grep -n "season\|Season" src/lib/cadence/periods.test.ts`
Any test asserting Mar/Jun/Sep/Dec is a test of the old model — rewrite it against `DEFAULT_SEASONS` (Jan/Apr/Jul/Oct) in Step 2.

- [ ] **Step 2: Rewrite the failing tests**

In `config.test.ts` replace the Jun 1 test:
```ts
    it('seasonal fires on a configured season boundary (Oct 1 by default), not a meteorological one', () => {
      localStorage.clear()
      const oct1 = new Date(2026, 9, 1)
      const due = getDueSession(DEFAULT_CADENCE, oct1)
      expect(due?.kind).toBe('season')
      expect(due?.label).toBe('the season')
      expect(due?.token).toBe('2026-fall')
      expect(getDueSession(DEFAULT_CADENCE, new Date(2026, 5, 1))).toBeNull() // Jun 1: not ours (and not a first Saturday or Sunday in 2026)
    })
```
(Jun 1 2026 is a Monday — neither the default weekly day nor a first Saturday, so `null` is the honest expectation.)

In `periods.test.ts`, for each season assertion, change the expected dates to the DEFAULT_SEASONS boundaries (e.g. a July date's `seasonStart` is Jul 1, its `seasonEnd` Oct 1; a December date's `seasonStart` is Oct 1 of the same year, `seasonEnd` Jan 1 of the next). Add:
```ts
  it('seasonStart/seasonEnd follow the configured seasons, wrapping the year', () => {
    localStorage.clear()
    expect(seasonStart(new Date(2026, 11, 20)).getTime()).toBe(new Date(2026, 9, 1).getTime())
    expect(seasonEnd(new Date(2026, 11, 20)).getTime()).toBe(new Date(2027, 0, 1).getTime())
  })
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/lib/cadence/config.test.ts src/lib/cadence/periods.test.ts`
Expected: FAIL on the rewritten assertions.

- [ ] **Step 4: Implement**

`periods.ts` — replace lines 11–35 (`SEASON_NAMES` through the end of `seasonEnd`) with:
```ts
import { readSeasons, seasonStartFor, seasonEndFor } from '@/lib/cadence/seasons'

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** The configured season names, in calendar order. Used to be the fixed
 *  meteorological four; now whatever the household set in Settings. */
export function seasonNames(): string[] {
  return readSeasons().map((s) => s.name)
}

/** Index 0–3 of the configured season containing `d`. */
export function seasonIndex(d: Date): number {
  const seasons = readSeasons()
  const start = seasonStartFor(d, seasons)
  const idx = seasons.findIndex((b) => b.month - 1 === start.getMonth() && b.day === start.getDate())
  return idx < 0 ? 0 : idx
}

/** First day (midnight) of the configured season containing `now`. */
export function seasonStart(now: Date): Date {
  return seasonStartFor(now, readSeasons())
}

/** Exclusive end (midnight of the next boundary) of the season containing `now`. */
export function seasonEnd(now: Date): Date {
  return seasonEndFor(now, readSeasons())
}
```
Then: `grep -rn "SEASON_NAMES" src/` — replace each consumer with `seasonNames()[i]` (it was `SEASON_NAMES[seasonIndex(d)]`; becomes `seasonNames()[seasonIndex(d)]`). Keep `periodLabel` producing `"Fall 2026"` by using `seasonStart(now).getFullYear()` for the year, not `now.getFullYear()` (a December date in a season that started in October is that year's season).

`config.ts` — delete `seasonToken` and `isSeasonStart`; add the import `import { readSeasons, isSeasonBoundary, seasonToken as configuredSeasonToken } from '@/lib/cadence/seasons'`; the seasonal branch becomes:
```ts
  // Seasonal — the household's own boundary, not a meteorological one.
  const seasons = readSeasons()
  if (isSeasonBoundary(now, seasons)) {
    return { kind: 'season', label: 'the season', token: configuredSeasonToken(now, seasons) }
  }
```

- [ ] **Step 5: Run the cadence tests and type-check**

Run: `npx vitest run src/lib/cadence && npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS; tsc clean. Then `grep -rn "\[2, 5, 8, 11\]\|\[11, 2, 5, 8\]\|meteorological" src/ | grep -v "used to\|Not meteorological"` — expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cadence
git commit -m "refactor(cadence): season math reads the configured boundaries

periods.ts and getDueSession were the two places that knew Mar/Jun/Sep/Dec.
Both now ask seasons.ts. SEASON_NAMES becomes seasonNames()."
```

---

### Task 4: `periodPlacement.ts` — the month/season twins of `weekPlacement.ts`

**Files:**
- Create: `src/lib/planning/periodPlacement.ts`
- Test: `src/lib/planning/periodPlacement.test.ts`

**Interfaces:**
- Consumes: `localYmd` from `@/lib/cadence/config`; `seasonStartFor`, `readSeasons` from Task 2; `Task`, `TaskBucket` from `@/types/task` (the `monthStart`/`seasonStart` fields land in Task 5 — this module types them via `Pick<Task, 'monthStart'>` etc., so do Task 5's type change FIRST if tsc complains, or declare the Pick against `{ monthStart?: Date }` inline).
- Produces:
  ```ts
  export function monthStartOf(date: Date): Date                       // the 1st, midnight
  export function belongsToMonth(task: { monthStart?: Date }, monthStart: Date): boolean   // NULL → true
  export function isPlacedOnMonth(task: { monthStart?: Date }, monthStart: Date): boolean  // NULL → false
  export function belongsToSeason(task: { seasonStart?: Date }, seasonStart: Date): boolean
  export function isPlacedOnSeason(task: { seasonStart?: Date }, seasonStart: Date): boolean
  export function monthStartForBucket(bucket: TaskBucket, now: Date): Date | undefined     // 'month' → this month; else undefined (CLEAR)
  export function seasonStartForBucket(bucket: TaskBucket, now: Date): Date | undefined    // 'quarter' → this season; else undefined
  export function isPlacement(updates: Partial<Task>): boolean   // does this write move the task in time? (bucket / scheduledFor / weekStart / monthStart / seasonStart)
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/planning/periodPlacement.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  monthStartOf, belongsToMonth, isPlacedOnMonth, belongsToSeason, isPlacedOnSeason,
  monthStartForBucket, seasonStartForBucket, isPlacement,
} from './periodPlacement'

const d = (y: number, m: number, day: number) => new Date(y, m, day)

describe('monthStartOf', () => {
  it('is the first of the month at midnight', () => {
    const s = monthStartOf(new Date(2026, 8, 17, 15, 45))
    expect([s.getFullYear(), s.getMonth(), s.getDate(), s.getHours()]).toEqual([2026, 8, 1, 0])
  })
})

// The two predicates differ ONLY on the NULL row, and mixing them up is the bug
// (the same lesson as weekPlacement.ts).
describe('belongsToMonth vs isPlacedOnMonth', () => {
  const sep = d(2026, 8, 1)
  const oct = d(2026, 9, 1)

  it('an explicitly stamped row belongs to and is placed on its month only', () => {
    const task = { monthStart: sep }
    expect(belongsToMonth(task, sep)).toBe(true)
    expect(isPlacedOnMonth(task, sep)).toBe(true)
    expect(belongsToMonth(task, oct)).toBe(false)
    expect(isPlacedOnMonth(task, oct)).toBe(false)
  })

  // A legacy row (no month_start) used to mean "the current month". The POOL
  // keeps showing it — scoping it away would make an existing month plan
  // vanish. A one-row-per-month surface must NOT count it, or it repeats in
  // every month of the navigator.
  it('a NULL row belongs to any month but is placed on none', () => {
    const legacy = { monthStart: undefined }
    expect(belongsToMonth(legacy, sep)).toBe(true)
    expect(belongsToMonth(legacy, oct)).toBe(true)
    expect(isPlacedOnMonth(legacy, sep)).toBe(false)
  })

  it('compares by calendar day, not by millisecond', () => {
    expect(belongsToMonth({ monthStart: new Date(2026, 8, 1, 9) }, sep)).toBe(true)
  })
})

describe('belongsToSeason vs isPlacedOnSeason', () => {
  const fall = d(2026, 9, 1)
  const summer = d(2026, 6, 1)
  it('mirror the month predicates exactly', () => {
    expect(belongsToSeason({ seasonStart: fall }, fall)).toBe(true)
    expect(belongsToSeason({ seasonStart: fall }, summer)).toBe(false)
    expect(isPlacedOnSeason({ seasonStart: fall }, fall)).toBe(true)
    expect(belongsToSeason({ seasonStart: undefined }, summer)).toBe(true)
    expect(isPlacedOnSeason({ seasonStart: undefined }, summer)).toBe(false)
  })
})

describe('monthStartForBucket / seasonStartForBucket', () => {
  beforeEach(() => localStorage.clear())
  const now = new Date(2026, 8, 17)

  // Entering the month bucket means THIS month; every other bucket has no
  // month. The clear matters as much as the stamp: a task sent from the month
  // to the week that kept its month_start would come back in September's
  // look-back as still open.
  it('stamps this month on entry and clears everywhere else', () => {
    expect(monthStartForBucket('month', now)?.getTime()).toBe(d(2026, 8, 1).getTime())
    expect(monthStartForBucket('week', now)).toBeUndefined()
    expect(monthStartForBucket('quarter', now)).toBeUndefined()
    expect(monthStartForBucket('timed', now)).toBeUndefined()
  })

  it('stamps this season (from the configured boundaries) on entry to quarter and clears elsewhere', () => {
    expect(seasonStartForBucket('quarter', now)?.getTime()).toBe(d(2026, 6, 1).getTime()) // Summer, Jul 1 default
    expect(seasonStartForBucket('month', now)).toBeUndefined()
  })
})

describe('isPlacement', () => {
  it('is true for any write that moves the task in time', () => {
    expect(isPlacement({ bucket: 'week' })).toBe(true)
    expect(isPlacement({ scheduledFor: new Date() })).toBe(true)
    expect(isPlacement({ weekStart: new Date() })).toBe(true)
    expect(isPlacement({ monthStart: new Date() })).toBe(true)
    expect(isPlacement({ seasonStart: new Date() })).toBe(true)
  })
  it('is false for edits that leave it where it is', () => {
    expect(isPlacement({ title: 'x' })).toBe(false)
    expect(isPlacement({ completed: true })).toBe(false)
    expect(isPlacement({ notes: 'y', context: 'family' })).toBe(false)
    expect(isPlacement({})).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/planning/periodPlacement.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/planning/periodPlacement.ts
//
// Does this bucket='month' (or 'quarter') task belong to the month (season)
// I'm looking at? The twin of lib/today/weekPlacement.ts, and it carries the
// same warning: two predicates that differ only on the NULL row, and mixing
// them up is the bug.
//
// Before this, bucket='month' meant "the current month" and nothing more, so a
// September look-back was impossible — nothing knew what was September's.

import type { Task, TaskBucket } from '@/types/task'
import { localYmd } from '@/lib/cadence/config'
import { readSeasons, seasonStartFor } from '@/lib/cadence/seasons'

/** The 1st of `date`'s month, midnight. */
export function monthStartOf(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

/**
 * Does `task` belong to the month starting `monthStart`? — the POOL question.
 * A row with no month of its own (every row that predates this column) counts:
 * its old meaning was "the current month", and scoping it to one month would
 * make an existing month plan vanish.
 */
export function belongsToMonth(task: { monthStart?: Date }, monthStart: Date): boolean {
  if (!task.monthStart) return true
  return localYmd(task.monthStart) === localYmd(monthStart)
}

/**
 * Was `task` explicitly PLACED on that month? — the MEMBERSHIP question, for
 * surfaces with one row per month (the /plans navigator on a past month). A
 * NULL row is NOT a member, or it repeats in every month you page to.
 */
export function isPlacedOnMonth(task: { monthStart?: Date }, monthStart: Date): boolean {
  if (!task.monthStart) return false
  return localYmd(task.monthStart) === localYmd(monthStart)
}

export function belongsToSeason(task: { seasonStart?: Date }, seasonStart: Date): boolean {
  if (!task.seasonStart) return true
  return localYmd(task.seasonStart) === localYmd(seasonStart)
}

export function isPlacedOnSeason(task: { seasonStart?: Date }, seasonStart: Date): boolean {
  if (!task.seasonStart) return false
  return localYmd(task.seasonStart) === localYmd(seasonStart)
}

/**
 * The month a bucket change implies. Entering the month bucket means THIS
 * month; every other bucket has no month at all. The clear is as important as
 * the stamp — a task sent from the month to the week that kept its month_start
 * would come back in that month's look-back as still open.
 */
export function monthStartForBucket(bucket: TaskBucket, now: Date): Date | undefined {
  return bucket === 'month' ? monthStartOf(now) : undefined
}

/** Same, for the season bucket, from the household's configured boundaries. */
export function seasonStartForBucket(bucket: TaskBucket, now: Date): Date | undefined {
  return bucket === 'quarter' ? seasonStartFor(now, readSeasons()) : undefined
}

/** Does this write move the task in time? The question the is_goal refusal asks. */
export function isPlacement(updates: Partial<Task>): boolean {
  return 'bucket' in updates || 'scheduledFor' in updates || 'weekStart' in updates
    || 'monthStart' in updates || 'seasonStart' in updates
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/planning/periodPlacement.test.ts`
Expected: PASS. (If tsc complains that `Task` has no `monthStart`, that's Task 5 — the inline `{ monthStart?: Date }` types keep this file compiling regardless; `isPlacement` only reads keys.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/planning/periodPlacement.ts src/lib/planning/periodPlacement.test.ts
git commit -m "feat(planning): month/season placement predicates, twins of weekPlacement

belongsTo* (NULL → true, pools) and isPlacedOn* (NULL → false, one row per
period). *ForBucket stamps on entry and clears everywhere else."
```

---

### Task 5: The columns reach the client — types, mapper, insert, update

**Files:**
- Modify: `src/types/task.ts:64-65` (after `weekStart`, before `pickedAt`)
- Modify: `src/hooks/useSupabaseTasks.ts` — `DbTask` (~line 88), mapper (~169), `AddTaskOptions` (~570), insert payload (~664), `updateTask` mapper (~1260), `updateTasksBulk` mapper (~1430)
- Modify: `src/test/mocks/factories.ts:47-85`
- Test: `src/hooks/useSupabaseTasks.test.ts`

**Interfaces:**
- Produces on `Task`: `monthStart?: Date`, `seasonStart?: Date`, `isGoal?: boolean`. On `AddTaskOptions`: `monthStart?: Date`, `seasonStart?: Date`, `isGoal?: boolean`. DB keys: `month_start`, `season_start`, `is_goal`.
- Creation rule: `bucket:'month'` stamps `month_start = options.monthStart ?? monthStartOf(now)`; `bucket:'quarter'` stamps `season_start = options.seasonStart ?? seasonStartFor(now)`; other buckets write NULL. `is_goal` is written only when bucket is month/quarter; otherwise false.

- [ ] **Step 1: Write the failing tests**

Add to `useSupabaseTasks.test.ts` inside `describe('addTask', …)`:
```ts
    it('stamps month_start on a month-bucket creation, defaulting to this month', async () => {
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.loading).toBe(false))
      await act(async () => {
        await result.current.addTask('Repaint the porch', undefined, undefined, undefined, { bucket: 'month' })
      })
      const now = new Date()
      const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'month', month_start: first, season_start: null, is_goal: false }))
    })

    it('honours an explicit monthStart and is_goal on a month creation', async () => {
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.loading).toBe(false))
      await act(async () => {
        await result.current.addTask('Read more', undefined, undefined, undefined, {
          bucket: 'month', monthStart: new Date(2026, 9, 1), isGoal: true,
        })
      })
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ month_start: '2026-10-01', is_goal: true }))
    })

    it('stamps season_start on a quarter creation from the configured seasons', async () => {
      localStorage.clear() // DEFAULT_SEASONS
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.loading).toBe(false))
      await act(async () => {
        await result.current.addTask('Plan the fall trips', undefined, undefined, undefined, { bucket: 'quarter' })
      })
      const call = mockInsert.mock.calls.at(-1)![0] as Record<string, unknown>
      expect(call.bucket).toBe('quarter')
      expect(typeof call.season_start).toBe('string')
      expect(call.month_start).toBeNull()
    })

    // A goal is a month/season thing. A week creation that claims to be a goal
    // is a caller bug; the row is written as a task so it can never get stuck
    // unplaceable on the week list.
    it('ignores isGoal outside the month and quarter buckets', async () => {
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.loading).toBe(false))
      await act(async () => {
        await result.current.addTask('Call VW', undefined, undefined, undefined, { bucket: 'week', isGoal: true })
      })
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'week', is_goal: false, month_start: null }))
    })
```
Inside `describe('updateTask', …)`:
```ts
    it('maps monthStart/seasonStart to DATE strings and isGoal to is_goal', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task', bucket: 'month' }))
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))
      await act(async () => {
        await result.current.updateTask('task-1', { monthStart: new Date(2026, 9, 1), isGoal: true })
      })
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ month_start: '2026-10-01', is_goal: true }))
    })

    it('reads month_start/season_start/is_goal back onto the Task', async () => {
      mockSupabaseData.push(createMockDbTask({
        id: 'task-1', title: 'Task', bucket: 'month', month_start: '2026-09-01', season_start: null, is_goal: true,
      }))
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))
      const t = result.current.tasks[0]
      expect(t.monthStart?.getTime()).toBe(new Date(2026, 8, 1).getTime())
      expect(t.seasonStart).toBeUndefined()
      expect(t.isGoal).toBe(true)
    })
```

- [ ] **Step 2: Extend the mock factory**

In `src/test/mocks/factories.ts`, add to the `overrides` type: `bucket: string`, `month_start: string | null`, `season_start: string | null`, `is_goal: boolean`, `week_start: string | null`. Add to the returned defaults: `bucket: 'inbox', month_start: null, season_start: null, is_goal: false, week_start: null,` (before `...overrides`). Check `git grep -n "createMockDbTask" src/ | wc -l` — the defaults must not break an existing caller; `bucket: 'inbox'` matches the DB default.

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/hooks/useSupabaseTasks.test.ts -t "month_start|monthStart|season_start|isGoal"`
Expected: FAIL (insert payload lacks the keys / Task lacks the fields).

- [ ] **Step 4: Implement**

`src/types/task.ts` — after the `weekStart` line:
```ts
  monthStart?: Date // Which month a bucket='month' task belongs to (its 1st). undefined = the current month (legacy rows).
  seasonStart?: Date // Which season a bucket='quarter' task belongs to (its start, per the household's seasons). undefined = the current season.
  /** A goal on a month/season list: an outcome you tick, never a thing you place.
   *  The writers refuse to schedule or bucket-move it. Meaningful only for
   *  bucket month/quarter; a week row is a task by definition. */
  isGoal?: boolean
```

`useSupabaseTasks.ts`:
- Imports: add `import { monthStartOf } from '@/lib/planning/periodPlacement'` and `import { readSeasons, seasonStartFor } from '@/lib/cadence/seasons'`. (Task 6 extends the first import with `monthStartForBucket, seasonStartForBucket`; Task 7 adds `isPlacement`. Importing them early trips `noUnusedLocals`.)
- `DbTask`: after `week_start: string | null` add `month_start: string | null`, `season_start: string | null`, `is_goal: boolean | null`.
- Mapper (after the `weekStart:` line):
  ```ts
    monthStart: dbTask.month_start ? parseLocalYmd(dbTask.month_start) : undefined,
    seasonStart: dbTask.season_start ? parseLocalYmd(dbTask.season_start) : undefined,
    isGoal: dbTask.is_goal ?? false,
  ```
- `AddTaskOptions` (after `weekStart?: Date`):
  ```ts
    /** Which month a bucket='month' creation belongs to. Defaults to this month. */
    monthStart?: Date
    /** Which season a bucket='quarter' creation belongs to. Defaults to this season. */
    seasonStart?: Date
    /** A month/season goal: ticked, never placed. Ignored outside those buckets. */
    isGoal?: boolean
  ```
- Insert payload (after the `week_start:` line):
  ```ts
        month_start: !scheduledFor && options?.bucket === 'month'
          ? localYmd(options?.monthStart ?? monthStartOf(now)) : null,
        season_start: !scheduledFor && options?.bucket === 'quarter'
          ? localYmd(options?.seasonStart ?? seasonStartFor(now, readSeasons())) : null,
        is_goal: !scheduledFor && (options?.bucket === 'month' || options?.bucket === 'quarter') && options?.isGoal === true,
  ```
  (`now` already exists in `addTask` as the optimistic timestamp — confirm with `grep -n "const now = new Date()" src/hooks/useSupabaseTasks.ts` inside `addTask`; if it doesn't, add `const now = new Date()` above the optimistic task.) Also add `monthStart`, `seasonStart`, `isGoal` to the `optimisticTask` object mirroring the same rules, so the row renders correctly before the round-trip.
- Both update mappers (after the `weekStart` line in each):
  ```ts
    if ('monthStart' in updates) dbUpdates.month_start = updates.monthStart ? localYmd(updates.monthStart) : null
    if ('seasonStart' in updates) dbUpdates.season_start = updates.seasonStart ? localYmd(updates.seasonStart) : null
    if ('isGoal' in updates) dbUpdates.is_goal = updates.isGoal === true
  ```

- [ ] **Step 5: Run the whole hook suite + tsc**

Run: `npx vitest run src/hooks/useSupabaseTasks.test.ts && npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/types/task.ts src/hooks/useSupabaseTasks.ts src/hooks/useSupabaseTasks.test.ts src/test/mocks/factories.ts
git commit -m "feat(tasks): monthStart, seasonStart, isGoal reach the client

Mapper, insert (stamped on month/quarter creation, defaulting to the current
period), both update mappers. is_goal is ignored outside month/quarter so a
week row can never be born unplaceable."
```

---

### Task 6: Writers stamp periods on the way into a bucket

**Files:**
- Modify: `src/hooks/useSupabaseTasks.ts` — `pushTask` (~1609-1665), `setBucket` (~1666-1676)
- Test: `src/hooks/useSupabaseTasks.test.ts`

**Interfaces:**
- Consumes: `monthStartForBucket`, `seasonStartForBucket` from Task 4.
- Produces: every bucket move writes all three period stamps (`week_start`, `month_start`, `season_start`) — set for the bucket being entered, NULL for the others.

- [ ] **Step 1: Write the failing tests**

```ts
  describe('period stamping on bucket moves', () => {
    beforeEach(() => localStorage.clear())

    it('pushTask to month stamps this month and clears week/season', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task', bucket: 'week', week_start: '2026-09-06' }))
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))
      await act(async () => { await result.current.pushTask('task-1', 'month') })
      const now = new Date()
      const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        bucket: 'month', month_start: first, week_start: null, season_start: null,
      }))
    })

    it('pushTask to quarter stamps this season and clears month', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task', bucket: 'month', month_start: '2026-09-01' }))
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))
      await act(async () => { await result.current.pushTask('task-1', 'quarter') })
      const call = mockUpdate.mock.calls.at(-1)![0] as Record<string, unknown>
      expect(call.bucket).toBe('quarter')
      expect(call.month_start).toBeNull()
      expect(typeof call.season_start).toBe('string')
    })

    // The clear is the half that prevents a haunting: a month task sent to the
    // week that kept its month_start would reappear in that month's look-back.
    it('setBucket to week clears month_start and season_start', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task', bucket: 'month', month_start: '2026-09-01' }))
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))
      await act(async () => { await result.current.setBucket('task-1', 'week') })
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'week', month_start: null, season_start: null }))
    })

    it('pushTask to a date clears every period stamp', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'task-1', title: 'Task', bucket: 'month', month_start: '2026-09-01' }))
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))
      await act(async () => { await result.current.pushTask('task-1', new Date(2026, 8, 20, 9)) })
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'timed', month_start: null, season_start: null, week_start: null }))
    })
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/hooks/useSupabaseTasks.test.ts -t "period stamping"`
Expected: FAIL — `month_start` not in the update payload.

- [ ] **Step 3: Implement**

In `pushTask`, the pool branch:
```ts
      await updateTask(id, {
        bucket: target,
        scheduledFor: undefined,
        weekStart: weekStartForBucket(target, currentWeekStart()),
        monthStart: monthStartForBucket(target, new Date()),
        seasonStart: seasonStartForBucket(target, new Date()),
        deferCount,
      })
```
The date branch — add `weekStart: undefined, monthStart: undefined, seasonStart: undefined,` to its `updateTask` call (a date implies `timed`; every period stamp clears). Check whether the date branch already clears `weekStart`; if it does, keep that line and add the other two.

In `setBucket`, after `updates.weekStart = …`:
```ts
    updates.monthStart = monthStartForBucket(bucket, new Date())
    updates.seasonStart = seasonStartForBucket(bucket, new Date())
```
Also in `scheduleTask` add `weekStart: undefined, monthStart: undefined, seasonStart: undefined` to its update (same reason as the date branch).

Note: `'monthStart' in updates` with value `undefined` must produce `month_start: null` — the update mapper from Task 5 does this (`updates.monthStart ? … : null`). Verify the existing `weekStart` mapper behaves the same way (it does: `updates.weekStart ? localYmd(...) : null`).

- [ ] **Step 4: Run and type-check**

Run: `npx vitest run src/hooks/useSupabaseTasks.test.ts && npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSupabaseTasks.ts src/hooks/useSupabaseTasks.test.ts
git commit -m "feat(tasks): bucket moves stamp the period entered and clear the others

pushTask/setBucket/scheduleTask write week_start, month_start and season_start
together, the way weekStartForBucket already did for the week. The clear is
what keeps a task sent onward from haunting its old month's look-back."
```

---

### Task 7: A goal cannot be placed — the refusal, and `setGoal`

**Files:**
- Modify: `src/hooks/useSupabaseTasks.ts` — `updateTask` (top, after the not-found guard ~1107), `updateTasksBulk` (top), new `setGoal` writer next to `setBucket`, the returned object (~line 1788 — add `setGoal`)
- Test: `src/hooks/useSupabaseTasks.test.ts`

**Interfaces:**
- Consumes: `isPlacement(updates)` from Task 4; `showToast` (already imported).
- Produces: `setGoal(id: string, isGoal: boolean): Promise<void>` on the hook's return. Behaviour: any `updateTask`/`updateTasksBulk` whose updates `isPlacement(...)` on a row with `isGoal === true` is dropped with `showToast("Goals aren't scheduled — tick it off when it's done", 'info')` and a `logger.debug`. `setGoal(id, true)` is refused (toast "Only a month or season item can be a goal") unless the row's bucket is month/quarter. `setGoal(id, false)` always writes `{ isGoal: false }`.
- The refusal sits in `updateTask`, so `pushTask`, `setBucket`, `scheduleTask`, DomainGate-gated actions and every UI path that reaches them are covered without touching them.

- [ ] **Step 1: Write the failing tests**

```ts
  describe('a goal cannot be placed', () => {
    const goal = () => createMockDbTask({ id: 'g1', title: 'Read more', bucket: 'month', month_start: '2026-09-01', is_goal: true })

    it('pushTask to a week is a no-op with a toast', async () => {
      mockSupabaseData.push(goal())
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))
      mockUpdate.mockClear()
      await act(async () => { await result.current.pushTask('g1', 'week') })
      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/Goals aren.t scheduled/), 'info')
    })

    it('scheduleTask and setBucket are refused the same way', async () => {
      mockSupabaseData.push(goal())
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))
      mockUpdate.mockClear()
      await act(async () => {
        await result.current.scheduleTask('g1', new Date(2026, 8, 20))
        await result.current.setBucket('g1', 'week')
        await result.current.updateTask('g1', { scheduledFor: new Date(2026, 8, 21) })
      })
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    // Ticking, renaming, re-tagging: none of these move it, all of them are fine.
    it('non-placement edits on a goal still write', async () => {
      mockSupabaseData.push(goal())
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))
      mockUpdate.mockClear()
      await act(async () => {
        await result.current.updateTask('g1', { title: 'Read more books', completed: true, context: 'personal' })
      })
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Read more books', completed: true }))
    })

    // "Keep" (copy to next month) writes monthStart on a goal — that is the one
    // period write a goal must accept, because it isn't moving DOWN, it's
    // staying a goal in the next period. It arrives via addTask (a NEW row),
    // never updateTask, so the refusal doesn't block it.
    it('a copy-forward of a goal is an addTask, not a refused update', async () => {
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.loading).toBe(false))
      await act(async () => {
        await result.current.addTask('Read more', undefined, undefined, undefined, {
          bucket: 'month', monthStart: new Date(2026, 9, 1), isGoal: true, sourceId: 'g1',
        })
      })
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ is_goal: true, month_start: '2026-10-01', source_id: 'g1' }))
    })

    it('updateTasksBulk drops goals from a placement but writes the rest', async () => {
      mockSupabaseData.push(goal(), createMockDbTask({ id: 't2', title: 'Task', bucket: 'month' }))
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(2))
      await act(async () => { await result.current.updateTasksBulk(['g1', 't2'], { bucket: 'week' }) })
      expect(mockIn).toHaveBeenCalledWith('id', ['t2'])
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/1 goal stays/), 'info')
    })
  })

  describe('setGoal', () => {
    it('marks a month item as a goal and back', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 't1', title: 'Task', bucket: 'month' }))
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))
      await act(async () => { await result.current.setGoal('t1', true) })
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ is_goal: true }))
      await act(async () => { await result.current.setGoal('t1', false) })
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ is_goal: false }))
    })

    it('refuses to make a week item a goal', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 't1', title: 'Task', bucket: 'week' }))
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))
      mockUpdate.mockClear()
      await act(async () => { await result.current.setGoal('t1', true) })
      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/month or season/), 'info')
    })
  })
```
`mockShowToast`: check the top of the test file for an existing `vi.mock('./useToast', …)`. If absent, add near the other mocks:
```ts
const mockShowToast = vi.fn()
vi.mock('./useToast', () => ({ showToast: (...args: unknown[]) => mockShowToast(...args), useToast: () => ({ toast: null, dismiss: () => {} }) }))
```
and `mockShowToast.mockClear()` in the suite's `beforeEach`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/hooks/useSupabaseTasks.test.ts -t "goal"`
Expected: FAIL — update is called; `setGoal` is not a function.

- [ ] **Step 3: Implement**

In `updateTask`, immediately after the not-found guard:
```ts
    // A goal is an outcome you tick, never a thing you place. Refusing here,
    // in the one writer every placement funnels through, covers pushTask,
    // setBucket, scheduleTask, the drag handlers and DomainGate without each
    // of them having to remember. Edits that don't move it — title, tick,
    // domain, notes — pass straight through.
    if (task.isGoal && isPlacement(updates)) {
      logger.debug('[updateTask] placement refused: row is a goal', { id, updates })
      showToast("Goals aren't scheduled — tick it off when it's done", 'info')
      return
    }
```
In `updateTasksBulk`, before the scope grouping, when `isPlacement(updates)`:
```ts
    let ids = taskIds
    if (isPlacement(updates)) {
      const goals = taskIds.filter((id) => findTaskById(id)?.isGoal)
      if (goals.length) {
        ids = taskIds.filter((id) => !goals.includes(id))
        showToast(`${goals.length} goal${goals.length === 1 ? '' : 's'} stay${goals.length === 1 ? 's' : ''} on the list — goals aren't scheduled`, 'info')
        if (!ids.length) return
      }
    }
```
and use `ids` in place of `taskIds` for the rest of the function (the `.in('id', …)` calls and the optimistic map).

New writer beside `setBucket`:
```ts
  /**
   * Mark a month/season item as a goal (ticked, never placed) or back into a
   * task. Only month/quarter rows can be goals — a week row is a task by
   * definition, so it's refused rather than written into an unplaceable state.
   */
  const setGoal = useCallback(async (id: string, isGoal: boolean) => {
    const task = findTaskById(id)
    if (!task) return
    if (isGoal && task.bucket !== 'month' && task.bucket !== 'quarter') {
      showToast('Only a month or season item can be a goal', 'info')
      return
    }
    await updateTask(id, { isGoal })
  }, [findTaskById, updateTask])
```
Add `setGoal` to the returned object.

- [ ] **Step 4: Run the suite, tsc, and the scope tripwire**

Run: `npx vitest run src/hooks/useSupabaseTasks.test.ts src/lib/scopeDefaultCoverage.test.ts && npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS, clean. (Find the tripwire's real path with `git ls-files | grep scopeDefaultCoverage` if that path is wrong.)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSupabaseTasks.ts src/hooks/useSupabaseTasks.test.ts
git commit -m "feat(tasks): a goal cannot be placed; setGoal

The refusal sits in updateTask, the one writer every placement funnels
through, so pushTask/setBucket/scheduleTask/drags/DomainGate are covered
without each remembering. Bulk placements drop the goals and say so."
```

---

### Task 8: `useHouseholdSeasons` — fetch, seed, update, mirror

**Files:**
- Create: `src/hooks/useHouseholdSeasons.ts`
- Test: `src/hooks/useHouseholdSeasons.test.ts`

**Interfaces:**
- Consumes: `supabase`, `useAuth` (`user`), `normalizeSeasons`, `cacheSeasons`, `readSeasons`, `DEFAULT_SEASONS`, `SEASONS_SYNC_EVENT`, type `Seasons`.
- Produces:
  ```ts
  export function useHouseholdSeasons(): {
    seasons: Seasons            // readSeasons() until the row loads, then the row's (normalized)
    loading: boolean
    canEdit: boolean            // households.owner_id === user.id
    setSeasons: (next: Seasons) => Promise<boolean>   // owner only; writes households.seasons, caches, returns success
  }
  ```
- Seeding: if the row's `seasons` is NULL and `canEdit`, write `DEFAULT_SEASONS` once so the household has an explicit config; if NULL and not owner, just use DEFAULT (read-only).

- [ ] **Step 1: Write the failing tests**

```ts
// src/hooks/useHouseholdSeasons.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { DEFAULT_SEASONS, type Seasons } from '@/lib/cadence/seasons'

const mockUser = { id: 'owner-1' }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }))

let row: { id: string; owner_id: string; seasons: unknown } | null = null
const mockUpdate = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: row ? [row] : [], error: null }),
        }),
      }),
      update: (data: Record<string, unknown>) => {
        mockUpdate(data)
        return { eq: () => Promise.resolve({ error: null }) }
      },
    }),
  },
}))

import { useHouseholdSeasons } from './useHouseholdSeasons'

const custom: Seasons = [
  { name: 'Winter', month: 1, day: 15 }, { name: 'Spring', month: 4, day: 1 },
  { name: 'Summer', month: 7, day: 1 }, { name: 'Fall', month: 10, day: 1 },
]

describe('useHouseholdSeasons', () => {
  beforeEach(() => { localStorage.clear(); mockUpdate.mockClear(); row = null })

  it('serves the row\'s seasons and mirrors them to the cache', async () => {
    row = { id: 'h1', owner_id: 'owner-1', seasons: custom }
    const { result } = renderHook(() => useHouseholdSeasons())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.seasons).toEqual(custom)
    expect(JSON.parse(localStorage.getItem('symphony-seasons')!)).toEqual(custom)
    expect(result.current.canEdit).toBe(true)
  })

  // A household that has never set seasons gets the default written once, so
  // Settings shows a real, editable config instead of an implicit one.
  it('seeds DEFAULT_SEASONS when the owner reads a NULL', async () => {
    row = { id: 'h1', owner_id: 'owner-1', seasons: null }
    const { result } = renderHook(() => useHouseholdSeasons())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockUpdate).toHaveBeenCalledWith({ seasons: DEFAULT_SEASONS })
    expect(result.current.seasons).toEqual(DEFAULT_SEASONS)
  })

  it('a member (not owner) reads but cannot edit, and does not seed', async () => {
    row = { id: 'h1', owner_id: 'someone-else', seasons: null }
    const { result } = renderHook(() => useHouseholdSeasons())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.canEdit).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
    const ok = await act(() => result.current.setSeasons(custom))
    expect(ok).toBe(false)
  })

  it('setSeasons normalizes, writes, and caches', async () => {
    row = { id: 'h1', owner_id: 'owner-1', seasons: DEFAULT_SEASONS }
    const { result } = renderHook(() => useHouseholdSeasons())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const unsorted = [custom[3], custom[0], custom[2], custom[1]] as unknown as Seasons
    await act(async () => { await result.current.setSeasons(unsorted) })
    expect(mockUpdate).toHaveBeenLastCalledWith({ seasons: custom })
    expect(result.current.seasons).toEqual(custom)
  })

  it('with no household row at all, serves the cached/default seasons read-only', async () => {
    row = null
    const { result } = renderHook(() => useHouseholdSeasons())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.seasons).toEqual(DEFAULT_SEASONS)
    expect(result.current.canEdit).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/hooks/useHouseholdSeasons.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/hooks/useHouseholdSeasons.ts
//
// The household's seasons, from households.seasons. One row per household,
// RLS lets every member read it and only the owner update it. Mirrored to
// localStorage through cacheSeasons so the synchronous readers (the writers
// that stamp season_start, getDueSession) have the household's answer, not
// the default, from the first render after the first load.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  DEFAULT_SEASONS, normalizeSeasons, cacheSeasons, readSeasons, SEASONS_SYNC_EVENT, type Seasons,
} from '@/lib/cadence/seasons'

interface HouseholdRow { id: string; owner_id: string; seasons: unknown }

export function useHouseholdSeasons(): {
  seasons: Seasons
  loading: boolean
  canEdit: boolean
  setSeasons: (next: Seasons) => Promise<boolean>
} {
  const { user } = useAuth()
  const [seasons, setSeasonsState] = useState<Seasons>(readSeasons)
  const [household, setHousehold] = useState<HouseholdRow | null>(null)
  const [loading, setLoading] = useState(true)

  const canEdit = !!user && !!household && household.owner_id === user.id

  useEffect(() => {
    if (!user) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      // RLS scopes this to the households the user belongs to; a member is in
      // one. Oldest first so a stray second row can't shadow the real one.
      const { data, error } = await supabase
        .from('households')
        .select('id, owner_id, seasons')
        .order('created_at', { ascending: true })
        .limit(1)
      if (cancelled) return
      const row = (!error && data?.[0]) ? (data[0] as HouseholdRow) : null
      setHousehold(row)
      if (row) {
        if (row.seasons == null) {
          // Never configured. The owner seeds the default once so Settings
          // shows something real to edit; a member just reads the default.
          if (row.owner_id === user.id) {
            await supabase.from('households').update({ seasons: DEFAULT_SEASONS }).eq('id', row.id)
          }
          setSeasonsState(DEFAULT_SEASONS)
          cacheSeasons(DEFAULT_SEASONS)
        } else {
          const normalized = normalizeSeasons(row.seasons)
          setSeasonsState(normalized)
          cacheSeasons(normalized)
        }
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [user])

  // Another tab (or this one, via setSeasons) changed the mirror.
  useEffect(() => {
    const sync = () => setSeasonsState(readSeasons())
    window.addEventListener(SEASONS_SYNC_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(SEASONS_SYNC_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const setSeasons = useCallback(async (next: Seasons): Promise<boolean> => {
    if (!canEdit || !household) return false
    const normalized = normalizeSeasons(next)
    const { error } = await supabase.from('households').update({ seasons: normalized }).eq('id', household.id)
    if (error) return false
    setSeasonsState(normalized)
    cacheSeasons(normalized)
    return true
  }, [canEdit, household])

  return { seasons, loading, canEdit, setSeasons }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/hooks/useHouseholdSeasons.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useHouseholdSeasons.ts src/hooks/useHouseholdSeasons.test.ts
git commit -m "feat(household): useHouseholdSeasons — read, seed, update, mirror

Owner seeds DEFAULT_SEASONS once on a NULL so Settings has a real config to
edit; members read. Mirrors to the seasons cache so synchronous readers get
the household's answer from the first render after load."
```

---

### Task 9: `SeasonsSettings` — four rows in Settings

**Files:**
- Create: `src/components/settings/SeasonsSettings.tsx`
- Test: `src/components/settings/SeasonsSettings.test.tsx`
- Modify: `src/components/settings/SettingsPage.tsx:349` — add `<SeasonsSettings />` on the line after `<PlanningRhythmSettings />`, and the import beside `PlanningRhythmSettings`'s.

**Interfaces:**
- Consumes: `useHouseholdSeasons` (Task 8), `MONTH_NAMES` from `@/lib/cadence/periods`, `seasonLabel` from `@/lib/cadence/seasons`.
- Produces: a `<section>` titled **Seasons** with four rows; each row: a text input (name, `aria-label="Season N name"`), a month `<select>` (`aria-label="Season N starts in"`), a day `<select>` 1–31 (`aria-label="Season N start day"`). Owner: editable, saved on blur/change via `setSeasons`. Member: same rows rendered as read-only text with a muted line "Only the household owner can change these." A muted footer: "Today is in {seasonLabel(new Date(), seasons)}."

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/settings/SeasonsSettings.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DEFAULT_SEASONS, type Seasons } from '@/lib/cadence/seasons'

const state = { seasons: DEFAULT_SEASONS as Seasons, loading: false, canEdit: true }
const mockSetSeasons = vi.fn(async (next: Seasons) => { state.seasons = next; return true })
vi.mock('@/hooks/useHouseholdSeasons', () => ({
  useHouseholdSeasons: () => ({ ...state, setSeasons: mockSetSeasons }),
}))

import { SeasonsSettings } from './SeasonsSettings'

describe('SeasonsSettings', () => {
  beforeEach(() => { state.seasons = DEFAULT_SEASONS; state.canEdit = true; mockSetSeasons.mockClear() })

  it('renders the four seasons with their start dates', () => {
    render(<SeasonsSettings />)
    expect(screen.getByRole('heading', { name: 'Seasons' })).toBeInTheDocument()
    expect(screen.getByLabelText('Season 4 name')).toHaveValue('Fall')
    expect(screen.getByLabelText('Season 4 starts in')).toHaveValue('10')
    expect(screen.getByLabelText('Season 4 start day')).toHaveValue('1')
  })

  it('says which season today is in', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 8, 5))
    render(<SeasonsSettings />)
    expect(screen.getByText(/Today is in Summer 2026/)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('changing a start month saves the whole config', () => {
    render(<SeasonsSettings />)
    fireEvent.change(screen.getByLabelText('Season 4 starts in'), { target: { value: '9' } })
    expect(mockSetSeasons).toHaveBeenCalledTimes(1)
    const next = mockSetSeasons.mock.calls[0][0]
    expect(next[3]).toEqual({ name: 'Fall', month: 9, day: 1 })
  })

  it('renaming saves on blur, not on every keystroke', () => {
    render(<SeasonsSettings />)
    const input = screen.getByLabelText('Season 1 name')
    fireEvent.change(input, { target: { value: 'Deep winter' } })
    expect(mockSetSeasons).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(mockSetSeasons).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: 'Deep winter' })]))
  })

  it('a member sees the seasons read-only', () => {
    state.canEdit = false
    render(<SeasonsSettings />)
    expect(screen.queryByLabelText('Season 1 name')).not.toBeInTheDocument()
    expect(screen.getByText('Fall')).toBeInTheDocument()
    expect(screen.getByText(/Only the household owner/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/settings/SeasonsSettings.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/settings/SeasonsSettings.tsx
//
// The household's four seasons — the groupings it plans by, not the
// meteorological or fiscal ones. The owner edits; members read. Every
// "season" in the app (the season pool, the cadence nudge, the Season tab,
// the paper window) follows what is set here.

import { useState } from 'react'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { MONTH_NAMES } from '@/lib/cadence/periods'
import { seasonLabel, type SeasonBoundary, type Seasons } from '@/lib/cadence/seasons'

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

function NameInput({ index, value, onCommit }: { index: number; value: string; onCommit: (name: string) => void }) {
  // Local draft so a rename doesn't write on every keystroke.
  const [draft, setDraft] = useState(value)
  return (
    <input
      aria-label={`Season ${index + 1} name`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft.trim() && draft !== value) onCommit(draft.trim()); else setDraft(value) }}
      className="w-32 border border-neutral-200 rounded-lg px-3 py-1.5 text-sm text-neutral-700 bg-white"
    />
  )
}

export function SeasonsSettings() {
  const { seasons, canEdit, setSeasons } = useHouseholdSeasons()

  const update = (index: number, patch: Partial<SeasonBoundary>) => {
    const next = seasons.map((s, i) => (i === index ? { ...s, ...patch } : s)) as unknown as Seasons
    void setSeasons(next)
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-neutral-700 mb-2">Seasons</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Your household's own groupings for seasonal planning. Each season runs from its start date to the next one's.
      </p>

      <div className="space-y-3">
        {seasons.map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-3 p-4 bg-white rounded-lg border border-neutral-100">
            {canEdit ? (
              <>
                <NameInput index={i} value={s.name} onCommit={(name) => update(i, { name })} />
                <div className="flex items-center gap-2 text-sm text-neutral-600">
                  <span>starts</span>
                  <select
                    aria-label={`Season ${i + 1} starts in`}
                    value={String(s.month)}
                    onChange={(e) => update(i, { month: Number(e.target.value) })}
                    className="border border-neutral-200 rounded-lg px-3 py-1.5 text-sm text-neutral-700 bg-white"
                  >
                    {MONTH_NAMES.map((name, m) => (
                      <option key={name} value={String(m + 1)}>{name}</option>
                    ))}
                  </select>
                  <select
                    aria-label={`Season ${i + 1} start day`}
                    value={String(s.day)}
                    onChange={(e) => update(i, { day: Number(e.target.value) })}
                    className="border border-neutral-200 rounded-lg px-3 py-1.5 text-sm text-neutral-700 bg-white"
                  >
                    {DAYS.map((d) => (
                      <option key={d} value={String(d)}>{d}</option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                <p className="text-neutral-700 font-medium">{s.name}</p>
                <p className="text-sm text-neutral-500">starts {MONTH_NAMES[s.month - 1]} {s.day}</p>
              </>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-neutral-500 mt-3">
        Today is in {seasonLabel(new Date(), seasons)}.
        {!canEdit && ' Only the household owner can change these.'}
      </p>
    </section>
  )
}
```

`SettingsPage.tsx`: add `import { SeasonsSettings } from './SeasonsSettings'` beside the `PlanningRhythmSettings` import, and `<SeasonsSettings />` on the line after `<PlanningRhythmSettings />` (inside the same wrapper element — read lines 345–352 first to match the surrounding structure).

- [ ] **Step 4: Run to verify they pass, then type-check**

Run: `npx vitest run src/components/settings/SeasonsSettings.test.tsx && npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS (5 tests), clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/SeasonsSettings.tsx src/components/settings/SeasonsSettings.test.tsx src/components/settings/SettingsPage.tsx
git commit -m "feat(settings): Seasons — the household's four boundaries, owner-edited

Name + start month + start day per season, saved on change (names on blur).
Members read. Every 'season' in the app follows this."
```

---

### Task 10: Full verification and push

**Files:** none new.

- [ ] **Step 1: Full suite, lint, tsc**

Run:
```bash
(cd connectors && npm install --silent >/dev/null 2>&1)
npx vitest run 2>&1 | grep -E "FAIL|Tests |Test Files "
npm run lint 2>&1 | tail -2
npx tsc --noEmit -p tsconfig.app.json
grep -rn "\[2, 5, 8, 11\]\|\[11, 2, 5, 8\]\|meteorological" src/ | grep -v "used to\|Not meteorological"
```
Expected: 0 failed; `0 errors`; tsc clean; the grep prints nothing.

- [ ] **Step 2: Browser check (the demo account is what the automation tab is signed into — do not edit Scott's real household)**

Start `npm run dev` in the worktree, open `/settings`:
- The **Seasons** section appears directly under Planning Rhythm with four rows (Winter Jan 1 · Spring Apr 1 · Summer Jul 1 · Fall Oct 1) and "Today is in Summer 2026."
- Change Season 4's month to September; reload; it persisted (the `households` row was written).
- Change it back to October.
- Open `/today` → the Month dropdown still lists the same month items as before (nothing vanished — NULL rows still belong to the current month).
- Open the Time-block overlay → "This month" tab unchanged.
If the change does not appear after a full reload, kill the dev server and `rm -rf node_modules/.vite` (worktree HMR trap).

- [ ] **Step 3: Rebase and push to `main`**

```bash
git fetch origin && git rebase origin/main && git push origin HEAD:main
```
Expected: pre-push runs tsc + tests and pushes. Then confirm the deployment: `gh api repos/scottring/symphonyOS/deployments --jq '.[0] | "\(.sha[0:8]) \(.environment)"'` shows the new SHA.

- [ ] **Step 4: Record**

Append to the memory index a pointer to a new memory file describing: the three columns and their NULL rule; `periodPlacement.ts` twins; `seasons.ts` replacing two hard-coded sites; `is_goal` refusal lives in `updateTask`; `useHouseholdSeasons` mirrors to `symphony-seasons`; Step 2 (copy-down + `/week` posture) is next.

---

## Steps 2–5 — phase outlines (each gets its own plan when it starts)

**Step 2 — `/week` becomes the week list.** Rename the strip to "This week · N", empty state "Nothing on the list yet."; ticked pills linger struck-through; `WeekMonthRail` (read-only current-month list, goals first with Target badge, → placed marks) beside the grid, collapsed state per device; "Last week" toggle (`belongsToWeek(task, prevWeekStart)` incl. completed; Carry forward = move `week_start`, Drop, Someday); **copy-down**: `pushTask('week')` and the DomainGate path on a `bucket:'month'|'quarter'` **task** insert a copy with `source_id` and leave the original — `lib/planning/lineage.ts` (`placedCopyOf(task, tasks)`) derives the original's → placed / ✓ state; `selectHorizonPool('month')` excludes placed originals from the open count. Tests pin: original untouched, copy carries `context`/`assignedTo`/`notes`/`links`, goal copy-down refused.

**Step 3 — `/plans`.** `src/apps/plans/` + `src/components/plans/`; `PageMasthead` + `PAGE_COLUMN`; tabs Month · Season · Year; period navigator (current = `belongsTo*`, others = `isPlacedOn*`); Goals section then Tasks; fate marks from `lib/planning/lookback.ts` (`fateOf(task, tasks)` → none · done · placed-open · placed-done · someday); look-back actions on past periods and the last 3 days of the current (Keep = `addTask` copy with next `month_start`/`season_start`, Drop, Someday for tasks only, Make it a task = `setGoal(id, false)`); inline add with Task/Goal toggle and `soleDomain`; Season rail on Month, Year rail on Season; Year tab embeds `GoalsList`; sidebar row **Plans** between This Week and Library; Library Goals row removed; `/goals` redirects to `/plans?tab=year`.

**Step 4 — Today dropdowns.** Week dropdown: checkbox + "Do today" lead, Tomorrow/Someday/Delete behind a row ⋯; label "This week · N". Month dropdown: label "This month · N", checkbox + "This week" (copy-down), goals badged and unplaceable (the writer refusal already guarantees it; the UI hides the verbs).

**Step 5 — Paper.** `planItemToAddTaskArgs`: month → `{ bucket:'month', monthStart: monthForPage(today) }` (current month unless the last 7 days → next); season → `seasonStart` (current unless the last 14 days → next); month/season pages accept `kind:'goal'` → `isGoal: true` in that bucket; review sheet shows the period as a chip (‹ September › ‹ October ›); `planWindowDates('season')` = today through `seasonEndFor(nextSeasonStart…)`; redeploy `parse-page` (`--use-api`) **before** pushing main.
