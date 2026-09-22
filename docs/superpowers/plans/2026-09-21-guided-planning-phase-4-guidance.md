# Guided Planning Phase 4: Guidance and Reference — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Planning becomes guided without being required: Today offers one quiet line when a period is unplanned (first use: "Start with the year"), every saved session offers the next level down as an optional line, first-time hints explain the two rules people trip on and go away for good, a ◎ Goals control shows the year's, season's and month's goals as a reference anywhere in Plan, and a paper page can be brought into the session you are writing without creating duplicates.

**Architecture:** One pure module decides the nudge (`src/lib/planning/nudges.ts`) from the household's saved sessions (`planning_sessions`, read once by a small hook) and today's date; a small component renders it beside the existing "Your first week" card. The four "Plan <next> →" banners get one shared component. Hints are one component with a per-user localStorage key (the app's existing pattern; no new table). The Goals reference is one sheet (the `PlanningSheet` recipe) mounted from `PlanNavigation`, reading goals through the existing selectors. Paper import gets a second destination: `PageReviewSheet`'s payload is merged into the open session draft through one pure function that matches lines with the existing `findLikelyDuplicate` against the draft, the level above, the previous period and the current list, so nothing is created twice.

**Tech Stack:** React 19, TypeScript strict, Vite, Tailwind v4, Supabase JS, Vitest and Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-21-guided-planning-design.md` (Phase 4; "Planning is guided, not required"; "Paper is equivalent to typing"; the Mapping rows Paper / Goals reference / Guidance). Phases 1–3 plans in `docs/superpowers/plans/`.

## Global Constraints

- Worktree `.claude/worktrees/guided-planning-guidance`, branch `claude/guided-planning-guidance`, STACKED on `claude/guided-planning-season-year` (Phase 3); rebase onto main after #49 and the Phase 3 PR merge. One PR for the phase.
- Node: `export PATH=$HOME/.nvm/versions/node/v22.14.0/bin:$PATH`; `npx vitest run <path>` (never `npm test`); `npx tsc --noEmit -p tsconfig.app.json`; `npx eslint <files>` (react-hooks rules are errors in CI).
- `@/` imports; Nordic Journal styling; lucide icons only (the ◎ is `Target`); **no counts, scores or "weeks late" anywhere**; every nudge and hint is dismissible and never blocks anything.
- **Guidance only, nothing moves.** A nudge or a "Plan <next> →" line navigates; it never writes.
- **Nudge copy** (exact): first use → `Start with the year: plan 2026, then the season, the month and the week.` with `Plan 2026 →`; new week → `The week of Oct 4 isn't planned yet.` with `Plan the week →`; new month → `October isn't planned yet.` with `Plan October →`; new season → `Fall 2026 isn't planned yet.` with `Plan Fall 2026 →`; new year → `2027 isn't planned yet.` with `Plan 2027 →`. Each line ends with a muted `optional` and a `Not now` dismiss.
- **One nudge at a time**, highest level first; a dismissed nudge stays dismissed for that period token; a planned period (any household member's saved session) never nudges.
- Dismissals and hints persist per user in localStorage with keys `symphony.planNudge.dismissed.<uid>` (value: the token) and `symphony.hint.<name>.<uid>` (value `'1'`), wrapped in try/catch like `FIRST_WEEK_HIDE_KEY`.
- Paper import never creates a second copy of an item already on the draft, the level above, the previous period or the current list; matching uses `findLikelyDuplicate` from `src/lib/planDuplicates.ts` (the one matcher the app has).
- Routines unchanged. Month/Week/Season/Year session behaviour unchanged except the banner component swap.
- **Carried from Phase 3's final review (must land here):** (1) from Nov 20 the year nudge targets NEXT year via `/year?start=<Y+1>-01-01` and the completed-token check for the year uses `annual:<Y+1>` (the year page itself keeps landing on the current year); `cadenceDue.ts`'s current-year `annual` token is superseded by `nudges.ts` for the nudge; (2) the season page's year rail anchors on the year containing the SEASON's start (`bounds.start.getFullYear()`), not `planningPeriod({ level: 'year' })`, so a season starting next January shows next year's goals — a one-line change in `PeriodPlanPage.tsx` (`aboveStart` for `above === 'year'`) with a test; (3) the pinned "Week list" reference panel in `ReferenceLists.tsx` reads `weekListTasks` instead of `selectHorizonPool` (Phase 2 follow-up).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/planning/nudges.ts` (new) | `planningNudge(input)`: the one nudge to show, or null |
| `src/hooks/usePlanningSessionsIndex.ts` (new) | Reads the household's saved `planning_sessions` (horizon, token, savedAt) once; exposes the completed-token set |
| `src/components/plan/PlanningNudge.tsx` (new) | Renders the nudge line with dismiss |
| `src/apps/tasks/HomeViewContainer.tsx` (modify) | Mounts `PlanningNudge` beside `FirstWeekCard` |
| `src/components/plan/PlanNextLine.tsx` (new) | The shared "<period> is planned. … Plan <next> → · optional" banner |
| `src/components/plan/PeriodPlanPage.tsx`, `src/components/home/week/WeekPlanHost.tsx` (modify) | Use `PlanNextLine` |
| `src/components/plan/Hint.tsx` (new) + `src/lib/planning/hints.ts` (new) | Dismissible first-time hint + storage |
| `src/components/plan/PlanSession.tsx`, `src/components/reference/DayPlanPanel.tsx` (modify) | Mount the three hints |
| `src/components/plan/GoalsSheet.tsx` (new) + `src/lib/planning/goalsReference.ts` (new) | The ◎ Goals reference: year / season / month goals |
| `src/components/layout/PlanNavigation.tsx` (modify) | The ◎ Goals control |
| `src/lib/planning/paperIntoDraft.ts` (new) | Pure merge of a `PageReviewPayload` into a `SessionDraft` with matching |
| `src/components/capture/PageFromPaperFlow.tsx` (modify) | Offers "Add to the plan I'm writing" when a draft for that altitude and period exists |

---

### Task 0: The nudge, decided once

**Files:**
- Create: `src/lib/planning/nudges.ts`; Test: `src/lib/planning/nudges.test.ts`

**Interfaces:**
```ts
export type NudgeKind = 'first-use' | 'week' | 'month' | 'season' | 'year'
export interface PlanningNudgeResult { kind: NudgeKind; token: string; text: string; cta: string; to: string }
export function planningNudge(input: {
  now: Date; seasons: Seasons; weekStartsOn: WeekStart
  /** `${horizon}:${period_token}` for every saved session in the household (completedCadenceTokens). */
  completed: ReadonlySet<string>
  /** true when the household has never saved a session (any horizon). */
  neverPlanned: boolean
  dismissedToken: string | null
}): PlanningNudgeResult | null
```
Rules (all tokens as `cadenceDue.ts` builds them: `annual:2026`, `seasonal:2026-fall`, `monthly:2026-10`, `weekly:2026-10-4`):
1. `neverPlanned` → `first-use`, token `first-use`, to `/year`, text `Start with the year: plan ${Y}, then the season, the month and the week.`, cta `Plan ${Y} →`.
2. Else, in order, the first unplanned and undismissed:
   - **year**: within the last 6 weeks of the year (from Nov 20) or the first 2 weeks of a year → the NEXT year in November/December, THIS year in January; to `/year?start=${Y}-01-01`.
   - **season**: within 14 days before a season boundary (`seasonEndFor(now)`) → that next season; or within 14 days after a boundary → this season; to `/season`.
   - **month**: last 6 days of a month → next month; first 7 days → this month; to `/month`.
   - **week**: Saturday, Sunday or Monday → the week that contains the coming/just-started Monday… simpler and what the spec means: on Sat/Sun nudge NEXT week (`weekStartAnchor(now + 7d)`), on Mon–Tue nudge THIS week; to `/week` (the page opens on the current week; a next-week nudge navigates `/week?start=YYYY-MM-DD` — add that query param handling in Task 1 if `HomeView` lacks it; the map says `/week` honours only `?range`; so Task 1 adds `?start`).
   - A period is planned when `completed.has(`${horizon}:${token}`)`. Dismissed when `dismissedToken === token`.
3. Text/cta per the Global Constraints; the season label from `seasonLabel`, the month from `toLocaleDateString('en-US', { month: 'long' })`, the week from `formatWeekRangeShort`.

- [ ] **Step 1: Failing tests** — a table-driven `describe` with fixed `now` values: never planned → first-use; Sat Sep 26 2026 with week `2026-9-27` unplanned → week nudge with `The week of Sep 27 – Oct 3 isn't planned yet.`; same but completed has `weekly:2026-9-27` → null; Sep 26 with month unplanned → month wins over week (`October isn't planned yet.`); Aug 25 (7 days before the Fall boundary Sep 1 in `DEFAULT_SEASONS`) → season nudge `Fall 2026 isn't planned yet.`; Dec 1 → year `2027 isn't planned yet.`; dismissed token equal → skips to the next lower nudge; Wednesday mid-month with everything unplanned → null (no nudge outside the windows).
- [ ] **Step 2: RED. Step 3: implement. Step 4: `npx vitest run src/lib/planning/nudges.test.ts` + tsc. Step 5: commit** `feat(planning): one quiet nudge — which period to plan next`.

---

### Task 1: The nudge on Today, and `?start=` on the week page

**Files:**
- Create: `src/hooks/usePlanningSessionsIndex.ts` (+ test), `src/components/plan/PlanningNudge.tsx` (+ test)
- Modify: `src/apps/tasks/HomeViewContainer.tsx` (mount beside `FirstWeekCard`, lines ≈ 793–809), `src/components/home/HomeView.tsx` (the `/week` arrival effect ≈ lines 223–240: honour `?start=YYYY-MM-DD` → `weekRange(parseLocalYmd(start), weekStartsOn)`)
- Test: `src/components/home/HomeView.test.tsx` or the closest existing (`HomeViewSwitcher.test.tsx`) for `?start`

**Interfaces:**
- `usePlanningSessionsIndex(): { completed: ReadonlySet<string>; neverPlanned: boolean; loading: boolean; error: string | null; reload(): void }` — `supabase.from('planning_sessions').select('horizon, period_token, notes')` (RLS gives the household), `completedCadenceTokens(rows)` from `cadenceDue.ts` for the set (verify its exact token format and reuse it; do not build a second one), `neverPlanned = rows with notes.savedAt`.length === 0`. Refetch on `visibilitychange` like `useFirstWeekSignals`.
- `PlanningNudge({ uid })`: computes `planningNudge(...)` with `useHouseholdSeasons`, `readCadenceConfig().weekStartsOn`, the index, and the dismissed token from `symphony.planNudge.dismissed.<uid>`; renders `<p role="status" className="…text-[13px] text-neutral-600">{text} <Link to={to} className="font-semibold text-primary-700">{cta}</Link> <span className="text-neutral-400">optional</span> <button>Not now</button></p>`; hidden while loading or when null. Dismiss writes the token and hides.
- Mount: in `HomeViewContainer`, only for `fixedView !== 'week'` (the Today column), inside the same wrapper as `FirstWeekCard`, below it.

- [ ] Tests: the hook (mock supabase: rows → set + `neverPlanned`); the component (nudge shown → click "Not now" → hidden and key written; planned → nothing); `?start` on `/week` opens that week.
- [ ] Implement, run `npx vitest run src/hooks src/components/plan src/components/home src/apps/tasks` + tsc + eslint, commit `feat(today): the planning nudge — guided, never required`.

---

### Task 2: "Plan <next> →" is one optional line everywhere

**Files:**
- Create: `src/components/plan/PlanNextLine.tsx` (+ test)
- Modify: `src/components/plan/PeriodPlanPage.tsx` (the `justSaved` banner ≈ lines 592–596 and Phase 3's season/year banners), `src/components/home/week/WeekPlanHost.tsx` (≈ 143–147)

**Interfaces:** `PlanNextLine({ planned: string; nextLabel: string; to: string; onDismiss })` → `<div role="status" …><Check/> {planned} is planned. When you're ready, plan {nextLabel} with {planned} beside you. <Link to={to} className="font-semibold text-primary-700">Plan {nextLabel} →</Link> <span className="text-neutral-400">optional</span></div>` — a text link, not a filled button. Week: `nextLabel="today"`, to `/today`, copy `Each day, pick from this list.` (keep Phase 2's sentence, add the optional word). The four call sites pass their labels; `PeriodPlanPage.test.tsx` and `WeekPlanHost.test.tsx` assertions on `/plan the week/`, `/go to today/` are updated to the link names (`Plan the week →`, `Go to Today →` stays for the week).
- [ ] Tests, implement, run `src/components/plan src/components/home/week`, commit `feat(planning): the next level is one optional line after every save`.

