# Project Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log past events (calls, visits, messages, meetings, notes) and plan future ones on a goal and on choice options, by page and by chat.

**Architecture:** One new table `goal_log_entries` (visibility follows the goal like Choices) plus `tasks.log_kind` marking planned-event tasks. A pure module merges entries and planned tasks into a log; the comparison page, goal panels and chat read and write through the existing Choices patterns (page writers with `run` + Undo; change-card ops through `ChoiceWriters` on the reviewed-change client).

**Tech Stack:** React/TypeScript/Vite/Tailwind, Supabase Postgres RLS, Deno edge function `symphony-agent`, vitest, local Postgres 17 SQL test scripts.

**Spec:** `docs/superpowers/specs/2026-10-22-choice-log-design.md` (mockup `docs/superpowers/specs/assets/2026-10-22-choice-log-mockup.html`).

## Global Constraints

- Kinds, fixed, in this order: `call` "Phone call", `visit` "Home visit", `message` "Message", `meeting` "Meeting", `note` "Note". Contact kinds: call, visit, message, meeting.
- A date after today (local) is a planned event (a task); today or earlier is a log entry.
- Logging/planning a contact kind about an option whose status is `considering` sets it to `contacted`; any other status is left alone.
- Facts only, never advice or ranking (Symphony structures, never guides).
- Never use a service-role client in app code; every app write goes through the user's client (page) or the reviewed-change client (chat).
- Run vitest with Node 22: `PATH=~/.nvm/versions/node/v22.18.0/bin:$PATH npx vitest run <paths>`. The worktree needs `node_modules` and `connectors/node_modules` symlinked to the main checkout and `.env` copied (already done by the controller).
- Use `@/` imports. Match the surrounding code's style and comment density (short "why" comments).
- Copy is exact as written in this plan.

## Review Focus

1. A planned event about an option on a **year goal** must set `goal_id`, not `goal_task_id` (both goal kinds work) — tested in Task 2.
2. A Family goal's log is visible to the other household member; a private goal's log is not; another household sees nothing — Task 1 SQL tests.
3. Undo of a chat card that logged, planned and set status removes all three — Task 1 undo script + Task 5 unit test.
4. Status never moves backward (heard_back/ruled_out/chosen untouched by logging) — Task 2 pure test, Task 3 page test, Task 6 agent test.
5. Dates: "today" is local, not UTC (an evening entry must not land on tomorrow) — Task 2 pure test with a local-evening `now`.

---

### Task 1: Database — `goal_log_entries`, `tasks.log_kind`, RLS, journal, SQL tests

**Files:**
- Create: `supabase/migrations/20261022180000_goal_log.sql`
- Modify: `scripts/test-choices-rls.mjs`, `scripts/test-choices-undo.mjs`

**Interfaces:**
- Produces table `public.goal_log_entries(id uuid pk default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, goal_task_id uuid null references tasks on delete cascade, goal_id uuid null references goals on delete cascade, choice_option_id uuid null references choice_options on delete cascade, kind text not null, happened_on date not null, happened_at_time time null, summary text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`.
- Produces `tasks.log_kind text null`.

