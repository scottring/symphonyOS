# Assistant delivery + interruption policy — design

*2026-07-30. Approved by Scott section by section. Piece 1 of 3 in the assistant arc
queued by `2026-07-29-symphony-as-assistant-design.md` ("not yet designed", items 4 and 6).*

---

## Status

**Approved. Ready for `superpowers:writing-plans`.**

This spec covers **delivery + interruption only**. The other two queued pieces —
cascade-runner and wall/Today curation — are deliberately *not* in scope here and get
their own spec → plan → build cycles. See "Explicitly out of scope".

---

## Why this exists

The context graph shipped 2026-07-30 (`e9dac331`). Suggestions are now well-informed but
**entirely passive**. Delivery today is 100% pull, 100% anchored: an amber pill physically
attached to the entity it concerns, on three surfaces only (overdue rows, task detail panel,
project rows), visible only if you happen to be looking at that surface.

Scott's ask, 2026-07-29, was for the assistant to be "proactive in speech" — to say
something he didn't ask for. Nothing in the app can do that today.

### What the audit found

| Finding | Evidence |
|---|---|
| **Today computes suggestions and throws them away** | `TodaySectionList.tsx:516-522` builds the array and passes it to `ScheduleItem`, whose props at `ScheduleItem.tsx:154-157` are declared, never destructured, never rendered. The comment says "shown on hover" — that behavior does not exist. |
| **A finished aggregate view is orphaned** | `DailyBriefing.tsx` is a complete suggestions card with header, count, per-type icons, and its own outcome flow. Imported by nothing. `useProactiveSuggestions.topSuggestions` exists solely to feed it. |
| **The schema cannot support interruption** | No `seen_at`, no `snoozed_until`, no priority. `confidence` is the only signal and is used solely for `ORDER BY`. There is no way to distinguish *missed* from *ignored*. |
| **`quietHours.ts` is not a DND policy** | Its own header says it exists to stop ~540 REST requests/hour at 3am that triggered Supabase's egress warning. Hardcoded 23:00–06:00, no user config, no timezone awareness, all consumers are pollers. |
| **Zero notification infrastructure** | No service worker, no push, no `Notification` API anywhere in `src/`, `desktop/`, `apple/`. |
| **Banners were already rejected as noise once** | `RhythmNudge.tsx:3-8`: *"Banners/coaching were rejected as noise before, so this is deliberately quiet."* |
| **`proactive_suggestions` is not under migration control** | Zero hits across all of `supabase/migrations/`. Authoritative DDL lives in a spec document, `tasks/proactive-assistant-spec.md:81-118`. |

### Channel decision: in-app only

Scott chose **in-app only**. Rejected for now:

- **OS notifications / web push** — deferred, not rejected. Three reasons: the kitchen wall
  is already an always-on, always-visible interruption surface (`quietHours.ts`'s entire
  reason for existing is that the wall never goes `document.hidden`); there is no
  instrumentation to tune a notification channel, and an untuned one gets muted once,
  permanently; and `RhythmNudge`'s scar comment records this failure mode already happening.
  The `seen_at` column added here is specifically what makes revisiting this an
  evidence-based decision later rather than a guess.
- **Michael on Telegram** — a Telegram message about calling Camp Notre Dame cannot dial.
  The chips can.

---

## Section 1 — Architecture: two tiers of delivery

The core move is naming a distinction the codebase does not currently make.

**Anchored delivery** — what exists today. A chip attached to the entity it concerns. You
see it because you navigated to the thing. It never competes for attention, so it needs no
policy. **Unchanged by this work.**

**Unprompted delivery** — new. A suggestion appearing somewhere you did not ask about that
entity: the wall line, a Today band. This is push, even without a notification API. Here
suggestions compete with each other and with everything else on the surface, so exactly one
module decides what enters this tier.

```
proactive_suggestions (data)
        |
        +-- anchored:    useEntityContext -> ContextChips           [no policy, unchanged]
        |
        +-- unprompted:  useUnpromptedSuggestions -> mayInterrupt() -> wall line / Today band
```

### Naming

The tiers were initially called "spoken" vs "anchored". Renamed because **this codebase has
real speech in it** — `guided/narration.ts`, `narration.manifest.json`, and
`useNarrationPlayer.ts` play actual audio during planning sessions (currently off globally).
A `speakPolicy.ts` sitting next to a `useNarrationPlayer.ts` would be actively misleading.
"Unprompted" is precise and carries no audio connotation.

