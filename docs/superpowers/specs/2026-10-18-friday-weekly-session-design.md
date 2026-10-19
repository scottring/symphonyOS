# The Friday session: weekly review and plan, one card at a time

**Date:** 2026-10-18
**Status:** Approved by Scott 2026-10-18 (revision 2 governs where it conflicts with the original sections)
**Author:** Scott + Claude (brainstorm, 2026-10-18)

## Revision 2 (2026-10-18, later): five steps, one deck, a default that drains

Scott asked whether this design was "just adding new functionality on top of old
without addressing the root cause." Partly, yes: each concern had become another
step, and nothing decided what happens to things nobody touches, so the pile
regrows weekly and every review gets longer (the GTD failure). **This revision
supersedes the step list, Settle in, Inbox, Look back, From the month, No day yet,
Meals, Money and the top 3 below where they conflict.** Everything else stands.

**The session is five steps:** Talk (check-ins and saved topics on one screen,
then topic cards) · Wins · **The deck** · The week · Close.

**The deck** is one run of cards for everything without a home this week: tasks
on this week with no day, last week's open commitments, and Inbox captures,
closest first. Same card every time: what it serves (`For October · …`), title,
one line of facts, and **Done · This week · Later · Let go**. This week opens the
week strip; Later opens Next week, This month, Next month, This season, Someday,
and Pick a date. Dealt in hands of 5. After each hand, "That's enough for this
week" is primary.

**The default that drains (the root-cause fix):**
- When the deck is finished or stopped, last week's open commitments that weren't
  dealt **go to Later on their own**. The Inbox keeps its undealt captures (it's
  the Inbox). Nothing silently carries into the new week.
- Anything carried or sitting in the Inbox **untouched for 3+ weeks moves to Later
  before the session opens** and never gets a card. The deck's intro says so as one
  fact ("4 older things, untouched for 3+ weeks, already went to Later · See them").
- "Later" is the existing Someday list unless the builder finds a better existing
  home. It must be recoverable and searchable, never deleted. The thresholds are
  settings with these defaults.

**The week:** the coming week as three cards (Saturday, Sunday, Monday to Friday),
showing what was placed during the deck, who's on each item, clashes, and dinners
from the meal plan. **One way to mark importance: the priority mark** (tap any item).
The top 3 is dropped.

**Close:** priorities, the weekend at a glance, wins, and "N things are in Later".

**The Week page is in this first build** (Scott, 2026-10-18). Landing on today's
Week page after a calm session undoes it: it opens on "This past weekend · Not
done…", gives routines, repeats, tasks and events equal weight (Today showed nine
rows), repeats the same pickups four days running, and ends on a "No day yet"
list. The Week page follows the same rules as the session:
- **Open with progress, never the undone list.** The "This past weekend · Not
  done: …" banner goes. Once a review has run, those items are decided. Before it
  runs, one quiet line ("9 done last week · Review") links to the deck.
