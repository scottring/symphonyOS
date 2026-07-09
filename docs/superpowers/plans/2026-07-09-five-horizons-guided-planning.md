# Five Horizons Guided Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Symphony's five planning-session experiences with one guided, voiced, step-at-a-time ritual engine driven by per-horizon configs.

**Architecture:** A `GuidedSession` shell plays an ordered list of typed steps from pure-data configs (`sessions.ts`). Step components are resolved from a registry and reuse existing mechanics (bucket triage, reference panels, the weekly grid). Narration text lives in the configs and is pre-generated to mp3s by a dev-time script; a manifest keyed by step maps text → audio file, with drift detected by tests.

**Tech Stack:** React 19 + TypeScript strict, Vite 7, Tailwind v4 (Nordic Journal), Supabase (`planning_sessions` jsonb), Vitest + RTL, ElevenLabs TTS (dev-time only).

**Spec:** `docs/superpowers/specs/2026-07-09-five-horizons-guided-planning-design.md`

## Global Constraints

- Work ONLY in the worktree `/Users/scottkaufman/Developer/Developer/symphonyOS/.claude/worktrees/five-horizons` (branch `worktree-five-horizons`). Never touch the main worktree.
- Run tests with `npx vitest run <file>` — plain `npm test` is watch mode and will hang.
- NO emoji anywhere in UI — lucide-react icons only.
- Nordic Journal styling: `font-display` for headlines, `.card`/`btn-primary` idioms, warm neutrals. Follow the class patterns already in `CadenceSession.tsx`.
- Tasks are created into horizon pools by passing `bucket` INSIDE `AddTaskOptions` on the single `addTask` call. NEVER `addTask(...)` then `setBucket(...)` — that race silently drops the bucket write.
- `sessions.ts` must stay pure data: it may import types only, never components (the narration script imports it under Node via tsx).
- Existing `planning_sessions.period_token` formats MUST be preserved: annual `2026`, seasonal `2026-S2`, monthly `2026-7`, weekly = whatever `weeklyPlanning.ts` uses today (verify before coding), daily `2026-07-09` (new).
- Commit after every task with a conventional message + the standard co-author/session trailers.
- Before the final push: `npx vitest run`, `npm run lint`, `npm run build` — all three must pass.

---

### Task 1: Types + period tokens

**Files:**
- Create: `src/components/planning/guided/types.ts`
- Create: `src/components/planning/guided/periods.ts`
- Test: `src/components/planning/guided/periods.test.ts`

**Interfaces (Produces):**
- `StepType`, `GuidedStepConfig`, `GuidedSessionConfig`, `GuidedStepRenderContext` (types.ts)
- `guidedPeriod(horizon: PlanningHorizon, now?: Date): { token: string; label: string; start: Date; end: Date }` (periods.ts)

- [ ] **Step 1: Verify the weekly period token format**

Run: `grep -n "weekId\|periodToken" src/components/planning/weekly/weeklyPlanning.ts src/components/planning/weekly/WeeklyPlanningSession.tsx | head -20`

Find the function that produces the weekly session's `period_token` (the weekly session already writes shared `planning_sessions` rows — the new code must produce IDENTICAL tokens or existing rows orphan). Note its export name and format; reuse it in `periods.ts` below (import it rather than reimplementing if it's exported; otherwise copy the exact implementation and add a test pinning the format).

- [ ] **Step 2: Write `types.ts`**

```ts
// src/components/planning/guided/types.ts
//
// Pure types for the guided Five Horizons sessions. sessions.ts (pure data)
// and the narration generation script both depend on this file, so it must
// never import components.

import type { PlanningHorizon, PlanningNotes } from '@/hooks/usePlanningSession'
import type { TaskBucket } from '@/types/task'

export type StepType =
  | 'narration'      // instruction moment, Continue
  | 'reflect'        // voiced prompt + textarea -> planning_sessions.notes[key]
  | 'review'         // this horizon's open items: complete / migrate / let go
  | 'look-above'     // read-only level-above panel (+ copy-down / tap-to-pull)
  | 'calendar'       // period look-ahead
  | 'write-list'     // add items into this horizon's bucket
  | 'inbox'          // weekly "Look Around": triage inbox to zero
  | 'schedule-grid'  // weekly: the existing StepSchedule grid
  | 'domains-goals'  // annual: goal statements per life domain
  | 'book-next'      // create next session's calendar item

export interface GuidedStepConfig {
  /** Unique within the session; keys the narration manifest as `<horizon>.<id>`. */
  id: string
  type: StepType
  /** Step header, e.g. "Look back". */
  title: string
  /** Shown on screen AND spoken. Single source of truth for the voice. */
  narration: string
  props?: {
    /** reflect: which notes key the textarea persists to. */
    notesKey?: string
    placeholder?: string
    /** review/write-list/inbox/look-above: which bucket this step reads/writes. */
    bucket?: TaskBucket
    /** review source override: 'someday' | 'overdue' | 'goals' (default: bucket). */
    source?: 'someday' | 'overdue' | 'goals'
    /** look-above: bucket of the level above ('quarter' for month, …) or 'goals'. */
    aboveBucket?: TaskBucket | 'goals'
    aboveLabel?: string
    /** look-above: daily variant — tapping an item MOVES it into today. */
    pick?: boolean
    /** write-list: soft item-count nudge (never blocks). */
    softCap?: number
    /** book-next: which horizon's session to schedule. */
    bookHorizon?: PlanningHorizon
    bookTitle?: string
  }
}

export interface GuidedSessionConfig {
  horizon: PlanningHorizon
  title: string        // "Plan the season"
  estMinutes: [number, number]
  steps: GuidedStepConfig[]
}

/** Everything a step component receives. Passed via GuidedContext. */
export interface GuidedStepRenderContext {
  horizon: PlanningHorizon
  periodToken: string
  periodLabel: string
  periodStart: Date
  periodEnd: Date
  notes: PlanningNotes
  patchNotes: (partial: PlanningNotes) => void
}
```

- [ ] **Step 3: Write the failing periods test**

```ts
// src/components/planning/guided/periods.test.ts
import { describe, it, expect } from 'vitest'
import { guidedPeriod } from './periods'

describe('guidedPeriod', () => {
  const now = new Date(2026, 6, 9) // Jul 9 2026

  it('annual token matches existing rows', () => {
    const p = guidedPeriod('annual', now)
    expect(p.token).toBe('2026')
    expect(p.label).toBe('2026')
    expect(p.start.getMonth()).toBe(0)
    expect(p.end.getMonth()).toBe(11)
  })

  it('seasonal token matches existing rows (Summer = S2)', () => {
    const p = guidedPeriod('seasonal', now)
    expect(p.token).toBe('2026-S2')
    expect(p.label).toBe('Summer 2026')
  })

  it('monthly token matches existing rows (no zero-pad)', () => {
    const p = guidedPeriod('monthly', now)
    expect(p.token).toBe('2026-7')
    expect(p.label).toBe('July 2026')
  })

  it('weekly token matches the existing weekly session format', () => {
    const p = guidedPeriod('weekly', now)
    // Pin to the EXACT format found in Step 1 (adjust this assertion to match).
    expect(p.token).toMatch(/^2026/)
    expect(p.start.getDay()).toBe(1) // Monday start, matching weeklyPlanning.ts
  })

  it('daily token is ISO date', () => {
    const p = guidedPeriod('daily', now)
    expect(p.token).toBe('2026-07-09')
    expect(p.label).toBe('Thursday, July 9')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/components/planning/guided/periods.test.ts`
Expected: FAIL — `Cannot find module './periods'`

- [ ] **Step 5: Write `periods.ts`**

```ts
// src/components/planning/guided/periods.ts
//
// Period token + label + date-range per horizon. TOKENS MUST MATCH the rows
// already in planning_sessions (written by CadenceSessions / the weekly
// session): annual '2026', seasonal '2026-S2', monthly '2026-7'. Weekly reuses
// the exact function the old weekly session used (verified in the plan's
// Task 1 Step 1). Daily is new: ISO date.

import type { PlanningHorizon } from '@/hooks/usePlanningSession'
import { MONTH_NAMES, SEASON_NAMES, seasonIndex, seasonStart, seasonEnd } from '@/lib/cadence/periods'
// If weeklyPlanning.ts exports its week-token function, import and use it here.

export interface GuidedPeriod {
  token: string
  label: string
  start: Date
  end: Date
}

function startOfWeek(now: Date): Date {
  const d = new Date(now); d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() - ((day + 6) % 7)) // back to Monday
  return d
}

export function guidedPeriod(horizon: PlanningHorizon, now: Date = new Date()): GuidedPeriod {
  const y = now.getFullYear()
  switch (horizon) {
    case 'annual': {
      return {
        token: `${y}`, label: `${y}`,
        start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59),
      }
    }
    case 'seasonal': {
      const s = seasonIndex(now)
      return {
        token: `${y}-S${s}`, label: `${SEASON_NAMES[s]} ${y}`,
        start: seasonStart(now), end: seasonEnd(now),
      }
    }
    case 'monthly': {
      return {
        token: `${y}-${now.getMonth() + 1}`, label: `${MONTH_NAMES[now.getMonth()]} ${y}`,
        start: new Date(y, now.getMonth(), 1), end: new Date(y, now.getMonth() + 1, 0, 23, 59, 59),
      }
    }
    case 'weekly': {
      const start = startOfWeek(now)
      const end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999)
      // Replace with the verified weekly token function from weeklyPlanning.ts:
      const token = /* verified format from Task 1 Step 1 */ weekToken(start)
      const label = `Week of ${MONTH_NAMES[start.getMonth()]} ${start.getDate()}`
      return { token, label, start, end }
    }
    case 'daily': {
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      const start = new Date(now); start.setHours(0, 0, 0, 0)
      const end = new Date(now); end.setHours(23, 59, 59, 999)
      return {
        token: `${y}-${mm}-${dd}`,
        label: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        start, end,
      }
    }
  }
}
```

