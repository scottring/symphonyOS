# Five Horizons Guided Planning — Design

**Date:** 2026-07-09
**Status:** Approved by Scott (this session), pending build
**Branch:** `worktree-five-horizons`

## Why

The planning system's data spine (bucket ladder, `planning_sessions` rows, goals) already
matches the Five Horizons method, but the *experience* is a set of inconsistent forms:
a single-scroll `CadenceSession` for annual/seasonal/monthly, a 4-step
`WeeklyPlanningSession` whose steps don't match the method, and a separate
`PlanTodaySession`. None of them tell you what to do or why. This rebuild replaces all
five session experiences with one guided, voiced, step-at-a-time ritual, while keeping
the data model and the hard-won Today view untouched.

Baseline note: commit `5a3993e0` (2026-07-08) already removed goal-action linkage from
the sessions and introduced read-only "for reference" panels of the level above, plus
"copy down" (duplicate a line, original stays). This design builds on that: the
`look-above` step type reuses the reference-panel mechanics.

## Decisions (locked with Scott)

1. **Scope:** all five horizons (annual, seasonal, monthly, weekly, daily) become one
   guided flow. Weekly's schedule grid and daily's machinery are reused as steps, not
   rebuilt.
2. **Year model:** goals flatten to *life domains → goal statements* (title + status +
   year). `goal_actions` / `goal_milestones` lose all UI and code paths; their DB tables
   are **not dropped** — data stays, nothing renders it.
3. **Look, don't link:** planning a level = looking at the level above while writing this
   level's own flat list. No sub-goals, no linkage, ever. "Copy down" duplicates text and
   leaves the original (already shipped in `5a3993e0`).
4. **Guidance:** full ritual script — every step opens with plain-language instructions
   (what, why, roughly how long). One step on screen at a time, Next/Back, every step
   skippable.
5. **Voice:** pre-generated ElevenLabs narration, mp3s committed to the repo and served
   statically from Vercel CDN (NOT Supabase storage — egress history). Mute toggle,
   persisted in localStorage. Daily defaults to muted after first run.
6. **Fidelity:** trimmed to in-app steps only. No financial-audit, ops, decluttering, or
   retreat-scheduling steps. The `financialDone` tick dies.
7. **Seasons:** calendar quarters (existing `quarter` bucket, unchanged).
8. **One-pagers:** `HorizonView` pages stay as the between-session list surfaces; they
   gain a "Start planning session" button. (Their guiding-goals strip already became a
   read-only reference bar in `5a3993e0`.)
9. **Today view:** untouched. Its existing "plan today" entry opens the new guided daily
   session; everything else on Today is out of scope. The daily `oneWord` is stored but
   NOT surfaced on Today.
10. **No feature flag.** The branch merges only when the whole flow is verified on a
    Vercel preview.

## Architecture

New directory: `src/components/planning/guided/`

```
guided/
  GuidedSession.tsx        # shell: step progression, progress bar, voice player,
                           # next/back/skip, resume from stepIndex
  sessions.ts              # the five step-sequence configs (pure data)
  narration.manifest.json  # generated: narration-text hash → mp3 filename
  stepTypes/
    NarrationStep.tsx      # instruction moment; Continue
    ReflectStep.tsx        # voiced prompt + text field → planning_sessions.notes[key]
    ReviewStep.tsx         # this horizon's open items: complete/migrate/someday/let go
    LookAboveStep.tsx      # read-only level-above panel (+ copy-down), reuses 5a3993e0 mechanics
    CalendarStep.tsx       # period look-ahead (existing GCal read)
    WriteListStep.tsx      # add items into this horizon's bucket (addTask WITH bucket option)
    InboxStep.tsx          # weekly "Look Around": triage inbox to zero (existing triage)
    ScheduleGridStep.tsx   # weekly: wraps existing StepSchedule grid
    DomainsGoalsStep.tsx   # annual: goal statements per life domain (flattened goals)
    BookNextStep.tsx       # creates next session's calendar item (default calendar only)
```

Config shape (pure data, no components in config):

