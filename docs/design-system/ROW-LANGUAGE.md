# Row language: one way to draw a day's things

Set 2026-10-06 with "Today, calmer" (mockup: https://claude.ai/artifact/M7fYXdoqSZYU8EzcUCctGP).
Every page that lists the things in a day (Today, Week, the wall, planning steps) follows these rules. A page may be denser, but it may not invent its own grammar.

| Thing | Rule | Where it lives |
|---|---|---|
| Kind of row | Calendar event = blue mark and a quiet blue tint (`hsl(214 50% 47%)` / `hsl(214 45% 96%)`). Task = circle. Routine = rounded square. | Today: `[data-row-kind]` in `index.css`. Week: `.wk-glyph`, `.wk-row[data-mark]` in `layout-system.css` |
| Time | One time in the lane (the start). When it ends goes under the title: "until 10:15 AM", then the drive time | `rowSubtitle(item, { until })` |
| Steps | Folded to their next one: "Next: … · 5 steps ›". Only a step for someone *other* than the row's person stays open | `ScheduleItem` |
| People | Avatars a glance from the title (a 54rem reading measure on Today); your own included; nothing shown for an id the household doesn't know | `RowActionRail`, `ScheduleItem` |
| Defaults | A control showing the default ("Any time") waits for hover or focus, on the title line so nothing moves | `ScheduleItem` |
| Free time | Named, in green, in the row grid. An hour or more counts on a Week day; the gap between rows on Today | `lib/week/dayShape.ts`, `OpenSpaceLine` |
| Specials | One chip per kid, from the "Specials — Ella: Library · Kaleb: Art" event | `lib/today/specials.ts` |
| Counts | None on Today or between people. A thing's own steps ("5 steps") are fine; tallies of what's undone are not | |

When a page needs one of these, reuse the helper named here rather than restyling it. When a rule changes, change it here and on every page in the same PR.

No separate picture of the day above a list that already shows it (Scott, 2026-10-06: a time strip over Today's schedule was "redundant to the schedule below").