(`weekToken` here stands in for the verified import/copy from Step 1 — bind the real one before running.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/planning/guided/periods.test.ts`
Expected: PASS (5 tests). If seasonal S-index differs from `SEASON_NAMES` ordering in `lib/cadence/periods.ts`, trust the lib — adjust the test's expected name, not the token.

- [ ] **Step 7: Commit**

```bash
git add src/components/planning/guided/types.ts src/components/planning/guided/periods.ts src/components/planning/guided/periods.test.ts
git commit -m "feat(guided): types + period tokens for the five-horizons guided sessions"
```

---

### Task 2: The five session configs (full narration copy) + integrity test

**Files:**
- Create: `src/components/planning/guided/sessions.ts`
- Test: `src/components/planning/guided/sessions.test.ts`

**Interfaces:**
- Consumes: `GuidedSessionConfig`, `GuidedStepConfig` from Task 1.
- Produces: `SESSIONS: Record<PlanningHorizon, GuidedSessionConfig>` — the single source for steps AND narration.

- [ ] **Step 1: Write the failing integrity test**

```ts
// src/components/planning/guided/sessions.test.ts
import { describe, it, expect } from 'vitest'
import { SESSIONS } from './sessions'
import type { StepType } from './types'

const KNOWN_TYPES: StepType[] = [
  'narration', 'reflect', 'review', 'look-above', 'calendar',
  'write-list', 'inbox', 'schedule-grid', 'domains-goals', 'book-next',
]

describe('guided session configs', () => {
  const horizons = ['annual', 'seasonal', 'monthly', 'weekly', 'daily'] as const

  it('defines all five horizons', () => {
    for (const h of horizons) expect(SESSIONS[h], h).toBeDefined()
  })

  it.each(horizons)('%s: every step has narration, a known type, and a unique id', (h) => {
    const seen = new Set<string>()
    for (const step of SESSIONS[h].steps) {
      expect(step.narration.trim().length, `${h}.${step.id} narration`).toBeGreaterThan(20)
      expect(KNOWN_TYPES).toContain(step.type)
      expect(seen.has(step.id), `${h}.${step.id} duplicate`).toBe(false)
      seen.add(step.id)
    }
  })

  it('reflect steps all carry a notesKey', () => {
    for (const h of horizons)
      for (const s of SESSIONS[h].steps.filter((s) => s.type === 'reflect'))
        expect(s.props?.notesKey, `${h}.${s.id}`).toBeTruthy()
  })

  it('write-list / review / inbox steps carry their bucket where required', () => {
    for (const h of horizons)
      for (const s of SESSIONS[h].steps.filter((s) => s.type === 'write-list'))
        expect(s.props?.bucket, `${h}.${s.id}`).toBeTruthy()
  })

  it('daily is light: at most 4 steps', () => {
    expect(SESSIONS.daily.steps.length).toBeLessThanOrEqual(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/planning/guided/sessions.test.ts`
Expected: FAIL — `Cannot find module './sessions'`

- [ ] **Step 3: Write `sessions.ts` with the final narration copy**

```ts
// src/components/planning/guided/sessions.ts
//
// The five guided rituals, as pure data. Narration strings here are BOTH the
// on-screen instruction and the spoken voice track (generated by
// scripts/generate-narration.ts). Keep this file free of component imports.

import type { GuidedSessionConfig } from './types'
import type { PlanningHorizon } from '@/hooks/usePlanningSession'

export const SESSIONS: Record<PlanningHorizon, GuidedSessionConfig> = {
  annual: {
    horizon: 'annual',
    title: 'Plan the year',
    estMinutes: [45, 60],
    steps: [
      {
        id: 'welcome', type: 'narration', title: 'A year, on purpose',
        narration: 'This is your annual planning session. Over the next forty-five minutes or so, you will look back at the year that is ending, imagine the one ahead, and write a short list of goals for the areas of life that matter most. There is nothing to get right here — every step can be skipped, and you can come back anytime. Find somewhere quiet, and when you are ready, continue.',
      },
      {
        id: 'looking-back', type: 'reflect', title: 'Look back',
        narration: 'Start with the year behind you. Take twenty or thirty minutes if you have them. What went well — what are you genuinely proud of? And which habits or routines did not serve you? Write freely; this is for you and whoever you share your planning with.',
        props: { notesKey: 'review', placeholder: 'Wins worth celebrating, and what didn’t serve you…' },
      },
      {
        id: 'one-year-out', type: 'reflect', title: 'One year from now',
        narration: 'Now jump forward twelve months. It is this same week, next year, and things went well. Write down what you are most proud of having accomplished — and the specific steps you took to get there. Write it in the past tense, as if it already happened.',
        props: { notesKey: 'lookingBack', placeholder: 'It’s a year from now. I’m most proud that…' },
      },
      {
        id: 'goal-review', type: 'review', title: 'Last year’s goals',
        narration: 'Here are the goals you set before. For each one: if it happened, mark it achieved and enjoy that for a second. If it still matters, carry it into the new year. And if it no longer fits who you are, let it go — that is not failure, that is editing.',
        props: { source: 'goals' },
      },
      {
        id: 'mountain-ranges', type: 'calendar', title: 'The year’s mountain ranges',
        narration: 'Look at the shape of the year ahead. These are the commitments already set in stone — trips, school calendars, birthdays, heavy stretches of work. You are not planning around them yet; you are just noticing where the mountains are. Jot anything worth remembering.',
        props: { notesKey: 'annualCalendar' },
      },
      {
        id: 'someday', type: 'review', title: 'Someday possibilities',
        narration: 'This is your someday list — the ideas you parked because the timing wasn’t right. Read through it slowly. If something is finally ready, move it into this season. Everything else can keep waiting; that is what the list is for.',
        props: { source: 'someday' },
      },
      {
        id: 'write-goals', type: 'domains-goals', title: 'This year’s goals',
        narration: 'Now write the year’s goals. Pick three to eight areas of life — health, family, work, home, fun — and under each one, write what you want without censoring yourself. One rule of thumb: aim for two goals that make you smile for every one that feels like an obligation.',
      },
      {
        id: 'book-next', type: 'book-next', title: 'Anchor the next step',
        narration: 'Last thing, and it is the one that makes this system real: put your seasonal planning session on the calendar right now, before you close this. A plan with a next appointment survives. One without usually doesn’t.',
        props: { bookHorizon: 'seasonal', bookTitle: 'Seasonal planning session' },
      },
    ],
  },

  seasonal: {
    horizon: 'seasonal',
    title: 'Plan the season',
    estMinutes: [25, 35],
    steps: [
      {
        id: 'welcome', type: 'narration', title: 'A fresh season',
        narration: 'This is your seasonal planning session — about half an hour to close out the season that is ending and shape the one ahead. Seasons are the honest unit of life: school terms, summers, the stretch before the holidays. Let’s look at what happened, and then decide what this next one is for.',
      },
      {
        id: 'season-review', type: 'review', title: 'Last season’s list',
        narration: 'Here is everything still open from this season’s list. Celebrate what got done. For each item that didn’t: carry it into the new season if it still matters, park it on Someday if the timing is wrong, or let it go. If you carry something, take one second to notice what stopped it last time.',
        props: { bucket: 'quarter' },
      },
      {
        id: 'look-at-year', type: 'look-above', title: 'Your goals for the year',
        narration: 'These are the goals you set for the year — read them slowly, but don’t move anything. You are just asking one question: which of these fit this season’s energy and timing? The season list you write next is its own list; it doesn’t have to line up with anything.',
        props: { aboveBucket: 'goals', aboveLabel: 'Your goals for the year' },
      },
      {
        id: 'season-ahead', type: 'calendar', title: 'The season ahead',
        narration: 'Scan the season’s calendar — trips, deadlines, school breaks, the weeks that are already spoken for. Notice how much open space actually exists. Plans that respect the calendar get done; plans that ignore it get abandoned.',
        props: { notesKey: 'tripChildcare' },
      },
      {
        id: 'look-within', type: 'reflect', title: 'Look within',
        narration: 'Before you write anything: how are you, actually? Energy, health, mood. A season planned for the person you wish you were will fall apart in a week. Plan for the person you are right now.',
        props: { notesKey: 'energy', placeholder: 'Energy, health, and mood going into this season…' },
      },
      {
        id: 'write-season', type: 'write-list', title: 'Write the season’s list',
        narration: 'Now write this season’s list — concrete, specific things you want to be true by the end of it. Look back at your year goals if it helps, or don’t. This list is allowed to contain things that appear nowhere else.',
        props: { bucket: 'quarter' },
      },
      {
        id: 'book-next', type: 'book-next', title: 'Anchor the next step',
        narration: 'Before you close: book the monthly planning session. Ten seconds now buys you a system that keeps running without willpower.',
        props: { bookHorizon: 'monthly', bookTitle: 'Monthly planning session' },
      },
    ],
  },

  monthly: {
    horizon: 'monthly',
    title: 'Plan the month',
    estMinutes: [15, 25],
    steps: [
      {
        id: 'welcome', type: 'narration', title: 'A clean slate',
        narration: 'This is your monthly planning session — a clean slate, twelve times a year. Twenty minutes to close last month, look at the season, and write a short list for the next four weeks.',
      },
      {
        id: 'month-review', type: 'review', title: 'Last month’s list',
        narration: 'Here is what is still open from the month’s list. Mark off what actually happened — more got done than you think. Carry forward what still matters. Let go of what doesn’t; a shorter list you believe is worth more than a long one you ignore.',
        props: { bucket: 'month' },
      },
      {
        id: 'look-at-season', type: 'look-above', title: 'Your season list',
        narration: 'This is your season list, for reference. Watch how the big items naturally suggest month-sized moves — renovate the kitchen becomes order the dishwasher. Copy a line down if you want it in front of you this month; the original stays on the season list.',
        props: { aboveBucket: 'quarter', aboveLabel: 'Your season list' },
      },
      {
        id: 'month-ahead', type: 'calendar', title: 'The month ahead',
        narration: 'Scan the next four to five weeks. The calendar is fairly solid at this range — look for conflicts, trips, and the weeks that are already full, and plan around them instead of colliding with them.',
      },
      {
        id: 'look-within', type: 'reflect', title: 'Look within',
        narration: 'A quick check on yourself, and on the people around you. How is your energy? And is there anything with each other or the kids that needs attention this month?',
        props: { notesKey: 'relationships', placeholder: 'Energy — and what needs attention with each other and the kids…' },
      },
      {
        id: 'write-month', type: 'write-list', title: 'Write the month’s list',
        narration: 'Write the month’s list. Keep it honest — and put at least one thing on it that exists purely because it will be fun. A month with nothing to look forward to is a scheduling failure.',
        props: { bucket: 'month' },
      },
      {
        id: 'book-next', type: 'book-next', title: 'Anchor the next step',
        narration: 'Book next month’s session before you close. First weekend of the month works well.',
        props: { bookHorizon: 'monthly', bookTitle: 'Monthly planning session' },
      },
    ],
  },

  weekly: {
    horizon: 'weekly',
    title: 'Plan the week',
    estMinutes: [30, 45],
    steps: [
      {
        id: 'welcome', type: 'narration', title: 'Time Tetris',
        narration: 'This is your weekly planning session — the one that keeps the whole system honest. You will clear the inbox, review last week, look at the month and the calendar, and then place the big rocks. Give it half an hour and the week stops happening TO you.',
      },
      {
        id: 'look-around', type: 'inbox', title: 'Look around',
        narration: 'First, get current. Here is everything captured into the inbox that hasn’t been dealt with. Give each one a home — a day, a list, Someday — or mark it done. An empty inbox is not tidiness; it is the difference between planning from reality and planning from memory.',
      },
      {
        id: 'week-review', type: 'review', title: 'Last week’s list',
        narration: 'Here is what is still open from last week. For each item, actively choose its fate: carry it forward, give it a specific day, make it smaller, hand it to someone else, or let it go. No item gets to just linger.',
        props: { bucket: 'week' },
      },
      {
        id: 'look-at-month', type: 'look-above', title: 'Your month list',
        narration: 'Your month list, for reference. Which of these does this week need to move? Copy down anything you want on the week’s list — the month list keeps its copy.',
        props: { aboveBucket: 'month', aboveLabel: 'Your month list' },
      },
      {
        id: 'week-ahead', type: 'calendar', title: 'Look ahead',
        narration: 'Now audit the week day by day. Look for sneak additions, double bookings, and days with no slack at all. Where are the tight transitions? Which day is secretly already full?',
      },
      {
        id: 'look-within', type: 'reflect', title: 'Look within',
        narration: 'Check in with yourself before you commit to anything: sleep debt, physical energy, emotional capacity. Set the week’s expectations to match the human doing it.',
        props: { notesKey: 'energy', placeholder: 'Sleep, energy, capacity going into this week…' },
      },
      {
        id: 'write-week', type: 'write-list', title: 'Write the week’s list',
        narration: 'Write the week’s task list. Keep it focused — around fifteen items is the honest ceiling for a week that also contains a life. The counter is a nudge, not a wall.',
        props: { bucket: 'week', softCap: 15 },
      },
      {
        id: 'place-rocks', type: 'schedule-grid', title: 'Place the big rocks',
        narration: 'Now put the most important items on actual days. Drag what matters onto the week — anything with a slot is dramatically more likely to happen than anything floating in a list.',
      },
      {
        id: 'concerns', type: 'reflect', title: 'Concerns & communication',
        narration: 'Last: anything that needs to be talked about, not just done. Logistics to coordinate, decisions pending, worries worth naming. This note is shared — it is the written half of the weekly conversation.',
        props: { notesKey: 'concerns', placeholder: 'To discuss, coordinate, or keep an eye on…' },
      },
    ],
  },

  daily: {
    horizon: 'daily',
    title: 'Plan today',
    estMinutes: [5, 10],
    steps: [
      {
        id: 'look-back', type: 'review', title: 'Look back',
        narration: 'A quick look at what carried over. Nothing here is a failure — it is just yesterday’s honest remainder. Give each item a new home in one tap.',
        props: { source: 'overdue' },
      },
      {
        id: 'look-ahead', type: 'calendar', title: 'Look ahead',
        narration: 'Here is today’s shape — the hard commitments and, more importantly, the gaps between them. The gaps are the day’s actual capacity.',
      },
      {
        id: 'look-within', type: 'reflect', title: 'Look within',
        narration: 'One word for today — how you want it to feel, or how you are. Then size the plan to match: on a packed or foggy day, one real task is a victory.',
        props: { notesKey: 'oneWord', placeholder: 'One word for today…' },
      },
      {
        id: 'pick-today', type: 'look-above', title: 'Pick from the week',
        narration: 'Here is your week list. Tap the items today should carry — they move onto today. Match the count to the open space you just saw, not to your ambition.',
        props: { aboveBucket: 'week', aboveLabel: 'Your week list', pick: true },
      },
    ],
  },
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/planning/guided/sessions.test.ts`
Expected: PASS (all integrity tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/planning/guided/sessions.ts src/components/planning/guided/sessions.test.ts
git commit -m "feat(guided): five-horizon session configs with full ritual narration"
```

---

### Task 3: Narration manifest, coverage test, and generation script

**Files:**
- Create: `src/components/planning/guided/narration.manifest.json`
- Create: `scripts/generate-narration.ts`
- Modify: `package.json` (add `narration` script + `tsx` devDependency)
- Test: `src/components/planning/guided/narration.test.ts`

**Interfaces:**
- Consumes: `SESSIONS` from Task 2.
- Produces: manifest shape `{ bootstrap: boolean; voiceId: string; clips: Record<string, { text: string; file: string }> }` keyed `<horizon>.<stepId>`; `narrationClip(horizon, stepId, narration): string | null` helper in `narration.ts`.

- [ ] **Step 1: Write the bootstrap manifest**

```json
{
  "bootstrap": true,
  "voiceId": "",
  "clips": {}
}
```

Save as `src/components/planning/guided/narration.manifest.json`.

- [ ] **Step 2: Write the failing coverage test**

```ts
// src/components/planning/guided/narration.test.ts
//
// Drift guard: every narration string in the configs must have a generated
// clip whose stored text EXACTLY matches. Until the first generation run
// (needs the ElevenLabs key + a chosen voice) the manifest ships with
// bootstrap: true and this suite warns loudly instead of failing.
import { describe, it, expect } from 'vitest'
import { SESSIONS } from './sessions'
import manifest from './narration.manifest.json'
import { narrationClip } from './narration'

describe('narration manifest', () => {
  const entries = Object.entries(SESSIONS).flatMap(([h, cfg]) =>
    cfg.steps.map((s) => ({ key: `${h}.${s.id}`, text: s.narration })))

  if (manifest.bootstrap) {
    it('BOOTSTRAP MODE — narration not yet generated', () => {
      console.warn(
        `[narration] manifest is in bootstrap mode: ${entries.length} clips ungenerated. ` +
        'Run `npm run narration` with ELEVENLABS_API_KEY set.')
      expect(manifest.clips).toEqual({})
    })
  } else {
    it.each(entries)('$key has a generated clip with matching text', ({ key, text }) => {
      const clip = (manifest.clips as Record<string, { text: string; file: string }>)[key]
      expect(clip, `${key} missing — run npm run narration`).toBeDefined()
      expect(clip.text, `${key} text drifted — run npm run narration`).toBe(text)
      expect(clip.file).toMatch(/^[a-z0-9-]+\.[0-9a-f]{8}\.mp3$/)
    })
  }

  it('narrationClip returns null for unknown/missing clips', () => {
    expect(narrationClip('daily', 'nope', 'text')).toBeNull()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/components/planning/guided/narration.test.ts`
Expected: FAIL — `Cannot find module './narration'`

- [ ] **Step 4: Write `narration.ts` (client lookup helper)**

```ts
// src/components/planning/guided/narration.ts
//
// Client-side lookup: step -> narration mp3 URL. Returns null when the clip
// is ungenerated or its text has drifted from the config (we then show text
// silently rather than speak stale audio).
import manifest from './narration.manifest.json'

interface Clip { text: string; file: string }

export function narrationClip(horizon: string, stepId: string, narration: string): string | null {
  const clip = (manifest.clips as Record<string, Clip>)[`${horizon}.${stepId}`]
  if (!clip || clip.text !== narration) return null
  return `/narration/${clip.file}`
}
```

- [ ] **Step 5: Run to verify the suite passes (bootstrap mode)**

Run: `npx vitest run src/components/planning/guided/narration.test.ts`
Expected: PASS with the loud console warning.

- [ ] **Step 6: Write the generation script**

```ts
// scripts/generate-narration.ts
//
// Dev-time only: generates narration mp3s via ElevenLabs for every step in
// the guided session configs. Hash-keyed: only new/changed narration is
// regenerated. Run with:  ELEVENLABS_API_KEY=... npm run narration
// Optional: ELEVENLABS_VOICE_ID=... (defaults to the manifest's pinned voice).
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SESSIONS } from '../src/components/planning/guided/sessions'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = resolve(root, 'src/components/planning/guided/narration.manifest.json')
const outDir = resolve(root, 'public/narration')

const apiKey = process.env.ELEVENLABS_API_KEY
if (!apiKey) { console.error('ELEVENLABS_API_KEY is required'); process.exit(1) }

interface Manifest { bootstrap: boolean; voiceId: string; clips: Record<string, { text: string; file: string }> }
const manifest: Manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const voiceId = process.env.ELEVENLABS_VOICE_ID || manifest.voiceId
if (!voiceId) { console.error('No voice pinned. Pass ELEVENLABS_VOICE_ID once; it will be saved.'); process.exit(1) }

mkdirSync(outDir, { recursive: true })

async function tts(text: string): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey!, 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2 },
    }),
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}

const next: Manifest = { bootstrap: false, voiceId, clips: {} }
let generated = 0, kept = 0

for (const [horizon, cfg] of Object.entries(SESSIONS)) {
  for (const step of cfg.steps) {
    const key = `${horizon}.${step.id}`
    const hash = createHash('sha256').update(`${voiceId}\n${step.narration}`).digest('hex').slice(0, 8)
    const file = `${horizon}-${step.id}.${hash}.mp3`
    const existing = manifest.clips[key]
    if (existing && existing.text === step.narration && existsSync(resolve(outDir, existing.file)) && existing.file === file) {
      next.clips[key] = existing; kept++; continue
    }
    process.stdout.write(`generating ${key}… `)
    const audio = await tts(step.narration)
    writeFileSync(resolve(outDir, file), audio)
    next.clips[key] = { text: step.narration, file }
    generated++
    console.log(`${(audio.length / 1024).toFixed(0)}kB`)
  }
}

writeFileSync(manifestPath, JSON.stringify(next, null, 2) + '\n')
console.log(`done: ${generated} generated, ${kept} unchanged. Manifest bootstrap=false.`)
```

- [ ] **Step 7: Wire package.json**

Add to `devDependencies`: `"tsx": "^4.19.0"` (then `npm install`). Add to `scripts`: `"narration": "tsx scripts/generate-narration.ts"`.

- [ ] **Step 8: Verify the script parses (no key needed)**

Run: `npx tsx scripts/generate-narration.ts` (WITHOUT the env var)
Expected: exits 1 with `ELEVENLABS_API_KEY is required` — proves imports resolve under Node.

- [ ] **Step 9: Commit**

```bash
git add src/components/planning/guided/narration.manifest.json src/components/planning/guided/narration.ts src/components/planning/guided/narration.test.ts scripts/generate-narration.ts package.json package-lock.json
git commit -m "feat(guided): narration manifest + ElevenLabs generation script (bootstrap mode)"
```

---

### Task 4: GuidedSession shell (progress, nav, resume, voice, registry)

**Files:**
- Create: `src/components/planning/guided/GuidedContext.tsx`
- Create: `src/components/planning/guided/useNarrationPlayer.ts`
- Create: `src/components/planning/guided/GuidedSession.tsx`
- Test: `src/components/planning/guided/GuidedSession.test.tsx`

**Interfaces:**
- Consumes: `SESSIONS`, `guidedPeriod`, `narrationClip`, `usePlanningSession`.
- Produces:
  - `GuidedHost` interface (GuidedContext.tsx) — the full adapter the container provides (fields listed in the code below; later tasks consume `useGuided()`).
  - `<GuidedSession horizon={PlanningHorizon} host={GuidedHost} onClose={() => void} />`
  - `useGuided(): GuidedStepRenderContext & { host: GuidedHost; step: GuidedStepConfig }`
  - `registerStepType(type: StepType, component: FC)` — registry; unknown types render `null`.

- [ ] **Step 1: Write `GuidedContext.tsx`**

```tsx
// src/components/planning/guided/GuidedContext.tsx
//
// Context bridging the shell and the step components. `GuidedHost` is the
// only doorway to app data/actions — step components never import hooks that
// need providers, which keeps them individually testable.
import { createContext, useContext } from 'react'
import type { Task, TaskBucket } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'
import type { Goal, GoalArea, GoalStatus } from '@/types/goal'
import type { GuidedStepConfig, GuidedStepRenderContext } from './types'

export interface GuidedHost {
  tasks: Task[]
  tasksLoading: boolean
  events: CalendarEvent[]
  calendarConnected: boolean
  fetchEvents: (start: Date, end: Date) => Promise<unknown>
  createEvent: (input: { title: string; startTime: Date; endTime: Date; allDay?: boolean }) => Promise<unknown>
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  onSetBucket: (id: string, bucket: TaskBucket) => void
  onCompleteTask: (id: string) => void
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  /** Single atomic create-into-bucket (bucket rides in AddTaskOptions). */
  createTaskInBucket: (title: string, bucket: TaskBucket) => Promise<void>
  /** Dated all-day task (book-next fallback when calendar is disconnected). */
  createDatedTask: (title: string, date: Date) => Promise<void>
  // Goals (flattened: areas + goal statements only)
  goals: Goal[]
  goalAreas: GoalArea[]
  addGoal: (areaId: string, name: string) => Promise<unknown>
  addArea: (name: string) => Promise<unknown>
  updateGoalStatus: (id: string, status: GoalStatus) => Promise<void>
  // Weekly grid pass-through
  routines: Routine[]
  draggableRoutines: Routine[]
  onScheduleRoutine: (routineId: string, date: Date, time: string) => void
  getRoutinesForDate: (date: Date) => Routine[]
}

export interface GuidedValue extends GuidedStepRenderContext {
  host: GuidedHost
  step: GuidedStepConfig
  goNext: () => void
}

const Ctx = createContext<GuidedValue | null>(null)
export const GuidedProvider = Ctx.Provider

export function useGuided(): GuidedValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useGuided outside GuidedSession')
  return v
}
```

- [ ] **Step 2: Write `useNarrationPlayer.ts`**

```ts
// src/components/planning/guided/useNarrationPlayer.ts
//
// Plays the current step's narration clip. Mute is persisted per horizon;
// the daily session flips to muted-by-default after its first completion
// (localStorage 'guided.daily.completed'). Missing audio degrades silently —
// the narration text is always on screen.
import { useEffect, useRef, useState, useCallback } from 'react'

function defaultMuted(horizon: string): boolean {
  const stored = localStorage.getItem(`guided.muted.${horizon}`)
  if (stored !== null) return stored === '1'
  return horizon === 'daily' && localStorage.getItem('guided.daily.completed') === '1'
}

export function useNarrationPlayer(horizon: string, clipUrl: string | null) {
  const [muted, setMuted] = useState(() => defaultMuted(horizon))
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      localStorage.setItem(`guided.muted.${horizon}`, m ? '0' : '1')
      if (!m && audioRef.current) { audioRef.current.pause() }
      return !m
    })
  }, [horizon])

  useEffect(() => {
    if (muted || !clipUrl) return
    const audio = new Audio(clipUrl)
    audioRef.current = audio
    audio.play().catch((err) => console.warn('[narration] playback failed:', err))
    return () => { audio.pause(); audioRef.current = null }
  }, [clipUrl, muted])

  return { muted, toggleMuted }
}
```

- [ ] **Step 3: Write the failing shell tests**

```tsx
// src/components/planning/guided/GuidedSession.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GuidedSession } from './GuidedSession'
import type { GuidedHost } from './GuidedContext'

// The shell persists progress via usePlanningSession — stub it.
const patchNotes = vi.fn()
let mockNotes: Record<string, unknown> = {}
vi.mock('@/hooks/usePlanningSession', () => ({
  usePlanningSession: () => ({ notes: mockNotes, patchNotes, loading: false }),
}))

function makeHost(): GuidedHost {
  return {
    tasks: [], tasksLoading: false, events: [], calendarConnected: false,
    fetchEvents: vi.fn(async () => {}), createEvent: vi.fn(async () => {}),
    onPushTask: vi.fn(), onSetBucket: vi.fn(), onCompleteTask: vi.fn(), onUpdateTask: vi.fn(),
    createTaskInBucket: vi.fn(async () => {}), createDatedTask: vi.fn(async () => {}),
    goals: [], goalAreas: [], addGoal: vi.fn(async () => null), addArea: vi.fn(async () => null),
    updateGoalStatus: vi.fn(async () => {}),
    routines: [], draggableRoutines: [], onScheduleRoutine: vi.fn(), getRoutinesForDate: () => [],
  }
}

describe('GuidedSession shell', () => {
  beforeEach(() => { mockNotes = {}; patchNotes.mockClear(); localStorage.clear() })

  it('renders step 1 narration and progress', () => {
    render(<GuidedSession horizon="seasonal" host={makeHost()} onClose={vi.fn()} />)
    expect(screen.getByText(/Step 1 of 7/)).toBeInTheDocument()
    expect(screen.getByText('A fresh season')).toBeInTheDocument()
  })

  it('Next advances, Back returns, and progress persists', () => {
    render(<GuidedSession horizon="seasonal" host={makeHost()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Next$/ }))
    expect(screen.getByText(/Step 2 of 7/)).toBeInTheDocument()
    expect(patchNotes).toHaveBeenCalledWith({ stepIndex: 1 })
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(screen.getByText(/Step 1 of 7/)).toBeInTheDocument()
  })

  it('resumes from a persisted stepIndex', () => {
    mockNotes = { stepIndex: 3 }
    render(<GuidedSession horizon="seasonal" host={makeHost()} onClose={vi.fn()} />)
    expect(screen.getByText(/Step 4 of 7/)).toBeInTheDocument()
  })

  it('clamps an out-of-range persisted stepIndex', () => {
    mockNotes = { stepIndex: 99 }
    render(<GuidedSession horizon="seasonal" host={makeHost()} onClose={vi.fn()} />)
    expect(screen.getByText(/Step 7 of 7/)).toBeInTheDocument()
  })

  it('Finish on the last step resets progress and closes', () => {
    mockNotes = { stepIndex: 6 }
    const onClose = vi.fn()
    render(<GuidedSession horizon="seasonal" host={makeHost()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /Finish/ }))
    expect(patchNotes).toHaveBeenCalledWith({ stepIndex: 0 })
    expect(onClose).toHaveBeenCalled()
  })

  it('daily completion flips the daily auto-mute flag', () => {
    mockNotes = { stepIndex: 3 }
    render(<GuidedSession horizon="daily" host={makeHost()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Finish/ }))
    expect(localStorage.getItem('guided.daily.completed')).toBe('1')
  })

  it('mute toggle persists per horizon', () => {
    render(<GuidedSession horizon="seasonal" host={makeHost()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Mute narration/ }))
    expect(localStorage.getItem('guided.muted.seasonal')).toBe('1')
  })
})
```

- [ ] **Step 4: Run to verify failure**

Run: `npx vitest run src/components/planning/guided/GuidedSession.test.tsx`
Expected: FAIL — `Cannot find module './GuidedSession'`

- [ ] **Step 5: Write `GuidedSession.tsx`**

```tsx
// src/components/planning/guided/GuidedSession.tsx
//
// The guided ritual shell: one step on screen at a time, spoken + written
// narration, Next/Back/Skip, resume via notes.stepIndex. Step bodies come
// from the registry; unknown types render nothing (the config integrity test
// is the real guard).
import { useMemo, useState, useCallback, type ComponentType } from 'react'
import { X, ArrowLeft, ArrowRight, Volume2, VolumeX, Check } from 'lucide-react'
import { usePlanningSession } from '@/hooks/usePlanningSession'
import type { PlanningHorizon } from '@/hooks/usePlanningSession'
import { SESSIONS } from './sessions'
import { guidedPeriod } from './periods'
import { narrationClip } from './narration'
import { useNarrationPlayer } from './useNarrationPlayer'
import { GuidedProvider, type GuidedHost } from './GuidedContext'
import type { StepType } from './types'

const REGISTRY: Partial<Record<StepType, ComponentType>> = {}
export function registerStepType(type: StepType, component: ComponentType) {
  REGISTRY[type] = component
}

interface Props {
  horizon: PlanningHorizon
  host: GuidedHost
  onClose: () => void
}

export function GuidedSession({ horizon, host, onClose }: Props) {
  const config = SESSIONS[horizon]
  const period = useMemo(() => guidedPeriod(horizon), [horizon])
  const { notes, patchNotes } = usePlanningSession(horizon, period.token)

  const persisted = typeof notes.stepIndex === 'number' ? (notes.stepIndex as number) : 0
  const [index, setIndex] = useState(() => Math.min(Math.max(persisted, 0), config.steps.length - 1))
  const step = config.steps[index]
  const last = index === config.steps.length - 1

  const go = useCallback((next: number) => {
    const clamped = Math.min(Math.max(next, 0), config.steps.length - 1)
    setIndex(clamped)
    patchNotes({ stepIndex: clamped })
  }, [config.steps.length, patchNotes])

  const finish = useCallback(() => {
    patchNotes({ stepIndex: 0 })
    if (horizon === 'daily') localStorage.setItem('guided.daily.completed', '1')
    onClose()
  }, [patchNotes, horizon, onClose])

  const clipUrl = narrationClip(horizon, step.id, step.narration)
  const { muted, toggleMuted } = useNarrationPlayer(horizon, clipUrl)

  const Body = REGISTRY[step.type]

  return (
    <div className="fixed inset-0 z-50 bg-bg-base flex flex-col" role="dialog" aria-label={config.title}>
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-200/70 shrink-0">
        <div>
          <h1 className="font-display text-2xl text-neutral-800">{config.title}</h1>
          <p className="text-sm text-neutral-500">
            {period.label} · Step {index + 1} of {config.steps.length}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={toggleMuted}
            aria-label={muted ? 'Unmute narration' : 'Mute narration'}
            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <button type="button" onClick={onClose} aria-label="Close"
            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* thin progress track */}
      <div className="h-1 bg-neutral-100 shrink-0">
        <div className="h-full bg-primary-500 transition-all"
          style={{ width: `${((index + 1) / config.steps.length) * 100}%` }} />
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-[680px] w-full mx-auto px-6 py-8 space-y-6">
          <div>
            <h2 className="font-display text-xl text-neutral-800 mb-2">{step.title}</h2>
            <p className="text-[15px] leading-relaxed text-neutral-600">{step.narration}</p>
          </div>
          <GuidedProvider value={{
            horizon, periodToken: period.token, periodLabel: period.label,
            periodStart: period.start, periodEnd: period.end,
            notes, patchNotes, host, step, goNext: () => (last ? finish() : go(index + 1)),
          }}>
            {Body ? <Body /> : null}
          </GuidedProvider>
        </div>
      </div>

      <footer className="flex items-center justify-between px-6 py-4 border-t border-neutral-200/70 shrink-0">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0}
          className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
            index === 0 ? 'text-neutral-300 cursor-not-allowed' : 'text-neutral-600 hover:bg-neutral-100'}`}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          {!last && (
            <button type="button" onClick={() => go(index + 1)}
              className="text-sm font-medium px-3 py-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors">
              Skip
            </button>
          )}
          {last ? (
            <button type="button" onClick={finish}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors">
              <Check className="w-4 h-4" /> Finish
            </button>
          ) : (
            <button type="button" onClick={() => go(index + 1)}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors">
              Next <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
```

- [ ] **Step 6: Run shell tests**

Run: `npx vitest run src/components/planning/guided/GuidedSession.test.tsx`
Expected: PASS (7 tests). Note "Skip" and "Next" both advance — Skip exists as an explicit affordance; the tests target `^Next$` exactly to avoid matching both.

- [ ] **Step 7: Commit**

```bash
git add src/components/planning/guided/GuidedContext.tsx src/components/planning/guided/useNarrationPlayer.ts src/components/planning/guided/GuidedSession.tsx src/components/planning/guided/GuidedSession.test.tsx
git commit -m "feat(guided): GuidedSession shell — stepper, resume, voice player, registry"
```

---

### Task 5: NarrationStep + ReflectStep

**Files:**
- Create: `src/components/planning/guided/stepTypes/NarrationStep.tsx`
- Create: `src/components/planning/guided/stepTypes/ReflectStep.tsx`
- Test: `src/components/planning/guided/stepTypes/ReflectStep.test.tsx`

**Interfaces:**
- Consumes: `useGuided()` from Task 4. Step components take NO props — everything comes from context (`step`, `notes`, `patchNotes`, `host`).
- Produces: `NarrationStep`, `ReflectStep` components (default-less named exports).

**Test helper used by ALL step-type tests** — create it in this task:

```tsx
// src/components/planning/guided/stepTypes/testHarness.tsx
// Renders a step component inside a GuidedProvider with sensible defaults.
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import type { ReactElement } from 'react'
import { GuidedProvider, type GuidedHost, type GuidedValue } from '../GuidedContext'
import type { GuidedStepConfig } from '../types'

export function makeHost(overrides: Partial<GuidedHost> = {}): GuidedHost {
  return {
    tasks: [], tasksLoading: false, events: [], calendarConnected: false,
    fetchEvents: vi.fn(async () => {}), createEvent: vi.fn(async () => {}),
    onPushTask: vi.fn(), onSetBucket: vi.fn(), onCompleteTask: vi.fn(), onUpdateTask: vi.fn(),
    createTaskInBucket: vi.fn(async () => {}), createDatedTask: vi.fn(async () => {}),
    goals: [], goalAreas: [], addGoal: vi.fn(async () => null), addArea: vi.fn(async () => null),
    updateGoalStatus: vi.fn(async () => {}),
    routines: [], draggableRoutines: [], onScheduleRoutine: vi.fn(), getRoutinesForDate: () => [],
    ...overrides,
  }
}

export function renderStep(
  ui: ReactElement,
  {
    step,
    host = makeHost(),
    notes = {},
    patchNotes = vi.fn(),
    horizon = 'monthly' as const,
    goNext = vi.fn(),
  }: {
    step: GuidedStepConfig
    host?: GuidedHost
    notes?: GuidedValue['notes']
    patchNotes?: GuidedValue['patchNotes']
    horizon?: GuidedValue['horizon']
    goNext?: () => void
  },
) {
  const value: GuidedValue = {
    horizon, periodToken: '2026-7', periodLabel: 'July 2026',
    periodStart: new Date(2026, 6, 1), periodEnd: new Date(2026, 6, 31, 23, 59, 59),
    notes, patchNotes, host, step, goNext,
  }
  return { ...render(<GuidedProvider value={value}>{ui}</GuidedProvider>), value }
}
```

- [ ] **Step 1: Write the failing ReflectStep test**

```tsx
// src/components/planning/guided/stepTypes/ReflectStep.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { ReflectStep } from './ReflectStep'
import { renderStep } from './testHarness'

const step = {
  id: 'look-within', type: 'reflect' as const, title: 'Look within',
  narration: 'How are you, actually? Write it down before you plan anything.',
  props: { notesKey: 'energy', placeholder: 'Energy going into this season…' },
}

describe('ReflectStep', () => {
  it('shows the existing note text and patches on change', () => {
    const patchNotes = vi.fn()
    renderStep(<ReflectStep />, { step, notes: { energy: 'tired but hopeful' }, patchNotes })
    const box = screen.getByPlaceholderText('Energy going into this season…')
    expect(box).toHaveValue('tired but hopeful')
    fireEvent.change(box, { target: { value: 'rested' } })
    expect(patchNotes).toHaveBeenCalledWith({ energy: 'rested' })
  })

  it('renders nothing when notesKey is missing (misconfig)', () => {
    const { container } = renderStep(<ReflectStep />, { step: { ...step, props: {} } })
    expect(container.querySelector('textarea')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/planning/guided/stepTypes/ReflectStep.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write both components**

```tsx
// src/components/planning/guided/stepTypes/NarrationStep.tsx
//
// Pure instruction moment. The shell already renders title + narration text
// and the Next button, so this step's body is just the session's pacing hint.
import { Clock } from 'lucide-react'
import { useGuided } from '../GuidedContext'
import { SESSIONS } from '../sessions'

export function NarrationStep() {
  const { horizon } = useGuided()
  const [lo, hi] = SESSIONS[horizon].estMinutes
  return (
    <p className="inline-flex items-center gap-1.5 text-sm text-neutral-400">
      <Clock className="w-4 h-4" /> About {lo}–{hi} minutes, all steps skippable.
    </p>
  )
}
```

```tsx
// src/components/planning/guided/stepTypes/ReflectStep.tsx
//
// Voiced prompt + shared textarea. Persists to planning_sessions.notes[key]
// via the debounced patch — visible to household members (the couple ritual).
import { useGuided } from '../GuidedContext'

export function ReflectStep() {
  const { step, notes, patchNotes } = useGuided()
  const key = step.props?.notesKey
  if (!key) return null
  return (
    <textarea
      value={(notes[key] as string) ?? ''}
      onChange={(e) => patchNotes({ [key]: e.target.value })}
      placeholder={step.props?.placeholder}
      rows={6}
      autoFocus
      className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-[15px] text-neutral-800 resize-y focus:outline-none focus:ring-2 focus:ring-primary-500/30"
    />
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/planning/guided/stepTypes/ReflectStep.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/planning/guided/stepTypes/
git commit -m "feat(guided): narration + reflect step types with shared test harness"
```

---

### Task 6: ReviewStep (bucket / someday / overdue / goals) + InboxStep

**Files:**
- Create: `src/components/planning/guided/stepTypes/ReviewStep.tsx`
- Create: `src/components/planning/guided/stepTypes/InboxStep.tsx`
- Test: `src/components/planning/guided/stepTypes/ReviewStep.test.tsx`

**Interfaces:**
- Consumes: `useGuided()`, `TriageWhenMenu` (`@/components/schedule/TriageWhenMenu`), `applyTriageWhen` (`@/lib/triage/applyWhen`), `selectOverdue` (`@/lib/today/taskPools`), `makeAssigneeFilter` (`@/lib/today/assigneeFilter`).
- Produces: `ReviewStep`, `InboxStep`. A shared `TaskTriageRow` (exported from ReviewStep.tsx) used by InboxStep.

Before coding, verify `selectOverdue`'s exact signature: `sed -n 1,20p src/lib/today/taskPools.ts` — it is `selectOverdue(tasks, isToday, match, now?)`; pass `isToday: true` and `match` from `makeAssigneeFilter([])`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/planning/guided/stepTypes/ReviewStep.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { ReviewStep } from './ReviewStep'
import { renderStep, makeHost } from './testHarness'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'

function task(over: Partial<Task>): Task {
  return {
    id: 't1', title: 'Order dishwasher', completed: false, scheduledFor: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...over,
  } as unknown as Task
}

const bucketStep = {
  id: 'month-review', type: 'review' as const, title: 'Last month’s list',
  narration: 'Here is what is still open from the month. Give each a fate.',
  props: { bucket: 'month' as const },
}

describe('ReviewStep — bucket source', () => {
  it('lists open items in the bucket and completes via Done', () => {
    const host = makeHost({ tasks: [task({ id: 'a', title: 'Order dishwasher', bucket: 'month' })] })
    renderStep(<ReviewStep />, { step: bucketStep, host })
    expect(screen.getByText('Order dishwasher')).toBeInTheDocument()
  })

  it('shows the empty state when the bucket is clear', () => {
    renderStep(<ReviewStep />, { step: bucketStep })
    expect(screen.getByText(/Nothing left open/)).toBeInTheDocument()
  })
})

describe('ReviewStep — goals source', () => {
  const goalsStep = {
    id: 'goal-review', type: 'review' as const, title: 'Last year’s goals',
    narration: 'Achieved, carry, or let go.', props: { source: 'goals' as const },
  }
  const goal = { id: 'g1', name: 'Run a 5k', status: 'active', areaId: 'ar1' } as unknown as Goal

  it('marks a goal achieved', () => {
    const host = makeHost({ goals: [goal] })
    renderStep(<ReviewStep />, { step: goalsStep, host })
    fireEvent.click(screen.getByRole('button', { name: /Achieved/ }))
    expect(host.updateGoalStatus).toHaveBeenCalledWith('g1', 'completed')
  })

  it('lets a goal go (archived)', () => {
    const host = makeHost({ goals: [goal] })
    renderStep(<ReviewStep />, { step: goalsStep, host })
    fireEvent.click(screen.getByRole('button', { name: /Let go/ }))
    expect(host.updateGoalStatus).toHaveBeenCalledWith('g1', 'archived')
  })
})
```

Note the `task()` helper above is deliberately minimal — if the repo already has a task factory in `src/test/`, use that instead (check `ls src/test/`).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/planning/guided/stepTypes/ReviewStep.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `ReviewStep.tsx`**

```tsx
// src/components/planning/guided/stepTypes/ReviewStep.tsx
//
// "What's still open" for this horizon, with an explicit fate per item.
// Sources: the horizon's bucket (default), 'someday' (annual), 'overdue'
// (daily look-back), or 'goals' (annual goal review). Task rows reuse the
// canonical TriageWhenMenu; goal rows get Achieved / Keep / Let go.
import { useMemo } from 'react'
import { Check, Archive, Sparkles } from 'lucide-react'
import { TriageWhenMenu } from '@/components/schedule/TriageWhenMenu'
import { applyTriageWhen } from '@/lib/triage/applyWhen'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { selectOverdue } from '@/lib/today/taskPools'
import type { Task } from '@/types/task'
import { useGuided } from '../GuidedContext'

export function TaskTriageRow({ task }: { task: Task }) {
  const { host } = useGuided()
  return (
    <li className="flex items-center gap-2 rounded-xl border border-neutral-100 bg-white px-3 py-2">
      <span className="flex-1 min-w-0 text-sm text-neutral-800 truncate">{task.title}</span>
      <TriageWhenMenu
        onPick={(when) => applyTriageWhen(when, task.id, { onPushTask: host.onPushTask, onSetBucket: host.onSetBucket })}
        onPickDate={(date) => host.onPushTask(task.id, date)}
        onComplete={() => host.onCompleteTask(task.id)}
      />
    </li>
  )
}

export function ReviewStep() {
  const { step, host } = useGuided()
  const source = step.props?.source
  const match = useMemo(() => makeAssigneeFilter([]), [])

  const pool = useMemo(() => {
    if (source === 'goals') return []
    if (source === 'overdue') return selectOverdue(host.tasks, true, match)
    const bucket = source === 'someday' ? 'someday' : step.props?.bucket
    if (!bucket) return []
    return host.tasks.filter((t) => !t.completed && t.bucket === bucket && match(t.assignedTo, t.assignedToAll))
  }, [source, step.props?.bucket, host.tasks, match])

  if (source === 'goals') {
    const open = host.goals.filter((g) => g.status === 'active')
    if (open.length === 0) return <p className="text-sm text-neutral-400">No goals waiting on a verdict.</p>
    return (
      <ul className="space-y-2">
        {open.map((g) => (
          <li key={g.id} className="flex items-center gap-2 rounded-xl border border-neutral-100 bg-white px-3 py-2">
            <span className="flex-1 min-w-0 text-sm text-neutral-800 truncate">{g.name}</span>
            <button type="button" onClick={() => void host.updateGoalStatus(g.id, 'completed')}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
              <Sparkles className="w-3 h-3" /> Achieved
            </button>
            <button type="button" onClick={() => void host.updateGoalStatus(g.id, 'archived')}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-neutral-500 bg-neutral-50 hover:bg-neutral-100 transition-colors">
              <Archive className="w-3 h-3" /> Let go
            </button>
          </li>
        ))}
      </ul>
    )
  }

  if (host.tasksLoading) return <p className="text-sm text-neutral-400">Gathering your plan…</p>
  if (pool.length === 0) {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-neutral-500">
        <Check className="w-4 h-4 text-primary-600" /> Nothing left open here. On to the next step.
      </p>
    )
  }
  return <ul className="space-y-2">{pool.map((t) => <TaskTriageRow key={t.id} task={t} />)}</ul>
}
```

- [ ] **Step 4: Write `InboxStep.tsx`**

```tsx
// src/components/planning/guided/stepTypes/InboxStep.tsx
//
// Weekly "Look Around": drive the inbox to zero with the same triage rows.
// The count in the header falls as items get homes — inbox zero is the
// step's visible win.
import { useMemo } from 'react'
import { Inbox, PartyPopper } from 'lucide-react'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { useGuided } from '../GuidedContext'
import { TaskTriageRow } from './ReviewStep'

export function InboxStep() {
  const { host } = useGuided()
  const match = useMemo(() => makeAssigneeFilter([]), [])
  const pool = useMemo(
    () => host.tasks.filter((t) => !t.completed && t.bucket === 'inbox' && match(t.assignedTo, t.assignedToAll)),
    [host.tasks, match],
  )
  if (host.tasksLoading) return <p className="text-sm text-neutral-400">Gathering your inbox…</p>
  if (pool.length === 0) {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-primary-700">
        <PartyPopper className="w-4 h-4" /> Inbox zero. You are planning from reality.
      </p>
    )
  }
  return (
    <div>
      <p className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-neutral-400 mb-3">
        <Inbox className="w-3.5 h-3.5" /> {pool.length} to process
      </p>
      <ul className="space-y-2">{pool.map((t) => <TaskTriageRow key={t.id} task={t} />)}</ul>
    </div>
  )
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components/planning/guided/stepTypes/ReviewStep.test.tsx`
Expected: PASS. Fix the `task()` helper if the repo factory exists (see note in Step 1).

- [ ] **Step 6: Commit**

```bash
git add src/components/planning/guided/stepTypes/ReviewStep.tsx src/components/planning/guided/stepTypes/InboxStep.tsx src/components/planning/guided/stepTypes/ReviewStep.test.tsx
git commit -m "feat(guided): review + inbox step types (bucket/someday/overdue/goals sources)"
```

---

### Task 7: LookAboveStep (reference, copy-down, daily pick)

**Files:**
- Create: `src/components/planning/guided/stepTypes/LookAboveStep.tsx`
- Test: `src/components/planning/guided/stepTypes/LookAboveStep.test.tsx`

**Interfaces:**
- Consumes: `useGuided()`. Horizon→own-bucket map: seasonal→`quarter`, monthly→`month`, weekly→`week` (copy-down target). Daily uses `pick` (moves via `host.onPushTask(id, todayStart)`).
- Produces: `LookAboveStep`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/planning/guided/stepTypes/LookAboveStep.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { LookAboveStep } from './LookAboveStep'
import { renderStep, makeHost } from './testHarness'
import type { Task } from '@/types/task'
import type { Goal, GoalArea } from '@/types/goal'

const t = (over: Record<string, unknown>) => ({
  id: 'x', title: 'Renovate kitchen', completed: false, scheduledFor: null,
  createdAt: new Date(), updatedAt: new Date(), ...over,
}) as unknown as Task

describe('LookAboveStep', () => {
  it('reference mode: copy-down duplicates into this horizon’s bucket', async () => {
    const host = makeHost({ tasks: [t({ id: 'q1', title: 'Renovate kitchen', bucket: 'quarter' })] })
    renderStep(<LookAboveStep />, {
      step: { id: 'look-at-season', type: 'look-above', title: 'Your season list',
        narration: 'Read it; copy down what this month should carry.',
        props: { aboveBucket: 'quarter', aboveLabel: 'Your season list' } },
      host, horizon: 'monthly',
    })
    fireEvent.click(screen.getByRole('button', { name: /Copy down/ }))
    expect(host.createTaskInBucket).toHaveBeenCalledWith('Renovate kitchen', 'month')
  })

  it('reference mode: an item already on this list shows a check, no button', () => {
    const host = makeHost({ tasks: [
      t({ id: 'q1', title: 'Renovate kitchen', bucket: 'quarter' }),
      t({ id: 'm1', title: 'Renovate kitchen', bucket: 'month' }),
    ] })
    renderStep(<LookAboveStep />, {
      step: { id: 'look-at-season', type: 'look-above', title: 'Your season list',
        narration: 'Read it.', props: { aboveBucket: 'quarter' } },
      host, horizon: 'monthly',
    })
    expect(screen.getByText(/on this list/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Copy down/ })).toBeNull()
  })

  it('goals mode: renders active goals grouped by area, read-only', () => {
    const host = makeHost({
      goals: [{ id: 'g1', name: 'Run a 5k', status: 'active', areaId: 'a1' } as unknown as Goal],
      goalAreas: [{ id: 'a1', name: 'Health' } as unknown as GoalArea],
    })
    renderStep(<LookAboveStep />, {
      step: { id: 'look-at-year', type: 'look-above', title: 'Your year goals',
        narration: 'Read only.', props: { aboveBucket: 'goals' } },
      host, horizon: 'seasonal',
    })
    expect(screen.getByText('Health')).toBeInTheDocument()
    expect(screen.getByText('Run a 5k')).toBeInTheDocument()
  })

  it('pick mode (daily): tapping moves the task to today', () => {
    const host = makeHost({ tasks: [t({ id: 'w1', title: 'Call plumber', bucket: 'week' })] })
    renderStep(<LookAboveStep />, {
      step: { id: 'pick-today', type: 'look-above', title: 'Pick from the week',
        narration: 'Tap what today should carry.',
        props: { aboveBucket: 'week', pick: true } },
      host, horizon: 'daily',
    })
    fireEvent.click(screen.getByRole('button', { name: /Call plumber/ }))
    expect(host.onPushTask).toHaveBeenCalledWith('w1', expect.any(Date))
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/planning/guided/stepTypes/LookAboveStep.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `LookAboveStep.tsx`**

```tsx
// src/components/planning/guided/stepTypes/LookAboveStep.tsx
//
// The look-don't-link moment: the level above, read-only. Copy-down
// DUPLICATES a line into this horizon (the upper list stays intact for its
// own review — 5a3993e0's model). Goals mode renders the year's goals by
// area with no actions at all. Pick mode (daily) MOVES week items into today
// — that's ordinary bucket flow, not linkage.
import { useMemo } from 'react'
import { Target, Check, Plus } from 'lucide-react'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import type { TaskBucket } from '@/types/task'
import { useGuided } from '../GuidedContext'

const OWN_BUCKET: Partial<Record<string, TaskBucket>> = {
  seasonal: 'quarter', monthly: 'month', weekly: 'week',
}

export function LookAboveStep() {
  const { step, host, horizon } = useGuided()
  const above = step.props?.aboveBucket
  const pick = step.props?.pick === true
  const ownBucket = OWN_BUCKET[horizon]
  const match = useMemo(() => makeAssigneeFilter([]), [])

  const abovePool = useMemo(
    () => (above && above !== 'goals'
      ? host.tasks.filter((t) => !t.completed && t.bucket === above && match(t.assignedTo, t.assignedToAll))
      : []),
    [host.tasks, above, match],
  )
  const ownTitles = useMemo(
    () => new Set(host.tasks.filter((t) => !t.completed && ownBucket && t.bucket === ownBucket).map((t) => t.title)),
    [host.tasks, ownBucket],
  )
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const isPickedToday = (scheduledFor: Date | null | undefined) =>
    !!scheduledFor && new Date(scheduledFor).toDateString() === todayStart.toDateString()

  if (above === 'goals') {
    const activeGoals = host.goals.filter((g) => g.status === 'active')
    if (activeGoals.length === 0) return <p className="text-sm text-neutral-400">No goals written for this year yet.</p>
    return (
      <div className="space-y-4">
        {host.goalAreas.map((area) => {
          const inArea = activeGoals.filter((g) => g.areaId === area.id)
          if (inArea.length === 0) return null
          return (
            <section key={area.id}>
              <h3 className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5">{area.name}</h3>
              <ul className="space-y-1">
                {inArea.map((g) => (
                  <li key={g.id} className="flex items-center gap-2 rounded-lg bg-neutral-50/70 px-3 py-1.5 text-sm text-neutral-700">
                    <Target className="w-3.5 h-3.5 text-neutral-300 shrink-0" /> {g.name}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    )
  }

  if (host.tasksLoading) return <p className="text-sm text-neutral-400">Gathering the list above…</p>
  if (abovePool.length === 0) return <p className="text-sm text-neutral-400">Nothing on that list yet.</p>

  return (
    <ul className="space-y-1">
      {abovePool.map((t) => {
        if (pick) {
          const picked = isPickedToday(t.scheduledFor)
          return (
            <li key={t.id}>
              <button type="button" disabled={picked}
                onClick={() => host.onPushTask(t.id, todayStart)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  picked ? 'bg-primary-50/60 text-primary-700' : 'bg-neutral-50/70 text-neutral-700 hover:bg-neutral-100'}`}>
                {picked && <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={3} />}
                <span className="flex-1 min-w-0 truncate">{t.title}</span>
                {picked && <span className="text-xs">today</span>}
              </button>
            </li>
          )
        }
        const alreadyHere = ownTitles.has(t.title)
        return (
          <li key={t.id} className="flex items-center gap-3 rounded-lg bg-neutral-50/70 px-3 py-1.5">
            <span className="flex-1 min-w-0 text-sm text-neutral-700 truncate">{t.title}</span>
            {alreadyHere ? (
              <span className="shrink-0 inline-flex items-center gap-1 text-xs text-primary-700">
                <Check className="w-3 h-3" strokeWidth={3} /> on this list
              </span>
            ) : ownBucket ? (
              <button type="button" onClick={() => void host.createTaskInBucket(t.title, ownBucket)}
                title="Copy onto this list (stays on the list above too)"
                className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
                <Plus className="w-3 h-3" /> Copy down
              </button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/planning/guided/stepTypes/LookAboveStep.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/planning/guided/stepTypes/LookAboveStep.tsx src/components/planning/guided/stepTypes/LookAboveStep.test.tsx
git commit -m "feat(guided): look-above step — reference lists, copy-down, daily pick"
```

---

### Task 8: WriteListStep

**Files:**
- Create: `src/components/planning/guided/stepTypes/WriteListStep.tsx`
- Test: `src/components/planning/guided/stepTypes/WriteListStep.test.tsx`

**Interfaces:**
- Consumes: `useGuided()`, `TaskTriageRow` from Task 6.
- Produces: `WriteListStep`.

- [ ] **Step 1: Write the failing tests (includes the race regression guard)**

```tsx
// src/components/planning/guided/stepTypes/WriteListStep.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { WriteListStep } from './WriteListStep'
import { renderStep, makeHost } from './testHarness'
import type { Task } from '@/types/task'

const step = {
  id: 'write-week', type: 'write-list' as const, title: 'Write the week’s list',
  narration: 'Around fifteen items is the honest ceiling.',
  props: { bucket: 'week' as const, softCap: 15 },
}

const t = (over: Record<string, unknown>) => ({
  id: 'x', title: 'Item', completed: false, scheduledFor: null,
  createdAt: new Date(), updatedAt: new Date(), ...over,
}) as unknown as Task

describe('WriteListStep', () => {
  it('creates into the bucket ATOMICALLY via createTaskInBucket (race guard)', async () => {
    const host = makeHost()
    renderStep(<WriteListStep />, { step, host, horizon: 'weekly' })
    const input = screen.getByPlaceholderText(/Add to this list/)
    fireEvent.change(input, { target: { value: 'Call the plumber' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(host.createTaskInBucket).toHaveBeenCalledWith('Call the plumber', 'week')
    // The atomic-create contract: WriteListStep must never call onSetBucket.
    expect(host.onSetBucket).not.toHaveBeenCalled()
  })

  it('shows the soft-cap counter without blocking', () => {
    const tasks = Array.from({ length: 16 }, (_, i) => t({ id: `w${i}`, title: `Task ${i}`, bucket: 'week' }))
    const host = makeHost({ tasks })
    renderStep(<WriteListStep />, { step, host, horizon: 'weekly' })
    expect(screen.getByText(/16 of ~15/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Add to this list/)).toBeEnabled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/planning/guided/stepTypes/WriteListStep.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `WriteListStep.tsx`**

```tsx
// src/components/planning/guided/stepTypes/WriteListStep.tsx
//
// Write this horizon's list, fresh. Creation is ONE atomic addTask with the
// bucket in options (host.createTaskInBucket) — never create-then-setBucket.
// The soft cap is a nudge, never a wall.
import { useState, useMemo, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { useGuided } from '../GuidedContext'
import { TaskTriageRow } from './ReviewStep'

export function WriteListStep() {
  const { step, host } = useGuided()
  const bucket = step.props?.bucket
  const softCap = step.props?.softCap
  const match = useMemo(() => makeAssigneeFilter([]), [])
  const pool = useMemo(
    () => (bucket ? host.tasks.filter((t) => !t.completed && t.bucket === bucket && match(t.assignedTo, t.assignedToAll)) : []),
    [host.tasks, bucket, match],
  )

  const [draft, setDraft] = useState('')
  const submit = useCallback(async () => {
    const title = draft.trim()
    if (!title || !bucket) return
    setDraft('')
    await host.createTaskInBucket(title, bucket)
  }, [draft, bucket, host])

  if (!bucket) return null
  const over = softCap !== undefined && pool.length > softCap

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl border border-neutral-200 bg-white focus-within:border-primary-400 transition-colors">
        <button type="button" onClick={() => void submit()} aria-label="Add to this plan"
          className="shrink-0 w-6 h-6 rounded-full bg-primary-600 text-white grid place-items-center hover:bg-primary-700 transition-colors">
          <Plus className="w-4 h-4" />
        </button>
        <input type="text" value={draft} autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
          placeholder="Add to this list…"
          className="flex-1 min-w-0 text-sm bg-transparent placeholder:text-neutral-400 focus:outline-none"
        />
      </div>
      {softCap !== undefined && (
        <p className={`text-xs ${over ? 'text-amber-600' : 'text-neutral-400'}`}>
          {pool.length} of ~{softCap}{over ? ' — a list you believe beats a list you admire' : ''}
        </p>
      )}
      {pool.length > 0 && <ul className="space-y-2">{pool.map((t) => <TaskTriageRow key={t.id} task={t} />)}</ul>}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/planning/guided/stepTypes/WriteListStep.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/planning/guided/stepTypes/WriteListStep.tsx src/components/planning/guided/stepTypes/WriteListStep.test.tsx
git commit -m "feat(guided): write-list step with atomic bucket create + soft cap"
```

---

### Task 9: CalendarStep

**Files:**
- Create: `src/components/planning/guided/stepTypes/CalendarStep.tsx`
- Test: `src/components/planning/guided/stepTypes/CalendarStep.test.tsx`

**Interfaces:**
- Consumes: `useGuided()` (`periodStart`/`periodEnd`, `host.events`, `host.fetchEvents`, `host.calendarConnected`), optional `notesKey`.
- Produces: `CalendarStep`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/planning/guided/stepTypes/CalendarStep.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { CalendarStep } from './CalendarStep'
import { renderStep, makeHost } from './testHarness'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const step = {
  id: 'month-ahead', type: 'calendar' as const, title: 'The month ahead',
  narration: 'Scan the next four to five weeks for conflicts and trips.',
}

const ev = (title: string, day: number): CalendarEvent => ({
  id: `e-${day}`, title, startTime: new Date(2026, 6, day, 10), endTime: new Date(2026, 6, day, 11),
} as unknown as CalendarEvent)

describe('CalendarStep', () => {
  it('fetches the period range on mount and lists events by day', async () => {
    const host = makeHost({ calendarConnected: true, events: [ev('Dentist', 14)] })
    renderStep(<CalendarStep />, { step, host })
    await waitFor(() => expect(host.fetchEvents).toHaveBeenCalledWith(expect.any(Date), expect.any(Date)))
    expect(screen.getByText('Dentist')).toBeInTheDocument()
  })

  it('disconnected: shows a quiet notice, no fetch', () => {
    const host = makeHost({ calendarConnected: false })
    renderStep(<CalendarStep />, { step, host })
    expect(host.fetchEvents).not.toHaveBeenCalled()
    expect(screen.getByText(/calendar isn’t connected/i)).toBeInTheDocument()
  })

  it('renders the notes textarea when notesKey is configured', () => {
    const patchNotes = vi.fn()
    renderStep(<CalendarStep />, {
      step: { ...step, props: { notesKey: 'annualCalendar' } },
      host: makeHost({ calendarConnected: false }), patchNotes,
    })
    expect(screen.getByPlaceholderText(/Worth remembering/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/planning/guided/stepTypes/CalendarStep.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `CalendarStep.tsx`**

```tsx
// src/components/planning/guided/stepTypes/CalendarStep.tsx
//
// Period look-ahead: fetch the horizon's date range once on mount, then show
// commitments — per-day rows for ranges up to ~9 weeks, per-month counts for
// longer spans (the annual "mountain ranges" view). Read-only; an optional
// notes field captures what's worth remembering.
import { useEffect, useMemo } from 'react'
import { CalendarDays } from 'lucide-react'
import { useGuided } from '../GuidedContext'

const DAY_MS = 24 * 60 * 60 * 1000
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export function CalendarStep() {
  const { step, host, periodStart, periodEnd, notes, patchNotes } = useGuided()
  const notesKey = step.props?.notesKey

  useEffect(() => {
    if (!host.calendarConnected) return
    void host.fetchEvents(periodStart, periodEnd)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once per mount for this period
  }, [])

  const inRange = useMemo(
    () => host.events
      .filter((e) => e.startTime >= periodStart && e.startTime <= periodEnd)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime()),
    [host.events, periodStart, periodEnd],
  )
  const wide = (periodEnd.getTime() - periodStart.getTime()) / DAY_MS > 63

  const byMonth = useMemo(() => {
    if (!wide) return []
    const counts = new Map<number, number>()
    for (const e of inRange) counts.set(e.startTime.getMonth(), (counts.get(e.startTime.getMonth()) ?? 0) + 1)
    return [...counts.entries()]
  }, [inRange, wide])

  return (
    <div className="space-y-4">
      {!host.calendarConnected ? (
        <p className="text-sm text-neutral-400">
          Your calendar isn’t connected right now — scan your calendar app instead, then note anything worth remembering below.
        </p>
      ) : inRange.length === 0 ? (
        <p className="text-sm text-neutral-400">Nothing on the calendar in this stretch yet.</p>
      ) : wide ? (
        <ul className="space-y-1">
          {byMonth.map(([m, count]) => (
            <li key={m} className="flex items-center gap-2 rounded-lg bg-neutral-50/70 px-3 py-1.5 text-sm text-neutral-700">
              <CalendarDays className="w-3.5 h-3.5 text-neutral-300" />
              <span className="flex-1">{MONTHS[m]}</span>
              <span className="text-xs text-neutral-400">{count} commitment{count === 1 ? '' : 's'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-1 max-h-72 overflow-auto pr-1">
          {inRange.map((e) => (
            <li key={e.id ?? `${e.title}-${e.startTime.toISOString()}`}
              className="flex items-center gap-2 rounded-lg bg-neutral-50/70 px-3 py-1.5 text-sm text-neutral-700">
              <span className="shrink-0 w-24 text-xs text-neutral-400">
                {e.startTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
              <span className="flex-1 min-w-0 truncate">{e.title}</span>
            </li>
          ))}
        </ul>
      )}
      {notesKey && (
        <textarea
          value={(notes[notesKey] as string) ?? ''}
          onChange={(e) => patchNotes({ [notesKey]: e.target.value })}
          placeholder="Worth remembering about this stretch…"
          rows={3}
          className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 resize-y focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />
      )}
    </div>
  )
}
```

Note: verify `CalendarEvent.startTime` is a `Date` (it is in `useGoogleCalendar` — HomeViewContainer constructs Dates for fetch/create). If any code path delivers strings, coerce with `new Date(e.startTime)` in the filter.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/planning/guided/stepTypes/CalendarStep.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/planning/guided/stepTypes/CalendarStep.tsx src/components/planning/guided/stepTypes/CalendarStep.test.tsx
git commit -m "feat(guided): calendar look-ahead step (day rows / month aggregate)"
```

---

### Task 10: DomainsGoalsStep

**Files:**
- Create: `src/components/planning/guided/stepTypes/DomainsGoalsStep.tsx`
- Test: `src/components/planning/guided/stepTypes/DomainsGoalsStep.test.tsx`

**Interfaces:**
- Consumes: `useGuided()` — `host.goalAreas`, `host.goals`, `host.addGoal(areaId, name)`, `host.addArea(name)`.
- Produces: `DomainsGoalsStep`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/planning/guided/stepTypes/DomainsGoalsStep.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { DomainsGoalsStep } from './DomainsGoalsStep'
import { renderStep, makeHost } from './testHarness'
import type { Goal, GoalArea } from '@/types/goal'

const step = {
  id: 'write-goals', type: 'domains-goals' as const, title: 'This year’s goals',
  narration: 'Three to eight areas; write without censoring.',
}

describe('DomainsGoalsStep', () => {
  it('adds a goal statement under an area', () => {
    const host = makeHost({ goalAreas: [{ id: 'a1', name: 'Health' } as unknown as GoalArea] })
    renderStep(<DomainsGoalsStep />, { step, host, horizon: 'annual' })
    const input = screen.getByPlaceholderText(/A goal for Health/)
    fireEvent.change(input, { target: { value: 'Sleep 7 hours' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(host.addGoal).toHaveBeenCalledWith('a1', 'Sleep 7 hours')
  })

  it('adds a new life domain', () => {
    const host = makeHost()
    renderStep(<DomainsGoalsStep />, { step, host, horizon: 'annual' })
    const input = screen.getByPlaceholderText(/New life area/)
    fireEvent.change(input, { target: { value: 'Fun' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(host.addArea).toHaveBeenCalledWith('Fun')
  })

  it('lists existing active goals under their area', () => {
    const host = makeHost({
      goalAreas: [{ id: 'a1', name: 'Health' } as unknown as GoalArea],
      goals: [{ id: 'g1', name: 'Run a 5k', status: 'active', areaId: 'a1' } as unknown as Goal],
    })
    renderStep(<DomainsGoalsStep />, { step, host, horizon: 'annual' })
    expect(screen.getByText('Run a 5k')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/planning/guided/stepTypes/DomainsGoalsStep.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `DomainsGoalsStep.tsx`**

```tsx
// src/components/planning/guided/stepTypes/DomainsGoalsStep.tsx
//
// The flattened year model: life domains (goal areas) with plain goal
// statements under each. No actions, no milestones, no linkage — a goal is a
// sentence you'll look at each season.
import { useState, useCallback } from 'react'
import { Plus, Target } from 'lucide-react'
import { useGuided } from '../GuidedContext'

function AddInline({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string) => void }) {
  const [draft, setDraft] = useState('')
  const submit = useCallback(() => {
    const v = draft.trim()
    if (!v) return
    setDraft('')
    onAdd(v)
  }, [draft, onAdd])
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-neutral-200 bg-white focus-within:border-primary-400 transition-colors">
      <button type="button" onClick={submit} aria-label={placeholder}
        className="shrink-0 w-5 h-5 rounded-full bg-primary-600 text-white grid place-items-center hover:bg-primary-700 transition-colors">
        <Plus className="w-3 h-3" />
      </button>
      <input type="text" value={draft} placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        className="flex-1 min-w-0 text-sm bg-transparent placeholder:text-neutral-400 focus:outline-none"
      />
    </div>
  )
}

export function DomainsGoalsStep() {
  const { host } = useGuided()
  const active = host.goals.filter((g) => g.status === 'active')
  return (
    <div className="space-y-5">
      {host.goalAreas.map((area) => (
        <section key={area.id}>
          <h3 className="text-[11px] uppercase tracking-wider text-neutral-400 mb-2">{area.name}</h3>
          <ul className="space-y-1 mb-2">
            {active.filter((g) => g.areaId === area.id).map((g) => (
              <li key={g.id} className="flex items-center gap-2 rounded-lg bg-neutral-50/70 px-3 py-1.5 text-sm text-neutral-700">
                <Target className="w-3.5 h-3.5 text-neutral-300 shrink-0" /> {g.name}
              </li>
            ))}
          </ul>
          <AddInline placeholder={`A goal for ${area.name}…`} onAdd={(t) => void host.addGoal(area.id, t)} />
        </section>
      ))}
      <section>
        <h3 className="text-[11px] uppercase tracking-wider text-neutral-400 mb-2">Add an area of life</h3>
        <AddInline placeholder="New life area — health, fun, home…" onAdd={(t) => void host.addArea(t)} />
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/planning/guided/stepTypes/DomainsGoalsStep.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/planning/guided/stepTypes/DomainsGoalsStep.tsx src/components/planning/guided/stepTypes/DomainsGoalsStep.test.tsx
git commit -m "feat(guided): domains-goals step — flattened areas + goal statements"
```

---

### Task 11: ScheduleGridStep + BookNextStep

**Files:**
- Create: `src/components/planning/guided/stepTypes/ScheduleGridStep.tsx`
- Create: `src/components/planning/guided/stepTypes/BookNextStep.tsx`
- Test: `src/components/planning/guided/stepTypes/BookNextStep.test.tsx`

**Interfaces:**
- Consumes: `StepSchedule` (`@/components/planning/weekly/StepSchedule`), `guidedPeriod`, `useGuided()`.
- Produces: `ScheduleGridStep`, `BookNextStep`.

- [ ] **Step 1: Write `ScheduleGridStep.tsx` (thin wrapper — grid is already tested machinery)**

```tsx
// src/components/planning/guided/stepTypes/ScheduleGridStep.tsx
//
// Weekly "place the big rocks": the existing StepSchedule grid, fed this
// week's list and events. Fetches the week's events once on entry.
import { useEffect, useMemo } from 'react'
import { StepSchedule } from '@/components/planning/weekly/StepSchedule'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { useGuided } from '../GuidedContext'

export function ScheduleGridStep() {
  const { host, periodStart, periodEnd } = useGuided()
  const match = useMemo(() => makeAssigneeFilter([]), [])
  const priorities = useMemo(
    () => host.tasks.filter((t) => !t.completed && t.bucket === 'week' && match(t.assignedTo, t.assignedToAll)),
    [host.tasks, match],
  )
  useEffect(() => {
    if (!host.calendarConnected) return
    void host.fetchEvents(periodStart, periodEnd)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per entry
  }, [])
  return (
    <div className="h-[60vh] min-h-[420px]">
      <StepSchedule
        weekDate={periodStart}
        priorities={priorities}
        events={host.events}
        routines={host.routines}
        draggableRoutines={host.draggableRoutines}
        onScheduleRoutine={host.onScheduleRoutine}
        getRoutinesForDate={host.getRoutinesForDate}
        onUpdateTask={host.onUpdateTask}
        onPushTask={host.onPushTask}
      />
    </div>
  )
}
```

- [ ] **Step 2: Write the failing BookNextStep tests**

```tsx
// src/components/planning/guided/stepTypes/BookNextStep.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { BookNextStep } from './BookNextStep'
import { renderStep, makeHost } from './testHarness'

const step = {
  id: 'book-next', type: 'book-next' as const, title: 'Anchor the next step',
  narration: 'Book the next session before you close.',
  props: { bookHorizon: 'monthly' as const, bookTitle: 'Monthly planning session' },
}

describe('BookNextStep', () => {
  it('creates a calendar event when connected', async () => {
    const host = makeHost({ calendarConnected: true })
    renderStep(<BookNextStep />, { step, host, horizon: 'monthly' })
    fireEvent.click(screen.getByRole('button', { name: /Put it on the calendar/ }))
    await waitFor(() => expect(host.createEvent).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Monthly planning session',
      startTime: expect.any(Date),
      endTime: expect.any(Date),
    })))
    expect(await screen.findByText(/Booked/)).toBeInTheDocument()
  })

  it('falls back to a dated task when the calendar is disconnected', async () => {
    const host = makeHost({ calendarConnected: false })
    renderStep(<BookNextStep />, { step, host, horizon: 'monthly' })
    fireEvent.click(screen.getByRole('button', { name: /Add a reminder task/ }))
    await waitFor(() => expect(host.createDatedTask).toHaveBeenCalledWith('Monthly planning session', expect.any(Date)))
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/components/planning/guided/stepTypes/BookNextStep.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `BookNextStep.tsx`**

```tsx
// src/components/planning/guided/stepTypes/BookNextStep.tsx
//
// The step that keeps the system alive: schedule the NEXT session before
// closing this one. Defaults to the morning after this period ends (9:00,
// 45 minutes), editable. Calendar write goes to the default calendar (the
// hook's existing behavior); disconnected falls back to a dated task.
import { useState, useMemo, useCallback } from 'react'
import { CalendarPlus, Check } from 'lucide-react'
import { useGuided } from '../GuidedContext'

function toInputValue(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function BookNextStep() {
  const { step, host, periodEnd } = useGuided()
  const title = step.props?.bookTitle ?? 'Planning session'
  const defaultDate = useMemo(() => {
    const d = new Date(periodEnd)
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    return d
  }, [periodEnd])
  const [dateStr, setDateStr] = useState(() => toInputValue(defaultDate))
  const [booked, setBooked] = useState(false)

  const book = useCallback(async () => {
    const [y, m, d] = dateStr.split('-').map(Number)
    if (!y || !m || !d) return
    const start = new Date(y, m - 1, d, 9, 0, 0, 0)
    if (host.calendarConnected) {
      const end = new Date(start.getTime() + 45 * 60 * 1000)
      await host.createEvent({ title, startTime: start, endTime: end })
    } else {
      await host.createDatedTask(title, start)
    }
    setBooked(true)
  }, [dateStr, host, title])

  if (booked) {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-primary-700">
        <Check className="w-4 h-4" strokeWidth={3} /> Booked — {title}, {dateStr}. The system keeps running.
      </p>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)}
        aria-label="Session date"
        className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
      <button type="button" onClick={() => void book()}
        className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors">
        <CalendarPlus className="w-4 h-4" />
        {host.calendarConnected ? 'Put it on the calendar' : 'Add a reminder task'}
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/components/planning/guided/stepTypes/BookNextStep.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/planning/guided/stepTypes/ScheduleGridStep.tsx src/components/planning/guided/stepTypes/BookNextStep.tsx src/components/planning/guided/stepTypes/BookNextStep.test.tsx
git commit -m "feat(guided): schedule-grid wrapper + book-next step"
```

---

### Task 12: Registry + wire the app (HomeViewContainer, HorizonView, lazy)

**Files:**
- Create: `src/components/planning/guided/stepTypes/index.ts`
- Modify: `src/components/planning/guided/GuidedSession.tsx` (add the side-effect import)
- Modify: `src/components/lazy.ts` (export lazy `GuidedSession` host wrapper)
- Create: `src/components/planning/guided/GuidedSessionContainer.tsx`
- Modify: `src/apps/tasks/HomeViewContainer.tsx` (replace 5 overlay states with one)
- Modify: `src/apps/tasks/HorizonView.tsx` ("Start planning session" button)
- Test: `src/components/planning/guided/registry.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `GuidedSessionContainer({ horizon, onClose })` — builds the `GuidedHost` from app hooks so `HomeViewContainer` stays thin.

- [ ] **Step 1: Write `stepTypes/index.ts` + registry test**

```ts
// src/components/planning/guided/stepTypes/index.ts
// Side-effect module: registers every step type with the shell.
import { registerStepType } from '../GuidedSession'
import { NarrationStep } from './NarrationStep'
import { ReflectStep } from './ReflectStep'
import { ReviewStep } from './ReviewStep'
import { LookAboveStep } from './LookAboveStep'
import { CalendarStep } from './CalendarStep'
import { WriteListStep } from './WriteListStep'
import { InboxStep } from './InboxStep'
import { ScheduleGridStep } from './ScheduleGridStep'
import { DomainsGoalsStep } from './DomainsGoalsStep'
import { BookNextStep } from './BookNextStep'

registerStepType('narration', NarrationStep)
registerStepType('reflect', ReflectStep)
registerStepType('review', ReviewStep)
registerStepType('look-above', LookAboveStep)
registerStepType('calendar', CalendarStep)
registerStepType('write-list', WriteListStep)
registerStepType('inbox', InboxStep)
registerStepType('schedule-grid', ScheduleGridStep)
registerStepType('domains-goals', DomainsGoalsStep)
registerStepType('book-next', BookNextStep)
```

```ts
// src/components/planning/guided/registry.test.ts
// Every step type used by a config must have a registered component.
import { describe, it, expect } from 'vitest'
import './stepTypes'
import { getRegisteredTypes } from './GuidedSession'
import { SESSIONS } from './sessions'

describe('step registry', () => {
  it('covers every type used in the configs', () => {
    const used = new Set(Object.values(SESSIONS).flatMap((c) => c.steps.map((s) => s.type)))
    for (const t of used) expect(getRegisteredTypes(), `missing ${t}`).toContain(t)
  })
})
```

Add to `GuidedSession.tsx`: `export function getRegisteredTypes() { return Object.keys(REGISTRY) }` and, at the top of the file, `import './stepTypes'` must NOT be added (it would cycle) — instead `GuidedSessionContainer` (Step 3) imports `./stepTypes` before rendering the shell.

- [ ] **Step 2: Run registry test**

Run: `npx vitest run src/components/planning/guided/registry.test.ts`
Expected: PASS.

- [ ] **Step 3: Write `GuidedSessionContainer.tsx`**

```tsx
// src/components/planning/guided/GuidedSessionContainer.tsx
//
// Builds the GuidedHost adapter from app hooks. This is the ONLY file in
// guided/ that touches app-level hooks, so the shell and steps stay testable.
import { useMemo, useCallback } from 'react'
import './stepTypes' // register all step components (side effect)
import { GuidedSession } from './GuidedSession'
import type { GuidedHost } from './GuidedContext'
import type { PlanningHorizon } from '@/hooks/usePlanningSession'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { useGoalsContext } from '@/contexts/GoalsContext'
import { useRoutines } from '@/hooks/useRoutines'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useDomain } from '@/hooks/useDomain'
import { isEverydayRoutine } from '@/lib/routineUtils'
import type { TaskBucket } from '@/types/task'
import type { GoalStatus } from '@/types/goal'

interface Props {
  horizon: PlanningHorizon
  onClose: () => void
  /** Reuse the host page's routine-scheduling handler (drag onto the grid). */
  onScheduleRoutine: (routineId: string, date: Date, time: string) => void
}

export function GuidedSessionContainer({ horizon, onClose, onScheduleRoutine }: Props) {
  const { tasks, loading: tasksLoading, addTask, toggleTask, updateTask, pushTask, setBucket } = useSupabaseTasks()
  const { isConnected, events, fetchEvents, createEvent } = useGoogleCalendar()
  const { areas, goals, addGoal, addArea, updateGoal } = useGoalsContext()
  const { routines: allRoutines, getRoutinesForDate } = useRoutines()
  const { getCurrentUserMember } = useFamilyMembers()
  const { currentDomain } = useDomain()

  const createTaskInBucket = useCallback(async (title: string, bucket: TaskBucket) => {
    await addTask(title, undefined, undefined, undefined, {
      assignedTo: getCurrentUserMember()?.id,
      context: currentDomain !== 'universal' ? currentDomain : undefined,
      bucket,
    })
  }, [addTask, getCurrentUserMember, currentDomain])

  const createDatedTask = useCallback(async (title: string, date: Date) => {
    await addTask(title, undefined, undefined, date, {
      assignedTo: getCurrentUserMember()?.id,
      isAllDay: true,
    })
  }, [addTask, getCurrentUserMember])

  const host = useMemo<GuidedHost>(() => ({
    tasks, tasksLoading,
    events, calendarConnected: isConnected,
    fetchEvents, createEvent,
    onPushTask: pushTask, onSetBucket: setBucket, onCompleteTask: toggleTask, onUpdateTask: updateTask,
    createTaskInBucket, createDatedTask,
    goals, goalAreas: areas,
    addGoal: (areaId: string, name: string) => addGoal(areaId, name),
    addArea: (name: string) => addArea(name),
    updateGoalStatus: (id: string, status: GoalStatus) => updateGoal(id, { status }),
    routines: allRoutines,
    draggableRoutines: allRoutines.filter((r) => r.visibility === 'active' && !isEverydayRoutine(r.recurrence_pattern) && !r.time_of_day),
    onScheduleRoutine,
    getRoutinesForDate,
  }), [tasks, tasksLoading, events, isConnected, fetchEvents, createEvent, pushTask, setBucket, toggleTask, updateTask, createTaskInBucket, createDatedTask, goals, areas, addGoal, addArea, updateGoal, allRoutines, onScheduleRoutine, getRoutinesForDate])

  return <GuidedSession horizon={horizon} host={host} onClose={onClose} />
}
```

- [ ] **Step 4: Wire `HomeViewContainer.tsx`**

Replace the five overlay booleans and their five `<*PlanningSession>` mounts:

1. Delete state: `weeklyPlanningOpen`, `planTodayOpen`, `monthlyPlanningOpen`, `seasonalPlanningOpen`, `annualPlanningOpen`, `planningFromWizard`. KEEP `planningOpen` (the standalone time-block grid is a Today feature, untouched).
2. Add: `const [guidedHorizon, setGuidedHorizon] = useState<PlanningHorizon | null>(null)`.
3. `?plan=` effect becomes:

```tsx
useEffect(() => {
  const plan = searchParams.get('plan');
  if (!plan) return;
  const map: Record<string, PlanningHorizon> = {
    year: 'annual', season: 'seasonal', month: 'monthly', week: 'weekly', today: 'daily',
  };
  const horizon = map[plan];
  if (horizon) setGuidedHorizon(horizon);
  const next = new URLSearchParams(searchParams);
  next.delete('plan');
  setSearchParams(next, { replace: true });
}, [searchParams, setSearchParams]);
```

4. `onOpenWeeklyPlanning={() => setGuidedHorizon('weekly')}` and `onOpenPlanToday={() => setGuidedHorizon('daily')}` on `<HomeView>`.
5. Replace the five session mounts with one:

```tsx
{guidedHorizon && (
  <Suspense fallback={<LoadingFallback />}>
    <GuidedSessionContainer
      horizon={guidedHorizon}
      onClose={() => setGuidedHorizon(null)}
      onScheduleRoutine={(routineId, date, time) => {
        const routine = allRoutines.find(r => r.id === routineId);
        if (routine) updateRoutine(routineId, scheduleRoutineOnDate(routine, date, time));
      }}
    />
  </Suspense>
)}
```

6. In `src/components/lazy.ts`, add `GuidedSessionContainer` as a lazy export alongside the existing session exports (leave old exports in place until Task 13 removes them). Import it lazily in HomeViewContainer.
7. Delete now-dead callbacks in HomeViewContainer: `saveWeeklyPlanToVault`, `createTaskInBucket` (moved into the container), and the `PlanTodaySession`-only handlers. Keep everything `planningOpen` still needs.
8. Also check `src/apps/tasks/TasksApp.tsx` for references to the removed sessions (`grep -n "PlanningSession\|planTodayOpen\|plan=" src/apps/tasks/TasksApp.tsx`) and route them to `?plan=` navigation (which HomeViewContainer now handles).

- [ ] **Step 5: Wire `HorizonView.tsx`**

Find how the rung currently opens its session (`grep -n "plan=" src/apps/tasks/HorizonView.tsx`). Ensure each horizon page has a primary button:

```tsx
<button type="button" onClick={() => navigate(`/tasks-new/today?plan=${planToken}`)}
  className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors">
  <Sparkles className="w-4 h-4" /> Start planning session
</button>
```

where `planToken` maps year→`year`, season→`season`, month→`month`, week→`week`, today→`today`. Reuse the exact navigation target already used by the existing "Plan the …" affordance (verify the current path with the grep above rather than assuming `/tasks-new/today`).

- [ ] **Step 6: Full-suite spot check + typecheck**

Run: `npx vitest run src/components/planning/guided/ && npx tsc --noEmit`
Expected: all guided tests pass; typecheck clean. Fix any `HomeViewContainer` fallout (unused imports, etc.).

- [ ] **Step 7: Commit**

```bash
git add -A src/components/planning/guided src/components/lazy.ts src/apps/tasks/HomeViewContainer.tsx src/apps/tasks/HorizonView.tsx src/apps/tasks/TasksApp.tsx
git commit -m "feat(guided): wire guided sessions into the app — one overlay, five horizons"
```

---

### Task 13: Deletions — old sessions, goal actions/milestones UI, financialDone

**Files:**
- Delete: `src/components/planning/cadence/` (entire directory)
- Delete: `src/components/planning/weekly/WeeklyPlanningSession.tsx`, `StepWeekAhead.tsx`, `StepBuildTodos.tsx`, `StepConcerns.tsx` + their tests (KEEP `StepSchedule.tsx`; keep only what it needs from `weeklyPlanning.ts`)
- Delete: `src/components/planning/daily/PlanTodaySession.tsx` + test (keep `PlanItemCard.tsx` only if still imported elsewhere — check first)
- Modify: `src/components/lazy.ts` (remove dead exports)
- Modify: Goals app files (remove actions/milestones UI)
- Modify: `src/hooks/usePlanningSession.ts` (remove `financialDone` from `PlanningNotes`; add `lookingBack`, `energy`, `oneWord`, `stepIndex?: number` — the index signature needs `number` added to its union)

- [ ] **Step 1: Inventory every consumer before deleting**

Run: `grep -rln "CadenceSession\|WeeklyPlanningSession\|PlanTodaySession\|StepWeekAhead\|StepBuildTodos\|StepConcerns\|financialDone" src | grep -v guided`
Every hit must be resolved in this task — either deleted with its parent or rewired.

- [ ] **Step 2: Update `PlanningNotes`**

```ts
export interface PlanningNotes {
  review?: string
  concerns?: string
  hopesFears?: string
  funJoy?: string
  relationships?: string
  longTerm?: string
  annualCalendar?: string
  trips?: string
  exerciseNutrition?: string
  tripChildcare?: string
  /** Guided-session additions. */
  lookingBack?: string   // annual: write from one year in the future
  energy?: string        // look-within
  oneWord?: string       // daily tone word
  stepIndex?: number     // resume position within the current period's session
  [key: string]: string | number | boolean | undefined
}
```

(`financialDone` is removed from the type; stale keys in old DB rows are harmless — jsonb just carries them.)

- [ ] **Step 3: Delete the old session components and their lazy exports**

Remove the files listed above, then fix `src/components/lazy.ts` (remove `WeeklyPlanningSession`, `PlanTodaySession`, `MonthlyPlanningSession`, `SeasonalPlanningSession`, `AnnualPlanningSession` exports; KEEP `PlanningSession`). Fix any remaining imports surfaced by Step 1.

For `weeklyPlanning.ts`: run `grep -n "export" src/components/planning/weekly/weeklyPlanning.ts` and keep ONLY the exports still imported (period-token helper used by guided/periods.ts, anything StepSchedule needs); delete `formatWeeklyNote` and other session-only helpers. Update its test file to match.

- [ ] **Step 4: Flatten the Goals app UI**

Run: `grep -rln "addAction\|GoalAction\|Milestone\|addMilestone" src --include="*.tsx" | grep -v guided | grep -v test`
In each Goals-app file: remove action-list and milestone sections/controls so a goal renders as name + status only (areas remain editable). Do NOT touch `useGoals.ts` internals beyond removing now-unused UI-facing exports if trivially safe — the DB tables and hook plumbing may stay; the UI must no longer render or create actions/milestones. Delete `GoalAction` planning code paths surfaced by the grep (e.g. `HomeViewContainer`'s `GoalAction` import if now unused).

- [ ] **Step 5: Full verification**

Run: `npx vitest run && npm run lint && npm run build`
Expected: all pass. Iterate on fallout (deleted-component tests, unused imports) until green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(guided)!: delete superseded sessions + goal actions/milestones UI + financialDone"
```

---

### Task 14: Voice samples, verification gates, push, preview

- [ ] **Step 1: Voice-sample helper for Scott's pick**

Create `scripts/narration-samples.ts` (same pattern as the generator): fetch `GET https://api.elevenlabs.io/v1/voices` with `xi-api-key`, print the first ~8 voices (name + id + labels), then for 3–4 shortlisted ids generate ONE sample mp3 each of the seasonal welcome narration into the scratchpad (NOT public/). This runs only when Scott provides `ELEVENLABS_API_KEY`.

- [ ] **Step 2: Full gates**

Run: `npx vitest run && npm run lint && npm run build`
Expected: all green. Fix anything that isn't.

- [ ] **Step 3: Rebase + push the branch (NOT main)**

```bash
git fetch origin && git rebase origin/main
git push origin HEAD:refs/heads/worktree-five-horizons
```

Pushing the branch produces a Vercel preview deployment (project `symphony-rebuild`). Retrieve the preview URL (`vercel ls` or the GitHub deployment status via `gh api`).

- [ ] **Step 4: Stop for Scott — the two human gates**

Report: (1) preview URL for the end-to-end walkthrough of all five sessions (resume, mute, shared notes), (2) request `ELEVENLABS_API_KEY` + voice pick from the samples, then run `npm run narration`, commit the mp3s + manifest (`bootstrap: false`), and push again. MERGE TO MAIN ONLY after Scott's preview pass — pushes to main auto-deploy to production.
