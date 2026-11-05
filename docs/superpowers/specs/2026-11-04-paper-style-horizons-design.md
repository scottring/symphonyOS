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

## The fold (Scott, 2026-11-04)

Scott: "let's make the UI for this super compelling and self-evident. There
should literally be a fold and it should be beautiful both in terms of visual
aesthetics as well as UX 'feel' and sound." He approved the prototype
(https://claude.ai/artifact/GRQsgUEXxNk7sXki8nun2S): "this is great, i think we
have finally tied everything together in a beautiful way."

The prototype is the reference for look, motion and sound. Build what it does:

- **Folded:** the sheet above sits behind this period's sheet. Only its edge
  shows at the left: a paper strip with the period's name set vertically
  ("FALL 2026"), its open count and a chevron, with the edge of a second layer
  of paper behind it.
- **Unfolding:** tap the edge, drag it, or press F. The sheet swings out on a
  hinge at this sheet's left edge (3D rotate, perspective about 2200px) and
  lies flat beside it like an open journal. Light falls across it as it turns
  (darkest at the hinge). The page widens as it opens, so the spread stays
  centered. The motion is a spring that settles with about a 2% overshoot.
  When it lands, a soft crease shadow appears on this sheet's left edge.
  Dragging follows the finger. On release it snaps open or closed by
  position plus velocity. A tap is any press that moves less than 4px.
- **Sound** (generated with Web Audio; no audio files): a paper swish and
  crinkle while it moves, small crinkles while dragging (by distance moved),
  and a soft landing thump with a few grains. Checking off a task gives a
  pencil tick. One mute control, remembered per device. Six-millisecond
  haptic on landing where the device supports it.
- **The sheet above:** warmer paper, smaller type, no controls of any kind.
  Its foot reads "For reading. Write November in its own words."
- **This period's sheet:** its list, then the next ruled line, with a pencil
  icon and "Write a November goal" ("Write a Fall goal", "Write a 2026 goal",
  "Write a task for this week") in the accent color. Return adds the line in
  ink.
- **Remembered:** open or folded, per person and per horizon.
- **Stays in view (Scott, 2026-11-04):** on wide screens and the Duo, a sheet
  beside a long page is sticky under the page header, viewport-tall, and
  scrolls on its own; it never scrolls away with the page. Phones keep the
  top or bottom fold with its own scroll.
- **Reduced motion:** no spring and no swish. It switches state with a short
  crossfade and the landing sound only.
- **Sizes:** the sheet above takes a reading column of about 36% of the
  spread (220–340px). This sheet keeps the rest, up to 560px, and never
  shrinks below the sheet above.
- **Phones under 760px wide (and the Duo's outside screen):** the sheet above
  hangs from this sheet's top edge as a horizontal strip ("FALL 2026 · 17 ›").
  It folds down toward you and lies above the list, up to 62% of the screen
  high, scrolling inside itself.
- **iPhone Duo, open (the inside screen):** both sheets fill the screen as a
  two-page spread. The sheet above takes about 38% on the left and this
  period the rest. Opening the phone unfolds the sheet with the sound;
  closing it folds the sheet away. Use the fold position the system reports
  (the existing iOS `DockLayout.fold`, `DockEdge.swift`; web: the viewport
  segments API, then a shape fallback of a coarse pointer, 560–900px wide and
  1.2–1.65 tall per unit width). Because the Duo's screen is crease-free, the
  split follows the content, not the hinge. The one exception is when the
  phone is half-open like a book (a reported vertical fold): then the split
  sits on the fold, as Today's columns already do.

### The calendar fold (Scott, 2026-11-04: "yes, add the calendar fold on the right")

Best Laid Plans puts every list beside the calendar for the same stretch of
time: the month's goals beside the month calendar, the season's fixed dates,
and the year's 12-month landscape. Week and Today already show time as the
page itself. Year, Season and Month get a second fold on the **right** edge:
this period's calendar, for reading. Events are added the usual way, never
from the sheet.

- **Left edge:** the level above (what this period is for). **Right edge:**
  this period's calendar (what is already claimed). Both open: a full planner
  spread, Fall | November | November's calendar.
- **Contents:** Month shows the month grid with events (reuse the guided
  session's `NextWeeks`, five weeks), Season shows its fixed dates by month
  (reuse `SeasonCalendar`), and Year shows the 12-month landscape (the 11-01
  spec's Year section).
- **Same fold, mirrored:** the hinge is on this sheet's right edge, with the
  same spring, sound, shading, drag, F-key equivalent (C), memory
  (`symphony-fold:<horizon>:calendar`) and reduced-motion rules. The edge
  reads "{period} calendar", e.g. "November calendar".
- **Sizes with a calendar:** on pages that have both companions, each takes
  clamp(220, 26%, 320) px. Pages with only the sheet above keep 36% (220–340).
- **Wide screens:** both folds can be open when the spread fits (sheet above,
  this sheet and calendar at their minimum widths). Otherwise opening one
  folds the other.
- **Phones and the Duo's outside screen:** the level above folds down from
  the top edge and the calendar folds up from the bottom edge, one at a time.
- **iPhone Duo, open:** two pages, and this period's sheet is always one of
  them. With the level above open, it is Fall | November. With the calendar
  open, it is November | calendar: November turns over to the left page like
  a page in a book. One companion at a time. When the phone is half-open
  (a reported vertical fold), the split sits on the hinge.

### Where it applies

- **Web:** Year, Season and Month pages (the sheet above: last year's open
  goals, the year, the season) and the Week page (the month). The fold
  replaces the strip's first tab on those pages. Routines and Week's "No day
  yet" stay as tabs.
- **Today (Scott, 2026-11-04: "add today with the + on the week sheet"):** the
  week folds beside the day like every other horizon, replacing the This week
  column. The one exception to "no controls on the sheet above": each task on
  the week sheet keeps its **+** (and drag onto the day), because week and day
  share items. Giving a week task to today is the daily "pick 3–5", not a
  copy. Edge label: the week's dates ("Oct 31 – Nov 6"). Foot: "Pick three to
  five for today."  The iPhone app's Today keeps its existing Duo layout for
  now.
- **iPhone app (TestFlight):** the same on the Planner's Month, Season, Year
  and Week (`PeriodPlanView`, `WeekPlanView`), in SwiftUI (rotation3DEffect
  with the same spring and sounds as small bundled sounds or AVAudioEngine
  noise). Its triage (`TriageController`, `ChooserSheet`, bring-down and copy
  verbs) follows the paper-style rules above. Its outside-screen and
  inside-screen layouts follow the existing Duo work: `DockLayout`, and
  Today's `leftColumnWidth` rule for a vertical fold.

### Naming the carry (Scott, 2026-11-04: "rename it to the destination")

"Carry" is never shown. The choice names where the item goes: "To November"
on October's look back, "To Winter" on a season, "To 2027" on the year, and
the task panel's "Later: December" becomes "To December". Week keeps "Next
week". Underneath it is the same move: same level, next period, this
period's commitment ended.

### Someday and Let go (Scott, 2026-11-04: "let go means not ever, rename table to someday")

Two different intentions, never the same button:

- **Someday** ("not now"; formerly Table): ends this period's commitment.
  If no other list holds the item, it goes to Someday to wait for a future
  period.
- **Let go** ("not ever"): the item comes off **every** list. All its open
  commitments end, it gets `bucket: 'someday'` with `dismissed_at` set, and
  it is never shown in Someday, the Inbox or any planning list. It stays in
  history: search finds it, marked "Let go Nov 4", and Undo clears
  `dismissed_at` and restores the commitments. No migration is needed
  (`tasks.dismissed_at` exists; today it means "kept, never shown" for
  school papers). A year goal's Let go stays `status: 'archived'`.
- **Where they appear:** Month look back: Done · To December · Someday ·
  Let go. Season and Year look back: Done · To {next} · Someday · Let go.
  Week look back: Done · Next week · Someday · Let go. Month and Season task
  panel: To {next} · Someday · Let go.

### Planning is a ribbon on the same page (Scott, 2026-11-04: "yeah", ribbon over rail)

There is no separate planning layout. The steps rail (`GuideRail`) is
replaced by a **ribbon**: a satin bookmark hanging from the top of this
period's sheet ("Plan November"). Pulling it lays a band across the top of
the page with the session's steps, the current step's Why and You, and Back,
Next and Leave controls. The last step's Next reads "Done planning November".
The prototype (`2026-11-04-paper-fold-prototype.html`, the ribbon version) is
the reference for look, sound (a low satin slide; a stamp on done) and
behavior.

- **Steps drive the page, not a second screen.** Each step opens the part of
  the page it uses, through PaperFold's `drive`:
  - Look back: the left companion shows last period's sheet with its choices.
  - Read the season, Read the year, Read November: the left companion is open.
  - The calendar steps (Next 4–5 weeks, Season calendar, Map the 12 months,
    Calendar check): the right companion is open.
  - The writing steps (by area, choose this week's tasks, brain dump): the
    write line is focused, with the level above open to read.

  Leaving or finishing returns both companions to their remembered state.
- **Steps with their own editors** (energy, ideal week, wild cards, vision,
  areas, upkeep and fun, refine, share and book, clear the inbox, weekly ops,
  tell the family) show their existing body in a **card that drops under the
  band** for that step only.
- **Look back** is the only time the sheet beside you takes choices: Done ·
  To {next} · Someday · Let go (Week: Done · Next week · Someday · Let go).
- **Done planning** folds both companions, stamps the sheet ("Planned" with
  the date; soft thump), and writes the header line "Planned Wed, Nov 4 · Last
  month’s review".
- **Unchanged from the 11-01 spec:** the steps and their order, Why/You/Guide
  copy, the guide conversation in the docked bar, per-step allowed writes,
  resume, per-person planned state, and the closing writes (minus the ones
  this addendum removes).
- **Phones and the Duo's outside screen:** the band is a sideways-scrolling
  row of step chips under the header. The drop card sits under it.

### Planning is a few tooltips on the everyday page (Scott, 2026-11-04; supersedes "Planning is a ribbon")

Scott saw the shipped ribbon (a red band, a drop-down card and the guide panel
taking over the right side, all repeating the same guidance) and said:
"terrible … would be much better served by doing what we said we were going to
do and just having the one interface for planning and for 'everyday'
interactions. Perhaps this would be best accomplished with tooltips rather
than this big, invasive modal". He approved the prototype
(`2026-11-04-paper-fold-prototype.html`, the Today tab) with "yes, rebuild it
and ship".

- **The page never changes shape for planning.** There is no band, no drop
  card, no bookmark tab, and the guide panel never opens by itself. The
  docked conversation stays as it is every day.
- **A plan chip in the page header** ("Plan November" / "Plan today") starts
  a session. While planning it reads "Planning November · 2 of 6" with an
  ✕ to stop. Tapping it shows the current tooltip again. It replaces the
  header's Plan buttons and the ribbon tab on every horizon.
- **Each step is one paper tooltip** anchored to the real thing on the page.
  It shows "Step N of M", the step title, Why and You (one line each), dots,
  Back, Next ("Done planning {period}" on the last step) and an ✕ that hides
  it without stopping the session. Escape hides it. It follows its anchor
  while folds move, on scroll and on resize. The anchored element gets a soft
  highlight. It is paper-coloured with an arrow, sized about 290px, and on
  phones it sits under its anchor.
- **Steps still drive the folds** (left: the level above or last period's
  look back; right: the calendar) and focus the write line, as before.
- **Step editors live on the page permanently**, quietly, and the tooltip
  points at them:
  - Ideal week: the Season page's section.
  - Vision, landscape and life areas: sections on the Year page.
  - Wild cards, upkeep and fun, brain dump, refine: the write line and the list.
  - Clear the inbox: the top bar's Inbox.
  - Weekly ops: the week's dinner row.
  - Tell the family: a quiet "For the family this week" line on the Week page.
  - Fresh start: the page ⋯ menu.
  - Look back at yesterday: no section on Today (Scott, 2026-11-04: "should
    not be there, and certainly not permanently"). Unfinished tasks from
    earlier days this week return to the week sheet beside the day, first and
    marked faintly with their day ("Tue"); + plans one for today.
  - **One small fact is asked inside its tooltip:** Energy (Low · Medium ·
    High) and the booking date. The answer shows in the header line
    ("Energy: medium"), which can be tapped to change it. There is no energy
    chip on the page.
- **Done planning** folds both companions, stamps the sheet and writes the
  header line, as before.
- **Routines are dated commitments.** On Month and Year the floating Routines
  strip is removed. That period's routines appear on its calendar sheet under
  "Routines this month" / "Routines this year", with their dates. With no
  strip, the spread centers.

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
- **To {next} and Someday act on this period's commitment only**; **Let go**
  ends every open commitment (superseded 2026-11-04, see "Someday and Let go"). On "Plan winter vacation" (open on Fall, November and this week),
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

## Addendum, 2026-11-05: the planning page, section by section

Scott walked Month's step 2 ("this is confusing") section by section. Every horizon now does the same:

- **Look back.** No "Also done, not on the list" (it duplicated *What went well* and pulled the week's and day's lists up). The score accounts for every line: "7 done · 3 moved on · 13 open". The two notes save themselves (a pause in typing, or leaving the box), with "Saved Nov 3" under them; no Save button. Each row's four calls sit on one line (the sheet above widens while it holds a look back, `foldSizes` `wide`, 300–440px) and the calendar folds; decided rows step back, and the heading counts "4 of 13 decided". The look sheet's foot sentence is gone: the tooltip says what each call means.
- **This period's sheet.** The write line names its space ("Family", or "Space" when none). "Go to this week →" is not offered while planning.
- **Calendar sheet.** Kicker "Calendar". Month and Season lists hold what claims a day's time (all-day dates, stretches, series, weekend timed events); a weekday meeting is a dot on the Month grid only. The Month list starts on the month's first day. Day headers are two letters.
- **Header.** While a session runs, the plan chip is the only count: no fact line, no "Planned …" or review link (the season's energy stays).
- **Tooltips.** Each says what the step is for, what is on the screen and what each call does, naming the real periods (`{this}`, `{prev}`, `{above}`, `{month}`, `{day}` filled by `stepIn`). "Hide tips" leaves the title with Back and Next, remembered on the device (`symphony-coach:short`); the title opens the words for that step. Beside a fold the tooltip sits low in the view, so the top of the period's list stays in sight.
- **Scrolling.** A pinned sheet is sized from where it is, not where it will pin, and follows the page's scroll, so each sheet ends in view and scrolls on its own to its last line.
