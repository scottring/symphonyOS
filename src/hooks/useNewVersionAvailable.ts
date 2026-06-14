import { useEffect, useState } from 'react'

/**
 * Extract the hashed asset references (`/assets/*.js`) from an index.html
 * string as a single normalized token, so two builds can be compared. Matches
 * the entry bundle plus any modulepreload chunks — every build changes at least
 * one hash. Exported for testing.
 */
export function bundleTagFromHtml(html: string): string {
  const matches = html.match(/\/assets\/[A-Za-z0-9._-]+\.js/g) || []
  return Array.from(new Set(matches)).sort().join(',')
}

/**
 * Detects when a newer production build has shipped while this tab stayed open.
 *
 * Symphony is an SPA: an open tab keeps running its original JS bundle until the
 * page is actually reloaded, so freshly-deployed fixes look "not deployed" to a
 * long-lived tab (the recurring "fixed but still broken in my browser" reports).
 *
 * We snapshot a baseline by fetching index.html (served `no-cache`) once at
 * mount — that reflects the build this tab loaded with — then re-fetch on focus
 * and on an interval. A changed asset set means a new build is live and the tab
 * should reload. Baseline and comparison run the SAME extraction over the SAME
 * document shape, so they only differ on a real deploy. (An earlier version
 * diffed the live <script> tags against the HTML, which never matched because of
 * Vite's modulepreload <link> chunks → the banner showed forever, even right
 * after a reload.)
 *
 * Production-only and best-effort (silent when offline).
 */
export function useNewVersionAvailable(): boolean {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    if (!import.meta.env.PROD) return

    let cancelled = false
    let baseline: string | null = null

    const probe = async () => {
      if (cancelled || document.hidden) return
      try {
        const res = await fetch(`/index.html?_=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const tag = bundleTagFromHtml(await res.text())
        if (cancelled || !tag) return
        if (baseline === null) {
          baseline = tag // first probe = the build this tab is running
          return
        }
        if (tag !== baseline) setAvailable(true)
      } catch {
        // offline / transient network error — ignore, retry next tick
      }
    }

    // Capture the baseline now, then re-check on an interval and whenever the
    // tab regains focus (the moment a user is most likely to act on a stale tab).
    void probe()
    const interval = window.setInterval(() => { if (!available) void probe() }, 3 * 60 * 1000)
    const onVisible = () => { if (!available && !document.hidden) void probe() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [available])

  return available
}
