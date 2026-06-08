# Symphony OS — Release Notes

## v1.0.0 — "Everything in its Right Place" (2026-06-08)

The first coherent release. Symphony went from ~30 disconnected entry points and
a "feeling lost" experience to one named operating model, end to end.

### The operating model
- **Two axes that compose:** life-area (work / personal / family) × scope
  (individual / couple / compound), with sensible default couplings at capture.
- **Visibility ≠ responsibility:** scope controls who sees an item; assignee
  controls who does it; everyone in a shared scope sees the item regardless of
  who owns it.
- **Horizon backbone:** Today → Week → Month → Season → Year. Each surface shows
  only its own pool + carry-over — never the firehose.

### The planning rhythm
- Daily → Weekly → Monthly → Seasonal → Annual cadence sessions, each with a
  verbatim agenda, shared via the `planning_sessions` table.
- Goals ↔ rhythm cascade: breaking a goal down creates linked tasks that carry
  the goal's project as their umbrella.
- Why-chain: Task → Project → Goal ancestry, surfaced (never required).

### Surfaces
- **Today** is the spine; the sidebar collapses to the rhythm + a library.
- **Us** couple view and the **wall** (compound) as shared surfaces.
- One unified detail panel across tasks, routines, events, and meals.

### Capture & triage
- Zero-friction capture; one fan-out triage menu (`TriageWhen`) everywhere.
- One-tap reschedule via a shared icon grid + specific date/time picker.
- Subtasks are individually triageable.

### Places & directions
- Combined Contacts + Google Places search in the People picker (auto-creates a
  local contact on place select), via the resilient `places-proxy` edge function.
- Location + directions on tasks, events, **and** routines.

### Detail-pane polish
- Removed confusing/redundant meta rows and dead controls.
- Outline "Complete" button; relatedness-ranked "Might be relevant" that shows
  completed items as completed.
- Routine visibility is a real on/off switch ("Show on Today's timeline").

### Foundation
- Scope axis enforced at the database via RLS + `users_share_household()`.
- Unified visibility filter shared across Today / Week / Month / Inbox / wall.
- Egress mitigations (quiet-hours gating of the always-on wall pollers).
