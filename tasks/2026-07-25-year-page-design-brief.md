# Design brief — the horizon pages, starting with `/year`

**Written:** 2026-07-25 · **For:** a fresh session with a DESIGN mandate, not a fix-it mandate.

Read `tasks/2026-07-25-cascade-parity-audit.md` for the model and the correctness
findings. This file is the opposite: what's *wrong with the design*, and the
direction I'd take.

---

## Why the last two passes felt invisible

Both were correctness work — one fate vocabulary, a descent that completes, words
that mean one thing. All of it needed doing; none of it changes what you see when
the page loads. Scott asked for a design pass twice and got plumbing twice. Don't
repeat that. **The test of the next pass is whether the page looks different at a
glance, and whether it tells you something you couldn't previously see.**

## The core critique of `/year`

Open it and you get **twelve boxes, eight of them containing "—"**, then a list of
goals underneath. Two widgets stapled together. Specifically:

1. **It gives twelve equal boxes to a year you're 56% through.** "Day 206 of 365"
   sits in the masthead as text, then the grid below treats January and December
   identically. The page cannot express *elapsed* time, which is the one thing a
   year view should make you feel.
2. **Empty months cost as much space as full ones.** Two-thirds of the grid is
   whitespace with a dash in it. The signal-to-ink ratio is dismal.
3. **A goal's life across the year is invisible.** A goal row shows "3 picks this
   season" and a progress bar. You cannot see that a goal was worked hard in
   spring and has had nothing since — which is the single most useful thing the
   year rung could tell you.
4. **The calendar and the goals never meet.** They're stacked, unrelated. Yet the
   whole model says goals descend into picks descend into moves that land on
   dates. The year page is exactly where that descent should be legible.

## The direction I'd take — the year as one time axis

Stop drawing a calendar. Draw **the year, once, left to right**, and hang
everything on it.

- **One full-width ribbon.** Four season segments (they're the rung directly
  below), a `today` marker at day 206, and the calendar's genuine claims — trips,
  camps, deadlines — plotted where they fall. Elapsed year is shaded. You see at a
  glance how much runway is left.
- **Goals become lanes on that same axis.** One row per active goal, sharing the
  ribbon's time scale. A mark per pick, positioned in the season it was picked,
  filled when its moves completed. Reading left to right you instantly get: *this
  goal has been dead since March.* That's the year rung's real question — not
  "what's in July" but **"is my year actually happening?"**
- **Empty stretches collapse to nothing.** A quiet month should take a sliver, not
  a card.
- **The claims stay read-only.** Nothing on the year page places anything: the
  month rung places onto a week, the week onto a day, Today onto a time. `/year`
  is for looking. (This was just enforced in `b2e2c62b` — don't undo it.)

The prize: `/year` becomes the only surface that shows *time passing against
intent*, which nothing in the app currently does at any altitude.

## Already fixed — don't redo, don't undo

On branch `cascade-unification` (`b2e2c62b`), NOT on main:

- The year cells no longer name individual dated tasks (they used to read "Lay out
  clothes for the NYSRA interview" — the bottom of the cascade leaking into the
  top). They name calendar claims and give tasks a bare count.
- Tapping a month expands the cell in place instead of opening a day grid;
  `MonthZoomSheet` is deleted.
- `/year` is full width (`PAGE_COLUMN_FULL`).
- Three-across is deliberate: each ROW is a calendar quarter. If the redesign
  abandons the grid entirely this stops mattering.

## Constraints

Nordic Journal (`src/index.css`). **Lucide icons, never emojis.** `font-display`
serif for content mastheads, sans for chrome. Tailwind v4 — unlayered CSS beats
every utility, so overridable defaults go in `@layer base`. Full verification is
`npx tsc -b`, `npx vitest run`, `npm run build`, `npm run lint`.

**Look at the screen.** Both prior passes were validated by type-checks alone,
which is how a year page full of errand titles survived. Run the dev server on
port **5173** — Scott's browser has a session for that origin; other ports and
fresh preview URLs land on the sign-in wall and can't be inspected.
