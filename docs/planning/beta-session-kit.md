# Beta session kit

October 15, 2026. Everything a person needs to run the gates that need people and devices (beta-readiness.md UX01–UX08, the five-adult usability gate, the spoken layer). Each session is 30–40 minutes with someone following this page; the results sheet at the end is what gets attached to the register. Use the synthetic household only — never real family records.

## Before any session

- Account: the synthetic household (`smkaufman+1015@gmail.com`). Reset it between sessions: delete its tasks, routines and any paired display from Settings → Displays.
- Record: device model, OS, browser and versions; app build (the `index-….js` name in the page source); date and time; who ran it.
- Have this page open on a second device so the tester never reads the script on the device under test.

## Session A — desktop browser (UX01, UX03, UX06, UX07) — 30 min

1. **Orientation (UX01).** Open Today, Week, Month, Season, Year. Ask: "Which dates are you looking at? Who else can see this?" Record the answers; both must be right without coaching.
2. **Capture (UX03).** Type: *I need to call the plumber, pick up the Amazon order, clean the yard, and fit in an all-day test drive this week.* Expect: one card with four items, nothing saved. Type: *Actually, the plumber call is Friday.* Expect: the same card revised, still four items. Press **Approve all 4**. Expect: a "Saved" receipt with Undo; two tasks on Friday, two in "No day yet". Press **Undo**. Expect: "Undone", empty week.
3. **One-item change (UX03).** Type: *Call Morgan this afternoon.* Expect: saved immediately with Undo, no card. Press Undo.
4. **Stable screen (UX06).** Scroll the week, open a task, rename it, close it. Expect: no blank flash, scroll position kept, the rename shown.
5. **Help (UX07).** Type: *What is this page?* on Week and on Inbox. Expect: parts of the page outlined one at a time; the words match what is on screen. Type: *Did the school send anything?* with no mail connected. Expect: a plain "mail isn't connected" answer, no invented email.
6. **Interrupt a save (UX03).** Type a four-item capture, press Approve, and immediately turn Wi-Fi off. Turn it back on. Expect: either all four saved or "some of it stayed saved" — never "nothing changed" when something did. Reload; expect no duplicates.

## Session B — phone browser (UX01, UX03, UX06) — 20 min

Repeat A1, A2 and A4 on the phone. Add: large text on (Settings → Text size); check every control on Today and Week is tappable and nothing is clipped; switch to the Conversation pane with a half-typed message, switch back, expect the draft kept.

## Session C — iPad as the wall (UX02, UX05-states, B02) — 25 min

1. On the iPad, open `app.symphony-os.com/wall-v2`. Expect the pairing screen, not a sign-in.
2. On a phone, Settings → Displays → **Pair a display**; type the code on the iPad. Expect the wall within five minutes of starting (record the time).
3. Leave it on the counter for the session. Record: readable at arm's length and from across the kitchen? Clock, day, routines, dinner correct? Any private goal or personal task visible? (There must be none.)
4. Say "Hey Symphony, add milk to the grocery list." Expect: "listening" shown within a second; milk on the family list; "Saved".
5. Say "Move piano to Thursday." Expect: a card, spoken "say approve"; say "approve"; expect saved; say "undo" within 30 s; expect undone.
6. Say "What's for dinner?" with the TV on. Record whether it heard you.
7. From the phone, **Revoke** the display. Expect the iPad to show the pairing screen within ten minutes (sooner on reload) and never the household's data again.

## Session D — spoken layer on desktop Chrome (UX04, UX05) — 20 min, needs a microphone

1. Press the mic in the bar. Record the time from press to "listening" (target ≤ 1 s) ten times.
2. Say the four-item capture. Expect the card, spoken as "on the card, nothing saved yet" — the words "done", "saved" or "added" must not be spoken before Approve.
3. Say "approve". Expect saved, spoken as saved.
4. While Symphony is speaking, press Stop. Record the time to silence (target ≤ 500 ms) ten times.
5. Say a correction mid-sentence, pause for five seconds, then finish. Expect the whole sentence used.
6. Open the browser console and copy the `symphony.voice.metric` lines (connect and first-reply times) into the results sheet.
7. Pronunciation: have it say "Kaleb", "Ella", "Gilman", your street name. Record what you heard.

## Five-adult gate (B00)

Five adults, two of whom did not set up the household, each on a supported device, no coaching. Each does, in order: identify the audience (whose plan is this, who can see it); capture a task; reschedule it; find the next commitment on a second surface. Pass: all five identify the audience correctly; at least four complete the other three steps unaided. Record every stumble verbatim; each becomes a bench scenario.

## Results sheet (copy per session)

| Field | Value |
|---|---|
| Session (A/B/C/D/5-adult) | |
| Date, tester, participant role (organizer / other adult) | |
| Device, OS, browser, build | |
| Step | Expected | Observed | Pass / Fail | Note / request id |
| … | | | | |
| Timings (listening, stop, connect, first reply) median / p95 | |
| Anything private seen where it should not be | |
| Attach: screenshots or recording | |

File completed sheets under `docs/planning/beta-sessions/` and link them from the register's evidence matrix. A session with a Fail on audience, saved/proposed wording, or private data is a release blocker until fixed and re-run.