- [ ] **Step 1: Write the migration** wrapped in `begin; … commit;` (as `20261022120000_choices.sql` is), containing:
  - the table; checks: `num_nonnulls(goal_task_id, goal_id) = 1`; `kind in ('call','visit','message','meeting','note')`; `length(btrim(summary)) between 1 and 500`.
  - `tasks.log_kind` with check `log_kind is null or log_kind in (…same five…)`.
  - index on `(goal_task_id)`, `(goal_id)`, `(choice_option_id)`.
  - trigger before insert or update of `goal_task_id` reusing `public.choices_goal_task_is_goal()`.
  - trigger function `public.goal_log_option_matches_goal()` (before insert or update of `choice_option_id, goal_task_id, goal_id`): when `choice_option_id` is not null, the option's choice must have the same `goal_task_id` and `goal_id` as the row, else raise `23514` with message `A log entry about an option belongs to that option's goal`. Security invoker is fine (reads through RLS; an unreadable option fails the check, which is correct).
  - `update_updated_at_column()` trigger.
  - parent guard: `guard_parent_immutable('goal_task_id','goal_id','choice_option_id')`; owner guard `guard_owner_immutable()`.
  - `enable row level security`; policies `goal_log_read/insert/update/delete` using `public.choice_goal_visible(goal_task_id, goal_id)`; insert also `user_id = (select auth.uid())`.
  - journal triggers for `goal_log_entries` exactly as the Choices loop does (`reviewed_change_before`, `zz_reviewed_change_after`).
- [ ] **Step 2: Extend `scripts/test-choices-rls.mjs`**: load the new migration after the Choices one (and add `log_kind`-compatible stub `tasks` if the stub lacks it — the migration adds the column itself). New checks (each a `check(...)`):
  - owner inserts an entry on GOAL_FAMILY; MEMBER reads it (count 1); OUTSIDER reads 0.
  - owner inserts on GOAL_PRIVATE; MEMBER reads 0.
  - MEMBER inserting with `user_id = OWNER` fails with RLS.
  - updating an entry's `goal_task_id` to another goal fails (42501).
  - an entry with `choice_option_id` of an option on GOAL_FAMILY's choice but `goal_task_id = GOAL_PRIVATE` fails (23514).
  - `goal_task_id = TASK_PLAIN` (not a goal) fails (23514).
  - a year-goal entry (`goal_id = YEAR_GOAL`) is visible to the member when the year goal is shared under the stub's rules (mirror whatever the existing year-goal choice check asserts).
  - journal trigger count check: add `goal_log_entries` → 10 triggers over 5 tables.
- [ ] **Step 3: Extend `scripts/test-choices-undo.mjs`**: load the new migration; add a case: one `card()` that inserts a log entry, inserts a task with `log_kind = 'visit'`, and updates an option's status to `contacted`; after `undo()`, the entry and task are gone and the status is back to `considering`.
- [ ] **Step 4: Run both scripts**
  Run: `node scripts/test-choices-rls.mjs --pg-bin /opt/homebrew/opt/postgresql@17/bin && node scripts/test-choices-undo.mjs --pg-bin /opt/homebrew/opt/postgresql@17/bin`
  Expected: all checks pass, including the new ones.
- [ ] **Step 5: Commit** `feat(log): goal_log_entries and tasks.log_kind with RLS that follows the goal`

### Task 2: Types, pure log module, data access

**Files:**
- Create: `src/types/goalLog.ts`, `src/lib/choices/log.ts`, `src/lib/choices/log.test.ts`, `src/lib/choices/logDb.ts`, `src/lib/choices/logDb.test.ts`

**Interfaces:**
- Produces in `src/types/goalLog.ts`:
  - `type LogKind = 'call'|'visit'|'message'|'meeting'|'note'`; `LOG_KINDS: readonly LogKind[]` (that order); `LOG_KIND_LABEL: Record<LogKind,string>`; `CONTACT_KINDS: ReadonlySet<LogKind>`.
  - `interface LogEntry { id; userId; goal: GoalRef; optionId?: string; kind: LogKind; on: string /* YYYY-MM-DD */; time?: string /* HH:MM */; summary: string; createdAt: Date }`
  - `interface PlannedEvent { taskId; optionId?: string; kind: LogKind; title: string; scheduledFor: Date; allDay: boolean; completed: boolean; completedAt?: Date }`
  - `DbLogEntry` and `dbLogEntryToEntry(row): LogEntry`.
- Produces in `src/lib/choices/log.ts` (pure):
  - `localYmd(d: Date): string`
  - `isAhead(on: string, now: Date): boolean` — `on > localYmd(now)`.
  - `statusAfterLog(status: OptionStatus, kind: LogKind): OptionStatus | null` — `'contacted'` when `status === 'considering'` and kind is a contact kind, else `null` (no change).
  - `type LogLine = { key: string; when: Date; on: string; time?: string; kind: LogKind; optionId?: string; text: string; userId?: string; upcoming: boolean; entryId?: string; taskId?: string }`
  - `mergeLog(entries: readonly LogEntry[], planned: readonly PlannedEvent[]): { upcoming: LogLine[]; done: LogLine[] }` — upcoming = planned not completed, soonest first; done = entries (dated `on` + `time`) and completed planned (dated `completedAt`, text = task title), newest first; ties newest `createdAt` first.
  - `rowLine(log: {upcoming: LogLine[]; done: LogLine[]}, optionId: string): { next?: string; last?: string } | null` — next = `"{Kind} {Wkd Mon D}{, h:mm}"` for the option's first upcoming (e.g. `Home visit Thu Oct 30, 10:00`); last = `"{Kind} {Mon D}"` for its newest done; when there is no next, last also carries ` · “{summary}”` if summary ≤ 40 chars. Null when neither.
- Produces in `src/lib/choices/logDb.ts` (`type Db = Pick<SupabaseClient,'from'>`):
  - `listGoalLog(db, goal: GoalRef): Promise<{ entries: LogEntry[]; planned: PlannedEvent[] } | null>` — entries by goal key; planned = tasks with `log_kind is not null` and the same goal key (`goal_task_id` or `goal_id`); null on any error.
  - `addLogEntry(db, userId, input: { goal: GoalRef; optionId?: string; kind: LogKind; on: string; time?: string; summary: string }): Promise<LogEntry | null>`
  - `updateLogEntry(db, id, patch: Partial<{ kind; on; time: string|null; summary; optionId: string|null }>): Promise<boolean>` (optionId change is refused by the DB guard; the UI never sends it — keep the field out: patch is `kind/on/time/summary` only).
  - `deleteLogEntry(db, id): Promise<boolean>` — true only when a row came back (`.select('id')`), as `deleteFollowUp` does.
  - `planEvent(db, userId, input: { goal: GoalRef; goalContext: TaskContext|null; goalScope: string; optionId?: string; optionName?: string; contactId?: string; kind: LogKind; on: string; time?: string; summary: string }): Promise<string | null>` — inserts a task: title `{Label}: {summary}` + ` ({optionName})` when about an option; `scheduled_for` = local date at `time` (or local midnight with `is_all_day: true` when no time; `is_all_day: false` otherwise); `bucket: 'timed'`; `log_kind`; `choice_option_id`; `contact_id`; `context`; `scope` (`goalScope || 'individual'`); `goal_task_id` or `goal_id` by `goal.kind`. Returns the task id.
  - `deletePlannedEvent` = reuse `deleteFollowUp` from `db.ts` (re-export is fine).

- [ ] **Step 1: Write failing tests** in `log.test.ts`: `statusAfterLog('considering','call') === 'contacted'`; `('considering','note') === null`; `('heard_back','visit') === null`; `('ruled_out','call') === null`; `isAhead('2026-10-23', new Date(2026,9,22,23,30)) === true` and `isAhead('2026-10-22', new Date(2026,9,22,23,30)) === false` (local evening); `mergeLog` orders upcoming soonest-first and done newest-first with a completed planned task among entries; `rowLine` for an option with one upcoming visit Oct 30 10:00 and a call Oct 22 gives `{ next: 'Home visit Thu Oct 30, 10:00', last: 'Phone call Oct 22' }`; with only the call (summary "Quote in a week") gives `{ last: 'Phone call Oct 22 · “Quote in a week”' }`; null for an option with nothing.
- [ ] **Step 2: Write failing tests** in `logDb.test.ts` with a fake `from()` recorder (see how `src/lib/choices/db.test.ts` or the Choices tests fake the client; if none, a minimal chainable stub): `planEvent` on a **year goal** writes `goal_id` (not `goal_task_id`), `log_kind: 'visit'`, `is_all_day: false`, title `Home visit: Walk through (Scher)`; without time writes `is_all_day: true`; `addLogEntry` writes `goal_task_id` for a task goal and `choice_option_id` when given.
- [ ] **Step 3: Run tests, verify they fail.**
- [ ] **Step 4: Implement** the three files.
- [ ] **Step 5: Run tests, verify they pass.** Run: `npx vitest run src/lib/choices/log.test.ts src/lib/choices/logDb.test.ts`
- [ ] **Step 6: Commit** `feat(log): log types, merge and row-line rules, data access`

### Task 3: Log on the comparison page

**Files:**
- Create: `src/hooks/useGoalLog.ts`, `src/components/choices/LogDialog.tsx`, `src/components/choices/LogList.tsx`, `src/components/choices/LogPage.test.tsx`
- Modify: `src/components/choices/useChoiceEditing.ts`, `src/components/choices/ChoicePage.tsx`, `src/components/choices/ComparisonTable.tsx`, `src/components/choices/OptionCards.tsx`, `src/components/choices/OptionRow.tsx`, `src/dev/choiceFixture.tsx`

**Interfaces:**
- Consumes Task 2.
- Produces:
  - `useGoalLog(goal: GoalRef | null): { log: { upcoming: LogLine[]; done: LogLine[] }; entries: LogEntry[]; loading: boolean; refetch(): Promise<void> }` — reads `listGoalLog`; refetches on `CHOICES_UPDATED`, `symphony-plan-updated`, focus/visibility (same helpers as `useChoices.ts`; export them from there if needed rather than copying).
  - `ChoicePageWriters` gains: `addLogEntry(input) => Promise<LogEntry|null>`, `updateLogEntry(id, patch) => Promise<boolean>`, `deleteLogEntry(id) => Promise<boolean>`, `planEvent(input) => Promise<string|null>` (the page's `useBoundWriters` binds them to `supabase` and the user id, wrapped in `announce`; the fixture stubs them).
  - `useChoiceEditing` gains `logEvent(input: { optionId?: string; kind: LogKind; on: string; time?: string; summary: string }): Promise<boolean>` — one `run('Log', …, { undo })`: if `isAhead` → `planEvent` else `addLogEntry`; then, when about an option and `statusAfterLog` returns a status, `updateOption(id, { status })`. Undo deletes what was made (entry or task) and restores the previous status. Also `editLogEntry(entry, patch)` (undo restores the old fields) and `deleteLogEntry(entry)` (undo re-adds with the same fields; a new id is acceptable).
  - `LogDialog({ title, options: {id,name}[], about?: string /* optionId or undefined = project */, initial?: LogEntry, now, onSave(input), onCancel })` — fields per the spec and mockup: kind chips (default `call`), date input (default today), time input (optional), summary input labelled "What happened, or what it's for" (required; Save disabled while empty), About select (`The project (no one contractor)` + options; hidden when `options` is empty). When the date is ahead, shows the hint: `That date is ahead, so this goes on your calendar for {Wkd Mon D}{ at h:mm}. It joins the log when you tick it done.` Title: `Log for {option name}` or `Log` for the project.
  - `LogList({ log, optionNames: Map<string,string>, memberName(userId): string|undefined, limit?: number, onEdit?(entryId), onDelete?(entryId) })` — "Coming up" and "Done" groups as in the mockup; each line `date · Kind · {option name | The project} · text`, upcoming lines add `on your calendar`; done entry lines show the logger's first name; a ⋯ on entry lines with Edit / Delete (after an inline confirm, as option delete does); `limit` shows the newest N done lines with `All {n}` to expand.
- [ ] **Step 1: Write failing tests** in `LogPage.test.tsx` rendering `ChoicePageView` with writers stubs (pattern: `OptionEditing.test.tsx`) and a mocked `useGoalLog`:
  - row actions include a `Log` button per option; clicking it opens `Log for Martinez Tile & Bath`.
  - saving a past Phone call on an option in Considering calls `addLogEntry` with the option id and `updateOption(id, {status:'contacted'})`, one `run` with an undo; running that undo calls `deleteLogEntry` and restores `considering`.
  - saving a Home visit dated tomorrow calls `planEvent` (not `addLogEntry`) and shows the calendar hint before saving.
  - logging on a Heard back option does not call `updateOption`.
  - the row shows `rowLine` text (e.g. `Home visit Thu Oct 30, 10:00 · last: Phone call Oct 22`).
  - the Log section lists Coming up and Done lines and `+ Log` opens the dialog with About = the project.
- [ ] **Step 2: Run, verify failing.**
- [ ] **Step 3: Implement.** Row line goes under the status chip in `ComparisonTable` and in the card header area in `OptionCards` (pass a `logLineOf?: (o) => {next?; last?} | null` prop through `ComparisonProps`). `Log` sits before `Status ▾` in `OptionActions` (new optional `onLog?(o)` handler); `⋯` gains `History` (new optional `onHistory?(o)`) which opens a dialog with `LogList` filtered to that option. The Log section (`<h2>`-style heading "Log" with "+ Log") goes after the add-option form, `limit={10}`. Stub the new writers in `choiceFixture.tsx` and give the fixture a small in-memory log (a planned visit on o4, a past call on o1, a project note) so the dev page shows it.
- [ ] **Step 4: Run** `npx vitest run src/components/choices src/apps/choices src/lib/choices` — all pass.
- [ ] **Step 5: Visual check** at `/dev/choice-fixture` (wide and a narrow window) — controller does this if the implementer can't.
- [ ] **Step 6: Commit** `feat(log): log a call or visit from the comparison page`

### Task 4: Log on the goal panel and year goal page

**Files:**
- Create: `src/components/choices/GoalLogSection.tsx`, `src/components/choices/GoalLogSection.test.tsx`
- Modify: `src/components/surface/TapContextPanel.tsx` (after the `ChoicesSection` mount, ~:554), `src/components/goals/GoalView.tsx` (after `ChoicesSection`, ~:158)

**Interfaces:**
- Consumes `useGoalLog`, `LogList`, `LogDialog`, `useGoalChoices(goal)` (options of the goal's open choices for the About picker), `logDb` writers bound to `supabase` + user, `run` from `useCanvasActivity`.
- Produces `GoalLogSection({ goal: GoalRef; goalContext: TaskContext|null; goalScope: string })` — heading `Log` with `+ Log`; `LogList limit={3}`; the dialog's About defaults to the project. Saving uses the same entry-or-plan and status rules as Task 3 (extract the shared save logic from `useChoiceEditing.logEvent` into one function in `src/lib/choices/log.ts` or a small `logSave.ts` that both call — no duplicate logic). Announces `CHOICES_UPDATED` after writes.
- [ ] **Step 1: Failing tests**: renders latest 3 done lines and `All N`; `+ Log` saves a project note with no option; a future date plans a task with the goal's keys.
- [ ] **Step 2: Run, verify failing. Step 3: Implement and mount in both places** (pass the goal's `context` and `scope` from the task/goal row). **Step 4: Run** the new test plus `src/components/surface` and `src/components/goals` suites. **Step 5: Commit** `feat(log): log section on the goal`

### Task 5: Chat change-card ops `event_log` and `event_plan` (client side)

**Files:**
- Modify: `src/lib/canvas/changeCard.ts`, `src/components/canvas/ChangeCard.tsx` (only if row rendering needs it), `src/lib/canvas/applyChangeSet.ts`, `src/lib/choices/applyDeps.ts`, tests beside them (`changeCard.test.ts`, `applyChangeSet.test.ts`).

**Interfaces:**
- `ChoiceOpKind` gains `'event_log' | 'event_plan'`; `CHOICE_OPS` includes them (so the existing announce path fires).
- `ChangeOp` gains optional `logKind?: LogKind`, `time?: string` (HH:MM), `summary?: string`; reuses `goalTaskId`/`goalId`, `optionId`/`optionKey`/`optionName`, `choiceId`/`choiceKey`, `date`, `goalTitle`.
  - Target: exactly one of (a) `goalTaskId`/`goalId` (project-level), or (b) an option reference (`optionId` with `choiceId`, or `optionKey` with `choiceKey`/`choiceId` as other option ops).
- `opRow`: `event_log` → `{ kind: 'LOG', title: '{optionName ?? goalTitle} · {Label} · {dayWords}', where: '“{summary}”' }`; `event_plan` → `{ kind: 'PLAN', title: '{optionName ?? goalTitle} · {Label} · {dayWords}{, h:mm}', where: 'goes on your calendar' }`.
- `choiceOpsWellFormed`: both need `logKind` in `LOG_KINDS`, `date` matching `YMD`, `summary` 1–500 chars after trim, `time` absent or `HH:MM`; `event_log` refuses a date after today; `event_plan` refuses today or earlier.
- `ChoiceWriters` gains `addLogEntry(userId-bound input) => Promise<LogEntry|null>`, `deleteLogEntry(id)`, `planEvent(input) => Promise<string|null>`; `makeChoiceWriters` binds them (reviewed-change client).
- `applyChoiceOp`: for an option target, resolve the option and its choice detail as `follow_up` does and use the detail's goal/context/scope; for a goal target, load the goal's `context`/`scope` (add `loadGoalFacts(goal): Promise<{context, scope} | null>` to `ChoiceWriters`, reading `tasks` or `goals`). `made(id, undo)` with `deleteLogEntry` / `deleteTask`. Applying never changes status (the agent proposes a separate `option_status` row).
- [ ] **Step 1: Failing tests**: wellFormed accepts a valid option-level `event_log` and a valid goal-level `event_plan`; refuses an `event_log` dated tomorrow, an `event_plan` dated today, a missing summary, a bad kind, both goal and option targets; `opRow` text for each; `applyChangeSet` with `[option_add(key k), event_log(optionKey k)]` on an existing choice writes the entry with the new option id and undo deletes both; an `event_plan` on a year goal calls `planEvent` with `goal.kind === 'goal'`.
- [ ] **Step 2–4:** run failing, implement, run passing (`npx vitest run src/lib/canvas src/lib/choices src/components/canvas`). **Step 5: Commit** `feat(log): LOG and PLAN rows on the change card`

### Task 6: Agent — read and propose log events

**Files:**
- Modify: `supabase/functions/symphony-agent/choices.ts`, `supabase/functions/symphony-agent/changeSet.ts` (mirror the new kinds/fields), `supabase/functions/symphony-agent/index.ts` (prompt bullet ~:173; ref loading in the propose handler ~:1667-1690), `supabase/functions/symphony-agent/choices.test.ts`

**Interfaces:**
- `PROPOSE_CHOICE_CHANGES_TOOL` op enum gains `event_log`, `event_plan`; item schema gains `log_kind` (enum of the five), `time` (`HH:MM`), `summary`; the description adds one line each: event_log = something that already happened (date today or earlier); event_plan = a future visit/call/meeting (date after today) that goes on the calendar; name either an option (option_id/option_name with choice_id) or the goal alone (goal_id = the month/season goal task id or year goal id — reuse the `choice_add` goal fields).
- `choiceSetFromInput` validates as Task 5's `choiceOpsWellFormed` (same messages style as existing errors, e.g. `${at}: event_log is for things that already happened; use event_plan for a future date`). Today = the user's local date the agent already uses for `follow_up` (reuse that helper; do not use UTC).
- `resolveChoiceRefs` resolves the option and fills `optionName`, `goalTitle`, `title`; for a goal-only target loads the goal title (extend `loadChoiceRefs` goal loading).
- `readChoices` output adds, per goal read, a `log` block: the latest 20 done lines and all upcoming ones (date, kind label, option name or "the project", summary/title).
- Prompt bullet: add — "Log calls, visits, messages, meetings and notes with event_log (past) and plan future ones with event_plan. When logging a contact with an option that is Considering, also propose option_status → contacted in the same card. Never set a status backward."
- [ ] **Step 1: Failing tests** in `choices.test.ts`: input with `event_log` + `option_status` parses; `event_log` dated tomorrow is refused with the message above; `event_plan` on a goal-only target resolves `goalTitle`; `readChoices` includes a `Log` section with an upcoming visit and a past call (use the existing fake-db pattern in that test file).
- [ ] **Step 2–4:** fail, implement, pass (`npx vitest run supabase/functions/symphony-agent/choices.test.ts supabase/functions/symphony-agent/changeSet.test.ts`). **Step 5: Commit** `feat(log): chat reads the log and proposes LOG and PLAN`

### Task 7: MCP tool `symphony_log_event`

**Files:**
- Modify: `tools/symphony-mcp-server.ts` (next to `symphony_add_option`, ~:358), and its `readChoicesLocal` to include the log the same way as Task 6.

**Interfaces:**
- `symphony_log_event({ goal_task_id?: string, goal_id?: string, option_id?: string, kind: enum five, on: 'YYYY-MM-DD', time?: 'HH:MM', summary: string })` — exactly one of goal_task_id/goal_id/option_id; when `option_id`, derive the goal keys from the option's choice; refuses a date after today (`toolError('on is in the future; plan it in Symphony instead')`); inserts into `goal_log_entries` as the signed-in user; when the option's status is `considering` and kind is a contact kind, updates it to `contacted`; returns the inserted row JSON.
- [ ] **Step 1:** Implement (no test harness exists for this file; keep it to the same shape as `symphony_add_option`). **Step 2:** `npx tsc --noEmit -p tsconfig.node.json` is not applicable; run `npx tsx --check tools/symphony-mcp-server.ts` or the repo's existing check for this file (look in package.json scripts; if none, `npx tsc --noEmit --skipLibCheck --module esnext --moduleResolution bundler --target es2022 tools/symphony-mcp-server.ts`). **Step 3: Commit** `feat(log): MCP symphony_log_event`
