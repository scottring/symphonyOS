# Guided planning sessions (2026-11-01)

Scott, 2026-11-01. Mockup: https://claude.ai/artifact/1znmH4SRnmRHrHbFMTAAeb
("looks pretty great"; the "One page, two moments" section was added at his
request and he asked for this design after seeing it).

Supersedes, where they conflict:
[2026-10-19 plan from the level above](2026-10-19-plan-from-the-level-above-design.md)
(what the Plan button opens, Looking back as a separate card, Today's plan/review
flows) and the "two ways to plan" note in
[the horizon strip](../../planning/2026-10-25-horizon-strip.md) (the strip stays;
the ritual becomes this session).

## Status (2026-11-01)

Built on branch `claude/guided-planning-design`; **not deployed**. The old
planning walks and flows (PlanWeekFlow, TodayFlow modes, "Plan this season with
me", Plan my day / Review my day, Help me plan the week) are retired.

### Deviations from this spec (rulings recorded while building)

- **Unfinished-session closing writes happen at the next session's Look back**,
  not at rollover: `useWeekRollover` does not handle leftovers.
- **"Gone" is "Let go"** everywhere (Inbox included). It moves the item to
  Someday and is undoable; it does not delete.
- **Season look-back verbs:** Carry / Table (to Someday) / Let go (ends only the
  season commitment; the goal stays on the year) / Done. Year look-back is Carry
  / Table / Let go / Done too; Month matches.
- **Marking a period planned:** only choosing-step applies count (placement
  writes on the Week's choose step; Done on Day's choose step), not any write.
- **Overlap rule (Year refine):** two goals pair only on 2+ shared meaningful
  words or full containment; numbers never count. Fewer false pairs, a few
  missed. "Keep both" is remembered in the year's notes.
- **Ideal week and wild cards (Season):** stored in the season's planning notes;
  the ideal-week type and hours helpers live in `src/lib/guide/idealWeek.ts`.
- **Weekly ops copy** mentions bedtimes, but there is no bedtime control; the
  guide sorts what Scott says.
- **Explanations** (`more` copy) never name specific goals, tasks, people or
  times, even as examples (the never-supply rule).
- **Calendar paging:** `google-calendar-events` now follows `nextPageToken`
  (cap 10 pages); this needs the function deployed.

### Deploy order

1. Apply migration `20261101130000_guided_planning.sql`.
2. Deploy the `symphony-agent` and `google-calendar-events` edge functions.
3. Then deploy the app.

The app reads `expires_at` and `goal_areas.context`, and the function reads
`goal_areas.context`; the app or function must not go first.

## Intent

Symphony should walk Scott through Sarah Hart-Unger's nested goal-setting
process at all five horizons (Year, Season, Month, Week, Day), *inside the real
pages*, with a guide that:

1. **explains each step while he is doing it**: why the step exists, what he
   does in it, and what the guide will do with what he says; and
2. **structures what he says, never supplies it**: it files each thing at the
   right level, under the right goal and life area, on the right date, and asks
   when something is unclear. It never proposes a goal, task or idea of its own
   (standing rule: talk structures, never supplies).

Why: Symphony already has the skeleton (five nested levels, each planned from
the level above, look-back first, carry-forward decisions), but most of what
the method does at each level isn't built, and nothing teaches the method
while you use it. Scott wants to *learn and run the process in the app*, not
read about it elsewhere.

## Decisions Scott made

- **Mimic the full process** at all five levels, using the method's steps.
- **Full AI guidance for structuring, not for dreaming.** The guide sorts and
  asks; it never fills an empty area, suggests a goal, or proposes a task.
- **Explained in the UI while doing it**, step by step.
- **One path.** The guided session *replaces* what the Plan button opens today
  (Looking back → Choose from the level above → Give them a day, and Today's
  Plan today / Review today). There is no second, lighter planning ritual.
- **Layout as mocked:** steps on the left, the page being planned in the
  middle, the guide beside it; a change card with Apply; questions inline.
- **No duality** between planning and everyday views (raised by Scott;
  answered by "one page, two moments" below).
- **Session notes are private to their author** (review notes, energy, vision,
  landscape, ideal week, weekend note). Anything meant for the family is a
  Family item, not a note. (2026-11-01, after the builder check.)
- **"Planned" is per person.** Iris finishing her week does not mark Scott's
  week planned or stop his nudge.
- **Naming:** Health, Money, Fun… are **life areas**. Work / Family / Personal
  stop being called "Life area" in the UI and are called **spaces**.
- **"Tell the family" posts only what Scott says to mention**, as a wall
  scratchpad note that lasts the week. No guide-written summary.

## Goals

- Each level's session follows the method's steps, in order, with a time
  estimate per step and the whole session's expected length.
- Every step shows, in plain words: **Why** (what this step is for), **You**
  (what you do), **Guide** (what the guide does with what you say). An
  **Explain more** opens a longer note with an example.
- What Scott says (typed or spoken) becomes a change card that places each item:
  level/period, life area, parent goal (the line it sits under), day/time when
  given. Apply writes it. Anything ambiguous comes back as a question on the
  card, not a guess.
- The page in the middle is the *real* page for that period and fills in as
  cards are applied.
- The method's missing pieces get a home: life areas, energy check, ideal-week
  fit test, 12-month landscape, 5–10 year vision, season wild cards, month
  maintenance and fun, week ops, telling the family, day habits, and the counts
  (about 15 tasks a week, 3–5 a day).

## Non-goals

- The guide does not generate goals, tasks, ideas, meal plans, workouts or
  "suggestions" of any kind. (Meal *slots* can still be filled by the existing
  meal tools if Scott asks for them there; the session doesn't.)
- No change to the five levels, to nested commitments (`task_commitments`), or
  to how a task's "planned for" works (2026-10-19 rule holds: planning changes
  *when*, never *what it's for*).
- No change to the wall/kiosk beyond what "Tell the family" posts.
- Seasons stay four per year (see Open for Scott).
- Not a replacement for the vault's /year, /season, /monthly, /weekly skills;
  those keep running separately.

## Anti-goals (failure even if it works)

- **A wizard.** North Star (2026-10-14): "see it, say it, it happens; no
  forms, wizards or modes." So: no step is required, any step can be skipped or
  jumped to, Leave works at any moment and keeps everything applied, nothing
  blocks on a field, and the page never disappears behind a session screen.
- **The guide supplying content.** If it ever says "you could add…", "how about…",
  or fills an empty area, it has failed. Empty areas are pointed out, never filled.
- **Two of anything.** Two conversations, two left rails, or two versions of a
  page (planning vs everyday) is the confusion Scott named.
- **Generated explanations that drift.** The step explanations are the method;
  they must read the same every time.
- **Privacy leaks via new structures.** Life areas, notes and counts must follow
  the same domain rules as tasks.

## One page, two moments

During a session exactly three things change, and nothing else:

| Part | Every day | While planning |
|---|---|---|
| Left side | The horizon strip (no day yet, routines, the level above) | The steps rail. The strip's lists appear *inside* the steps that use them (November's lines in "Read November", routines in "Weekly ops"). The strip returns on Leave. |
| The page | The normal page for the period | The same page and items; planning only adds to it. A one-line session bar under the title: "Planning the week · step 5 of 7 · Leave". |
| Conversation | The docked bar, small | The same bar and thread, opened beside the page with the current step's header on top. What was said Sunday is still there Tuesday. |

What only a session creates gets a permanent everyday home:

- The period's **line under the title**: "Planned Sun · energy: medium · looked
  back" (each part taps open to its note).
- **Ideal week**: a section on the Season page.
- **Vision and 12-month landscape**: sections on the Year page.
- **Life areas**: grouping/labels on Year, Season and Month lists.

## The session frame (shared by all five levels)

- **Entry**: the Plan button on each page (`?plan=1`, as today). Also offered by
  the existing rhythm nudge when the period turns over.
- **Steps rail**: numbered steps with time estimates; done ✓, current
  highlighted, skipped marked. Tapping a step that isn't current shows its
  explanation in the guide header with "Go to this step" / "Back to step N".
- **Guide header**: "Step N of M", title, Why / You / Guide, buttons
  Explain more · Skip this step · Next step.
- **Conversation**: the shell's existing conversation bar in panel mode, scoped
  to the step (see Guide behaviour).
- **Resume**: the session remembers the current step and which steps were
  done or skipped, per person per period, so leaving and coming back resumes.
- **Its own conversation**: each session (person × period) has its own saved
  chat thread, linked from the session row; resuming reopens that thread, not
  whatever the bar was last used for. The agent sees the session's whole thread
  plus the current step's context.
- **When it counts as planned**: the period is planned *for this person* once
  anything has been applied at that level's choosing step (Week 5, Day 4,
  Month 5, Season 5, Year 5). The closing writes (e.g. week leftovers back to
  the month) run on "Done planning" or, if the session is never finished, at
  the period's existing rollover.
