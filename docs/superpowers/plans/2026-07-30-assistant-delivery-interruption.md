# Assistant Delivery + Interruption Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give proactive suggestions a second delivery tier — *unprompted* — that can appear on the wall and on Today without being attached to an entity you navigated to, governed by one auditable interruption policy.

**Architecture:** Two tiers. *Anchored* (existing `ContextChips`) is unchanged and needs no policy. *Unprompted* is new: a deterministic urgency score plus a single pure gate (`mayInterrupt`) decides what may appear on the wall rail and in a Today band. Urgency is computed by rules, never by the model, and is recomputed live on the client because the engine only runs every 6 hours.

**Tech Stack:** React 19 + TypeScript strict, Vitest, Supabase (Postgres + Deno edge functions), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-30-assistant-delivery-interruption-design.md`

## Global Constraints

- Work in this worktree only (`.worktrees/assistant-delivery`, branch `assistant-delivery`). **Never edit or commit in the main worktree.** Verify `pwd` before every commit.
- `npm test` is vitest **watch** mode. Always use `npx vitest run`.
- Pre-push `tsc` is not the Vercel build. Run `npm run build` before pushing.
- CI runs lint; pre-push does not. Run `npm run lint` before pushing.
- **No emojis in UI** — lucide icons only (via `ConceptIcon` / `lucide-react`).
- Path alias `@/` → `src/`.
- Node must be 22.14.0 for tests: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:$PATH"`.
- DDL applies via the Supabase Management API (`POST /v1/projects/mwadppyrqzuzgstmwpuy/database/query`), because local migrations are out of sync with prod. The migration file is still committed as the record.
- **Fail closed everywhere:** any error, any missing data, any degraded bundle part ⇒ the suggestion does not interrupt. Degradation is always quieter, never louder.
- Anchored surfaces (`ContextChips`, `PanelAssistant`, `ProjectViewRedesign`, `OverdueSection`) must keep working unchanged. The unprompted tier is additive.

---

## Deviation from the spec, decided while planning

The spec specifies **three** new columns. Implementing "escalation beats cooldown" requires knowing the urgency *at the time it was seen*, which three columns cannot express. This plan adds a fourth, `seen_urgency smallint`, and Task 1 covers it. Everything else follows the spec as written.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `supabase/migrations/2026-07-30_proactive_suggestions_interruption.sql` | Bring table under migration control; add 4 columns |
| `src/lib/assistant/actionable.ts` | `isActionableSuggestion` moved out of the component |
| `src/lib/assistant/suggestionMutations.ts` | Shared act / dismiss / snooze / markSeen DB writes |
| `src/lib/assistant/urgency.ts` | `deriveUrgencyFacts` + `computeUrgency` (canonical) |
| `src/lib/assistant/urgency.test.ts` | Fixture table incl. boundaries |
| `src/lib/assistant/interruptionWindow.ts` | Real DND window, separate from `quietHours.ts` |
| `src/lib/assistant/interruptionWindow.test.ts` | Boundaries + midnight wrap |
| `src/lib/assistant/interruptionPolicy.ts` | `mayInterrupt` — the single gate |
| `src/lib/assistant/interruptionPolicy.test.ts` | Full truth table + check-order |
| `src/lib/assistant/cadenceDue.ts` | State-aware "which ritual is overdue, by how much" |
| `src/lib/assistant/cadenceDue.test.ts` | Fixtures |
| `src/lib/assistant/urgencyTwin.test.ts` | Asserts edge twin matches canonical |
| `src/hooks/useUnpromptedSuggestions.ts` | Applies policy, writes `seen_at`, exposes snooze |
| `src/hooks/useUnpromptedSuggestions.test.ts` | `seen_at` written once; anchored never writes it |
| `src/components/assistant/UnpromptedLines.tsx` | Shared calm line list (Today band) |
| `src/components/wall-v2/WallV2AssistantLine.tsx` | Wall single line |
| `src/components/wall-v2/wallAssistantAdapter.ts` | Reduced action vocabulary for the Pi |
| `src/components/wall-v2/wallAssistantAdapter.test.ts` | Asserts mailto/sms/link never produce a wall action |
| `supabase/functions/_shared/urgency.ts` | Deno twin of `urgency.ts` |

**Modify:**

| File | Change |
|---|---|
| `src/types/proactiveSuggestion.ts` | Add `seenAt`, `seenUrgency`, `snoozedUntil`, `urgency` + row fields + `plan_session` type |
| `src/components/schedule/ProactiveSuggestionChips.tsx:41-58` | Re-export `isActionableSuggestion` from new home |
| `src/hooks/useEntityContext.ts:108-159` | Call shared mutations instead of duplicating |
| `src/hooks/useProactiveSuggestions.ts:63-111` | Call shared mutations instead of duplicating |
| `src/components/schedule/ScheduleItem.tsx:150-158` | Delete 4 dead props + now-unused import |
| `src/components/schedule/TodaySectionList.tsx:516-525` | Delete the dead compute-and-discard block |
| `src/components/schedule/TodayView.tsx:~868` | Mount Today band under Up Next hero |
| `src/components/wall-v2/WallV2Shell.tsx:~499` | Mount wall line under `WallV2NowNext` |
| `supabase/functions/proactive-engine/index.ts` | Write `urgency` on upsert; emit `plan_session` |

---

### Task 1: Migration + type surface

**Files:**
- Create: `supabase/migrations/2026-07-30_proactive_suggestions_interruption.sql`
- Modify: `src/types/proactiveSuggestion.ts`

**Interfaces:**
- Produces: `ProactiveSuggestion.urgency?: number`, `.seenAt?: string`, `.seenUrgency?: number`, `.snoozedUntil?: string`; `SuggestionType` gains `'plan_session'`; row fields `urgency`, `seen_at`, `seen_urgency`, `snoozed_until`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/2026-07-30_proactive_suggestions_interruption.sql`:

```sql
-- proactive_suggestions was never under migration control: it exists in prod but
-- no migration created it (authoritative DDL lived in tasks/proactive-assistant-spec.md).
-- This file brings it under control and adds the interruption-policy columns.
-- Idempotent: safe to apply to a database where the table already exists.

create table if not exists public.proactive_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  entity_type text not null,
  entity_id text not null,
  suggestion_type text not null,
  title text not null,
  detail text,
  confidence float default 0.8,
  action_type text,
  action_payload jsonb default '{}',
  status text default 'active',
  acted_at timestamptz,
  dismissed_at timestamptz,
  expires_at timestamptz,
  suggestion_key text not null,
  generated_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, suggestion_key)
);

create index if not exists idx_proactive_suggestions_active
  on public.proactive_suggestions(user_id, status, entity_type)
  where status = 'active';

