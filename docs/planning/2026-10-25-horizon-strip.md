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

## One way to plan

Updated 2026-11-01 (guided planning sessions): the ritual is now the guided
session the Plan button opens, on the real page, with the guide explaining each
step. It replaces the earlier "two ways to plan" split (Plan button ritual vs
everyday strip). The strip stays as it is, for everyday adjustments any time;
it is no longer a second route to planning, and the old planning walks (Plan my
day, Help me plan the week, Plan this season with me) are gone. See
[the guided planning sessions spec](../superpowers/specs/2026-11-01-guided-planning-sessions-design.md).

## Not yet

Phone Week has no strip. Month's routines tab is read-only. Season has no
routines (there is no seasonal routine type).