- **Finish**: the last step's Next becomes "Done planning {period}", which
  stamps the period as planned (the existing `savedAt` meaning) and runs the
  existing closing writes (e.g. week leftovers back to the month).
- **Phone**: the steps rail becomes a horizontal row of step chips above the
  page; the guide becomes a sheet over the bottom of the page that can be
  pulled up. The page stays underneath.

## Guide behaviour

- **Explanations are authored copy**, not model output: a fixed table of
  steps × {title, time, why, you, guide, more}. The mockup's text is the first
  draft (see the mockup's data for all 32 steps).
- **The model only sorts and asks.** Each turn sends the agent the level, period,
  current step id, what that step is allowed to write, and the page's current
  structure (the level above's lines, life areas, the period's items, fixed
  calendar). It returns a change set rendered as the existing change card.
- **Per-step allowed writes** keep the model inside the step: e.g. "Clear the
  inbox" may only file Inbox items; "Ideal week" may only write ideal-week
  blocks; "Choose this week's tasks" may create/commit tasks to this week under
  a line. Anything outside is answered with a question or deferred to the step
  where it belongs ("That's a meal; I'll hold it for Weekly ops").
- **Questions, not guesses**: no clear parent goal, no day for something that
  sounds dated, habit vs goal, booking vs attending, a clash with a fixed time.
  The card shows the question on that row; Apply writes the rest.
- **Pointing out gaps is allowed; filling them is not.** "Fun has nothing in it
  yet. Anything there, or leave it empty?" is right. Naming a possible fun goal
  is wrong.
- **Counts** are stated, not enforced: "That's 14 of about 15." Day: "3 of 3–5."
  A count covers exactly the items rendered on the page under the current
  space filter (same filter for items and counts).
- Nothing writes without Apply.

## The five sessions

Steps are the method's, in order. "Reads" is what the step shows; "Writes" is
what Apply may change. Existing pieces are reused as step bodies where named.

### Week (about an hour) — build first

| # | Step | Reads | Writes |
|---|---|---|---|
| 1 | Look back at last week | last week's done/open (today's Looking back) | review notes (went well / didn't); per loose end: move to this week, break smaller, hand off (assign), drop |
| 2 | Read November | the month's lines with what's planned under each | nothing |
| 3 | Calendar check | the week's days and fixed events; overlaps and back-to-backs flagged | event changes Scott states |
| 4 | Clear the inbox | Inbox captures | file each: this week, later, gone |
| 5 | Choose this week's tasks | month lines + "Not under a line" (today's Choose step) | tasks committed to the week under a line; count toward ~15 |
| 6 | Weekly ops | meal plan, routines for the week, weekend | meals onto the meal plan, workouts onto days, a weekend note |
| 7 | Tell the family | the week's Family items, for reference | a wall scratchpad note holding only what Scott says to mention, kept for the week; nothing generated |