-- Interruption policy columns.
-- urgency: rules-derived 0-100, written by the engine as a COARSE ORDERING HINT.
--   The client recomputes live (the engine runs every 6h; "event starts within
--   90min" flips true between runs). The live value is authoritative — do not
--   "optimize" the client recompute away.
alter table public.proactive_suggestions
  add column if not exists urgency smallint;

-- seen_at: first time this rendered on an UNPROMPTED surface (wall line / Today
--   band). Anchored chips never write it. This is what distinguishes "missed"
--   from "ignored" and is the evidence for revisiting OS notifications.
alter table public.proactive_suggestions
  add column if not exists seen_at timestamptz;

-- seen_urgency: urgency at the moment it was seen, so "escalation beats
--   cooldown" can compare against it.
alter table public.proactive_suggestions
  add column if not exists seen_urgency smallint;

-- snoozed_until: "not now". Deliberately a timestamp, not a status — a status
--   would need a background job to un-set and would strand rows if that job broke.
alter table public.proactive_suggestions
  add column if not exists snoozed_until timestamptz;

create index if not exists idx_proactive_suggestions_unprompted
  on public.proactive_suggestions(user_id, status, urgency desc)
  where status = 'active';
```

- [ ] **Step 2: Apply it to prod via the Management API**

Read the token from keychain, then POST the file contents as `{"query": "..."}` to
`https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query`.
Expected: success. Then **apply it a second time** and confirm it still succeeds — that is the idempotency check.

- [ ] **Step 3: Extend the client types**

In `src/types/proactiveSuggestion.ts`, add `'plan_session'` to `SuggestionType` (after `'do_today'`), and add these to `ProactiveSuggestion`:

```ts
  /** Rules-derived 0-100, written by the engine. A HINT — recompute live before
   *  any interruption decision (see src/lib/assistant/urgency.ts). */
  urgency?: number
  /** First render on an unprompted surface. Anchored chips never set this. */
  seenAt?: string
  /** Urgency at the moment it was seen — lets escalation override cooldown. */
  seenUrgency?: number
  /** "Not now" — muted while in the future. Row stays `active`. */
  snoozedUntil?: string
```

Add to `ProactiveSuggestionRow`:

```ts
  urgency: number | null
  seen_at: string | null
  seen_urgency: number | null
  snoozed_until: string | null
```

And in `rowToSuggestion`:

```ts
    urgency: row.urgency ?? undefined,
    seenAt: row.seen_at ?? undefined,
    seenUrgency: row.seen_urgency ?? undefined,
    snoozedUntil: row.snoozed_until ?? undefined,
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-07-30_proactive_suggestions_interruption.sql src/types/proactiveSuggestion.ts
git commit -m "feat(assistant): interruption columns + bring proactive_suggestions under migration control"
```

---

### Task 2: Extract `isActionableSuggestion` and the shared mutations

Two files currently duplicate `actOnSuggestion`/`dismissSuggestion` verbatim (`useEntityContext.ts:108-159` has a comment admitting the copy). The new hook would be a third copy. Also, `isActionableSuggestion` lives in a React component file and the pure policy module must not import from a component.

**Files:**
- Create: `src/lib/assistant/actionable.ts`, `src/lib/assistant/suggestionMutations.ts`
- Modify: `src/components/schedule/ProactiveSuggestionChips.tsx`, `src/hooks/useEntityContext.ts`, `src/hooks/useProactiveSuggestions.ts`

**Interfaces:**
- Produces: `isActionableSuggestion(s, opts) => boolean`; `actOnSuggestionDb(...)`, `dismissSuggestionDb(id)`, `snoozeSuggestionDb(id, until)`, `markSuggestionSeenDb(id, urgency)`.

- [ ] **Step 1: Create `src/lib/assistant/actionable.ts`**

Move the function and its doc comment verbatim out of `ProactiveSuggestionChips.tsx:41-58`:

```ts
import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'

/**
 * A suggestion's chip is only worth rendering if its click handler actually
 * does something. `someday`/`stale`/`guided_chat` are no-ops in
 * ProactiveSuggestionChips.handleClick when the corresponding optional prop
 * (onPush/onDelete/onOpenGuidedChat) is absent — callers must filter those
 * out themselves before rendering (and before any top-N slice, so a dead
 * suggestion can't shadow a live one).
 */
export function isActionableSuggestion(
  s: ProactiveSuggestion,
  opts: { hasPush?: boolean; hasDelete?: boolean; hasGuidedChat?: boolean } = {}
): boolean {
  const actionType = s.actionType || s.suggestionType
  if (actionType === 'someday') return !!opts.hasPush
  if (actionType === 'stale') return !!opts.hasDelete
  if (actionType === 'guided_chat') return !!opts.hasGuidedChat
  return true
}
```

- [ ] **Step 2: Re-export from the component so existing imports keep working**

In `ProactiveSuggestionChips.tsx`, delete the function and its comment (lines 41-58) and add near the top:

```ts
import { isActionableSuggestion } from '@/lib/assistant/actionable'

// Re-exported: several call sites import this from here. Canonical home is
// @/lib/assistant/actionable (a pure policy module can't import from a component).
export { isActionableSuggestion }
```

- [ ] **Step 3: Create `src/lib/assistant/suggestionMutations.ts`**

```ts
import { supabase } from '@/lib/supabase'
import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'

/**
 * The DB writes for a suggestion's lifecycle, in one place. Previously
 * duplicated verbatim between useProactiveSuggestions and useEntityContext.
 * These are plain async functions, not hooks — callers own their own optimistic
 * state updates.
 */

/** Mark acted + append to action_history. */
export async function actOnSuggestionDb(
  userId: string,
  suggestion: ProactiveSuggestion,
  actionDetail?: string,
  outcome?: string,
): Promise<void> {
  const now = new Date().toISOString()
  await supabase
    .from('proactive_suggestions')
    .update({ status: 'acted', acted_at: now, updated_at: now })
    .eq('id', suggestion.id)

  await supabase.from('action_history').insert({
    user_id: userId,
    entity_type: suggestion.entityType,
    entity_id: suggestion.entityId,
    action_type: suggestion.actionType || suggestion.suggestionType,
    detail: actionDetail || suggestion.title,
    outcome: outcome || null,
  })
}

export async function dismissSuggestionDb(suggestionId: string): Promise<void> {
  const now = new Date().toISOString()
  await supabase
    .from('proactive_suggestions')
    .update({ status: 'dismissed', dismissed_at: now, updated_at: now })
    .eq('id', suggestionId)
}

/** "Not now" — row stays active, just muted until `until`. */
export async function snoozeSuggestionDb(suggestionId: string, until: Date): Promise<void> {
  await supabase
    .from('proactive_suggestions')
    .update({ snoozed_until: until.toISOString(), updated_at: new Date().toISOString() })
    .eq('id', suggestionId)
}

/**
 * Record that an UNPROMPTED surface showed this. Anchored chips must never call
 * this — conflating "you looked at the entity" with "the assistant interrupted
 * you" would poison the signal seen_at exists to capture.
 * Guarded so it only ever writes once: `is null` in the filter.
 */
export async function markSuggestionSeenDb(suggestionId: string, urgency: number): Promise<void> {
  await supabase
    .from('proactive_suggestions')
    .update({ seen_at: new Date().toISOString(), seen_urgency: urgency })
    .eq('id', suggestionId)
    .is('seen_at', null)
}
```

- [ ] **Step 4: Rewrite the two duplicated call sites**

In `useEntityContext.ts`, replace the bodies of `actOnSuggestion` (`:111-145`) and `dismissSuggestion` (`:148-159`) — deleting the "Copied exactly from..." comment:

```ts
  const actOnSuggestion = useCallback(async (
    suggestionId: string,
    actionDetail?: string,
    outcome?: string,
  ) => {
    if (!user) return
    const suggestion = suggestions.find(s => s.id === suggestionId)
    if (!suggestion) return
    await actOnSuggestionDb(user.id, suggestion, actionDetail, outcome)
    setSuggestions(prev => prev.filter(s => s.id !== suggestionId))
  }, [user, suggestions])

  const dismissSuggestion = useCallback(async (suggestionId: string) => {
    await dismissSuggestionDb(suggestionId)
    setSuggestions(prev => prev.filter(s => s.id !== suggestionId))
  }, [])
```

Apply the equivalent change to `useProactiveSuggestions.ts:63-111`, preserving its existing optimistic-update behavior exactly.

- [ ] **Step 5: Verify nothing regressed**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no new failures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/assistant/actionable.ts src/lib/assistant/suggestionMutations.ts src/components/schedule/ProactiveSuggestionChips.tsx src/hooks/useEntityContext.ts src/hooks/useProactiveSuggestions.ts
git commit -m "refactor(assistant): one home for actionable guard + suggestion mutations"
```

---

### Task 3: `urgency.ts`

**Files:**
- Create: `src/lib/assistant/urgency.ts`, `src/lib/assistant/urgency.test.ts`

**Interfaces:**
- Produces: `UrgencyInput`, `UrgencyFacts`, `deriveUrgencyFacts(input, now) => UrgencyFacts`, `computeUrgency(facts) => number`, `CRITICAL_URGENCY = 90`.

Split into two pure functions: `deriveUrgencyFacts` converts absolute timestamps to relative numbers using `now`; `computeUrgency` scores the relative numbers with no clock at all. That makes the scoring truth table testable without any date fixtures.

- [ ] **Step 1: Write the failing test**

Create `src/lib/assistant/urgency.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeUrgency, deriveUrgencyFacts, CRITICAL_URGENCY } from './urgency'

describe('computeUrgency', () => {
  it('scores nothing when there is no time pressure', () => {
    expect(computeUrgency({})).toBe(0)
  })

  it('scores an imminent event at the critical band', () => {
    expect(computeUrgency({ eventStartsInMinutes: 30 })).toBe(90)
    expect(computeUrgency({ eventStartsInMinutes: 30 })).toBeGreaterThanOrEqual(CRITICAL_URGENCY)
  })

  it('does not treat an event beyond 90 minutes as time pressure', () => {
    expect(computeUrgency({ eventStartsInMinutes: 91 })).toBe(0)
  })

  it('ignores events that already started', () => {
    expect(computeUrgency({ eventStartsInMinutes: -5 })).toBe(0)
  })

  it('scales overdue by days and caps at 85', () => {
    expect(computeUrgency({ daysOverdue: 0 })).toBe(60)
    expect(computeUrgency({ daysOverdue: 3 })).toBe(69)
    expect(computeUrgency({ daysOverdue: 400 })).toBe(85)
  })

  it('scales cadence lateness and caps at 80', () => {
    expect(computeUrgency({ cadenceWeeksLate: 0 })).toBe(50)
    expect(computeUrgency({ cadenceWeeksLate: 2 })).toBe(70)
    expect(computeUrgency({ cadenceWeeksLate: 99 })).toBe(80)
  })

  it('scores due-today and long waits', () => {
    expect(computeUrgency({ dueToday: true })).toBe(55)
    expect(computeUrgency({ waitingDays: 7 })).toBe(45)
    expect(computeUrgency({ waitingDays: 6 })).toBe(0)
  })

  it('takes the MAX of signals, never the sum', () => {
    // Three signals at once: 55 + 45 + 60 would be 160 if summed.
    const u = computeUrgency({ dueToday: true, waitingDays: 10, daysOverdue: 0 })
    expect(u).toBe(60)
  })

  it('applies defer_count as a weak modifier that cannot alone cross a floor', () => {
    // The Today floor is 55. A deferred-but-not-time-pressured item stays quiet.
    expect(computeUrgency({ deferCount: 9 })).toBe(5)
    expect(computeUrgency({ dueToday: true, deferCount: 3 })).toBe(60)
  })

  it('clamps to 0..100', () => {
    expect(computeUrgency({ eventStartsInMinutes: 1, deferCount: 50 })).toBe(95)
  })
})

describe('deriveUrgencyFacts', () => {
  const now = new Date('2026-07-30T09:00:00')

  it('converts an event timestamp to minutes away', () => {
    const f = deriveUrgencyFacts({ eventStartAt: '2026-07-30T10:00:00' }, now)
    expect(f.eventStartsInMinutes).toBe(60)
  })

  it('counts whole days overdue', () => {
    const f = deriveUrgencyFacts({ dueAt: '2026-07-28T09:00:00' }, now)
    expect(f.daysOverdue).toBe(2)
  })

  it('marks due-today without marking it overdue', () => {
    const f = deriveUrgencyFacts({ dueAt: '2026-07-30T17:00:00' }, now)
    expect(f.dueToday).toBe(true)
    expect(f.daysOverdue).toBeNull()
  })

  it('passes cadence lateness through', () => {
    const f = deriveUrgencyFacts({ cadenceDue: { weeksLate: 3 } }, now)
    expect(f.cadenceWeeksLate).toBe(3)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/assistant/urgency.test.ts`
Expected: FAIL — cannot resolve `./urgency`.

- [ ] **Step 3: Implement**

Create `src/lib/assistant/urgency.ts`:

```ts
// Deterministic urgency for the unprompted delivery tier.
//
// Rules, never the model. The engine already runs an LLM tier and it would be
// easy to ask it for a priority number, but model-assigned urgency is
// uncalibrated, drifts between runs, and can't be debugged when a suggestion
// shouts on a Tuesday for no reason. This follows the precedent in
// lib/today/proposeOrder.ts, which refuses to rank without signal.
//
// `confidence` answers "is this suggestion correct". `urgency` answers "does it
// matter now". Never blend them into one score: blending lets a 0.99-confidence
// trivial item outrank a genuinely late one and makes "why is this at the top"
// unanswerable.

/** Urgency at or above this bypasses budget, cooldown, and the DND window. */
export const CRITICAL_URGENCY = 90

/** Only an event starting within this many minutes reaches the critical band. */
const IMMINENT_EVENT_MINUTES = 90

/** Absolute inputs, as stored. */
export interface UrgencyInput {
  eventStartAt?: string | null
  dueAt?: string | null
  waitingSince?: string | null
  deferCount?: number | null
  cadenceDue?: { weeksLate: number } | null
}

/** Relative facts — no clock needed to score these. */
export interface UrgencyFacts {
  eventStartsInMinutes?: number | null
  daysOverdue?: number | null
  dueToday?: boolean
  waitingDays?: number | null
  deferCount?: number | null
  cadenceWeeksLate?: number | null
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

function wholeDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000)
}

export function deriveUrgencyFacts(input: UrgencyInput, now: Date): UrgencyFacts {
  const facts: UrgencyFacts = {
    deferCount: input.deferCount ?? null,
    cadenceWeeksLate: input.cadenceDue ? input.cadenceDue.weeksLate : null,
    eventStartsInMinutes: null,
    daysOverdue: null,
    dueToday: false,
    waitingDays: null,
  }

  if (input.eventStartAt) {
    const start = new Date(input.eventStartAt)
    if (!Number.isNaN(start.getTime())) {
      facts.eventStartsInMinutes = Math.round((start.getTime() - now.getTime()) / 60_000)
    }
  }

  if (input.dueAt) {
    const due = new Date(input.dueAt)
    if (!Number.isNaN(due.getTime())) {
      const days = wholeDaysBetween(due, now)
      if (days > 0) facts.daysOverdue = days
      else if (days === 0) facts.dueToday = true
    }
  }

  if (input.waitingSince) {
    const since = new Date(input.waitingSince)
    if (!Number.isNaN(since.getTime())) {
      facts.waitingDays = Math.max(0, wholeDaysBetween(since, now))
    }
  }

  return facts
}

/**
 * MAX of time-pressure signals plus one weak modifier — never a running sum, so
 * no combination of signals can produce a runaway score.
 */
export function computeUrgency(facts: UrgencyFacts): number {
  const mins = facts.eventStartsInMinutes
  const imminent = mins != null && mins >= 0 && mins <= IMMINENT_EVENT_MINUTES

  const timePressure = Math.max(
    imminent ? 90 : 0,
    facts.daysOverdue != null && facts.daysOverdue >= 0
      ? Math.min(60 + facts.daysOverdue * 3, 85)
      : 0,
    facts.cadenceWeeksLate != null && facts.cadenceWeeksLate >= 0
      ? Math.min(50 + facts.cadenceWeeksLate * 10, 80)
      : 0,
    facts.dueToday ? 55 : 0,
    (facts.waitingDays ?? 0) >= 7 ? 45 : 0,
  )

  // Deliberately weak. Repeated deferral is ambiguous — it can mean "this keeps
  // mattering" or "I keep avoiding it" — and an avoidance signal must never
  // become a shouting signal.
  const modifier = (facts.deferCount ?? 0) >= 3 ? 5 : 0

  return clamp(timePressure + modifier, 0, 100)
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/assistant/urgency.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assistant/urgency.ts src/lib/assistant/urgency.test.ts
git commit -m "feat(assistant): rules-based urgency score"
```

---

### Task 4: `interruptionWindow.ts`

**Files:**
- Create: `src/lib/assistant/interruptionWindow.ts`, `src/lib/assistant/interruptionWindow.test.ts`

**Interfaces:**
- Produces: `inInterruptionWindow(now: Date) => boolean`, `INTERRUPT_START_HOUR = 7`, `INTERRUPT_END_HOUR = 21`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { inInterruptionWindow } from './interruptionWindow'
import { isQuietHours } from '@/lib/quietHours'

const at = (h: number, m = 0) => new Date(2026, 6, 30, h, m, 0, 0)

describe('inInterruptionWindow', () => {
  it('allows the working day', () => {
    expect(inInterruptionWindow(at(7))).toBe(true)
    expect(inInterruptionWindow(at(12))).toBe(true)
    expect(inInterruptionWindow(at(20, 59))).toBe(true)
  })

  it('is closed before 07:00 and from 21:00', () => {
    expect(inInterruptionWindow(at(6, 59))).toBe(false)
    expect(inInterruptionWindow(at(21))).toBe(false)
    expect(inInterruptionWindow(at(23, 30))).toBe(false)
    expect(inInterruptionWindow(at(3))).toBe(false)
  })

  it('is a DIFFERENT concept from quietHours', () => {
    // quietHours is a Supabase-egress guard (23:00-06:00). 22:00 is outside it
    // but must still be outside the interruption window. Keeping these separate
    // is deliberate: widening quietHours would change wall polling behavior.
    expect(isQuietHours(at(22))).toBe(false)
    expect(inInterruptionWindow(at(22))).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/lib/assistant/interruptionWindow.test.ts`
Expected: FAIL — cannot resolve `./interruptionWindow`.

- [ ] **Step 3: Implement**

```ts
// When the assistant is allowed to interrupt unasked.
//
// DELIBERATELY SEPARATE from lib/quietHours.ts. That module is a Supabase-egress
// cost guard (its own header explains it stopped ~540 REST req/hour at 3am);
// its consumers are pollers, and widening it into a do-not-disturb policy would
// change wall refresh behavior as a side effect and risk re-opening the egress
// problem. They may share a similar window; they are not the same concept.

export const INTERRUPT_START_HOUR = 7 // 07:00, inclusive
export const INTERRUPT_END_HOUR = 21 // 21:00, exclusive

/** True when unprompted delivery is permitted for surfaces that respect the window. */
export function inInterruptionWindow(now: Date = new Date()): boolean {
  const h = now.getHours()
  return h >= INTERRUPT_START_HOUR && h < INTERRUPT_END_HOUR
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/assistant/interruptionWindow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assistant/interruptionWindow.ts src/lib/assistant/interruptionWindow.test.ts
git commit -m "feat(assistant): interruption window, separate from the egress guard"
```

---

### Task 5: `interruptionPolicy.ts` — the single gate

**Files:**
- Create: `src/lib/assistant/interruptionPolicy.ts`, `src/lib/assistant/interruptionPolicy.test.ts`

**Interfaces:**
- Consumes: `CRITICAL_URGENCY` (Task 3), `inInterruptionWindow` (Task 4), `isActionableSuggestion` (Task 2).
- Produces: `SurfaceId`, `SurfaceProfile`, `SURFACES`, `RejectReason`, `InterruptState`, `InterruptDecision`, `mayInterrupt(...)`, `DAILY_INTERRUPT_BUDGET = 8`, `SEEN_COOLDOWN_HOURS = 4`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { mayInterrupt, SURFACES, DAILY_INTERRUPT_BUDGET } from './interruptionPolicy'
import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'

const base: ProactiveSuggestion = {
  id: 's1', userId: 'u1', entityType: 'task', entityId: 't1',
  suggestionType: 'call', title: 'Call Camp Notre Dame', confidence: 0.9,
  actionType: 'call', actionPayload: { phoneNumber: '555' }, status: 'active',
  suggestionKey: 'task:t1:call', generatedAt: '2026-07-30T06:30:00',
  createdAt: '2026-07-30T06:30:00', updatedAt: '2026-07-30T06:30:00',
}
const noon = new Date(2026, 6, 30, 12, 0, 0)
const state = { budgetSpent: 0 }

describe('mayInterrupt', () => {
  it('allows a high-urgency active suggestion on the wall', () => {
    const d = mayInterrupt(base, 75, SURFACES.wall, state, noon)
    expect(d.allow).toBe(true)
  })

  it('rejects below the surface floor', () => {
    const d = mayInterrupt(base, 69, SURFACES.wall, state, noon)
    expect(d).toEqual({ allow: false, reason: 'below_floor' })
  })

  it('uses a lower floor for Today than for the wall', () => {
    expect(mayInterrupt(base, 60, SURFACES.today, state, noon).allow).toBe(true)
    expect(mayInterrupt(base, 60, SURFACES.wall, state, noon).allow).toBe(false)
  })

  it('rejects non-active suggestions', () => {
    const d = mayInterrupt({ ...base, status: 'dismissed' }, 95, SURFACES.wall, state, noon)
    expect(d).toEqual({ allow: false, reason: 'not_active' })
  })

  it('rejects unactionable types before they can spend budget', () => {
    const dead = { ...base, suggestionType: 'someday' as const, actionType: undefined }
    const d = mayInterrupt(dead, 95, SURFACES.wall, state, noon)
    expect(d).toEqual({ allow: false, reason: 'not_actionable' })
  })

  it('rejects while snoozed, and allows once the snooze expires', () => {
    const snoozed = { ...base, snoozedUntil: '2026-07-30T16:00:00' }
    expect(mayInterrupt(snoozed, 75, SURFACES.wall, state, noon))
      .toEqual({ allow: false, reason: 'snoozed' })
    const expired = { ...base, snoozedUntil: '2026-07-30T11:00:00' }
    expect(mayInterrupt(expired, 75, SURFACES.wall, state, noon).allow).toBe(true)
  })

  it('rejects outside the window on the wall but not on Today', () => {
    const late = new Date(2026, 6, 30, 22, 0, 0)
    expect(mayInterrupt(base, 75, SURFACES.wall, state, late))
      .toEqual({ allow: false, reason: 'outside_window' })
    // Today is user-initiated: you opened it, so you asked.
    expect(mayInterrupt(base, 75, SURFACES.today, state, late).allow).toBe(true)
  })

  it('rejects when the global budget is spent', () => {
    const spent = { budgetSpent: DAILY_INTERRUPT_BUDGET }
    expect(mayInterrupt(base, 75, SURFACES.wall, spent, noon))
      .toEqual({ allow: false, reason: 'budget_spent' })
  })

  it('rejects a seen-but-unacted item inside the cooldown', () => {
    const seen = { ...base, seenAt: '2026-07-30T10:00:00', seenUrgency: 75 }
    expect(mayInterrupt(seen, 75, SURFACES.wall, state, noon))
      .toEqual({ allow: false, reason: 'cooldown' })
  })

  it('allows a seen item once the cooldown has passed', () => {
    const seen = { ...base, seenAt: '2026-07-30T07:00:00', seenUrgency: 75 }
    expect(mayInterrupt(seen, 75, SURFACES.wall, state, noon).allow).toBe(true)
  })

  it('lets escalation beat the cooldown', () => {
    // Seen at 62 this morning, now 78 because it went overdue.
    const seen = { ...base, seenAt: '2026-07-30T10:00:00', seenUrgency: 62 }
    expect(mayInterrupt(seen, 78, SURFACES.wall, state, noon).allow).toBe(true)
  })

  it('lets critical bypass budget, cooldown, AND the window', () => {
    const seen = { ...base, seenAt: '2026-07-30T11:55:00', seenUrgency: 90 }
    const late = new Date(2026, 6, 30, 21, 30, 0)
    const d = mayInterrupt(seen, 95, SURFACES.wall, { budgetSpent: 99 }, late)
    expect(d).toEqual({ allow: true, urgency: 95, critical: true, reason: 'allowed' })
  })

  it('never lets critical bypass the actionable or active checks', () => {
    expect(mayInterrupt({ ...base, status: 'expired' }, 95, SURFACES.wall, state, noon).allow).toBe(false)
  })

  it('reports the MOST SPECIFIC reason when several apply', () => {
    // Snoozed AND below floor AND outside window AND budget spent.
    const bad = { ...base, snoozedUntil: '2026-07-30T23:00:00' }
    const late = new Date(2026, 6, 30, 22, 0, 0)
    const d = mayInterrupt(bad, 10, SURFACES.wall, { budgetSpent: 99 }, late)
    expect(d).toEqual({ allow: false, reason: 'snoozed' })
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/lib/assistant/interruptionPolicy.test.ts`
Expected: FAIL — cannot resolve `./interruptionPolicy`.

- [ ] **Step 3: Implement**

```ts
// The one gate for unprompted delivery. Pure: no DB, no clock of its own, no
// React. `now` and `state` are injected so the whole truth table is fixture-
// testable, including the boundaries — which is where this class of code breaks.

import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'
import { isActionableSuggestion } from './actionable'
import { CRITICAL_URGENCY } from './urgency'
import { inInterruptionWindow } from './interruptionWindow'

/** Attention is ONE resource, so there is one budget — not a per-surface budget
 *  that sums to more than exists. Counted as distinct suggestions seen today. */
export const DAILY_INTERRUPT_BUDGET = 8

/** How long a seen-but-unacted suggestion stays quiet before it may reappear. */
export const SEEN_COOLDOWN_HOURS = 4

export type SurfaceId = 'wall' | 'today'

export interface SurfaceProfile {
  id: SurfaceId
  urgencyFloor: number
  /** How many may show at once on this surface. */
  concurrent: number
  respectsWindow: boolean
}

/**
 * The asymmetry is deliberate. The wall speaks when you didn't ask — high floor,
 * one line, never a stack, and it honors the DND window. Today you opened on
 * purpose, so it gets a lower floor, may show three, and is exempt from the
 * window. Today still CONSUMES budget: attention spent is attention spent.
 */
export const SURFACES: Record<SurfaceId, SurfaceProfile> = {
  wall: { id: 'wall', urgencyFloor: 70, concurrent: 1, respectsWindow: true },
  today: { id: 'today', urgencyFloor: 55, concurrent: 3, respectsWindow: false },
}

export type RejectReason =
  | 'not_actionable'
  | 'not_active'
  | 'snoozed'
  | 'below_floor'
  | 'outside_window'
  | 'budget_spent'
  | 'cooldown'

export interface InterruptState {
  /** Distinct suggestions already seen today, across all surfaces. */
  budgetSpent: number
}

export type InterruptDecision =
  | { allow: true; urgency: number; critical: boolean; reason: 'allowed' }
  | { allow: false; reason: RejectReason }

/**
 * Check order is FIXED so a rejection reason is always the most specific true
 * one — that is what makes `?why=1` useful rather than misleading.
 */
export function mayInterrupt(
  s: ProactiveSuggestion,
  urgency: number,
  surface: SurfaceProfile,
  state: InterruptState,
  now: Date,
): InterruptDecision {
  // These two are never bypassable, not even by critical: a dead chip is a dead
  // tap, and an already-handled suggestion must not resurface.
  if (!isActionableSuggestion(s)) return { allow: false, reason: 'not_actionable' }
  if (s.status !== 'active') return { allow: false, reason: 'not_active' }

  if (s.snoozedUntil && new Date(s.snoozedUntil).getTime() > now.getTime()) {
    return { allow: false, reason: 'snoozed' }
  }

  if (urgency < surface.urgencyFloor) return { allow: false, reason: 'below_floor' }

  // Reachable only by "a timed event starts within 90 minutes". One named
  // constant, one entry condition, so it can't quietly become the common path.
  const critical = urgency >= CRITICAL_URGENCY

  if (!critical) {
    if (surface.respectsWindow && !inInterruptionWindow(now)) {
      return { allow: false, reason: 'outside_window' }
    }
    if (state.budgetSpent >= DAILY_INTERRUPT_BUDGET) {
      return { allow: false, reason: 'budget_spent' }
    }
    if (s.seenAt) {
      const hoursSinceSeen = (now.getTime() - new Date(s.seenAt).getTime()) / 3_600_000
      // Escalation beats cooldown: this is the payoff for recording seen_urgency —
      // the system can tell "you ignored this" from "you saw a calmer version".
      const escalated = urgency > (s.seenUrgency ?? 0)
      if (hoursSinceSeen < SEEN_COOLDOWN_HOURS && !escalated) {
        return { allow: false, reason: 'cooldown' }
      }
    }
  }

  return { allow: true, urgency, critical, reason: 'allowed' }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/assistant/interruptionPolicy.test.ts`
Expected: PASS, all 14 cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assistant/interruptionPolicy.ts src/lib/assistant/interruptionPolicy.test.ts
git commit -m "feat(assistant): interruption policy gate"
```

---

### Task 6: `cadenceDue.ts` — state-aware planning cadence

`getDueSession` (`src/lib/cadence/config.ts:136`) fires because today is the configured anchor day. It has no idea whether the ritual was actually done, so it cannot tell "due" from "three weeks overdue". `planning_sessions` rows keyed `(author_id, horizon, period_token)` are the completion record.

**Files:**
- Create: `src/lib/assistant/cadenceDue.ts`, `src/lib/assistant/cadenceDue.test.ts`

**Interfaces:**
- Consumes: `CadenceConfig`, `SessionHorizon`, `weekStartAnchor`, `weekToken` from `@/lib/cadence/config`.
- Produces: `CadenceOverdue { kind: SessionHorizon; token: string; label: string; weeksLate: number }`, `computeCadenceOverdue(config, now, completedTokens: Set<string>) => CadenceOverdue | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { computeCadenceOverdue } from './cadenceDue'
import { DEFAULT_CADENCE } from '@/lib/cadence/config'

// Sunday 2026-07-26 is the week anchor; Thursday 2026-07-30 is 0 weeks late.
const thu = new Date(2026, 6, 30, 9, 0, 0)

describe('computeCadenceOverdue', () => {
  it('returns null when the current period was already planned', () => {
    const done = new Set(['week:2026-7-26', 'month:2026-7'])
    expect(computeCadenceOverdue(DEFAULT_CADENCE, thu, done)).toBeNull()
  })

  it('reports the week as due when its session is missing', () => {
    const r = computeCadenceOverdue(DEFAULT_CADENCE, thu, new Set(['month:2026-7']))
    expect(r).toMatchObject({ kind: 'week', token: '2026-7-26', weeksLate: 0 })
  })

  it('prefers the larger unplanned ritual', () => {
    // Neither the month nor the week is planned — the month is the bigger ask.
    const r = computeCadenceOverdue(DEFAULT_CADENCE, thu, new Set())
    expect(r?.kind).toBe('month')
  })

  it('counts weeks late for an unplanned month', () => {
    // 2026-07-30 is in the 5th week of July; the month anchor was the 1st.
    const r = computeCadenceOverdue(DEFAULT_CADENCE, thu, new Set())
    expect(r!.weeksLate).toBeGreaterThanOrEqual(4)
  })

  it('respects weeklyNudgeEnabled=false for the weekly ritual only', () => {
    const cfg = { ...DEFAULT_CADENCE, weeklyNudgeEnabled: false }
    expect(computeCadenceOverdue(cfg, thu, new Set(['month:2026-7']))).toBeNull()
    expect(computeCadenceOverdue(cfg, thu, new Set())?.kind).toBe('month')
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/lib/assistant/cadenceDue.test.ts`
Expected: FAIL — cannot resolve `./cadenceDue`.

- [ ] **Step 3: Implement**

```ts
// "Which planning ritual is overdue, and by how much" — the state-aware successor
// to getDueSession's day-of-week check.
//
// getDueSession answers "is today the anchor day". That fires on Sunday whether
// or not last Sunday's session ever happened. This answers the question the
// assistant actually needs: is the CURRENT period's ritual undone, and how late
// is it? Completion comes from planning_sessions rows, keyed
// `${horizon}:${period_token}`.

import type { CadenceConfig, SessionHorizon } from '@/lib/cadence/config'
import { weekStartAnchor, weekToken } from '@/lib/cadence/config'

export interface CadenceOverdue {
  kind: SessionHorizon
  token: string
  /** Human label for the CTA, matching DueSession.label wording. */
  label: string
  /** Whole weeks between the period's anchor and now. 0 = due, not yet late. */
  weeksLate: number
}

const WEEK_MS = 7 * 86_400_000

function wholeWeeksSince(anchor: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / WEEK_MS))
}

/** Meteorological season index, matching config.ts's seasonToken (Dec→S0). */
function seasonAnchor(now: Date): { token: string; start: Date } {
  const s = Math.floor(((now.getMonth() + 1) % 12) / 3)
  const startMonth = [11, 2, 5, 8][s]
  const year = startMonth === 11 && now.getMonth() !== 11 ? now.getFullYear() - 1 : now.getFullYear()
  return { token: `${now.getFullYear()}-S${s}`, start: new Date(year, startMonth, 1) }
}

/**
 * Priority year → season → month → week, so the bigger unplanned ritual wins.
 * Returns null when every ritual for the current periods is already recorded.
 */
export function computeCadenceOverdue(
  config: CadenceConfig,
  now: Date,
  completedTokens: Set<string>,
): CadenceOverdue | null {
  const yearToken = `${now.getFullYear()}`
  if (!completedTokens.has(`year:${yearToken}`)) {
    // Annual anchor is September 1 (see config.ts getDueSession). Before it, the
    // year's ritual isn't yet owed.
    const anchor = new Date(now.getFullYear(), 8, 1)
    if (now >= anchor) {
      return { kind: 'year', token: yearToken, label: 'the year', weeksLate: wholeWeeksSince(anchor, now) }
    }
  }

  const season = seasonAnchor(now)
  if (!completedTokens.has(`season:${season.token}`)) {
    return {
      kind: 'season', token: season.token, label: 'the season',
      weeksLate: wholeWeeksSince(season.start, now),
    }
  }

  const monthToken = `${now.getFullYear()}-${now.getMonth() + 1}`
  if (!completedTokens.has(`month:${monthToken}`)) {
    return {
      kind: 'month', token: monthToken, label: 'the month',
      weeksLate: wholeWeeksSince(new Date(now.getFullYear(), now.getMonth(), 1), now),
    }
  }

  if (config.weeklyNudgeEnabled) {
    const wToken = weekToken(now, config.weekStartsOn)
    if (!completedTokens.has(`week:${wToken}`)) {
      return {
        kind: 'week', token: wToken, label: 'the week',
        weeksLate: wholeWeeksSince(weekStartAnchor(now, config.weekStartsOn), now),
      }
    }
  }

  return null
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/assistant/cadenceDue.test.ts`
Expected: PASS. If the season/year fixtures disagree with `config.ts`'s `seasonToken`, fix `cadenceDue.ts` to match `config.ts` — `config.ts` is canonical for token format.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assistant/cadenceDue.ts src/lib/assistant/cadenceDue.test.ts
git commit -m "feat(assistant): state-aware planning cadence overdue"
```

---

### Task 7: Engine writes urgency + emits `plan_session`

**Files:**
- Create: `supabase/functions/_shared/urgency.ts`, `src/lib/assistant/urgencyTwin.test.ts`
- Modify: `supabase/functions/proactive-engine/index.ts`

**Interfaces:**
- Consumes: `computeUrgency`/`deriveUrgencyFacts` shapes from Task 3.
- Produces: `urgency` written on every upserted row; `plan_session` suggestions.

This follows the existing twin-validator precedent (`_shared/facets.ts` ↔ `src/types/facets.ts`). Edge functions are Deno and cannot import from `src/`, so the module is duplicated and a test pins them together.

- [ ] **Step 1: Create the Deno twin**

Copy `src/lib/assistant/urgency.ts` verbatim to `supabase/functions/_shared/urgency.ts`, deleting only the `@/`-style imports (there are none). Add at the top:

```ts
// TWIN of src/lib/assistant/urgency.ts. Edge functions are Deno and cannot
// import from src/. Keep byte-identical below this header — urgencyTwin.test.ts
// fails if the two disagree on any fixture. Same pattern as _shared/facets.ts.
```

- [ ] **Step 2: Write the twin-parity test**

Create `src/lib/assistant/urgencyTwin.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeUrgency as canonical, deriveUrgencyFacts as deriveCanonical } from './urgency'
// Plain TS, no Deno APIs — importable by vitest directly.
import {
  computeUrgency as twin,
  deriveUrgencyFacts as deriveTwin,
} from '../../../supabase/functions/_shared/urgency'
import type { UrgencyFacts } from './urgency'

const FIXTURES: UrgencyFacts[] = [
  {},
  { eventStartsInMinutes: 30 },
  { eventStartsInMinutes: 91 },
  { eventStartsInMinutes: -5 },
  { daysOverdue: 0 },
  { daysOverdue: 3 },
  { daysOverdue: 400 },
  { cadenceWeeksLate: 0 },
  { cadenceWeeksLate: 2 },
  { cadenceWeeksLate: 99 },
  { dueToday: true },
  { waitingDays: 7 },
  { waitingDays: 6 },
  { deferCount: 9 },
  { dueToday: true, waitingDays: 10, daysOverdue: 0 },
  { eventStartsInMinutes: 1, deferCount: 50 },
]

describe('edge twin stays in sync with canonical urgency', () => {
  it.each(FIXTURES)('scores %j identically', (facts) => {
    expect(twin(facts)).toBe(canonical(facts))
  })

  it('derives facts identically', () => {
    const now = new Date('2026-07-30T09:00:00')
    const input = { eventStartAt: '2026-07-30T10:00:00', dueAt: '2026-07-28T09:00:00', deferCount: 4 }
    expect(deriveTwin(input, now)).toEqual(deriveCanonical(input, now))
  })
})
```

- [ ] **Step 3: Run it**

Run: `npx vitest run src/lib/assistant/urgencyTwin.test.ts`
Expected: PASS. If the relative import path fails to resolve, adjust it to the real depth from `src/lib/assistant/` to `supabase/functions/_shared/` — do not change the twin's contents to make it pass.

- [ ] **Step 4: Write urgency on upsert in the engine**

In `supabase/functions/proactive-engine/index.ts`, find the upsert block (search for `onConflict: 'user_id,suggestion_key'`, around line 829-866). Import the twin:

```ts
import { computeUrgency, deriveUrgencyFacts } from '../_shared/urgency.ts'
```

For each suggestion being upserted, derive facts from the entity the suggestion is about (the bundle's `time` part already carries due dates, event starts, `defer_count`, and `waiting_since`) and add `urgency` to the row payload:

```ts
  urgency: computeUrgency(deriveUrgencyFacts({
    eventStartAt: bundleTime?.eventStartAt ?? null,
    dueAt: bundleTime?.dueAt ?? null,
    waitingSince: bundleTime?.waitingSince ?? null,
    deferCount: bundleTime?.deferCount ?? null,
    cadenceDue: null,
  }, new Date())),
```

Use the actual field names present on the bundle's `time` part — read `supabase/functions/_shared/context-graph/types.ts` first and map to whatever it really calls them. If a field does not exist on the bundle, pass `null` rather than inventing it.

- [ ] **Step 5: Emit `plan_session` suggestions**

Still in the engine, after the existing rule tier, add a rule that emits one `plan_session` suggestion when a ritual is overdue. Query `planning_sessions` for this user, build the completed-token set, and reuse the *same* precedence the client uses. Suggestion shape:

```ts
{
  entity_type: 'general',
  entity_id: `cadence:${overdue.kind}`,
  suggestion_type: 'plan_session',
  title: `Plan ${overdue.label}`,
  detail: overdue.weeksLate > 0
    ? `${overdue.weeksLate} week${overdue.weeksLate === 1 ? '' : 's'} since it was due`
    : 'Due now',
  confidence: 1,
  action_type: 'guided_chat',
  action_payload: { planHorizon: overdue.kind, token: overdue.token },
  suggestion_key: `cadence:${overdue.kind}:${overdue.token}`,
  urgency: computeUrgency({ cadenceWeeksLate: overdue.weeksLate }),
}
```

`suggestion_key` includes the token so a new period generates a fresh row rather than colliding with a dismissed one.

- [ ] **Step 6: Deploy the function and fire it manually**

```bash
npx supabase functions deploy proactive-engine --use-api
```

Then invoke it once for the real user (service-mode auth: `Bearer <service_role_key>` + body `{"user_id": "<uuid>"}`) and verify with a Management API query that new rows have non-null `urgency`:

```sql
select suggestion_type, urgency, seen_at, snoozed_until
from proactive_suggestions
where status = 'active' order by urgency desc nulls last limit 20;
```

Expected: `urgency` populated. Report the actual row output — do not assume.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/urgency.ts supabase/functions/proactive-engine/index.ts src/lib/assistant/urgencyTwin.test.ts
git commit -m "feat(engine): write urgency, emit plan_session for overdue rituals"
```

---

### Task 8: `useUnpromptedSuggestions`

**Files:**
- Create: `src/hooks/useUnpromptedSuggestions.ts`, `src/hooks/useUnpromptedSuggestions.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2-6.
- Produces:

```ts
export interface UnpromptedItem {
  suggestion: ProactiveSuggestion
  urgency: number
  critical: boolean
}
export interface UnpromptedResult {
  items: UnpromptedItem[]
  /** Populated only when ?why=1 — every considered suggestion with its verdict. */
  decisions: Array<{ id: string; title: string; urgency: number; reason: string }>
  snooze: (id: string, scope: 'now' | 'today') => Promise<void>
  act: (id: string, detail?: string, outcome?: string) => Promise<void>
  dismiss: (id: string) => Promise<void>
}
export function useUnpromptedSuggestions(surface: SurfaceId): UnpromptedResult
```

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useUnpromptedSuggestions.test.ts`. Mock `@/lib/supabase` and `@/hooks/useAuth` following the existing pattern in the repo (look at an existing hook test for the exact mock shape before writing this):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useUnpromptedSuggestions } from './useUnpromptedSuggestions'
import * as mutations from '@/lib/assistant/suggestionMutations'

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// Rows returned by the mocked query — one well above the Today floor.
const rows = [{
  id: 's1', user_id: 'u1', entity_type: 'task', entity_id: 't1',
  suggestion_type: 'call', title: 'Call Camp Notre Dame', detail: null,
  confidence: 0.9, action_type: 'call', action_payload: { phoneNumber: '555' },
  status: 'active', acted_at: null, dismissed_at: null, expires_at: null,
  suggestion_key: 'task:t1:call', generated_at: '2026-07-30T06:30:00',
  created_at: '2026-07-30T06:30:00', updated_at: '2026-07-30T06:30:00',
  urgency: 75, seen_at: null, seen_urgency: null, snoozed_until: null,
}]

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  },
}))

describe('useUnpromptedSuggestions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('marks seen exactly once, not per render', async () => {
    const spy = vi.spyOn(mutations, 'markSuggestionSeenDb').mockResolvedValue()
    const { result, rerender } = renderHook(() => useUnpromptedSuggestions('today'))
    await waitFor(() => expect(result.current.items.length).toBe(1))
    rerender()
    rerender()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('s1', expect.any(Number))
  })

  it('snoozes "now" about four hours out and "today" to tomorrow morning', async () => {
    const spy = vi.spyOn(mutations, 'snoozeSuggestionDb').mockResolvedValue()
    const { result } = renderHook(() => useUnpromptedSuggestions('today'))
    await waitFor(() => expect(result.current.items.length).toBe(1))

    await result.current.snooze('s1', 'now')
    const soon = spy.mock.calls[0][1] as Date
    const hours = (soon.getTime() - Date.now()) / 3_600_000
    expect(hours).toBeGreaterThan(3.9)
    expect(hours).toBeLessThan(4.1)

    await result.current.snooze('s1', 'today')
    const tomorrow = spy.mock.calls[1][1] as Date
    expect(tomorrow.getHours()).toBe(7)
    expect(tomorrow.getDate()).toBe(new Date().getDate() + 1)
  })
})
```

Also add, in `src/hooks/useEntityContext.test.ts` (create if absent), a test that the anchored hook never marks seen:

```ts
it('never writes seen_at — anchored delivery is not an interruption', async () => {
  const spy = vi.spyOn(mutations, 'markSuggestionSeenDb')
  renderHook(() => useEntityContext('task', 't1'))
  await waitFor(() => {})
  expect(spy).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/hooks/useUnpromptedSuggestions.test.ts`
Expected: FAIL — cannot resolve the hook.

- [ ] **Step 3: Implement the hook**

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { ProactiveSuggestion, ProactiveSuggestionRow } from '@/types/proactiveSuggestion'
import { rowToSuggestion } from '@/types/proactiveSuggestion'
import { computeUrgency, deriveUrgencyFacts } from '@/lib/assistant/urgency'
import { mayInterrupt, SURFACES, type SurfaceId } from '@/lib/assistant/interruptionPolicy'
import {
  actOnSuggestionDb, dismissSuggestionDb, snoozeSuggestionDb, markSuggestionSeenDb,
} from '@/lib/assistant/suggestionMutations'

export interface UnpromptedItem {
  suggestion: ProactiveSuggestion
  urgency: number
  critical: boolean
}

export interface UnpromptedResult {
  items: UnpromptedItem[]
  decisions: Array<{ id: string; title: string; urgency: number; reason: string }>
  snooze: (id: string, scope: 'now' | 'today') => Promise<void>
  act: (id: string, detail?: string, outcome?: string) => Promise<void>
  dismiss: (id: string) => Promise<void>
}

const SNOOZE_NOW_HOURS = 4

function snoozeTarget(scope: 'now' | 'today', now = new Date()): Date {
  if (scope === 'now') return new Date(now.getTime() + SNOOZE_NOW_HOURS * 3_600_000)
  const t = new Date(now)
  t.setDate(t.getDate() + 1)
  t.setHours(7, 0, 0, 0)
  return t
}

/**
 * The unprompted delivery tier: suggestions that may appear where the user did
 * NOT ask about that entity. Everything here is gated by mayInterrupt.
 *
 * Anchored delivery (ContextChips/useEntityContext) deliberately does NOT go
 * through this hook and never marks seen_at.
 */
export function useUnpromptedSuggestions(surface: SurfaceId): UnpromptedResult {
  const { user } = useAuth()
  const [rows, setRows] = useState<ProactiveSuggestion[]>([])
  const [budgetSpent, setBudgetSpent] = useState(0)
  const markedRef = useRef<Set<string>>(new Set())

  const fetchRows = useCallback(async () => {
    if (!user) { setRows([]); return }
    const { data, error } = await supabase
      .from('proactive_suggestions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('urgency', { ascending: false })
      .limit(50)
    if (error || !data) { setRows([]); return }
    const list = (data as ProactiveSuggestionRow[]).map(rowToSuggestion)
    setRows(list)
    // Budget = distinct suggestions already seen today, across all surfaces.
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
    setBudgetSpent(list.filter(s => s.seenAt && new Date(s.seenAt) >= startOfToday).length)
  }, [user])

  useEffect(() => { fetchRows() }, [fetchRows])

  const profile = SURFACES[surface]

  const { items, decisions } = useMemo(() => {
    const now = new Date()
    const state = { budgetSpent }
    const allowed: UnpromptedItem[] = []
    const log: UnpromptedResult['decisions'] = []

    for (const s of rows) {
      // Live recompute — the stored column is only a hint (engine runs every 6h).
      const urgency = computeUrgency(deriveUrgencyFacts({
        deferCount: null, eventStartAt: null, dueAt: null, waitingSince: null,
        cadenceDue: null,
      }, now)) || s.urgency || 0
      let decision
      try {
        decision = mayInterrupt(s, urgency, profile, state, now)
      } catch {
        decision = { allow: false, reason: 'not_actionable' as const } // fail closed
      }
      log.push({ id: s.id, title: s.title, urgency, reason: decision.reason })
      if (decision.allow) allowed.push({ suggestion: s, urgency, critical: decision.critical })
    }

    allowed.sort((a, b) =>
      b.urgency - a.urgency || b.suggestion.confidence - a.suggestion.confidence)
    return { items: allowed.slice(0, profile.concurrent), decisions: log }
  }, [rows, profile, budgetSpent])

  // Mark seen once per suggestion, guarded against re-render.
  useEffect(() => {
    for (const item of items) {
      if (markedRef.current.has(item.suggestion.id)) continue
      if (item.suggestion.seenAt) continue
      markedRef.current.add(item.suggestion.id)
      void markSuggestionSeenDb(item.suggestion.id, item.urgency)
    }
  }, [items])

  const snooze = useCallback(async (id: string, scope: 'now' | 'today') => {
    await snoozeSuggestionDb(id, snoozeTarget(scope))
    setRows(prev => prev.filter(s => s.id !== id))
  }, [])

  const act = useCallback(async (id: string, detail?: string, outcome?: string) => {
    if (!user) return
    const s = rows.find(r => r.id === id)
    if (!s) return
    await actOnSuggestionDb(user.id, s, detail, outcome)
    setRows(prev => prev.filter(r => r.id !== id))
  }, [user, rows])

  const dismiss = useCallback(async (id: string) => {
    await dismissSuggestionDb(id)
    setRows(prev => prev.filter(r => r.id !== id))
  }, [])

  return { items, decisions, snooze, act, dismiss }
}
```

**Note for the implementer:** the live-recompute block above is deliberately incomplete — it falls back to the stored `urgency` because the hook does not itself load the underlying task/event. Wire the real entity facts by accepting an optional `facts` resolver argument, e.g. `useUnpromptedSuggestions(surface, resolveFacts?)`, where the caller (which already has tasks and events loaded) supplies `UrgencyInput` per `entityId`. Implement that resolver parameter in this task; do not leave the fallback as the only path.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/hooks/useUnpromptedSuggestions.test.ts src/hooks/useEntityContext.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useUnpromptedSuggestions.ts src/hooks/useUnpromptedSuggestions.test.ts src/hooks/useEntityContext.test.ts
git commit -m "feat(assistant): useUnpromptedSuggestions with seen tracking and snooze"
```

---

### Task 9: Today band + delete the dead per-row path

**Files:**
- Create: `src/components/assistant/UnpromptedLines.tsx`
- Modify: `src/components/schedule/TodayView.tsx`, `src/components/schedule/TodaySectionList.tsx`, `src/components/schedule/ScheduleItem.tsx`

- [ ] **Step 1: Delete the dead path first**

In `ScheduleItem.tsx`, delete lines 154-158 (the comment plus all four props — verified dead: `grep -n "suggestions\|onActSuggestion\|onDismissSuggestion\|onOpenGuidedChat" src/components/schedule/ScheduleItem.tsx` returns only those lines). Then remove the now-unused `ProactiveSuggestion` import.

In `TodaySectionList.tsx`, delete the `suggestions={...}` IIFE and the `onActSuggestion` / `onDismissSuggestion` / `onOpenGuidedChat` props passed to `ScheduleItem` (lines 516-525). Leave any other use of `proactive` in that file intact — check whether `proactive` becomes unused and remove its plumbing only if so.

Run: `npx tsc --noEmit`
Expected: PASS. Fix any unused-variable errors this surfaces.

- [ ] **Step 2: Create the shared line list**

`src/components/assistant/UnpromptedLines.tsx`:

```tsx
import { Sparkles, X } from 'lucide-react'
import type { UnpromptedItem } from '@/hooks/useUnpromptedSuggestions'

interface Props {
  items: UnpromptedItem[]
  onAct: (id: string) => void
  onSnooze: (id: string, scope: 'now' | 'today') => void
}

/**
 * Calm lines, not a card. Deliberately no header, no count badge, no chrome:
 * a titled card with a count invites growth, which is how Today reached ~57
 * rows. A bare line list has nowhere to grow. Same visual register as
 * RhythmNudge, which is the one proactive pattern here that survived.
 */
export function UnpromptedLines({ items, onAct, onSnooze }: Props) {
  if (items.length === 0) return null
  return (
    <div className="px-3 md:px-0 space-y-1">
      {items.map(({ suggestion: s }) => (
        <div key={s.id} className="flex items-center gap-2 text-sm text-ink-600">
          <Sparkles className="w-3.5 h-3.5 shrink-0 text-primary-600" aria-hidden />
          <button onClick={() => onAct(s.id)} className="text-left hover:underline truncate">
            {s.title}
          </button>
          {s.detail && <span className="text-xs text-ink-400 truncate">{s.detail}</span>}
          <button
            onClick={() => onSnooze(s.id, 'now')}
            className="ml-auto text-xs text-ink-400 hover:text-ink-600 shrink-0"
            aria-label="Not now"
          >
            Not now
          </button>
          <button
            onClick={() => onSnooze(s.id, 'today')}
            className="text-ink-300 hover:text-ink-500 shrink-0"
            aria-label="Not today"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}
```

Use the real Nordic Journal token names from `src/index.css` — if `text-ink-600` / `text-primary-600` are not actual classes in this codebase, substitute the correct ones. Check an existing quiet component (`RhythmNudge.tsx`) and match it.

- [ ] **Step 3: Mount it in TodayView**

In `TodayView.tsx`, immediately after the Up Next hero block (the `{upNext && (...)}` closing at ~line 868) and before the "Inline Add to today" comment, insert:

```tsx
      {/* Assistant lines — unprompted tier. Under the hero because it makes the
          same kind of claim; above the add input, which is mechanics. */}
      <UnpromptedLines
        items={unprompted.items}
        onAct={handleUnpromptedAct}
        onSnooze={unprompted.snooze}
      />
```

Add near the other hooks in the component:

```tsx
  const unprompted = useUnpromptedSuggestions('today')
```

`handleUnpromptedAct` should route through the same action dispatch the chips use. Extract the `switch` from `ProactiveSuggestionChips.handleClick` into a reusable `dispatchSuggestionAction(s, handlers)` in `src/lib/assistant/` if that is cleaner than duplicating it — it must not be copy-pasted a second time.

- [ ] **Step 4: Verify in the browser**

Start the dev server (`npm run dev`, port 5173 only) and open Today. Confirm: lines appear under the hero when active suggestions exist above urgency 55; "Not now" makes one disappear; no per-row chips on the timeline; the page is not taller than before.

If no suggestions exist, temporarily insert a high-urgency test row via the Management API rather than assuming it works.

- [ ] **Step 5: Run the suite and commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add -u && git add src/components/assistant/UnpromptedLines.tsx
git commit -m "feat(today): assistant lines under the hero, delete the dead per-row path"
```

---

### Task 10: Wall line with the reduced action vocabulary

**Files:**
- Create: `src/components/wall-v2/wallAssistantAdapter.ts`, `src/components/wall-v2/wallAssistantAdapter.test.ts`, `src/components/wall-v2/WallV2AssistantLine.tsx`
- Modify: `src/components/wall-v2/WallV2Shell.tsx`

**Interfaces:**
- Produces: `WallAction = { kind: 'wall_call'; phoneNumber: string } | { kind: 'show_me' }`, `toWallAction(s: ProactiveSuggestion) => WallAction`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { toWallAction } from './wallAssistantAdapter'
import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'

const s = (actionType: string, payload: Record<string, unknown> = {}): ProactiveSuggestion => ({
  id: 'x', userId: 'u', entityType: 'task', entityId: 't', suggestionType: 'call',
  title: 't', confidence: 1, actionType: actionType as never, actionPayload: payload,
  status: 'active', suggestionKey: 'k', generatedAt: '', createdAt: '', updatedAt: '',
})

describe('toWallAction', () => {
  it('routes call into the wall phone flow, never tel:', () => {
    expect(toWallAction(s('call', { phoneNumber: '555' })))
      .toEqual({ kind: 'wall_call', phoneNumber: '555' })
  })

  it('degrades call with no number to Show me', () => {
    expect(toWallAction(s('call'))).toEqual({ kind: 'show_me' })
  })

  it.each(['email', 'text', 'open_link', 'navigate', 'create_task', 'guided_chat'])(
    'degrades %s to Show me — those schemes are dead on a Pi kiosk',
    (t) => { expect(toWallAction(s(t, { email: 'a@b.c', url: 'https://x', phoneNumber: '5' }))).toEqual({ kind: 'show_me' }) },
  )

  it('never produces an action that opens a URL scheme', () => {
    for (const t of ['email', 'text', 'open_link', 'navigate']) {
      const a = toWallAction(s(t, { url: 'https://x', email: 'a@b.c', phoneNumber: '5' }))
      expect(JSON.stringify(a)).not.toMatch(/mailto|sms:|https?:/)
    }
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/components/wall-v2/wallAssistantAdapter.test.ts`
Expected: FAIL — cannot resolve `./wallAssistantAdapter`.

- [ ] **Step 3: Implement the adapter**

```ts
import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'

/**
 * The wall's reduced action vocabulary.
 *
 * ProactiveSuggestionChips.handleClick dispatches tel:/sms:/mailto:/window.open.
 * On the Raspberry Pi kiosk browser most of those do NOTHING, and a dead tap on
 * a wall-mounted screen is worse than no chip at all. So the wall offers only
 * what it can actually perform: its own phone flow, or "Show me".
 *
 * This filter lives here, in the wall adapter, NOT in the shared chip component,
 * so the wall's limitations can't leak into the phone and desktop paths.
 */
export type WallAction =
  | { kind: 'wall_call'; phoneNumber: string }
  | { kind: 'show_me' }

export function toWallAction(s: ProactiveSuggestion): WallAction {
  const actionType = s.actionType || s.suggestionType
  if (actionType === 'call') {
    const phone = s.actionPayload?.phoneNumber
    if (typeof phone === 'string' && phone.length > 0) {
      return { kind: 'wall_call', phoneNumber: phone }
    }
  }
  return { kind: 'show_me' }
}
```

- [ ] **Step 4: Build the line component**

`WallV2AssistantLine.tsx` — one line, kiosk scale, matching the wall's warm token set (read `wallTheme` tokens and `WallV2FreshnessLine.tsx` first and match them). Requirements: min 60px touch targets; a lucide icon, not an emoji; the primary button labelled from the action (`Call` / `Show me`); one `Not now` button. Props:

```tsx
interface Props {
  item: UnpromptedItem | null
  onAct: (action: WallAction, item: UnpromptedItem) => void
  onSnooze: (id: string) => void
}
```

Return `null` when `item` is null.

- [ ] **Step 5: Mount it in WallV2Shell**

In `WallV2Shell.tsx`, inside the centre column div (the `{/* Row 1 — center: NOW + timeline + Keep Moving */}` block), directly after `<WallV2NowNext ... />`:

```tsx
          <WallV2AssistantLine
            item={wallUnprompted.items[0] ?? null}
            onAct={handleWallAssistantAct}
            onSnooze={(id) => wallUnprompted.snooze(id, 'now')}
          />
```

with `const wallUnprompted = useUnpromptedSuggestions('wall')` alongside the other hooks. `handleWallAssistantAct` switches on `WallAction.kind`: `wall_call` → the existing wall phone flow; `show_me` → open `WallV2ItemActionSheet` for that entity, reusing the existing `handleTapEvent`/action-sheet state.

- [ ] **Step 6: Verify on the wall**

Open `/wall-v2` in a browser at kiosk dimensions and confirm the line renders, is legible at distance, and its buttons are kiosk-sized. Then take a Pi screenshot via SSH + `grim` and confirm it reads correctly on the real device. Report what the screenshot actually shows.

- [ ] **Step 7: Commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add -u && git add src/components/wall-v2/wallAssistantAdapter.ts src/components/wall-v2/wallAssistantAdapter.test.ts src/components/wall-v2/WallV2AssistantLine.tsx
git commit -m "feat(wall): assistant line with Pi-safe action vocabulary"
```

---

### Task 11: `?why=1` debug view, full verification, push

**Files:**
- Modify: `src/components/assistant/UnpromptedLines.tsx`, `src/components/wall-v2/WallV2AssistantLine.tsx`

- [ ] **Step 1: Add the debug rendering**

In both components, when `new URLSearchParams(location.search).get('why') === '1'`, render the `decisions` list below the lines as small monospace text: `title — urgency N — reason`. This is what makes the policy tunable instead of mystical: when the wall is silent on a day it should have spoken, the floor / budget / window can be distinguished rather than guessed at. Pass `decisions` through as a prop from each mount point.

- [ ] **Step 2: Verify the debug view**

Open `http://localhost:5173/?why=1` and `/wall-v2?why=1`. Confirm every active suggestion is listed with a reason, and that suppressed ones show a reason other than `allowed`.

- [ ] **Step 3: Full verification**

```bash
npx vitest run
npx tsc --noEmit
npm run lint
npm run build
```
All four must pass. Report actual output, not a summary.

- [ ] **Step 4: Rebase and push**

```bash
git fetch origin && git rebase origin/main
npm run build   # re-verify after rebase
git push origin HEAD:main
```

If the push is rejected as non-fast-forward, `git fetch && git rebase origin/main` and retry. Do not use `--no-verify`.

- [ ] **Step 5: Confirm the deploy**

Pushes to `main` auto-deploy, but the webhook has silently missed before. Verify with `gh api repos/:owner/:repo/deployments` (Vercel project `symphony-rebuild`, prod domain `app.symphony-os.com`) that a deployment for this SHA exists and succeeded.

---

## Self-Review Notes

**Spec coverage:** Section 1 (two tiers) → Tasks 8-10. Section 2 (schema, urgency, stale-hint rule) → Tasks 1, 3. Section 3 (policy, check order, critical, escalation, `?why=1`) → Tasks 5, 11. Section 4 (wall placement + reduced vocabulary, Today band, snooze, seen discipline, mutation cleanup) → Tasks 2, 9, 10. Section 5 (cadence as source) → Tasks 6, 7. Section 6 (degradation) → fail-closed in Task 5's `catch` and Task 8's try/catch; null `urgency` reads as 0 via `|| 0`. Section 7 (testing) → every task's test steps, plus the browser checks in Tasks 9-11.

**Known gap carried deliberately:** the spec's "unprompted requires non-degraded provenance" is only partly implemented — the client hook cannot see the engine's bundle `degraded[]` because it is not persisted on the suggestion row. Task 5 fails closed on exceptions, and the engine can simply not emit a suggestion whose provenance was degraded, which is the stronger guarantee. If a future change needs client-side visibility, that requires a `degraded boolean` column and is out of scope here. Flagged rather than silently dropped.

**Type consistency check:** `UnpromptedItem` / `UnpromptedResult` / `SurfaceId` / `InterruptDecision` / `RejectReason` / `UrgencyFacts` / `UrgencyInput` / `WallAction` / `CadenceOverdue` are each defined once and referenced with those exact names throughout. `markSuggestionSeenDb(id, urgency)` has the same two-arg signature in Task 2, its test in Task 8, and its call site in Task 8.
