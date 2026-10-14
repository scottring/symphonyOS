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

## Later

- Each kid's interests (dinosaurs, soccer) for the stories.
- A parent view of history: what each kid finds hard.
