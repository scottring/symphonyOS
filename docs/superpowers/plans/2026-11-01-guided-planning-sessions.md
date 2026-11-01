# Guided Planning Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace each level's Plan button with a guided session (Hart-Unger's steps) that runs on the real page: a steps rail where the horizon strip was, the page in the middle, and the shell's conversation panel as the guide, sorting what Scott says into change cards and never supplying items.

**Architecture:** A shared session frame (authored step catalog, a pure progress machine, per-person notes on `planning_sessions`, a shell context that opens the conversation panel with a step header and a per-session thread) plus one "guided" mode per page (WeekV2, TodayView, ConstellationPage) whose step bodies live in the rail and reuse existing writers. The agent gets a guide mode that filters ops by step and can put a question on a row.

**Tech Stack:** React 19, TypeScript strict, Vite 7, Tailwind v4, Supabase (Postgres RLS, Deno edge functions), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-01-guided-planning-sessions-design.md` (read it first; this plan argues from it). Mockup with all step copy: https://claude.ai/artifact/1znmH4SRnmRHrHbFMTAAeb (copy is also inlined in Task 3).

## Global Constraints

- Work only in `/Users/scottkaufman/.claude-worktrees/symphonyOS/guided-planning-design` on branch `claude/guided-planning-design`. Never edit the main worktree. Never push to main, apply migrations to the live database, or deploy edge functions: those need Scott's approval at the end.
- Imports from `src/` use `@/`. No emojis in UI; icons from `lucide-react`.
- Design: scenery / place-theme / paper-journal (`src/index.css`), Crimson Pro for display, DM Sans for UI. Check every UI task on desktop and a narrow phone, light and dark.
- Copy: plain words, from Scott's side; step copy is fixed text from Task 3, never model output.
- The guide **never supplies**: no suggested goals, tasks, ideas, times or people. It may point out an empty area or ask a question.
- Nothing writes without Apply (change card) or an explicit tap on a step body control.
- Counts are shown, never enforced: Week "N of about 15", Day "N of 3–5". A count covers exactly the items rendered under the current space filter.
- Session notes are private to their author. "Planned" is per person.
- Names: Health/Money/Fun… are **life areas** (`goal_areas`). Work/Family/Personal are **spaces** in UI copy.
- Never use `supabase.auth.getUser()` (use the existing `getAuthUser`). Never use a service-role client to bypass RLS in the app.
- Typecheck: `npx tsc -b tsconfig.app.json tsconfig.node.json`. Tests: `npx vitest run <path>` (never bare `npm test`, it watches). Lint: `npm run lint`. PATH must start with `$HOME/.nvm/versions/node/v22.14.0/bin`.
- Commit after each task with the session's attribution lines.

## Review Focus

1. **Partner sees my notes / my week shows planned because Iris planned hers.** Expected: neither. Pinned by the SQL privacy test (Task 1) and the per-person hook tests (Task 2).
2. **Leaving mid-session and coming back days later, or on another device.** Expected: resumes at the saved step with the same thread. Pinned in Task 4 (progress round-trip) and Task 5 (thread reopen by entity id).
3. **The model proposes a write the current step doesn't allow, or invents an item.** Expected: the op is dropped server-side and the card says so; vague input produces a question, not an item. Pinned in Task 6 (`filterOpsForStep`, prompt test) and Task 21 (bench scenarios).
4. **A question row on the card.** Expected: Apply writes the other rows and leaves the question row pending. Pinned in Task 6 (`applyChangeSet` skips ops with `question`).
5. **Day session after 4 pm, and a week whose last day is today.** Expected: Day plans tomorrow and looks back at today; Week's "Review this week" on its last day opens next week's session. Pinned in Task 12 (`dayTarget`) and Task 11.

---

## Stage 0: the shared frame

### Task 1: Database: private session notes, life areas with spaces, task areas, expiring wall notes

**Files:**
- Create: `supabase/migrations/20261101130000_guided_planning.sql`
- Create: `supabase/migrations/rollback/20261101130000_guided_planning.down.sql`
- Create: `supabase/tests/104_guided_planning_privacy.test.sql`
- Modify: `src/types/task.ts` (add `areaId?: string | null`), the row↔Task mapper in `src/hooks/useSupabaseTasks.ts` (`area_id` ↔ `areaId`)

**Interfaces:**
- Produces: `planning_sessions` readable/updatable by author only; `goal_areas.context text null check (context in ('work','family','personal'))`; `goal_areas` SELECT = owner OR (`context = 'family'` AND `user_id in (select my_household_user_ids())`); `tasks.area_id uuid null references goal_areas(id) on delete set null`; `scratchpad_notes.expires_at timestamptz null`; `Task.areaId`.

- [ ] **Step 1: Write the failing SQL test** `104_guided_planning_privacy.test.sql`, in the style of `103_household_week_start.test.sql` (begin … rollback, seed two users A and B in one household, switch role with `set local role authenticated` + `request.jwt.claims`). Assertions:
  - B cannot select A's `planning_sessions` row (count = 0) and `update … where author_id = A` affects 0 rows.
  - A's `goal_areas` row with `context='personal'` is invisible to B; with `context='family'` visible to B; B cannot update or delete A's family area.
  - A's area with `context = null` (legacy) is invisible to B.
  - `tasks.area_id` accepts A's area id on A's task.
  - `scratchpad_notes.expires_at` exists and is nullable.
- [ ] **Step 2: Run it against a local Postgres** using the pattern in `supabase/tests/run-102.sh` (local `127.0.0.1:55322` only). Expected: FAIL (columns/policies missing). If no local Postgres is available, use `scripts/test-choices-rls.mjs`'s throwaway-cluster approach; do not run against the live project.
- [ ] **Step 3: Write the migration** (and its rollback restoring the 2026-06-08 policies and dropping the new columns/policies). Drop and recreate `view planning_sessions` and `update planning_sessions` as `auth.uid() = author_id` (update also `with check (auth.uid() = author_id)`). Add the goal_areas column and replace its SELECT policy. Add `tasks.area_id` with an index. Add `scratchpad_notes.expires_at`.
- [ ] **Step 4: Run the SQL test.** Expected: every assertion passes.
- [ ] **Step 5: Map `area_id`** in `useSupabaseTasks` (read and write paths) and add `areaId` to `Task`. Run `npx tsc -b tsconfig.app.json tsconfig.node.json`. Expected: clean.
- [ ] **Step 6: Commit.**

### Task 2: Per-person "planned" and reviews

**Files:**
- Modify: `src/hooks/usePlanningSession.ts`, `src/hooks/usePeriodReview.ts`, `src/hooks/usePlanningSessionsIndex.ts`, `src/components/plan/choose/LookingBack.tsx` (the "Reviewed … by" text)
- Test: their existing `*.test.ts(x)` files

**Interfaces:**
- Consumes: Task 1's RLS (defence in depth: queries also filter `author_id = me`).
- Produces: unchanged signatures; `saved`/`reviewed`/`completed` now reflect only the signed-in person's rows.

- [ ] **Step 1: Write failing tests:** `usePlanningSession` — given rows for me (no savedAt) and partner (savedAt), `saved` is `null`; `usePeriodReview` — partner's review is not `reviewed`; `usePlanningSessionsIndex` — partner's substantive row is not in `completed`. Mock the supabase query builder as the existing tests do and assert the query includes `.eq('author_id', <me>)`.
- [ ] **Step 2: Run** `npx vitest run src/hooks/usePlanningSession.test.ts src/hooks/usePeriodReview.test.ts src/hooks/usePlanningSessionsIndex.test.ts`. Expected: FAIL.
- [ ] **Step 3: Add `.eq('author_id', uid)`** to each read (uid from `getAuthUser`), update the hooks' header comments (no longer "planned for both"), and make LookingBack's reviewed line read "Reviewed {date}" without a name.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 3: The step catalog and the progress machine

**Files:**
- Create: `src/lib/guide/steps.ts`, `src/lib/guide/progress.ts`
- Test: `src/lib/guide/steps.test.ts`, `src/lib/guide/progress.test.ts`

**Interfaces:**
- Produces:
```ts
export type GuideLevel = 'day' | 'week' | 'month' | 'season' | 'year'
export type StepWrite = 'review' | 'triage' | 'commit' | 'place' | 'inbox' | 'plan_add' | 'note' | 'area' | 'event' | 'scratchpad' | 'none'
export interface GuideStep { id: string; title: string; minutes: number; why: string; you: string; guide: string; more: string; writes: StepWrite[]; choosing?: true }
export const GUIDE_STEPS: Record<GuideLevel, readonly GuideStep[]>
export const SESSION_LENGTH: Record<GuideLevel, string> // 'about an hour', '10 to 15 minutes', 'under two hours', 'about half a day', 'one or two days'
export const HORIZON_OF: Record<GuideLevel, SessionHorizon> // day→'daily', week→'weekly', month→'monthly', season→'seasonal', year→'annual'
export function stepsFor(level: GuideLevel): readonly GuideStep[]
export function choosingStep(level: GuideLevel): GuideStep

