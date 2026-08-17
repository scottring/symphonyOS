# Symphony, streamlined (2026-08)

Decided with Scott on 2026-08-17, after the analog-planning pivot (de-nav
`dce28fdc`, plan-from-paper `aac30dd3`). This supersedes the horizon-ladder
product shape. `VISION.md` still describes the philosophy; this describes the
app we are actually converging on.

**One sentence:** capture from anywhere, plan on paper, provision the week,
execute today, coordinate between Scott and Iris — with the assistants and the
kitchen wall as ambient interfaces.

## The loop

capture (QuickCapture / photo / Michael / assistant) → **Inbox** → Sunday paper
plan → plan-from-paper photo → **This Week** → provision (attach the context
execution needs) → **Today** → done or carried over, honestly → anything
two-person routes through **Between Us**.

## Planning cycles, wizard-free (added 2026-08-17, same day)

The horizon CADENCE survives the pivot; only the wizard UI died. Paper decides
at every altitude — year, season, month, week, day — and Symphony stores the
decisions in the buckets/goals that never went away. The design rule that makes
this work: **entered results must come back by delivery, not navigation.**

- **Cadence lives in routines.** "Weekly planning — Sunday 7pm" (+ monthly,
  seasonal, annual at their rhythms) as ordinary routines on Today and the
  wall. No new UI.
- **The review packet replaces the wizard.** Before each session, one
  button (or auto-prepared) assembles the material: carried-over with ages,
  the pool being planned, waiting-ons, next period's calendar, inbox count —
  **and always the rung above**: the weekly packet shows month commitments,
  the monthly packet shows season picks, the seasonal packet shows year goals.
  That's the cascade, running through attention at planning time instead of
  linked UI. On screen or printed (paper packet next to the paper plan).
- **Plan-from-paper learns altitudes.** First question on snap: which page is
  this — day/week/month/season/year? Parser + review sheet then offer that
  altitude's placements (month bucket, quarter picks, year goals). Today it
  knows only date/week/inbox.
- **Optional: a read-only Horizons reference page in the Library** (year goals,
  season picks, month commitments in one quiet scroll) — add ONLY if the
  packets alone make the data feel invisible. Not a ladder, not navigation.

The complete cycle: routine fires → packet (carrying the rung above) → paper →
snap at its altitude → review sheet → placed. Zero wizard screens.

## Four surfaces — that's the whole app

1. **Inbox** — where capture lands. Exists.
2. **Today** — execution only: the day's commitments, each carrying its context
   so acting is one tap. Exists; refinement pass comes LAST, after Week teaches
   us what Today should absorb.
3. **This Week** — the provisioning bench (NOT a planning rung; paper owns
   thinking). Un-park `WeekViewV2`: Mon–Sun columns, all-day lane, drag between
   days, click a card → the detail panel (already a file drop-zone with links,
   phone, notes). New: a **ready/bare indicator** per task — has context vs.
   naked title — so Sunday-you sees which items will be effortless for
   Thursday-you. The **shared week glance** is this grid with the assignee
   filter on Everyone, plus collision highlighting (both booked Thursday
   evening).
4. **Between Us** — the Us app grows up. Three lists, echoed on the wall:
   - **Handoffs** — assign to the other person + a seen/accepted signal,
     realtime.
   - **To Discuss** — the `needs_discussion` flag finally gets a surface.
     Items collect all week; sit-down mode turns them into an agenda; checked
     decisions convert to tasks.
   - **Waiting On** — the existing waiting-for feature surfaced in both
     directions, so nothing needs re-asking.

Library (collapsed, reference): Projects, Meals, Contacts, Documents, Lists,
House, History, Routines, Jobs. These stay because the household or the loop
touches them — nothing else gets added. The streamlined version wins by what
it refuses.

## Stays dead

Horizon ladder, guided wizards, goal cascades, month boards, coaching,
planning nudges. Paper owns thinking; Symphony owns holding, surfacing, and
sharing.

## Build order

1. **This Week bench** — un-park WeekViewV2 behind a `/week` route + sidebar
   entry, panel provisioning polish, ready/bare indicator. Mostly proven code.
2. **Planning cadence** — completes the core loop: the review packet (weekly
   first, then monthly/seasonal variants), planning routines seeded, and
   altitude-aware plan-from-paper (page-type question + month/quarter/goal
   placements).
3. **Between Us** — agenda + handoffs on the Us app, realtime, wall echo.
4. **Glance polish** — collision hints, waiting-on both directions.
5. **Today refinement pass.**