- **Repeats show once.** Routines and same-time repeating tasks fold into the
  existing "Every day / Weekdays" line at the top ("Weekdays · 5:15 Pick up from
  FFG · 5:45 Home from school"), not into every column. Each still ticks off on its
  day, from Today and the wall.
- **Each day shows a few things, priorities first**, then fixed events, then tasks.
  Past about 4 items the rest fold into "+N more", which opens that day.
- **"No day yet" is a count, not a list:** "4 without a day · Place them" opens the
  deck with just those cards.
- **The session ends on Close, then lands on Today**, not on the full week.
- **Events never fold.** Anything with a time always shows. Only untimed tasks fold
  into "+N more".
- **The weekend gets more room.** Saturday and Sunday are wider columns. Weekdays
  stay slim. This follows `weekStartsOn`: the first two days of the week.
- **Narrow screens stack days**, today first, each day following the same rules.
  Seven columns only where they fit (landscape iPad, desktop).
- **Names only when it isn't yours:** an assignee shows when the item belongs to
  someone other than the viewer (or to more than one person).

**Build in stages, each usable on its own** (Scott approved 2026-10-18):
1. **The Week page, the deck, and the drain default.** Calms the daily view even
   without a Friday session. Includes restoring the stamp and the four-choice cards
   with the week strip, and "N without a day · Place them".
2. **The Friday session around it:** Start (family/solo/Quick), Talk, Wins, Close,
   the scenery room, the shared-screen person toggle, the household session record,
   and signing in on the wall.
3. **Month, Season and Year as two screens** (carry forward or not, then the new
   list with the level above beside it).
4. **The priority mark** on tasks and events.


**Meals and Money** are not steps. Dinners show in The week from the meal plan;
the meal drop-in and Monarch remain separate pieces.

**Month, Season and Year: two screens.** (1) **Carry forward or not:** one card
per open line, with Done · To {next period} · Someday · Let go, and what each serves
shown above the title. (2) **The new list:** a plain list to write, with the level
above **beside it to look at, not to act on** (this repository's `CLAUDE.md`: "a
month is a plain list written with its season beside it"). The tile screen ("From
the month") is withdrawn for these horizons. In the Friday session, goals from the
month appear only as the `For October · …` line on cards.

Prototype: `friday-session-prototype-v15.html` (with a Month mode).


## Week page, calm pass 2 (Scott approved the mockup 2026-10-18)

Stage 1's rules ran correctly on real data, but the page was still busy (Scott's preview screenshot, week of Oct 17–23). Approved mockup: `week-page-calm-v2.html`.
- **Header: six things become two.**
  - The title row is "‹ Oct 17 – 23 ›".
  - One quiet fact line sits under it: "{n} done last week · reviewed {Weekday} · Today: {first item}", or "· Review" while it isn't reviewed.
  - One primary button, **Plan this week**, opens the deck.
  - A **⋯** menu holds: Show free time, Show weather, Show done, Show daily routines in each day, How this page works (the ?), and Watch the guide (the ▷).
  - Removed from the Week page: "Help me plan the rest of my week" (the Chat bar does that) and "I'm happy with this week". Finishing the full deck now marks the week planned.
- **Repeats fold even with exceptions.** A task or routine with the same title, time and people on at least 3 of the week's weekdays folds into the band once, labelled with its days ("Mon–Thu", or "Mon, Wed, Fri"). The Every day / Weekdays lines and these merge into one quiet band.
- **Each day shows calendar events plus at most two tasks** (timed or not, routines included), then "+N more". Only calendar events always show.
- **Free time ("Calendar clear …") and weather are off by default.** Each can be turned on from ⋯ and is remembered per device. Class chips stay as one small line under the date.


## Drag to order replaces the priority mark (Scott, 2026-10-18)

With each day showing two tasks, **the order is the priority**. Scott drags the tasks that matter to the top, and the rest fold behind "+N more". This replaces Stage 4's tap-to-mark priority, so there is only one way to say "this matters".
- **Which tasks:** tasks reorder within a day on the Week page by drag on desktop, and by press and hold then drag on touch (the iPad and the wall).
- **Events never move:** calendar events stay in time order.
- **Moving between days** works as it does today.
- **One shared order:** it uses the existing `tasks.sort_order` (`Task.sortOrder`) and its writers (`reorderTasksToIndex` and `updateTaskOrders`, with gap 1000), so Today's All Day list and the wall's untimed list follow the same order.
- **How a Week column sorts tasks:** by `sortOrder` (nulls last), then time, then title. The fold shows the top two, so dragging a timed task above an untimed one puts it in view.
- **Today keeps its time sections** for timed tasks.
- **Every reorder has Undo**, through the canvas activity.


## Month, Season and Year, calm pass (Scott approved the mockup 2026-10-18)

The Month, Season and Year pages follow the Week page's language (mockup `horizons-calm.html`).
- **Header: seven things become two.**
  - Title "‹ October 2026 ›".
  - One quiet fact line: Month "{open} open · {done} done · planned {date}"; Season "{range} · {n} goals · {done} done"; Year "{n} goals".
  - **One primary button that changes with the moment:** "Review {previous}" while that review is due, otherwise "Plan {next}" while planning is open, otherwise nothing.
  - **⋯ menu:** Review {previous} (when it isn't the button), Show done, Hide/Show the {level above} list, Start with a goal · guided introduction, Talk it through (only without the Chat bar), How this page works, Watch the guide.
  - **Removed from the header:** "I'm happy with {period}" (the plan flow marks the period planned), the separate "Oct 1 – 31", and the summary sentence.
- **The list never runs off the page.** It is a compact card. The first 8 lines show, then "+N more", which expands in place. Lines reorder by drag:
  - month and season lines use the task's `sortOrder` (one order, as on Week)
  - year goals use `goals.sort_order`
  - every reorder has Undo
  - hover quick triage is unchanged
  - the add box stays at the bottom
- **The level above sits beside it, quieter and read-only:** a lighter card showing 8 then "+N more". A goal with something under it this period is marked "in {period}".
- **Year is a single list.** Each goal notes "In {season}: {n} goals" when it has any.
- **Phones:** the side card stacks below the list.

## Why

Scott and Iris have a weekly planning ritual on paper
(`~/Documents/scotts-world/docs/planning-rhythm-requirements.md`) and the pieces of
it in Symphony: a review by hand (`PeriodReview`), a week planned by conversation
(the v2 talk-first Week), Discussions and the `needsDiscussion` flag, and the meal
planner. Scott's own weekly review lives in Claude Code (`/weekly` on the vault).
Nothing ties them together into one sitting, and none of them starts the way the
ritual should start: two people talking about what matters to them.

The weekly ritual should happen in Symphony as **one session**. It has to be
**stupid simple to follow** and **visually compelling**. Scott's words on the
failure modes:

- Scrolling through endless lists "becomes demoralizing quickly."
- If it "looks/feels like AI slop," it has failed, even if it works.

**Symphony is a content structurer, not a content guide** (Scott, 2026-10-18). The
people bring the content: what they talk about, what they decide, what matters.
Symphony gives it a shape, puts each thing where it belongs, and shows the
structure back. Symphony doesn't coach, pose reflective questions in its own
voice, suggest verdicts or priorities, or tell people what to think about. Every
step below follows that: the screen is a labeled place to put things, and
Symphony's job is sorting what is said into that place.

## What it is

A full-screen session with eight steps. The first three are the two of them
talking; the screen barely does anything. The last five are the logistics,
unhurried by default, with a Quick path.

| # | Step | What's on screen |
|---|------|------------------|
| 1 | **Settle in** | A labeled place for each person's check-in, a word or a line. |
| 2 | **Talk** | The topics either person saved during the week, one card at a time. The conversation is theirs; anything said out loud or typed can be dropped in and Symphony sorts it. |
| 3 | **Wins** | A place for each person's wins; they are kept. |
| 3½ | **Inbox** | Captures waiting to be placed, dealt in small hands, one card at a time, with the Inbox's own when-chips. |
| 4 | **Look back** | Last week's open commitments, one card at a time, with the facts: Done · Carry · Change · Let go. |
| 4½ | **From the month** | The month's list as one screenful of tiles: give one a step this week, or move it along. |
| 5 | **Look ahead** | The coming week, one card per day. The weekend gets full cards; weekdays are light. Ends on the top 3 they name. |
| 6 | **Meals** | The week's dinners (see "Meals" below). |
| 7 | **Money** | Spent this week vs budget (a placeholder card until the Monarch piece exists). |
| 8 | **Close** | The whole week on one card. |

### Two versions, one arc

- **Family session:** Scott and Iris together, planning the household. Shows family
  and shared items only.
- **Solo session:** Scott alone, for work and personal. "Settle in" and "Talk" become
  two quiet journal prompts. Meals and Money are off unless turned on. Look back
  gains the vault summary cards once that piece exists (see "Later pieces"). Those
  cards carry facts from the vault (stuck, overdue, owed), not advice.

The person chooses which session on the first screen. Privacy follows the existing
rules in `CLAUDE.md`: Work and Personal stay private. The family session must never
show a private work item, and a solo session's notes must not be visible to the
other household member.

### When

The session belongs to **the evening before the week starts**, following the
household's week-start setting (`weekStartsOn`, set in
`PlanningRhythmSettings`). For Scott and Iris the week starts Saturday, so the
session is **Friday evening**. If the week start changes, the session moves with it.
Starting it at another time is always allowed.

### Any device

The session must work on the iPad, the kitchen wall and a phone. **iPad in landscape
is the design target**; the others adapt.

## The rules that make it simple

1. **No screen ever scrolls.** If a step has more than fits, it becomes a run of
   cards.
2. **One card at a time** for any list: a stack, with a counter ("2 of 5") and pips
   for the session's progress. Scott chose this over "a screenful at a time."
2b. **Never show the size of the pile** (Scott, 2026-10-18: the problem is "when you
   first look at the list, it's seemingly endlessly long"). Long sources (the Inbox)
   are dealt in hands of 5, closest-first. After each hand the main button is
   "That's enough for this week," and "Deal 5 more" is secondary. Counters count the
   hand ("2 of 5"), never the backlog. Nothing repeats an empty state per item ("Nothing in
   this week yet" × 10 is the anti-pattern, from the current Plan this week screen).
3. **Symphony sorts first.** Only things that need a decision become cards. Things
   already done become a single number ("9 things got done"), never a list.
4. **Facts, not suggestions.** A card shows what's true (planned when, touched or
   not, weeks carried: "Carried 3 weeks") and the choices. No choice is
   preselected or recommended; the people decide.
5. **Drop it in anywhere.** On any step, either person can say or type something
   freely ("we need to fix the gutter before Thanksgiving, Iris is doing Saturday
   pickups"). Symphony sorts it into the right place: a task on a day, an
   assignment, a topic, a win, a note. It shows that as a proposal (the existing
   change card) to approve in one tap. This is the structurer at work.
6. **Quick** on the first screen skips steps 1–3 and runs 4–8 with the same cards.
   Unhurried is the default.
7. **Back is always available**, and every decision has Undo (the existing canvas
   activity Undo).

## Look and feel: the quiet room

Scott chose direction A, **"the quiet room,"** for the opening (mockups:
`.superpowers/brainstorm/24535-1792314030/content/`, not committed):

- Warm and almost empty. One large Crimson Pro heading per step, centered. Headings
  are labels for a place ("This week, between us", "Wins"), not questions
  Symphony asks. DM Sans for
  everything small. A soft, warm background drawn from Symphony's current
  scenery / place-theme / paper-journal language in `src/index.css` (see this
  repository's `CLAUDE.md`), not a new palette.
- Saved topics appear as a small hand of paper cards, slightly fanned, with who
  saved each one and when.
- Steps 4–8 keep the same room. A centered card on the same background, with the
  stack visible behind it, is the one recurring component.

### Not AI slop: the anti-goals

- **No emoji as icons, no sparkles, no generic gradients, no glassy chat bubbles.**
  The mockups used emoji as placeholders; they don't ship.
- **No AI voice anywhere in the session.** Symphony doesn't ask reflective
  questions, summarize what they said, praise them, suggest feelings, or recommend
  what to do. Its only words are labels, facts, and the sorted proposal of what
  they dropped in.
- **No filler copy.** No "Great job!", no "Let's dive in!" Copy is short and plain;
  numbers are real.
- **No fabricated content.** Every card shows real data or an honest empty state.
- **Motion is small and physical:** a card slides off, the next one rises. Nothing
  bounces.

## Steps in detail

### 1. Settle in
A heading and a labeled place per person on the room background. In the family
session, each person adds a word or a line, shown with their name. In the solo
session, one place for Scott. Skippable.

### 2. Talk
The saved topics: tasks and events flagged `needsDiscussion`, plus open Discussions
threads with both people. One card per topic, showing who saved it and when. Each
card offers "Talked about it" (marks it settled), "Not tonight" (leaves it for next
week), and an optional note. Notes on a topic go to its existing Discussions thread.
Whatever comes up that wasn't saved can be dropped in. Symphony sorts it into a
topic, a task, or a note, and shows it as a proposal. If nothing was saved, the
step is an empty place for what they bring.

### 3. Wins
A place for each person's wins, added one at a time, as many as they like. Wins are
kept and viewable later. A wins history view is the builder's call for this piece
(see "Left to the builder").

### 4. Look back
One card per open commitment from the week that is ending: week-bucket tasks still
open and the week's priorities. Each card shows the title, one line of evidence
(planned for when, whether anything happened, how many weeks carried), and the four
verdicts: **Done · Carry · Change · Let go**. The existing `PeriodReview` verbs
(Done · Move on · Someday · Let go) are the data underneath; the card's labels
map onto them.

- Carry moves it into the coming week.
- Change opens a small edit, such as a new title or splitting it into a smaller
  step, then carries it.
- Let go removes or moves it to Someday. Which one is the builder's call, matched to
  the existing verbs.

Above the stack: "N things got done," a single number.

**Every verdict lands with the rubber stamp** (Scott, 2026-10-18), the ink seal
with its words around the rim. Done stamps `done`, Carry and Change stamp
`carried`, Let go stamps `dropped` (or `someday` if it went to Someday). The stamp
thumps on, holds a moment, then the card slides away and the next rises. "Talked
about it" in the Talk step stamps `done` the same way. The component was
`src/components/plan/v2/Stamp.tsx`, removed from main in `3e86d655` (#220).
Restore it from `3e86d655^`. Its styles (`.pv2-stamp`, `pv2-thump`, the four inks,
the night-lighting rule, and reduced motion) are still in `src/index.css`.

### Triage: the existing verbs, on cards

The session uses Symphony's existing triage verbs and writers unchanged (Scott,
2026-10-18: "i worry we're forgetting some functionality (triage)"), each with its
existing Undo and its matching stamp:

- **Inbox step** (after Wins): each capture gets the Inbox's when-chips (Today,
  Tonight, Tomorrow · This week, Next week, This weekend · This month, Next month,
  This season · Someday), Done, and "Pick a date". This is the same gated writer as
  the Inbox (`applyTriageWhen`). Captures not dealt stay in the Inbox. "Leave the
  rest in the Inbox" is always available.
- **Look back:** the verbs become **Done · This week · Later · Let go**. This week
  opens the days (Sat to Fri, or "No day yet"). Later opens Next week, This month,
  Next month, This season, Someday.
- **From the month** (between Look back and Look ahead): the month's open goals as
  one screen of tiles, at most about 8, the rest folded into "+N more on October".
  Tapping a tile opens: a step this week (a typed line that becomes a week task
  serving that goal), **Done · Move to November · Someday · Remove from October**,
  the month row verbs from `0149dd5c` sharing `periodMoves`. Untouched tiles stay
  on the month without comment. A tile that already has a step this week wears a
  quiet "This week" tag.
- **No day yet** (a card run inside Look ahead, before the top 3): each week task
  without a day gets the days, plus Next week, This month, Someday and Done, the
  same as Week's "No day yet" triage (`1f2f4296`). "Leave the rest without a day"
  is always available.

**Every triage card shows the same four buttons and nothing else at first: Done ·
This week · Later · Let go** (Scott, 2026-10-18, on seeing the Inbox's twelve
when-chips on one card: "are you KIDDING"). This week opens **the week strip**: seven small day tiles showing what is already on each day (events and tasks, up to three lines, then "+N more"), plus "No day yet". Tapping a tile places the item there, and it appears in that tile for the rest of the session (Scott, 2026-10-18: "dont' we need to be able to see the week's current commitments?"). Later opens Next week, This month, Next month, This season, Someday and Pick a
date. The month tiles keep their own verbs, but they too sit behind a tap. A card
never shows more than four choices before one is tapped.

Stamps follow the verb: Done → `done`; a day or this week → `carried`; Next month,
This season or Someday → `someday`; Let go or Remove → `dropped`.

### 5. Look ahead
The coming week, starting on the week-start day.

- **Weekend days (the first two days of a Saturday-start week) get full cards**,
  laid out morning, afternoon and evening, with calendar events, kid drop-offs and
  pickups, activities and chores. Each item shows **who's on it**, and can be
  reassigned right there (existing `assignedTo`). Clashes are called out on the card
  ("Two pickups at 10:30").
- **Mark a priority.** Either person can tap any task or event on a Look ahead card
  to mark it a priority, and tap again to unmark it. A priority carries one clear
  mark and sorts first within its day everywhere the day shows (Week, Today, and
  the wall). Symphony never chooses priorities; it only shows the ones people set.
  This is new: nothing on tasks or events holds it today. Calendar events come
  from Google, so the mark is stored on the Symphony side. How it is stored is
  the builder's call, but it must work for both tasks and events and follow the
  same privacy as the item.
- **Weekdays get light cards:** only the fixed commitments (meetings, appointments,
  trips), plus anything unassigned.
- **Last card: the top 3 for the week.** Three empty places. They name them by
  saying or typing, or by tapping something already on screen (a carried item, a
  line from the month's list, shown beside the card for reference, not ranked or
  recommended). The top 3 are saved with the session and shown on the week.

### 6. Meals
In this piece: one card showing the coming week's dinners from the meal planner, or
an empty state with a way to start. The meal plan drop-in is the next piece (see
below).

### 7. Money
In this piece: one card titled "Spent this week vs budget," with an honest empty
state ("Not connected yet") and a link to Monarch. Off by default in the solo
session.

### 8. Close
The whole week on one card: the top 3, the weekend at a glance, the week's fixed
commitments, the dinners, and the wins. One button: **Done**. The session is saved
(see "Where things are saved").

## Where things are saved

- Verdicts, assignments and top-3 changes are ordinary Symphony writes, the same as
  doing them by hand. They go through the existing canvas activity, with its Undo.
- The session record (check-ins, talk notes, wins, top 3, which steps were done) is
  saved in `planning_sessions` (`horizon='weekly'`, the week's period token). **That
  table's select policy is household-shared today**, so solo-session notes need a
  privacy rule before they are stored there. How is the builder's call, but it must
  be verified with real accounts per `CLAUDE.md`.
- The vault copy of the review (`daily/review-YYYY-MM-DD.md`) arrives with the
  Friday background summary (piece 3). Symphony does not write to the vault directly.

## One planning process, not two (Scott, 2026-10-18)

The Week already has its own process: **Review week N** (`?review=1`, `PeriodReview`)
and **Plan this week** (`?plan=1`, `PeriodPlan`, steps: Left from last week · For
{the month} · Anything else · Give them a day), hosted by `WeekV2`. The Friday
session must not build a second one. Instead:

- **Rebuild `PeriodReview` and `PeriodPlan`'s presentation as the card runs in this
  document:** one card at a time, four choices then details, the week strip for
  days, hands of 5, tiles for the level above, stamps, and no repeated empty states.
  Their data, verbs, writers and Undo stay as they are. The current one-page
  version (the screenshot that started this: "For October" as a scrolling list of
  "Nothing in this week yet / + Add") is what's being replaced.
- **The Friday session runs that same process as its planning steps** (Inbox, Look
  back, From the month, No day yet), wrapped in the session's scenery, between the
  conversation steps and Meals/Money/Close. Planning the week on a Tuesday from the
  Week page and on Friday night in the session is the same experience.
- `PeriodReview` and `PeriodPlan` also serve **Month, Season and Year**. The card
  presentation applies there too, so the four horizons stay one process. The tile
  screen ("From the month") is the general form: the level above as tiles.

### The cascade stays visible (Scott, 2026-10-18)

Nothing here changes the nested structure (Year → Season → Month → Week → Day):
the data, verbs and writers are the existing ones, and "From the month" is the
cascade step itself. The card presentation must **not drop the context the current
screens carry**:

- **Every card shows what it serves, one level up**, above its title ("For
  October · Get the house ready for winter"). This is `ReviewLine.note` /
  `PlaceLine.note` today.
- **Every tile of the level above shows what is already under it**, by name ("This
  week: sign the kids up for Coppermine, Nov 3 and 6"), the way `PlanParent.children`
  does today. A goal with nothing under it shows just its name. "Nothing in this
  week yet" is not repeated.
- **A step added from a tile is created under that goal**, through `PlanParent.onAdd`.
  A top-3 item tapped from a goal's step keeps its parent. A dropped-in item that
  Symphony sorts may name a parent in its proposal, but only one the person can
  see and change before approving. Unparented items stay allowed ("the cascade is
  not mandatory").
- **Moves keep commitments:** placing on a day keeps the task's week and its
  parent; Later and Let go use the existing period moves, so a goal's history and
  links behave exactly as they do on the pages today.

## Relationship to what exists

- **Builds on:** `PeriodReview` / `usePeriodReview` (verdicts and the session
  record), `needsDiscussion` and Discussions (topics), `assignedTo` (who's on it),
  the meal planner (Meals), `weekStartsOn` (when), the canvas activity and Undo.
- **Replaces:** the retired eight-step `PlanSession` (v1 opt-out) is not revived.
  This session is its successor. Leave the v1 code alone unless removing it is
  trivial and safe.
- **Coexists with:** the talk-first Week (`2026-10-14-symphony-v2-talk-first-design.md`).
  The "drop it in" input on every step uses the same machinery: what is said goes to
  the agent, which answers only with a change card (`symphony_propose_changes`),
  never with chat prose. The agent's existing `WEEKLY_PLANNING_SCRIPT` is a guided
  conversation and is not used here. The session is driven by the cards and what
  the people drop in.
- **Prior art:** `2026-05-22-weekly-planning-session-design.md` (the first version
  of this ritual) and `2026-07-23` month-session arc (opens with wins).

## Later pieces (separate designs, in this order)

1. **This document:** the Friday session.
2. **Meal plan drop-in.** Iris plans meals in Claude. Symphony accepts the result
   either way: pasted text, a doc link or a file into the Meals step, or Iris's
   Claude sending it directly through the Symphony connector. Her plans include
   dinners by day (with A/B options and "out" nights), full recipes with sides and
   kid notes, a pool of breakfasts, leftover lunches, prep jobs and pantry notes.
   Symphony previews the filled week and approves it in one tap. Real example:
   Iris's `meal-plan.md` Google Doc.
3. **Friday background summary.** A Claude Code run on Scott's Mac on Friday
   afternoon reads the vault (what's stuck, overdue, follow-ups owed, sleep trend,
   job-search movement) and posts a short summary to Symphony. It appears as extra
   Look back cards in the solo session only. It also writes the vault copy of the
   review.
4. **Monarch.** First, a guided session to set up a budget in Monarch that Scott
   and Iris will actually use. Then the week's spending vs budget feeds the Money
   card. As far as we know, Monarch has no official API.

## Decided by Scott after the builder check

- **The wall: an adult signs in for the session.** On the kitchen wall, starting
  the session asks which adult is running it and signs them in for that session
  only. The wall returns to its display identity when the session closes or is left
  idle. The display's write restrictions (`20261015100000_household_displays.sql`,
  the `refuse_display_write` trigger on `tasks`, `chat_sessions`, `meal_plan_*`, and
  others) are **not loosened**. Note found while checking: the 2026-10-17 kiosk
  tick-off (`0032f449`) writes tasks through the same writer as Done with no
  database change. A wall signed in as a true display would have those writes
  refused. Scott confirmed (2026-10-18) the live wall is signed in as him, not as a
  display, which is why tick-off works there today.
- **One shared screen.** The family session runs on one device. Check-ins, wins
  and dropped-in items carry **who added them**, picked with a one-tap person
  toggle on the screen, not inferred from the signed-in account. **One family
  session per household per week**, which either adult can start, continue, or
  finish. `planning_sessions` is keyed per author today, so the family session
  needs a household-level record.
  Live sync across two devices is out of scope.

## Settled after the builder check (Claude's calls, Scott to confirm)

- **Look back's cards** are every task still open whose day or week placement falls
  in the week that is ending, the same set the existing review by hand uses, plus
  last session's top 3. Repeating routines are excluded: a missed occurrence isn't a
  decision. "The week's priorities" means last session's top 3.
- **Each top-3 item is a task.** Tapping an existing item marks that task as top 3
  for the week. Typing a new one creates a week task. That way next week's Look
  back can put Done/Carry/Let go on it like anything else.
- **What the family session shows:** Family-area items, items assigned to or shared
  with the other adult, and Discussions threads that include both people (a thread
  on a private item shows only what the other person already sees). Unsorted and
  private Work/Personal items are excluded, and counts follow the same filter. The
  solo session shows Work and Personal only. Family items are decided in the family
  session, so nothing is decided twice.
- **Generic, not just Scott and Iris.** Any household member can run a solo session.
  In a one-adult household the family session runs with one person. Copy uses
  names from the household, never hard-coded.

## Left to the builder

- Component structure, routing (a full-screen route vs an overlay on Week), and the
  entry point. It must be one tap from Week and from the wall.
- How the session is offered on Friday evening (a nudge on Today and the wall, a
  routine, or both), within "the evening before the week starts."
- The exact card mapping onto `PeriodReview`'s verbs, and the Let go behavior.
- How wins are stored and where the wins history is viewed.
- The privacy mechanism for solo-session notes.
- Exact copy, within the voice rules above.
