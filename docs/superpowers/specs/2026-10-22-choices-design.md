# Choices: comparing options inside a project

**Date:** 2026-10-22
**Status:** Draft, awaiting Scott's review
**Author:** Scott + Claude (Scott skipped the questions; every "Claude's call" below is open to change)

## Why

Scott asked whether Symphony could track the bathroom renovation, including
finding a contractor. Running the project works today: tasks on days, a contact
on each task, files on tasks, notes, Family sharing. **Picking the contractor
doesn't.** Each candidate ends up as a contact, a "get a quote" task and a PDF
on that task. Nothing puts the bids next to each other, and nothing shows who
hasn't answered yet. Scott: this is "really useful and possibly integral
functionality for Symphony."

The same thing comes up all over household life: schools, camps, a car, a
rental, a pediatrician, a summer trip. Prior art in this repo describes the gap
without filling it: `docs/design/CONTEXT-AND-SHARING-PROPOSAL.md:236-248` (a
"Kitchen Remodel" project with "Get three quotes") and the "Decision log" kept
as project-notes text in `docs/demo/demo-script.md:160`.

**Symphony structures; it doesn't guide** (Scott, 2026-10-18, see
`2026-10-18-friday-weekly-session-design.md`). The people bring the options and
the facts, and they make the decision. Symphony gives them a labeled place,
sorts what they drop in into that place, and shows it back.

## Goals

- A **choice** inside a project ("Contractor") holds the **options** being
  weighed ("Martinez Tile", "Harbor Bath", "Dave's cousin").
- Options sit side by side on the facts the people care about: price, earliest
  start, insured, references, and anything else they add.
- Each option keeps what belongs to it: the contact, the quote file, notes, and
  where it stands (contacted, heard back, ruled out).
- Who hasn't replied shows as a fact ("Contacted 6 days ago · no reply"). One
  tap makes a follow-up task.
- Deciding records what was chosen, when, and the person's own one-line reason.
  The comparison is kept, never deleted.
- Scott and Iris see and edit the same choice when the project is Family.
- Things said or dropped in ("Iris's friend used Martinez Tile, 410-555-0142",
  a quote PDF) land in the right choice through the change card.

## Non-goals (v1)

- Budgets and spending tracking for the project. A price on an option is a fact
  about that option, not a budget.
- Finding contractors from outside sources (Angi, Thumbtack, Yelp). People bring
  the candidates.
- Contracts, payments, invoices, change orders.
- Choices outside a project (see "Claude's calls").

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

## What it is

### On the project page

`ProjectViewRedesign.tsx` gains a **Choices** section above Tasks. Each choice
is one compact card:

- Open: `Contractor · 4 options · 2 heard back · 1 waiting`
- Decided: `Contractor · Chose Martinez Tile · Oct 30 · $18,400`, with "See the
  comparison"

"+ Choice" adds one. The only thing it asks for is a title.

### The comparison

Tapping a choice opens it.

- **Wide screens (desktop, landscape iPad):** a table. Options are rows; the
  choice's **columns** are the facts. The first column is the option's name and
  status. Tap a column heading to sort by it.
- **Narrow screens:** each option is a card with its facts as lines, in the same
  order.
- **Columns** are named by the person. A new choice starts with one column,
  **Price**, which can be renamed or removed (Claude's call: money needs a typed
  column, and an empty table is friction). "+ Column" adds one with a name and a
  kind: text, money, date, or yes/no.
- **Each option** has a name, an optional linked contact (phone and email shown
  from the contact), a status, its column values, notes, and attachments.
- **Status** is a short fixed set the person sets: **Considering · Contacted ·
  Heard back · Ruled out · Chosen.** Ruled-out options fold into "+2 ruled out"
  at the bottom.
- **Facts on the row, never advice:** "Contacted Oct 16 · no reply", "Quote
  attached", "Waiting 6 days" (from a linked waiting task).
- **Follow up:** when an option is Contacted, the row offers "Follow up on…". It
  creates a task in the project with `is_waiting`, `waiting_for` set to the
  option's name, `contact_id` set to the option's contact, and a date. That task
  shows in the project's Tasks and on its day like any other.