### New modules

| Module | Responsibility |
|---|---|
| `src/lib/assistant/urgency.ts` | `computeUrgency(facts, now)` — deterministic score. No model call, no DB. |
| `src/lib/assistant/interruptionPolicy.ts` | `mayInterrupt(suggestion, surface, state, now)` — the single gate. |
| `src/lib/assistant/interruptionWindow.ts` | Real DND. Deliberately separate from `quietHours.ts`. |
| `src/lib/assistant/suggestionMutations.ts` | Shared act/dismiss/snooze mutations (see Section 4 cleanup). |
| `src/hooks/useUnpromptedSuggestions.ts` | Applies policy, writes `seen_at`, exposes snooze. |

### Two commitments

**Urgency is computed by rules, not by the model.** The engine already runs an LLM tier and
it would be easy to ask it for a priority number. Model-assigned urgency is uncalibrated,
drifts between runs, and cannot be debugged when a suggestion shouts on a Tuesday for no
reason. Deterministic rules over time facts are auditable and fixture-testable, and follow
the precedent `proposeOrder.ts:139` set by refusing to rank without signal.

`confidence` answers *is this suggestion correct*. `urgency` answers *does it matter now*.
Two axes, never collapsed into one blended score — blending would let a 0.99-confidence
trivial item outrank a genuinely late one and make "why is this at the top" unanswerable.

**`quietHours.ts` is neither reused nor modified.** Widening a cost guard into a DND policy
would change wall refresh behavior as a side effect and risk re-opening the egress problem.
`interruptionWindow.ts` is a separate concept that may share a default window.

---

## Section 2 — Schema and the urgency score

### Migration

`proactive_suggestions` exists in the live database but has **no migration file**. This
migration does two jobs:

1. `create table if not exists` reflecting current production DDL
   (`tasks/proactive-assistant-spec.md:81-118`), bringing the table under version control.
2. `alter table ... add column if not exists` for the three new columns.

Must be idempotent — it will run against a database where the table already exists. Per
project convention, DDL applies via the Supabase Management API
(`POST /v1/projects/mwadppyrqzuzgstmwpuy/database/query`) because local migrations are out
of sync with prod; the file is still committed as the record.

### Columns

| Column | Type | Why |
|---|---|---|
| `seen_at` | `timestamptz` | First time this rendered on an **unprompted** surface. Distinguishes *missed* from *ignored*. The instrument that makes the deferred notification decision evidence-based. |
| `snoozed_until` | `timestamptz` | "Not now." |
| `urgency` | `smallint` (0–100) | Rules-derived. Stored so coarse ordering happens in the query. |

**Snooze is a timestamp, not a status.** A `'snoozed'` status would need a background job to
un-set and would strand rows silently if that job ever broke. A timestamp is self-healing —
the comparison expires on its own. The row stays `active` throughout; it is merely muted.

### The urgency function

`max` of time-pressure signals plus one small modifier — never a running sum, so no
combination of signals can produce a runaway score:

```ts
timePressure = max(
  eventStartsWithin(90min) ? 90 : 0,
  overdue                  ? min(60 + daysOverdue * 3, 85) : 0,
  cadenceOverdue           ? min(50 + weeksLate * 10, 80) : 0,
  dueToday                 ? 55 : 0,
  waitingDays >= 7         ? 45 : 0,
)
modifier = deferCount >= 3 ? 5 : 0
urgency  = clamp(timePressure + modifier, 0, 100)
```

`defer_count` gets a deliberately weak +5. Repeated deferral is ambiguous — it can mean
"this keeps mattering" or "I keep avoiding it" — and an avoidance signal must not become a
shouting signal.

Ranking is `urgency DESC, confidence DESC`.

### Stored urgency is a hint, never the authority

**This is load-bearing and must not be "optimized" away later.** The engine runs on a
6-hour interval. A suggestion generated at 06:30 computes `eventStartsWithin(90min) = false`;
by 14:00 that is true, but the stored `smallint` still says otherwise.

Therefore `computeUrgency(facts, now)` is used in **both** places: the server stores its
value at generation time for coarse ordering and filtering, and **the client recomputes live
with the real `now` and live entity data it already has loaded**. The live value governs
every interruption decision.

