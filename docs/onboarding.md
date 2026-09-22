# Getting started with Symphony

A first pass through the app, one step at a time. Each step tells you where you are, why the page exists, one thing to do, and what you should see when it worked.

The planning chain — Steps 4 to 8, year to today — is the guided path; everything else here is optional. `Status` on each step records whether it read cleanly, or points at the finding that says it did not (numbers refer to the walkthrough brief for that date).

---

## Step 0 · Sign in and set up your household

**Where you are:** The sign-in page, then the first-run setup.
**Why it exists:** Symphony is for a household, not just one person. Naming the people first means everything you add later can belong to someone.
**Do this:** Sign in, name your household, and add the people in it.
**You'll see:** Today opens, greeting you by name.
**Status:** reads cleanly (Claude note #2 on the prefilled name)

## Step 1 · Today, empty

**Where you are:** `/today`. The day is the page.
**Why it exists:** Everything else in Symphony exists to make this page right: what matters today, with what you need to do it.
**Do this:** Read the page as it is, before adding anything. The "Your first week" card lists what to do first, starting with "Plan your year" — "One thing you want to be true by December."
**You'll see:** Your name, the date, today's calendar if one is connected, and "Your first week" with its steps as links into the flows that do them.
**Status:** needs #6 (with #1, #4, #5)

## Step 2 · Capture something fast

**Where you are:** The quick-add box, opened with ⌘K from any page.
**Why it exists:** Things occur to you at the wrong moment. Capture takes a line and gets out of the way; deciding what it is comes later.
**Do this:** Press ⌘K, type one thing you need to do, and press Enter.
**You'll see:** A confirmation that says where it landed.
**Status:** needs #8
**Agent notes:** A1–A4 (the box before Enter reads cleanly; the toast draws under the dialog; a trailing date word is stripped from the title).

## Step 3 · Inbox

**Where you are:** `/inbox`.
**Why it exists:** Capturing and deciding are different jobs. The inbox holds what you captured until you give it a verdict.
**Do this:** Open the item you just captured and decide what it is: a task for a day, a step toward a goal, or something to drop.
**You'll see:** The item leaves the inbox and appears where you sent it.
**Status:** needs #9
**Agent notes:** A5–A12 (three "when" controls per row; the Unsorted gate fires after the row has left; "Calendar" deletes the task; verdict data flow is correct).

## Step 4 · Year

**Where you are:** `/year`.
**Why it exists:** A goal is an outcome you want by the end of the year, not a task. The year page holds those outcomes so the shorter periods can draw from them.
**Do this:** Press **Plan 2026** in the status row (from late November it offers next year). Write one goal you want true by December, then **Save 2026**. An empty goals list offers the same session: "Nothing yet. Plan 2026 →".
**You'll see:** "Planned Sep 21" where "Not planned yet" was, the goal on the year page, and the line "2026 is planned. When you're ready, plan the season with 2026 beside you. Plan the season → optional". "Not now" puts that line away.
**Status:** reads cleanly (Phase 3)
**Agent notes:** B1–B4, C5 (the composer in the row reads cleanly; the goal page treats a goal like a task). Once the year is saved, the button reads "Review the plan".

## Step 5 · Season

**Where you are:** `/season`.
**Why it exists:** A year is too far away to act on. A season is the stretch where you commit to a few goals under the year's, and the tasks that move them.
**Do this:** Press **Plan Fall 2026**. The session runs "Look back at Summer 2026 · Plan Fall 2026 · Save". If last season had a list, give each open row a verdict — **Keep**, **Keep, and add a next action**, **Someday** or **Drop**. Then add a season goal, choosing the year goal it is "for", and a task "toward" it. **Save Fall 2026**.
**You'll see:** The goal and the task on the season page, and the year's goals in the column beside the session while you write. A hint says once: "Goals are what this period should add up to. They stay on this list; you look at them when you plan a week or a day."
**Status:** reads cleanly (Phase 3)
**Agent notes:** B5–B10 (the year's goals now sit beside the session rather than in a rail that cannot take a step). "Close · keep my draft" leaves the session without losing what you wrote.

## Step 6 · Month

**Where you are:** `/month`.
**Why it exists:** The month pulls from the season. Choosing what to carry into this month is a deliberate decision, not an automatic cascade.
**Do this:** Press **Plan October**. Look back at September and give its rows their verdicts; then, in the column beside you, press **+ Add to October** on a season task, or type a task of your own. **Save October**.
**You'll see:** "Planned Sep 21" in the status row; the save summary saying the season task "stays on Fall 2026, marked "in October""; and afterwards "October is planned. When you're ready, plan the week with October beside you. Plan the week → optional".
**Status:** reads cleanly (Phase 1)
**Agent notes:** B9, B11, B12, B25 (the pull is now "+ Add to October" inside the session; the empty list points at the session rather than drawing before the data).

## Step 7 · Week

**Where you are:** `/week`.
**Why it exists:** The week is where the plan meets real days. The week has a list of its own, and the days pick from it.
**Do this:** Press **Plan this week**. Look back at last week's list, then press **+ Add to this week** on an October task. Give a time-sensitive task a day with the day menu ("Any day" until you choose one). **Save this week**.
**You'll see:** "This week's list" above the days, each row saying where it came from ("from October", "kept from last week"), and "The week is planned. Each day, pick from this list. Go to Today → optional". A hint says once: "Adding a month task here puts it on this week's list too. The month keeps it and shows "on this week"."
**Status:** reads cleanly (Phase 2)
**Agent notes:** B13, B14, C6 (B13 closed: the week now has its own list. An empty list reads "Nothing on this week's list yet. Plan this week →").

## Step 8 · Today

**Where you are:** `/today`.
**Why it exists:** The week list stays whole all week. Today is where you say which of it you mean to do now.
**Do this:** Open **Choose tasks** and press **Plan for today** on one row.
**You'll see:** The row on today's list, and still on the week's list marked "Planned today"; ticking it in either place strikes it in both. A hint says once: "The week list stays whole. Picking only marks what you mean to do today."
**Status:** reads cleanly (Phase 2)
**Agent notes:** Beside "Choose tasks" is **◎ Goals** — the year's, the season's and the month's goals, "For reference. Edit them on their pages.", each with "Open →". It never writes.

## Step 8a · The nudge

**Where you are:** Today, on a Saturday or Sunday, or in the last days of a month.
**Why it exists:** The chain is a habit, not a chore. One quiet line offers the next rung when its moment comes, and never more than one at a time.
**Do this:** Read it, and either follow it or press **Not now**.
**You'll see:** One line — "The week of Sep 22–28 isn't planned yet. Plan the week → optional · Not now" — and nothing at all once that period is planned or dismissed. Before you have ever planned, it reads "Start with the year: plan 2026, then the season, the month and the week."
**Status:** reads cleanly (Phase 4)

## Step 8b · Week, the schedule

**Where you are:** `/week`, schedule view.
**Why it exists:** Some work needs a time, not just a day. The schedule is where a task becomes a block on the calendar.
**Do this:** Drag a task onto a day and time, or open its time picker and choose one.
**You'll see:** The task drawn as a block at that time, beside your calendar events.
**Status:** needs B15–B18
**Agent notes:** B15–B18 (a drag to a time works; the focus row stays on the old day; the panel never says when the task is).

## Step 9 · Routines

**Where you are:** `/routines`.
**Why it exists:** Some things repeat. A routine is the pattern; each day it shows up is its own commitment you can keep or move.
**Do this:** Create a routine, then give it a day.
**You'll see:** The routine in its slot, and that day's occurrence on the week.
**Status:** pending
**Agent notes:** B19–B23, A16 (rung sublines read cleanly; "New routine" creates a live row on click; no "Give it a day" on the week page; "All Day" becomes 12:00 AM).

## Step 10 · Today, live

**Where you are:** `/today`, now with work on it.
**Why it exists:** This is the page you live in. Adding, planning, scheduling, completing and reviewing all happen here.
**Do this:** Add a task by the date, use "Plan for today" in the Planning panel, give one task a time, complete one, and open "Review carried-over work".
**You'll see:** Each action changes the day in front of you, and the review shows what moved from earlier days.
**Status:** pending
**Agent notes:** A13–A23, B24 ("Add task" by the date reads cleanly; row actions are hover-only; "Review today" did nothing; "Earlier today" carries counts).

## Step 11 · Task detail

**Where you are:** A task's detail panel, opened from any list.
**Why it exists:** A task is only useful with what you need to do it: notes, the people involved, files, and the things to buy.
**Do this:** Open a task, add a note and a person, attach a file, and use the back arrow.
**You'll see:** The context saved on the task, and the arrow returning you to where you came from.
**Status:** pending
**Agent notes:** A24–A28, C14 (notes lost text silently; the panel never says where the task lives; two people concepts unnamed; the To-buy suggestion reads cleanly).

## Step 12 · Reference

**Where you are:** `/notes`, `/lists`, meals and contacts, from the More menu.
**Why it exists:** Notes, lists, meals and people are the context tasks lean on. They live close so you do not leave the app to find them.
**Do this:** Open each one and look for the item you attached in the previous step.
**You'll see:** The same note, list and person reachable from here and from the task.
**Status:** pending
**Agent notes:** C9–C13 (a saved note does not appear until reload; contacts and lists create flows read cleanly; menu labels differ from page titles).

## Step 13 · Settings

**Where you are:** Settings, from the More menu.
**Why it exists:** Your calendar, your household and your life areas shape every other page.
**Do this:** Connect a calendar, check the household members, review life areas, and find sign out.
**You'll see:** Calendar events on Today once connected, and the people you named in step 0.
**Status:** pending
**Agent notes:** C15–C18 (Settings opens with artwork; a raw database error under School mail; no Life areas section; calendar tab reads cleanly).

## Step 14 · On your phone

**Where you are:** The same app at phone width.
**Why it exists:** Capture and Today happen away from the desk. The phone carries the same path.
**Do this:** Walk Today, capture, inbox and the week on the phone.
**You'll see:** The same pages fitting the narrow screen, with nothing cut off.
**Status:** pending
**Agent notes:** C-P1–C-P8 (an unlabeled Sign out in the header; the ladder and reference pages unreachable by tab; the Planning sheet reads cleanly).

## Step 15 · The kitchen wall (optional)

**Where you are:** The wall view, on a shared screen.
**Why it exists:** The family should see the day without signing in.
**Do this:** Open the wall and look for today's events, meals and each person's lane.
**You'll see:** The household's day, readable from across the room.
**Status:** pending
**Agent notes:** C21 (renders signed in; header count disagrees with the Due-today card; not seen signed out).
