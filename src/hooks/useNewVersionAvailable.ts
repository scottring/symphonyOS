import { useEffect, useState } from 'react'

/**
 * Extract the hashed entry-bundle path(s) (`/assets/index-XXXX.js`) from an
 * index.html string, normalized so two builds can be compared. Exported for
 * testing.
 */
export function bundleTagFromHtml(html: string): string {
  const matches = html.match(/\/assets\/[A-Za-z0-9._-]+\.js/g) || []
  return Array.from(new Set(matches)).sort().join(',')
}

/** The bundle path(s) the live document actually loaded with. */
function currentBundleTag(): string {
  return Array.from(document.querySelectorAll('script[src]'))
    .map((s) => {
      const src = s.getAttribute('src') || ''
      const m = src.match(/\/assets\/[A-Za-z0-9._-]+\.js/)
      return m ? m[0] : ''
    })
    .filter(Boolean)
    .sort()
    .join(',')
}

/**
 * Detects when a newer production build has shipped while this tab stayed open.
 *
 * Symphony is an SPA: an open tab keeps running its original JS bundle until the
 * page is actually reloaded, so freshly-deployed fixes look "not deployed" to a
 * long-lived tab (the recurring "fixed but still broken in my browser" reports).
 * We compare the hashed entry bundle the document loaded with against the latest
 * index.html (served `no-cache`); a mismatch means a new build is live and the
 * tab should reload to pick it up. Production-only and best-effort (silent when
 * offline).
 */
export function useNewVersionAvailable(): boolean {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    if (!import.meta.env.PROD) return
    const loaded = currentBundleTag()
    if (!loaded) return // no hashed bundle (dev / unexpected) — nothing to compare

    let cancelled = false
    const check = async () => {
      if (cancelled || document.hidden) return
      try {
        const res = await fetch(`/index.html?_=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const latest = bundleTagFromHtml(await res.text())
        if (latest && latest !== loaded && !cancelled) setAvailable(true)
      } catch {
        // offline / transient network error — ignore, try again next tick
      }
    }

    // Re-check on an interval and whenever the tab regains focus (the moment a
    // user is most likely to act on a stale tab).
    const interval = window.setInterval(() => { if (!available) void check() }, 3 * 60 * 1000)
    const onVisible = () => { if (!available && !document.hidden) void check() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    // First check shortly after mount, to catch a deploy that landed while the
    // tab was loading or sitting idle on the login screen.
    const initial = window.setTimeout(() => void check(), 15_000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.clearTimeout(initial)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [available])

  return available
}