---

## Section 3 — The interruption policy

```ts
mayInterrupt(suggestion, surface, state, now) ->
  | { allow: true;  urgency: number; critical: boolean }
  | { allow: false; reason: RejectReason }
```

**Budget and window are global; floor and concurrency are per-surface.** Attention is one
resource, so there is one attention budget — not a wall budget plus a Today budget that sum
to more than exists.

| Global | Value |
|---|---|
| Daily interruption budget | 8 distinct suggestions (counted by `seen_at` falling today) |
| Interruption window | 07:00–21:00 local |
| Seen-cooldown | 4h before an unacted item may reappear |
| Snooze | `snoozed_until > now` mutes entirely |

| Surface | Urgency floor | Concurrent |
|---|---|---|
| Wall rail | 70 | 1 |
| Today band | 55 | 3 |

The asymmetry is deliberate. The wall speaks when you did not ask — high floor, one line,
never a stack. Today you opened on purpose, so it gets a lower floor and may show three.
**Today consumes budget but is exempt from the window**: if you are looking at Today at
22:00 you have asked, but attention spent is still attention spent.

### Check order — first match wins

Fixed order so a rejection reason is always the *most specific* true one:

1. `not_actionable` — reuses the existing `isActionableSuggestion` guard, so dead
   `someday` / `stale` / handler-less `guided_chat` types cannot consume budget.
   **That guard currently lives in a component file** (`ProactiveSuggestionChips.tsx:49-58`);
   a pure policy module must not import from a React component, so it moves to
   `src/lib/assistant/suggestionMutations.ts`'s module neighborhood
   (`src/lib/assistant/actionable.ts`) and the component imports it from there. Behavior
   unchanged; the existing doc comment at `:41-48` moves with it.
2. `not_active` — status is not `active`
3. `snoozed`
4. `below_floor`
5. `outside_window`
6. `budget_spent`
7. `cooldown` — seen, unacted, within 4h, and urgency has not escalated

### One override: `critical` at urgency >= 90

That band is reachable only by "a timed event starts within 90 minutes". It bypasses budget,
cooldown, and window — an event starting in 30 minutes at 21:30 must still appear. A single
named constant with exactly one entry condition, so it cannot quietly become the common path.

### Escalation beats cooldown

If an item was seen at urgency 62 this morning and is now 78 because it went overdue, the
cooldown does not apply. This is the payoff for recording `seen_at`: the system can tell
"you ignored this" from "you saw a calmer version of this".

### Every decision returns a reason, including allows

A `?why=1` query param renders the decision inline on both surfaces. This makes the policy
tunable rather than mystical: when the wall is silent on a day it was expected to speak, the
floor / budget / window can be distinguished instead of guessed at.

Pure function — no DB, no clock of its own, no React. `now` and `state` are injected, so the
whole truth table is fixture-testable including the boundaries, which is where this class of
code actually breaks.

---

## Section 4 — The two surfaces

### Wall line

**Placement:** centre column, directly beneath `WallV2NowNext` (`WallV2Shell.tsx:499`). Not
the right column — those cards are reference material. Not the rail — that is where
freshness and meta live. `NowNext` already answers "what matters right now"; the assistant
line makes the same kind of claim and belongs in the same zone.

One line, one lucide icon, one primary action, one "Not now". Sized for the 8-foot viewing
distance the kiosk work established, with kiosk-scale touch targets, remembering that touch
reports as **mouse** on the Pi.

**Reduced action vocabulary — required, not cosmetic.**
`ProactiveSuggestionChips.handleClick` (`:77-146`) dispatches `tel:` / `sms:` / `mailto:` /
`window.open`. On a Raspberry Pi kiosk browser most of those do nothing, and a dead tap on a
wall-mounted screen is worse than no chip at all.

| Action | Wall behavior |
|---|---|
| `call` | Routes into the existing wall phone flow (`WallV2PhoneScreen`, RING model), never `tel:` |
| everything else | Degrades to **"Show me"** -> opens the existing `WallV2ItemActionSheet` |
| `mailto`, `sms`, external links | Never offered on the wall |

This filter lives in the **wall adapter**, not in the shared chip component, so the wall's
limitations cannot leak into the phone and desktop paths.

### Today band

