# Project log: what happened on a goal and with each option

Mockup: `assets/2026-10-22-choice-log-mockup.html` (Scott approved, 2026-10-22).
Builds on Choices (`2026-10-22-choices-design.md`), which is live.

## Why

Scott is renovating the upstairs bathroom and comparing contractors on a
Choice. Real progress comes as events: a phone call, a home visit for an
estimate, a message, a meeting with Iris. Today there is nowhere to record
them, so the comparison shows statuses with no history behind them.

## Decided by Scott

- Events can belong to **one option** (a contractor) or to **the goal itself**
  (a walkthrough with Iris, a permit call). Yes to both.
- Logging a contact on an option in **Considering** moves it to **Contacted**.
  It never moves an option backward (Heard back, Ruled out and Chosen stay).
- Chat can log events, the same as the page.

## Goals

- Record past events in seconds: kind, date, optional time, one line.
- Plan future events (a visit Thursday 10:00) so they land on the calendar.
- See the history per contractor (on its row) and for the whole project (a
  Log section on the comparison page and on the goal's panel).

## Non-goals

- Importing calls, texts, email or calendar events automatically.
- Attachments on log entries (option files already exist).
- Reminders beyond what a task on the calendar already gives.

## Anti-goals

- No advice: entries are facts in the person's words. Nothing says who "seems
  responsive" or ranks contractors by activity.
- No second copy of planned events: a planned event is a task, and it appears
  in the log from that task. Nothing syncs two records.

## What it is

**Kinds**, fixed: Phone call (`call`), Home visit (`visit`), Message
(`message`), Meeting (`meeting`), Note (`note`). Contact kinds are `call`,
`visit`, `message`, `meeting`; `note` is not a contact.

**Logging (the Log dialog).** Fields: What (kind chips, default Phone call),
When (date, default today; optional time), a one-line summary ("What happened,
or what it's for", required), and About (the option, or "The project (no one
contractor)"; preset from where it was opened).

- A date **today or earlier** saves a **log entry**.
- A date **after today** saves a **planned event**: a task that is a step of
  the goal (same goal keys, `context` and `scope` as follow-ups use), titled
  `{Kind}: {summary}` with the option name appended when about an option
  (`Home visit: Walk through upstairs bath (Scher Remodeling)`),
  `scheduled_for` at the date and time (all-day when no time),
  `choice_option_id` when about an option, and the new `tasks.log_kind` set to
  the kind. The dialog says so before saving: "That date is ahead, so this goes
  on your calendar for Thu Oct 30 at 10:00. It joins the log when you tick it
  done."
- Saving a contact kind (entry or plan) about an option in Considering also
  sets it to Contacted. One save, one Undo for both.

**The log list** merges, newest first:

- **Coming up:** open tasks with `log_kind` on this goal (soonest first), shown
  in the primary color with "on your calendar". One whose local date is
  before today is not coming up.
- **Date passed, not ticked done:** those open tasks whose date has passed
  (newest first); the line still opens its task. A row's "next" ignores them.
- **Done:** log entries, plus completed tasks with `log_kind` (dated by
  `completed_at`, at the task's scheduled time when not all-day). Each line: date · kind · option name or "The project" ·
  summary · who logged it (first name; "You" for the signed-in person is not
  required — first name is fine).
- Entries can be edited (kind, date, time, summary; to change what it is about, delete and log again) and deleted from
  their line's ⋯. Planned events are edited as tasks (open the task).

**On the comparison page** (`ChoicePage.tsx`):

- Each option row (table and cards) shows one line under its status: the next
  planned event if any ("Home visit Thu Oct 30, 10:00", primary color), then
  the latest done one ("last: Phone call Oct 22"). When there is no planned
  event, the latest done one alone, with its summary in quotes if it fits.
- The row's verbs gain **Log** (before Status), opening the dialog about that
  option. The option's ⋯ gains **History**, the log filtered to that option.
- A **Log** section under the table, "+ Log" in its heading, lists the whole
  goal's log (all its choices' options and the goal itself), latest 10 with
  "All N".

**On the goal** (`TapContextPanel.tsx` for month/season goals after Choices;
`GoalView.tsx` for year goals): a **Log** section with "+ Log" (About defaults
to the project; the picker lists options from the goal's open choices), and
the latest 3 lines plus "All N" which expands in place.

**Chat.** Two new change-card ops, in the card's existing voice:

- `LOG · Scher Remodeling · Phone call · Today` with the summary under it.
  `event_log` { goal ref; optional `optionId` or same-card `optionKey`; `kind`;
  `on` (date); `time?`; `summary` }. A date after today is refused for this op
  (the agent uses `event_plan`).
- `PLAN · Scher Remodeling · Home visit · Thu Oct 30, 10:00`. `event_plan`
  with the same fields; `on` must be after today.
- The automatic status change shows as its own row,
  `STATUS · Scher Remodeling → Contacted` with "because a call was logged",
  produced by the agent as a normal `option_status` op when the option is in
  Considering. Applying a log/plan op never changes status by itself in chat;
  the card shows exactly what will be written.
- The read tool returns each goal's log (entries and `log_kind` tasks) so
  questions like "when did Scher come out?" are answered from facts.
- MCP: `symphony_log_event` (past entries only; same fields as `event_log`).

## Data model

**`goal_log_entries`**: `id, user_id, goal_task_id (FK tasks, cascade, null),
goal_id (FK goals, cascade, null), choice_option_id (FK choice_options, cascade,
null), kind text check in (call, visit, message, meeting, note), happened_on
date not null, happened_at_time time null, summary text not null check
(length(btrim(summary)) between 1 and 500), created_at, updated_at`.

- Exactly one of `goal_task_id`/`goal_id` (check), `goal_task_id` must name an
  `is_goal` task (reuse the Choices trigger function), and when
  `choice_option_id` is set its choice's goal must be this row's goal
  (trigger).
- RLS: the four policies use `public.choice_goal_visible(goal_task_id,
  goal_id)`, insert also requires `user_id = auth.uid()`. Parent keys and
  `user_id` immutable for signed-in writers (same guards as Choices).
- `updated_at` trigger; reviewed-change journal triggers so chat saves undo.

**`tasks.log_kind`** text null, check in the same five kinds. Set only for
planned events.

Prod: applied by hand with `supabase db query --linked -f` inside one
transaction with its `supabase_migrations.schema_migrations` row, before the
push to main (memory: symphony-prod-migrations).

## Verification

- SQL tests on a throwaway local cluster (as the Choices tests do): visibility
  follows the goal (household member sees a Family goal's log; another
  household and a private goal's log are invisible), forged `user_id` refused,
  moving an entry to another goal refused, option-goal mismatch refused.
- Live checks on the bench accounts after applying the migration, cleaned up
  afterwards.
- Undo of a chat save that logged an entry, planned an event and set status
  removes all three.
- Unit tests for the merge/order of the log, the row line, the date-decides
  entry-or-plan rule, and the Considering→Contacted rule (never backward).
- Visual check of the page and dialog on the dev fixture, wide and narrow.

## Calls made by Claude (cheap to change)

- Planned events are tasks with `log_kind`, not log rows with a future date.
- One line per row; the full per-option list lives behind ⋯ History.
- The goal panel shows 3 lines; the comparison page 10.
- Entries record who logged them by `user_id`; no separate "who was there".
- A completed planned event appears in the log with the task's title, not a
  separate summary.
