# The horizon strip

Scott's wireframe, 2026-10-25. Branch `claude/horizon-strip`.

Every horizon page draws from a strip on its left: what that page plans from.

| Page | Strip tabs |
|---|---|
| Today | This week (the existing panel, moved left) |
| Week | Week (no day yet), Routines (the week's routines, by day), the month (its open lines) |
| Month | the season's goals, Routines (monthly) |
| Season | the year's goals |
| Year | last year's open goals, Routines (yearly) |

- **Routines live at their pace.** Every-day routines are Today's; routines on a
  day or two of the week are in the Week strip, done and moved from there; the
  day columns no longer draw routines.
- **Drag or press.** On Week, drag a no-day item or a month line onto a day, or
  press → Week. On Month and Season, drag a goal above onto a line to put the
  line under it, onto the list (or press → Oct) to write under it. On Year, →
  2026 (or a drag) carries last year's goal in, as the review's carry does.
- **Nested horizons hold** ([2026-09-26](2026-09-26-nested-horizons.md)): a goal
  is never given a day; nothing is copied (bringing an October line onto the
  week keeps the same row on October).
- **Pieces.** "+ Piece" writes a smaller step under an October goal (a subtask
  on October). It triages like any row (This week, Done, Later ▾); once on a
  week or a day it leaves October's list and shows as the goal's tag.
- **Typed adds** read who, when and where ("Dentist for K and E Nov 23 at 9am at
  Cross Keys", `horizonInput.ts` on top of `parseQuickInput`); the date decides
  where it lands, and the box says so before saving. Rule-based, not AI.

## Two ways to plan, kept on purpose

Scott, 2026-10-25: keep both.

- **The Plan button** stays the ritual: look back at the period before, choose
  from the level above, "I'm happy with October". The look-back lives only here.
- **The strip** is for everyday adjustments, any time, without the ritual.

## Not yet

Phone Week has no strip. Month's routines tab is read-only. Season has no
routines (there is no seasonal routine type).
