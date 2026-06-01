# Delete the Today Rail + Weekend Label Clarity — Design

**Date:** 2026-06-01
**Status:** Approved design, pre-implementation
**Surface:** The **legacy** `App.tsx` → `AppShell` Today path (the working, default surface; `symphony.useNewTasks` flag OFF). NOT the new Shell (parked + blank-Today bug).

---

## Background / why legacy

Symphony is mid-migration from monolithic `App.tsx` (`AppShell` + 5-section `TodayRail`) to a new modular `Shell`. The new shell already deletes the rail by design — but it renders a **blank Today** (bug) and the migration is **paused**, so legacy `App.tsx` is the only working Today and will be for the foreseeable future. We make the change there. (New-shell blank-Today bug is tracked separately; out of scope.)

## Problem

1. The Today right rail (`TodayRail`: At a Glance, For Discussion, Family Snapshot, Active Projects, Scratchpad) is five always-on, mostly read-only status panels. Scott uses only **For Discussion**; the rest is clutter ("35 tasks still open," "Scott 25 open" vanity counts). It makes the surface feel busy and informational rather than calm and operational.
2. The "This Weekend" / "Next Weekend" scheduling presets (shipped earlier) don't show *which* dates they mean — ambiguous (on a Monday, what is "This Weekend"?).

## Goals

1. **Delete the rail.** Remove `TodayRail` and its now-dead sections; give the reclaimed width back to a **centered** timeline. Calm by default.
2. **Keep For Discussion** as a glanceable **stats-row badge**, not a panel.
3. **Disambiguate the weekend presets** by showing the resolved date inline in the button label.

## Non-Goals (YAGNI / explicit)

- No standalone "feed" — that's absorbed into the separate proactive AI assistant Scott is building. Not here.
- No changes to the new Shell / no flipping `symphony.useNewTasks` / no fixing the blank-Today bug (separate task).
- No deletion of `ScratchpadPane` the *component* (still used by the parked new shell's `ShellScratchpadHost`) — it just stops rendering once `TodayRail` is gone.
- No deletion of `useScratchpadHidden` (still used by Shell + ScratchpadPane).
- No deletion of `lib/discussionItems` (reused by the new badge).
- Mobile unchanged (rail already hidden on mobile).

---

## Part 1 — Weekend label clarity

The weekend presets in **both** pickers show the resolved date inline:

```
This Weekend · Sat Jun 6
Next Weekend · Sat Jun 13
```

- `src/components/triage/SchedulePopover.tsx`: the "This Weekend" / "Next Weekend" buttons append the formatted date from `getNextWeekend()` / `getWeekendAfterNext()`.
- `src/components/triage/WhenPicker.tsx`: same for its two weekend buttons.
- Use a compact formatter (e.g. `formatDateLabel` / `formatTimeCompact` from `dateHelpers`, or a short `toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })`) → "Sat Jun 6". Decide the exact formatter in the plan; keep both pickers consistent.
- Works on touch/wall (no hover). Tested in `WhenPicker.test.tsx`; `SchedulePopover` has no test harness (verify by typecheck + the formatter being pure).

## Part 2 — Delete the rail

### Remove from `AppShell` (`src/components/layout/AppShell.tsx`)
- Remove the `<aside>` that renders `<TodayRail … />` (~lines 570–597).
- Remove the `scratchpadVisible ? '380px'` branch from the `<main>` `marginRight` logic (~lines 253–268) so that when no detail panel is open, the main area is full width.
- Remove now-dead rail wiring: `scratchpadSlot`, `scratchpadVisible`, `scratchpadHidden`/`useScratchpadHidden` usage *in AppShell only*, `onRailSelectTask`, `railFamilyMembers`, and the rail-only props threaded from `App.tsx`. (Keep the detail-panel and chat/focus-mode slot logic intact — that's how the on-select drawer and the future assistant use the right slot.)
- Clean up the corresponding props passed from `App.tsx` to `AppShell`.

### Delete dead components + tests (rail-only)
Verified used **only** by `TodayRail`:
- `src/components/today/TodayRail.tsx`
- `src/components/today/AtAGlance.tsx` (+ `AtAGlance.test.tsx`)
- `src/components/today/FamilySnapshot.tsx` (+ test if present)
- `src/components/today/ActiveProjects.tsx` (+ test if present)
- `src/components/today/ForDiscussion.tsx` (+ test if present) — its data source `lib/discussionItems` is **kept** and reused by the badge.

(Plan step must re-grep each file's importers immediately before deleting, in case other in-progress sessions added a usage.)

### Timeline centering (`src/components/schedule/TodayView.tsx`)
- The content container is `max-w-[940px] w-full … md:pl-10 md:pr-8` — currently left-aligned in the space beside the rail. With the rail gone, **center it** (e.g. `mx-auto` and balance the left/right padding) so the readable-width timeline sits centered in the full area rather than hugging the left with empty space on the right.
- Do **not** widen `max-w-[940px]` — keep lines readable (task rows look sparse stretched full-bleed).

### For Discussion → stats-row badge
- In the Today stats row (rendered via `StatsRow` in `TodayView.tsx`, the "N of M done today · This week N · Clarity" row), add a badge: `💬 N to discuss` (lucide `MessageSquare` icon, per the no-emoji rule — use the icon, not the literal emoji).
- Computed from the same `discussionItems(...)` the rail used. Wire that data down to `TodayView`/`StatsRow` (it was previously computed near `App.tsx`/`AppShell` for the rail).
- **Shown only when count > 0**; hidden entirely when empty (no "Nothing to discuss" text).
- Click → a small popover listing the discussion tasks (reuse the row/title/note shape from the old `ForDiscussion`); clicking a row calls the existing select handler → opens the task in `TapContextPanel`. No new detail UI.

---

## Components touched

| File | Change |
|---|---|
| `src/components/triage/SchedulePopover.tsx` | weekend button labels show resolved date |
| `src/components/triage/WhenPicker.tsx` (+ `.test.tsx`) | weekend button labels show resolved date |
| `src/components/layout/AppShell.tsx` | remove rail aside + margin branch + dead wiring |
| `src/App.tsx` | remove rail-only props passed to AppShell |
| `src/components/schedule/TodayView.tsx` | center the timeline; render discussion badge in stats row |
| `src/components/schedule/StatsRow.tsx` (or new `DiscussionBadge.tsx`) | the badge + popover |
| **Delete:** `TodayRail`, `AtAGlance`, `FamilySnapshot`, `ActiveProjects`, `ForDiscussion` (+ their tests) | dead after rail removal |

**Keep (do not delete):** `ScratchpadPane`, `useScratchpadHidden`, `lib/discussionItems` — all still used elsewhere (new shell / badge).

---

## Testing

- `WhenPicker.test.tsx`: assert weekend buttons show the resolved date string.
- Discussion badge component: hidden when count 0; shows count when > 0; click opens popover; row select fires the select handler. New focused test.
- `TodayView.test.tsx`: update/confirm it still renders after rail removal; assert the discussion badge appears when discussion items exist and is absent when none. Confirm no `TodayRail` import remains.
- Deleting `AtAGlance.test.tsx` etc. removes their tests — confirm the suite is green after deletion (no dangling imports).
- Full `npx vitest run` + `npm run build` (strict `tsc -b`) + `npm run lint` (no new errors) before push.
- Guard: confirm no remaining importers of the deleted components (`rg` for each name → only self/test, which are also deleted).

---

## Out of scope (tracked elsewhere)
- New Shell blank-Today bug + auth-gate lift (the parked migration).
- The proactive AI assistant / feed (Scott's separate build) that will occupy the now-free right slot on-demand.
