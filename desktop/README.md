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

## How the shell talks to the web app

Event contract (see `src/lib/desktop.ts` and `src/desktop/` in the web repo):
`shell:navigate`, `shell:quick-capture`, `shell:tray-update`,
`capture:shown`, `capture:close`. The remote origin is granted event access in
`src-tauri/capabilities/remote.json`; the site CSP allows Tauri IPC
(`ipc:` in connect-src, vercel.json).

## Known limitations (v1, deliberate)

- Google OAuth may reject the embedded webview (`disallowed_useragent`) —
  connect Google Calendar from a browser; the app uses the stored connection.
- Tray icon is the colored app icon, not a monochrome template icon.
- No native notifications, no dock badge (deferred).
- Unsigned build — personal use on this machine.
