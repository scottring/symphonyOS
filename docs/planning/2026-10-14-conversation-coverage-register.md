# Symphony conversation coverage register

Version 3, October 15, 2026. Branch `claude/beta-readiness-program` (origin/main `d781b072` plus `codex/beta-readiness`). Companion to [beta-readiness.md](beta-readiness.md), which holds the release gates; this register holds the per-intent evidence the gates point at.

Status marks, per the reliability plan §1:

- **IT** implemented and tested (automated, against the real code path; not a real-model run unless the evidence says so)
- **IU** implemented but unverified end to end
- **P** planned, not yet implemented
- **U** unsupported; the assistant must not pretend it works

Every tool runs through the signed-in person's own database client (row-level security). Screen context is reference, never authorization. Nothing below claims a deployed configuration unless the evidence column says "production".

## How a turn works (the contract every row relies on)

1. The client sends the turn with a stable `turnId`, the bounded screen context (`src/lib/workspace/context.ts`), the last change card's state, and (wall only) `surface: 'wall'`.
2. `symphony-agent` (`supabase/functions/symphony-agent/index.ts`) builds the prompt from the shared experience rules (`_shared/assistantExperience.ts`), the household roster, the household's date and local time, and the screen context, then runs up to 14 tool rounds.
3. Reads come back as text. Direct writes report `tool_result {ok, ids}`. Several changes come back as one `change_set` (never written server-side) or `proposal` (suggestions).
4. The turn ends with `done {reply, outcome}`. `outcome.state` is the one verdict every surface repeats: `answered | proposed | saved | partial | failed | unverified` (`symphony-agent/outcome.ts`, mirrored in `src/lib/turnOutcome.ts`). An `error` event carries the writes made before the failure.
5. The page applies an approved card itself through the app's own writers (`src/lib/canvas/applyChangeSet.ts`), refusing a stale set and offering one Undo for the set.
6. The live voice (`workspace-voice`) can only change data through `ask_symphony`, which runs the same turn and hands back `{reply, outcome}`; its instructions say what each state allows it to say.

Evidence for the contract: `symphony-agent/outcome.test.ts`, `src/lib/turnOutcome.test.ts`, `src/lib/agentTurn.test.ts` (outcome fallbacks), `src/hooks/useWorkspaceVoice.test.ts` (ask_symphony outcome), `symphony-agent/canvasEvents.test.ts` (tool_result, stable ids), `src/lib/canvas/applyChangeSet.test.ts` (stale refusal, rollback, Undo), `src/contexts/CanvasActivityContext.test.tsx` (receipts).

## Register

Columns: what the person wants · how they say it · context/permission needed · what Symphony may do · tool(s) · approval · on screen · says · failure/retry/cancel/Undo · surfaces · tests · status.

### Capture and Inbox

| Intent | Ways of asking | Needs | May | Tools | Approval | Screen | Says | Failure / Undo | Surfaces | Tests | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Capture one task | "Add call the plumber", "I need to…", "remind me to…" | signed-in member; life area (asks once if unclear) | write one task | `symphony_create_task` | none (one clear change) | row appears; receipt "Saved" with Undo | "Added … to Thursday" (only after `saved`) | retry reuses turnId → same row id, no duplicate; Undo deletes the created row | typed desktop/phone, voice desktop, wall (family only, via scratchpad or card) | canvasEvents (stableRowId), CanvasActivityContext receipts, ShellLayout typed-goes-to-agent | IT (contract) / IU (real model) |
| Capture several tasks in one breath | "plumber, Amazon pickup, clean the yard, and an all-day test drive this week" | as above | propose a card of adds | `symphony_propose_changes` (add ×N) | one Approve | dashed rows + change card | "Four on the card; the test drive is all day. Approve when ready." | card refused if page data moved (`seen`); Undo reverses the set | typed, voice, wall (task ops only) | bench J1 contract layer (`scripts/conversation-bench`), changeSet.test, applyChangeSet.test | IT (contract) / IU (real model: bench live layer not run) |
| Correct in the same breath | "call the plumber tomorrow — actually Friday" | — | one task, final date only | create_task once, or card revised | as above | one row, not two | names the final day | — | all | bench J1 step 2 (contract) | IT (contract) / IU (real model) |
| Triage Inbox | "sort my inbox", "what's in the inbox" | inbox visible | read; propose place/someday/assign/done | list_tasks, read_week, propose_changes | one Approve | card + dashed rows | summary + question | as cards | typed, voice | prompt rule only (index.ts "Doing versus suggesting") | IU |
| Paper / photo / document capture | attach a sheet | attachment | read; confirm; then routines or tasks | create_routine, create_task | model asks first (prompt) | — | lists what it found | — | typed | none for the agent path (plan-from-paper has its own) | IU |

### Today and Week

