import { useEffect } from 'react'

// Auto-reload the page when a newer build is deployed.
//
// Why this exists: the kitchen wall is a chromeless Raspberry Pi Chromium
// kiosk pointed at /wall-v2. It has no URL bar, no keyboard, and (unlike the
// old /wall WallCalendar) no reload button. So once Chromium loads the page it
// runs whatever JS it first fetched *forever* — a fix can deploy to prod and
// the wall keeps executing yesterday's stale bundle, with no way to pick it up
// short of a power-cycle. That is exactly how a shipped scroll fix can look
// "not fixed" on the device.
//
// This hook closes that gap: it periodically re-fetches index.html (cache
// busted) and compares the entry module script hash to the one this page
// loaded. Vite fingerprints the entry as /assets/index-<hash>.js, so a new
// deploy changes that hash. When it differs, the page reloads and the wall is
// current within one poll interval — no reboot, no keyboard, no SSH.

const POLL_MS = 3 * 60 * 1000 // 3 min — index.html is ~1KB, egress is negligible
const FIRST_CHECK_MS = 20 * 1000 // also probe shortly after mount

// Loop guard: if hash detection ever misbehaves (e.g. a CDN serving an
// index.html whose entry hash never matches what actually loads), never let the
// kiosk fall into a reload loop. Cap reloads within a rolling window.
const GUARD_KEY = 'symphony.buildAutoReload.history'
const GUARD_WINDOW_MS = 10 * 60 * 1000
const MAX_RELOADS_PER_WINDOW = 3

function entryScriptSrc(html: string): string | null {
  // Matches Vite's emitted entry: <script type="module" crossorigin src="/assets/index-<hash>.js">
  const match = html.match(/<script[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/)
  return match ? match[1] : null
}

function recentReloads(): number[] {
  try {
    const raw = sessionStorage.getItem(GUARD_KEY)
    const arr: number[] = raw ? JSON.parse(raw) : []
    const cutoff = Date.now() - GUARD_WINDOW_MS
    return arr.filter((t) => t >= cutoff)
  } catch {
    return []
  }
}

function recordReload() {
  try {
    const history = [...recentReloads(), Date.now()]
    sessionStorage.setItem(GUARD_KEY, JSON.stringify(history))
  } catch {
    /* sessionStorage unavailable — the worst case is one un-guarded reload */
  }
}

/**
 * Poll for a newer deployed build and reload the page when one appears.
 * No-ops in dev (the entry is /src/main.tsx + HMR handles updates).
 *
 * @param enabled gate so this only runs on the kiosk surface that needs it
 */
export function useBuildAutoReload(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    if (!import.meta.env.PROD) return

    const loadedSrc = document
      .querySelector<HTMLScriptElement>('script[type="module"][src]')
      ?.getAttribute('src')
    if (!loadedSrc) return // can't establish a baseline — do nothing rather than guess

    let cancelled = false

    const check = async () => {
      try {
        const res = await fetch(`/index.html?ts=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const nextSrc = entryScriptSrc(await res.text())
        if (cancelled || !nextSrc || nextSrc === loadedSrc) return
        if (recentReloads().length >= MAX_RELOADS_PER_WINDOW) return // loop guard tripped
        recordReload()
        window.location.reload()
      } catch {
        // offline / transient fetch failure — try again next interval
      }
    }

    const first = window.setTimeout(check, FIRST_CHECK_MS)
    const interval = window.setInterval(check, POLL_MS)
    return () => {
      cancelled = true
      clearTimeout(first)
      clearInterval(interval)
    }
  }, [enabled])
}
