# Getting started with Symphony

A first pass through the app, one step at a time. Each step tells you where you are, why the page exists, one thing to do, and what you should see when it worked.

The planning chain — Steps 4 to 8, year to today — is the guided path; everything else here is optional. Each step carries a Status. Steps marked *reads cleanly* are ready to follow; a step marked *needs* points at a known gap listed under it; *pending* means not yet walked on this build.

---

## Step 0 · Sign in and set up your household

**Where you are:** The sign-in page, then the first-run setup.
**Why it exists:** Symphony is for a household, not just one person. Naming the people first means everything you add later can belong to someone.
**Do this:** Sign in, name your household, and add the people in it.
**You'll see:** Today opens on the date. Your name is under the account menu (top right); the redesign removed the greeting.
**Status:** reads cleanly

## Step 1 · Today, empty

**Where you are:** `/today`. The day is the page.
**Why it exists:** Everything else in Symphony exists to make this page right: what matters today, with what you need to do it.
**Do this:** Read the page as it is, before adding anything. The "Your first week" card lists what to do first, starting with "Plan your year" — "One thing you want to be true by December."
**You'll see:** Your name, the date, today's calendar if one is connected, and "Your first week" with its steps as links into the flows that do them.
**Status:** needs R3-#2 (run 3, 2026-10-02: the "Where would you like to start?" choices read as plain text); earlier: R2-#6 (with #1, #4, #5)

## Step 2 · Capture something fast

**Where you are:** The quick-add box, opened with ⌘K from any page.
**Why it exists:** Things occur to you at the wrong moment. Capture takes a line and gets out of the way; deciding what it is comes later.
**Do this:** Press ⌘K, type one thing you need to do, and press Enter.
**You'll see:** A confirmation that says where it landed.
**Status:** needs #8 (run 3, 2026-10-02: skipped)
**Known gaps:** A1–A4 (the box before Enter reads cleanly; the toast draws under the dialog; a trailing date word is stripped from the title).

## Step 3 · Inbox

**Where you are:** `/inbox`.
**Why it exists:** Capturing and deciding are different jobs. The inbox holds what you captured until you give it a verdict.
**Do this:** Open the item you just captured and decide what it is: a task for a day, a step toward a goal, or something to drop.
**You'll see:** The item leaves the inbox and appears where you sent it.
**Status:** needs #9 (run 3, 2026-10-02: skipped)
**Known gaps:** A5–A12 (three "when" controls per row; the Unsorted gate fires after the row has left; "Calendar" deletes the task; verdict data flow is correct).

## Step 4 · Year