| Intent | Ways of asking | Needs | May | Tools | Approval | Screen | Says | Failure / Undo | Surfaces | Tests | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Move one task | "move that to Friday", "push the dentist to next week" | selected or named item | one update | `symphony_update_task` | none | row moves; receipt + Undo | "Moved to Friday." | Undo puts the previous fields back | all | CanvasActivityContext (updated → undo) | IT / IU |
| Move several | "move those three to Friday" | visible items | card (place ×N) | propose_changes | Approve | card | — | stale → refuse; Undo set | all | changeSet, applyChangeSet | IT |
| "That one" with two matches | "move that one" | selection, else asks | ask one question | — | — | — | "The dentist or the plumber?" | — | all | **P** | P |
| Complete a task | "done with the yard", tick | item | complete | `symphony_complete_task` | none | ticked; Undo | "Marked done." | reopen on Undo | all | receipts | IT / IU |
| Set aside / drop | "forget the yard", "not this week" | item | someday (never delete) | update_task bucket someday, or card `someday` | none / card | moves to Someday | "Set aside." | Undo restores | all | agent has no delete tool (this branch) | IT |
| Plan the day | "plan my day" chip | Today page | read week; one card | read_week, point, propose_changes | Approve | highlights, card | two or three sentences then questions | — | typed, voice | prompt + readWeek.test | IU |
| Review the day | evening chip | — | one card (done, carry, talk, someday, routine_skip) | as above | Approve | card | — | — | typed, voice | prompt | IU |
| Plan the week | "plan the rest of my week", "plan the week of Oct 17" | week page or named week; household week start | read week, calendar, email; one card revised each answer | read_week, list_events, search_email, propose_changes (week_start) | Approve | page rebuilds as the card changes | agent-led spine (`_shared/sessionScripts.ts`) | Approve refuses stale; Undo set | typed, voice (agent leads) | sessionScripts.test, readWeek.test, changeSet (week_start) | IU (real-model spine unmeasured) |
| Fit an all-day commitment around conflicts | "fit in an all-day test drive this week" | calendar connected | read events; ask about the real conflict; never invent a free day | list_events, read_week, propose_changes | Approve | — | names the conflict | — | typed, voice | **P** benchmark J1 | P |
| What's on today / this week | "what's today", "what's left this week" | — | read | read_week, daily_summary, list_events | — | points at items | short answer | — | all | readWeek.test, pointing.test | IT |
| Dinner tonight / set a meal | "what's for dinner", "make Thursday tacos" | family | read / replace one day's meal | `symphony_get_meals`, `symphony_set_meal` | none | meal line updates; receipt | "It was X, now Y" | Undo: none yet (**P**) | all | meals.test | IT (contract) |

### Routines

| Intent | Ways of asking | Needs | May | Tools | Approval | Screen | Says | Failure / Undo | Surfaces | Tests | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Skip this week's occurrence | "skip piano Thursday", "no soccer this week" | routine visible | card `routine_skip` (date) | propose_changes | Approve (routines always card) | card | "Just this week, or from now on?" if unclear | undoSkip | typed, voice; **wall: U** (says so) | bench R1 (contract), changeSet (routine ops), applyChangeSet | IT (contract) |
| Move / reassign one occurrence | "piano is at 5 on Thursday", "Iris takes pickup Friday" | — | `routine_move`, `routine_who` | propose_changes | Approve | card | — | undoMove / previous assignee | typed, voice | as above | IT |
| Change from now on | "piano is Tuesdays now", "stop the Saturday chores" | — | `routine_change`, `routine_rest` (until) | propose_changes | Approve | card | — | previous fields back; an earlier approved skip is untouched | typed, voice | bench R1 (contract), as above | IT (contract) |
| Add a routine | "every weekday at 7, feed the dog" | — | `routine_add` on the card; or `symphony_create_routine` for a single explicit one | propose_changes / create_routine | Approve / none | card / row | — | deleteRoutine on Undo (card) | typed, voice | as above; stableRowId | IT |
| Delete a routine | "delete the chore routine" | — | **U** (rest instead) | — | — | — | explains rest | — | all | webAccess/wallMode tests assert no delete tool | U by design |

### Goals at Month, Season and Year

