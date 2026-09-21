# Core journeys and onboarding: design

Written 2026-09-21 with Scott, design-first. It records the decisions made in
that sitting and the corrections sent afterwards. Where the two differ, the
corrections win. Evidence for every "Fixes" item is the walkthrough brief
`~/Documents/scotts-world/projects/symphony-os/briefs/2026-09-21-walkthrough.md`
(IDs such as #8, A25 and B22 refer to it). The onboarding draft it feeds is
`docs/onboarding.md` on branch `claude/walkthrough-2026-09-21`.

Nothing here is built unless it says so.

## Ground rules

- **Onboarding explains working behaviour.** It must not paper over items that
  disappear or controls that contradict each other. Each onboarding step ships
  only after its journey's fixes are in.
- **No new setup wizard.** First-run setup stays as it is. Calendar connection
  and visibility are introduced inside the first day.
- **Urgent work enters Today directly.** No journey forces the planning ladder.
- **Settled decisions are not reopened** by later sections or batches.

## Decisions (settled)

| # | Topic | Decision |
|---|---|---|
| S1 | Journeys | Setup → Capture → Sort → Plan → Do today → Review → Share, in that order. Routines, meals, lists and notes are stops inside Do today and Share. |
| S2 | Setup | The first-run screen is clear enough. Keep it. The only fix is the prefilled name (#2). |
| S3 | Life area | **REOPENED by Scott 2026-09-21 (walkthrough run 2, R2.8): "we shouldn't have removed the which domain gate."** The gate stays. When and where it asks is to be settled before Capture + Sort is built. (Was: optional at capture, never gated.) |
| S4 | "Today" command | "Today" = **schedule for today + choose it for my focus**. It supersedes the earlier separate-verb recommendation. Every other date choice (Tomorrow, Pick a date…, ordinary rescheduling) changes the date only. It never silently adds or removes focus (see S13). |
| S5 | When menu | One menu for the daily loop: **Today · Tomorrow · This week · Pick a date… · Someday.** It is used by Inbox rows, Today's reschedule, the task panel, Choose tasks and every toast. Rows read as places ("Tue, Sep 22", "This week", "September", "Someday"). "Planned" and "Scheduled" leave the UI. |
| S6 | Broader planning | The short menu does not replace period commitments. Plan pages keep their own verbs for month and season ("Take into September", "Take into Fall"). |
| S7 | Send to calendar | Keep the task and link it to the event. The task is dated to the event's time, keeps its notes, links and contacts, and shows on Today once. |
| S8 | Navigation | **Today · Plan · Inbox · More.** The ladder sits inside Plan, and the panel is named "Choose tasks". This is **PR #46** (`codex/nav-simplification`, open, not merged). Do not reimplement it. |
| S9 | Year → season | Reference only. The year goal shows on the season rail without verbs, and the rail says so. You write season goals yourself while looking at the year. Nothing converts or copies a goal into a season goal or a task. |
| S10 | Routines with no set day ("Any day") | One occurrence per recurrence window. A weekly routine gets one per week, never one per day. Choosing Today or a date places that occurrence without changing the repeating rule. Completing it settles the window, and it becomes available again next window. Untimed occurrences appear in Tasks, never as midnight appointments. Beside a future week, the picker targets that week. |
| S11 | Capture submission | Enter accepts the **visible** parsed destination. While parsing is pending, submission waits. The confirmation names the actual destination; Inbox pulses only when the item went there. A failed save keeps the draft. |
| S12 | Today's Tasks | Tasks contains untimed tasks dated today, plus personally chosen work. Focus orders and highlights; it does not decide whether dated work is visible. |
| S13 | Rescheduling and focus | Ordinary rescheduling keeps personal focus and shows the new date clearly on the row. (Settles the former O1.) |
| S14 | Assignment vs audience | Assignment says who should act. Audience says who may see it. Assigning never shares an item, and never on its own puts it on someone's Today or on the wall; that still needs the right visibility and a date. |
| S15 | Plan page shapes | Week, Month, Season and Year share navigation and behaviour, not one layout. Week stays dated days plus the optional Choose tasks panel. |

## The journeys

Each journey has: the target, the fixes that close the gap to it, and its
onboarding step.

### 1. Set up

**Target.** Sign in, name the household and its people, and set home for
weather. Land on Today.

**Fixes.** #2: leave "Your name" empty unless the profile holds a real name.

**Onboarding step.** Unchanged from the draft (Step 0).

### 2. Capture

**Target.** From ⌘K, the phone sheet, a photo or email, an item lands in Inbox,
or on a day when a date word is parsed. Before Enter, the box shows the parsed
destination and the audience. **Submission rule (S11):** Enter accepts the
destination that is visible at that moment. If parsing is still pending, Enter
waits for it before submitting. Afterwards the confirmation names the actual
destination and is a door to it ("Added to Inbox · Open" / "Added to Tue,
Sep 22 · Open"). The Inbox badge pulses only when the item actually went to
Inbox. If the save fails, the dialog stays open with the draft intact.
Life-area chips are offered and never required (S3).

**Fixes.**
- A2, #8: the toast draws above the dialog, the dialog closes on a successful save, the badge pulses only for Inbox, and the toast opens the real destination.
- A4: the parsed date is visible as a chip before Enter (S11), so a stripped date word is never a surprise.
- The draft is kept on a save failure.
- C-P7: the destination and audience line on the phone capture sheet.

**Onboarding step.** Press ⌘K, type one real thing, and watch it arrive in Inbox.

### 3. Sort

**Target.** Each Inbox row has the When menu (S5) plus Done and Delete. Every
verdict, Delete included, has Undo. After a verdict the row lingers for a beat
with where it went and a door ("Now on Tue, Sep 22 · Open"). The empty Inbox
names where its last items went. Unsorted rows can be given any verdict (S3).
"Send to calendar" keeps and links (S7).

**Fixes.**
- A5, A18, B14, B17: collapse the three row "when" controls and the other vocabularies into the one menu.
- A7, #9: verdict toasts name the date and open it.
- A6: remove the Unsorted gate from every verdict (S3).
- A10: Undo on Delete.
- A9: keep-and-link for Send to calendar. The current code deletes the task after creating the event. Whether a failed Google write also loses the task is **untested**; test that path while making the change.
- A8, A11: the counts match the rows, and there is one empty state.

**Onboarding step.** Sort the thing you captured, then follow the toast to where it went.

### 4. Plan

**Superseded 2026-09-21 by `2026-09-21-guided-planning-design.md`** (guided Year → Season → Month → Week → Day). The text below is kept for history.

**Target.** Plan (PR #46) opens the last-used period, Week by default. Week,
Month, Season and Year share navigation and behaviour, not one layout (S15).
Week stays the dated days plus the optional Choose tasks panel; Month, Season
and Year show that period's commitments with the level above as reference. Moving down keeps the same item (the D1
model, shipped). Goals are ticked, never placed. A task you write may name the
goal it serves; nothing converts a goal (S9). Beside the week, Choose tasks
lists the week's undated work. When the week is empty it offers the concrete
actions **Add task** and **Choose tasks**, not a separate planning flow.

**Fixes.**
- Everything in brief batch 4 not already done by #46: B13 (the panel beside the week speaks the week's language), B18 (menu items know their page), C19 (Help names Plan, the ladder, Routines and ⌘K).
- B2, B6: the goal page stops treating a goal like a task, and the season rail says year goals are reference (S9).
- B4: "Review 2025" works.
- B7: the verbs on season and month rows are visible and labelled.
- B8: a task written on a period page shows its audience.
- B12, C20: no empty-state sentence before the data arrives.
- C6: an empty week says its job and shows a per-day Add.

**Onboarding step (optional).** Open Plan, name one thing that matters this
season, write one task toward it, and put that task in this week.

### 5. Do today

**Target.** Today has Tasks and Schedule (events and timed items). Tasks
contains untimed tasks dated today, plus personally chosen work. Focus orders
and highlights; it does not decide whether dated work is visible (S12). A
rescheduled row keeps its focus and shows its new date (S13). A row's title opens its panel, and verbs are visible at rest. The
panel opens with a when/where line ("Tue, Sep 22 · This week · Fall: Get fit"),
then the context needed to do the work: contact, place, notes and files. Notes
save reliably and say "Saved". There are no counts on Today. "Any day" routine
occurrences follow S10. The empty day makes one offer, not three.

**Fixes.**
- A25 (data safety, first): reproduce the lost note text, identify the cause, fix it, and prove the latest text survives saving, closing and reopening. "Saved" shows only after the write succeeds. No mechanism is presumed.
- B15 is settled by S13: rescheduling keeps focus. Separately, investigate whether dragging a task onto a day creates focus when it should not.
- B16, A24: the when/where line in the panel.
- A17: row verbs visible at rest, one selection affordance.
- A21, B24, C-P2: counts removed from Today and its folds.
- #4, #5, #6: one offer on an empty day, and the panel copy names the same period as its heading.
- A20: "Review today" works.
- B21, B22, B23, A16 (routines, per S10): the editor refuses Done without days unless the routine is Any day. The week picker gives an occurrence a day. Untimed occurrences go in Tasks. One name: "Any day".
- B20: a routine is created on save, not on click.
- C-P1: Sign out leaves the phone Today header and moves to Settings, with a confirm.

**Onboarding step.** The first day. If no calendar is connected, Today's empty
Schedule offers "Connect a calendar" (the existing Settings flow). It explains
"Only you / Shared with household" once, at the first Unsorted item. Then: open
a task, add what you'll need (a number, a link, a note), and tick it.

### 6. Review and carry forward. **Model settled; interaction details open**

**Target.** The existing carry-forward contract: at the end of a week, month or
season, each open commitment gets Done, Keep (same item, next period, the old
one marked "Carried to…"), Someday or Drop. Nothing slides silently. What is
left is interaction detail (where the review opens, row verbs, what the empty
review says), not another model sitting. "Include unfinished
from earlier" in Choose tasks stays the daily route to older work.

**Onboarding step (proposal).** Shown at the first period end, not on day one.

### 7. Share with the household. **Corrected; not yet implementation scope**

**Target (proposal).** Assignment says who should act; audience says who may
see it (S14). Assigning never shares an item, and never on its own puts it on
someone's Today or the wall; that needs Family visibility and a date. Handoffs,
To Discuss and Waiting On live in Between Us. "Assigned to" and "People
involved" are named apart (A26).

**Onboarding step (proposal).** Make one item Family, give it a day, assign it
to your partner, and see it on their Today and on the wall.

## Open items

- **Journey 6:** interaction details only.
- **Journey 7:** confirm the corrected target before it becomes implementation scope.

## Build order

1. **Data safety.** A25 (reproduce first), A10, C-P1, B20, and the day-drag focus investigation.
2. **Merge PR #46** (Scott's approval). The rest assumes its navigation.
3. **Capture + Sort.** S3, S5, S4, S7 and the fixes in journeys 2 and 3.
4. **Do today.** The panel's when/where line, the row contract, counts removed, empty day, routines (S10).
5. **Plan.** The fixes in journey 4.
6. **Onboarding.** `docs/onboarding.md` rewritten to these seven journeys and
   then built as in-app first-day prompts, step by step as each journey lands.
   Walk it with `/walkthrough` on the wiped demo account to verify.

## Testing

- Regression tests for each data-safety fix (notes flush, Undo on delete, routine created on save).
- A unit test that S4 "Today" writes both the date and the focus row, that other date choices write the date only, and that rescheduling keeps focus (S13).
- S12: an untimed task dated today appears in Tasks with no focus row.
- S11: Enter while parsing waits; the toast names the real destination; a failed save keeps the draft.
- A25: a test that reproduces the loss before the fix and passes after it.
- S10: at most one open occurrence per window, completing one settles the window, and untimed occurrences are never timed.
- S7: the task is kept on both success and a simulated Google failure.
- UI changes are checked at desktop width and 390px, and on a real signed-in account.
