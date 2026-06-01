# Today Cleanup Pass — Metrics, Inbox Zone, Static Rows — Design

**Date:** 2026-06-01
**Status:** Approved design, pre-implementation
**Surface:** Legacy `App.tsx` → `AppShell`/`HomeView`/`TodayView` (working default).

---

## Problem

After deleting the rail and the Focus/Weather cards, the Today view is calmer but still has **no visual hierarchy** — date, metrics, badges, email, and tasks all carry equal weight, and the date header is mis-aligned ("unmoored") from the now-centered content. Three targeted changes establish hierarchy and finish the calm:

1. **Metrics compete with the date.** "0 of 16 done / 8 this week / Clarity" sit at the same weight as everything else.
2. **The email card reads like a commitment** when it's really a triage input.
3. **Rows pop AI suggestion chips on hover** — jumpy desktop-only noise that doesn't work on touch and duplicates the (coming) proactive assistant.

## Non-Goals (YAGNI)

- No proactive assistant / NOW-NEXT card (assistant owns "what matters"; not here).
- No context bridge for metrics (decided against — see Part 1).
- No new email triage actions (convert-to-task/schedule) — keep existing acknowledge/snooze/dismiss; just reframe as an inbox zone.
- No removal of the proactive engine — only its per-row hover *display* is turned off.
- Mobile: the moved/demoted metrics are already desktop-only; no mobile change. Sidebar is desktop-only.
- New shell / cutover untouched.

---

## Part 1 — Metrics recede, date anchors

### 1a. Clarity → sidebar
- Add a compact Clarity readout to `Sidebar.tsx`, in a small block **under the greeting** (lines ~193–207), desktop-only.
- Compute it in the sidebar via `useSystemHealth({ tasks: entities.tasks, projects: entities.projects, projectsWithLinkedEvents: new Set() })` (same call TodayView uses). Clarity is a **pure function of tasks/projects**, so the sidebar computes it directly — no plumbing, no divergence.
- Render compactly: a small label `Clarity · {word}` where `{word}` derives from `health.healthColor` (`excellent`→Excellent, `good`→Good, `fair`→Fair, `needsAttention`→Needs attention), tinted by the same color. (A tiny ring is optional; a labeled chip is sufficient.)

### 1b. done-today / this-week → demoted in place
- Keep `done-today` and `this-week` in the TodayView stats row (they're computed there in `useTodayData` — leave them where the data lives), but **demote them visually**: smaller, muted, secondary — a slim line under the date, not a co-equal stat. They recede; the date dominates.
- Remove the **Clarity** trigger from the stats row / TodayView (it moved to the sidebar). The now-orphaned clarity-ring construction in TodayView (clarity circumference/offset/`clarityTrigger` JSX) and the `useSystemHealth` call become unused — remove what the compiler/linter flags. (If `health` is referenced nowhere else in TodayView after this, drop `useSystemHealth` from TodayView entirely.)
- The stats row keeps: the demoted done/week line, the **discussion badge**, the **weather chip**, and the **endControls** (assignee filter / Show-daily / Plan-day).

### 1c. Date header aligns to the content column ("the unmoored fix")
- `HomeHeader` (date + Day/Week/Month) is rendered in `HomeView` in a full-width `px-6` wrapper, shared by Today/Week/Month. Week/Month are full-width (correct for them). Only **Today** centers content at `max-w-[940px]`.
- **When `currentView === 'today'`**, wrap `HomeHeader` in the same centered column + matching padding as TodayView's content (`max-w-[940px] mx-auto`, `px-8` to match TodayView's `md:px-8`), so the date sits directly over the task list's left edge and Day/Week/Month aligns to the content's right edge. Leave Week/Month full-width.

**Result:** Date anchors a tidy centered column; metrics recede (Clarity in the sidebar, done/week as a muted line); discussion/weather/controls stay near the tasks.

---

## Part 2 — Email → Inbox/triage zone (#8)

