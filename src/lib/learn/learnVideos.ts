// src/lib/learn/learnVideos.ts
//
// The eight short guides in /learn, and which page each one belongs beside
// (Scott, 2026-10-17: mark the videos near where the thing happens). A page
// offers its first guide the person has not yet watched or dismissed; once
// every guide for a page is seen, the page shows none. /learn keeps them all.

export interface LearnVideo {
  id: string
  title: string
  seconds: number
}

const BASE = '/assets/videos/onboarding-v1'

export const LEARN_VIDEOS: Record<string, LearnVideo> = {
  '02-inbox': { id: '02-inbox', title: 'Start with Inbox', seconds: 22 },
  '03-five-horizons': { id: '03-five-horizons', title: 'Five places to plan', seconds: 19 },
  '04-goals': { id: '04-goals', title: 'Turn a big goal into smaller goals', seconds: 18 },
  '05-next-step': { id: '05-next-step', title: 'Choose a task for today', seconds: 18 },
  '06-urgent-tasks': { id: '06-urgent-tasks', title: 'Add an urgent task', seconds: 37 },
  '07-routines': { id: '07-routines', title: 'Share recurring responsibilities', seconds: 26 },
  '08-weekly-review': { id: '08-weekly-review', title: 'Review and choose what comes next', seconds: 30 },
}

/** Page (workspaceContext's `page`) → its guides, in the order offered. */
export const PAGE_VIDEOS: Record<string, string[]> = {
  inbox: ['02-inbox'],
  year: ['03-five-horizons', '04-goals'],
  season: ['04-goals', '03-five-horizons'],
  month: ['04-goals', '03-five-horizons'],
  week: ['08-weekly-review'],
  today: ['05-next-step', '06-urgent-tasks'],
  routines: ['07-routines'],
}

export function videoSrc(id: string, kind: 'mp4' | 'vtt' | 'poster'): string {
  return kind === 'poster' ? `${BASE}/${id}-poster.jpg` : `${BASE}/${id}.${kind}`
}

const SEEN_KEY = 'symphony.learn.seen'

// Per-viewer convenience only: a private window or blocked storage just shows
// the guide again.
export function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const ids: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function markSeen(id: string): void {
  try {
    const seen = readSeen()
    seen.add(id)
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]))
  } catch {
    // Storage unavailable: the chip simply returns next visit.
  }
}

/** The guide this page should offer now, or null. */
export function videoForPage(page: string | null, seen: Set<string>): LearnVideo | null {
  if (!page) return null
  const id = (PAGE_VIDEOS[page] ?? []).find((v) => !seen.has(v))
  return id ? LEARN_VIDEOS[id] : null
}
