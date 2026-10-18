# Friday session, Stage 1: a calm Week, the deck, and a default that drains

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Week page stops looking endless. Its review and planning become one deck of four-choice cards dealt in hands of 5, and untouched things drain to Later on their own.

**Architecture:**
- **Pure logic in `src/lib`, one file per job:**
  - `deck.ts` decides which cards and in what order.
  - `drain.ts` decides what drains.
  - `foldDay.ts` decides what a day column shows.
  - `weekRhythm.ts`, extended, decides what folds into "Weekdays".
- **Thin components:** a `Deck` with its `DeckCard` and `WeekStrip`, plus the restored `Stamp`.
- **Writes reuse the existing writers in `WeekViewV2`**, gathered into one `useDeckActions` hook, each through `activity.run` with its Undo.
- **`WeekV2`'s `?review=1` and `?plan=1` render the `Deck`** instead of `PeriodReview` and `PeriodPlan` for the week. Month, Season and Year keep the old screens until Stage 3.

**Tech Stack:** React, TypeScript, Vite, Tailwind with the CSS in `src/index.css` and `src/styles/*`, Supabase through `useSupabaseTasks`, Vitest with happy-dom.

**Spec:** `docs/superpowers/specs/2026-10-18-friday-weekly-session-design.md`. Revision 2 governs where it conflicts with the original sections.

## Global Constraints

- **Setup:** work on a new branch `claude/friday-stage1`, cut from this branch and rebased onto a freshly fetched `origin/main`. Never commit in the main worktree. Never push to `main` without Scott's approval; pushing to main deploys.
- **Tests in this worktree:** link `node_modules` from `../symphonyOS/node_modules`, including the connectors' `node_modules` if present, and use Node 22. Run `npx vitest run <file>`. `src/test/setup.ts` mocks Supabase, so no `.env` is needed for unit tests.
- **Symphony structures, never guides:** no choice is preselected or recommended. Cards show facts only. No praise, no exclamation marks, no emoji, no AI summaries.
- **One card at a time.** A card shows at most four choices before one is tapped, in this order: **Done · This week · Later · Let go**.
- **Never show the size of the pile:** deck counters count the hand ("2 of 5"), never the backlog.
- **Every write goes through `activity.run(label, command, { ids, undo })`** with an Undo that restores the previous placement (`placementOf(t)` in `WeekViewV2.tsx:188`, or the commitments snapshot used by `planCarry`).
- **Privacy:** the deck, its counts, the drain and the Week page's counts use the same filtered task list the Week page renders (`tasks.filter(t => !t.isGoal).filter(lens.keep)`, plus the domain filter). A private Work or Personal task must never appear, or be counted, in a Family view.
- **Later means the existing Someday bucket** (`bucket: 'someday'`). Nothing is ever hard-deleted by the deck or the drain.
- **Exact copy**, used verbatim:
  - **Deck intro:**
    - heading "Where things go"
    - count "{n} done last week"
    - line "Everything without a home this week, one card at a time, closest first."
    - aged line, only when n > 0: "{n} older things, untouched for 3+ weeks, already went to Later on their own · See them"
    - button "Deal the first hand"
  - **Source pills:** "This week", "Last week", "Inbox".
  - **Fact lines:**
    - this week: "On this week · no day yet"
    - last week: "Not done · carried {n} week" or "… {n} weeks" when n ≥ 1, otherwise "Not done"
    - inbox: "Captured {Weekday}"
  - **Serves line:** "For {Month} · {goal title}".
  - **Reveals:**
    - This week: "Tap a day · what's already there is shown", plus the button "This week, no day yet"
    - Later: label "When", with "Next week", "This month", "Next month", "This season", "Someday", "Pick a date…"
  - **Hand end:**
    - heading "That's a hand"
    - line "Stop here and anything left from last week goes to Later. The Inbox keeps its own."
    - buttons "That's enough for this week" (primary) and "Deal {n} more"
  - **Empty deck:** heading "Nothing left without a home", button "Back to the week".
  - **Week page:**
    - "{n} done last week · Review", or "{n} done last week · reviewed {Weekday}"
    - "{n} without a day · Place them"
    - "+{n} more", "Show less"
