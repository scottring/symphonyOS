# Weekly Planning Session — Design (v1)

**Date:** 2026-05-22
**Status:** Approved for implementation planning
**Author:** Scott + Claude

## Context

Part of a larger multi-horizon planning system (daily → weekly → monthly → seasonal → annual). Source requirements: `~/Documents/scotts-world/docs/planning-rhythm-requirements.md` (captured from Scott + Iris). This spec covers **sub-project B: the Weekly session** — the keystone ritual (Sunday 7:15–8:15) — first.

The other sub-projects (A daily, C monthly, D seasonal, E annual, F AI inbox sorting, G idea spaces/SOPs/"who does what") are out of scope here and get their own specs.

**Architecture principle (consistent with today's decisions):** a planning session is a Symphony surface that **reads** live Symphony data (calendar, tasks, goals) for review and **writes** the reflective substance (the week's plan + concerns) to the **vault**. Symphony = doing; vault = thinking.

## Goal

Give Scott and Iris a guided, ~1-hour Sunday flow that turns "what's coming + what's undone + what's emerging" into a scheduled, prioritized week — and captures the week's concerns/topics to the vault.

## Scope

**v1 — four wizard steps:**
1. Review the week ahead (calendar).
2. Build & prioritize the week's to-dos.
3. Schedule them onto the week.
4. Capture concerns/topics → vault.

**Deferred (later versions / sub-projects):**
- Task & routine **delegation** between Scott/Iris (v1.1; builds on existing family assignment).
- **Meal planning** (v1.1; links to existing meal planner).
- **Weekly cashflow** check (mostly external tool hand-off).
- **Monthly/seasonal/annual** sessions (sub-projects C–E) — but step 2 is designed so their "released tasks" plug in.

## UX

- **Surface:** a dedicated full-screen **Weekly Planning** view (takes over the main content area; not the side panel). It is a focused session.
- **Flow:** a **step-by-step wizard** — one activity per screen, `● ● ○ ○` progress indicator, Back / Next. The deliberate order (review → prioritize → schedule → capture) is enforced by the wizard path.
- **Launch (v1):** manual — a "Plan the week" entry in the sidebar + a button on the existing Week view. (Later: a Sunday routine surfaces a "Start weekly planning" nudge.)
- **Scope of data:** Universal (all domains) by default; respects the domain switcher if set.

### Step 1 — The week ahead (review)
- Renders an **actual week calendar grid** (reuse the existing `WeekView` / week-planning-view, see `2026-05-20-week-planning-view-design.md`), showing the next 7 days of events laid out by day/time.
- Read-only. Surfaces the "big rocks" + social context. Optionally flags heavy/conflict days.
- Data: `useGoogleCalendar` (+ meals already render as events).

### Step 2 — Build the week's to-dos
- Presents candidate to-dos from the existing task-bucket ladder
  (`TaskBucket = inbox → week → month → quarter → timed`; the UI labels `quarter`
  as "Someday"). Source buckets:
  - **Inbox** — untriaged tasks (`bucket = inbox`).
  - **Carry-over** — incomplete tasks still in the `week` (or `today`) bucket from the prior week.
  - **This month (released)** — tasks designated `bucket = month`. This *is* the "released from monthly" source — it exists today; promoting a month task into the week is the core "release" action.
  - **Someday / longer** — `bucket = quarter` ("Someday"), surfaced for optional promotion.
  - **Goal actions** — current-quarter goal actions (from the goals system).
- User selects which candidates are "this week" (sets `bucket = week`) and **drags to order by priority**.
- Output: chosen tasks moved to the `week` bucket and ordered.
- Note: the monthly/seasonal *sessions* (sub-projects C/D) will later be the deliberate place to populate the `month`/`quarter` buckets, but the buckets and their tasks already exist, so this "release" works in v1 with no placeholder.

### Step 3 — Schedule them
- The chosen to-dos + the week's events shown in a **week time-grid** (extend the existing day-planner `PlanningSession` from one day to the week).
- Drag to-dos onto days/times.
- Output: tasks get `scheduledFor` (date/time) set — saved live to Symphony as dragged.

### Step 4 — Concerns & topics
- A rich-text area (`TiptapEditor`) for the week's conversation topics and concerns.
- On **Finish**, writes the weekly note to the vault.

## What "Finish" produces

- **Symphony:** the chosen tasks are scheduled (dates/times) and flagged for the week. (These changes save live during steps 2–3, not deferred to Finish.)
- **Vault:** one weekly note at `planning/weekly/<ISO-week>.md` (e.g. `planning/weekly/2026-W21.md`) via `vault-write`, containing: the week's prioritized to-dos, a schedule summary, and the concerns/topics text. This is the knowledge artifact.

## Data model & persistence

- **No new database table in v1.** The wizard operates on live data (tasks update as you go) and produces one vault note at the end. A `planning_sessions` table (for history/streaks/resume) is a deliberate future addition, not v1.
- **In-progress state** lives in component state only. If the session is closed mid-way, task changes already made persist; the concerns text is not yet saved (acceptable for v1 — Finish is the save point for the vault note).

## Multi-user / privacy

- Multi-user **is built**: `households` + `household_members` (1 active 2-person household exists), with RLS sharing `context = 'family'` items across the household (`users_share_household(...)`) while keeping private items private.
- The session, run on whoever is logged in, sees **that user's private items + the full shared household layer** (both partners' `family` items). The shared layer — what the ritual coordinates — is complete on either account. A single screen does not show the *other* person's private items (correct by privacy design).
- **Vault-write is Scott-only** (`vault-write` enforces `user.id === VAULT_USER_ID`; the vault is Scott's). Step 4's vault write works on Scott's account; on Iris's account it skips gracefully (she has no vault).

## Build approach (reuse first)

| Step | Reuses |
|------|--------|
| Surface/wizard shell | new `WeeklyPlanningSession` (new); register in `ViewRouter` + `Sidebar` |
| 1 — review | `WeekView` / week-planning-view, `useGoogleCalendar` |
| 2 — to-dos | `useSupabaseTasks` filtered by bucket (inbox / carry-over `week` / `month` / `quarter`), `GoalsContext` (goal actions) |
| 3 — schedule | extend `PlanningSession` day-planner to a week (`PlanningGrid`/`PlanningColumn`) |
| 4 — concerns | `TiptapEditor` + `useVaultWrite` |

New components kept small and single-purpose (one per step + the wizard shell). No unrelated refactors.

## Out of scope / explicitly deferred

- Delegation flow, meal planning, cashflow (v1.1+).
- Monthly/seasonal/annual sessions (separate specs).
- AI inbox sorting (separate sub-project F).
- A `planning_sessions` table, session history, streaks, resume.
- Routine-triggered auto-launch (v1 is manual launch).
- Two simultaneous logged-in users / merged dual-private view.

## Open decisions (resolved)

- Flow = wizard (not single-scroll) — chosen for a timed, focused ritual.
- v1 steps = review / to-dos / schedule / concerns.
- Domain scope = Universal default.
- No new table in v1.
