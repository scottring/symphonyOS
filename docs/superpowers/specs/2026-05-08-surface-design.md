# Surface — Design Spec

**Date:** 2026-05-08
**Status:** Draft (post-brainstorm)
**Mockups:** `.superpowers/brainstorm/81727-1778231634/content/`

---

## Summary

Symphony's stated insight is *"captured information doesn't surface at the right time with the right context."* The Surface stage of the capture-to-execute pipeline is the layer that fulfills that promise. This spec defines a unified Surface design across two paired layers:

- **D — Tap-to-context.** A single-scroll, no-tabs entity panel that generalizes across tasks, contacts, projects, and events. The panel is the workhorse for understanding and acting on any entity, and it makes pre-linked context (people, links, phone numbers, related items) first-class rather than buried.
- **B — Ambient wall.** A hybrid kiosk layout with a persistent rail and a responsive focus area. The wall surfaces what's *imminent* (not what time it is), and tapping a card peeks more context without opening edit affordances on the family-shared screen.

Together they implement the "right info, right moment, right context" promise: D handles deep, on-demand context; B handles passive, glanceable context.

---

## Background

This design unifies and supersedes several earlier in-flight specs:

- `tasks/detail-panel-redesign.md` — earlier detail panel cleanup work
- `tasks/detail-panel-hierarchy-redesign.md` — entity view hierarchy
- `tasks/contextual-surfacing-features.md` — directions + recipes contextual features

It also builds directly on the recently merged Phase 1A kiosk work (`RoomsKioskView`, `SpaceKioskView`, `AssetKioskModal`) and the Wall Calendar | Rooms tab toggle.

The redesign was approached via a six-stage pipeline framing — Capture → Triage → Schedule → Surface → Execute → Learn — with this spec scoped to Surface only. Capture and Triage are intentionally out of scope and are the natural next brainstorms.

---

## Locked design decisions

### D — Tap-to-context panel

1. **Single-scroll, no tabs.** Sections flow vertically with prioritized content. The panel is read-and-act in one view, no mode-switching.

