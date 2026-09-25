# AI-guided sessions: what the assistant can actually do today

Inspected 2026-09-23, before designing anything. Scott's direction: *"First inspect
what the existing assistant can observe and do; identify gaps before promising
capabilities."* Companion to
[`2026-09-23-onboarding-and-planning-guide-program.md`](./2026-09-23-onboarding-and-planning-guide-program.md).

The destination: onboarding gains **optional** AI-guided sessions that work on the
user's own data, built on the four storylines. A deterministic guide that needs no AI
stays available and equal. The first session to prove is **"plan my week with my own
tasks"** — contextual questions, verified saves, error recovery, resume later.

## What exists

`supabase/functions/symphony-agent` exposes 34 tools. Read: tasks, events, routines,
projects, lists, contacts, household members, notes search, email search and thread
read, a daily summary, web search and fetch, code execution. Write: create/update/
complete/delete tasks, create calendar events, create/update/delete routines, create
notes, lists and list items, contacts, projects, draft email. `GuideChat` already
carries a `sessionContext` (horizon, step, live list titles, the level above, goals)
into the same function as a coaching preamble. There is a separate
`goal-planning-chat` function.

So: the assistant can already see a household's real work, and can write to it.

## The gap that blocks the first session

**The agent's task vocabulary stops at `bucket`.** `BUCKET_ENUM` is
`['inbox','timed','week','month','quarter']` (`symphony-agent/index.ts:92`), and a
search of the whole function for `week_start`, `month_start`, `season_start`,
`is_goal`, `goal_task_id` and `planned_on` returns **nothing**. Consequences, all of
them fatal to "plan my week with my own tasks":

1. **It cannot say *which* week.** It can put a task in the week bucket, but
   `week_start` decides which week that is. Every task it places lands in the
   current week by the legacy-row default — so planning *next* week is impossible.
2. **It cannot see or make a goal.** `is_goal` and `goal_task_id` are invisible, so
   it cannot read the month's outcomes to plan a week beneath them, cannot create a
   goal, and cannot link a task to one. A guided session that claims to connect work
   to commitments would be fabricating the connection.
3. **It cannot choose a day without consuming the week.** `planned_on` is the field
   that lets a task be chosen for today while keeping its week commitment — the
   product's central invariant, confirmed live in walk finding S1-14. The agent has
   no access to it, so anything it "plans for today" breaks the model.
4. **It cannot read or write a planning session.** `planning_sessions` (the
   look-back verdicts, the saved-at marker the rest of the app keys off) has no tool,
   so an AI session cannot resume, and its work would not register as a planned
   period anywhere else in the app.
5. **Weekend is invisible.** No `weekend_start`, so "either Saturday or Sunday"
   cannot be expressed and the agent would have to invent a Saturday.

There is also no routine-occurrence tool: the agent can create, update and delete a
repeating **pattern**, but cannot choose or complete a single **occurrence**. Any
routine work in a guided session would edit the pattern — the exact confusion the
product model forbids, and the one behaviour storyline 1 confirmed the UI gets right.

## What this means for the design

- **Do not promise** goal-aware, horizon-aware or resumable AI planning until the
  tool surface carries `week_start`, `month_start`, `season_start`, `weekend_start`,
  `planned_on`, `is_goal` and `goal_task_id`, plus planning-session read/write and a
  routine-occurrence tool. That work is a prerequisite, not a detail.
- **The deterministic guide is not a fallback.** It is the version that can be built
  correctly today, and it defines the contract the AI session must satisfy.
- **Every save must be verified and shown.** The agent writes through the same
  helpers the UI uses, and the session re-reads and displays what landed. Walk
  finding S1-07 is the small version of the same rule: a write nobody can see is
  indistinguishable from a write that did not happen.
- **Resume is a data question, not a prompt question.** Until a session's state lives
  in `planning_sessions`, "resume later" cannot be honest.

## Sequence (not yet started)

1. Keep walking storylines 2–4; log where a user needs explanation, assistance or
   recovery. Those findings define the session's contextual questions.
2. Specify the deterministic "plan my week" session from those findings.
3. Close the tool gaps above.
4. Prototype the AI session over the deterministic one, review, then extend to the
   other storylines.
