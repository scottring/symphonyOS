# Paper-style horizons (2026-11-04)

Scott, 2026-11-04, after walking Year → Season → Month → Week → Today against
Best Laid Plans (findings: vault `projects/symphony-os/briefs/2026-11-04-horizon-walkthrough.md`).

An addendum to [guided planning sessions](2026-11-01-guided-planning-sessions-design.md).
It supersedes, where they conflict: that spec's non-goal "no change to nested
commitments", its "under a line" placements, the [horizon strip](../../planning/2026-10-25-horizon-strip.md)'s
drag and arrow buttons, the [2026-09-26 nested horizons](../../planning/2026-09-26-nested-horizons.md)
"bring the same row down" rule for levels above the week, and the
[2026-10-19 plan from the level above](2026-10-19-plan-from-the-level-above-design.md)
row verbs.

## Intent

Scott's words: "we have lists that are supposed to be self-contained/for
reference only that have triage/pulldown/copydown/etc. buttons which directly
go against that philosophy … stay true to the blp philosophy and have the
previous horizon 'fold over' or next to the current horizon just for easy
reference."

Work it like paper. Year, Season and Month are separate sheets. Each holds
only what was written for it, in its own words. While writing one, you read
the sheet above it. You never move, copy or link an item from that sheet
into this one. Translating "Plan winter vacation" (Fall) into "Pick dates
with Iris and book trains" (November) is the planning; the app must not do
it for you or offer a shortcut around it.

## Decisions Scott made

1. **Reference only.** The level above sits beside the page (the strip's
   first tab, folded or open) and in the session's "Read …" steps, read-only.
2. **No buttons on lists above the week** that move, copy, triage or bring
   items down: no hover verbs on Year, Season or Month rows, and no → Fall,
   → Nov, → Week or drag from the strip.
3. **Drop ties, for now** ("i'll see if it confuses me less or more"). Nothing
   shows or sets what an item is *for*: no "For …" line, no For picker, no
   "1 on November" or "Nothing on November", no "This week · 3" or "Fall" tags,
   no grouping by parent on Today or Week, no "Step toward / From" line. To be
   revisited after a few weeks of use.
4. **Paper-style.** An item above the week belongs to one period. Nothing is
   committed to a second period above the week, or from one of them down to a
   week. Week ↔ Day stays shared: giving a week task a day is the same task.
5. **Review moves only in Look back.** Done, carry, and let go happen in a
   session's Look back step (already in the 11-01 spec), not on the page.

## What changes

### Pages: Year, Season, Month

- Rows have no quick verbs on hover. Opening a row opens its panel or task
  detail as now, and the panel keeps Done, Let go and Edit wording, one click
  away for fixing a mistake outside a session. The panel loses Move under,
  For, and any "bring to <period below>" verb.
- No "For …" line, no tag for what is below, and no "+ Piece" on Month.
- The list shows whole: no "+N more" fold above the week. The fold of
  done items ("11 done · … Show") stays.
- The add box writes a plain item on this period. There is no For picker.
- The strip's first tab (the level above) is a read-only list: titles only,
  no arrow button, no "N on …" meta, not draggable. Its "+ Add a <year> goal"
  stays, since it writes on the level above without moving anything. Year's
  strip shows last year's open goals the same way; carrying one into the year
  happens in the Year session's Look back (Carry), not from the strip.

### Pages: Week and Today

- The Week strip's month tab is read-only: titles only, no → Week, no drag
  onto a day, no "On this week".
- Week's own list ("No day yet") keeps When ▾ and drag onto a day.
  Today's week column keeps + and drag onto today.
- Week and Today show **the same week items, flat**, in the same order, with
  no grouping by parent and no serves line. Finding #15 (Today's week column
  held November's own lines that Week's list did not) must be explained and
  closed, so both read one selector.
- One week label everywhere: the dates ("Oct 31 – Nov 6"). Today drops
  "Week 45".

### Header line

