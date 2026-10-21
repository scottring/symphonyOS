# Kids' tablets

Scott, 2026-10-21. Approved from the "Kids Kiosk — first draft" canvas.

## What it is

A Fire tablet per kid, paired in Settings → Displays **for** that kid. It
opens `/kid` and shows only that kid's day; there is no way to switch kids
from the tablet. Weekday screens start at noon (the morning is the kitchen
wall's); weekend screens are the whole day.

Two layouts of the same day, chosen at pairing:

- **Trail** (Kaleb): one thing at a time. A row of stops, NOW large with its
  timer and "I did it", NEXT, the rest as one line. A missed stop (three hours
  past) stays on the trail but never blocks NOW.
- **List** (Ella): everything for now in any order, each with a check and a
  timer; later today with times.

Both have a timer for anything, ending with a chosen sound (wind chimes,
birdsong, gentle bell, drum roll; made with Web Audio, no files), and the
thought catcher: type (or, where the browser can listen, say) a thought and
pick what kind it is; it is kept for a grown-up to go over at bedtime and
marked gone over in Settings → Displays.

## Data and safety

Migration `20261021180000_kid_displays.sql`:

- `household_displays.family_member_id`, `layout` (and on pairing codes).
- `my_display()`; pairing takes the kid and layout.
- A display may make exactly two writes, through `display_set_routine_done`
  and `display_set_task_done`. A kid's tablet only for its kid's items (a step
  counts if its collection is the kid's). Rows are written under the item's
  owner. Every direct write from a display is still refused.
- `kid_thoughts`: a tablet adds and reads its own kid's; only a grown-up marks
  one gone over or deletes it.

The kitchen wall uses the same two functions, so its check-offs save when it
runs as a paired display.

## Not yet

"Where things go", suggested chore steps a grown-up can change, free-choice
buttons, voice on Fire tablets (their browser usually cannot listen).