- **Choose:** "Choose this" on a row asks for an optional one-line reason (the
  person's words), then marks it Chosen. The other options keep their status. The
  choice becomes Decided with `decided_at`. "Reopen" undoes it.
- Every write has Undo, the same as the rest of the app.

### Dropping things in (change card)

Free input goes through the existing change card, never chat prose. New rows,
in the change card's existing voice:

- `Contractor · Add Martinez Tile (410-555-0142)`, which can create or link the
  contact
- `Contractor · Martinez Tile · Price $18,400`
- `Contractor · Harbor Bath → Heard back`
- `Bathroom renovation · New choice: Tile`

A quote PDF dropped on an option, or on the choice with the option named, is
attached to that option. Stage 3 reads it (the existing attachment `facets`
analysis) and proposes the values it found as change-card rows for the person
to approve. Nothing is written without approval.

## Data model

Two new tables. They follow the household-sharing pattern used everywhere else:
`scope` decides visibility (`20261013170000_rls_household_once.sql`), and only
the owner can insert.

**`choices`**: `id, user_id, project_id (FK projects, on delete cascade),
title, status (open|decided), chosen_option_id (nullable FK), decided_at,
decided_note text, columns jsonb, scope, sort_order, created_at, updated_at`

- `columns` is an ordered array of `{ id, label, kind: text|money|date|yesno }`.
  Kinds are fixed; labels are the person's.

**`choice_options`**: `id, choice_id (FK, on delete cascade), user_id, name,
contact_id (nullable FK contacts, on delete set null),
status (considering|contacted|heard_back|ruled_out|chosen), status_changed_at,
values jsonb, notes text, scope, sort_order, created_at, updated_at`

- `values` is keyed by column id. Money is stored as integer cents. Dates are
  ISO dates.
- A choice and its options take `scope` from their project, and are recomputed
  when the project's scope changes.

**Attachments:** add `choice_option` to the attachment entity types in all three
places that must agree: the database check (`2026-08-05_documents_shelf.sql:30`),
`src/types/attachment.ts:5`, and `src/lib/taskAttachments.ts:9`. Visibility
follows the parent, as it does today.

**Waiting:** reuse `tasks.is_waiting`, `waiting_since` and `waiting_for`. A
follow-up task links to its option by a new nullable
`tasks.choice_option_id`, so the row can show "Waiting 6 days" without guessing
from text.

**Undo journal:** add both tables to the reviewed-change trigger list
(`20261016100000_reviewed_change_recovery.sql:58`).

## Prerequisites found while reading the code

These block Iris seeing a Family choice, so they come first:

1. `useProjects.updateProject` changes `context` without recomputing `scope`
   (`src/hooks/useProjects.ts:143-154`). A project moved to Family later stays
   private.
2. MCP `symphony_create_project` inserts without `scope`
   (`tools/symphony-mcp-server.ts:326-328`). Every project made that way is
   private.
3. The in-app agent has no project tools, and its task create and update have no
   `project_id` (`supabase/functions/symphony-agent/index.ts:231-283`). Drop-in
   can't place anything in a project until it can list and resolve projects.

Noted but not blocking: `tasks.is_waiting` and `waiting_since` exist live but no
migration creates them. `scripts/seed-demo.mjs:297` writes columns that don't
exist (`lists.project_id`, `list_items.is_checked`).

## Build in stages, each usable on its own

1. **Fix the scope gaps (1 and 2), then add choices by hand.** Tables, RLS, the
   Choices section, the comparison (table and cards), statuses, columns,
   attachments on options, Follow up, Choose and Reopen, Undo. Real test: the
   bathroom contractor, with Iris looking from her own account.
2. **Drop-in.** Agent project tools (prerequisite 3); change-card op kinds
   `choice_add`, `option_add`, `option_set`, `option_choose` across the six
   touch points (both `changeSet.ts` files, `PROPOSE_CHANGES_TOOL`,
   `resolveRefs`, `changeCard.ts` rows and scope headings, an `applyChangeSet`
   case); MCP tools for Claude Code (`symphony_list_choices`,
   `symphony_add_option`, `symphony_update_option`).
3. **Quotes read themselves.** A quote attached to an option proposes its
   values (price, start date, and any column it matches) as change-card rows.

## Claude's calls (Scott to confirm or change)

- **The name.** "Choices" for the place, "options" for what's in it. "Decision"
  sounded heavier, and "Compare" names the action, not the place.
- **A choice always lives in a project in v1.** "Pick a summer camp" becomes a
  small project. This avoids a new top-level place. A standalone home can come
  later if it keeps happening.
- **Price is the one starting column.** Everything else is added by the person.
- **The five statuses** above, the same for every kind of choice ("Heard back"
  rather than "Quoted", so it fits schools and camps too).
- **Options are rows, columns are facts.** That works on phones; options as
  columns doesn't.
- **No cheapest-highlighting,** even though it's a fact, because it steers.

## Left to the builder

- Exact visuals, within the app's current look. No new visual language.
- Whether the comparison opens as a panel or as its own route.
- How "+ Column" picks a kind (a menu or inline chips).
- The test plan, which must include real-account RLS checks for a Family choice
  (Scott and Iris), per this repo's privacy rules.
