# Flexible weekend planning

Scott clarified on September 22, 2026 that “Plan for this weekend” means either Saturday or Sunday, without assigning a day or time.

The task chooser exposes the action in each open task’s Plan menu with the exact dates. On Week it uses the Saturday in the displayed week; on Today it uses the coming weekend, including the current weekend on Sunday. It updates the existing task, keeps higher commitments, adds its week commitment and stores a Saturday in `tasks.weekend_start`. The window includes Sunday even when Sunday begins a new calendar week. It creates no calendar appointment, duplicate task or automatic new-week commitment.

The week list and chooser show the dates. A task is available to choose on Sunday across the week boundary. Choosing either weekend day retains that context. Explicitly replanning outside the window, sending it to Someday, or keeping/dropping its week commitment clears the old weekend preference. Completion remains completion of the same task.

Apply `supabase/migrations/2026-09-22_task_weekend.sql` before using the action against a database. The migration only adds a nullable date and Saturday constraint; existing rows and RLS policies remain unchanged. The migration was applied to the linked shared database with Scott’s approval on September 22, 2026. The app deployment remains separate.

## On the Month page (2026-09-25)

The Month (and Season) page's timing control, "Choose when", now offers
**A weekend in September**: every weekend the viewed month touches. A weekend
that straddles the month edge (Sat Oct 31 – Sun Nov 1) is offered in both
months. Each weekend is offered first as **either day**, then as its Saturday
and Sunday tiles, which show the same relative busyness bars as the day
tiles. All weekend days shown share one scale, and the day-count window is
widened to cover the edge days.

- **Either day** writes `weekendPlacement`: the weekend, its week, and no day.
  It is the same write as the Week and Today entry points (`planTaskWeekend`).
- **Saturday or Sunday** writes the weekend, its week and that day in ONE
  write (`planTaskWeekendDay`). The result is the same state as choosing the
  weekend and then the day. A day outside the weekend is refused.
- **The month, the goal link and the assignees are never part of either
  write.** The week anchor follows the configured first day of the week, so
  with Sunday-start weeks a weekend's Sunday opens the next week. That day
  reads as inside what was chosen, never "still on" another week.
- **The row wears** "Weekend · Sep 12–13 · either day". Removing a chosen day
  returns it to the weekend. **Remove weekend** (the menu names it) clears the
  weekend with its week and keeps the month; Undo restores both. The generic
  week removal used to leave `weekend_start` behind, and now clears it too.