- **Thresholds:** `DRAIN_AFTER_DAYS = 21`, `HAND_SIZE = 5`, `DAY_CAP = 4`, `MIN_TASKS_SHOWN = 2`.
- **Stamps:**
  - Done → `done`
  - a day, or "This week, no day yet" → `carried`
  - any Later choice → `someday`
  - Let go → `dropped`
  - Stamp words: done "DONE", carried "CARRIED", someday "LATER", dropped "LET GO".

## Review Focus

1. **"Family only" view with a private Work task left over from last week.** The deck must not deal it, and "{n} done last week" must not count it. Test in Task 6.
2. **A household whose week starts Saturday.** "Last week", the strip's day order, and which columns are weekend-wide follow `weekStartsOn`, not Monday. Tests in Tasks 2 and 8.
3. **Iris ticks a card's task on the wall while Scott is mid-deck.** The deck skips cards whose task is now completed or already decided, instead of showing a stale card. Test in Task 5.
4. **The drain must leave alone:**
   - completed tasks
   - tasks with a future `scheduledFor`
   - anything touched in the last 21 days (`updatedAt` is stamped by the database)
   - month, season and someday tasks

   Every drained task comes back with a single Undo. Test in Task 3.
5. **A short last hand.** With 3 cards left, the counter reads "1 of 3", "Deal 3 more" shows the real remainder, and a deck with no cards opens straight onto "Nothing left without a home", without "Deal the first hand". Test in Task 5.

---

### Task 1: Restore the Stamp

**Files:**
- Create: `src/components/plan/v2/Stamp.tsx`. Restore it with `git show 3e86d655^:src/components/plan/v2/Stamp.tsx > src/components/plan/v2/Stamp.tsx`.
- Modify: in the same file, the `WORD` map: `someday: 'LATER'`, `dropped: 'LET GO'`.
- Test: `src/components/plan/v2/Stamp.test.tsx`

**Interfaces:**
- Produces:
  - `export type StampKind = 'done' | 'carried' | 'someday' | 'dropped'`
  - `export function Stamp({ kind, context, on, fresh }: { kind: StampKind; context: string; on?: Date | null; fresh?: boolean })`
  - Its styles already exist in `src/index.css` (`.pv2-stamp`, `.is-fresh`, `@keyframes pv2-thump`, the four inks, night lighting, reduced motion).

- [ ] **Step 1:** Link `node_modules` (Global Constraints) and confirm `npx vitest run src/lib/week/weekRhythm.test.ts` passes before touching anything.
- [ ] **Step 2: Write the failing test.** `Stamp` with `kind="someday" context="week of oct 24"` renders `role="img"` with aria-label `"later — week of oct 24"`, and the rim text contains `LATER · WEEK OF OCT 24 · SYMPHONY`. Also check `kind="dropped"` → aria-label begins `"let go — "`, and `fresh` adds the class `is-fresh`.
- [ ] **Step 3:** Run `npx vitest run src/components/plan/v2/Stamp.test.tsx`. Expect FAIL (no module).
- [ ] **Step 4:** Restore the file and change the two `WORD` entries.
- [ ] **Step 5:** Run the test. Expect PASS.
- [ ] **Step 6:** Commit with the message "Stamp: restored for the deck; Later and Let go words".

### Task 2: Who's in the deck — `buildDeck`

**Files:**
- Create: `src/lib/planning/deck.ts`
- Test: `src/lib/planning/deck.test.ts`

**Interfaces:**
- Consumes: `weekReviewState(task, weekStart, { isCurrent })` and `ReviewState` from `src/lib/planning/periodReview.ts`; `Task` and `TaskCommitment` from `src/types/task.ts`.
- Produces:
  - `export type DeckSource = 'this-week' | 'last-week' | 'inbox'`
  - `export interface DeckCard { key: string; task: Task; source: DeckSource; facts: string; serves?: string }`
  - `export const HAND_SIZE = 5`
  - `export function carriedWeeks(task: Task): number` counts `commitments` with `level === 'week'` and `status === 'carried'`.
  - `export function buildDeck(input: { tasks: Task[]; weekStart: Date; lastWeekStart: Date; isCurrent: boolean; servesOf?: (t: Task) => string | undefined; only?: DeckSource }): DeckCard[]`

