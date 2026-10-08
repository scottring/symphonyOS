# Guided planning, Open journal default, independent columns (2026-10-08)

Branch `claude/journal-default-onboarding` (from origin/main 37c891ad). This
note says what is implemented, what was tested, and what still blocks release.
It replaces the prototype handoff (`2026-10-08-voice-onboarding-prototype.md`
in the voice-onboarding worktree, which itself was left as it was).

## 1. Open journal is the default

`readPlanLayout` returns `journal` unless this device explicitly chose Lists
(`symphony-plan-layout.month|week = 'lists'`). Covered by `planLayout.test.ts`
and the Month/Week journal suites; the Lists suites now set Lists explicitly.

## 2. Week journal columns scroll independently (desktop)

At ≥1100px the at-rest Week journal is two columns — the journal and the
days — each sized to the window by `useColumnsFitWindow` and scrolling on its
own; both are focusable regions (keyboard scroll). Below 1100px they stack and
the page scrolls as one. The Month journal column is also a focusable region.
Verified signed-in on the real shell (independent check): PageDown moved the
journal's scrollTop while the days stayed at 0. The fixture harness has no
app-shell scroller, so it is not proof of scrolling.

## 3. Guided planning (`/plan-aloud`)

Entry: “Plan with guidance” on `/start`. Three intents — Build my plan, Add to
my plan, Review my plan — plus resume of an unfinished session.

**Build** goes breadth-first: all yearly goals together, then the whole season,
the whole month, one combined week, then today; it can start at any of the five
horizons. Each horizon ends at a checkpoint.

- A goal holds several season/month lines. An answer ADDS a line (same words
  twice for one goal are one line); changing a line is explicit (pencil, by id);
  “Next goal” moves on; “Not this season/month” is fine.
- Links are to actual rows. A month line is written for the Fall line the person
  picks (automatic only when the goal has exactly one, new or kept); a week task
  for the month line picked. Writes go to `source_id` (what the journal groups
  by) and `goal_id`.
- Existing plans are reused, never copied, and shown as kept — including lines
  with no goal (“Something else”). The year checkpoint lists goals only.
- The session fixes its periods (year, season, month, week, today) when it
  begins. A session resumed later says so and still writes there.
- On resume and before saving, the draft is checked against what the person may
  see now (`reconcileDraft`): goals outside the current domain filter / people
  lens / account leave the session with their unsaved lines; a chosen line above
  that is gone is unchosen.
- Guidance is said, not enforced: past 5 goals, 7 week items or 3 for today the
  page says so gently and still takes the answer. Session bounds (12 goals, 25
  new week tasks, 10 for today) are stated on screen when reached.

**Save** uses the app's writers as the person (RLS): `useGoals.addGoal`,
`useSupabaseTasks.addTask`, and for today `updateTask(id, { plannedOn })` as a
separate, checked step after the task exists. `addTask`'s own `plannedOn` is
not used: it returns the id even when the focus write fails and skips it on a
duplicate-id retry (shown by the real-hook test in
`useSupabaseTasks.planWrites.test.ts`). Every row has a client id; the ledger
(`saved`) persists per row, a retry writes only what had not landed, a row
whose parent failed waits and is reported, and saved rows can no longer be
edited in the session. While Save runs the whole session is disabled.

**Voice** is optional and OFF. No voice controls appear unless the build sets
`VITE_VOICE_LIVE=1`. The simulation (`DemoTransport`) is used only by the DEV
preview; it is unreachable in production (its strings are still in the bundle
because `VoicePlanner` imports the class).

## 4. The typed guide (`planning-conversation`)

New edge function; `goal-planning-chat` is not reused (service role,
conversation fetched by id without a user predicate, old depth-first coaching).

- Stateless; no database access; no service role. The caller's JWT is checked
  with the anon key.
- Sends only what the page shows, after `reconcileDraft`: session goals as refs
  (`g1`…, never row ids), their lines, the kept unlinked lines, the last ≤8
  turns. Request ≤12,000 chars; ≤12 goals, ≤60 lines.
- Replies through one forced tool: ≤700 chars of reply, ≤5 proposals, each at
  the horizon on screen and for a sent goal ref (or none) — anything else is
  dropped, not re-pointed. `max_tokens` 700, 30s timeout. Logs status codes
  only, never upstream bodies.
- The page shows each proposal with Add / Dismiss. Add puts it in the draft
  like a typed answer; only Save writes. A reply for a step, session or set of
  visible goals that has since changed is not offered. What asking sends is
  stated under the box, before the first send.

To turn it on (Scott): deploy `planning-conversation`; set server secret
`PLANNING_CONVERSATION_ENABLED=1` (and optionally `PLANNING_CONVERSATION_MODEL`,
default `claude-sonnet-5-5`; `ANTHROPIC_API_KEY` already exists); build with
`VITE_PLANNING_CONVERSATION=1`. Without the build flag the client code is
tree-shaken out and the page is the same guided flow, typed and tapped.

## Blockers and limits (not done here)

- **Live voice: blocked.** Needs server-side duration enforcement (a server-driven
  `/v1/realtime/calls/{id}/hangup`), the `voice_sessions` table with RLS (a
  migration — not allowed in this release), its secrets and switch, and a budget
  cap. The `voice-session` function and migration were not brought across.
- **Guide daily cap: none.** A per-person cap needs a table with an access policy
  (migration). Until then the bound is per request only. Decide before wide release.
- The guide has not been called against the real model from this session (no
  paid calls). First check after deploy: one authenticated request.
- Mocked tests do not prove RLS; the independent signed-in run did save goals,
  season/month lines, week tasks and a Today choice to the right places.

## Preview

DEV only: `/plan-aloud-preview?scene=<home|resume|build|year|season|month|week|today|review|add|review-plan>`,
`&fail=1` for a partial save, `&guide=1` for the guide with a canned reply (no AI).