---

### Task 3: First-time hints

**Files:**
- Create: `src/lib/planning/hints.ts` (`readHintSeen(name, uid)`, `markHintSeen(name, uid)`), `src/components/plan/Hint.tsx` (+ tests)
- Modify: `src/components/plan/PlanSession.tsx` (two hints), `src/components/reference/DayPlanPanel.tsx` (one hint)

**Interfaces:** `Hint({ name, uid, children })` renders `<p role="note" className="rounded-md bg-sage-50 px-3 py-2 text-[12.5px] text-neutral-700">{children} <button aria-label="Got it">Got it</button></p>` until dismissed. Names and copy (exact):
- `month-goals` (month/season Plan step, under the Goals heading): `Goals are what this period should add up to. They stay on this list; you look at them when you plan a week or a day.`
- `week-list` (week Plan step): `Adding a month task here puts it on this week's list too. The month keeps it and shows "on this week".`
- `day-pick` (Choose tasks, above "To plan"): `The week list stays whole. Picking only marks what you mean to do today.`
- [ ] Tests (shown once, hidden after Got it, key per uid), implement, run, commit `feat(planning): first-time hints, dismissible for good`.

---

### Task 4: ◎ Goals — the reference

**Files:**
- Create: `src/lib/planning/goalsReference.ts` (+ test), `src/components/plan/GoalsSheet.tsx` (+ test)
- Modify: `src/components/layout/PlanNavigation.tsx` (the control beside `Choose tasks`, ≈ lines 55–64)

