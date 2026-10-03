# Week as a grid — one row, one drag rule, the weekend once

Date: 2026-10-03 · Status: draft for Scott's review
Mockup: https://claude.ai/artifact/P23ymiTNJSxVJ8K7avGyNN (the "Grid" board)
Follows #125 (source-first columns, faint scenery).

## Why

Scott, 2026-10-03, about the Week page:

- The three columns look and behave differently: October has no rows you can drag, the
  list has white cards, the days drag only some of their rows ("All very confusing").
- Weekend chores show on both Saturday and Sunday ("confusing and mind-numbing").
- A long days column beside two short ones leaves "wasted space".
- The content should use a landscape screen's width.

## Decisions already made

1. The days are a **grid**, and it is the only Week layout (no toggle: "optional is too busy").
2. **One row** style and **one drag rule** in every column.
3. The weekend shows its "once this weekend" work **once**.
4. Each day's untimed routines **fold** to one line.
5. Planning pages use the **full width** (up to about 1600px); reading pages widen from 992px to
   about 1040px.
6. The Oct 1 Layout System is updated to match.

## 1. Layout (desktop, 1061px and wider)

```
 41  Oct 3 – Oct 9                          [List · With October · One at a time] [Look back]
 ───────────────────────────────────────────────────────────────────────────────────────────
 October (for reference)                              │ This week's list
 – fix up the porch          – Plan sabatical ◆       │ ANY DAY
 – Look up music lessons     – Make a budget          │ ○ fill holes in the office     SK
 …  (two columns, scrolls inside when long)           │ ○ gift shopping …              IR
 ───────────────────────────────────────────────────────────────────────────────────────────
 The days
 ┌ The weekend · Sat 3 – Sun 4 ───────────────────────────────────────────────────────────┐
 │ 3 SAT 68°/59°           │ 4 SUN 61°/59°           │ SOMETIME THIS WEEKEND  once for both │
 │ 7a ○ washing machine…   │ 8a ○ Food shopping ↻    │ ○ Food planning ↻          SK IR     │
 │ 2p — Theas bday         │ 10:30a — Kaleb baseball │ ○ Yard weeding ↻           SK        │
 │ any ○ Buy Ella a helmet │ any ○ Sunday dinner     │ Drag one onto Sat or Sun for a day.  │
 │ › Routines · 6          │ › Routines · 3          │                                      │
 └──────────────────────────────────────────────────────────────────────────────────────────┘
 5 MON        │ 6 TUE         │ 7 WED        │ 8 THU        │ 9 FRI
 8a ○ Jury…   │ 9a — Boxing   │              │ 9a — Boxing  │
 › Routines·1 │ › Routines·2  │ › Routines·1 │ › Routines·2 │ › Routines·1
```

- **Sources band** (top). October runs in two columns and This week's list sits beside it. The
  band is capped at about 9 rows high and scrolls inside itself, so the days always start
  near the top of the window.
- **The weekend band.** Saturday, Sunday and "Sometime this weekend" sit side by side in one
  frame. Where the band goes depends on the week settings:
  - Scott's weeks start on Saturday, so the band leads the week.
  - A Monday-start week ends with it.
  - In a Sunday-start week, Saturday and Sunday belong to different weekends, so there is no
    band. Each day shows on its own, and "Sometime this weekend" sits beside Saturday.
- **Weekday row.** The five weekdays are equal columns. The page scrolls normally.
  dnd-kit's auto-scroll covers drags to a day that is off screen.
- **The "With October" view switch stays.** "List" hides October and widens This week's list.
  "One at a time" is unchanged.
- **Narrower windows.**
  - 861–1060px: the sources band stacks (the list, then October); the weekend band stays three
    across; the weekdays wrap to 3 + 2.
  - Below 861px (phones): one column — This week's list, the weekend (Sat, Sun, Sometime), the
    weekdays, then October. Phones keep their card rows, as the Layout System says.
- The days stop scrolling separately from the rest of the page. The grid replaces the long
  column, so `useColumnsFitWindow` comes off Week; Month and Season keep it.

## 2. Widths

- **Planning pages** use the window's full width minus the shared gutter, capped at 1600px:
  Week, Month, Season, and Today when its week column is open. This replaces the `max-w-[992px]`
  and 1152px rules (`HomeView.tsx` week-column, `.pv2-page`, the `:has()` widening in
  `layout-system.css`, and `TodayView.tsx`).
- **Reading pages** (`PAGE_COLUMN`: Inbox, Lists, Notes, Routines, Settings, Contacts…) go from
  992px to 1040px.
- The shell's `.desktop-workspace-page`, `.page-navigation`, `.plan-page-tools` and
  `.guide-slot` 1152px caps follow the page they hold.
- The side pane (420px) still takes its room first, so the page shrinks when the pane is open.

## 3. One row