| Intent | Ways of asking | Needs | May | Tools | Approval | Screen | Says | Failure / Undo | Surfaces | Tests | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Read the lists | "what's on November", "what did I want this season" | period | read | `symphony_read_plan`, `list_intentions` | — | points | — | — | typed, voice; wall: U (private) | readPlan.test | IT |
| Plan a month / season / year | "Plan November", "Plan this season with me" | the period that is ending | one card of plan ops (add, carry, let_go, done, merge, someday) | read_plan, propose_changes | Approve | card | period read back with counts; one question at a time; never invents goals | stale refuse; Undo set | typed, voice | bench M1 (year plan ops: carry, let go, done, add, Undo), readPlan.test, changeSet (plan ops), applyChangeSet (plan ops) | IT (contract) / IU |
| Add one goal outside a session | "add a goal for the fall: finish the deck" | — | direct write | `symphony_create_plan_item` | none | row; receipt | — | Undo deletes | typed, voice | planSaved.test, stableRowId | IT |
| Link a week task to a month goal | "that serves the deck goal" | both visible | link, never duplicate | `symphony_link_plan_item` | none | receipt | — | **P** Undo for links | typed | planning.test | IU |
| Suggest missing goals/links | "where do these belong" | — | suggestions only, dashed | `symphony_propose_plan_items` | Keep / Leave out | dashed | — | nothing written until kept | typed | canvasEvents (proposalItems) | IT |

### Item notes, people, links, places

| Intent | Ways of asking | Needs | May | Tools | Approval | Screen | Says | Failure / Undo | Surfaces | Tests | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Add what's needed to do a task | "the plumber is Mike, 555-…", "put the quote link on it" | saved task (not one still on a card) | notes, contact_id, phone, email, location, add_links, subtasks | update_task, create_contact, create_task(parent) | none | item panel | — | Undo restores fields | typed, voice | receipts; scopeDefaultCoverage (contact scope) | IT / IU |
| Find background in notes | "what did I write about the deck" | notes exist | search own notes | `symphony_search_notes` | — | source chips | names note titles, never paths | "could not check" ≠ "no notes" | typed, voice | experience.test | IT |

### Lists

| Intent | Ways of asking | Needs | May | Tools | Approval | Screen | Says | Failure / Undo | Surfaces | Tests | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Add to a list | "add milk to groceries" | list visible to the person | one insert | `symphony_add_list_item` | none | list; receipt | — | stable id on retry; Undo **P** | all (wall: family lists) | wallMode (write allowlist), stableRowId | IT (contract) |
| Check off / remove | "we got the milk", "take bread off" | — | check / delete item | `check_list_item`, `delete_list_item` | none | receipt | — | delete is the one destructive tool left; withheld after web reads | typed, voice | webAccess.test | IT |

### Connected calendar and mail

| Intent | Ways of asking | Needs | May | Tools | Approval | Screen | Says | Failure / Undo | Surfaces | Tests | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| What's on the calendar | "what's Thursday", "when is pickup" | calendar connected | read | `symphony_list_events` | — | — | — | explains disconnected/denied plainly | all (wall: family calendars) | — | IU |
| Put an occasion on the calendar | "Wheelies tonight 5:30–7 on the family calendar" | writable calendar for the domain | create event | `symphony_create_calendar_event` → `google-calendar-create-event` | none | receipt (`saved` only when the event function succeeded) | — | stable requestId per turn (this branch); Undo **P** | typed, voice | ShellLayout (typed goes to agent), handler.test (voice must call ask_symphony) | IU |
| Check email | "did the school send anything" | Gmail scope granted | search, read one thread | `search_email`, `read_email_thread` | — | — | names the mailbox searched; never "you have no such email" | denied/missing explained | typed, voice | experience.test | IT |
| Draft an email | "draft a reply to the coach" | Gmail send scope | draft only, never send | `symphony_draft_email` | none | receipt | "It's in Drafts; you send it." | — | typed, voice | prompt rule; receipt wiring (this branch) | IU |
| Connect an account | "connect my calendar" | — | **U** by voice; guide to Settings | — | — | — | explains the handoff | — | all | — | U (guide only) |

### Help, review, device setup

| Intent | Ways of asking | Needs | May | Tools | Approval | Screen | Says | Failure / Undo | Surfaces | Tests | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| "What can I do here?" | "what is this page", "how do I…" | page guide (`src/lib/explain/pageGuides.ts`: year, season, month, week, today, inbox, routines, meals) | point and explain, one part at a time | `symphony_show_on_page`, `symphony_point` | — | outlines + notes | one part per step | — | typed, voice | showOnPage.test, pointing.test, explain.test | IT (contract) for all eight pages / IU (generated help on a real screen) |
| Go to a page | "show me the week" | connected workspace | navigate | `symphony_show_workspace` | — | page changes | — | — | typed, voice | context.test (workspaceDestination) | IT |
| Wall: ask about the day / add to a list / note on the scratchpad | spoken at the wall | a paired display (identity-derived wall; migration 20261015100000) or an adult login with `surface:'wall'` | family reads; scratchpad; family list items; task-op cards | wallMode allowlists, `fenceDb` | card: spoken "approve" | wall card; 30 s Undo | — | 20 s timeout → `wall-ask` fallback (agent may still finish server-side: **gap**) | wall | wallMode.test, wallTalk.test, useTellSymphony.test | IU |
| Private assistant (work / personal) | — | separate identity (B01) | — | — | — | — | — | — | — | — | **P** (not in the first beta) |