"Give them a day" (today's step 2) folds into step 5 and the page itself: tasks
can be given a day as they're chosen, or dragged on the page.

"Hand off" uses existing assignment; assignment is not permission.

### Day (10–15 minutes) — morning, or the evening before for tomorrow

| # | Step | Reads | Writes |
|---|---|---|---|
| 1 | Look back at yesterday | unfinished items from the day before | today / back to the week / done; one-line win (today's day review) |
| 2 | Today's calendar | the day as a timeline with details | nothing |
| 3 | Energy | | energy note (high / medium / low + optional words) |
| 4 | Pick 3 to 5 | this week's tasks with no day, grouped by goal; free time on the timeline | tasks onto today, with a time when said; count toward 3–5 |
| 5 | Habits | today's routines | nothing (ticked through the day as now) |

This replaces Plan today and Review today. In the evening the session plans
*tomorrow*, and its step 1 is today.

### Month (under two hours)

| # | Step | Reads | Writes |
|---|---|---|---|
| 1 | Fresh start | | the month's scenery choice (the app's look only; the wall keeps its own) |
| 2 | Look back at last month | last month's done/open | review notes; per open line: carry, back to the season, drop |
| 3 | Read the season list | season goals with progress | nothing |
| 4 | Next 4–5 weeks | fixed dates week by week | events Scott names |
| 5 | Month by area | season goals beside the month list | month lines under season goals, by area |
| 6 | Maintenance and fun | monthly routines due | lines under Fun; routine tweaks Scott states |

The energy check the method lists for the month is folded into step 2's notes
(my call; see below).

### Season (about half a day)

| # | Step | Reads | Writes |
|---|---|---|---|
| 1 | Look back at last season | open season goals | review notes; per goal: carry, table (Someday), drop |
| 2 | Choose from the year | year goals + Someday | season goals linked to year goals |
| 3 | Season calendar | the season's fixed dates | events Scott names |
| 4 | Energy check | | energy note for the season |
| 5 | Season goals by area | | season goals by area, under year goals |
| 6 | Ideal week | the season's goals | ideal-week blocks (base commitments and per-goal time); shows hours left of 168 |
| 7 | Wild cards | | lines under goals or months (money, childcare/camps, travel, house) |

### Year (one or two days)

| # | Step | Reads | Writes |
|---|---|---|---|
| 1 | Look back at last year | last year's goals, done/open | review notes; per goal: carry, Someday, drop |
| 2 | Picture 5–10 years out | | vision note in Scott's words |
| 3 | Map the 12 months | | landscape entries by month; real calendar events when a date is exact |
| 4 | Choose life areas | existing areas | areas (3–8), each inside a domain |
| 5 | Brain dump goals | | year goals by area, unfiltered |
| 6 | Refine the list | the dump; overlaps flagged | keep, merge, Someday |
| 7 | Share and book the next session | | shared goals moved to Family; the first season session put on the calendar |

## New things to store

- **Life areas**: a named area inside one space (Work, Family or Personal);
  Family areas are household-wide, Work/Personal areas belong to one person.
  Tasks get an optional area (all levels; only Year, Season and Month group by
  it). Visibility follows the space exactly: a Personal area is never visible to
  another member, even by name. The legacy `goal_areas` table (per user, no
  space, used by `goals.area_id`) is folded in: the builder checks whether it
  is still live, then either extends it (add space, household sharing) or
  migrates its rows into the new structure. Until Stage 3 ships, a change
  card's area field is the space. Needs RLS verified with two real accounts
  (CLAUDE.md).
- **Renaming spaces**: every UI label that calls Work/Family/Personal a "Life
  area" (Inbox triage, the new-line picker, the top filter) becomes "Space".
- **Session state and notes**: per person and period. Today `planning_sessions`
  rows are readable and editable by every household member (2026-06-08
  migration; `usePlanningSession`'s comments rely on it), and a period saved by
  either member reads as planned for both. Both must change: session notes are
  private to their author, and "planned" is read from the person's own row.
  The builder checks the *live* policies first, then either tightens
  `planning_sessions` or moves private notes to a new author-only table, and
  updates `usePlanningSession` / `usePeriodReview` accordingly. Stored: current
  step, done/skipped steps, the chat thread link, energy note, vision note,
  landscape entries, ideal-week blocks, weekend note, and the review notes.
  Read-first-then-merge (as `usePeriodReview` does) so no writer clobbers
  another's keys.
- **Day horizon**: the `daily` horizon already exists for the day review.

## What's reused vs replaced

- Reused as step bodies: Looking back (`LookingBack`), Choose (`ChoosePlan`),
  the day picture from `TodayFlow`, the change card (`ChangeCard`), the
  conversation bar (`ConversationStrip` panel mode), the horizon strip's tab
  contents, `useChooseWeek` / `useDeckActions` writers, `task_commitments`.
- Replaced as entry flows: `PlanWeekFlow`, the `ConstellationPage` plan mode,
  `TodayFlow` as a separate Plan today / Review today mode, the
  "Plan this season with me" conversation walk. Their removal happens in the
  stage that replaces each one, not before.

## Calls I made (Scott to check)

- **Life areas live inside the three spaces** rather than replacing them,
  because spaces are the privacy and sharing unit.
- **Counts are shown, never enforced.**
- **Explanations are fixed written copy**; only sorting/asking uses the model.
- **Month's energy check folds into its look-back**, to keep Month at six steps.
- **Week first**, then Day, then life areas + Month, then Season, then Year.
- **Day can run the evening before** for tomorrow, replacing Review today.
- **One session per person per period.** If Iris plans the same week, she
  runs her own session over the same shared Family items.
- **Each session keeps its own chat thread** (builder check, settled).
- **Planned once the choosing step has an applied card**; closing writes at
  Done planning or the period's rollover (builder check, settled).
- **Fresh start changes the app's scenery only**, not the wall.

## Stages

1. **Session frame + Week.** Steps rail, guide header, step-scoped
   conversation with per-step allowed writes, resume, Leave, the one-line
   period summary, the ~15 count. Plan on Week opens it.
2. **Day.** Replaces Plan today / Review today.
3. **Life areas + Month.**
4. **Season**, including energy and ideal week (and its Season page section).
5. **Year**, including vision, landscape and areas step (and Year page sections).

Each stage ships on its own, behind the Plan button of its level only.

## Verification

- Unit: the step machine (current/done/skipped/resume), per-step allowed writes,
  counts.
- Agent bench (`symphony-conversation-bench`): cases where Scott is vague or
  says "I don't know what to do for fun" must produce a question and **no**
  invented item; cases with a clash or a missing day must produce a question
  on the right row.
- Privacy: life areas and session notes checked with two real household
  accounts, Personal and Work invisible to the other member.
- Visual: each stage checked on desktop and a narrow phone, light and dark, in
  the scenery theme.

## Left to the builder

- Component structure, file layout, and how the conversation bar's panel mode
  hosts the step header (not yet checked whether it can without real changes;
  check first).
- The exact agent prompt and change-set ops per step, within the rules above.
- The phone sheet's mechanics.
- Final wording of the step copy, starting from the mockup's.


## Open for Scott

- **Seasons: stay at four, or allow 3–6** as the method does? Design assumes
  four; only Stage 4 depends on it.