Every row on Week uses one component (the Layout System's row, sized for a narrow column):

| | |
|---|---|
| Lane | a time on the days (`7a`), empty elsewhere; 38px |
| Mark (16px) | ○ task · ○ + ↻ routine · — calendar event · ◆ goal · – a month line |
| Title | 14.5px in the grid's narrow cells, 16px in the list; a 12px line under it (step of / from) |
| People | initials at the right, as Today shows them |
| Hover | the shared tint; a grip appears at the left edge on anything that can move |

- **No white cards.** The list's cards go; their only job was to say "this one moves", and
  now the grip says it on every row.
- **One component, not four.** Today's four row kinds (list card, journal entry, reference row,
  PlanLine) become one `WeekRow`. Its look is set in `layout-system.css`, next to the
  library row it copies.

## 4. One drag rule — if it can go somewhere else, it drags

| From → to | What happens |
|---|---|
| October line → This week's list | the same write as "+ This week" (it stays on October's plan too) |
| October line → a day | onto this week, on that day, any time |
| List row → a day | any time on that day (as today) |
| Day row → the list | loses its day, stays this week (as today) |
| Untimed task → another day | moves (as today) |
| **Timed task → another day** | moves and **keeps its time** (new; today it can't move) |
| **Routine occurrence → another day** | moves just that occurrence (the one-day override "Move" already writes, #115) |
| **Sometime this weekend → Sat or Sun** | gives this weekend's occurrence that day |
| Calendar event | doesn't drag; the dash mark says so |
| Onto a past day | refused (as today) |

Every drop shows an Undo toast. "+ This week" and "+ Step" stay on October lines for when
typing a step is quicker than dragging.

## 5. The weekend, once

**What the data says** (Scott's routines, 2026-10-03). Eight routines that read "Weekends" are
stored as *weekly on Saturday AND Sunday*: two separate occurrences, each needing its own
tick. They are Food planning, Go on weekend family bike trips, Iris laundry and clothes
processing, Iris weekend workout, Put away kitchen laundry, Weeding front and back yards,
Yard weeding, and Weed the backyard (every other weekend). The app shows such a rule as
"Weekends", which hides that it means both days.

The app already has the rule Scott means: **Weekend**, a window that is done once, with long
weekends included (`lib/cadence/weekendWindow.ts`). On Week its unplaced occurrences land in
a list that is never drawn (`JournalDay.available`), so today they would vanish entirely.

**Changes**

1. **"Sometime this weekend"** lists every Weekend-rule routine whose occurrence this weekend
   hasn't been given a day or ticked. Tasks planned for "this weekend" (`weekendStart`) join
   it. Tick one there and it's done for the weekend. Drag it onto Saturday or Sunday to plan it
   there.
2. **The editor says what it means.** A weekly Sat + Sun rule reads "Sat and Sun". Choosing the
   weekend offers "Once, sometime this weekend" or "Both Saturday and Sunday".
3. **Scott's eight routines become Weekend-rule routines.** This is a one-off data change, made
   only with Scott's yes (open question 1). Do Kids laundry, which is timed at 2pm on both days,
   stays as both days. Weed the backyard keeps its every-other-weekend rhythm. Two of the eight
   also carry old day keys (`'saturday'`); the change replaces them.

## 6. Routines fold

- **Untimed routines fold per day.** On each day they collapse into one line: "› Routines · 6".
  Opening it lists them, and once they're all ticked it reads "Routines · done". Each day's
  open/closed state is remembered on the device.
- **Timed routines stay in the day's schedule.** They don't fold.
- **The toolbar's Routines switch on Week is retired.** Routines are always there, folded. It
  was the switch that hid every routine from Week; the per-routine "Show in Today and
  planning" switch (#125) now covers hiding one.
- **Today keeps its "hide daily routines" choice.** This change is Week only.

## 7. The Layout System doc

Add to the Oct 1 Layout System (`docs/design-system/LAYOUT-SYSTEM.md` and the artifact page):

- **Widths:** the two widths from section 2.
- **The narrow-column row:** section 3, including the mark vocabulary.
- **Movement:** "A row that can move shows a grip on hover; anything that can go somewhere
  else drags there."
- **The weekend:** a weekend band, with "Sometime this weekend" holding window work once.

## Out of scope

- **Month and Season.** No row or layout change beyond the width. Their own row pass comes later.
- **Today's layout.** Width only.
- **The hourly Schedule mode of Week.** Unchanged.
- **Phones.** No new behavior; they only get the new order.

## Testing

- **Unit tests:**
  - The weekend selector: what is "sometime this weekend" vs on a day vs done.
  - The drag matrix: what each source → target writes, including a timed task keeping its time
    and a routine moving one occurrence.
  - The fold count.
  - The width rules (which class applies to which page).
- **Regression tests:**
  - A Weekend-rule routine ticked on Saturday is gone from Sunday and from Sometime.
  - A weekly Sat + Sun routine still needs both ticks.
- **In the browser, on Scott's data, in a local preview:**
  - At 1720px, 1470×860, 1000px and 390px.
  - Drag one row of every kind.
  - Check the weekend band on the real weekend.
- **The data change:** run in a transaction, check the eight rows read back as Weekend, and
  record the old rules so the change can be undone.

## Open questions for Scott

1. **May I convert the eight routines?** That's the list in section 5. They'd become
   "once, sometime this weekend".
2. **Is the October band capped at about 9 rows enough?** Above that it scrolls inside the band.
