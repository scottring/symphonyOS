# Symphony Mac Shell

Tauri v2 wrapper around the deployed web app (`https://app.symphony-os.com`).
The frontend is remote-loaded: pushing to `main` updates the Mac app on next
launch — never bundle the frontend here.

## Dev

    cd desktop && npm install && npm run dev

## Release build → /Applications

    cd desktop && npm run build
    cp -R src-tauri/target/release/bundle/macos/Symphony.app /Applications/

## Features

- **⌘⇧Space** anywhere → floating quick-capture palette (adds to Inbox;
  Enter submits, Esc or click-away dismisses)
- Native menu bar: **⌘N** new task, **⌘1–4** Today / Inbox / Projects /
  Routines, real Edit menu (⌘C/⌘V work)
- Menu-bar extra: today's remaining count + task list, live via Supabase
  realtime → web bridge → tray
- Launch at Login (Symphony menu), close-to-hide, Dock reopen

## Why `dragDropEnabled: false`

The main window sets `"dragDropEnabled": false` — **do not remove it.** With
Tauri's drag-drop handler on (the default), wry subclasses the WKWebView and
overrides `draggingEntered:` / `draggingUpdated:` / `performDragOperation:`
(`wry/src/wkwebview/drag_drop.rs`). Tauri's handler returns `true`
unconditionally (`tauri-runtime-wry/src/lib.rs`), so wry never forwards to
`super` and **WebKit never sees the drag** — the page gets no `dragover` and no
`drop`.

The symptom is a drag that visibly starts and then no drop target ever lights
up: on `/month` a move could be picked up off the shelf but no week column
would accept it; same for any other HTML5 drag surface and for dragging a file
into a detail panel's Photos & files zone. All of it worked in a browser, which
is the tell. Turning the handler off is free here — the shell never listens for
Tauri drag-drop events, so nothing native depended on it.

Same class as the `target="_blank"` / `tel:` bug: the shell intercepting a web
behavior. See "Known limitations" below.

## How the shell talks to the web app

Event contract (see `src/lib/desktop.ts` and `src/desktop/` in the web repo):
`shell:navigate`, `shell:quick-capture`, `shell:tray-update`,
`capture:shown`, `capture:close`. The remote origin is granted event access in
`src-tauri/capabilities/remote.json`; the site CSP allows Tauri IPC
(`ipc:` in connect-src, vercel.json).

## Parity sweep (2026-08-05)

Every web API the app uses was checked against what this shell actually passes
through. Findings, so nobody re-derives them:

**Verified working — no action needed.** File inputs (`<input type="file">`,
10+ call sites) — wry implements `runOpenPanelWithParameters:`, so the native
open panel appears. Camera/mic — wry grants `requestMediaCapturePermission`.
Clipboard read/write — WebKit supports it, and the Edit menu covers ⌘C/⌘V.
`webkitSpeechRecognition` (`useTranscription`) is absent in WKWebView, but the
hook feature-detects and hides the UI, so it degrades correctly rather than
breaking. No downloads, notifications, or service workers in the app.

**Fixed.** HTML5 drag-and-drop (see above). `tel:`/`sms:`/`mailto:` from
`location.href` and `window.open` (see `system_scheme_plugin`).

**Still broken — known cost:**

- **Geolocation.** `navigator.geolocation` (DirectionsBuilder's "use my
  location", `useWeather`'s auto-location) fails in the shell: wry implements
  geolocation on Android only, and WKWebView needs the host app to vend
  CoreLocation. Fixing means a CoreLocation bridge plus an
  `NSLocationWhenInUseUsageDescription` in the bundle — real work, not a flag.
  Both call sites already feature-detect and fall back, so it degrades rather
  than hangs.
- **Printing.** `window.print()` (Today's "print the list") is a no-op in
  WKWebView. `Webview::print()` exists and works, but wry runs it via
  `runOperationModalForWindow` as a **non-blocking sheet with no completion
  callback** — so the app cannot know when to unmount `PrintableDayList`, which
  it currently tears down on the line after `window.print()`. Bridging it
  naively prints the wrong DOM. Doing this properly means driving the teardown
  off `afterprint` and having Rust signal completion; deliberately not hacked in.

## Known limitations (v1, deliberate)

- Google OAuth may reject the embedded webview (`disallowed_useragent`) —
  connect Google Calendar from a browser; the app uses the stored connection.
  Note `useGoogleCalendar` does `window.location.href = data.url`, which sends
  the **main window** to Google with no browser chrome and no way back. Routing
  that one URL to the system browser would likely retire this limitation, but
  it changes where auth completes — a product call, not a bug fix.
- Tray icon is the colored app icon, not a monochrome template icon.
- No native notifications, no dock badge (deferred).
- Unsigned build — personal use on this machine.