**Placement:** directly under the Up Next hero (`TodayView.tsx:859-868`), above
`TodayAddInput`. Same altitude of claim as the hero, above the mechanics of adding.

**No card, no header, no count badge** — up to three calm lines in the same visual register
as `RhythmNudge`. This is a deliberate anti-growth choice: a titled card with a count invites
more items over time, which is how Today reached ~57 rows. A bare line list has nowhere to
grow. Collapse state persists through the existing `sectionCollapse.ts` mechanism, not a new
one.

**Net vertical weight on Today is negative**, because this work also deletes the dead
suggestion path: the four unrendered props at `ScheduleItem.tsx:154-157` and the
`TodaySectionList.tsx:516-522` block that computes an array and discards it. The parent
spec's Today density ruling stands — no persistent per-row chips on Today.

### Snooze — exactly two options

"Not now" -> +4h. "Not today" -> tomorrow 07:00. No custom duration picker: a snooze UI with
six choices is a decision to make every time something appears, which taxes the thing that
was supposed to reduce tax.

### `seen_at` write discipline

Written **only** by unprompted surfaces, once per suggestion, guarded against re-marking on
re-render. Anchored chips never mark seen — you looked at the entity, the assistant did not
interrupt you, and conflating those would poison the exact signal the column exists to
capture.

### One targeted cleanup

`useEntityContext.ts:108-159` currently duplicates `actOnSuggestion` / `dismissSuggestion`
verbatim from `useProactiveSuggestions.ts:63-111`, with a comment acknowledging the copy.
Rather than add a third copy, those move to `src/lib/assistant/suggestionMutations.ts` and
all three hooks call it. Scoped strictly to the functions the new hook would otherwise
duplicate — no wider refactor.

---

## Section 5 — Cadence as an unprompted source

`src/lib/cadence/config.ts:136` `getDueSession()` feeds `RhythmNudge.tsx`. It works, but it
is **calendar-day-dumb**: it fires because it is the configured nudge day, not because the
season is three weeks old and unplanned. It has no idea a month was skipped.

A due planning session becomes an **unprompted suggestion source** flowing through the same
policy as everything else, rather than a parallel hardcoded path:

- The engine emits a `plan_session` suggestion when a cadence is due **or overdue**, with
  urgency scaled by lateness and by real state (season started, zero picks made), not by
  day-of-week.
- `RhythmNudge` remains the renderer and remains exactly as quiet as it is today. Its scar
  comment stands: this makes it **smarter, not louder**.
- It gets the same snooze, seen-tracking, and daily budget as every other unprompted item.

This also de-risks the cascade-runner, which needs "the assistant knows which ritual is due
and what state it is in" as a prerequisite.

`plan_session` is a new `SuggestionType`. Because `isActionableSuggestion` filters unknown
types out by default, the new type must be added to both the type union and the actionable
guard, or it will be silently dropped.

---

## Section 6 — Error handling and degradation

**One principle: degradation always means quieter, never louder.**

| Failure | Behavior |
|---|---|
| Context bundle part `degraded` | An unprompted suggestion requires **non-degraded provenance**. If the part that justified it failed to load, it may still appear as an anchored chip but may not interrupt. |
| Vault sync stale | Vault-derived items are suppressed from the unprompted tier. Precedent: `vault-sync` silently synced zero rows for a month on an expired `GITHUB_PAT`. |
| Engine down / rate-limited / key unbilled | Wall and Today band show **nothing**. No error state, no "assistant unavailable" — a wall announcing its own brokenness is precisely the noise this policy exists to prevent. |
| `urgency` null (pre-migration rows) | Reads as 0. Can never interrupt. |
| Policy throws | Treated as `allow: false`. |

Fail closed at every branch. Existing surfaces (anchored chips) must be unaffected by any
failure in the new path — the unprompted tier is additive and independently disableable.

---

## Section 7 — Testing

| Target | Tests |
|---|---|
| `urgency.ts` | Fixture table per signal; boundaries at 89/90 (critical band) and at the 55/70 floors; `max`-not-sum verified by a case where three signals are simultaneously true; weak `defer_count` modifier cannot alone cross a floor. |
| `interruptionPolicy.ts` | Full truth table. **Check-order tests asserting the most specific reason wins** (e.g. a snoozed, below-floor, out-of-window item reports `snoozed`). Critical override bypasses budget + cooldown + window. Escalation beats cooldown. |
| `interruptionWindow.ts` | Boundary hours; wrap past midnight; independence from `quietHours.ts`. |
| `useUnpromptedSuggestions.ts` | `seen_at` written once, not per render. Anchored path never writes `seen_at`. |
| Wall adapter | `mailto` / `sms` / external-link actions can never produce a wall action. `call` routes to the wall phone flow, never `tel:`. |
| Migration | Idempotent — applying twice succeeds. |
| Browser | Both surfaces opened and inspected before push. Type-checks are not inspection. |

