# Month Session — Best Laid Plans Arc Alignment

**Date:** 2026-07-23
**Source brief:** vault `ideas/month-session-best-laid-plans-arc.md`
**Program:** Canvas Cycle 3 (session-side; coach-rail architecture deferred — this keeps the current full-screen wizard)
**Approved by Scott:** architecture (keep wizard, resequence), fun = chips-only on write step, maintenance = List template → month moves, narration disabled globally.

## Problem

The /month **spread** now matches Hart-Unger's model (shipped 88fe84a7); the **session** doesn't walk her process. The guided monthly wizard's steps neither open with wins, nor migrate-or-release, nor sweep life maintenance, nor compose fun deliberately.

## Scope

Monthly session only. The /month spread is DONE — zero changes to it. Weekly/season/annual sessions untouched except where narration-disable is global. No coach-rail rebuild.

## Design

### 1. Narration disabled globally

`narration.manifest.json` → `{ "bootstrap": true, "clips": {} }`. Every `narrationClip()` lookup returns null → all steps render narration as on-screen text, no audio. The drift-guard test's bootstrap branch (warn, expect empty clips) keeps the suite green while we reword freely. `public/narration/*.mp3` files stay on disk (harmless; regeneration overwrites). Re-enabling later = `ELEVENLABS_API_KEY=… npm run narration`.

### 2. Monthly step resequence (`sessions.ts`)

New order (arc step in parens):

| # | id | type | change |
|---|----|------|--------|
| 1 | `welcome` | narration | reword: frame the ritual arc (wins → migrate → calendar → self → write → fun → upkeep → book) |
| 2 | `wins` | **wins (NEW)** | (1) completed month moves, celebratory, read-only |
| 3 | `month-review` | review | (2a) reword to migrate-or-release framing; existing carry/release machinery |
| 4 | `look-at-season` | look-above | (2b) MOVED earlier; reword toward season check-in + copy-down migration |
| 5 | `month-ahead` | calendar | (3) MOVED before writing; reword to "what's already claimed?" |
| 6 | `look-within` | reflect | (4) unchanged position semantics; stays one prompt, one stored line |
| 7 | `projects-in-motion` | projects | reference fuel kept adjacent to the write step |
| 8 | `write-month` | write-list | (5)(6) gains fun-composition chips via `props.funComposition: true` |
| 9 | `maintenance` | **maintenance (NEW)** | (7) List-template sweep |
| 10 | `book-next` | book-next | (8) unchanged |

Period tokens, bucket (`month`), and session persistence keys are untouched — resume via `notes.stepIndex` still works (a saved index now lands on a neighboring step at worst; acceptable, sessions are short).

### 3. Wins step (new step type `wins`)

`WinsStep.tsx`: reads `host.tasks` for `bucket === 'month' && completed`, renders them as a celebratory list with a count line ("You closed N moves this month"). Zero-state: one warm line, never guilt. No actions — read-only beat. Registered in the step registry; narration string in config like every step.

### 4. Fun composition chips (write step, monthly only)

`WriteListStep` already has the ✨ isFun row toggle and `funRatio` tally. Add, gated on `props.funComposition`: a small chip row above the tally naming Hart-Unger's recipe — **One big experience · A few social things · A themed quest (optional)**. Chips are a static recipe hint plus the existing `funRatio` line; no per-chip auto-classification (no AI, no new fields). Only the monthly config sets the prop.

### 5. Maintenance sweep (new step type `maintenance`)

`MaintenanceStep.tsx`:
- Finds the user's List titled **"Monthly upkeep"** (via `useLists`); if absent, creates it (category `home`, visibility `self`) and seeds five starter items: *Reconcile budget (YNAB) · Paper & mail sweep · One declutter target · Household supply blitz · Meal-ops reset*.
- Renders each open list item with an "Add to this month" checkbox. Confirmed items create month moves via the host's add-task path **with `bucket: 'month'` in the initial options** (never add-then-setBucket — known race).
- Dedup: an item whose title already matches an open month task renders as already-in ("on the list ✓", disabled).
- The List is the durable template — items are never deleted by the wizard; editing the template happens in the normal Lists UI.

### 6. Tests

- `sessions.test.ts`: monthly step order + new ids/props.
- `registry.test.ts`: two new types registered.
- `WinsStep.test.tsx`, `MaintenanceStep.test.tsx`: zero-state, populated, seed-on-absent, dedup, bucket-in-options assertion.
- `WriteListStep.test.tsx`: chips render only with `funComposition`.
- `narration.test.ts`: passes via existing bootstrap branch (no edits expected).

## Non-goals

Coach-rail architecture; weekly/season/annual resequencing; routine-based maintenance; isFun surfacing on the /month spread; ElevenLabs regeneration; habit streaks.
