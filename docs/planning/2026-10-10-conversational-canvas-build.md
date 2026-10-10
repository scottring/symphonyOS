# Conversational canvas build — checklist and evidence

Branch `claude/conversational-canvas`, worktree `.worktrees/conversational-canvas`, from `origin/main` 93ac2305 (2026-10-10).

Approved references:
- Layout and behavior: https://claude.ai/artifact/7yrgWZVHS7MBTHuDi14Bv8 (canvas, 29 artboards incl. interactive Plan, Kitchen, Routines prototypes)
- Component grammar: https://claude.ai/artifact/T7ADQEmK4igqvhYtCUYvaN (six forms, rules, surfaces)

Handoff: `/private/tmp/symphony-approved-canvas-build.txt`. Not authorized: merge or production deploy before independent review and an explicit release decision.

Status words: **proposed** (designed only) · **implemented** (code on this branch) · **tested** (automated tests pass) · **verified** (signed-in browser check with evidence) · **deployed** (never, on this branch, without approval).

## Ground rules carried from the handoff

- Keep the existing Nordic Journal themes, colors, typography, scenery and logo. Map the new layouts onto existing tokens; do not import the library's palette or fonts.
- Today / Week / Plan stay the three destinations; Plan holds Year/Season/Month.
- Explicit user commands execute with saving/saved/failed + Undo. AI-originated suggestions are proposals.
- Voice, typing, touch, keyboard and drag call the same commands and write the same rows.
- No silent next-period rollover. Review carry-forward stays deliberate.
- Kiosk: shared content only; activities in progress never time out; calls confirm the recipient; no test calls without authorization.
- Routines: explain where/why each shows; hide-today, rest-until, off stay distinct; existing recurrence/occurrence semantics kept.
- Outlook/Apple calendars are later; UI stays provider-neutral; Google keeps working.
- No browser-exposed API keys; no room-audio claims until tested on the EMEET M0 Plus.

## Slices

| # | Slice | Status | Evidence |
|---|---|---|---|
| 0 | Inventory: implemented/persisted vs prototype-only | in progress | |
| 1 | Shared canvas primitives on existing tokens (item, group, connection, time strip, detail, conversation strip, save-state, receipts/Undo) | proposed | |
| 2 | Frame: Today/Week/Plan nav, active destination, date/period, Personal/Work/Family scope, phone + kiosk adaptations | proposed | |
| 3 | Today: side-by-side day scale + For today, compact grouped week column, on-today marks, conversation strip | proposed | |
| 4 | Week: space-efficient grouped shelf + days, drag/tap scheduling, completed hidden by default | proposed | |
| 5 | Plan: breadth-first horizons, group-under-parent, Unlinked, focus/show-all, link/unlink with keyboard/touch alternative, triage | proposed | |
| 6 | Conversation → canvas: commands with save states, proposals, partial failure retry, idempotent retries, Undo | proposed | |
| 7 | Kiosk: frame, dayparts, dinner→groceries→cooking→timers, interruption/return, departure, bedtime, calling via kidsPhone (confirm first) | proposed | |
| 8 | Routines: where/why it shows, hide-today/rest/off, conversational + manual build/edit | proposed | |
| 9 | Validation: desktop/phone/kiosk visuals in existing themes, keyboard/focus/reduced motion, disposable-account persistence, voice parity, regression suite, build, lint | proposed | |

## Inventory notes (2026-10-10, source-read)

Already implemented and persisted on main (reconcile, don't rebuild):
- Connected routes: `/today?view=alongside`, `/week?view=alongside`, `/{year,season,month}?view=constellation&horizon=n` forced by `lib/planning/connectedDestination.ts`. Nav Today·Week·Plan in `components/layout/PlanNavigation.tsx` (Plan opens month constellation).
- Plan map `components/plan/constellation/`: four horizon columns, focus branch + Show all, drag connections with single-step undo, triage menu (TaskFateMenu), completed toggle, independent entries, editor dialog with link picker (unlink = "No parent").
- Data: year intentions = `goals`; season/month/week = `tasks` + `task_commitments(level, period_start, status)`; parent = `source_id` (+ `goal_id` for year). Periods: `households.seasons`, `week_starts_on`. No automatic period rollover exists (only `useDayRollover` for the viewed date).
- Today: `TodayView.tsx` side-by-side day scale + For today; week aside is `TodayWeekColumn` (classic) or `AlongsideDay` (connected; suppresses the other). Already-on-today rows are filtered out, not marked. Details pane `TaskDetailPanel` → Tap*Panel per kind.
- Conversation: one shell assistant (`useSymphonyAssistant` → `symphony-agent` edge fn, claude-sonnet-4-6, RLS via user token). Voice (`useWorkspaceVoice`, OpenAI realtime via `workspace-voice`, allowlisted pilot) calls the same agent turn. Client learns tool names only; `plan_saved {id, level, date}` is the one structured event. No agent idempotency key; no undo for agent writes.
- Kiosk: `/wall-v2`, live face `moments/ConnectedWall.tsx`, moments in `lib/wall/wallMoment.ts`; recipe viewer + scaling + "add missing" to Groceries; no cooking mode/timers; mic disabled (2026-05-25); kid pages auto-close after 120 s.
- kidsPhone: `place-call` edge fn → kid-phone (Twilio) allowlisted contact ids; confirm dialog exists. Cancel/Hang up only dismiss UI; disabled contacts still listed. **Any real call rings the house handset — no test calls without Scott's go-ahead.**
- Routines: `resolveRoutine` ladder (resting → not-today → off → other-domain → not-theirs → in-collection → everyday). "Hide for today" currently rests the whole routine until tomorrow (visibility='reference' + paused_until). No event-relative routines.
- Theme: places (`data-place`), scenery lighting/style, Crimson Pro / DM Sans / Marcellus / Jost, `--color-primary-*`, `--color-neutral-*`, `--ds-*` layout scale, wall `WALL` tokens.

Out-of-scope findings to report (not changed here): `VITE_OPEN_BRAIN_API_KEY` is bundled to the browser; `voice-session` function referenced by `/plan-aloud` is not in the repo.

## Decisions and limitations

(filled in as work proceeds)
