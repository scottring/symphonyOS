# Symptom Tracking — Design

**Date:** 2026-07-04
**Status:** Approved by Scott
**Builds on:** the medication tracker (shipped, `docs/superpowers/specs/2026-07-01-medication-tracker-design.md`)

## Purpose

Log Parkinson's symptoms with a timestamp and severity, and see them **interleaved
with doses on the same timeline** — so patterns like "an 'off' symptom lands 20
minutes before the next dose" or "dyskinesia after a peak" become visible. The
symptom model deliberately mirrors the medication model so the two datasets sit
side by side.

**V1 is web/in-app only** (no voice/Siri — that's a documented follow-up). Entry
is fast: symptom type + severity + timestamp + optional note.

## Data model (new migration)

Mirrors `medications` / `medication_logs`.

### `symptoms` — the user's tracked symptom types
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | FK auth.users, RLS owner-only, `default auth.uid()` |
| name | text | e.g. "Tremor", "Off", "Dyskinesia", "Stiffness" |
| active | boolean | default true |
| sort_order | int | default 0 |
| created_at / updated_at | timestamptz | |

### `symptom_logs` — the events
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | RLS owner-only, `default auth.uid()` |
| symptom_id | uuid | FK symptoms, on delete cascade |
| severity | smallint | 1=mild, 2=moderate, 3=severe; CHECK (severity between 1 and 3) |
| logged_at | timestamptz | the real moment the symptom occurred; `default now()` |
| note | text | |
| created_at | timestamptz | |

- **RLS owner-only** on both (private health data), same pattern as the meds tables.
- **Both tables added to the `supabase_realtime` publication** (idempotent guarded
  block) — the hooks refresh via `postgres_changes`, so this is mandatory (the meds
  build was bitten by omitting it).
- No token table / edge function needed — v1 is web-only, logging goes through the
  authenticated supabase-js client under RLS.

## Types

`src/types/symptom.ts`:
- `Symptom { id, userId, name, active, sortOrder, createdAt, updatedAt }`
- `SymptomLog { id, symptomId, severity: 1|2|3, loggedAt: Date, note?, createdAt }`
- `Severity = 1 | 2 | 3` with a `SEVERITY_LABELS` map (`1:'Mild', 2:'Moderate', 3:'Severe'`).

## Hooks

Copied from the med hooks (Supabase CRUD + user-scoped realtime, `useCallback`):
- `useSymptoms() => { symptoms, loading, error, addSymptom, updateSymptom, deleteSymptom }`
- `useSymptomLogs({ sinceDays? }) => { logs, loading, error, logSymptom, updateLog, deleteLog }`
  - `logSymptom(symptomId, severity, loggedAt?, note?)` writes `logged_at` = provided or now.

Each hook exports its `dbXToX` mapper, unit-tested (mirrors the meds hook tests).

## UI — folded into the page, renamed to "Health"

The existing `/meds` app becomes the health tracker. The **sidebar label and page
heading change from "Meds" to "Health."** The **route stays `/meds`** (internal,
not user-facing) to avoid churn; renaming the route is a trivial future change if
wanted.

The three tabs (Today / Timing / Manage) evolve:

### Today tab
Unchanged meds behavior, plus a compact **"Log symptom"** control: tap a symptom
chip → tap a severity (Mild / Moderate / Severe) → logged at now. One or two taps,
built for in-the-moment capture. Renders below the existing per-med schedule strip.

### Timing tab — the payoff
Symptom events are **interleaved into the same per-day chronological list as
doses**, in `logged_at`/`taken_at` order, visually distinct from doses:
- A symptom row shows its time, a distinct icon/color (not the dose pill styling),
  the symptom name, and a severity indicator (label + a 1–3 intensity cue, e.g.
  color ramp mild→severe).
- Doses keep their existing rendering (time + interval since previous dose).
- The result reads chronologically: `7:00 Carbidopa/Levodopa · 8:40 Tremor
  (Moderate) · 11:00 Carbidopa/Levodopa`, making the dose↔symptom relationship
  legible in sequence.
- Symptom rows are tap-to-edit (severity, time) and deletable, same affordances as
  dose rows, with a delete confirmation.
- The existing 7/30-day range toggle applies to both. The med filter dropdown gains
  the symptom types (or a simple "show symptoms" that is on by default) — keep it
  simple: the range toggle filters both; symptoms always shown.

Implementation note: build a unified per-day chronological merge of dose logs and
symptom logs into one sorted list of typed rows (`{ kind: 'dose' | 'symptom', ... }`),
computed by a small pure helper at `src/lib/meds/timelineMerge.ts` (the meds lib
dir already hosts `slotMatching.ts` / `intervals.ts`) that is unit-tested. Dose
intervals still compute from doses only.

### Manage tab
Gains a **Symptoms** section next to Medications: add / rename / deactivate tracked
symptom types (same card style as the med list). No schedule/severity config on the
symptom type itself — severity is per-log.

## Error handling
- Hooks surface Supabase errors in state (same as the med hooks).
- Destructive deletes (a symptom type cascade-deletes its logs; a symptom log
  delete) require a `window.confirm` guard, matching the meds convention.
- `logged_at` is timestamptz; all display uses local time (single-user, single-zone).

## Testing
- Vitest units for: the `dbSymptomToSymptom` / `dbLogToSymptomLog` mappers; the
  chronological dose+symptom merge helper (ordering, mixed kinds, day grouping).
- Follows the meds hook-test pattern. UI tabs verified via `npm run build` (no
  browser-login available in the build environment).

## Build order
1. Migration (tables + RLS + realtime publication) — apply to prod via Management API.
2. Types + the pure timeline-merge helper (TDD).
3. Hooks (`useSymptoms`, `useSymptomLogs`) with mapper tests.
4. Manage tab: Symptoms list (CRUD).
5. Today tab: quick "Log symptom" control.
6. Timing tab: interleave symptom rows with doses (uses the merge helper) + edit/delete.
7. Rename "Meds" → "Health" (sidebar label + page heading).

## Out of scope (documented follow-ups)
- Voice / Siri symptom logging (reuse the meds token + a `log-symptom` path).
- Visual time-axis strip (doses lane + symptoms lane with severity as bar height) —
  a richer alternative to the interleaved list.
- Neurologist export (symptoms + med timing as a report/printout).
- Symptom reminders / prompts.
- Renaming the `/meds` route to `/health`.
