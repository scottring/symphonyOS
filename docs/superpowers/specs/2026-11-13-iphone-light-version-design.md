# Symphony for iPhone, light version: design

2026-11-13. Status: draft for Scott's review.
Mockup: https://claude.ai/artifact/6qsEdjFMsyg4s415SYk48i (top row, "Play this one").

## Intent

The iPhone Duo is sold out everywhere and front of mind. Apps that use both
screens well are scarce. Symphony already has real Duo work (outside-screen
glance, inside-screen journal, the half-open display), so there is a short
window to get noticed in the App Store.

To use it, Symphony needs a version a stranger can download, understand and
enjoy alone, without Scott's help. That is this light version: free,
mobile-first, and focused on one promise. It helps a person name what matters
in the year ahead and walks them down through the season, month and week to
a calm, usable Today.

The bar Scott set: intuitive, fun, engaging, beautiful and touch-friendly. The
reference points are Headspace (immersive, one gentle question at a time) and
Apple's Fitness rings (a quiet, satisfying "done").

## Who it is for

- **New App Store users** on an iPhone Duo or a regular iPhone. Most early
  downloaders won't have a Duo yet (they're waiting for one), so the regular
  iPhone experience must be just as good.
- **Not** Scott and Iris. Their household keeps the full app exactly as it is
  today (see "Light and full in one app").

## Goals

1. A guided first walk from the year ahead down to today, at two depths:
   quick start (about 3 minutes) and "Plan my whole year" (about 25 minutes).
2. Today and Week pages that are easy to manage with one hand.
3. Year, Season and Month pages where the walk's answers live and grow.
4. Tent view: the Duo set down half-open shows what's next on the calendar
   and today's to-dos over the scenery, readable from across a desk.
5. Scenery (the overlook and train-yard prints) on iOS, which today has none.
6. Everything the App Store requires to approve a public app.

## Non-goals (hidden in the light version, kept in full)

