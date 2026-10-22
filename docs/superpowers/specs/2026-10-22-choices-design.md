# Choices: comparing options on a goal

**Date:** 2026-10-22
**Status:** Approved by Scott 2026-10-22 ("ship it"); home moved from projects to goals the same day (Scott chose "On a goal")
**Author:** Scott + Claude (Scott skipped the questions; every "Claude's call" below is open to change)

## Why

Scott asked whether Symphony could track the bathroom renovation, including
finding a contractor. Running the renovation works today as a goal ("Redo the
bathrooms" on a month or season list) with its steps, contacts on tasks, files
and Family sharing. **Picking the contractor doesn't.** Each candidate ends up
as a contact, a "get a quote" task and a PDF on that task. Nothing puts the bids
next to each other, and nothing shows who hasn't answered yet. Scott: this is
"really useful and possibly integral functionality for Symphony."

The same thing comes up all over household life: schools, camps, a car, a
rental, a pediatrician, a summer trip.

**Where it lives:** on a goal (Scott, 2026-10-22). Projects were retired from
the UI on 2026-09-02 (`src/main.tsx`, "HIDE THE NOUN, KEEP THE DATA"), and the
first draft of this spec wrongly put choices on the project page. A goal with
its steps (`2026-09-15-steps-under-a-goal-design.md`) is today's home for "a
thing we're doing that has work under it".

**Symphony structures; it doesn't guide** (Scott, 2026-10-18, see
`2026-10-18-friday-weekly-session-design.md`). The people bring the options and
the facts, and they make the decision. Symphony gives them a labeled place,
sorts what they drop in into that place, and shows it back.

## Goals

- A **choice** on a goal ("Contractor" on "Redo the bathrooms") holds the
  **options** being weighed ("Martinez Tile", "Harbor Bath", "Dave's cousin").
- Options sit side by side on the facts the people care about: price, earliest
  start, insured, references, and anything else they add.
- Each option keeps what belongs to it: the contact, the quote file, notes, and
  where it stands (contacted, heard back, ruled out).
- Who hasn't replied shows as a fact ("Contacted Oct 16 · no reply"). One tap
  makes a follow-up task, which is a step of the goal.
- Deciding records what was chosen, when, and the person's own one-line reason.
  The comparison is kept, never deleted.