**Where you are:** `/year`.
**Why it exists:** A goal is an outcome you want by the end of the year, not a task. The year page holds those outcomes so the shorter periods can draw from them.
**Do this:** Write one goal you want true by December in "Add a goal for the year" and press Enter (the goal saves as you type). When the list looks right, press **Mark 2026 planned** — one tap, right there. If last year left goals open (from December on), the button reads **Look back at 2025** instead and walks each one first.
**You'll see:** "2026 isn't marked planned yet" while you write; after the tap, "2026 planned Oct 2" under the title and, on its own line beneath, "2026 is planned. Choose what Fall takes on → · Not now".
**Status:** pending — rebuilt after run 3 (R3-#4–#9: Enter no longer opens the area menu; no separate planning screen without a look-back; the saved line sits under the masthead). Walk again on the new build.

## Step 5 · Season

**Where you are:** `/season`.
**Why it exists:** A year is too far away to act on. A season is the stretch where you commit to a few goals under the year's, and the tasks that move them.
**Do this:** Arrive from the year's "Choose what Fall takes on" (the cursor is already in "Add to Fall"), or open `/season`. Beside a 2026 goal in the right column, press **+ Fall's part** and write what Fall does for it. Then **Mark Fall planned**. From Summer's last two weeks on, the button reads **Look back at Summer** and decides Summer's open rows first: **Carry to Fall**, **It's done**, **Someday**, **Drop it**, or **Leave it in Summer**.
**You'll see:** Fall's list grouped under the 2026 goals it serves, each goal a small heading; the 2026 goal in the right column marked "In Fall's plan".
**Status:** pending — rebuilt after run 3 (R3-#10–#15). Walk again on the new build.

## Step 6 · Month

**Where you are:** `/month`.
**Why it exists:** The month pulls from the season. Choosing what to carry into this month is a deliberate decision, not an automatic cascade.
**Do this:** From Fall's "Choose what October takes on", write October's part of a Fall goal with **+ October's part**, or type a line of your own. Then **Mark October planned**. In September's last week and after, the button reads **Look back at September** and walks its open rows first; a carried row whose name says "September" offers a rename.
**You'll see:** October's list under the Fall goals it serves, the dates you can't move on the left, and "October is planned. Choose what week 41 takes on →".
**Status:** pending — rebuilt after run 3 (R3-#16, #17, #29–#32, #34). Walk again on the new build.

## Step 7 · Week

**Where you are:** `/week`.
**Why it exists:** The week is where the plan meets real days. The week has a list of its own, and the days pick from it.
**Do this:** From October's "Choose what week N takes on" (on a week's last day, the month and the week page both offer the NEXT week), press **+ Week N's part** beside an October goal, or type a line — a weekday in it ("Talk to Tim on Monday") puts it on that day. Then **Mark week N planned**. From last week's final day on, the button reads **Look back at last week**, and its open rows — dated ones included — come first.
**You'll see:** "This week's list", each row saying what it's a step toward; rows with a day listed under "On a day" as "→ Mon 11:45"; the October goal marked "In this week's list"; after saving, "Pick something for today →" (or "Back to Today →" for a week planned ahead).
**Status:** pending — rebuilt after run 3 (R3-#18–#23, #33). The week's list and its links read cleanly (R3-#27).

## Step 8 · Today

**Where you are:** `/today`.
**Why it exists:** The week list stays whole all week. Today is where you say which of it you mean to do now.
**Do this:** Open **Choose tasks** and press **Plan for today** on one row.
**You'll see:** The row on today's list, and still on the week's list — the **Choose tasks** panel marks it "Planned today", and the `/week` page's own list marks it "picked for today". Ticking it in either place strikes it in both. A hint says once: "The week list stays whole. Picking only marks what you mean to do today." Beside **Choose tasks** is **◎ Goals**: the year's, the season's and the month's goals, "For reference. Edit them on their pages.", each with "Open →". It never writes.
**Status:** needs R3-#24, #28 (run 3, 2026-10-02: Today shows none of the plan; only today's dated items appear). Earlier: reads cleanly (Phase 2)

## Step 8a · The nudge

**Where you are:** Today, on a weekend or a Monday, or around the turn of a month, season or year.
**Why it exists:** The chain is a habit, not a chore. One quiet line offers the next rung when its moment comes, and never more than one at a time.
**Do this:** Read it, and either follow it or press **Not now**.
**You'll see:** One line — "The week of Sep 22–28 isn't planned yet. Plan the week → optional Not now" — and nothing at all once that period is planned or dismissed. Before you have ever planned, it reads "Start with the year: plan 2026, then the season, the month and the week." The windows are narrow: Saturday or Sunday for the coming week and Monday or Tuesday for the week just started; the last six days of a month and its first seven; from Nov 20 the nudge offers next year.
**Status:** reads cleanly (Phase 4; not walked in run 3)

## Step 8b · Week, the schedule

**Where you are:** `/week`, schedule view.
**Why it exists:** Some work needs a time, not just a day. The schedule is where a task becomes a block on the calendar.
**Do this:** Drag a task onto a day and time, or open its time picker and choose one.
**You'll see:** The task drawn as a block at that time, beside your calendar events.
**Status:** needs B15–B18; run 3: drag to a day and time works; the list now keeps the row under "On a day" (R3-#21 fixed)
**Known gaps:** B15–B18 (a drag to a time works; the focus row stays on the old day; the panel never says when the task is).

## Step 9 · Routines

**Where you are:** `/routines`.
**Why it exists:** Some things repeat. A routine is the pattern; each day it shows up is its own commitment you can keep or move.
**Do this:** Create a routine, then give it a day.
**You'll see:** The routine in its slot, and that day's occurrence on the week.
**Status:** pending (run 3: not walked)
**Known gaps:** B19–B23, A16 (rung sublines read cleanly; "New routine" creates a live row on click; no "Give it a day" on the week page; "All Day" becomes 12:00 AM).

## Step 10 · Today, live

**Where you are:** `/today`, now with work on it.
**Why it exists:** This is the page you live in. Adding, planning, scheduling, completing and reviewing all happen here.
**Do this:** Add a task by the date, use "Plan for today" in the Planning panel, give one task a time, complete one, and open "Review carried-over work".
**You'll see:** Each action changes the day in front of you, and the review shows what moved from earlier days.
**Status:** needs R3-#24, #25, #28 (run 3, 2026-10-02)
**Known gaps:** A13–A23, B24 ("Add task" by the date reads cleanly; row actions are hover-only; "Review today" did nothing; "Earlier today" carries counts).

## Step 11 · Task detail

**Where you are:** A task's detail panel, opened from any list.
**Why it exists:** A task is only useful with what you need to do it: notes, the people involved, files, and the things to buy.
**Do this:** Open a task, add a note and a person, attach a file, and use the back arrow.
**You'll see:** The context saved on the task, and the arrow returning you to where you came from.
**Status:** needs R3-#26 (run 3, 2026-10-02: "Make it a goal" but no "Part of…")
**Known gaps:** A24–A28, C14 (notes lost text silently; the panel never says where the task lives; two people concepts unnamed; the To-buy suggestion reads cleanly).

## Step 12 · Reference

**Where you are:** `/notes`, `/lists`, meals and contacts, from the More menu.
**Why it exists:** Notes, lists, meals and people are the context tasks lean on. They live close so you do not leave the app to find them.
**Do this:** Open each one and look for the item you attached in the previous step.
**You'll see:** The same note, list and person reachable from here and from the task.
**Status:** pending (run 3: not walked)
**Known gaps:** C9–C13 (a saved note does not appear until reload; contacts and lists create flows read cleanly; menu labels differ from page titles).

## Step 13 · Settings

**Where you are:** Settings, from the More menu.
**Why it exists:** Your calendar, your household and your life areas shape every other page.
**Do this:** Connect a calendar, check the household members, review life areas, and find sign out.
**You'll see:** Calendar events on Today once connected, and the people you named in step 0.
**Status:** pending (run 3: not walked)
**Known gaps:** C15–C18 (Settings opens with artwork; a raw database error under School mail; no Life areas section; calendar tab reads cleanly).

## Step 14 · On your phone

**Where you are:** The same app at phone width.
**Why it exists:** Capture and Today happen away from the desk. The phone carries the same path.
**Do this:** Walk Today, capture, inbox and the week on the phone.
**You'll see:** The same pages fitting the narrow screen, with nothing cut off.
**Status:** pending (run 3: not walked)
**Known gaps:** C-P1–C-P8 (an unlabeled Sign out in the header; the ladder and reference pages unreachable by tab; the Planning sheet reads cleanly).

## Step 15 · The kitchen wall (optional)

**Where you are:** The wall view, on a shared screen.
**Why it exists:** The family should see the day without signing in.
**Do this:** Open the wall and look for today's events, meals and each person's lane.
**You'll see:** The household's day, readable from across the room.
**Status:** pending (run 3: not walked)
**Known gaps:** C21 (renders signed in; header count disagrees with the Due-today card; not seen signed out).