- `EmailActionsBanner` (`src/components/schedule/EmailActionsBanner.tsx`) already renders **above** the timeline sections in TodayView (after the carried-over section, before the day sections). So it's not literally *in* the timeline — the fix is **framing**, not relocation.
- Reframe it as a clearly-delineated **Inbox / needs-triage zone**: a distinct header (e.g. "Inbox" with the count + urgent badge) and visual treatment that reads as *input to triage*, visually separated from the commitment timeline below. Keep the existing per-item actions (acknowledge / snooze / dismiss) and the 3-item + "+N more" behavior.
- Principle made visible: **the timeline below holds only commitments**; email lives in the inbox zone above it.
- (Convert-to-task / schedule actions are a future enhancement — out of scope.)

---

## Part 3 — Rows go static (#4)

Turn off the **hover-revealed proactive suggestion chips** so rows don't pop data on mouseover (jumpy, desktop-only, superseded by the assistant). Applies to BOTH row renderers:

- **`ScheduleItem.tsx`:** the suggestion chips are rendered in `<ExpandingPanel open={isHovered && !isMobile}>` (~lines 822/829–898). Stop showing them on hover — remove the hover-gated suggestion-chip panel from the row. Leave the always-visible content and the **location chip** + **Start-meeting** affordances as-is (those are useful actions, not data clutter — keep them, hover-gating unchanged).
- **`OverdueSection.tsx`:** the `OverdueCard` wrapper tracks `isHovered` and renders fallback `SuggestionChips` in `<ExpandingPanel open={isHovered}>` (~lines 238–250). Remove that hover suggestion display too, for consistency.
- The proactive engine and the suggestion props stay wired (other surfaces may use them) — we only stop the per-row hover *display*. Remove any prop/var that the compiler flags as unused after the panels are gone (don't force-remove shared props still referenced elsewhere).

**Result:** rows are quiet and static at rest and on hover — checkbox, title, chips, avatars, `···` menu — same on desktop, mobile, and the wall.

---

## Components touched

| File | Change |
|---|---|
| `src/components/layout/Sidebar.tsx` | add compact Clarity block under greeting (desktop-only), via `useSystemHealth` from `entities` |
| `src/components/home/HomeView.tsx` | center the `HomeHeader` wrapper when `currentView === 'today'` (align to content column) |
| `src/components/schedule/StatsRow.tsx` | remove `clarityTrigger`; demote done/week styling |
| `src/components/schedule/TodayView.tsx` | drop clarity pass + orphaned clarity-ring/`useSystemHealth`; demote done/week |
| `src/components/schedule/EmailActionsBanner.tsx` | reframe header/styling as an Inbox/triage zone |
| `src/components/schedule/ScheduleItem.tsx` | remove hover suggestion-chip panel (keep location/start-meeting) |
| `src/components/schedule/OverdueSection.tsx` | remove hover suggestion-chip panel |

**Keep:** the proactive engine/hooks, `useSystemHealth`, weather chip, discussion badge, location/start-meeting affordances.

---

## Testing

- **Sidebar Clarity:** a test rendering the sidebar with tasks/projects shows the Clarity label; mock `useSystemHealth` or feed fixtures so the label/color resolves. Confirm it's desktop-only.
- **StatsRow:** Clarity no longer rendered; done/week still present (now muted). Update `StatsRow`/`TodayView` tests that asserted clarity in the row.
- **HomeView header alignment:** assert the Today header wrapper carries the centered-column classes when `currentView==='today'` and not for week/month (a simple class-presence test, or snapshot of the wrapper).
- **EmailActionsBanner:** existing tests updated for the new Inbox framing/label; actions still fire.
- **ScheduleItem / OverdueSection:** assert suggestion chips do NOT render on hover (or are absent); existing tests updated. Confirm location/start-meeting unaffected in ScheduleItem.
- Full `npx vitest run` + `npm run build` + `npm run lint` (no new errors) before push.

## Out of scope (tracked elsewhere)
- Proactive assistant (owns "what matters now"; will use the freed right slot on-demand).
- New-shell blank-Today bug; sidebar reduction (#7); row metadata→hover (#4 ChatGPT direction — explicitly rejected in favor of static rows).
