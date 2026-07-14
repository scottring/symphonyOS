# Voice medication logging — Shortcut setup (iPhone + Apple Watch)

This gives you "Hey Siri, Log Meds" on both your iPhone and Apple Watch with no
app build. It POSTs to the `log-medication` edge function.

## One-time setup
1. In Symphony web → Meds → Manage → "Show voice-logging token". Copy the token.
2. On iPhone, open the **Shortcuts** app → **+** → name it exactly **Log Meds**.
3. Add action **Get Contents of URL**. Configure:
   - URL: `https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/log-medication`
   - Method: **POST**
   - Headers:
     - `x-med-token` = *(your token)*
     - `Content-Type` = `application/json`
   - Request Body: **JSON** → key `medication` = `all`
4. Add action **Show Result** with the variable "Contents of URL" (so Siri speaks the confirmation).
5. (Optional, log one specific med) Duplicate the shortcut, name it **Log Levodopa**,
   set the JSON `medication` = `levodopa`.

## Using it
- iPhone or Watch: "Hey Siri, Log Meds" → logs all active meds now, Siri says
  "Logged Carbidopa/Levodopa at 2:47 PM".
- The Watch runs the same shortcut with no watch app required.

## Notes
- To log a past time, add a `taken_at` JSON key (ISO8601). The default is now.
- If the token ever leaks, press "Show voice-logging token" again — it does NOT
  rotate automatically; rotating requires a manual token reset (future).
- The response JSON uses different keys depending on outcome: successful/expected
  logging outcomes (logged, no match, ambiguous match) return a `message` key;
  auth or request-format failures (missing/invalid token, bad method, bad JSON)
  return an `error` key instead. "Show Result" on the whole response works
  either way — Siri will just read the raw JSON if it's an `error` case — but
  if you want a cleaner spoken message in all cases, use a **Get Dictionary
  Value** action to read `message` first and fall back to `error`.

## Voice symptom logging — "Log Symptom" shortcut

Same pattern, same token. You dictate one sentence; the server figures out the
symptom, severity, and note. It POSTs to the `log-symptom` edge function.

### Setup
1. On iPhone, open **Shortcuts** → **+** → name it exactly **Log Symptom**.
2. Add action **Ask for Input** (type Text), prompt: `What symptom?`
   (When invoked by voice, Siri asks this and you answer by dictation.)
3. Add action **Get Contents of URL**. Configure:
   - URL: `https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/log-symptom`
   - Method: **POST**
   - Headers:
     - `x-med-token` = *(the same token as Log Meds — Health → Manage → "Show voice-logging token")*
     - `Content-Type` = `application/json`
   - Request Body: **JSON** → key `utterance` = *(Provided Input variable)*
4. Add action **Show Result** with "Contents of URL" so Siri speaks the confirmation.

### Using it
- "Hey Siri, Log Symptom" → "What symptom?" → "severe tremor after workout"
  → "Logged Tremor, severe, at 2:47 PM". The leftover words ("after workout")
  are saved as the log's note.
- Severity words: mild/light/slight, moderate/medium, severe/bad/intense/strong.
  Say none and it logs as **moderate**.
- Say two symptoms ("tremor and stiffness") and both log at the same severity.
- The confirmation always states what was understood — if it mis-heard, fix the
  log in Health → Timing (tap the entry to edit).
- Unknown symptoms are never auto-created; the reply lists what you track.
  Add new symptoms in Health → Manage first.
