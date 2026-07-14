# Per-domain planning — design

**Date:** 2026-07-14 · **Status:** approved by Scott (chat)

## What

Let each life domain (Work / Family / Personal) run its own guided planning
sessions and keep its own horizon lists, while Universal keeps today's
whole-life behavior untouched.

## Decisions (made with Scott)

1. **Universal = whole-life session** — current behavior preserved; existing
   `planning_sessions` rows stay valid as the universal sessions.
2. **Untagged (context-null) items are hidden in domain sessions** — they live
   at the whole-life level and are reviewable in Universal.
   **Exception:** the weekly *inbox* step shows domain-tagged **plus untagged**
   items — inbox is pre-triage; tagging is the work. Triaging an untagged item
   from a domain session also stamps it with that domain (otherwise it would
   route into a list that the session immediately hides).
3. **Text-only narration variants for now** — domain-variant lines display
   silently (the manifest's exact-text match falls back by design); Universal
   stays fully voiced. Variant audio can be generated later with one run of
   `scripts/generate-narration.ts`.
4. **Calendar steps stay whole-life** — time is one calendar; cross-domain
   conflicts are the point of the look-ahead steps.

## How

### Storage — no schema change

Sessions stay keyed by `(author_id, horizon, period_token)`. Domain sessions
suffix the token: `2026-W29` (universal, unchanged) vs `2026-W29|work`.
Reflections, resume position (`stepIndex`), and all notes become per-domain
automatically. `usePlanningSession` is the only DB consumer; RLS untouched.

### Domain scoping — one place

`src/lib/today/domainFilter.ts` (new):

- `matchesDomain(context, domain)` — universal matches everything; a domain
  matches only its exact context (null ⇒ universal only).
- `filterTasksForPlanning(tasks, domain)` — the session pool: exact-context
  matches plus the untagged-inbox exception.
- `domainSessionToken(baseToken, domain)` — the `|domain` suffix.

`GuidedSessionContainer` filters `tasks`, `projects`, and `goals` through this
before building the host, so every step (review, write-list, look-above,
schedule-grid, projects-in-motion, someday, overdue) is domain-scoped with no
per-step changes. `GoalsApp` precedent is matched: universal shows all goals,
a domain shows only its own.

### Narration variants

`GuidedStepConfig` gains `byDomain?: Partial<Record<work|family|personal,
{ narration?: string; placeholder?: string }>>`. `GuidedSession` resolves the
display/spoken text per domain; `narrationClip` lookups on variant text miss
the manifest and render silently. Variants only where whole-life language
appears:

- monthly `look-within` ("each other and the kids") — work + personal variants
- weekly `concerns` ("the written half of the weekly conversation") — work +
  personal variants
- annual `write-goals` (areas-of-life framing) — per-domain framing

### UI touches

- Session header shows a domain chip (icon + label, matching DomainSwitcher)
  when not universal.
- `BookNextStep` prefixes the booked event/task title with the domain label
  ("Work — Seasonal planning session") so parallel sessions don't collide.
- Horizon one-pager pages (`HorizonView`) filter pool, carry-over, rail
  counts, and the reference panel by the app domain switcher.

### Out of scope

Calendar scoping by calendar-domain mappings; variant audio generation;
per-domain daily plan on the Today page (Today already follows the domain
switcher elsewhere).

## Testing

Unit tests for the filter/token helpers, container-level scoping, narration
variant resolution, and the untagged-inbox exception. All existing
universal-path tests must pass unchanged (Universal behavior is untouched).