**Interfaces:**
- `goalsReference({ goals, tasks, now, seasons, meId, layers }): { year: { label: string; to: string; rows: RefRow[] }; season: {...}; month: {...} }` with `RefRow { id: string; title: string; note?: string }`. Year = `goals.filter(g.year === now.getFullYear() && g.status === 'active' && matchesLayers(g.context, layers))`, note = `strategy || firstLine(notes)`; season = `selectPeriodTasks(layered, 'season', periodBounds('season', now, seasons).start, true, meId, seasons).filter(isGoal && !completed)`; month likewise with `'month'`. Labels `2026`, `Fall 2026`, `September`; `to` = `/year`, `/season`, `/month`.
- `GoalsSheet({ open, onClose })`: the `PlanningSheet` recipe (portal, scrim, `role="dialog" aria-modal aria-label="Goals"`, `inert` when closed); heading `Goals` with sub-line `For reference. Edit them on their pages.`; three sections, each `<h3>{label} <Link to>Open →</Link></h3>` and a list of rows (`Target` icon, title, muted note); empty section: `Nothing yet.` Mounts `GoalsProvider` itself (it is not in the Shell tree).
- `PlanNavigation`: a button `aria-label="Goals"` with `Target` + `Goals`, `aria-expanded`; opens the sheet on every width (ruling: one component; the desktop pinned-panel route is a follow-up).
- [ ] Tests (selector groups; sheet lists three sections and closes on Escape; nav button toggles), implement, run `src/lib/planning src/components/plan src/components/layout src/shell`, commit `feat(plan): ◎ Goals — the year, season and month goals beside you`.