`PeriodSummaryLine` reads in plain words: "Planned Mon, Nov 2". The parts
after it are links only when there is a note to open: "Last week's review",
"Energy: medium". "looked back" goes away. (Scott: "who … COULD understand
'looked back'".)

### Sessions (11-01 spec, step by step)

- **Season 2, Choose from the year:** reads the year goals (read-only, with
  Someday). It writes nothing from them. Picking a year goal no longer
  creates a season item with its words. Someday items can still be brought
  into the season: Someday is a holding list, not a horizon.
- **Season 5, Month 5 (by area):** the level above is beside you to read; you
  write this period's items by area. No "under a line".
- **Week 3, Read November:** read-only. **Week 5, Choose this week's tasks:**
  writes new week tasks and gives existing week tasks a day. It never commits
  a month line to the week.
- **Look back (Season, Month):** per open item: Done, Carry (to the next
  period of the same level), Let go. "Back to the season" goes away; an
  unfinished November item does not become a Fall item.
- **The guide (symphony-agent):** change cards place each item by level,
  period, life area, and day or time. They never set a parent, and the
  per-step allowed writes no longer include committing an item from one level
  to another. "Questions, not guesses" drops "no clear parent goal".

### Data

- No migration. `source_id`, `goal_task_id` and `is_goal` stay as columns and
  stop being written by the planning pages and the guide. Year goals stay in
  `goals`; Season, Month, Week and Day items stay in `tasks` with
  `task_commitments`.
- An item gets one open commitment above the week. Carry ends this period's
  commitment and opens the next period's at the same level. A week task
  given a day keeps its week commitment, as now.
- **Existing items with several open commitments are left alone.** For
  example, "Plan winter vacation" is open on Fall, November and this week,
  and it keeps showing on each of those lists until it is done or let go.
  Nothing new is put on a second list.
- Turning ties back on later is a UI change: the columns are still there.

## Goals

- Every list above the week reads as a sheet of paper in its own words, with
  the sheet above beside it and nothing to press that moves anything.
- Week and Today agree on what the week holds.
- No line on any page needs explaining.

## Non-goals

- No change to Week ↔ Day sharing, routines, the Inbox, or Someday.
- No cleanup of existing multi-period items.
- No new tables or columns.

## Anti-goals

- Any button, drag, or guide action that puts an item from one list above the
  week onto another.
- The guide writing a lower-level item in the upper item's words "to help".
  The 11-01 never-supply rule already forbids this. Restated, because a
  one-tap "use the same words" shortcut is the failure mode.
- Hiding the level above so it can't be read while writing.

## Settled after the builder check

- **Nothing moves up either.** "Back to <month>" for last week's leftovers,
  "Later → This month / Next month" on week tasks, and the 11-01 closing
  write that sends week leftovers back to the month all go away. A week
  leftover is Done, Next week, Someday, or Let go. The Week Look back, the
  Choose step and the Done planning closing writes are reworked to match.
- **Scope of "drop ties":** the planning pages (Year, Season, Month, Week,
  Today, and the strip), the guided sessions, and the guide's writes during a
  session. Outside that, the task detail panel's Goal row ("Part of…", "Make
  it a goal"), Choices, the capture review sheet, the paper-plan import, and
  the guide outside a session stay as they are for now. `is_goal` keeps its
  meaning there. On the planning pages, nothing filters or groups by
  `is_goal`: the week list builder (`weekShelf.ts`) stops skipping `is_goal`
  tasks if that is the cause of #15.
- **Carry and Let go act on this period's commitment only**, never the whole
  item. On "Plan winter vacation" (open on Fall, November and this week),
  November's Let go ends only its November commitment. Season and Year Look
  back keep **Table** (to Someday) beside Done, Carry and Let go. Table also
  ends only this period's commitment; the item goes to Someday only if no
  other open commitment holds it.

## Left to the builder

- Where Done, Let go and Edit wording sit in the row panel.
- Removing code versus leaving it unreachable. Prefer removing dead verbs and
  props rather than keeping them hidden behind flags.
- How existing tests that assert ties and arrow buttons are rewritten.
- The cause of finding #15 and the shared selector for Week and Today.
- Whether November's "24 of 36 done" (finding #7) is right. Fix it if it counts
  another month's completions.

## Calls made by Claude (not Scott), marked for review

- Done, Let go and Edit wording stay in the row panel (fixing mistakes outside
  a session).
- "+ Piece" leaves Month (a piece is a tie).
- "Back to the season" leaves Month's Look back.
- Week label uses dates, not week numbers.
- Header wording: "Planned Mon, Nov 2 · Last week's review · Energy: medium".
- The done-items fold stays.
- The three builder-check answers above (nothing moves up; scope of drop
  ties; Carry, Let go and Table act per period).