- [ ] **Step 1: Write the failing tests.**
  - `orders closest first`: given one inbox task, one last-week open task and one this-week task with no `scheduledFor`, the sources come out `['this-week','last-week','inbox']`.
  - `inbox newest first`: two inbox tasks come out by `createdAt` descending.
  - `skips completed, goals and decided`: a completed task, an `isGoal` task, and a last-week task whose `weekReviewState` is not `'open'` are all absent.
  - `facts`:
    - this-week → `"On this week · no day yet"`
    - last-week with two carried week commitments → `"Not done · carried 2 weeks"`
    - one carried → `"Not done · carried 1 week"`
    - none → `"Not done"`
    - inbox created on a Tuesday → `"Captured Tuesday"`
  - `serves`: `servesOf` returning `"For October · Get the house ready for winter"` is copied onto the card.
  - `only`: `only: 'this-week'` returns only this-week cards.
  - `Saturday weeks`: with `weekStart` set to a Saturday and `lastWeekStart` 7 days earlier, a task committed to the previous Saturday-week comes out as `last-week`.
- [ ] **Step 2:** Run `npx vitest run src/lib/planning/deck.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement `buildDeck`.** Which task belongs to which source:
  - **this-week:** `!t.completed && !t.isGoal && weekReviewState(t, weekStart, { isCurrent }) === 'open' && !t.scheduledFor`
  - **last-week:** `weekReviewState(t, lastWeekStart, { isCurrent: false }) === 'open'`
  - **inbox:** `t.bucket === 'inbox' && !t.completed`

  Never put a task in two groups: the first match wins, in the order above. Use `key = task.id`.
- [ ] **Step 4:** Run the test. Expect PASS.
- [ ] **Step 5:** Commit with the message "Deck: which cards, in which order".

### Task 3: The default that drains — `drain.ts`

**Files:**
- Create: `src/lib/planning/drain.ts`
- Test: `src/lib/planning/drain.test.ts`

**Interfaces:**
- Consumes: `DeckCard` from Task 2.
- Produces:
  - `export const DRAIN_AFTER_DAYS = 21`
  - `export function staleForDrain(tasks: Task[], now: Date, afterDays = DRAIN_AFTER_DAYS): Task[]`
  - `export function undealtLastWeek(cards: DeckCard[], decided: ReadonlySet<string>): Task[]`

- [ ] **Step 1: Write the failing tests.**
  - **`staleForDrain` includes:** an inbox task, and a week task whose only week commitments are `carried`, both with `updatedAt` 22 days before `now`.
  - **`staleForDrain` excludes:**
    - a completed task
    - an `isGoal` task
    - a task updated 20 days ago
    - a week task with `scheduledFor` after `now`
    - tasks in the `month`, `quarter` and `someday` buckets
  - **`undealtLastWeek`:** given cards `[this-week a, last-week b, last-week c, inbox d]` and `decided = {b}`, it returns `[c]`. Inbox and this-week cards are never returned.
- [ ] **Step 2:** Run `npx vitest run src/lib/planning/drain.test.ts`. Expect FAIL.
- [ ] **Step 3:** Implement both functions. A task counts as touched when its `updatedAt` is later than `now - afterDays` days. Only `bucket` `'inbox'` or `'week'` tasks are eligible.
- [ ] **Step 4:** Run the test. Expect PASS.
- [ ] **Step 5:** Commit with the message "Drain: what goes to Later on its own".

### Task 4: The writers — `useDeckActions`

**Files:**
- Create: `src/components/home/week/useDeckActions.ts`
- Test: `src/components/home/week/useDeckActions.test.ts`

**Interfaces:**
- Consumes:
  - from `WeekViewV2`'s scope (`WeekViewV2.tsx:216` and around L960–1010): `toggleTask`, `updateTask`, `keepForward(id, { weekStart }, fromWeekStart)`, `onUpdateTask`, `deleteTask`
  - `gated.pushTask` and `gated.setBucket`, `applyTriageWhen(when, id, handlers)` (`src/lib/triage/applyWhen.ts:56`)
  - `timingRemoval(task, 'day' | 'all')` (`src/lib/planning/planActions.ts:84`), `lineDropUpdates(t, { kind: 'day', at })`
  - `liveCommitments` and `bootstrapCommitments` (as used by `planCarry`)
  - `activity.run`
  - `DeckCard` (Task 2)
- Produces:
  - `export type LaterWhen = 'next-week' | 'this-month' | 'next-month' | 'this-season' | 'someday'`
  - `export interface DeckActions { done(c: DeckCard): Promise<boolean>; placeOnDay(c: DeckCard, day: Date): Promise<boolean>; keepThisWeek(c: DeckCard): Promise<boolean>; later(c: DeckCard, when: LaterWhen): Promise<boolean>; laterOnDate(c: DeckCard, date: Date): Promise<boolean>; letGo(c: DeckCard): Promise<boolean>; drain(tasks: Task[]): Promise<boolean> }`
  - `export function useDeckActions(deps: DeckDeps): DeckActions`, where `DeckDeps` names exactly the consumed functions plus `weekAnchor`, `lastWeekStart` and `nextWeekStart: Date`.

- [ ] **Step 1: Write the failing tests.** Use mocked deps and a fake `run` that calls `command()` and records `undo`.
  - **`done`:** calls `toggleTask(id)`. The undo calls it again.
  - **`placeOnDay`:**
    - for a `last-week` card: `keepForward(id, { weekStart: weekAnchor }, lastWeekStart)`, then `onUpdateTask(id, lineDropUpdates(t, { kind: 'day', at: day }))`. The undo restores commitments (the `planCarry` pattern, `restore`).
    - for a `this-week` or `inbox` card: only the `lineDropUpdates` patch. The undo restores the patched keys.
  - **`keepThisWeek`:** for a `last-week` card, `keepForward` with no day. For an `inbox` card, `applyTriageWhen('this-week', …)`.
  - **`later('next-week')`:** clears the day, then `keepForward(id, { weekStart: nextWeekStart }, <the card's week>)`. `later('this-month' | 'next-month' | 'this-season' | 'someday')` calls `applyTriageWhen` with that value. The undo restores `placementOf(t)`.
  - **`laterOnDate`:** `gated.pushTask(id, date)`.
  - **`letGo`:**
    - week cards → `updateTask(id, timingRemoval(t, 'all').updates)`, undo with `.previous`
    - inbox cards → `setBucket(id, 'someday')`. Nothing is deleted; Global Constraints say "never hard-deleted".
  - **`drain(tasks)`:** one `run` call, labelled `"Move {n} untouched things to Later"`, that calls `setBucket(id, 'someday')` for each task. Its undo restores each task's `placementOf`.
- [ ] **Step 2:** Run `npx vitest run src/components/home/week/useDeckActions.test.ts`. Expect FAIL.
- [ ] **Step 3:** Implement. Move `placementOf` from `WeekViewV2.tsx:188` to `src/lib/planning/placement.ts` and export it as `export function placementOf(t: Task): Partial<Task>`. Import it in both files; behaviour is unchanged.
- [ ] **Step 4:** Run this test plus `npx vitest run src/components/home/week/WeekViewV2.test.tsx`. Expect PASS.
- [ ] **Step 5:** Commit with the message "Deck: the writers, each with Undo".

### Task 5: The deck — `Deck`, `DeckCard`, `WeekStrip`

**Files:**
- Create:
  - `src/components/plan/deck/Deck.tsx`
  - `src/components/plan/deck/DeckCardView.tsx`
  - `src/components/plan/deck/WeekStrip.tsx`
  - `src/styles/deck.css` (import it where `canvas-plan.css` is imported)
- Test: `src/components/plan/deck/Deck.test.tsx`

**Interfaces:**
- Consumes: `Stamp` (Task 1), `DeckCard`, `HAND_SIZE` (Task 2), `DeckActions`, `LaterWhen` (Task 4).
- Produces:
  - `export interface StripDay { key: string; date: Date; label: string; isWeekend: boolean; lines: string[]; more: number }`
  - `export function WeekStrip({ days, onPick, onNoDay }: { days: StripDay[]; onPick: (d: Date) => void; onNoDay: () => void })`
  - `export function Deck(props: { cards: DeckCard[]; doneLastWeek: number; aged: number; onSeeAged: () => void; actions: DeckActions; stripDays: StripDay[]; mode: 'full' | 'place'; onFinish: (decided: ReadonlySet<string>) => void; onExit: () => void })`

**Behaviour the tests pin:**
- **Intro:** shows the intro copy (Global Constraints) in `mode: 'full'`. The aged line appears only when `aged > 0`, and "See them" calls `onSeeAged`. With `mode: 'place'` the first card shows at once.
- **One card at a time:** each card shows its source pill, its serves line (if any), the title, the facts, and the four buttons. No reveal is open at first.
- **Reveals:**
  - "This week" opens the `WeekStrip`: seven tiles, at most 3 lines each, then "+{more} more". Tapping a tile calls `actions.placeOnDay(card, date)`. "This week, no day yet" calls `keepThisWeek`.
  - "Later" opens the six Later choices. "Pick a date…" is a native date input that calls `laterOnDate`.
- **After any choice:** the `Stamp` (with `fresh`) is added to the card. About 850ms later the next card renders. Use fake timers in tests.
- **Counter and hands:**
  - The counter reads "{i} of {hand}", where `hand = min(HAND_SIZE, remaining at the hand's start)`.
  - After `HAND_SIZE` decisions the hand-end screen shows. "Deal {n} more", where `n = min(HAND_SIZE, remaining)`, starts a new hand. "That's enough for this week" calls `onFinish(decided)`.
- **Stale cards:** cards whose task is now `completed`, or whose `key` is in `decided`, are skipped when dealing. Render from the current `cards` prop on every pass.
- **Empty deck:** when no cards remain, show "Nothing left without a home" and "Back to the week". In `mode: 'full'` with no cards at all, skip the intro's "Deal the first hand" and show the empty screen.

- [ ] **Step 1: Write the failing tests**, one per behaviour above. Include the Review Focus cases: a card whose task becomes completed between renders is skipped; with 3 cards the counter shows "1 of 3"; with 7 cards the hand end shows "Deal 2 more"; with 0 cards the screen goes straight to empty.
- [ ] **Step 2:** Run `npx vitest run src/components/plan/deck/Deck.test.tsx`. Expect FAIL.
- [ ] **Step 3: Implement.** Use the card's look from the approved prototype (`friday-session-prototype-v17.html`): a white card with a 1px neutral-200 border and 18px radius on the page's scenery, Crimson Pro titles, DM Sans for everything else, and sage choice buttons in four equal columns. Let go is the quiet style. The strip widens the card to `min(700px, 100%)`. The stack shows two ghost cards behind. No CSS file may hard-code a hex colour that a token in `src/index.css` already provides.
- [ ] **Step 4:** Run the test. Expect PASS. Then check it visually at 1280px and 390px wide in `npm run dev` (Task 7 wires the route) and fix any overflow.
- [ ] **Step 5:** Commit with the message "Deck: one card at a time, four choices, hands of 5, the stamp".

### Task 6: Wire the deck into the Week

**Files:**
- Modify: `src/components/home/week/WeekViewV2.tsx`, at the plan and review section (about L920–1015). Build the deck there; keep `planCarry`, `reviewLines` and `weekPlan` only where Month still needs them. The Week does not.
- Modify: `src/components/plan/v2/WeekV2.tsx`. For the week, `?review=1` and `?plan=1` render `<Deck mode="full">`, and the new `?place=1` renders `<Deck mode="place">` (only `this-week` cards). `PeriodReview` and `PeriodPlan` stay imported for the other horizons; nothing else changes there.
- Test: `src/components/home/week/WeekViewV2.test.tsx` (add cases)

**Interfaces:**
- Consumes: Tasks 2–5. `usePeriodReview('weekly', weekToken(lastWeekStart)).finish({ wentWell: '', didnt: '' })` marks the review done.
- Produces: `WeekV2` gains the prop `deck: { cards: DeckCard[]; doneLastWeek: number; aged: number; actions: DeckActions; stripDays: StripDay[]; onFinish: (decided: ReadonlySet<string>) => void }` and drops `reviewLines` and `plan` for the week horizon.

- [ ] **Step 1: Write the failing tests.**
  - **Family-only privacy:** with the "Family only" filter on, a private Work task left open from last week is absent from `deck.cards`, and `doneLastWeek` doesn't count a completed private Work task. Use the existing test fixtures and the lens mock pattern in this file.
  - **Opening the full deck:** runs the drain once. `actions.drain` is called with exactly `staleForDrain(scopedTasks, now)`, and `aged` equals its length. Reopening in the same week doesn't drain again; key it on `planning_sessions` notes `drainedAt` for the week token, via `usePlanningSession('weekly', token).save`.
  - **`onFinish(decided)`:** calls `actions.later(card, 'someday')` for each task in `undealtLastWeek(cards, decided)` (inside one `run`), then `usePeriodReview(...).finish`.
  - **`servesOf`:** for a task with `goalTaskId` pointing to an October month goal, returns `"For October · {goal title}"`.
  - **`stripDays`:** seven days from `weekAnchor`; `lines` hold the day's timed events and tasks by time (titles only); weekend flags follow `weekStartsOn`.
- [ ] **Step 2:** Run `npx vitest run src/components/home/week/WeekViewV2.test.tsx`. Expect FAIL on the new cases.
- [ ] **Step 3: Implement the wiring.** "See them" navigates to `/someday`.
- [ ] **Step 4:** Run this file plus `src/components/plan/v2/WeekV2.toolbar.test.tsx` and `src/components/plan/review/*.test.tsx`. Expect PASS.
- [ ] **Step 5:** Commit with the message "Week: review and plan open the deck; the drain runs once a week".

### Task 7: The Week page opens with progress, and No day yet becomes a count

**Files:**
- Modify: `src/components/canvas/week/WeekCanvas.tsx`
  - `weekendFold` (L449–465): keep the fold of past weekend days, but drop the "Not done: …" text. The button reads "This past weekend".
  - `nodayTray` (L407–443) on desktop and tablet becomes a single line.
- Modify: `src/styles/canvas-today.css` (`.wc-weekend-fold*`) and `src/styles/canvas.css` (`.wc-noday*`).
- Test: `src/components/canvas/week/WeekCanvas.test.tsx`

**Interfaces:**
- Consumes: the routes from Task 6.
- Produces: new `WeekCanvasProps` fields `progress?: { done: number; reviewedOn?: Date; onReview: () => void }` and `onPlaceUnplaced?: () => void`. `WeekViewV2` passes them: `onReview` → `?review=1`, `onPlaceUnplaced` → `?place=1`.

- [ ] **Step 1: Write the failing tests.**
  - **Progress line:** with `progress={{ done: 9, onReview }}` the canvas shows "9 done last week · Review", and clicking "Review" calls `onReview`. With `reviewedOn` set to a Friday it shows "9 done last week · reviewed Friday".
  - **No "Not done" text:** the past-weekend fold never contains "Not done".
  - **No day yet as a count:** with 4 unplaced tasks it shows "4 without a day · Place them" and lists no titles; "Place them" calls `onPlaceUnplaced`. With 0 unplaced, nothing renders.
  - Update the existing No day yet and weekend-fold tests that asserted titles and "Not done" to the new behaviour. The phone branch (`wc-phone`) keeps its No day yet list in this stage, so leave its tests alone.
- [ ] **Step 2:** Run `npx vitest run src/components/canvas/week/WeekCanvas.test.tsx`. Expect FAIL.
- [ ] **Step 3:** Implement. Pass `progress` and `onPlaceUnplaced` from `WeekViewV2`, using the same scoped `doneLastWeek` as Task 6.
- [ ] **Step 4:** Run the test. Expect PASS.
- [ ] **Step 5:** Commit with the message "Week: open with progress; No day yet is a count".

### Task 8: Each day shows a few things; repeats show once

**Files:**
- Create: `src/lib/week/foldDay.ts`, with test `src/lib/week/foldDay.test.ts`
- Modify: `src/lib/week/weekRhythm.ts` and `src/lib/week/weekRhythm.test.ts`. A task (not only a routine) whose normalised title and time are the same on all the week's weekdays, or on all 7 days, is lifted into the rhythm lines. On those days it leaves the columns.
- Modify:
  - `WeekCanvas.tsx` `dayColumn` (L285–340): apply `foldDay` and add per-day expand state.
  - `peopleOf` (L249–256): hide the avatar when the viewer is the only assignee.
  - `.wc-strip` columns: weekend days wider.
- Modify: `src/styles/canvas-today.css` (L190–216 and L293–299). Between 768px and 1100px, stack days vertically with today first, instead of the 4-column wrap.
- Test: `WeekCanvas.test.tsx` (add cases)

**Interfaces:**
- Produces:
  - `export const DAY_CAP = 4`, `export const MIN_TASKS_SHOWN = 2`
  - `export function foldDay<T extends { timed: boolean }>(items: T[], cap = DAY_CAP, minTasks = MIN_TASKS_SHOWN): { shown: T[]; hidden: number }`. It never hides a timed item. Untimed items fill the space left (`max(minTasks, cap - timedCount)`).
  - New `WeekCanvasProps` field `viewerId?: string`, passed from `WeekViewV2`'s `meId`.

- [ ] **Step 1: Write the failing tests.**
  - **`foldDay`:**
    - 3 timed + 4 untimed → `shown` has the 3 timed and 2 untimed, `hidden: 2`
    - 1 timed + 5 untimed → 1 + 3 shown, `hidden: 2`
    - 5 timed + 1 untimed → 5 + 1 shown (minTasks 2 allows both untimed slots), `hidden: 0`
    - 0 items → `hidden: 0`
  - **`weekRhythm`:** a "Pick up from FFG" task at 17:15 on all five weekdays of a 7-day week yields a "Weekdays" line containing "5:15 Pick up from FFG" and is removed from those days' entries. The same task missing one weekday is not lifted.
  - **`WeekCanvas`:**
    - a day with 7 untimed tasks shows "+3 more"; clicking it shows all 7 and "Show less"
    - a timed event is never folded
    - with `viewerId` equal to the only assignee, no avatar renders; with another assignee, the avatar renders
    - with `weekStartsOn` Saturday (Saturday-first `days`), the strip's computed `grid-template-columns` gives the first two columns `minmax(0,1.5fr)` and the rest `minmax(0,1fr)`
- [ ] **Step 2:** Run `npx vitest run src/lib/week/foldDay.test.ts src/lib/week/weekRhythm.test.ts src/components/canvas/week/WeekCanvas.test.tsx`. Expect FAIL.
- [ ] **Step 3:** Implement. Weekend days are the days where `isWeekend` (already used by `weekendFold`) is true; set the `.wc-strip` style `gridTemplateColumns` from `days`.
- [ ] **Step 4:** Run the three files. Expect PASS. Then run the full suite with `npx vitest run` and `npx tsc --noEmit`. Expect both green.
- [ ] **Step 5:** Check visually in `npm run dev` at 1440, 1024 (stacked) and 390px, in daytime and nighttime lighting. Confirm no row runs under the landscape (`--scenery-clearance`).
- [ ] **Step 6:** Commit with the message "Week: a few things a day, repeats once, a wider weekend, names only when not yours".

### Task 9: Branch review and handoff

- [ ] **Step 1:** Rebase onto a freshly fetched `origin/main` and resolve conflicts. Rerun `npx vitest run` and `npx tsc --noEmit`.
- [ ] **Step 2:** Run `npm run build`. Expect success.
- [ ] **Step 3:** Record a real-UI walkthrough with `scripts/learn-videos` (Scott prefers real-app videos). Cover: the Week page as it now looks, "Review", one hand of the deck with each of the four choices, the stamp, "That's enough for this week", "See them" → Someday, and "Place them".
- [ ] **Step 4:** Stop here. Report to Scott what is implemented, what is tested, and that nothing is deployed. Ask before any push to `main`.

---

## Stages 2–4 (outline; each gets its own plan when Stage 1 ships)

**Stage 2: the Friday session around the deck.**
- **Start screen:** Family, Just me, or Quick. The session is offered on the evening before `weekStartsOn`.
- **Talk:** the two check-in places and the saved topics (`needsDiscussion`, Discussions threads with both people) as a fan, then topic cards. "Talked about it" gets the `done` stamp; "Not tonight" leaves it.
- **Wins** and **Close:** priorities, the weekend at a glance, wins, and "N things are in Later". Then land on **Today**.
- **The room:** the place's scenery and lighting.
- **Family session mechanics:** the shared-screen "Adding as" person toggle; a household-level session record, since `planning_sessions` is per author today and solo notes need a privacy rule verified with real accounts; signing in on the wall for the session (the display login stays read-only).
- **Drop it in:** the bar answers only with a change card.
- **Settings:** the drain threshold.

**Stage 3: Month, Season and Year as two screens.**
- **Carry forward or not:** cards with Done · To {next} · Someday · Let go, via `periodMoves` and `keepForward`.
- **The new list:** a plain list, with the level above beside it to read. It replaces `PeriodReview` and `PeriodPlan` on those pages. Cards carry the "For {level above} · …" line.

**Stage 4: the priority mark.**
- Tap any task or event on the Week page (and in the session's week cards) to mark it a priority.
- Stored on the Symphony side for calendar events, following the item's privacy.
- Priorities sort first in the Week, Today and the wall.