## Cross-cutting behaviors

| Behavior | Where | Evidence | Status |
|---|---|---|---|
| One verdict per turn (`outcome`) | agent done/error event → client → voice | outcome.test, agentTurn.test, useWorkspaceVoice.test | IT (contract); IU (does the live voice obey it) |
| Proposed never spoken as saved | voice instructions + `outcome.say`; wall speaks words after the last tool | handler.test, wallAgent.test | IU (needs recorded-audio runs) |
| Retry after a dropped connection does not duplicate | stable row ids for task, routine, plan item, contact, note, list, list item; stable calendar requestId | canvasEvents.test (stableRowId); **P** integration case against a real database | IT (unit) / P (integration) |
| Approve refuses a set whose rows moved | `seen` vs cached `updatedAt` (client) | applyChangeSet.test | IT; **gap**: compares against the browser cache, not a fresh read |
| Partial failure reported as partial | applyChangeSet reports `reverted`/`kept`; the bar and the wall say "some of it stayed saved" when a rollback could not reverse a write; direct writes report `partial` | applyChangeSet.test (unreverted rollback), CanvasActivityContext.test | IT |
| Undo does not overwrite another person's later edit | applyChangeSet's Undo reads the rows as they are then and skips one stamped clearly after Approve; the bar says it could not undo all of it | applyChangeSet.test (edited since) | IT |
| "This Friday" while viewing an old week | `viewing: past` in context; prompt asks | context.test, voice instructions | IU |
| An item the screen left out is looked up, not denied | prompt rule on `truncated` and items not in the snapshot | — | IU |
| Imported mail/notes are data, not instructions | prompt marks screen context and card notes untrusted | changeSet.test (changeCardNote) | IU; **P** injection scenario (benchmark #13) |
| Household vocabulary (names, schools, places) | roster in the agent prompt; the voice transcriber is prompted with the family's names and routine names (bounded, never task text) | workspace-voice handler.test | IT (contract) / IU (does it help recognition: needs recorded audio) |
| Durable session state across reload | chat text in `chat_sessions`; a waiting change card is kept per person in the tab's session storage and restored (approve/dismiss clears it); Undo, receipts and voice state are still in memory only | CanvasActivityContext.test (reload) | IT (card) / **P** (Undo, receipt, objective and unresolved questions) |
| Authorization not inferred from the screen | every tool through RLS client; wall fence; a display's identity decides the wall server-side | wallMode.test (callerSurface), `scripts/test-household-displays.mjs` (8 SQL checks); integration privacy test (not run on this candidate) | IT (unit, local SQL) / P (real accounts, hosted migration) |
| Spending limits | every paid route reserves (interactive through the caller, background through the service role); spend ledger in cents with per-model prices and daily/monthly cent ceilings; refusals shown in the person's words; 27 orphaned functions still deployed (deletion script prepared) | aiUsage tests, aiUsageRoutes tests; `scripts/test-ai-usage-guard.mjs` (15 checks) | IT (local) / P (hosted: migrations, prices and ceilings unapplied; orphans not deleted) |

## Known gaps found while building (not yet in a row above)

- **A display has no Google tokens.** The wall page loads calendar events through `google-calendar-events`, which uses the signed-in user's tokens; under a display session the wall's calendar would be empty. The agent's wall reads are fine (they read the cached `calendar_events` through the fence with the household's family calendars). Needed: a display path in `useDayLoadEvents` that reads cached household events, and a server-side refresh of the household's family calendars that does not depend on who is looking. Until then a display is certified for routines, meals, lists and the scratchpad, not the calendar.
- **Wall timeout and spoken approve:** fixed in the sixth batch (the stream is aborted; a spoken approve means the card last read out).

## Benchmark journey J1 (the plan's first deliverable)

"I need to call the plumber, pick up the Amazon order, clean the yard, and fit in an all-day test drive this week." Typed and spoken, desktop and wall, with a conflicting Thursday commitment, a correction, a pending proposal, approval, a dropped connection and Undo. Expected record and screen state after every step is `scripts/conversation-bench/scenarios/j1-plumber-week.json`; the contract layer (`contract.test.ts`) replays it and passes. The live-model layer (`live.mjs`) exists but has not been run: it needs a synthetic account and the deployed agent with the `outcome` event. Until it has been run on synthetic data, no row above moves from IU to IT for real-model behavior.

## Changes in this version

- Removed from the assistant: `symphony_delete_task`, `symphony_delete_routine`, `symphony_list_projects`, `symphony_create_project`, `symphony_update_project`, `symphony_attach_source`. Deleting is unsupported by design; Projects are not a product concept.
- Added: the `outcome` verdict on every turn; today's date in household time; stable ids for contact, note, list, list-item and calendar creations; receipts for meal, contact, list and draft writes.
