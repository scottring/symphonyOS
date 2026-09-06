# Plan from paper: phone hand-off (2026-09-06)

## Problem
"Continuity Camera on desktop" cannot work for photographing a page:
- Chrome on macOS never enumerates the iPhone (open Chromium bug 436126054).
  Verified on Scott's Mac: AVFoundation lists "iPhone Camera", Chrome — running
  or freshly launched — lists only the USB webcam.
- Even in Safari / the Mac app, Continuity's webcam mode offers the phone only
  when it is locked, landscape and motionless — not a handheld shot of a page.
- Apple's "Import from iPhone → Take Photo" exists on the web only in Safari's
  file picker; Chrome and the Mac app's NSOpenPanel never show it.

## Fix: hand the shot to the phone
Desktop modal gains **Use your phone**. It shows a QR code for
`/paper/phone/<id>`. The phone (signed in as the same user) opens it, takes the
photo with its own camera input, and uploads to
`attachments/<uid>/page/handoff-<id>.jpg`. The desktop polls the storage folder
every 2.5 s (up to 10 min), then continues into parse → review exactly as if
the file had been chosen locally. Works in Chrome, Safari and the Mac app.

Decisions:
- **No new table, no realtime.** The storage object is the message; polling a
  `list()` with a search filter is one cheap request per tick. Realtime has
  been flaky here twice; polling is simpler and robust.
- Same-user only. The path is derived from the desktop user's id, so a QR
  scanned by someone else's phone never lands. The panel copy says so.
- The hand-off id is a UUID; the URL is unguessable and short-lived in
  practice (the desktop stops listening on close or after 10 min).
- Altitude stays a desktop choice (chip row in the modal); the phone only
  supplies pixels.
- "Use your phone" is the primary desktop action; "Choose a file" stays for
  scans and PDFs; "Use camera" stays for people with a real webcam. The
  camera footer also gets a "use your phone" link so a machine that has used
  the camera before (auto-start path) can still reach it.