Routines, Projects, Lists, Contacts, dinner and the cooking view, family
sharing (the work/personal/family switcher and people's initials), photographing
a paper page (an AI call per photo), the assistant, the kitchen wall, and the
web app. No paid subscription at launch.

## Anti-goals (would make it a failure even if it works)

- It feels like filling out a form.
- Symphony supplies ideas the person didn't ask for. It structures their own
  words, never its own (standing rule, Scott 2026-10-11).
- Nagging: streaks, guilt counts, red "overdue", confetti.
- A new user lands in an empty or half-working app.
- Scott or Iris lose anything they use today.
- The free version costs real money per user (no AI calls in it).

## Decisions Scott made

- **One app, not two.** Light and full share one App Store listing and one
  account system. Upgrading later keeps every goal and task.
- **Free first, free only at launch.** The paid tier (Symphony Plus: assistant,
  family sharing, wall, web) comes in an update about four to six weeks later.
  Never take away anything free users already have; Plus only adds.
  Say "Symphony Plus is coming" up front.
- **Routines are hidden** in the light version for now.
- **The walk is a walk down a mountain**, not a set of form screens (v1 was
  rejected as form-like):
  - The scene glides down as you go: the year high in the sky, the season at
    the peaks, the month at the ridges, the week in the valley, today on the
    path. Where you are in the picture replaces step labels.
  - One large question per screen, one big mic ("Tap and tell me"), the
    keyboard as a small option.
  - Answers settle into the scene as paper notes. Notes from the level above
    stay visible at the top ("Higher up").
  - No Next button. "That's it" (or a swipe down) walks on. "Skip" when
    nothing has been said yet. A small up-arrow goes back.
  - It ends with Today rising in as a paper sheet, with a ring that fills as
    to-dos are done and a quiet "That's the day" when it closes.
- **Guidance, gentlest first** (the balance Scott approved):
  1. A one-line "why" under every question.
  2. Memory joggers that don't supply content: life areas on the Year step
     (Health, Home, People, Work, Money, Fun; tapping one narrows the question
     to "What about home, this year?"); on lower steps, the person's own notes
     from higher up (tapping one focuses the question: "For 'Finish the
     bathroom', what's this winter's piece?").
  3. "Show me examples" on request only: at most three dashed "e.g." notes,
     tappable to use and reword. None on the Today step.
- **Both depths.** The welcome screen offers "Quick start" (one goal down to
  today) and "Plan my whole year" (every area, every goal). After a quick start,
  Today offers "Walk another one down" for the next year goal, so the full
  year builds up gradually. The full plan is offered again at each new season.
  The walk saves as it goes and can be resumed.
- **Tent view content:** what's next on the calendar and today's to-dos, over
  the scenery.
- **Scott and Iris keep the full app** while new accounts get the light one.

## Direction, not yet decided

- **The walk ends at your own doorstep** (Scott's idea, 2026-11-13): a
  suburban driveway, a subway entrance, a farm gate, a cabin porch, matching
  the person's place theme. Distance becomes time: the far range is the year,
  the town the month, the street the week, the door today. This needs new art
  (one continuous summit-to-doorstep picture per place, made like the
  train-yard print). Launch can ship with the overlook alone and add places
  after.

## How the walk works

| Step | Question (default) | Why line | Writes |
|---|---|---|---|
| Year | What would make the year ahead a good one? | Something that would feel true twelve months from now. Big or small. | Year goals |
| Season | And this winter? What's it about? | A season is a few months. What is this stretch really for? | Season goals, each linked to a year goal when focused |
| Month | What's one thing for the rest of November? | Small enough to finish by the 30th. | Month goals, linked to a season goal |
| Week | What would move that forward this week? | Say the day for each: "the deposit, today." | Tasks on this week's days, linked to the month goal |
| Today | What's the first thing you'll do today? | Just one. The rest of today can wait its turn. | Marks one of today's tasks as first |

- Names follow the product rule: Year, Season and Month hold goals; Week and
  Day hold tasks.
- Each answer is the person's own words as the title. Symphony tidies spoken
  filler and pulls out a day ("the deposit, today"); it doesn't rewrite.
- Every task created by the walk keeps its link up the chain, and Today shows
  it ("for Feel strong again"). This is the product's "planning a task for
  today preserves its broader commitments".
- Speech runs on the phone (the existing TellSheet path: on-device speech,
  then `CaptureParser`). No server AI.
- "Plan my whole year" walks the Year step area by area (the area joggers
  become a sequence), then walks each year goal down through the season.
- *(Claude's call)* **Periods near a boundary.** Year goals are stored by
  calendar year. Started in November or December, "the year ahead" files
  under the next calendar year; otherwise under the current one. The Season
  step plans the current season unless fewer than three weeks of it are left,
  then the coming one, and the question names it ("And this winter?"). The
  Month step works the same way. The Year, Season and Month pages must show
  what the walk filed.
- *(Claude's call)* **Art for launch.** The descent ships with the existing
  overlook print, faked with pan, zoom and layered crops, as in the mockup. A
  tall summit-to-doorstep picture per place comes after launch, so new art is
  not on the critical path.

## Light and full in one app

- A **household-level** setting decides the edition (Scott, 2026-11-13).
  Existing households are full; new sign-ups are light. Plus will later flip a
  light household to full. A light user who accepts an invite to a full
  household becomes full.
- **Enforced on the server, not only hidden in the app** (Scott, 2026-11-13).
  The AI server functions refuse light households, so a light account can't
  spend money by signing in on the web or calling them directly. This is a
  database change plus function gates, verified with two real accounts.
- Light hides the non-goal features from navigation. Its dock: Planner
  (Today, Week, Month, Season, Year), Inbox, +, More (Settings).
- The walk appears automatically only for a new account with no goals, and
  can be replayed from Settings (so Scott and Iris can try it).

## First run and account

- Signup opens to everyone (Scott, 2026-11-13). The invite gate is a
  database trigger (`check_allowed_signup` → `signup_allowed`) and can't tell
  an iPhone sign-up from a web one, so this opens the web too. On the web, a
  light account sees one simple page: Symphony is on iPhone for now, and the
  web comes with Plus.
- A household is already created for every new account at sign-up
  (migration `20261111140000_household_for_every_account.sql`). Verify the
  iPhone path picks it up; no new work expected.
- In-app account deletion, which Apple requires for any app that creates
  accounts, full ones included. It doesn't exist today on any client.
  *(Claude's call)* Deleting removes the person's private data and their
  household membership. Shared household items stay with the remaining
  members, and the household goes when its last member leaves. Done
  server-side and verified with two real accounts.

## Calendar

- Read Apple Calendar on the device (EventKit, read-only), asked at the
  walk's Today step ("See your calendar on Today too"). Most iPhone owners use
  it. Today the app reads Google Calendar only, after a web connection flow.
- Google Calendar stays for full accounts.

## Screens and layouts

- **Regular iPhone, upright** is the primary layout: one-handed, large tap
  targets (44pt minimum), the Tell bar at the bottom.
- **Regular iPhone, sideways**: the existing wide glance.
- **Duo outside screen**: the existing calm glance (shipped 2026-11-12).
- **Duo inside screen**: the existing day page and journal spread.
- **Duo half-open (tent view)**: build on the existing `HalfOpenView`, adding
  the scenery and making next-up and to-dos readable at desk distance. Light
  accounts show no dinner.
- **Moving between horizons** must be visible. Today it's a tap on the page
  title, which new users won't find.
- **Adding a goal** happens by talking or a single line, not the current
  `GoalEditorSheet` form.
- **Scenery** ships in the iPhone app: the overlook (default) and the train
  yard, behind the walk, Today and tent view.

## Plus early access

A "Get early access to Plus" button (in More, and once after the first walk)
records interest so demand is measured before the subscription is built.

## App Store

Public listing with screenshots for regular iPhones and the Duo, a custom
product page aimed at Duo shoppers ("the planner that opens like a notebook"),
privacy labels, the existing /privacy page, and a demo account for App Review.

## Constraints

- iOS app in `apple/SymphonyOS` (SwiftUI, SwiftData, Supabase), built on main
  by Xcode Cloud to TestFlight. New extension or target bundle IDs must be
  registered first (see the TestFlight notes).
- Look: the current scenery / paper-journal design, Crimson Pro and DM Sans,
  SF Symbols, no emoji. The older "Symphony" design-system artifact (Fraunces,
  Intention/Milestone names) is retired and not used.
- Privacy: any change to who may see what is verified with real signed-in
  accounts, not mocks. No service-role shortcuts in the app.
- Scott approves before any production deploy, database change, or App Store
  submission.

## Left to the builder

- Exact animation timing, note placement, and how many notes show before they
  stack.
- How the edition setting is stored and synced.
- How Plus interest is recorded.
- Whether "first thing today" is an order, a pin, or a flag on the task.
- The order of work, provided App Store requirements are not left to the end.
- Mic permission and offline behavior details, following the existing
  TellSheet.

## Calls Claude made (check these)

- Which year, season and month the walk files into near a boundary.
- Launch with the existing overlook print; tall per-place art after launch.
- What account deletion does in a shared household.
- Proposed, not yet confirmed: a StandBy widget as the regular-iPhone
  equivalent of tent view (the app already has a widget extension).
