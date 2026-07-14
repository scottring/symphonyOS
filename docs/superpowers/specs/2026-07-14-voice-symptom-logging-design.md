# Voice symptom logging — design

**Date:** 2026-07-14
**Status:** Approved
**Follows:** `2026-07-04-symptom-tracker-design.md` (this was its documented
"Voice / Siri symptom logging" follow-up) and the voice pattern established in
`2026-07-01-medication-tracker-design.md`.

## Goal

"Hey Siri, Log Symptom" → Siri asks "What symptom?" → Scott dictates one
utterance ("severe tremor after workout") → the symptom is logged with
severity and note, and Siri speaks back exactly what was understood. Works on
iPhone and Apple Watch with no app build, using the Shortcuts app — the same
pattern as voice medication logging.

## Decisions (made during brainstorming)

- **Interaction:** single dictated utterance, parsed server-side. Not
  one-shortcut-per-symptom, not guided multi-prompt.
- **Severity default:** no severity word in the utterance → **2 (Moderate)**.
- **Unknown symptom:** fail and list the tracked symptoms. Never auto-create —
  the symptom list is a controlled vocabulary so trends stay clean.
- **Confirmation always states what was understood** ("Logged Tremor, severe,
  at 2:47 PM") so a mis-parse is immediately audible and fixable in the
  LogEditor.
- **Approach:** new sibling edge function (`log-symptom`), NOT an extension of
  the deployed, smoke-tested `log-medication` function, and NOT a native iOS
  App Intent (String parameters can't be spoken in one phrase, so an intent
  would prompt anyway — identical UX at the cost of a TestFlight cycle).

## Architecture

### 1. Edge function `supabase/functions/log-symptom/index.ts`

A structural sibling of `log-medication`:

- **Auth:** durable per-user token in the `x-med-token` header, looked up in
  `med_log_tokens`. One token powers all voice logging (nothing med-specific
  about the token). Deployed with `verify_jwt=false`; uses the service-role
  client.
- **Request:** `POST { utterance: string, logged_at?: ISO8601 }`.
- **Response contract** (same as `log-medication`): expected outcomes return
  `{ ok, message }` where `message` is speakable; auth/request-format failures
  return `{ ok: false, error }`.
- **Flow:** validate token → load active symptoms for the user → parse the
  utterance (pure lib) → insert one `symptom_logs` row per matched symptom
  (`user_id`, `symptom_id`, `severity`, `logged_at` = body value or now,
  `note`) → speakable confirmation.
- Same CORS headers and `json()` helper shape as `log-medication` (with
  `x-med-token` in allowed headers).

No schema changes: `symptom_logs` already has everything needed (there is no
`source` column, unlike `medication_logs`; we deliberately do not add one).

### 2. Pure parsing lib `supabase/functions/log-symptom/lib/logic.ts`

No Deno/network deps, unit-tested under vitest like
`log-medication/lib/logic.test.ts`.

- **`parseBody(raw)`** — mirrors the meds version: `utterance` required
  non-blank string; `logged_at` optional valid ISO8601.
- **Severity parsing:** scan the utterance for the first severity word:
  - 1 (Mild): `mild`, `light`, `slight`
  - 2 (Moderate): `moderate`, `medium`
  - 3 (Severe): `severe`, `bad`, `intense`, `strong`
  - No match → default **2**. The matched word is stripped from the text.
  - Severity words match on whole-word boundaries only — "slight" matches
    the word "slight" but not "backlight" (and stemming like "slightly" is
    not required).
- **Symptom matching:** case-insensitive substring match of each active
  symptom's name against the remaining text.
  - **All distinct matches log** — "tremor and stiffness" creates two logs at
    the same severity.
  - **Overlap rule:** if one matched symptom's name contains another's (e.g.
    "Resting tremor" ⊃ "Tremor"), keep only the longer match.
  - Zero matches → no-match outcome.
- **Note extraction:** after stripping the severity word and all matched
  symptom names, the leftover text — with dangling connector words ("and",
  "with") and punctuation trimmed — becomes `note`. Empty leftover → `null`.
  - Example: "severe tremor after workout" → Tremor, severity 3, note
    "after workout".

### 3. Outcomes and spoken messages

| Case | Status | Body |
|---|---|---|
| Logged | 200 | `message: "Logged Tremor, severe, at 2:47 PM"` (multi: "Logged Tremor and Stiffness, moderate, at …") |
| No symptom matched | 404 | `message: "No symptom matching '<utterance>' — you track: Tremor, Stiffness, …"` |
| No active symptoms | 404 | `message: "You aren't tracking any symptoms yet"` |
| Blank/invalid body | 400 | `error` |
| Missing/invalid token | 401 | `error` |
| Non-POST | 405 | `error` |
| DB failure | 500 | `message` |

Severity is spoken by label (`Mild`/`Moderate`/`Severe` per
`SEVERITY_LABELS`), time via the same `fmtTime` formatting as meds.

### 4. Shortcut + docs

Extend `docs/meds-shortcut-setup.md` with a "Log Symptom" section:

1. Shortcuts app → new shortcut named **Log Symptom**.
2. **Ask for Input** (Text) — prompt "What symptom?" (spoken invocations are
   answered by dictation automatically).
3. **Get Contents of URL** → POST to
   `https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/log-symptom`,
   headers `x-med-token` + `Content-Type: application/json`, JSON body
   `utterance` = Provided Input.
4. **Show Result** with Contents of URL so Siri speaks the confirmation.

Same token as the meds shortcut (Health → Manage → "Show voice-logging
token"). Works on Watch with no watch app.

### 5. Web UI

No changes. Logs appear on the Health page's Today/Timing tabs via the
existing `useSymptomLogs` realtime subscription.

## Testing

- **Unit (TDD):** the parsing lib — severity words per tier, default
  moderate, word-boundary behavior, single match, multi-match, overlap rule,
  no match, note extraction (leftover, connectors trimmed, empty → null),
  `parseBody` validation, blank utterance.
- **Live smoke test after deploy:** real token against prod — success case,
  severity word case, no-match case, bad token → verify rows in
  `symptom_logs` and clean up test rows.

## Out of scope

- Native iOS App Intent for symptoms (Shortcut UX is equivalent).
- Auto-creating symptoms from voice.
- Spoken relative-time parsing ("an hour ago") — use the app's LogEditor to
  adjust timestamps.
- Severity-per-symptom in multi-symptom utterances (all matches share the one
  parsed severity).
- Voice-logging token rotation (pre-existing follow-up from meds).
