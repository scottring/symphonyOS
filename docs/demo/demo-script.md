# Symphony OS — Live Demo Script

**The story you're telling:** *Life throws information at you all day. Symphony catches it in
two seconds, files it into one calm plan, and hands it back at exactly the right moment —
with everything you need to act already attached.*

Demo account: `symphonygoals@gmail.com` ("Alex" — partner Edith, kids Liam & Mia).
Full run: **~10 minutes.** Short version at the bottom: **3 minutes.**

---

## Pre-flight (10 minutes before)

1. **Reseed the world** (rebuilds every page with fresh, run-day dates — do this every time,
   it also un-checks everything you completed in the last demo):
   ```bash
   node scripts/seed-demo.mjs
   ```
2. **Demo in Chrome, not the Mac app** — external links (the paint-swatch beat) don't open
   from the Mac app's webview yet.
3. **Sign in** at `app.symphony-os.com` as `symphonygoals@gmail.com` (your demo password).
   Use a clean Chrome profile or window — no personal tabs visible.
4. **Assignee filter → Everyone.** On Today, tap the people icon in the header and select
   Everyone. (Default is "my tasks", which hides Edith's and unassigned items.)
5. **Fresh AI audit.** If you've demoed on this browser before, clear the cached audit in
   DevTools console so the season-audit beat runs live:
   ```js
   localStorage.removeItem('symphony.benchAudit.v1'); localStorage.removeItem('symphony.benchAudit.slate.v1')
   ```
6. **Domain switcher on Family.** Top-right of Today. The Work reveal in Act 2 depends on
   starting here.
7. Glance at Today and This Season — 30 seconds to confirm both look like the screenshots
   you remember. If Today looks thin, you skipped step 1.

**Do NOT demo:** Google Calendar (not connected on this account), iOS photo capture
(phone-only — it's a talk-track line), Settings.

---

## Act 1 — The hook: capture in two seconds *(1 min)*

Start on **Today**.

> **SAY:** "This is Symphony — an operating system for work, life, and family. Every tool
> like this dies the same death: capturing a thought takes so long you stop doing it.
> So watch the whole capture flow."

**DO:** Hit the green **+** (or `⌘K`), type **"call the roofer about the gutters"**, enter.
Done. Point at the Inbox count ticking up.

> **SAY:** "No date, no category, no form. Two seconds, back to your life. Sorting comes
> later, when *you* have a minute — and you'll see how fast that is too."

---

## Act 2 — Today: your day, assembled for you *(2.5 min)*

> **SAY:** "This is the only page you *have* to live on. Symphony assembles it: timed tasks,
> family routines, and what's next."

**DO — the Up Next hero:** Point at **"Pick the kitchen paint: Quiet Moments vs. Stonington Gray"**.
Open it.

> **SAY:** "Here's the whole idea of Symphony in one card. When I planned this on Sunday I
> attached the two paint links and a note — 'swatches are taped by the window, check them in
> afternoon light.' Tonight when this surfaces, I don't go digging through texts and browser
> tabs. **You plan once, with context — it comes back to you with context.**"

**DO:** Show the notes, the two links, the *Kitchen renovation* project chip. Close.

**DO — the phone number:** Point at **"Call Dr. Patel — Mia's camp forms"** — contact chip,
phone number right on the task, note says the office closes at 4:30.

> **SAY:** "The number is *on the task*. Standing in a hallway with 90 seconds between
> meetings, that's the difference between making the call and not."

**DO — family layer:** Point at the **Morning reset** routine (expand it — three steps),
and **Trash + recycling** at 7 PM — assigned to Liam, age 9.

> **SAY:** "Routines are first-class, and kids are first-class. Liam sees his own job. This
> also runs on a touchscreen in our kitchen — the family sees the day without opening a laptop."

**DO — domains:** Flip the domain switcher to **Work** → the launch-copy task and Website
relaunch appear; everything family vanishes. Flip back to **Family**.

> **SAY:** "One brain, three lives — Work, Personal, Family — one system, walls between them
> when you want walls."

---

## Act 3 — Triage: inbox zero in 30 seconds *(1.5 min)*

**DO:** Open **Inbox** (5 raw thoughts, including your gutters capture).

> **SAY:** "Here's the sorting I deferred. Watch the speed."

**DO:** Triage three items with the inline icons — two taps each:
- **"gutters???"** → When: *Next week* · Context: *Family*
- **"mia swim lessons — tuesdays?"** → Assign: *Edith* → When: *Next week*
- **"that pizza place Dan mentioned"** → *Someday*

> **SAY:** "Nothing fell on the floor, and it cost me thirty seconds standing in line for
> coffee. Someday is a real shelf here — reviewed on a rhythm, not a graveyard."

---

## Act 4 — The planning spine: Five Horizons *(3 min — the wow)*

**DO:** Open **This Year** in the sidebar. Four goals in four life areas.

> **SAY:** "Planning has altitude. The year is *direction* — four goals, not forty."

**DO:** Open **This Season**. Give it a beat of silence — the page sells itself.

**DO:** Click **"What is this level?"** and let the animated explainer play a scene or two.

> **SAY:** "Every level teaches itself — goals become seasonal **picks**, picks become
> monthly **moves**. But here's the part I'm proudest of…"

**DO:** Walk the spread:
- **Eight slots.** Three picks with goal chips, the rest open. "The cap is the design. A
  season is about twelve weekends — the empty slots are the system telling you how much
  life actually fits."
- **Won this season** — *Winter vacation booked*. "Wins free their slot mid-season. The
  scoreboard fills as the season goes."
- **Months rail** — July's 8 moves, threaded to the picks above.

**DO — the money moment:** Expand **On the bench (5)** → hit **Audit the bench**. While the
AI runs (~10s), narrate:

> **SAY:** "The bench is everything you *didn't* pick — and the AI audits it like a coach.
> It's about to tell me which of these are real season outcomes, which are vague wishes,
> and which are secretly month-sized errands."

**DO:** Results land — show a verdict or two (*"Be more organized"* gets called out as
vague; something gets a sharper rewrite). Apply one rewrite with one tap. Show the
**recommended slate** ("here's the 8 it would pick").

> **SAY:** "Every productivity app takes whatever you type. This one **pushes back.**"

**DO (quick):** Click JUL in the rail → **This Month** moves list → glance at **This Week**'s
grid. "Season picks → month moves → week placements → the Today page you started on. It's
one connected spine, not five separate lists."

---

## Act 5 — Family systems: meals, lists, projects *(2 min)*

**DO:** Open **Meals**. This week's dinners are planned — fajitas, leftovers night, Friday
pizza night.

**DO:** In the **Plan with AI** pane, type: *"swap Thursday for something 20 minutes and
kid-friendly"* → it edits the week live. Then point at **Build shopping list**.

> **SAY:** "The 5 PM 'what's for dinner' panic, solved on Sunday in three minutes. And the
> plan feeds the grocery list."

**DO:** Open **Lists** → **Groceries** (family-shared) and **Cabin packing list** — attached
to the *Cabin weekend* trip project.

**DO:** Open **Projects** → **Kitchen renovation**. Decision log in the notes (counter
depth, the floor choice), links, Mike the contractor's number at the project level, tasks
beneath.

> **SAY:** "A project is a *context container*. Every decision, link, and phone number about
> the kitchen lives in the kitchen — and flows down to its tasks. Tonight's paint task on
> Today? It came from here."

---

## Act 6 — Close the loop *(30 sec)*

**DO:** Go back to **This Season**. Click the empty line under "This season is about" and
type, slowly: **"A summer outside, with the house finally working for us."**

> **SAY:** "Every level lets you say — in one sentence — what it's *for*. That's the real
> product: not a task list, a system that keeps your days pointed at your life."

**DO:** Return to **Today** for the last line.

> **SAY:** "And it all lands back here. On my phone I can point the camera at a school flyer
> and it becomes a task with the details pulled out; in the kitchen it's on the wall. **The
> right thing, at the right time, with everything you need attached.** That's Symphony."

---

## The 3-minute espresso version

1. **Capture** (30s): `⌘K` → "call the roofer" → Inbox. "Two seconds, zero friction."
2. **Today + context** (60s): Up Next paint card → open it → links + notes. "Plan once with
   context; it comes back with context." Point at Dr. Patel's phone number.
3. **Season + audit** (90s): This Season → the spread ("the cap is the design") → Audit the
   bench → one verdict + rewrite. "It pushes back." Done.

---

## If something goes sideways

- **A page looks empty** → you're filtered: check the domain switcher (Family) and the
  assignee filter (Everyone). This is the #1 demo-killer.
- **Audit spinner runs long** → keep narrating the bench concept; verdicts cache the moment
  they land, so it never re-runs twice in one demo.
- **Explainer doesn't auto-open** → it only auto-opens on first visit; the
  "What is this level?" link always works. Use the link.
- **Anything AI fails outright** → "the coach is thinking hard today" → move on; the spread,
  slots, and won-section carry Act 4 on their own.
- **You completed things mid-demo** → fine — that's the point. Reseed before the next run.
