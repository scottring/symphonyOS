# Math of the day — design

Approved by Scott 2026-10-14 (mockup: https://claude.ai/artifact/P3GUPK1tB2zBbRQVVSNjJw).

## What it is

Each kid gets one math problem a day on the kitchen wall. They work it out
with a finger on grid paper and tap the answer on a number pad. It is pitched
at an advanced third grader and gets harder or easier with each kid.

## Decisions

| Question | Decision |
|---|---|
| One problem or one per kid | One per kid, at their own level |
| Remembered? | Yes: one row per kid per day, which gives a ★ streak and a done check |
| Problem types | By weekday: Mon ×, Tue long division, Wed fractions, Thu big + / −, Fri two-step word problem; weekends random |
| Difficulty | 5 rungs per type, starting at rung 2. A solve without the hint moves up; a solve after the hint stays; a revealed answer moves down |
| Wrong answers | Three tries. The answer stays in the boxes after a miss; the second miss shows a first-step hint; the third walks through the solution step by step, drawn on the paper. A revealed day doesn't extend the streak or break it |
| Who writes what | Code picks the numbers and computes the answer and the worked solution, so the answer key is always right. Claude (edge function `math-story`) writes a short story, the hint and the answer boxes' names. The wall keeps Claude's text only if it keeps every number and never states the answer; otherwise the kid sees the plain problem |
| Drawing | Never saved. It stays per problem while the wall is open and clears with the next day |

## Pieces

- `src/lib/wall/math/` — pure logic, all tested:
  - `mathProblem.ts` — types, generators, answers and answer checking (any equal fraction counts)
  - `mathWorked.ts` — the grid layout and walkthrough steps
  - `mathProgress.ts` — rows, levels, streaks, and what one tap on Check does
  - `mathWording.ts` — plain wording, the checks on Claude's text, the story request
- `supabase/migrations/20261014180000_kid_math_problems.sql` — the table, shared within the household (same rule as the scratchpad, written in the faster form), with one row per kid per day.
- `supabase/functions/math-story` — Claude Opus 5.5 at low effort with server-side refusal fallback. It does no database reads or writes; the wall writes the accepted wording with the signed-in user's own permissions.
- `src/hooks/useKidMath.ts` — loads 90 days of rows, creates today's rows the first time the wall loads, asks for each new problem's story once, and saves every Check.
- `src/components/wall-v2/activity/MathStage.tsx` + `src/styles/kiosk-math.css` — the stage.
- Ways in: a "Math of the day ★" button on each kid's After school card, the More tile, and the stage `{ kind: 'math' }`. An idle wall goes back to Home from the math stage.

## Preview

`/kiosk-preview?scene=math&v1=home` (dev only) shows two fixed problems: Liam's long division with a story, and Mia's fractions with the plain wording.

## Round two (approved 2026-10-14)

- **Math in the bar:** a Math button sits in the wall's bottom bar on every screen, with a dot while a kid's problem is still open.
- **Bonus problems:** after the daily problem, "Want another?" gives up to three more the same day. They are stored as `slot` 1–3 beside the daily row (slot 0), each one rung harder. They earn bonus stars; streaks and levels read only slot 0.
- **Topics:** after a solve, a kid taps up to three topics (`kid_math_prefs`), and each new story is about one of them, the same topic every time for the same problem.
- **Grown-ups corner:** opened with a press-and-hold on the math screen.
  - **Practice:** any type and level, with "Show me how" to step through the solution on the paper. Nothing is saved.
  - **Reset today:** asks for a second tap, then puts a kid's daily problem back to unsolved and removes that day's bonus problems.
- **Parent view:** each kid's page in the app (Family → name) has a "Math of the day" section covering the last four weeks: the streak, each type's level and results, the type that needs the most help, and the recent days (`mathHistory.ts`, `KidMathSection.tsx`).

## Later

- **Parked (2026-10-14):** branch `claude/math-paper-room` adds room above the problem and squares sized to fit. It is built and tested but not deployed.
- **Finger precision, proposed:** let only the first finger draw (no palm or second-finger marks); smooth strokes; make ink thickness scale with the squares; use a low-latency canvas. A fat stylus would help with the touch frame's own accuracy. Bigger option: tap a square, then a digit on the pad, to write a crisp digit.

- Parent-set topics in the app, beside the kids' own.
