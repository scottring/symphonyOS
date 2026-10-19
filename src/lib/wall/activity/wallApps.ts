// Web apps the kitchen wall may open full-screen from a routine (2026-10-19:
// Kaleb's Puzzle Trail). A routine names its app by putting the app's link in
// its description; only hosts listed here open on the wall, and each must
// also be in vercel.json's frame-src. When the app posts
// { type: 'symphony:done' } from its own origin, the routine that opened it
// is checked off for today.

export interface WallApp {
  url: string
  title: string
  origin: string
}

const WALL_APPS: Record<string, string> = {
  'kaleb-puzzle-trail.vercel.app': 'Puzzle Trail',
}

/** The first allowed app link in a routine's description, or null. */
export function wallAppFor(text: string | null | undefined): WallApp | null {
  if (!text) return null
  for (const m of text.matchAll(/(?:https:\/\/)?([a-z0-9.-]+\.[a-z]{2,})(\/[^\s)]*)?/gi)) {
    const host = m[1].toLowerCase()
    const title = WALL_APPS[host]
    if (title) return { url: `https://${host}${m[2] ?? '/'}`, title, origin: `https://${host}` }
  }
  return null
}

/** Whether a message event is an allowed app saying its job is done. */
export function isAppDone(app: Pick<WallApp, 'origin'>, origin: string, data: unknown): boolean {
  return origin === app.origin && typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'symphony:done'
}