---

### Task 5: Paper into the draft, with matching

**Files:**
- Create: `src/lib/planning/paperIntoDraft.ts` (+ test)
- Modify: `src/components/capture/PageFromPaperFlow.tsx`, `src/components/capture/PageReviewSheet.tsx` (a second primary action when a draft target exists)

**Interfaces:**
```ts
export interface DraftTarget { level: SessionLevel; periodStart: string /* ymd */; label: string }
export function draftTargetFor(altitude: PageAltitude, now: Date, seasons: Seasons, userId: string | null): DraftTarget | null
  // week → the week being planned (current, or next when Sat/Sun); month → planningPeriod month; season → planningPeriod season; year → the year. Returns null when no draft exists for that (level, periodStart) — readDraft(userId, level, periodStart) === null.
export function mergePaperIntoDraft(draft: SessionDraft, payload: PageReviewPayload, ctx: { open: Task[]; above: Task[]; current: Task[] }): { draft: SessionDraft; added: string[]; matched: Array<{ title: string; matchedTo: string; where: 'draft' | 'above' | 'previous' | 'current' }> }
```
Rules: goal lines (`placement.kind === 'goal'` or `goal: true`) → `newGoals`; task lines → `newTasks` (with `day` when the line has a date inside a week draft); each line is first matched with `findLikelyDuplicate(title, existing)` against, in order, the draft's own `newGoals`/`newTasks`, `above`, `open` (the previous period), `current`; a match is reported and NOT added; unmatched lines get `id: crypto.randomUUID()` and `context: null`. Day-facts and recurring lines are not for the draft and are reported under `matched` with `where: 'skipped'`? No — they stay on the direct-commit path: the sheet's second action commits ONLY goal/task lines into the draft and leaves day-facts/recurring/notes to the existing `commitPage` (call it with the payload minus the draft-bound items).
- `PageFromPaperFlow`: when `draftTargetFor(...)` is non-null, `PageReviewSheet` shows a second primary action `Add to the plan I'm writing (${label})`; on it: `mergePaperIntoDraft` → `writeDraft(userId, merged.draft)`; `commitPage` for the rest; a toast `N lines added to the ${label} draft` — NO: no counts. Toast: `Added to the ${label} draft. Open it to review.` with the period route. The existing direct commit stays as the other action.
- [ ] Tests: matching against each of the four sources; goal vs task routing; day on a week draft; nothing created twice on a re-import of the same page (idempotent by title match against the draft). Component test: the second action appears only when a draft exists.
- [ ] Implement, run `src/lib/planning src/components/capture`, commit `feat(paper): a page can join the plan you are writing, matched, never duplicated`.

