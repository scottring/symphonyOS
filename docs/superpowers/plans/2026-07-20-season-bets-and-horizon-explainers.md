# Season Bets + Horizon Explainers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the season page its own identity (bet cards, cap 8 + overflow tray, focus line, month strip), thread that vocabulary through the wizard/month/goals surfaces, and add an animated explainer per horizon.

**Architecture:** Bets are existing `bucket='quarter'` tasks re-presented — no schema changes. Pure derivations (partition, pulse, coach heuristics, chapters) live in `src/lib/planning/` with unit tests; presentation lives in `src/components/planning/season/` and `src/components/planning/explainers/`; `HorizonView` swaps its season body. Focus line persists in the existing `planning_sessions.notes` jsonb (`usePlanningSession('seasonal', seasonToken)`). Explainers are a shared scene engine + per-horizon scripts, pure CSS animation.

**Tech Stack:** React 19 + TS strict, Tailwind v4 (Nordic Journal), Vitest + RTL, existing hooks (`useSupabaseTasks`, `usePlanningSession`, `useGoalsContext`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-20-season-bets-and-horizon-explainers-design.md` — vocabulary table is the contract (Goal / Bet / Move / Placement).
- Soft cap 8: never block adding; item 9+ goes to the overflow tray.
- No emojis in UI — lucide icons only (repo rule).
- No changes to wizard `narration` strings (TTS manifest breaks otherwise). New copy is on-screen text only.
- `prefers-reduced-motion` → static frames in explainers.
- Verify with `npm run build` (not bare tsc) + `npx vitest run` before push; pushes to main auto-deploy.
- Work in `.worktrees/season-bets`, commit per task, push to main only when the whole plan is green.

---

### Task 1: Outcome coach heuristic

**Files:**
- Create: `src/lib/planning/outcomeCoach.ts`
- Test: `src/lib/planning/outcomeCoach.test.ts`

**Interfaces:**
- Produces: `looksLikeActivity(title: string): boolean` — consumed by Tasks 3 (season inline add), 5 (WriteListStep bets rows).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/planning/outcomeCoach.test.ts
import { describe, it, expect } from 'vitest'
import { looksLikeActivity } from './outcomeCoach'

describe('looksLikeActivity', () => {
  it.each([
    'Start working on estate planning and will',
    'start the garden project',
    'Continue piano practice',
    'Keep working on the budget',
    'Work on the yard',
    'Get a rough outline of spring and summer breaks',
    'Plan to exercise more',
    'Try to eat better',
    'Make progress on the renovation',
    'Focus on health',
  ])('flags activity phrasing: %s', (t) => {
    expect(looksLikeActivity(t)).toBe(true)
  })

  it.each([
    'Will drafted and signed',
    'A money plan we actually follow',
    'Winter vacation booked',
    'Bikes bought, family riding weekly',
    'Kitchen dishwasher ordered and installed',
    'Plan the week', // imperative but concrete + short — not coached
  ])('accepts outcome phrasing: %s', (t) => {
    expect(looksLikeActivity(t)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/planning/outcomeCoach.test.ts`
Expected: FAIL — `looksLikeActivity` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/planning/outcomeCoach.ts
//
// Heuristic for season-bet phrasing: bets are outcomes ("Will drafted and
// signed"), not activities ("Start working on the will"). Activity phrasings
// stall — "start working on X" can be true for three quarters straight.
// Never blocks saving; callers show a quiet hint + optional AI rewrite.

const ACTIVITY_OPENERS = [
  /^start(\s+working)?(\s+on)?\b/i,
  /^continue\b/i,
  /^keep(\s+working)?(\s+on)?\b/i,
  /^work\s+on\b/i,
  /^make\s+progress\b/i,
  /^focus\s+on\b/i,
  /^plan\s+to\b/i,
  /^try\s+to\b/i,
  /^get\s+a\s+rough\b/i,
  /^look\s+into\b/i,
  /^think\s+about\b/i,
]

export function looksLikeActivity(title: string): boolean {
  const t = title.trim()
  if (!t) return false
  return ACTIVITY_OPENERS.some((re) => re.test(t))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/planning/outcomeCoach.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/planning/outcomeCoach.ts src/lib/planning/outcomeCoach.test.ts
git commit -m "feat(season): outcome-coach heuristic for bet phrasing"
```

---

### Task 2: Bet partition, pulse, serving count, chapters

**Files:**
- Create: `src/lib/planning/betPulse.ts`
- Test: `src/lib/planning/betPulse.test.ts`

**Interfaces:**
- Consumes: `Task` (`bucket`, `completed`, `createdAt`, `scheduledFor`, `sourceId`, `goalId`), `seasonStart/seasonEnd/seasonIndex` from `@/lib/cadence/periods`.
- Produces (consumed by Tasks 3, 4, 6, 7):
  - `BET_CAP = 8`
  - `partitionBets(tasks: readonly Task[]): { bets: Task[]; overflow: Task[] }`
  - `threadsToBet(bet: Task, t: Task): boolean`
  - `betPulse(bet: Task, tasks: readonly Task[], now?: Date): { months: { label: string; hasMoves: boolean; hasDone: boolean }[]; starving: boolean }`
  - `servingCount(tasks: readonly Task[], now?: Date): { serving: number; total: number }`
  - `goalChapters(goalId: string, tasks: readonly Task[]): { label: string; bet: Task; state: 'won' | 'open' }[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/planning/betPulse.test.ts
import { describe, it, expect } from 'vitest'
import { partitionBets, betPulse, servingCount, goalChapters, BET_CAP } from './betPulse'
import type { Task } from '@/types/task'

let n = 0
function task(over: Partial<Task>): Task {
  n += 1
  return {
    id: `t${n}`, title: `task ${n}`, completed: false,
    createdAt: new Date(2026, 6, 1 + n), // July, ordered
    ...over,
  } as Task
}

const NOW = new Date(2026, 6, 20) // Jul 20 — summer (Jun/Jul/Aug), current month = Jul

describe('partitionBets', () => {
  it('splits open quarter tasks: first 8 by createdAt are bets, rest overflow', () => {
    const bets = Array.from({ length: 10 }, () => task({ bucket: 'quarter' }))
    const noise = [task({ bucket: 'month' }), task({ bucket: 'quarter', completed: true })]
    const { bets: b, overflow } = partitionBets([...bets, ...noise])
    expect(b).toHaveLength(BET_CAP)
    expect(overflow).toHaveLength(2)
    expect(b[0].id).toBe(bets[0].id)
    expect(overflow[0].id).toBe(bets[8].id)
  })
})

describe('betPulse', () => {
  it('marks a month with a threaded scheduled move; current month bucket=month counts too', () => {
    const bet = task({ bucket: 'quarter' })
    const julyMove = task({ bucket: 'timed', scheduledFor: new Date(2026, 6, 25), sourceId: bet.id })
    const monthMove = task({ bucket: 'month', sourceId: bet.id, completed: true })
    const p = betPulse(bet, [bet, julyMove, monthMove], NOW)
    expect(p.months.map((m) => m.label)).toEqual(['Jun', 'Jul', 'Aug'])
    expect(p.months[1].hasMoves).toBe(true)
    expect(p.months[1].hasDone).toBe(true) // completed month-bucket move
    expect(p.months[0].hasMoves).toBe(false)
    expect(p.starving).toBe(false)
  })

  it('threads via shared goalId as well as sourceId', () => {
    const bet = task({ bucket: 'quarter', goalId: 'g1' })
    const move = task({ bucket: 'timed', scheduledFor: new Date(2026, 7, 3), goalId: 'g1' })
    const p = betPulse(bet, [bet, move], NOW)
    expect(p.months[2].hasMoves).toBe(true)
  })

  it('starving = open bet with no moves in the current month', () => {
    const bet = task({ bucket: 'quarter' })
    const p = betPulse(bet, [bet], NOW)
    expect(p.starving).toBe(true)
    const won = task({ bucket: 'quarter', completed: true })
    expect(betPulse(won, [won], NOW).starving).toBe(false)
  })
})

describe('servingCount', () => {
  it('counts open bets with at least one current-month move', () => {
    const fed = task({ bucket: 'quarter' })
    const starved = task({ bucket: 'quarter' })
    const move = task({ bucket: 'month', sourceId: fed.id })
    expect(servingCount([fed, starved, move], NOW)).toEqual({ serving: 1, total: 2 })
  })
})

describe('goalChapters', () => {
  it('groups goal-threaded bets by the season they were created in', () => {
    const spring = task({ bucket: 'quarter', goalId: 'g1', createdAt: new Date(2026, 3, 5), completed: true })
    const summer = task({ bucket: 'quarter', goalId: 'g1', createdAt: new Date(2026, 6, 5) })
    const other = task({ bucket: 'quarter', goalId: 'g2' })
    const ch = goalChapters('g1', [spring, summer, other])
    expect(ch).toHaveLength(2)
    expect(ch[0]).toMatchObject({ label: 'Spring 2026', state: 'won' })
    expect(ch[1]).toMatchObject({ label: 'Summer 2026', state: 'open' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/planning/betPulse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/planning/betPulse.ts
//
// Pure derivations for the season-bets page (spec 2026-07-20). Bets are open
// bucket='quarter' tasks; the first BET_CAP by createdAt are the season's
// bets, the rest are overflow ("these aren't bets yet"). A bet's pulse is
// whether each season month has moves threading to it; a bet with nothing in
// the CURRENT month is starving.

import type { Task } from '@/types/task'
import { SEASON_NAMES, seasonIndex, seasonStart } from '@/lib/cadence/periods'

export const BET_CAP = 8

export function partitionBets(tasks: readonly Task[]): { bets: Task[]; overflow: Task[] } {
  const open = tasks
    .filter((t) => !t.completed && t.bucket === 'quarter')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return { bets: open.slice(0, BET_CAP), overflow: open.slice(BET_CAP) }
}

/** A task "threads to" a bet when it is its copy-down child (sourceId) or
 *  serves the same goal (goalId) — the same lineage stamps copy-down writes. */
export function threadsToBet(bet: Task, t: Task): boolean {
  if (t.id === bet.id) return false
  if (t.sourceId === bet.id) return true
  return !!bet.goalId && t.goalId === bet.goalId
}

function monthOf(d: Date | string): { y: number; m: number } {
  const dd = new Date(d)
  return { y: dd.getFullYear(), m: dd.getMonth() }
}

function movesInMonth(bet: Task, tasks: readonly Task[], y: number, m: number, isCurrent: boolean): Task[] {
  return tasks.filter((t) => {
    if (!threadsToBet(bet, t)) return false
    if (t.scheduledFor) {
      const s = monthOf(t.scheduledFor)
      return s.y === y && s.m === m
    }
    // The month bucket is "this month's list" — it has no date, so it counts
    // toward the current month only.
    return isCurrent && t.bucket === 'month'
  })
}

export function betPulse(bet: Task, tasks: readonly Task[], now: Date = new Date()) {
  const start = seasonStart(now)
  const months = [0, 1, 2].map((i) => {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    const isCurrent = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    const moves = movesInMonth(bet, tasks, d.getFullYear(), d.getMonth(), isCurrent)
    return {
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      hasMoves: moves.length > 0,
      hasDone: moves.some((t) => t.completed),
    }
  })
  const current = months[[0, 1, 2].findIndex((i) => {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })]
  return { months, starving: !bet.completed && !!current && !current.hasMoves }
}

export function servingCount(tasks: readonly Task[], now: Date = new Date()): { serving: number; total: number } {
  const { bets } = partitionBets(tasks)
  const serving = bets.filter((b) => !betPulse(b, tasks, now).starving).length
  return { serving, total: bets.length }
}

export function goalChapters(goalId: string, tasks: readonly Task[]) {
  return tasks
    .filter((t) => t.bucket === 'quarter' && t.goalId === goalId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((bet) => {
      const created = new Date(bet.createdAt)
      return {
        label: `${SEASON_NAMES[seasonIndex(created)]} ${created.getFullYear()}`,
        bet,
        state: (bet.completed ? 'won' : 'open') as 'won' | 'open',
      }
    })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/planning/betPulse.test.ts`
Expected: PASS. (If `seasonStart(now)` for Jul 20 doesn't return Jun 1, read `src/lib/cadence/periods.ts` and fix the test's NOW/month expectations to the actual meteorological boundaries — the lib is the authority.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/planning/betPulse.ts src/lib/planning/betPulse.test.ts
git commit -m "feat(season): bet partition, pulse, serving, chapters derivations"
```

---

### Task 3: Season components

**Files:**
- Create: `src/components/planning/season/BetCard.tsx`, `BetsGrid.tsx`, `OverflowTray.tsx`, `MonthStrip.tsx`, `FocusLine.tsx`
- Test: `src/components/planning/season/BetsGrid.test.tsx`

**Interfaces:**
- Consumes: Task 2 exports; `lineageLabel` unused here (goal chip via `goalsById`).
- Produces (consumed by Task 4):
  - `<BetsGrid tasks={Task[]} goalsById={Map<string,Goal>} onSelect={(id:string)=>void} onComplete={(id:string)=>void} now?={Date} />`
  - `<OverflowTray items={Task[]} onMakeMove={(id)=>void} onShelf={(id)=>void} onLetGo={(id)=>void} />`
  - `<MonthStrip tasks={Task[]} onOpenMonth={()=>void} now?={Date} />`
  - `<FocusLine value={string} onChange={(v:string)=>void} />`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/planning/season/BetsGrid.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { BetsGrid } from './BetsGrid'
import { OverflowTray } from './OverflowTray'
import type { Task } from '@/types/task'

function bet(id: string, title: string, over: Partial<Task> = {}): Task {
  return { id, title, completed: false, createdAt: new Date(2026, 6, 1), bucket: 'quarter', ...over } as Task
}

describe('BetsGrid', () => {
  it('renders bet cards with goal provenance and starving state', () => {
    const goals = new Map([['g1', { id: 'g1', name: 'Financial calm' } as never]])
    render(
      <BetsGrid
        tasks={[bet('b1', 'A money plan we follow', { goalId: 'g1' })]}
        goalsById={goals}
        onSelect={vi.fn()}
        onComplete={vi.fn()}
        now={new Date(2026, 6, 20)}
      />,
    )
    expect(screen.getByText('A money plan we follow')).toBeInTheDocument()
    expect(screen.getByText(/Financial calm/)).toBeInTheDocument()
    expect(screen.getByText(/nothing this month/i)).toBeInTheDocument()
  })
})

describe('OverflowTray', () => {
  it('renders the three exits per item', () => {
    render(
      <OverflowTray items={[bet('b9', 'Get a rough outline of breaks')]}
        onMakeMove={vi.fn()} onShelf={vi.fn()} onLetGo={vi.fn()} />,
    )
    expect(screen.getByText('Get a rough outline of breaks')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /month move/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /shelf/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /let it go/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/planning/season/BetsGrid.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the five components**

```tsx
// src/components/planning/season/BetCard.tsx
import { Check, Target } from 'lucide-react'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import { betPulse } from '@/lib/planning/betPulse'

export function BetCard({ bet, tasks, goalsById, onSelect, onComplete, now }: {
  bet: Task
  tasks: readonly Task[]
  goalsById: Map<string, Goal>
  onSelect: (id: string) => void
  onComplete: (id: string) => void
  now?: Date
}) {
  const pulse = betPulse(bet, tasks, now)
  const goal = bet.goalId ? goalsById.get(bet.goalId) : undefined
  return (
    <div
      role="button" tabIndex={0}
      onClick={() => onSelect(bet.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(bet.id) }}
      className={`card p-4 text-left transition-colors cursor-pointer hover:bg-neutral-50 ${
        bet.completed ? 'opacity-60' : pulse.starving ? 'border-amber-200 bg-amber-50/40' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 min-w-0 font-display text-[15px] leading-snug text-neutral-900">{bet.title}</p>
        <button
          type="button"
          aria-label={bet.completed ? 'Won' : 'Mark won'}
          onClick={(e) => { e.stopPropagation(); onComplete(bet.id) }}
          className={`shrink-0 w-6 h-6 rounded-full border grid place-items-center transition-colors ${
            bet.completed ? 'bg-primary-500 border-primary-500 text-white' : 'border-neutral-300 text-transparent hover:text-neutral-300'
          }`}
        >
          <Check className="w-3.5 h-3.5" strokeWidth={3} />
        </button>
      </div>
      {goal ? (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-primary-700">
          <Target className="w-3 h-3" /> {goal.name}
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-neutral-400">seasonal</p>
      )}
      <div className="mt-2.5 flex items-center gap-2">
        {pulse.months.map((m) => (
          <span key={m.label} className="flex items-center gap-1 text-[10px] text-neutral-400">
            <span className={`w-2 h-2 rounded-full ${
              m.hasDone ? 'bg-primary-500' : m.hasMoves ? 'bg-primary-300' : 'bg-neutral-200'
            }`} />
            {m.label}
          </span>
        ))}
        {pulse.starving && !bet.completed && (
          <span className="ml-auto text-[11px] font-medium text-amber-700">nothing this month</span>
        )}
      </div>
    </div>
  )
}
```

```tsx
// src/components/planning/season/BetsGrid.tsx
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import { BetCard } from './BetCard'
import { partitionBets } from '@/lib/planning/betPulse'

export function BetsGrid({ tasks, goalsById, onSelect, onComplete, now }: {
  tasks: readonly Task[]
  goalsById: Map<string, Goal>
  onSelect: (id: string) => void
  onComplete: (id: string) => void
  now?: Date
}) {
  const { bets } = partitionBets(tasks)
  if (bets.length === 0) {
    return (
      <p className="text-sm text-neutral-400 italic">
        No bets yet. A bet is an outcome true by season's end — start one from your goals above, or write one below.
      </p>
    )
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {bets.map((b) => (
        <BetCard key={b.id} bet={b} tasks={tasks} goalsById={goalsById} onSelect={onSelect} onComplete={onComplete} now={now} />
      ))}
    </div>
  )
}
```

```tsx
// src/components/planning/season/OverflowTray.tsx
import { CornerRightDown, Archive, Trash2 } from 'lucide-react'
import type { Task } from '@/types/task'

export function OverflowTray({ items, onMakeMove, onShelf, onLetGo }: {
  items: readonly Task[]
  onMakeMove: (id: string) => void
  onShelf: (id: string) => void
  onLetGo: (id: string) => void
}) {
  if (items.length === 0) return null
  return (
    <section className="mt-6 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/60 p-4">
      <h3 className="text-sm font-medium text-neutral-600">These aren't bets yet ({items.length})</h3>
      <p className="text-[12px] text-neutral-400 mt-0.5 mb-3">
        A season holds 5–8 bets. These are load — turn them into moves, shelf them, or let them go.
      </p>
      <ul className="space-y-1.5">
        {items.map((t) => (
          <li key={t.id} className="flex items-center gap-2 rounded-lg bg-white border border-neutral-100 px-3 py-2">
            <span className="flex-1 min-w-0 text-sm text-neutral-700 truncate">{t.title}</span>
            <button type="button" onClick={() => onMakeMove(t.id)}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
              <CornerRightDown className="w-3 h-3" /> Month move
            </button>
            <button type="button" onClick={() => onShelf(t.id)}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md text-neutral-500 hover:bg-neutral-100 transition-colors">
              <Archive className="w-3 h-3" /> Shelf
            </button>
            <button type="button" onClick={() => onLetGo(t.id)}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md text-neutral-400 hover:text-danger-600 hover:bg-danger-50 transition-colors">
              <Trash2 className="w-3 h-3" /> Let it go
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

```tsx
// src/components/planning/season/MonthStrip.tsx
import type { Task } from '@/types/task'
import { seasonStart } from '@/lib/cadence/periods'

export function MonthStrip({ tasks, onOpenMonth, now = new Date() }: {
  tasks: readonly Task[]
  onOpenMonth: () => void
  now?: Date
}) {
  const start = seasonStart(now)
  const cells = [0, 1, 2].map((i) => {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    const isCurrent = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    const moves = tasks.filter((t) => {
      if (t.completed && !t.scheduledFor) return false
      if (t.scheduledFor) {
        const s = new Date(t.scheduledFor)
        return s.getMonth() === d.getMonth() && s.getFullYear() === d.getFullYear()
      }
      return isCurrent && t.bucket === 'month'
    })
    const done = moves.filter((t) => t.completed).length
    return {
      key: d.toISOString(),
      label: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      count: moves.length, done, isCurrent,
    }
  })
  return (
    <div className="grid grid-cols-3 gap-3">
      {cells.map((c) => (
        <button key={c.key} type="button" onClick={onOpenMonth}
          className={`rounded-xl border px-4 py-3 text-left transition-colors hover:bg-neutral-50 ${
            c.isCurrent ? 'border-primary-200 bg-primary-50/30' : 'border-neutral-100 bg-white'
          }`}>
          <span className="block text-[11px] tracking-wide font-medium text-neutral-500">{c.label}</span>
          <span className="block mt-1 text-sm text-neutral-800">
            {c.count === 0 ? 'no moves' : `${c.count} move${c.count === 1 ? '' : 's'}`}
          </span>
          {c.count > 0 && (
            <span className="mt-1.5 block h-1 rounded-full bg-neutral-100 overflow-hidden">
              <span className="block h-full bg-primary-400" style={{ width: `${Math.round((c.done / c.count) * 100)}%` }} />
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
```

```tsx
// src/components/planning/season/FocusLine.tsx
export function FocusLine({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] tracking-wide uppercase text-neutral-400">This season is about</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="one sentence — what makes this season a good one"
        className="mt-1 w-full bg-transparent font-display text-lg text-neutral-800 placeholder:text-neutral-300 border-b border-neutral-200 focus:border-primary-400 focus:outline-none pb-1"
      />
    </label>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/planning/season/BetsGrid.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/planning/season/
git commit -m "feat(season): bet card, grid, overflow tray, month strip, focus line"
```

---

### Task 4: HorizonView season body swap

**Files:**
- Modify: `src/apps/tasks/HorizonView.tsx`

**Interfaces:**
- Consumes: Task 3 components; `partitionBets` (Task 2); `usePlanningSession` + `guidedPeriod('seasonal')` for the focus line; existing `domainTasks`, `updateTask`, `deleteTask`, `toggleTask`, `handleSelect`, `goals`, `navigate`, `undo`.
- Produces: season rung renders FocusLine → BetsGrid → OverflowTray → MonthStrip; the season DenseInboxRow pool sections no longer render for `horizon === 'season'`. The goals reference panel ("Start this season") stays.

- [ ] **Step 1: Add imports and wiring**

At the top of `HorizonView.tsx` add:

```tsx
import { BetsGrid } from '@/components/planning/season/BetsGrid';
import { OverflowTray } from '@/components/planning/season/OverflowTray';
import { MonthStrip } from '@/components/planning/season/MonthStrip';
import { FocusLine } from '@/components/planning/season/FocusLine';
import { usePlanningSession } from '@/hooks/usePlanningSession';
import { guidedPeriod } from '@/components/planning/guided/periods';
```

Inside the component (near the other hooks, after `useGoalsContext`):

```tsx
  // Season focus line — persisted in the shared planning_sessions notes row
  // for this season (key seasonFocus), same row the wizard writes.
  const seasonToken = useMemo(() => guidedPeriod('seasonal').token, []);
  const { notes: seasonNotes, patchNotes: patchSeasonNotes } = usePlanningSession('seasonal', seasonToken);
  const goalsById = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);
```

Note: `usePlanningSession` is called unconditionally (hooks rule) — acceptable; it's one cheap row read.

- [ ] **Step 2: Render the season body**

After the month-grid block (`{horizon === 'month' && (...)}`), add:

```tsx
          {/* Season — five bets and a shape (spec 2026-07-20). Cards, cap 8
              with overflow tray, focus line, the season's three months. */}
          {horizon === 'season' && (
            <div className="mb-8 space-y-6">
              <FocusLine
                value={(seasonNotes.seasonFocus as string) ?? ''}
                onChange={(v) => patchSeasonNotes({ seasonFocus: v })}
              />
              <BetsGrid
                tasks={domainTasks}
                goalsById={goalsById}
                onSelect={handleSelect}
                onComplete={(id) => toggleTask(id)}
              />
              <OverflowTray
                items={partitionBets(domainTasks).overflow}
                onMakeMove={(id) => updateTask(id, { bucket: 'month' })}
                onShelf={(id) => updateTask(id, { bucket: 'someday' })}
                onLetGo={(id) => { void deleteTask(id); }}
              />
              <MonthStrip tasks={domainTasks} onOpenMonth={() => navigate('/month')} />
            </div>
          )}
```

Import `partitionBets` from `@/lib/planning/betPulse`. Check `toggleTask` and `deleteTask` are already destructured from `useSupabaseTasks` at the top (they are, line ~141). If the season page previously offered undo on delete via `undo.pushAction`, mirror the deletion pattern used by `renderRow`'s delete action in this file — read it and reuse verbatim; otherwise plain `deleteTask` is acceptable (the row is recoverable from Supabase history, and OverflowTray delete is labeled "Let it go").

- [ ] **Step 3: Suppress the task-row pool for season**

Find the pool/grouped sections rendering (`grouped.groups.map(...)` and the loose-tasks section and the inline add row that follow). Gate them so season doesn't render task rows:

```tsx
          {horizon !== 'season' && grouped.groups.map(({ project, items }) => (
```

and the same `horizon !== 'season' &&` guard on the loose-items section that follows it. KEEP the inline "add a task" affordance rendering for season (a new bet lands as `bucket='quarter'` via the existing `onCreateTaskFromValue` — it already creates into the horizon bucket). Attach the outcome coach to that input for season only:

```tsx
{horizon === 'season' && looksLikeActivity(draftTitle) && (
  <p className="text-[11px] text-amber-700 mt-1">
    Bets read best as outcomes — "Will drafted and signed", not "start working on the will".
  </p>
)}
```

(`draftTitle` = whatever state variable the existing inline add input uses in this file — find it near the add-row JSX; import `looksLikeActivity`.)

- [ ] **Step 4: Build + run the file's tests**

Run: `npm run build && npx vitest run src/apps/tasks`
Expected: build green; existing HorizonView-adjacent tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/apps/tasks/HorizonView.tsx
git commit -m "feat(season): bets page body — focus line, cards, overflow tray, month strip"
```

---

### Task 5: Wizard bets writer

**Files:**
- Modify: `src/components/planning/guided/stepTypes/WriteListStep.tsx`, `src/components/planning/guided/sessions.ts`
- Test: extend `src/components/planning/guided/stepTypes/WriteListStep.test.tsx` if present (check; create minimal if absent)

**Interfaces:**
- Consumes: `looksLikeActivity` (Task 1), `BET_CAP` (Task 2).
- Produces: `step.props.rows === 'bets'` variant; seasonal session's write step (`write-season`, `props.bucket:'quarter'`) switches to `rows: 'bets'`.

- [ ] **Step 1: sessions.ts — flip the seasonal write step**

In the seasonal session's `write-season` step (search `id: 'write-season'`), change `props: { bucket: 'quarter', rows: 'plain' }` to `props: { bucket: 'quarter', rows: 'bets' }`. Do NOT touch the `narration` string.

- [ ] **Step 2: WriteListStep — bets rendering + counter + coach**

In `WriteListStep.tsx`, where rows render (`step.props?.rows === 'plain' ? <SeasonListRow .../> : <TaskTriageRow .../>`), extend:

```tsx
{step.props?.rows === 'bets' || step.props?.rows === 'plain'
  ? <SeasonListRow task={t} />
  : <TaskTriageRow task={t} />}
```

Above the list (bets mode only), add the cap counter; below the input, the coach hint on the current draft value (the component has a controlled input state for the new-item draft — reuse it):

```tsx
{step.props?.rows === 'bets' && (
  <p className={`text-[11px] mb-2 ${listTasks.length > BET_CAP ? 'text-amber-700 font-medium' : 'text-neutral-400'}`}>
    {listTasks.length} of {BET_CAP} — 5 is a season; 19 is a backlog.
  </p>
)}
{step.props?.rows === 'bets' && looksLikeActivity(draft) && (
  <p className="text-[11px] text-amber-700 mt-1">
    Bets read best as outcomes — what will be true by season's end?
  </p>
)}
```

(`listTasks` and `draft` = this component's actual variable names for the bucket's tasks and the input draft — read the file first and use its names. Import `looksLikeActivity` and `BET_CAP`.)

- [ ] **Step 3: Test**

If `WriteListStep.test.tsx` exists, add a case: rows:'bets' with 9 tasks renders the amber counter text (regex `/9 of 8/`). If no test file exists, create one following the sibling step tests' mock pattern (see `ReviewStep.test.tsx` for the GuidedContext mock recipe) with that single assertion.

Run: `npx vitest run src/components/planning/guided`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/planning/guided/
git commit -m "feat(season): wizard write step becomes the bets writer (cap counter + coach)"
```

---

### Task 6: Month identity line

**Files:**
- Modify: `src/apps/tasks/HorizonView.tsx`

**Interfaces:**
- Consumes: `servingCount` (Task 2).

- [ ] **Step 1: Render the line**

In the month rung, directly above the `MonthCalendarGrid` block, add:

```tsx
          {horizon === 'month' && (
            <p className="mb-3 text-[12px] text-neutral-400">
              Moves — concrete chunks that fit in a sitting; 10–15 is a good month.
              {(() => { const s = servingCount(domainTasks); return s.total > 0 ? ` Serving ${s.serving} of ${s.total} bets.` : ''; })()}
            </p>
          )}
```

Import `servingCount` from `@/lib/planning/betPulse`.

- [ ] **Step 2: Build, commit**

Run: `npm run build`
Expected: green.

```bash
git add src/apps/tasks/HorizonView.tsx
git commit -m "feat(month): identity line — moves not bets, serving count"
```

---

### Task 7: Goal chapters strip

**Files:**
- Modify: `src/components/goals/GoalView.tsx`
- Test: extend `src/components/goals/GoalsList.test.tsx`? No — create `src/components/goals/GoalChapters.test.tsx`; Create: `src/components/goals/GoalChapters.tsx`

**Interfaces:**
- Consumes: `goalChapters` (Task 2); tasks come from whatever hook GoalView already uses (read the file — it renders rollups, so tasks are in scope).
- Produces: `<GoalChapters goalId={string} tasks={Task[]} />`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/goals/GoalChapters.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { GoalChapters } from './GoalChapters'
import type { Task } from '@/types/task'

const bet = (id: string, title: string, over: Partial<Task> = {}): Task =>
  ({ id, title, completed: false, createdAt: new Date(2026, 6, 5), bucket: 'quarter', goalId: 'g1', ...over }) as Task

describe('GoalChapters', () => {
  it('lists one chapter per season bet with its state', () => {
    render(<GoalChapters goalId="g1" tasks={[
      bet('b1', 'Money plan drafted', { createdAt: new Date(2026, 3, 2), completed: true }),
      bet('b2', 'A money plan we follow'),
    ]} />)
    expect(screen.getByText(/Spring 2026/)).toBeInTheDocument()
    expect(screen.getByText('Money plan drafted')).toBeInTheDocument()
    expect(screen.getByText(/Summer 2026/)).toBeInTheDocument()
  })

  it('renders nothing when the goal has no bets', () => {
    const { container } = render(<GoalChapters goalId="g1" tasks={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Verify it fails, then implement**

```tsx
// src/components/goals/GoalChapters.tsx
import { Check } from 'lucide-react'
import type { Task } from '@/types/task'
import { goalChapters } from '@/lib/planning/betPulse'

/** The goal's story across seasons — which bet each season carried for it. */
export function GoalChapters({ goalId, tasks }: { goalId: string; tasks: readonly Task[] }) {
  const chapters = goalChapters(goalId, tasks)
  if (chapters.length === 0) return null
  return (
    <section className="mt-6">
      <h3 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-2">Chapters</h3>
      <ul className="space-y-1.5">
        {chapters.map(({ label, bet, state }) => (
          <li key={bet.id} className="flex items-center gap-2 text-sm">
            <span className="w-24 shrink-0 text-[11px] text-neutral-400">{label}</span>
            <span className="flex-1 min-w-0 text-neutral-700 truncate">{bet.title}</span>
            {state === 'won' && <Check className="w-3.5 h-3.5 text-primary-500 shrink-0" strokeWidth={3} />}
          </li>
        ))}
      </ul>
    </section>
  )
}
```

Mount it in `GoalView.tsx` below the goal's rollup/progress area: `<GoalChapters goalId={goal.id} tasks={tasks} />` using the file's existing tasks variable (read the file for the exact name and a sensible anchor).

- [ ] **Step 3: Run tests, commit**

Run: `npx vitest run src/components/goals`
Expected: PASS.

```bash
git add src/components/goals/
git commit -m "feat(goals): chapters strip — the goal's bet per season"
```

---

### Task 8: Horizon explainers

**Files:**
- Create: `src/components/planning/explainers/HorizonExplainer.tsx` (engine), `src/components/planning/explainers/scenes.tsx` (all five scripts + vignette primitives), `src/components/planning/explainers/explainers.css`
- Modify: `src/apps/tasks/HorizonView.tsx` (link + first-visit auto-open), `src/index.css` (import the css file if the project imports component css centrally — check how other component css is handled; if none exists, import `./explainers.css` from the engine file, Vite handles it)
- Test: `src/components/planning/explainers/HorizonExplainer.test.tsx`

**Interfaces:**
- Produces: `<HorizonExplainer horizon={HorizonId} open={boolean} onClose={()=>void} />`; `EXPLAINER_SCENES: Record<HorizonId, Scene[]>` where `Scene = { headline: string; body?: string; vignette: ReactNode }`.
- localStorage key: `symphony.explainerSeen.<horizon>`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/planning/explainers/HorizonExplainer.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { HorizonExplainer } from './HorizonExplainer'

describe('HorizonExplainer', () => {
  it('renders the first scene and advances on Next', () => {
    render(<HorizonExplainer horizon="season" open onClose={vi.fn()} />)
    expect(screen.getByText(/a bet is an outcome/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText(/5.*8/)).toBeInTheDocument()
  })

  it('calls onClose on Escape and the close button', () => {
    const onClose = vi.fn()
    render(<HorizonExplainer horizon="week" open onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders nothing when closed', () => {
    const { container } = render(<HorizonExplainer horizon="year" open={false} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Implement the engine**

```tsx
// src/components/planning/explainers/HorizonExplainer.tsx
//
// Full-screen dismissible scene player — one script per horizon. Pure CSS
// animation (see explainers.css); respects prefers-reduced-motion.
import { useEffect, useState } from 'react'
import { X, ArrowRight, ArrowLeft } from 'lucide-react'
import type { HorizonId } from '@/lib/today/horizons'
import { EXPLAINER_SCENES } from './scenes'
import './explainers.css'

export function HorizonExplainer({ horizon, open, onClose }: {
  horizon: HorizonId
  open: boolean
  onClose: () => void
}) {
  const scenes = EXPLAINER_SCENES[horizon] ?? []
  const [i, setI] = useState(0)
  useEffect(() => { if (open) setI(0) }, [open, horizon])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setI((v) => Math.min(v + 1, scenes.length - 1))
      if (e.key === 'ArrowLeft') setI((v) => Math.max(v - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, scenes.length, onClose])
  if (!open || scenes.length === 0) return null
  const scene = scenes[i]
  const last = i === scenes.length - 1
  return (
    <div className="fixed inset-0 z-50 bg-bg-base/95 backdrop-blur-sm flex flex-col" role="dialog" aria-modal="true">
      <div className="flex items-center justify-end p-4">
        <button type="button" aria-label="Close" onClick={onClose}
          className="w-9 h-9 rounded-full grid place-items-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div key={i} className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 explainer-scene">
        <div className="w-full max-w-md explainer-vignette">{scene.vignette}</div>
        <h2 className="mt-8 font-display text-2xl text-neutral-900 text-center max-w-lg text-balance">{scene.headline}</h2>
        {scene.body && <p className="mt-2 text-sm text-neutral-500 text-center max-w-md">{scene.body}</p>}
      </div>
      <div className="flex items-center justify-between p-6">
        <button type="button" aria-label="Back" onClick={() => setI((v) => Math.max(v - 1, 0))}
          disabled={i === 0}
          className="w-9 h-9 rounded-full grid place-items-center text-neutral-400 hover:bg-neutral-100 disabled:opacity-0 transition-all">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1.5">
          {scenes.map((_, d) => (
            <span key={d} className={`w-1.5 h-1.5 rounded-full transition-colors ${d === i ? 'bg-primary-500' : 'bg-neutral-200'}`} />
          ))}
        </div>
        <button type="button" onClick={() => (last ? onClose() : setI((v) => v + 1))}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors">
          {last ? 'Got it' : 'Next'} {!last && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
```

```css
/* src/components/planning/explainers/explainers.css */
/* Scene entry animation. Elements inside a vignette can use the staggered
   .ex-drop / .ex-rise classes; scene container fades. */
.explainer-scene { animation: ex-fade 400ms ease both; }
.explainer-vignette .ex-drop { animation: ex-drop 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.explainer-vignette .ex-rise { animation: ex-rise 500ms ease both; }
.explainer-vignette [data-ex-delay='1'] { animation-delay: 200ms; }
.explainer-vignette [data-ex-delay='2'] { animation-delay: 400ms; }
.explainer-vignette [data-ex-delay='3'] { animation-delay: 600ms; }
.explainer-vignette [data-ex-delay='4'] { animation-delay: 800ms; }
@keyframes ex-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes ex-drop { from { opacity: 0; transform: translateY(-16px) } to { opacity: 1; transform: translateY(0) } }
@keyframes ex-rise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
@media (prefers-reduced-motion: reduce) {
  .explainer-scene, .explainer-vignette .ex-drop, .explainer-vignette .ex-rise { animation: none; }
}
```

- [ ] **Step 3: Write the five scripts**

`scenes.tsx` defines small vignette primitives (MiniGoal, MiniBet, MiniMove, MiniDay — rounded chips styled like the real cards, ~20 lines total) and the scripts. The signature "cascade drop" vignette (goal → bet → move → day, each `.ex-drop` with staggered `data-ex-delay`) is one component reused by every script. Full copy for the five scripts, verbatim (headline / body per scene):

**year:** 1. "Goals are directions, not tasks." / "A goal is never 'done' this quarter — it points the year." 2. "Seasons take bets on goals." / "Every season, you pick which goals get a real push." 3. (cascade drop) "One goal, threading down to a single day." / "Goal → season bet → month move → a slot on a Tuesday." 4. "Goals you don't start stay on the shelf." / "Nothing expires — every seasonal session offers them again."

**season:** 1. "A bet is an outcome true by season's end." / "Measured in weekends — 'Will drafted and signed', not 'start working on the will'." 2. "Five to eight. Never more." / "19 bets isn't a season, it's a backlog. Extras become month moves, or wait on the shelf." 3. "Bets feed months as moves." / "Copy a bet down and it becomes concrete chunks on the month list — the bet stays here." 4. "A starving bet tells you." / "A bet with nothing on this month's list shows an amber warning — that's the season doing its job." 5. "Win it, carry it, or let it go." / "Every outcome is honorable. That's why they're called bets."

**month:** 1. "Moves, not bets." / "A move fits in a sitting or two — an order placed, a call made." 2. "Copying down duplicates on purpose." / "The original stays on the list above, so each level keeps its own honest list." 3. "Moves land on real days." / "The month calendar is where ideas become dated." 4. "10–15 is a good month." / "A shorter list you believe beats a long one you ignore."

**week:** 1. "The week is where moves get placed." / "A placement is a move with a day and a time." 2. "The grid refuses the past." / "Rocks land on days ahead — planning never schedules yesterday." 3. "Placed rocks leave the pool." / "That's not a bug: a fully-placed week reads as an empty list and a full grid."

**today:** 1. "Today shows what the system already decided." / "The cascade ends here — you execute, you don't re-plan." 2. "New things go to the inbox, not the plan." / "Capture is zero-friction; triage happens later, on purpose." 3. (cascade drop) "Every item on today can explain itself." / "Follow the thread back: day → move → bet → goal."

- [ ] **Step 4: Entry points in HorizonView**

In the page header area (near the "Plan the {rungName}" button), add for all horizons:

```tsx
              <button type="button" onClick={() => setExplainerOpen(true)}
                className="text-[12px] text-neutral-400 hover:text-primary-700 transition-colors">
                What is this level?
              </button>
```

State + first-visit auto-open near the other state hooks:

```tsx
  const [explainerOpen, setExplainerOpen] = useState(false);
  useEffect(() => {
    const key = `symphony.explainerSeen.${horizon}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1');
      setExplainerOpen(true);
    }
  }, [horizon]);
```

Render `<HorizonExplainer horizon={horizon} open={explainerOpen} onClose={() => setExplainerOpen(false)} />` at the end of the page container. Today's rung is not HorizonView — mount the same link + auto-open in `src/components/home/HomeHeader.tsx` (link only, no auto-open on Today: it's the app's default view and a modal on first launch would fight the empty state; the Today script is reachable via the link).

- [ ] **Step 5: Run tests, build, commit**

Run: `npx vitest run src/components/planning/explainers && npm run build`
Expected: PASS + green build.

```bash
git add src/components/planning/explainers/ src/apps/tasks/HorizonView.tsx src/components/home/HomeHeader.tsx
git commit -m "feat(planning): animated horizon explainers with first-visit auto-open"
```

---

### Task 9: Sharpen-bet AI rewrite

**Files:**
- Modify: `supabase/functions/sharpen-goal/index.ts` (add `mode: 'bet'` prompt variant), the season inline-add coach hint (Task 4's) and WriteListStep coach hint (Task 5's) gain a "Sharpen" button wired like the goals page's existing ✨ Sharpen (find its client call in `src/components/goals/` and reuse the same invoke pattern with `mode: 'bet'`).

- [ ] **Step 1: Edge fn variant**

In `sharpen-goal/index.ts`, read the existing prompt construction; add a branch: when body `mode === 'bet'`, system prompt becomes:

```
Rewrite the given season intention as a single outcome sentence: the end-state that will be true by the end of the season, concrete and verifiable, under 12 words, no "start/continue/work on" phrasing. Return only the rewritten sentence.
```

- [ ] **Step 2: Client wiring**

Both coach hints get: `<button onClick={sharpen}>Sharpen</button>` where `sharpen` invokes the fn with `{ title, mode: 'bet' }` and replaces the draft input value with the response. Copy the exact invoke code from the goals sharpen call site (auth header pattern matters — reuse verbatim).

- [ ] **Step 3: Deploy + verify**

```bash
supabase functions deploy sharpen-goal --use-api
```

Verify with a curl against the deployed fn (anon key + a sample title) — expect a rewritten sentence.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/sharpen-goal/ src/
git commit -m "feat(season): sharpen-bet rewrite variant + coach wiring"
```

---

### Task 10: Ship

- [ ] **Step 1: Full verification**

```bash
npm run build && npx vitest run && npx eslint src/lib/planning src/components/planning/season src/components/planning/explainers src/components/goals/GoalChapters.tsx
```

Expected: build green, full suite green, 0 new lint errors.

- [ ] **Step 2: Punch list**

Add to `tasks/app-audit-punchlist.md` Session 3 section: "Season bets + explainers shipped (spec 2026-07-20) — pending Scott's visual review on prod: season page with his real 19-item list (expect 8 cards + 11-tray), one explainer run-through."

- [ ] **Step 3: Rebase + push (deploys)**

```bash
git fetch origin && git rebase origin/main && git push origin HEAD:main
```

- [ ] **Step 4: Verify deploy + smoke test**

Confirm the Vercel deployment succeeds (gh api deployments for the pushed sha). Then on the demo account: `/season` renders cards; `What is this level?` opens the explainer; season wizard write step shows the counter.

- [ ] **Step 5: Remove worktree**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS
git worktree remove .worktrees/season-bets && git branch -D season-bets
```