- Scott and Iris see and edit the same choice when the goal is shared (Family).
- **The work being priced is part of the choice** (Scott, 2026-10-22: "if I
  want to redo all three bathrooms in the house, or just two, or just one").
  The person lists the pieces of work once. Each quote is a set of priced
  lines, and the comparison shows what each quote adds up to for exactly the
  pieces selected.
- **Chat does everything the page does** (Scott, 2026-10-22: "deeply
  integrated with chat"): add and change choices, options, priced lines, the
  work, columns, values, statuses, follow-ups and the decision, by voice or
  typing, with files. Changes come back as the change card. Questions are
  answered with the recorded facts.

## Non-goals (v1)

- Budgets and spending tracking. A price on an option is a fact about that
  option, not a budget.
- Finding contractors from outside sources (Angi, Thumbtack, Yelp). People bring
  the candidates.
- Contracts, payments, invoices, change orders.
- Choices with no goal. Every choice belongs to exactly one goal.
- Choices on the kitchen wall. The wall's change card refuses choice changes,
  as it does routine and goal changes today.

## Anti-goals: failures even if it works

- **Symphony picks or ranks.** No scores, weights, "best value" or "recommended"
  badges, no highlighting the cheapest, no AI summary of which option looks
  strongest. Sorting by a column the person tapped is fine; marking a winner is
  not.
- **Symphony asks coaching questions** ("What matters most to you?"). The
  columns are a labeled place; the person names them.
- **A spreadsheet's worth of chrome.** If it feels like setting up Airtable
  before you can add your first contractor, it has failed. The first option
  must be addable within seconds of creating the choice.
- **Losing history.** Ruled-out options and the comparison stay recoverable
  after the decision.
- **Bringing back the Projects noun.** Choices hang off goals; nothing here
  reintroduces "project".

## What it is

### On the goal

A goal's panel gains a **Choices** section right after its Steps:

- Month and season goals (`tasks.is_goal`): `TapContextPanel.tsx`, after
  `PanelSubtasks`.
- Year goals (`goals` rows): `GoalView.tsx` at `/goals/:id`.

Each choice is one compact row:

- Open: `Contractor · 4 options · 3 heard back · 1 waiting 6 days · 1 ruled out`
- Decided: `✓ Contractor · Chose Martinez Tile & Bath · Oct 30 · Main + Hall ·
  $28,200`

"+ Choice" adds one. The only thing it asks for is a title. Tapping a row
opens the comparison.

### The comparison

Its own page at `/choice/:id`, with "‹ {goal title}" back to the goal.

- **Wide screens (desktop, landscape iPad):** a table. Options are rows; the
  choice's **columns** are the facts. The first column is the option's name,
  contact line and status. Tap a column heading to sort by it; blanks sort last.
- **Narrow screens:** each option is a card with its facts as lines, in the same
  order. Empty facts are left out.
- **Price is built in**, computed from the option's priced lines (see "The
  work, and priced lines"). Every other **column** is named by the person. "+
  Column" adds one with a name and a kind: text, money, date, or yes/no.
- **Each option** has a name, an optional linked contact (phone shown from the
  contact), a status, its column values, notes, and attachments.
- **Status** is a short fixed set the person sets: **Considering · Contacted ·
  Heard back · Ruled out · Chosen.** Ruled-out options fold into "+N ruled out"
  at the bottom.
- **Facts on the row, never advice:** "Contacted Oct 16 · no reply ·
  follow-up Thu" (from the status date and the linked waiting task).
- **Follow up:** when an option is Contacted, the row offers "Follow up on…". It
  creates a task that is a step of the goal (`goal_task_id` for a month or
  season goal, `goal_id` for a year goal), with `is_waiting`, `waiting_for` set
  to the option's name, `contact_id` set to the option's contact,
  `choice_option_id` set to the option, and the chosen date.
- **Choose:** "Choose this" on a row asks for an optional one-line reason (the
  person's words), then marks it Chosen. The other options keep their status.
  The choice becomes Decided and records `decided_at`, the selected pieces, and
  the price shown for them. "Reopen" undoes it.
- An input at the bottom, "Add an option: a name, or paste a phone number",
  adds an option in one step.
- Every write has Undo, the same as the rest of the app.

### The work, and priced lines

Contractors quote different scopes: one bathroom, two together, all three at a
bundle price. A single Price column can't compare those.

- **The work** is an optional list of pieces on the choice, each with a name and
  the person's own description ("Main bath · Gut it. Walk-in shower where the
  linen closet is. Keep the tub."). It shows above the comparison. "Edit the
  work" adds, renames, describes or removes pieces. It doubles as the scope you
  send each contractor.
- **Each option's price is a set of lines.** A line covers one piece or several
  together, has an amount, and an optional note ("excludes fixtures"). For
  example, Harbor: Main $22,900, and All three $44,500.
- **Selecting what to price.** Each piece is a toggle; the selection is saved on
  the choice and shared. The Price heading becomes "Price · Main + Hall" (or
  "Price · All three" when every piece is on). Each option shows the total of
  its lines that cover exactly the selected pieces, with how it adds up
  underneath ("Main $18,400 + Hall $9,800", or "Main + Hall, one price"). When
  a quote can be added up more than one way, the lowest total for that option
  is shown. That is arithmetic on its own lines, not a comparison between
  options.
- **Gaps are facts:** an option that can't cover the selection shows "No price
  for just these" and what it did price ("Priced: Main $22,900 · All three
  $44,500").
- **A choice with no pieces** keeps a plain Price: the sum of the option's lines
  (normally one).

### Chat

Chat is a full way in. Everything the page can do, chat can do. It reads as the
existing chat with the existing change card (`ChangeCard.tsx`, chat mode:
"Draft · Not saved", "Save N changes", "Make a change"). New rows, in the card's
existing voice:

- `NEW · Contractor` (a new choice, under the goal)
- `ADD · Martinez Tile & Bath (410-555-0142)` (a new option; can link a contact)
- `STATUS · Chesapeake Renovations → Heard back`
- `PRICE · Chesapeake · Main bath · $19,750`, or `PRICE · Chesapeake · Main +
  Hall, together · $27,000`
- `SET · Chesapeake · Earliest start · Dec 1`
- `COLUMN · Warranty (text)`
- `WORK · Kids' bath · Tile and fixtures only`
- `CHOOSE · Martinez Tile & Bath · Main + Hall · "Earliest start"`
- `REOPEN · Contractor`
- `FOLLOW UP · Rob (Dave's cousin) · Thu Oct 23`

**Questions get facts.** "What would all three cost with Martinez?" is answered
from what's recorded, with the sum shown ("$35,400 for all three. Main $18,400
+ Hall $9,800 + Kids' $7,200. They have no price for the three together."). "Who
hasn't gotten back to us?" lists them with dates. Chat doesn't volunteer which
option looks best, and doesn't rank. If asked directly "which should we pick?",
it answers with the facts side by side and leaves the call to the people.

A quote PDF dropped in chat with an option named is attached to that option.
Stage 2 reads it (the existing attachment `facets` analysis) and proposes the
lines and values it found as change-card rows. Nothing is written without
approval.

## Data model

Three new tables. **Visibility follows the goal:** a person can see, change or
add to a choice exactly when they can see its goal under that goal's own RLS
(the household rule in `20261013170000_rls_household_once.sql`). A Family goal's
choices are therefore Iris's too, and a private goal's stay private. There is no
`scope` column to drift out of step with the goal.

**`choices`**: `id, user_id, goal_task_id (FK tasks, on delete cascade, null),
goal_id (FK goals, on delete cascade, null), title, status (open|decided),
chosen_option_id (FK choice_options, on delete set null), decided_at,
decided_note, decided_work text[], decided_amount_cents bigint, columns jsonb,
work jsonb, selected_work text[], sort_order, created_at, updated_at`

- Exactly one of `goal_task_id` and `goal_id` is set (a check constraint), and
  `goal_task_id` must name an `is_goal` task.
- `columns` is an ordered array of `{ id, label, kind: text|money|date|yesno }`.
  Kinds are fixed; labels are the person's.
- `work` is an ordered array of `{ id, label, description }`. `selected_work`
  is the current toggle state, shared by everyone who sees the choice.

**`choice_options`**: `id, choice_id (FK, on delete cascade), user_id, name,
contact_id (FK contacts, on delete set null), status
(considering|contacted|heard_back|ruled_out|chosen), status_changed_at, values
jsonb, notes, sort_order, created_at, updated_at`

- `values` is keyed by column id. Money is integer cents; dates are ISO dates;
  yes/no is a boolean.

**`choice_price_lines`**: `id, option_id (FK choice_options, on delete
cascade), user_id, work_ids text[], amount_cents bigint, note, sort_order,
created_at, updated_at`

- A separate table rather than JSON on the option, so Scott and Iris adding
  lines at the same time can't overwrite each other.

**Attachments:** add `choice_option` to the attachment entity types in all three
places that must agree: the database check, `src/types/attachment.ts`, and
`src/lib/taskAttachments.ts`. Its select policy gains a `choice_option` branch
that follows the option's visibility.

**Waiting:** reuse `tasks.is_waiting`, `waiting_since` and `waiting_for`. A
follow-up task links to its option by a new nullable `tasks.choice_option_id`
(on delete set null).

**Undo journal:** add all three tables to the reviewed-change triggers
(`20261016100000_reviewed_change_recovery.sql`).

## Build in stages, each usable on its own

1. **Choices, by page and by chat.**
   - Tables, RLS, attachments, triggers.
   - The Choices section on goals, the comparison page (table and cards), the
     work and priced lines, statuses, columns, attachments on options, Follow
     up, Choose and Reopen, Undo.
   - Chat: a read tool for a goal's choices, and a propose tool whose ops come
     back on the existing change card and save through the existing reviewed
     save with one Undo.
   - Claude Code (MCP): `symphony_list_choices` to read, and
     `symphony_add_option` / `symphony_set_price_line` /
     `symphony_update_option` to write.
   - Real test: the bathroom contractor, with Iris using her own account.
2. **Quotes read themselves.** A quote attached to an option proposes its
   priced lines, start date and any matching column as change-card rows.

## Claude's calls (Scott to confirm or change)

- **The name.** "Choices" for the place, "options" for what's in it.
- **Price is built in and computed from priced lines.** Everything else is
  added by the person.
- **When a quote adds up more than one way,** the lowest total for that option
  is shown, with how it adds up.
- **The pieces selected are shared,** not per person, so Scott and Iris see the
  same numbers when they talk it over.
- **The five statuses** above, the same for every kind of choice ("Heard back"
  rather than "Quoted", so it fits schools and camps too).
- **Options are rows, columns are facts.** That works on phones; options as
  columns doesn't.
- **No cheapest-highlighting,** even though it's a fact, because it steers.
- **The comparison is its own page** (`/choice/:id`), not a panel: it needs the
  width.
- **Chat gets its own propose tool** (`symphony_propose_choice_changes`) rather
  than more ops on `symphony_propose_changes`, which is already long and
  bench-tested; both produce the same change card.

## Left to the builder

- Exact visuals, within the app's current look. No new visual language.
- How "+ Column" picks a kind (a menu or inline chips).