export interface GuideProgress { current: string; done: string[]; skipped: string[]; plannedAt?: string; finishedAt?: string; threadId?: string }
export function startProgress(level: GuideLevel): GuideProgress
export function goNext(p: GuideProgress, level: GuideLevel): GuideProgress   // marks current done, moves to next not-done step; stays on last
export function skipStep(p: GuideProgress, level: GuideLevel): GuideProgress // marks current skipped (not done), moves on
export function jumpTo(p: GuideProgress, stepId: string): GuideProgress
export function isLastStep(p: GuideProgress, level: GuideLevel): boolean
export function parseProgress(raw: unknown, level: GuideLevel): GuideProgress // junk or unknown step id → startProgress
```

- [ ] **Step 1: Write failing tests.** `steps.test.ts`: step counts day 5, week 7, month 6, season 7, year 7; ids unique per level; exactly one `choosing` step per level, and it is day `pick`, week `choose`, month `by-area`, season `by-area`, year `brain-dump`; every step has non-empty why/you/guide/more. `progress.test.ts`: `goNext` from week step 1 → current `read-month`, done `['look-back']`; `skipStep` puts the id in `skipped` not `done`; `goNext` on the last step keeps current; `jumpTo` an unknown id is a no-op; `parseProgress({current:'nope'}, 'week')` equals `startProgress('week')`; `goNext` skips over steps already done.
- [ ] **Step 2: Run** `npx vitest run src/lib/guide`. Expected: FAIL.
- [ ] **Step 3: Write the catalog.** Ids and copy below are fixed (title · minutes · why · you · guide). `more` is two or three plain sentences expanding `why` with one concrete example; write it in the same voice. `writes` per step as listed.

  **Week** (`about an hour`): `look-back` Look back at last week · 15 · Close last week before opening this one. · Wins first. Then each loose end: move it, break it smaller, hand it off, or drop it. · Goes through last week's open items one at a time and records your call. · [review, triage] — `read-month` Read November → title is built at render as "Read {Month}" (store `Read the month`) · 5 · The week should move the month forward. · Read the month's list and what's left on it. · Shows the month's lines with what's already planned under each. · [none] — `calendar` Calendar check · 10 · Clashes and tight changeovers are easier to fix on Sunday than on Tuesday. · Walk each day. Say what's wrong or missing. · Points out overlaps and back-to-back moves. You decide what changes. · [place] — `inbox` Clear the inbox · 10 · Nothing hidden should surprise you mid-week. · Each capture: this week, later, or gone. · Shows each Inbox item and files it where you say. · [inbox] — `choose` (choosing) Choose this week's tasks · 15 · A short list gets done. About 15 is the limit. · Say what this week needs. Take from the month or add new. · Files each under its month line and counts toward 15. · [commit, place] — `ops` Weekly ops · 10 · Meals, workouts, sleep and the weekend run the week. · Plan dinners, workouts, bedtimes, and what the weekend is for. · Puts workouts on their days and keeps your weekend note. · [place, note] — `family` Tell the family · 5 · Everyone should know the week before it starts. · Say what the family needs to know, then talk it through at dinner. · Posts what you say to mention on the wall for the week. · [scratchpad]

  **Day** (`10 to 15 minutes`): `look-back` Look back at yesterday · 2 · Nothing left from yesterday should quietly vanish. · Each unfinished item: today, back to the week, or done. · Shows what's left and moves it where you say. · [triage, review] — `calendar` Today's calendar · 2 · Fixed times decide where the free space is. · Read the day's appointments and what each needs. · Shows the day as a timeline. · [none] — `energy` Energy · 1 · Pick work that fits how you feel today. · Say how you're doing: high, medium or low. · Notes it beside the day. Nothing else changes. · [note] — `pick` (choosing) Pick 3 to 5 · 5 · A few real priorities beat a long hopeful list. · Choose from this week's list what fits the free space. · Places each where you say and counts toward 5. · [place] — `habits` Habits · 1 · Small daily routines are easy to skip without a check. · Glance at the day's routines. · Lists the day's routines to tick off as you go. · [none]
  (When the day planned is tomorrow, render titles "Look back at today" and "Tomorrow's calendar".)

  **Month** (`under two hours`): `fresh-start` Fresh start · 5 · A visible reset makes a new month feel like a new start. · Pick this month's scenery. · Changes Symphony's scenery for you. · [note] — `look-back` Look back at last month · 20 · Know what moved before deciding what's next. · Wins first, and how your energy has been. Then what's open: carry, back to the season, or drop. · Shows what got done and records your call on each open line. · [review, triage] — `read-season` Read the season list · 10 · The month should move the season's goals forward. · Read the season's goals and how far each has come. · Shows each season goal with its steps done so far. · [none] — `next-weeks` Next 4–5 weeks · 15 · This far out the calendar is mostly settled. Plan around it. · Look at each week's fixed dates and say what's missing. · Adds what you mention on its date. · [place] — `by-area` (choosing) The month by area · 30 · This is where goals start to look like tasks. · Say what the month should get done, area by area. · Files each under its season goal and area. Asks when it can't tell. · [commit, plan_add, area] — `upkeep-fun` Maintenance and fun · 15 · Bills, decluttering and supply orders come round again. Fun gets lost unless it's planned. · Check this month's routines, then name a thing or two just for fun. · Shows the monthly routines and adds your fun lines. · [plan_add]

  **Season** (`about half a day`): `look-back` Look back at last season · 30 · A season is a fresh start only if the last one is closed out. · Wins first. Then each open goal: carry it, table it for later, or drop it. · Goes through last season's open goals one at a time and records your call. · [review, triage] — `from-year` Choose from the year · 20 · Season goals should come from the year list, not from scratch. · Read the year's list and Someday. Pick what fits these three months. · Keeps the year list beside you. A goal you pick stays linked to its year goal. · [commit] — `calendar` Season calendar · 20 · Holidays and school breaks eat time you might be counting on. · Mark trips, breaks and deadlines for the season. · Adds the dates and shows which weeks are already full. · [place] — `energy` Energy check · 10 · A plan that ignores how tired you are falls apart by week three. · Say how your energy, health and bandwidth honestly look. · Keeps your note at the top of the season. · [note] — `by-area` (choosing) Season goals by area · 30 · Turns year goals into something three months can finish. · Name the goals for this season, area by area. · Files each under its year goal and area. Asks when one has no year goal. · [plan_add, area] — `ideal-week` Ideal week · 30 · Tests whether these goals physically fit into 168 hours. · Block sleep, work, school runs and meals. Then the time each goal needs. · Adds up the hours as you go and shows what's left. · [note] — `wild-cards` Wild cards · 20 · Seasonal logistics sneak up: money, camps, travel, the house. · Pick the checks that apply this season and say what needs doing. · Turns each to-do into a line under the right goal, or the month it's due. · [plan_add]

  **Year** (`one or two days`): `look-back` Look back at last year · 45 · You can't set next year well without knowing what this one taught you. · Name the wins first. Then what didn't work, and why. · Shows last year's goals with what got done, and records your call on each open one. · [review, triage] — `vision` Picture 5–10 years out · 30 · The long view keeps the year's goals pointing somewhere. · Describe an ordinary day ten years from now. Then: what would make this year a success? · Writes it down in your words. Adds nothing. · [note] — `landscape` Map the 12 months · 45 · Fixed dates decide how much room each month really has. · Go month by month: trips, deadlines, school breaks, holidays, family events. · Puts each on a one-page year and points out crowded months. · [note, place] — `areas` Choose life areas · 15 · Areas make sure no part of life is forgotten. · Pick 3 to 8. Each sits inside Work, Family or Personal, which decides who sees it. · Asks which space each area belongs in when it isn't obvious. · [area] — `brain-dump` (choosing) Brain dump goals · 45 · Get everything out before judging any of it. · Say every goal you can think of, area by area. Don't filter yet. · Sorts each goal into its area. Points out an empty area; never fills it. · [plan_add, area] — `refine` Refine the list · 30 · A list you can actually carry for twelve months. · Keep, merge, or move to Someday until the list feels right to reread. · Shows goals that overlap or repeat. You decide what happens to them. · [triage] — `share-book` Share and book the next session · 10 · Plans stick when the people affected know them and the next check-in is booked. · Choose what the family should see. Pick a date for the first season session. · Moves shared goals to Family and puts the season session on the calendar. · [triage, place]
- [ ] **Step 4: Implement `progress.ts`** to the interface above.
- [ ] **Step 5: Run** `npx vitest run src/lib/guide`. Expected: PASS.
- [ ] **Step 6: Commit.**

### Task 4: Session notes and progress hook

**Files:**
- Create: `src/hooks/usePlanningNotes.ts`, `src/hooks/useGuidedProgress.ts`
- Test: `src/hooks/usePlanningNotes.test.ts`, `src/hooks/useGuidedProgress.test.ts`

**Interfaces:**
- Consumes: `planning_sessions` (author-only after Task 1), `GuideProgress`/`parseProgress` (Task 3).
- Produces:
```ts
export interface GuideNotes { guide?: GuideProgress; energy?: { level: 'high' | 'medium' | 'low'; words?: string }; vision?: { tenYears?: string; success?: string }; landscape?: { month: number; text: string }[]; idealWeek?: IdealWeek; weekend?: string; wildCards?: string[]; scenery?: string }
export function usePlanningNotes(horizon: SessionHorizon, token: string): { notes: Record<string, unknown> & GuideNotes; loading: boolean; error: string | null; patch: (p: Partial<GuideNotes>) => Promise<boolean>; reload: () => void }
export function useGuidedProgress(level: GuideLevel, token: string): { progress: GuideProgress; loading: boolean; next: () => Promise<void>; skip: () => Promise<void>; jump: (id: string) => Promise<void>; markPlanned: () => Promise<void>; finish: () => Promise<void>; setThreadId: (id: string) => Promise<void> }
```
  `IdealWeek` is defined in Task 17's `src/lib/guide/idealWeek.ts`; declare it there first as `{ blocks: { id: string; label: string; hours: number; goalId?: string; when?: string }[] }` so this task compiles.

- [ ] **Step 1: Write failing tests.** `patch` reads the row first and keeps every existing key (`savedAt`, `periodReview`, `wentWell`) while writing the patched keys; a failed read writes nothing and returns false; `patch` upserts on `author_id,horizon,period_token`. `useGuidedProgress`: `next()` persists `notes.guide` via `patch`; a reload returns the saved step; `markPlanned()` sets `guide.plannedAt` once and also sets `savedAt` if missing (so existing "planned" readers and the nudge agree); `finish()` sets `guide.finishedAt`.
- [ ] **Step 2: Run** `npx vitest run src/hooks/usePlanningNotes.test.ts src/hooks/useGuidedProgress.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** using the read-first-then-merge pattern from `usePeriodReview.ts` (`finish`). Progress changes are optimistic in state and persisted after.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 5: Shell: the guide panel, step header and per-session thread