2. **Canonical section order:**
   1. Header (title, close, edit-in-place)
   2. Meta line (domain chip, who/what/when, creator)
   3. Quick actions (verb-first: Done, Call, Schedule, etc.)
   4. Why / What / About (the entity's purpose — section name varies per entity type)
   5. People (first-class: contact card, assignee, mentioned)
   6. Linked (pre-linked entities: project, event, files, sibling tasks)
   7. Might be relevant (heuristic / AI suggestions — see decision 6)
   8. Footer (creation provenance, last update, history pointer)

3. **Same shape across entity types.** Tasks, contacts, projects, and events all use this scaffold with light renaming. Contacts get an "Open with them" section in place of "Linked"; projects get "Open work" + "Upcoming"; events get "What to bring." This gives the user one mental model for all panels.

4. **Cross-entity navigation: alongside on desktop, stack on mobile.** Tapping a linked entity (e.g., "Liam" in the People row) opens that entity's panel to the right of the current one on desktop. On mobile (no room), it pushes onto a stack with a back affordance. Cap stack depth at 3 with collapse beyond that.

5. **Inline edit.** Tap any field to edit, save on blur. Matches the existing asset panel pattern. No separate edit mode.

6. **"Might be relevant" — staged rollout:**
   - **Phase 1: heuristic only.** Same-contact, same-person, keyword-match-in-saved-notes. Each item shows a visible reason ("same contact · 8 weeks ago"). Predictable, ships in days.
   - **Phase 2: heuristic + AI ranker.** Heuristic surfaces ~10 candidates; an LLM ranks the top 3 given the entity's title and notes. The LLM only sees structured candidates — bounded privacy, bounded cost.
   - **Phase 3 (long-term): sectioned — Pinned / Recent / Symphony notices.** Three labeled lanes. AI gets its own dismissible "Symphony notices" section. Most honest about provenance.

7. **L2 domain awareness — viewer-aware actions.** Every panel header shows a domain chip (Family / Work / Personal). The panel's primary action shifts by who is viewing: the assignee gets verb-driven actions ("Done", "Call"), other family members get coordination verbs ("Check in with Iris", "Reschedule"). Same content, different default action.

   Privacy gating (L3 — work/personal panels strip family-share UI and become invisible to the kiosk) is **not in scope** for this spec; it can be layered on later without changing the panel shape.

### B — Ambient wall

8. **Hybrid layout: persistent rail + responsive focus.** Three regions:
   - **Persistent header** — date, time, weather, who's where (always-on).
   - **Standing rail** — meals, lists, "for discussion" items, family status (slow-changing context).
   - **Focus area** — the most imminent thing right now (e.g., "In 15 min: school pickup"), with the most relevant context surfaced inline (phone numbers, who's on it, prep).

   The focus area responds to **imminence**, not to a hardcoded time-of-day schedule. ("What's the next thing within ~30 min?") This avoids the brittle "morning brief" / "afternoon block" rotation logic that's easy to get wrong.

9. **Tap = peek expansion + handoff to phone.** Tapping a wall card opens an expanded ambient view — the panel's contents in larger, glance-able format, **read-only**. For real edits, the wall offers a "Send to phone" handoff that opens the panel on the user's phone or desktop. The kiosk stays glance-and-capture; deep work happens on personal devices.

   Existing kiosk surfaces (Rooms, Assets) keep their established interaction patterns. This rule applies to new schedule/task/event/contact cards.

---

## Architecture

### Component model

- **`<TapContextPanel entity={...} viewer={...} />`** — new unified panel component. Replaces / consolidates `DetailPanel`, `TaskView`, `ProjectView`, `AssetDetailPanel`, `ContactDetail`, `EventDetail` over time. Single render path with section-rendering driven by entity type.

- **Section components** — each canonical section is its own component (`PanelHeader`, `PanelMetaRow`, `PanelActions`, `PanelWhy`, `PanelPeople`, `PanelLinked`, `PanelMightBeRelevant`, `PanelFooter`). Empty sections render nothing (do not show "None" or empty placeholders).

- **`<WallAmbient />`** — composes the wall: `<WallHeader />`, `<WallStandingRail />`, `<WallFocusArea />`. Receives the same data layer as the panels but renders read-only ambient form.

- **`<PeekExpansion />`** — the wall's tap result. Renders the panel's content in a larger, no-edit format. Shares the section components with `<TapContextPanel />` but renders them in display-only mode.

### Data flow

The panel and the wall consume the same upstream data — tasks, events, projects, contacts, people, links — through the existing context providers. No new data shape is required for D; the new query is **"who/what is linked to this entity"**, which is mostly already encoded via `contact_id`, `project_id`, `linked_event_id`, `assigned_to`, `linkedTo`, etc.

The "Might be relevant" section is the only new query path:

- **Phase 1** is a heuristic query that runs on panel open: same-contact tasks, same-person tasks, keyword matches in notes. Likely cacheable per session.
- **Phase 2** introduces a ranker call to a small LLM via Open Brain or the AI Gateway. Inputs are the entity's title/notes plus the structured candidate list. Outputs are 3 ranked candidates plus reasons.
- The wall's focus area uses an **imminence query** ("what entity, scheduled for the next ~30 min, has the most surrounding context worth surfacing?") that runs on a slow tick (every minute or two).

### Domain awareness (L2)

Each panel computes a `viewerRole` from the active user × the entity's `assigned_to` / `created_by` / `domain`:

- `assignee` → verb-first primary action (Done, Call)
- `coordinator` (creator who isn't the assignee) → coordination verb (Check in)
- `observer` (other family members) → minimal actions

The same data is rendered; only the action affordances and primary verb differ.

---

## Edge cases

- **Empty linked sections.** A new task with no contacts/projects/links shows nothing for those sections — sections do not render with placeholder text. This keeps the panel honest (sparse panels look sparse, not template-y), at the cost of a thin panel for new captures. *Mitigation: Capture/Triage stages should make linking nearly automatic.*

- **Mobile vs desktop.** Same content, same section components. On mobile the panel is a bottom sheet; on desktop, a side panel that can open alongside (cross-entity nav decision 4). On the wall, peek-expansion is a full-area overlay.

- **Empty / quiet wall.** When no entity is imminent (gap between events), the focus area shows the standing rail content larger or rotates a family photo. Avoid empty states.

- **Multiple imminent items.** When two events are within the imminence window, the focus area splits into two cards or shows the first with an "and" note ("In 30 min: pickup · then 5p soccer").

---

## Out of scope

These are real questions but defer to other brainstorms or later phases:

- **Pre-linking automation.** How tasks/contacts/projects get linked in the first place. This is the Capture stage — without good linking, the panel often looks empty. Next brainstorm.
- **L3 privacy gating.** Hiding work/personal entirely from the wall and from family members. Layer on later.
- **AI ranker prompt details.** The actual LLM call shape, model choice, latency budget, error fallback. Defer to Phase 2 implementation plan.
- **Time-of-day wall rotation.** Considered and rejected in favor of imminence-based focus. May revisit.
- **Recurring task expansion.** Tracked as a separate gap (currently routines cover daily/weekly only).
- **iMessage and Granola ingestion paths.** External integrations are a separate brainstorm.

---

## Migration path

This redesign supersedes prior detail-panel work. Suggested order:

1. **Build `<TapContextPanel />` for tasks first.** Wire it behind a feature flag alongside the current `DetailPanel`. Validate the IA on real data.
2. **Add Phase 1 heuristic "Might be relevant."** Confirm the section earns its keep before building the AI ranker.
3. **Generalize to contacts, projects, events.** Replace each entity-specific view incrementally.
4. **Add cross-entity navigation (alongside / stack).** Once panels exist for all four types.
5. **Add domain chip + viewer-aware actions (L2).**
6. **Build `<WallAmbient />` hybrid layout.** Reuse section components.
7. **Add peek-expansion + send-to-phone handoff.**
8. **Phase 2 of "Might be relevant" — AI ranker.**
9. **Retire `DetailPanel`, `TaskView`, `ProjectView`, etc.** once `<TapContextPanel />` covers all paths.

Each step is independently shippable and reversible.

---

## Open questions for the implementation plan

- What's the exact heuristic set for Phase 1 "Might be relevant"? Same-contact + same-person + keyword-in-notes is a starting point, but tuning needs real-world testing.
- Should the alongside-on-desktop mode use a fixed two-pane layout or push existing content over? Affects the rest of the desktop layout.
- What's the right "imminence window" for the wall focus area? 30 min? 60 min? Configurable? Probably needs experimentation.
- The "send to phone" handoff — push notification? Universal link? Symphony web URL? Pick one.
- What's the rule for empty sections — never render, render with placeholder, render with "Add..." affordance? Spec says "never render," but Add affordances may help the empty-panel risk.
