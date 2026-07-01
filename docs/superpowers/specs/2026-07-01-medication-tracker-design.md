# Medication Tracker + Voice Logging — Design

**Date:** 2026-07-01
**Status:** Approved by Scott
**Approach:** Dedicated meds domain + edge-function logging (Approach A)

## Purpose

A timing log for Scott's Parkinson's medications. The core job is capturing
*when each dose was actually taken* (levodopa intervals matter), logged
hands-free by voice from iPhone or Apple Watch, and reviewed on a web page.

**V1 is log-only.** No reminders/notifications, no Today-view or wall
surfacing, no family members' meds. Those are documented follow-ups.

## Why not routines?

Routine completions live in `actionable_instances`, a date + slot checklist
model. It cannot cleanly express "took dose #3 at 2:47pm plus an extra half
dose at 5pm," and the per-dose expansion work lives on the unmerged
`routine-collections` branch. A dedicated domain keeps timestamps first-class
and keeps this feature independent. If doses should later appear on
Today/the wall, the migration path is Approach C: mirror each medication as a
routine for visibility while `medication_logs` stays the source of truth.

## Data model (new migration)

### `medications`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | FK auth.users, RLS owner-only |
| name | text | e.g. "Carbidopa/Levodopa" |
| strength | text | free text, e.g. "25/100 mg" |
| schedule_times | jsonb | array of local `"HH:MM"` strings |
| active | boolean | default true |
| notes | text | |
| sort_order | int | |
| created_at / updated_at | timestamptz | |

### `medication_logs`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | RLS owner-only |
| medication_id | uuid | FK medications, on delete cascade |
| taken_at | timestamptz | the real moment the dose was taken |
| source | text | `'siri' \| 'shortcut' \| 'web' \| 'manual'` |
| note | text | |
| created_at | timestamptz | |

Extra/PRN doses are ordinary log rows that don't match a schedule slot — no
special casing in the schema.

### `med_log_tokens`
| column | type | notes |
|---|---|---|
| user_id | uuid pk | |
| token | text unique | long random secret |
| created_at | timestamptz | |

A static Shortcut on the Watch cannot refresh a Supabase JWT, so it
authenticates with this durable per-user token (same pattern as the
vault-sync webhook). RLS owner-only for reads; the edge function validates it
with the service role.

## Logging endpoint — `log-medication` edge function

- `POST` with header `x-med-token: <token>`; `verify_jwt = false`.
- Body: `{ "medication": "levodopa" | "all", "taken_at"?: ISO8601, "note"?: string }`
- Behavior:
  - Validate token → resolve `user_id`; 401 on failure.
  - `"all"` → insert one log per active medication, `taken_at` = provided or now.
  - Otherwise case-insensitive substring match against active med names.
    - Exactly one match → insert log.
    - Zero matches → 404 `"No medication matching 'X'"`.
    - Multiple matches → 409 listing the candidates; never guess.
- Response: `{ ok, message }` where `message` is human-readable
  ("Logged Carbidopa/Levodopa at 2:47 PM") so Siri can speak it back.

## Voice clients

### Day one — Shortcuts shortcut (phone + Watch, no app build)
A Shortcuts-app shortcut named "Log Meds": Get Contents of URL → POST to the
edge function with the token header → Show Result (Siri speaks the
confirmation). Invoked by "Hey Siri, Log Meds" on iPhone **and Apple Watch**.
Deliverable: a setup recipe with Scott's token filled in. Optionally a second
shortcut with an Ask-for-Input step for logging a specific med.

### Fast follow — iOS App Intent (`ios-sliders` branch)
`LogMedicationIntent` (App Intents framework) with an optional medication
parameter backed by an `AppEntity` query against Supabase; App Shortcut
phrases ("Log my meds in Symphony", "Log ${medication} in Symphony"); calls
the same edge function. Enables a home-screen/lock-screen widget button.
Ships through the existing Xcode Cloud → TestFlight pipeline. **All iOS work
happens on `ios-sliders`** (main's `apple/` is stale).

## Web review page — `/meds`

Route `/meds`, sidebar link under MORE (`components/layout/Sidebar.tsx` —
the Nordic sidebar, not SidebarKinetic). Nordic Journal styling, lucide
icons (no emoji).

- **Today strip:** each active med × its schedule slots; each logged dose is
  matched to the nearest slot so gaps read at a glance ("2pm dose not taken").
- **Timing view:** last 7/30 days of doses per day with the interval between
  consecutive doses rendered — the levodopa-spacing view.
- **Manage:** med CRUD (name, strength, schedule-time pills, active toggle),
  per-med "Take now" button, tap a log to edit its `taken_at` or delete it.

Slot matching is display-only (nearest slot within a window; unmatched logs
render as "extra"); logs never store a slot.

Hooks: `useMedications` and `useMedicationLogs`, following `useRoutines`
patterns (Supabase CRUD + realtime subscription, `useCallback` handlers).

## Error handling

- Edge fn: 401 bad token, 404 no match, 409 ambiguous, 400 malformed body;
  inserts constrained to the token's user.
- Web: hooks surface Supabase errors non-destructively; optimistic updates
  only where the existing hook patterns do.
- Timezone: `taken_at` stored as timestamptz; `schedule_times` are local
  wall-clock strings interpreted in the browser's timezone.

## Testing

- Vitest units for slot-matching and interval computation (pure functions in
  `src/lib/meds/`).
- Hook tests following existing `useRoutines.test.ts` patterns.
- Edge function smoke-tested with curl (token, "all", single, ambiguous, bad
  token) before wiring Siri.

## Build order

1. Migration + `log-medication` edge function (feature worktree off `origin/main`)
2. Web `/meds` page + hooks + lib + tests
3. Shortcut recipe → voice logging live on phone + Watch
4. iOS App Intent on `ios-sliders` (separate PR / TestFlight cycle)

## Out of scope (documented follow-ups)

- Dose-due reminders/notifications
- Today-view / kitchen-wall surfacing (Approach C mirror)
- Family members' medications
- Free-form NL parsing ("took carbidopa at 2") beyond med-name matching —
  the `taken_at` override is API-supported but v1 voice paths log "now"
