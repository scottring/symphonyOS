# Symphony v2, stage 4: Today, trimmed

2026-10-14. Approved mockup: https://claude.ai/artifact/AA7QVyno5uu1Dny3tR6xUf
(five frames). Builds on the change card (stage 1) and Routines (stage 3).

## What we are doing and why

Today keeps its picture (For today, The day, Coming up, This week aside) and
loses the machinery around it. Reviews, ordering and duplicate checks become
things you ask for, and each ends in one change card.

## The page (frame "After 1")

- **Header:** the date, then one sentence from fixed rules over the day's data
  (what is on until when, the open stretch, the last fixed thing), with any new
  school-email captures folded in ("2 new from email, in the Inbox"). The
  sentence is not written by the model.
- **⋯ menu:** Hide daily and Print list only.
- **Rows:** tick done, drag, tap to open the item panel. The row reschedule
  button, the row ⋯ menu, the when-chip menu and the bulk-select checkbox go.
  The item panel already holds, or gains, every job they did: day and time,
  Waiting for, Bring up (talk about), Need today, remove from this day, Delete.
- **To talk about:** one quiet line of open talk-abouts (flagged tasks).
- **This week aside:** stays, unchanged: the by-hand way to pull one task in.
- **Bar chip:** "Plan my day" before 4 pm, "Review my day" from 4 pm.
- **Dashed preview:** a pending change card draws on Today as on Week: placed
  tasks dashed teal on the day scale or list, leaving tasks dashed grey, done
  rows struck, merged pairs as one, routine skips struck.

**Removed:** the review drawer and its "Review today" / "Review carried-over
work" entries, the duplicate sweep, the proposed-order preview, the bulk-select
toolbar, the email review sheet, and Show suggestions, Clarity and the signal
row from the ⋯ menu. Their components are deleted where nothing else uses them.

## Plan my day / Review my day (frames "After 2" and "After 3")

Symphony reads the week (`symphony_read_week`), focuses on today, says the day
back plainly, names likely duplicates and leftovers from earlier days, asks only
about gaps (one or two questions), and ends in one change card:

- Morning: MOVE with times (the order of the day), MERGE duplicates, MOVE
  leftovers to other days, LATER.
- Evening: DONE for what was finished, MOVE what carries to tomorrow, TALK for
  what needs a conversation first, routine SKIP for today only.

Rules carried over: structures, never supplies; never invents a time; three
items at a time at most.

## Testing

- Header sentence: pure function with tests.
- Today preview: pure module with tests; TodayView renders dashed rows.
- Removed controls are gone (their tests deleted with them); tick, drag and tap
  still work; the panel offers every job the row menus did.
- Agent: prompt text test for the two sessions.
- Browser pass on Scott's real day, desktop and phone, before shipping.
