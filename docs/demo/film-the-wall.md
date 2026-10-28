# Filming the kitchen wall with the demo household

For the Speedrun team video (and any wall footage): the wall shows the fictional
"Alex" household — Alex, Edith, Liam, Mia — never ours. All data lives on the
demo account `symphonygoals@gmail.com`.

## Before each filming session

1. **Reseed** from your Mac, in this repo (needs `SUPABASE_SERVICE_KEY` in `.env`):
   ```bash
   node scripts/seed-demo.mjs
   ```
   Dates are relative to the run day and use the Mac's clock, so run it the day you
   film. Re-running also un-ticks everything you ticked in the last take.
2. **Put the demo household on the wall.** The wall's own browser is signed in to our
   household — don't sign it out. Instead either:
   - open a separate browser window or profile on the wall's computer, sign in as
     `symphonygoals@gmail.com`, go to `app.symphony-os.com/wall-v2`, go full screen; or
   - plug a laptop into the touchscreen (video + USB touch) and do the same there.
   Close that window when you're done; the real wall comes back untouched.
3. **Pick the scene, at any hour.** Tap the scene title in the wall's header and choose
   Out the door, Home, Dinner or Bedtime. The pick holds for 30 minutes.

## What's on the wall

- **Out the door:** Liam's and Mia's morning steps (get dressed, bed, breakfast, teeth,
  backpack, shoes), three already ticked; "Pack lunches" on the grown-ups line; the
  backpack line shows the library book and show-and-tell. Tick steps live on camera.
- **Home:** each kid's after-school list with homework (math worksheet, spelling words)
  and paper chips (Mia's permission slip still missing, Liam's form held by Edith).
- **Dinner:** tonight is always a real recipe, so "Start cooking" works; cue line
  "Liam sets the table; Mia picks the music."
- **Bedtime:** both kids' bedtime grid with a countdown.
- **Kid pages:** tap a kid for their day, school notices and homework.
- **Today:** piano at 4:30, soccer at 5 (Mia and Edith), pickup at 6.

## The change-card beat

At the wall, tap **Talk to Symphony** in the dock and say or type something like
"Move Liam's piano lesson to Thursday at 4:30." The wall shows a change card.
Tap **Approve**, show it moved, then **Undo**. Rehearse this once before rolling — it
calls the live planning agent on the demo account.

## Don't show on camera

- **The phone book / calling screen.** It reads the kid-phone contacts, which are not
  per-household — that's our real phone book. Film the handset itself instead.
- **Google Calendar events.** The demo account has none, so lanes, pickups and "PE today"
  stay empty. Everything above comes from Symphony's own data.
- No food photos are seeded; the dinner card shows without one.
