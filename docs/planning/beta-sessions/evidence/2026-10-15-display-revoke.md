# Display pairing and revocation — hosted evidence, 2026-10-15

- Production build: `assets/index-CWdSOp8P.js` (main `74803e64`); project `mwadppyrqzuzgstmwpuy`.
- Owner A1 (synthetic) made code `BADBG8` via `create_display_pairing_code` at ~07:08:20Z.
- A fresh Playwright browser (no prior session) opened `/wall-v2`, saw the pairing screen, entered the code: the wall rendered ("Goodnight", Tomorrow · Friday) — `2026-10-15-display-paired.png`. Row `household_displays` `13cc450a-…` paired 07:08:37Z, `last_seen_at` 07:08:38Z (heartbeat), membership role `display`.
- A1 called `revoke_display` at 07:09:21Z → `{"revoked": true}`.
- The display reloaded at 07:09:24Z and showed the pairing screen (signed out), not the household — `2026-10-15-display-revoked.png`. Afterwards `household_members` has no active display row and `household_displays.revoked_at` is set.
