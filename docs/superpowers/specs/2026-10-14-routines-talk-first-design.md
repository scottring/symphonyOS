# Symphony v2, stage 3: Routines by talking

2026-10-14. Approved mockup: https://claude.ai/artifact/KbMEphJgeyzovP6U7WyMny
(six frames). Builds on `2026-10-14-symphony-v2-talk-first-design.md`
(stage 1, the change card; stage 2, Week).

## What we are doing and why

Routines are changed by saying it, temporarily or for good, from any page.
There is no routine settings page. The Routines page becomes a picture of the
household rhythm, and the change card learns routine changes plus three task
changes the live rehearsal asked for: done, merge and talk about.

## The change card, new operations

One card can mix tasks and routines. Rows are grouped under a scope heading
when the card holds more than tasks: **Tasks**, **Routines · this week only**,
**Routines · from now on**.

| Op | Fields | Card wording | Writes through |
|---|---|---|---|
| `done` | `task_id` | DONE · Return the library book → Done | `completeTask` (everything a tick does) |
| `merge` | `task_id` (keep), `from_task_id` | MERGE · Call Molly + Call Molly about the Buick → one, notes kept | `updateTask` on both: the kept task gains the other's notes and links; the other closes as done with "Merged into …" in its notes. Nothing is deleted. |
| `talk` | `task_id`, `note?` | TALK · Summer camp → Talk about, with Iris | `updateTask`: `needsDiscussion`, `discussionNote`, and off its day |
| `routine_skip` | `routine_id`, `date` | SKIP · Kids bedtime routine · Fri 16 only | `skip` on that day's occurrence |
| `routine_move` | `routine_id`, `date`, `to_date`, `time?` | MOVE · Kaleb haircut → Fri 16 · Thu 15 only | `reschedule` |
| `routine_who` | `routine_id`, `date`, `assignee` | WHO · FFG pickup → Iris · Thu 15 only | new `setOccurrenceAssignee` (`assigned_to_override`) |
| `routine_change` | `routine_id`, any of `name`, `time` (or `null` for any time), `days`, `assignees` | TIME / DAYS / WHO / NAME (or CHANGE when several) · Monday run → Tuesday run, Tue 8:30 | `updateRoutine` |
| `routine_rest` | `routine_id`, `until?` | REST · Iris long run → until Nov 1 | the board's existing rest command |
| `routine_add` | `name`, `days?`, `time?`, `assignees?`, `context` | NEW · Reading time → Sun–Thu 7:00 | `addRoutine` |

Rules:

- Still no delete. "Stop a routine" is rest (with or without a date).
- One op per task, one per routine for lasting changes, one per routine and
  date for this-week changes.
- This-week ops change one day's occurrence; the routine is untouched, so next
  week shows as usual. Lasting ops change the routine from today on; days
  already past keep their history.
- Approve stays all-or-nothing with one Undo, through the app's writers.
  Tasks and lasting routine ops are refused if the row changed since Symphony
  read it (`updated_at`).

## Symphony's side

- `symphony_propose_changes` validates the new ops (routine visible to the
  person, real dates, `sun`…`sat` day keys, HH:MM times, household members)
  and resolves names server-side, as for tasks.
- `symphony_read_week` returns each routine's id, days, time, people, and
  this week's exceptions (skipped, moved, someone else).
- The prompt rule replaces "Routines have no preview yet": a routine change
  ends in the card. A named day or "this week" is this-week; "from now on",
  "every week" or "anymore" is lasting; otherwise ask once: "Just this week, or
  from now on?" Several changes, or any lasting change, always go on the card.
  The direct routine write tools stay for one clear single-routine edit the
  person has confirmed, as today.

## The Routines page (frame "After 1")

- **Header:** "Our rhythm · week of Oct 10" with week arrows, the title, and one
  rule-based sentence (first school-day start to bedtime, the fullest day, this
  week's exceptions).
- **Every day** line, then a **Sat–Fri grid** with Morning, Afternoon, Evening and
  Any time bands, then **Each month** and a **No day yet** line. Resting or off
  routines sit in one quiet "Not showing" line so they stay reachable.
  *(Any time and Not showing are additions to the mockup: untimed and resting
  routines need a home that does not pretend they have a time.)*
- Occurrences come from the same builder Week uses (`buildWeekRoutineItems`), so
  skips, moves and the new per-day person show in place with a "this week"
  mark. Next week is untouched.
- **Tap** opens the routine panel. **Drag** one occurrence to another day moves
  that occurrence only, with Undo.
- **Dashed preview** of a pending card: new slots dashed teal, slots leaving
  dashed grey.
- The bar chip reads **Change our routines**.
- **Removed:** the Arrange switch, Needs a look and the tend drawer, Build with
  Symphony, the routine card ⋯ menu, and type-anywhere search. A small
  **New routine** link stays for people who never talk to it.
- **Phones:** a day picker and that day's list, as on Week.

## The routine panel (frame "Phone")

A "**Thu Oct 15 only**" section when the panel is opened from a day: **I'll do
it**, **Skip it**, **Another day**. The every-week fields stay as they are.

## Week

Week previews the new ops: done rows struck through, the merged pair as one,
talk-about rows leaving their day, and routine skips, moves and per-day people
on their days. Routine rows show the per-day person.

## Testing

- Server: validation and resolution for each new op; read_week's routine
  shape; the prompt rule.
- Client: card wording and grouping; apply and Undo round-trip per op; refusal
  when a task or routine moved; all-or-nothing when one write fails.
- Page: the picture places routines by band and day, shows exceptions, the
  dashed preview, and the removed controls are gone. Panel buttons call the
  occurrence writers.
- A browser pass on Scott's real routines before shipping, desktop and phone.

## Not in this stage

- The wall does not read the per-day person yet (`src/components/wall-v2/**`
  belongs to the wall session).
- Steps are still edited in the panel; no step ops on the card.
- Splitting one routine into two (bedtime 7:45 on school nights only) is not an
  op; Symphony says so and offers the nearest change.
