# Medication logging — App Intent (Siri)

Native Siri App Intent so "Hey Siri, Log my meds in Symphony" logs a dose from
iPhone or a paired Apple Watch. Complements the no-app Shortcut path documented
in the web repo (`docs/meds-shortcut-setup.md`); both hit the same
`log-medication` edge function.

## Files
- `MedTokenStore.swift` — stores the durable per-user token in **UserDefaults**
  (matching this app's auth-storage choice — Keychain fails on unsigned builds;
  see `Services/SupabaseClient.swift`). Fetches the token lazily from the
  `ensure_med_log_token` RPC on first use.
- `LogMedicationIntent.swift` — the `AppIntent`; POSTs to the edge function and
  speaks the returned confirmation.
- `SymphonyShortcuts.swift` — `AppShortcutsProvider` registering the Siri phrases.

## Required manual steps (must be done in Xcode — cannot be scripted)

These files are **not yet added to the app target** (this project uses the
classic `.pbxproj` file-reference model, not Xcode 16 synchronized folders, so
new files must be added through Xcode). Until then they are inert and do not
affect the build.

1. In Xcode, drag the `Intents/` folder into the **SymphonyOS** target
   (File Inspector → Target Membership = SymphonyOS for all three `.swift`
   files). The `README.md` should NOT be a target member.
2. Build the app (iOS 16+; App Intents needs no extra framework link and no
   Info.plist SiriKit keys). Fix any compile issues — **these files were written
   without an Xcode compile check**, so treat the first build as verification.
   Watch especially the supabase-swift RPC decode in `MedTokenStore.ensureToken()`
   (`try await supabase.rpc("ensure_med_log_token").execute().value` decoding to
   `String`) — adjust to the installed supabase-swift version if the scalar
   decode differs.
3. Run on a device (or simulator) while signed in. In the Shortcuts app confirm
   "Log my meds in Symphony" appears; run it and confirm a dose appears on the
   web `/meds` page.
4. Test on a paired Apple Watch — the App Shortcut surfaces on the Watch once the
   phone app is installed; no watchOS target needed.
5. Ship via the existing Xcode Cloud → TestFlight workflow. Confirm the workflow
   builds **`ios-sliders`**, not `main`.

## Prerequisite
The web PR (medication tracker) must be merged/deployed so the DB tables, the
`ensure_med_log_token` RPC, and the `log-medication` function exist. The RPC and
function are already live in prod, so this can be built in parallel.