---

### Task 6: Verify, document, PR

- Full suite (only `connectors/src/whatsapp/adapter.test.ts` may fail), tsc, lint, build.
- Demo walk on `vite preview --port 5196`: with a fresh-looking state (the demo has sessions — use `Not now` paths and a Saturday clock via `vi`? no: check the nudge for the week on the real clock; for first-use, verify via the unit test and by reading the component with `neverPlanned` forced in a test); the Goals sheet from /week and /month; the three hints appear once; "Plan <next> →" lines on all four pages; paper: import the demo's sample page into an open October draft and confirm matched lines are not duplicated.
- Docs: spec Phase 4 "Shipped" + as-built notes (windows, tokens, storage keys); `docs/onboarding.md` gets a pointer that the guided path is Phase 5.
- Draft PR "Guided planning, phase 4: guidance and reference".

## Self-review
- Spec coverage: nudges (first use, new season/month/week — and year) → T0/T1; "Plan <next> →" after every save → T2; dismissible hints → T3; ◎ Goals drawer (2026, the current season, the current month) → T4; paper import into the draft with matching → T5. AI-optional and routines untouched.
- Placeholders: none; copy is exact; the one open design point (desktop pinned panel for Goals) is ruled to the sheet with a follow-up note.
- Type consistency: `planningNudge`, `PlanningNudgeResult`, `usePlanningSessionsIndex`, `PlanNextLine`, `Hint`/`hints.ts`, `goalsReference`/`GoalsSheet`, `draftTargetFor`/`mergePaperIntoDraft`/`DraftTarget` — same names across tasks.