```ts
interface GuidedStep {
  id: string                 // unique within the session
  type: StepType             // registry key
  narration: string          // shown on screen AND spoken; single source of truth
  title: string              // step header, e.g. "Look back"
  props?: Record<string, unknown>  // per-type config (notes key, bucket, soft cap…)
}
interface GuidedSessionConfig {
  horizon: PlanningHorizon   // 'annual' | 'seasonal' | 'monthly' | 'weekly' | 'daily'
  title: string
  estMinutes: [number, number]
  steps: GuidedStep[]
}
```

The shell resolves `type` against a component registry. Unknown type = config-integrity
test failure, never a runtime crash.

### Data model deltas (small)

- `planning_sessions.notes` gains keys: `lookingBack`, `energy`, `oneWord`.
- `planning_sessions` row stores `stepIndex` (resume a half-finished session within its
  period). Persisted via the existing debounced patch in `usePlanningSession` — column
  added to the `notes` jsonb (`stepIndex` key) to avoid a schema migration.
- Goals: reuse existing `goals` + areas tables; UI reads only statement/status/year.
  No migration. `goal_actions`/`goal_milestones` untouched in DB, unreferenced in code.
- Buckets unchanged: `inbox | week | month | quarter | someday | timed`. Year is not a
  bucket — the year rung is goals.

## The five session scripts

Every step is skippable. Narration below is summarized; final copy is written during
implementation and lives verbatim in `sessions.ts`.

