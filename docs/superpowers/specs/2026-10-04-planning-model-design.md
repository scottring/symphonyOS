# The planning model, and a Week page that shows it — 2026-10-04

Scott approved the model on 2026-10-04 ("yes, write the spec and build it, but
we need a crystal clear, intuitive, easy to understand interface as the
central piece"). Mockup: https://claude.ai/artifact/Tp1kyQmrbJMG2fvN7A3dfn.

## Why

Since July the way horizons connect flipped five times: look-don't-link
(07-08), paper only (08-17), goal-first cascade (09-26), source-first pull
(10-03), and back to look-don't-link (10-04, Best Laid Plans). Each build
fixed screens on whichever model was current. This spec is the model; every
planning page and step is checked against it.

## The rule

**Lists above the week are for looking. The week and the day are for doing.**

| Horizon | What it is | Beside it while writing | What moves down |
| --- | --- | --- | --- |
| Year | reference list | — | nothing; hidden unless opened |
| Season (Fall) | brainstorm list: everything we want in Fall | the year, behind a link | nothing |
| Month (October) | plain list | the season, shown, hideable | rarely: one line into a week |
| Week | the week's list, its days, routines, calendar | the month, behind a link | — |
| Day (Today) | the work and what you need to do it | the week | — |

- No goals vs tasks above the week: no diamonds, "Part of", "+ Step",
  "+ This week", "+ Week N's part", "Make it a goal", goal links.
- Upper lists stay whole for their own review: done lines stay, struck; a
  line that came into a week says "On this week". Lines are ticked by hand.
- Urgent work goes straight to Today; nothing climbs the ladder.
- Data stays (is_goal, goal_task_id, source_id, support links); the UI stops
  showing or writing them. No migration.

## The Week page (at rest)

- Masthead: week number and dates, the plan's status, one button: **Plan
  the week** (Plan again, quiet, once planned). No List / With / One-at-a-time
  toggles. The Journal/Schedule switch stays (hours are a different tool).
- Left: **This week** — "What we mean to get done. Give it a day only if it
  needs one." The work waiting for a day; a day's work is in its day.
- Under it: **October list · for reference** opens the month's list at the
  far left (remembered per device; Hide in its heading). Plain rows; "Add to
  this week" appears on hover only.
- Right: the days. Above them the **rhythm**: routines that happen every day,
  then every weekday, written once ("Every day · 6p Feed Jax · 6p Walk Jax ·
  7p Kids Bedtime routine · Eat breakfast …"). Each day holds only what is
  particular to it — events (a dash, no check), tasks and routines (a check),
  no ↻, no "Routines · N" fold — and ends with its free time ("Free 7:30a–6p ·
  7:30–9p", an hour or more between 7a and 9p).
- The weekend band and "Sometime this weekend" are unchanged.

## Planning the week (the session)

Eight steps, one kind of thing each: Last week · Inbox · Between us · Can't
move · Look ahead · Routines · **Write the week** · The week.

- *Write the week* replaces "Already on" and "New tasks": the week's list,
  with the month beside it for reference — "nothing on it has to come down."
- One primary at a time: **Next** on every step; **Mark week N planned** only
  on the last.
- The look-back card shows notes as text, never HTML, and no "Part of".

## Month, Season, Year

- Month: season · October's list · dates. The season column is shown by
  default, hideable, plain; no "+ This month" / "+ Step". A month line's ⋯
  menu keeps "Into this week" (the one way down) and "Do it today".
- Season: the list alone ("Fall: everything we want in it", brainstorm
  columns); "2026 list · for reference" opens the year beside it. No
  "Into October".
- Year: "2026's list", a plain list. No one-at-a-time view.
- After a save the next step reads "Write October's list" / "Plan week 41".

## Not changed

Data model, Today, drag rules on the days, routines' own pages, the weekend
band, the guide. The month calendar's drag of a line onto a day/week stays.

## Verification

Unit tests for `weekRhythm`, the free-time gap, the grid (rhythm once, no
fold, free time), WeekV2 (rest layout, reference toggle, steps, one primary),
Month/Season/Year copy. Visual check on a component harness with the demo
account's routines at desktop and 390px (the local build had no session).
