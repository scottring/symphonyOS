# Everyday horizons: goals and projects above, actions below

Branch `claude/horizon-everyday`, based on `main` 3b3981d6 (#71 and #72).
Local only: **not pushed, merged or deployed**. No schema change, and no
writes to anyone's real plan. This implements the product contract
`outputs/horizon-flow-product-contract-2026-09-27.md` (main worktree).

## Contract map: what already existed and what this adds

| Contract | Before this branch | This branch |
|---|---|---|
| 1. Y/S/M lead with goals and projects; the primary control creates one; the empty state invites an outcome | The goal box was first and always open (#71). When a period had no goals, the **import sorter was the empty state** (#72). | "Year/Season/Month **goals and projects**", "+ Add a goal or project", and "Add a goal or project for Fall 2026". The empty state reads "No goals or projects for Fall 2026 yet. What should this season add up to?" An empty page has no single-action or sorting chatter under it. |
| 2. Collapsed goals are quiet; opening them reveals the rest | Done in #72: the circle is the status, and a goal's controls show when it is opened. | Kept. |
| 3. Refine: create **or link** | Create only | Refining can now **link** an existing unlinked goal one rung down ("Or link one you already have"). |
| 4. No day/time controls on goals; moving is not refining | Already held | — |
| 5. Week: goals for reference, and the parent on each action | The parent line on each action existed, but the month's goals sat in the closed Shelves panel. | "**Goals this week serves:** Finish the patio (2 this week) · …" at the top of the week's list, each opening the goal. |
| 6. Single actions secondary but reachable; nothing hidden | A capped, counted list with "Show all N" | Kept. It is quiet when empty. |
| 7. The next step carries the period | The next-level strip did; the line after a planning session linked to bare `/month` or `/week`. | The line after a session now carries the period (the current or first month/week inside the plan). |
| 8. Assignment, area, privacy, inheritance and dates are preserved | Already held | Verified live (below). |
| Import repair is one-time and separate | It was the page's empty state | It is now a labelled **"One-time: organize this list"** notice beside the list it is about, with **Organize the list** and **Dismiss**. Once dismissed, a quiet "Organize into goals…" link stays, but only while the period has no goals. A populated plan shows no sorting at all. |
| Honest undo | "You can undo this afterwards" | The sort explains its limits: "Undo stays on this page, in this browser." There is now a durable way back on any device: a goal with no next actions offers **Make it a single action** in its menu, with Undo. |

Codex's `510d707a` (auto-opening the sorter as the page content) was not
adopted. The contract says a permanently open sorter is not the product. That
worktree is untouched.

## Evidence

**Component and mocked integration (vitest).**
- 7319 passed and 3 skipped across the full suite. The one failing file is `connectors/src/whatsapp/adapter.test.ts`: the `@whiskeysockets/baileys` package isn't installed in this worktree, which is unrelated.
- tsc, `npm run build` and lint are clean (0 errors).
- New or updated tests:
  - An empty season creates a goal from its primary box, with no conversion.
  - Make it a single action works, with Undo, and is not offered when the goal holds next actions.
  - Refining can link an existing goal and writes one field.
  - A populated plan offers no sorting.
  - The repair notice sits beside the list, never in the goals card.
  - Dismiss is remembered.
  - Week list: the goals-served reference, with counts, opens the goal.
  - An empty month's list stays quiet, and Plan opens the session.
- These are mocked. They do not prove database behaviour.

**Local database acceptance (the real app).**
- The app was built from this branch and pointed at an isolated local Supabase built from the shared project's schema only (real RLS, triggers and functions, no data).
- It was driven with headless Chromium and fictional accounts. Scripts are in `outputs/horizon-everyday/`, screenshots in `outputs/horizon-everyday/shots/`.
- The Lee household, from empty (Riley, with Drew as a second login):
  - `e01`: the Year page with the goal box leading. `e11`/`e12`/`e13` show empty Year, Season and Month for a brand-new user.
  - Year: typed from the keyboard via "+ Add a goal or project", "Make our home work better for our family" (Family).
  - Refined into Fall: "Create a usable outdoor space". Refined into October: "Finish the patio". `e19`, `e03`/`e04`/`e20` and `e05` show each parent on its own horizon.
  - Next actions written into named weeks, each with its toast: Choose chairs and Order lights in Sep 27–Oct 3, Clear the patio in Oct 4–10.
  - Choose chairs got notes (measurements, budget), two shopping links, a location and a phone number, written as Riley through RLS.
  - Week (`e06`): "Goals this week serves: Finish the patio (2 this week)". Choose chairs moved to Sunday Sep 27; Order lights stays "any day".
  - Today (`e07`/`e08`): Choose chairs with no clock time and its parent line. Details show tap-to-call, Directions, notes and links.
  - Urgent: "Call the plumber" added straight on Today. It is private, and Drew does not see it.
  - Completing Choose chairs left "Finish the patio" open (2 open · 1 done). Reopening and reloading gave the **same row** `90842a4f`, with its week and day records, and all Family.
  - Drew's Month shows the shared Finish the patio chain.
  - At 390px (`e14`–`e18`): Year, Season, Month, Week and Today have no horizontal overflow.
- Long list (`e21`/`e22`): November with 32 goals, 48 next actions and 12 single actions.
  - At desktop and 390px, the filter found "sourdough", and Tab reached the goal's controls with a visible 2px focus ring, in view.
  - The single actions were counted and capped, with "Show all".
  - After a fix in this branch, no sorting UI appears on this populated month.
- Existing flat import, the fictional Morgan household (22 Fall items with no goals, mixing outcomes and actions, one dated item, one placed in October, one finished, and the partner's private items):
  - `e30`: before. The goal box invites an outcome; the one-time notice sits by the list.
  - `e31`: after Dismiss. The notice is gone and a quiet link is left.
  - `e32`/`e33`: review and preview of 9 outcomes.
  - `e34`/`e35`: after, the ordinary season leads with 9 goals, on desktop and phone.
  - **Database:** still 22 rows with 22 distinct titles, 9 now goals, and the hash of id, title, area, scope, people, notes, links, season/month, day and completion is **identical before and after**. Only `is_goal` changed.

**Production.** Nothing on this branch was checked in production, and nothing is deployed.

## Gaps and dependencies

- **Importer defaults are a coordinated dependency and are not in this branch.** Plan from paper is owned by open PR #61 (`claude/plan-from-paper`: `planParse`, `paperIntoDraft`, the `parse-page` and `plan-from-paper` functions, `PageReviewSheet`). Its session is not running, and its worktree has uncommitted work. The spec for the owner:
  1. On year, season and month pages, lines the parser reads as outcomes or projects go to the goal list; explicit actions, appointments and routines keep their types.
  2. Never make every line a goal because of the page's title.
  3. The review sheet shows each line's resulting type and horizon before saving, and the type stays editable.
  4. Dated or timed lines stay actions or appointments.
- Undo of a whole sort is per browser. On any device, the way back is per goal: Make it a single action.
- Year goals have no open/closed state, so "+ Add a season goal for it" shows on every Year row.
- Items assigned only to someone else aren't on your own list, so they aren't offered for sorting (the existing "my plan" lens).
- A live partial-save failure in the sort was not reproduced against the database; it is covered by mocked tests only.
- Pre-existing and out of scope: on a phone, the Week page's "No calendar connected" banner is cramped.