### Annual — "Plan the year" (~45–60 min)
1. `narration` — what this ritual is, why it earns a quiet morning.
2. `reflect` → `notes.review` — the year that's ending: wins, and habits that didn't serve you.
3. `reflect` → `notes.lookingBack` — one year from now: what you're most proud of and how you got there.
4. `review` (last year's goals) — achieved / carry into new year / let go.
5. `calendar` (year) + `notes.annualCalendar` — the mountain ranges: trips, school year, heavy blocks.
6. `review` (someday bucket) — anything ready moves into the season (Someday→quarter stays a MOVE — Someday has no review to protect); the rest stays parked or is released.
7. `domains-goals` — pick 3–8 domains, freewrite goal statements. Copy nudges the 2:1 fun ratio.
8. `book-next` — schedule the next seasonal session before closing.

### Seasonal — "Plan the season" (~30 min)
1. `narration` — the season's fresh start.
2. `review` (quarter bucket) — celebrate; leftovers migrated / tabled to Someday / let go, with a beat on *why* something stalled.
3. `look-above` (annual goals by domain) — read-only; which fit this season's energy?
4. `calendar` (season) — trips, deadlines, school breaks.
5. `reflect` → `notes.energy` — look within: does the plan match actual capacity?
6. `write-list` (quarter bucket) — write the season's list fresh.
7. `book-next` — schedule the next monthly session.

### Monthly — "Plan the month" (~20 min)
1. `narration` — twelve clean slates.
2. `review` (month bucket) — complete / migrate / let go.
3. `look-above` (season list) — big items suggest month-sized moves.
4. `calendar` (month) — solidity scan: conflicts, trips, commitments.
5. `reflect` → `notes.energy` + `notes.relationships` — look within; relationships/parenting prompt (existing key).
6. `write-list` (month bucket) — copy nudges one fun thing.
7. `book-next`.

### Weekly — "Plan the week" (~30–45 min)
1. `narration` — time Tetris.
2. `inbox` — Look Around: triage the inbox to zero.
3. `review` (week bucket) — complete / migrate / make smaller / reassign / let go.
4. `look-above` (month list) — read-only.
5. `calendar` (week, day-by-day) — sneak additions, double-bookings.
6. `reflect` → `notes.energy` — look within.
7. `write-list` (week bucket) — soft "keep it under ~15" counter (count shown, never blocks).
8. `schedule-grid` — place the big rocks (existing StepSchedule).
9. `reflect` → `notes.concerns` — concerns & communication (shared with Iris, existing key).

No `book-next` — weekly is a standing slot.

### Daily — "Plan today" (~5–10 min, deliberately light)
1. `review` (carry-over) — look back, calm framing, one tap each.
2. `calendar` (today) — the day's timeline with gaps visible.
3. `reflect` → `notes.oneWord` — one word for the day; copy reminds: size the list to the day's open space.
4. `look-above` (week list) with pick — tap items to pull into today (existing bucket move; not linkage).

Voice on first run only; silent by default afterwards (per-horizon localStorage flag).

## Voice pipeline

- **Source of truth:** narration strings in `sessions.ts`. Same text on screen and spoken.
- **Generation:** `scripts/generate-narration.mjs` — hashes each narration string,
  calls ElevenLabs TTS only for hashes without an mp3, writes
  `public/narration/<hash>.mp3` + regenerates `narration.manifest.json`.
  Runs manually on Scott's Mac with `ELEVENLABS_API_KEY`. No runtime TTS dependency;
  key never reaches Vercel.
- **Voice selection:** generate 3–4 candidate samples first; Scott picks; voice ID
  pinned in the script.
- **Serving:** static from Vercel CDN. ~35 clips ≈ 5–8 MB, mono ~96 kbps.
- **Playback:** shell plays current step's clip on step entry. Session start is a tap
  (satisfies autoplay-gesture rule). Mute toggle in shell header, persisted.
- **Failure modes:** missing/failed audio → step fully usable, text always rendered,
  console warn.
- **Guard rail:** unit test walks configs; any narration string missing from the
  manifest fails the suite. **Bootstrap exception:** until the first generation run
  (needs Scott's key + voice choice), the manifest ships empty with
  `"bootstrap": true`, and the test passes-with-loud-warning in that state only.
  Setting `bootstrap: false` (done by the generation script) makes coverage mandatory
  from then on.

## Deletions (last build phase, only after preview verification)

Already deleted by `5a3993e0`: `lib/cadence/guidingGoals`, goal-action rails in the
sessions, break-into-horizon linkage.

Remaining for this branch:
- `planning/cadence/` — `CadenceSession`, `CadenceSessions`, tests. Replaced by configs.
- `WeeklyPlanningSession` + `StepWeekAhead`, `StepBuildTodos`, `StepConcerns`.
  **`StepSchedule` survives** (wrapped by `schedule-grid`). Keep whatever helpers in
  `weeklyPlanning.ts` the grid needs; delete the rest.
- `PlanTodaySession` (reuse `PlanItemCard` where it fits).
- Goals app: actions/milestones UI + `GoalAction`/`GoalMilestone` code paths.
- `financialDone` handling in `usePlanningSession` consumers (key stays harmless in old rows).
- `HorizonView`: swap session entry points to `GuidedSession`; add "Start planning
  session" button.

Survives, explicitly: bucket ladder, `usePlanningSession` (extended), triage
components, `lib/cadence/periods`, `StepSchedule`, every Today surface, the
`5a3993e0` reference-panel mechanics (absorbed into `LookAboveStep`).

## Testing

- **Config integrity:** every step has narration + registered type + unique id per
  session; five configs validated in one table test.
- **Manifest coverage:** as above (with bootstrap exception).
- **Shell (RTL):** next/back/skip; resume from persisted `stepIndex`; mute persistence;
  unknown-step-type renders nothing but doesn't crash (and the integrity test catches it).
- **Step types (RTL):** one focused test file each. Regression guard: `WriteListStep`
  must call `addTask` with `bucket` in options (the addTask-then-setBucket race).
- **Existing suites:** updated where they reference deleted components.
- **Gates:** `npx vitest run`, `npm run lint`, `npm run build` before any push
  (pre-push tsc alone has not matched Vercel's build historically).

## Rollout

1. All work on `worktree-five-horizons` off `origin/main`.
2. Build order: engine + configs → step types → wire three entry points
   (HorizonView buttons, Today's plan-today entry, sidebar/session launchers) →
   voice script + samples → deletions.
3. Verify on Vercel preview end-to-end (all five sessions, resume, mute, Iris-shared
   notes) before merging.
4. Merge to `main` (auto-deploys prod). Verify deployment actually ran
   (`gh api` deployments check — pushes have silently not deployed before).
5. Live data is untouched throughout: July plan (month/quarter buckets + session
   notes) flows into the new sessions unchanged.

## Open items needing Scott

- `ELEVENLABS_API_KEY` (generation time only) and voice choice from samples.
- Try the full flow on the preview URL before merge.