**Files:**
- Create: `src/contexts/GuidedSessionContext.tsx`
- Modify: `src/shell/ShellLayout.tsx`, `src/components/canvas/ConversationStrip.tsx` (new `header?: ReactNode` prop, rendered between the panel's `<header>` and the thread), `src/hooks/useSymphonyAssistant.ts`, `src/lib/agentTurn.ts` (thread `sessionContext` into `runAgentTurn` → `agentStream`)
- Test: `src/contexts/GuidedSessionContext.test.tsx`, `src/hooks/useSymphonyAssistant.test.ts` (add cases), `src/components/canvas/ConversationStrip.test.tsx` (add case)

**Interfaces:**
- Produces:
```ts
export interface GuidedSessionRegistration { level: GuideLevel; periodLabel: string; token: string; stepId: string; header: ReactNode; sessionContext: AssistantSessionContext & { guide: GuideTurnContext }; threadKey: string /* `${horizon}:${token}` */; onThread: (chatSessionId: string) => void; threadId?: string }
export interface GuideTurnContext { level: GuideLevel; stepId: string; stepTitle: string; writes: StepWrite[]; aboveLines: { id: string; title: string }[]; areas: { id: string; name: string; context: TaskContext | null }[]; counts?: { label: string; n: number; of: string } }
export function useGuidedSessionRegistration(reg: GuidedSessionRegistration | null): void // page side; null unregisters
export function useGuidedSession(): GuidedSessionRegistration | null // shell side
```
  `useSymphonyAssistant` gains `openThread(entityType: string, entityId: string): Promise<void>` (loads the newest `chat_sessions` row with that `entity_type`/`entity_id`, else resets and makes the next `persistTurn` insert with them) and `sessionContext?: AssistantSessionContext` per turn.

- [ ] **Step 1: Write failing tests.** Registering a session makes the shell open the panel (desktop: `showPane('ai')`; phone: overlay) once, renders `header`, and on unregister restores the previous pane state. `openThread('planning_session','weekly:2026-11-1')` with an existing row loads its messages; without one, the next send inserts `entity_type='planning_session', entity_id='weekly:2026-11-1'` and calls `onThread(newId)`. `sendMessage` while registered posts `sessionContext.guide.stepId`. ConversationStrip renders `header` in panel mode only.
- [ ] **Step 2: Run** the three test files. Expected: FAIL.
- [ ] **Step 3: Implement.** ShellLayout provides the context; while a registration exists: open the panel, pass `header` to `ConversationStrip`, call `assistant.openThread('planning_session', reg.threadKey)` when `threadKey` changes, pass `reg.sessionContext` on every turn, hide the `ConversationWalk` "Suggested" link. On unregister, `resetSession()` back to the rail thread (`persistKey 'symphony_rail'`).
- [ ] **Step 4: Run the tests.** Expected: PASS. Then `npx tsc -b tsconfig.app.json tsconfig.node.json`. Expected: clean.
- [ ] **Step 5: Commit.**

### Task 6: Agent guide mode, questions on rows, spaces and areas on adds

**Files:**
- Create: `supabase/functions/symphony-agent/guideMode.ts` (+ test beside it, in whatever runner the existing `changeSet` tests use; check `supabase/functions/symphony-agent/*.test.ts` and match)
- Modify: `supabase/functions/symphony-agent/index.ts` (the `sessionContext` block at ~:1529–1544 branches to guide mode when `sessionContext.guide` exists), `supabase/functions/symphony-agent/changeSet.ts` (accept `question?: string` on any op, `context?`/`areaId?` on `add`/`plan_add`), `src/lib/canvas/changeCard.ts` (`ChangeOp.question?`, `areaId?`), `src/components/canvas/ChangeCard.tsx` (render the question on its row, styled as the mockup's amber note; Apply label becomes "Apply N" when some rows are questions), `src/lib/canvas/applyChangeSet.ts` (skip ops with `question`; honour `op.context` and `op.areaId` on `add`/`plan_add`)
- Test: `src/lib/canvas/applyChangeSet.test.ts`, `src/components/canvas/ChangeCard.test.tsx`

**Interfaces:**
- Consumes: `GuideTurnContext` (Task 5) as `body.sessionContext.guide`.
- Produces (Deno):
```ts
export const OPS_FOR_WRITE: Record<StepWrite, ChangeOpKind[]> // review:[] triage:['someday','done','assign','unplace','plan_carry','plan_let_go','plan_done'] commit:['add','plan_carry'] place:['place','add'] inbox:['place','someday','done','add'] plan_add:['plan_add'] note:[] area:['plan_add'] event:['add','place'] scratchpad:[] none:[]
export function guidePromptBlock(g: GuideTurnContext, periodLabel: string): string
export function filterOpsForStep(ops: ChangeOp[], writes: StepWrite[]): { kept: ChangeOp[]; dropped: ChangeOp[] }
```
  `StepWrite` is duplicated in the function (Deno can't import `src/`); keep the union identical to Task 3 and say so in a comment in both files.

- [ ] **Step 1: Write failing tests.** `guidePromptBlock` contains the step title, the allowed op kinds, the line "Never suggest a goal, task, idea, time or person the user did not say", "If something is unclear, put a question on that row instead of guessing", and "Point out an empty area; never fill it". `filterOpsForStep` on the week `inbox` step drops a `plan_add`. Client: `applyChangeSet` with ops `[add A, add B {question:'Which day?'}]` writes only A; `add` with `context:'family', areaId:'x'` creates the task with that context and `area_id`. ChangeCard shows the question text on B's row and the button reads "Apply 1".
- [ ] **Step 2: Run** the client tests with vitest and the Deno tests with their runner. Expected: FAIL.
- [ ] **Step 3: Implement.** In guide mode the old "Suggest — do not write … return ONLY the JSON array" text is not sent. After `symphony_propose_changes` validates a set, run `filterOpsForStep`; when ops are dropped, add a card note "Left out: {titles} belong to another step".
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** (Deploying the function is deferred to the end, with Scott's approval.)

### Task 7: Session frame UI

**Files:**
- Create: `src/components/guide/GuideRail.tsx`, `src/components/guide/GuideHeader.tsx`, `src/components/guide/SessionBar.tsx`, `src/components/guide/PeriodSummaryLine.tsx`, `src/components/guide/EnergyNote.tsx`, `src/components/guide/guide.css`
- Test: `src/components/guide/GuideRail.test.tsx`, `GuideHeader.test.tsx`, `PeriodSummaryLine.test.tsx`, `EnergyNote.test.tsx`

**Interfaces:**
- Consumes: Task 3 catalog/progress, Task 4 hooks.
- Produces:
```ts
GuideRail({ level, progress, titleFor?: (s: GuideStep) => string, bodies: Partial<Record<string, ReactNode>>, onJump: (id: string) => void }) // steps with ✓ / current / skipped; the CURRENT step expands to show bodies[current]; a non-current tapped step shows its why under it with "Go to this step"
GuideHeader({ level, step, index, total, onNext, onSkip, isLast, finishLabel /* "Done planning the week" */, onFinish }) // Why / You / Guide; "Explain more" toggles step.more inline
SessionBar({ label /* "Planning the week" */, index, total, onLeave }) // "Planning the week · step 5 of 7 · Leave"
PeriodSummaryLine({ plannedAt?: string; energy?: GuideNotes['energy']; reviewed?: boolean; onOpen?: (part: 'review' | 'energy') => void }) // "Planned Sun · energy: medium · looked back"; renders nothing when all empty
EnergyNote({ value?: GuideNotes['energy']; onChange: (v: NonNullable<GuideNotes['energy']>) => void })
```
  Phone (≤ 760px): GuideRail renders as a horizontal row of step chips with the current body below it. The shell's phone overlay hosts the guide (Task 5).

- [ ] **Step 1: Write failing tests:** rail marks done/current/skipped from progress; only the current step's body is rendered; tapping a non-current step shows its `why` and "Go to this step" calls `onJump`; GuideHeader's "Explain more" reveals `more`; on the last step the primary reads the finish label; SessionBar text exact; PeriodSummaryLine `{plannedAt:'2026-11-01T10:00', energy:{level:'medium'}, reviewed:true}` renders "Planned Sun · energy: medium · looked back"; EnergyNote calls onChange with level.
- [ ] **Step 2: Run** `npx vitest run src/components/guide`. Expected: FAIL.
- [ ] **Step 3: Implement** with the mockup's look in the app's tokens (rail on paper, current step on the warm guide tint, guide accent `--color-review-600`).
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.**

## Stage 1: Week

### Task 8: Week session wiring

**Files:**
- Create: `src/components/plan/guided/GuidedWeek.tsx`, `src/components/plan/guided/useGuidedWeek.ts`
- Modify: `src/components/plan/v2/WeekV2.tsx` (deck `'full'` renders `GuidedWeek` instead of `PlanWeekFlow`; `'place'` keeps `GiveThemADay`), `src/components/home/week/WeekViewV2.tsx` (pass what GuidedWeek needs: `weekCanvas` without the strip, `choose`, `deckActions`, `deckTasks`, finish), `src/components/canvas/week/WeekCanvas.tsx` (`hideStrip?: boolean`)
- Test: `src/components/plan/guided/GuidedWeek.test.tsx`

**Interfaces:**
- Consumes: Tasks 3–7; `useChooseWeek`, `useDeckActions`, the existing finish (`WeekV2.tsx:141-150` + `WeekViewV2.tsx:1150-1159`).
- Produces: `GuidedWeek({ weekStart, canvas: ReactNode, bodies: Record<string, ReactNode>, count: number, monthWord: string, onFinish: () => Promise<void>, onLeave: () => void })`; `useGuidedWeek(...)` returns `{ progress, register, markPlannedOnce }` and registers the guide (Task 5) with `threadKey 'weekly:<weekToken>'`.

- [ ] **Step 1: Write failing tests:** opening `?plan=1` renders the SessionBar, the rail, and the canvas with `hideStrip`; the guide registration has `stepId` of the saved progress; the first applied choose verb while on `choose` calls `markPlanned` once; "Done planning the week" runs the existing finish then `finish()` and closes; Leave closes without finish and keeps progress; resuming opens on the saved step. The header count reads "{n} of about 15" where n = `onThisWeek` over `deckTasks`.
- [ ] **Step 2: Run** `npx vitest run src/components/plan/guided`. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the stale drain on open (`WeekViewV2.tsx:1093-1099`) as today. `markPlannedOnce` wraps `choose` verbs and the change card's approve while current is `choose`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 9: Week steps 1–4 (look back, read the month, calendar check, inbox)

**Files:**
- Create: `src/components/plan/guided/week/WeekLookBack.tsx`, `ReadMonth.tsx`, `CalendarCheck.tsx`, `InboxStep.tsx`, `src/lib/guide/clashes.ts`
- Test: `src/lib/guide/clashes.test.ts`, `src/components/plan/guided/week/*.test.tsx`

**Interfaces:**
- Consumes: `LookingBack`, `choose.notDoneLastWeek`, `choose.lines`, `deckActions` (`keepThisWeek`, `later`, `letGo`, `done`), the assign picker used by `PlanRow` for hand off, Inbox tasks (`bucket === 'inbox'`, filtered like the page).
- Produces: `findClashes(events: { id: string; title: string; start: Date; end: Date; place?: string }[]): { kind: 'overlap' | 'tight'; a: string; b: string; day: string }[]` — overlap when intervals intersect; tight when the gap is < 15 minutes and the two have different non-empty places.

- [ ] **Step 1: Write failing tests.** `findClashes`: 9:00–10:00 vs 9:30–10:30 → one overlap; 9:00–10:00 at "Home" vs 10:10 at "School" → tight; same place 10:05 → nothing. LookBack: saving notes calls `lastReview.finish`; each loose end shows This week / Smaller / Hand off / Drop and calls the matching action (Smaller opens the existing break-down input that adds a step under it). InboxStep: three verbs per item; empty inbox reads "Inbox is clear."
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** and wire into `GuidedWeek` bodies `look-back`, `read-month`, `calendar`, `inbox`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 10: Week steps 5–7 (choose, weekly ops, tell the family)

**Files:**
- Create: `src/components/plan/guided/week/ChooseStep.tsx`, `WeeklyOps.tsx`, `TellFamily.tsx`
- Modify: `src/lib/wall/addScratchpadNote.ts` (optional `expiresAt?: Date`), `src/hooks/useScratchpad.ts` (load filters `expires_at is null or expires_at > now`)
- Test: matching `*.test.tsx`, `src/hooks/useScratchpad.test.ts`

**Interfaces:**
- Consumes: `ChoosePlan` (compact, inside the rail), `GiveThemADay` (opened from a "Give them a day" button inside the step), week routines via `getRoutinesForDatePure` over 7 days, dinners via `usePlannedDinners`, `usePlanningNotes` `weekend`, `addScratchpadNote`.
- Produces: `addScratchpadNote(userId, body, kind, authorMemberId, expiresAt?)`.

- [ ] **Step 1: Write failing tests:** ChooseStep shows the count line and the ~15 copy; "Give them a day" swaps to GiveThemADay and back. WeeklyOps lists the week's dinners with a link "Open the meal plan" to the week on `/meals`, lists routines by day, and saves the weekend note via `patch({weekend})`. TellFamily: a textarea "What should the family know?"; "Post to the wall" posts **one note per non-empty line**, exactly the typed text, `kind 'note'`, `expiresAt` = the week's end; shows "Posted 2 notes". `useScratchpad` hides a note whose `expires_at` has passed.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** and wire bodies `choose`, `ops`, `family`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 11: Week: everyday line, review entry, retire the old flow

**Files:**
- Modify: `src/components/plan/v2/WeekV2.tsx` (PeriodSummaryLine under the week title, reading this week's `usePlanningNotes('weekly', token)`; "Review this week" on the last day opens next week's guided session), remove `PlanWeekFlow` usage
- Delete: `src/components/plan/choose/PlanWeekFlow.tsx` and its test if nothing else imports it
- Test: `WeekV2.test.tsx` (add cases)

- [ ] **Step 1: Write failing tests:** with saved notes the line reads "Planned Sun · energy: medium · looked back"; with nothing saved no line renders; on the week's last day "Review this week" opens the session for next week with Look back on this week.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**; delete PlanWeekFlow if unused (`git grep PlanWeekFlow`).
- [ ] **Step 4: Run** the WeekV2 tests and `npx tsc -b tsconfig.app.json tsconfig.node.json`. Expected: PASS, clean.
- [ ] **Step 5: Visual check** on `vite preview` (port 5196, copy `.env` from the main worktree if missing): desktop and 390px phone, light and dark, mid-session and everyday. Fix what's visibly broken.
- [ ] **Step 6: Commit.**

## Stage 2: Day

### Task 12: Day session (replaces Plan today / Review today)

**Files:**
- Create: `src/lib/guide/dayTarget.ts`, `src/components/plan/guided/day/GuidedDay.tsx`, `DayLookBack.tsx`, `DayPick.tsx`
- Modify: `src/components/schedule/TodayView.tsx` (`?plan=1` opens GuidedDay; `?review=1` redirects to `?plan=1`; header button "Plan today" before 4 pm, "Plan tomorrow" from 4 pm; PeriodSummaryLine for the shown day), `src/components/plan/choose/TodayFlow.tsx` (keep only the row pieces GuidedDay reuses, or move them; delete the mode switch)
- Test: `src/lib/guide/dayTarget.test.ts`, `src/components/plan/guided/day/*.test.tsx`, `TodayView.test.tsx` (add cases)

**Interfaces:**
- Produces: `dayTarget(now: Date): { target: Date; lookBackOn: Date; isTomorrow: boolean }` — before 16:00 target = today, look back on yesterday; from 16:00 target = tomorrow, look back on today.
- Session row: `usePlanningNotes('daily', dayToken(target))`; the look-back's win goes to `usePeriodReview('daily', dayToken(lookBackOn))`.

- [ ] **Step 1: Write failing tests:** `dayTarget` at 15:59 and 16:00. GuidedDay renders 5 steps; titles switch to "Look back at today" / "Tomorrow's calendar" when `isTomorrow`. DayLookBack verbs: target day / Back to this week / Done (target day = Today or Tomorrow label). DayPick shows "{n} of 3–5", places a task on the target date (time optional), groups this week's no-day tasks by goal. Energy step saves via `patch({energy})`. First pick while on `pick` calls `markPlanned`. "Done planning today|tomorrow" finishes and closes.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, reusing `TodayFlow`'s day picture and row choices.
- [ ] **Step 4: Run** the tests and typecheck. Expected: PASS, clean.
- [ ] **Step 5: Visual check** (as Task 11 Step 5).
- [ ] **Step 6: Commit.**

## Stage 3: Life areas and Month

### Task 13: Life areas and the "space" rename

**Files:**
- Create: `src/hooks/useLifeAreas.ts`, `src/components/guide/AreasEditor.tsx`
- Modify: the "Life area" strings that label Work/Family/Personal → "Space"/"Spaces": `src/components/schedule/BulkAreaDialog.tsx:52,71`, `InboxView.tsx:979`, `InboxTriageActions.tsx:147-148`, `DenseInboxRow.tsx:222`, `src/components/plan/PartOfGoalControl.tsx:105`, `src/components/plan/v2/AddArea.tsx:27`, `src/components/layout/PhoneFilterControl.tsx:100`, `src/components/triage/ContextPicker.tsx:141`. Leave `GoalsList.tsx` "Life Area" (it already means goal_areas).
- Test: `src/hooks/useLifeAreas.test.ts`, `AreasEditor.test.tsx`, and update tests asserting the old strings

**Interfaces:**
- Produces: `useLifeAreas(): { areas: LifeArea[]; loading: boolean; add(name: string, context: TaskContext): Promise<LifeArea | null>; rename(id: string, name: string): Promise<boolean>; setContext(id: string, context: TaskContext): Promise<boolean>; remove(id: string): Promise<boolean> }` with `LifeArea = { id: string; name: string; context: TaskContext | null; mine: boolean; sortOrder: number }`. `AreasEditor({ areas, onAdd, onRename, onSetContext, onRemove })` — rows of name + space chips; "3 to 8 areas" shown as a count, not a limit; partner's Family areas listed read-only.

- [ ] **Step 1: Write failing tests** for the hook (query selects `goal_areas` with context; add inserts `user_id`, `name`, `context`) and the editor; update string tests to "Space".
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** and typecheck. Expected: PASS, clean.
- [ ] **Step 5: Commit.**

### Task 14: Group by area on Month, Season and Year pages

**Files:**
- Create: `src/lib/guide/byArea.ts`
- Modify: the list rendering in `src/components/plan/constellation/ConstellationPage.tsx` (or `PlanOrderList.tsx`, whichever renders the period's lines)
- Test: `src/lib/guide/byArea.test.ts`, ConstellationPage test (add case)

**Interfaces:**
- Produces: `groupByArea<T extends { areaId?: string | null }>(items: T[], areas: LifeArea[]): { area: LifeArea | null; items: T[] }[]` — areas in sort order, then "No area" last; areas with no items omitted; when there are no areas at all, a single group with `area: null` (render as today, no heading). Year goals use `goals.area_id`.

- [ ] **Step 1–5:** failing test (ordering, empty areas omitted, no-areas passthrough) → run → implement and render area headings → run → commit.

### Task 15: Month session

**Files:**
- Create: `src/components/plan/guided/GuidedPeriod.tsx` (shared frame for Month/Season/Year on ConstellationPage), `src/components/plan/guided/month/FreshStart.tsx`, `PeriodLookBack.tsx`, `ReadAbove.tsx`, `NextWeeks.tsx`, `UpkeepFun.tsx`
- Modify: `ConstellationPage.tsx` (`planning` renders `GuidedPeriod` with the page body and `hideStrip`, instead of the LookingBack/ChoosePlan swap; remove the "Plan this season with me" conversation walk), `AboveStrip.tsx` (export its tab contents so steps can reuse them)
- Test: `src/components/plan/guided/GuidedPeriod.test.tsx`, `month/*.test.tsx`

**Interfaces:**
- Consumes: ConstellationPage's inline `choose` verbs (`bringHere`/`keepForward`, `backUp`/`dropCommitment`, done), `usePeriodReview(SESSION_HORIZONS[level], prevToken)`, `usePlace().setPlace`, `PlacePicker`, monthly routines (AboveStrip's routines tab), `isFun` on tasks.
- Produces: `GuidedPeriod({ level: 'month' | 'season' | 'year', token, periodLabel, page: ReactNode, bodies, onFinish, onLeave })`; `PeriodLookBack({ prevLabel, review, open: Task[], verbs: { carry; up?; table?; drop }, upLabel? })` (Month: carry / back to the season / drop; Season: carry / table → Someday / drop; Year: carry / Someday / drop); `NextWeeks({ start, weeks: 5 })` lists each week's fixed events from the same calendar source ConstellationPage's DayDensityTiles use.

- [ ] **Step 1: Write failing tests:** Month renders 6 steps; FreshStart saves `patch({scenery})` and calls `setPlace`; PeriodLookBack saves review notes and each verb calls its writer; `by-area` body is ChoosePlan grouped by area with the guide's `aboveLines` = season goals and `areas`; first apply on `by-area` marks planned; UpkeepFun lists monthly routines and the month's `isFun` lines; finish label "Done planning {Month}" runs the existing `markPlanned` then the old `planNext` navigation offer ("Plan this week →").
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** and typecheck. Expected: PASS, clean.
- [ ] **Step 5: Visual check** (as Task 11 Step 5).
- [ ] **Step 6: Commit.**

## Stage 4: Season

### Task 16: Season session

**Files:**
- Create: `src/components/plan/guided/season/SeasonCalendar.tsx`, `WildCards.tsx`
- Modify: `ConstellationPage.tsx` bodies for season
- Test: `season/*.test.tsx`, GuidedPeriod season case

**Interfaces:**
- Consumes: GuidedPeriod, PeriodLookBack (`table` → `someday`), ReadAbove/ChoosePlan against the year (Year goals as lines, as Season already does), EnergyNote, IdealWeekEditor (Task 17).
- Produces: `WildCards({ value: string[], onChange })` — four toggles "Money", "Childcare and camps", "Travel", "The house"; saves `patch({wildCards})`; under each chosen card, the season's lines whose title the user tagged there (no generated text).

- [ ] **Step 1–6:** failing tests (7 steps; table sends to Someday; energy saved; wild cards persisted; SeasonCalendar lists fixed events in the season's bounds from `seasonBounds`) → run → implement → run + typecheck → visual check → commit.

### Task 17: Ideal week

**Files:**
- Create: `src/lib/guide/idealWeek.ts`, `src/components/guide/IdealWeekEditor.tsx`, `src/components/guide/IdealWeekSection.tsx`
- Modify: the Season page body in `ConstellationPage.tsx` (render IdealWeekSection when the season's notes have one)
- Test: `src/lib/guide/idealWeek.test.ts`, `IdealWeekEditor.test.tsx`

**Interfaces:**
- Produces: `IdealWeek` (declared in Task 4), `hoursLeft(w: IdealWeek): number` (168 − sum, may go negative), `formatHours(h: number): string` ("3h 45m", "4h", "-2h 30m"), `parseDuration(s: string): number | null` ("3h 45m", "3.75", "45m", "3 × 1h 15m" → 3.75). Editor: rows of label / hours / optional goal / optional when; a bar of 168 hours with base vs goal vs free; "4h 15m of 168h left", red text when negative. Section: read-only copy of the bar and rows on the Season page.

- [ ] **Step 1–5:** failing tests (the mockup's numbers: base 153h + goals 10h 45m → "4h 15m"; negative case; `parseDuration` cases) → run → implement → run → commit.

## Stage 5: Year

### Task 18: Year session

**Files:**
- Create: `src/components/plan/guided/year/Vision.tsx`, `Landscape.tsx`, `Refine.tsx`, `ShareBook.tsx`, `src/lib/guide/overlaps.ts`
- Modify: `ConstellationPage.tsx` bodies for year
- Test: `src/lib/guide/overlaps.test.ts`, `year/*.test.tsx`

**Interfaces:**
- Consumes: GuidedPeriod, PeriodLookBack (carry → the existing "→ {year}" carry from the horizon strip; Someday; drop), AreasEditor (step `areas`), `useGoals` writers for year goals (context change for Share; status archive for Someday), `usePlanningNotes('annual', yearToken)`.
- Produces: `findOverlaps(goals: { id: string; title: string }[]): [string, string][]` — pairs whose titles share ≥ 2 meaningful words (lowercased, stop words removed) or one title contains the other; `Vision({ value, onChange })` two textareas "An ordinary day ten years from now" / "What would make {year} a success"; `Landscape({ value, onChange })` 12 month cells, free text per month, cells with ≥ 3 entries marked "crowded"; `ShareBook` lists Work/Personal year goals with "Share with the family" (sets context family after a confirm row on the page, not a dialog) and a date field "First season session" that creates a dated personal task "Plan {Season}".

- [ ] **Step 1–6:** failing tests (`findOverlaps` on "Run a 10k" / "Run a half marathon" → pair; "Max the 401k" / "Redo the will" → none; Year renders 7 steps; Vision/Landscape persist via `patch`; ShareBook writes context and creates the task) → run → implement → run + typecheck → visual check → commit.

### Task 19: Year page sections

**Files:**
- Create: `src/components/guide/YearVisionSection.tsx`, `YearLandscapeSection.tsx`
- Modify: the Year page body in `ConstellationPage.tsx`
- Test: matching `*.test.tsx`

- [ ] **Step 1–5:** failing tests (sections render saved notes read-only with an Edit link that opens the session on that step via `?plan=1&step=vision`; nothing renders when empty) → run → implement (support `?step=` in GuidedPeriod/GuidedWeek/GuidedDay as a `jump` on open) → run → commit.

## Finish

### Task 20: Retire what's replaced and update docs

**Files:**
- Modify/Delete: leftover callers of `useConversationWalk` for planning (`WeekViewV2.tsx:260`, `TodayView.tsx:679`, `ConstellationPage.tsx:464`) — remove the planning walks; delete `conversationWalk.ts` only if nothing else uses it. Remove dead `LookingBack`/`ChoosePlan` standalone entry code paths no longer reachable (keep the components used as step bodies).
- Modify: `docs/superpowers/specs/2026-11-01-guided-planning-sessions-design.md` (status: built, not yet deployed; note the deviation: unfinished-session closing writes happen at the next session's Look back, since `useWeekRollover` doesn't handle leftovers), `docs/planning/2026-10-25-horizon-strip.md` ("Two ways to plan" → one), `docs/superpowers/specs/2026-10-19-plan-from-the-level-above-design.md` (superseded note at top).

- [ ] **Step 1:** `git grep -n "useConversationWalk\|PlanWeekFlow\|dayFlow"` and remove planning-only uses.
- [ ] **Step 2:** Run `npx vitest run` (whole suite) and `npx tsc -b tsconfig.app.json tsconfig.node.json` and `npm run lint`. Expected: all green; fix failures caused by this branch (a red test that fails on main too is reported, not "fixed" here).
- [ ] **Step 3:** Update the docs.
- [ ] **Step 4:** Commit.

### Task 21: Bench scenarios and end-to-end check

**Files:**
- Create: `scripts/conversation-bench/scenarios/guide-never-supplies.json`, `guide-question-on-row.json`, `guide-wrong-step.json` (format per `scripts/conversation-bench/README.md`)

- [ ] **Step 1: Write scenarios.** (a) Year brain-dump, user says "I don't know what to do for fun this year" → expect no `plan_add`, reply contains a question. (b) Week choose, "Mia's dentist, finish the GW application" → expect one `add` with a `question` (booking vs going / which day) and one `add` without. (c) Week inbox step, "add a goal to run a 10k this season" → expect no `plan_add` kept, card note says it belongs to another step.
- [ ] **Step 2:** Do not run them against production. Record in the final report that they run after Scott approves deploying the edge function (the bench wrapper's expiry has passed and must be renewed then).
- [ ] **Step 3: Final review:** dispatch a whole-branch code review; fix confirmed issues.
- [ ] **Step 4: Commit.**

## After the plan (needs Scott)

1. Apply `20261101130000_guided_planning.sql` to the live project.
2. Verify privacy with two real household accounts (partner can't see the other's session notes or Personal areas; planned is per person).
3. Deploy `symphony-agent` (and renew the bench wrapper's expiry) and run the three bench scenarios.
4. Rebase on origin/main, run the pre-push checks, push to main.