Run with `npx vitest run` — `npm test` is watch mode.

---

## Explicitly out of scope

- **Cascade-runner** (spec item 6). Direction settled during this brainstorm and recorded
  below for its future spec, but not designed or built here.
- **Wall/Today curation** (top-3 + fold, ranking). Collides with three unmerged Today
  branches (`today-what-time`, `today-drag-gestures`, `today-stage3`) and needs its own
  sequencing decision.
- **OS notifications / web push.** Deferred with instrumentation in place to revisit.
- **Two-way vault sync completion** (spec item 7), **Iris as phase 2** (item 8).

### Recorded for the cascade-runner spec

Decided during this brainstorm; do not re-litigate:

- **Level 2, not level 3.** The assistant *drives* the sessions — chooses which steps, in
  what order, skips what is already done, and states why this step now. It does not replace
  the wizard with pure chat. Scott's approved framing: "Pages become the record; the
  assistant is how you move through them." Level 3 would discard the record.
- **The key enabler:** `guided/sessions.ts:10` is a static literal
  (`SESSIONS: Record<PlanningHorizon, GuidedSessionConfig>`). The shell already renders
  whatever config it is handed, steps are already zero-prop, and all app I/O already flows
  through the single `GuidedHost` interface. So "the assistant runs the cascade" means
  **the session config stops being a constant and becomes a function of the context bundle.**
  Same shell, same registry, same host.
- **Modality rule:** chat where the content is language (`ReflectStep` 22 lines,
  `WinsStep` 51 — essentially textareas); structured steps where the content is spatial or
  quantitative (`PlaceOnWeeksStep` reuses the real `MonthCalendarGrid`; `PickByGoalStep`
  shows picks against a cap of 10 with a starving signal). Rationale: chat cannot show a
  month grid, and describing one is strictly worse than seeing it. Input cost is decisive —
  dragging a pick onto week 3 is near-zero effort where composing an unambiguous sentence is
  not, and Scott's constraints file names finite physical/cognitive energy as a hard
  constraint.
- **Known risk to design around:** a dynamic config breaks resume, because
  `notes.stepIndex` (`usePlanningSession.ts:33`, `GuidedSession.tsx:94-119`) assumes a stable
  step list.
- **Duplication to collapse** (Scott's "less buggy / less redundant" criteria, itemized):
  `partitionSeason` implemented three times (`betPulse.ts:19`, `PickByGoalStep.tsx:46-57`,
  `horizons/shared.tsx:305-312`); `PickByGoalStep` (295) and `MoveByPickStep` (310)
  structurally near-identical, differing mainly in which field they stamp; "look above and
  copy down" written twice (`LookAboveStep.tsx` and `horizons/shared.tsx:640-700`
  `referenceFold`) with the same translation prompt; "placed this month" counted twice
  (`MonthPage.tsx:64-77`, `PlaceOnWeeksStep.tsx:33-50`) with comments in both admitting they
  must not disagree; `makeAssigneeFilter([])` re-created in five step files instead of being
  provided by the host.

---

## Constraints that apply

- `CLAUDE.md`: never edit or commit in the main worktree. This work lives in
  `.worktrees/assistant-delivery` on branch `assistant-delivery`, off `origin/main`.
- Pushes to `main` auto-deploy to production. Push only finished, building, tested work.
- `npm test` is vitest **watch** mode — use `npx vitest run`.
- Pre-push `tsc` is not the Vercel build; run `npm run build` before type-sensitive pushes.
- CI runs lint; pre-push does not. Lint before pushing.
- No emojis in UI — lucide icons.
- New `useSupabaseTasks`-style mutations must `announceLocalWrite`; this work touches
  `proactive_suggestions`, not `tasks`, so the write bus does not apply — but the snooze
  mutation must still trigger a refetch on the surfaces showing it.
