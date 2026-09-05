// src/lib/pageParse.ts
//
// Page-from-paper: validates the `parse-page` edge function's response into
// the three registers a scratchpad page actually holds — actions, prose, and
// lines the model could not read. Pure, so the rules that decide what gets
// written are testable without a DOM.

import { validatePlanItems, isPageAltitude, type PlanItem, type PageAltitude } from '@/lib/planParse'

export interface PageNote {
  title: string
  content: string
}

export interface PageResult {
  items: PlanItem[]
  notes: PageNote[]
  unclear: string[]
  /** The dates the parser was ALLOWED to place on — echoed by the response. */
  windowDates: string[]
  /** Which page this was read as — echoed by the response, same reason. */
  altitude: PageAltitude
  /** Where the page image lives in the `attachments` bucket, when known. */
  storagePath: string | null
}

const MAX_NOTES = 20
const MAX_UNCLEAR = 20
const TITLE_MAX = 80
const CONTENT_MAX = 5000
const UNCLEAR_MAX = 200

function firstLine(content: string): string {
  return content.split('\n')[0].trim().slice(0, TITLE_MAX)
}

function validateNotes(raw: unknown): PageNote[] {
  if (!Array.isArray(raw)) return []
  const out: PageNote[] = []
  for (const entry of raw.slice(0, MAX_NOTES)) {
    const e = entry as { title?: unknown; content?: unknown }
    if (typeof e.content !== 'string' || !e.content.trim()) continue
    const content = e.content.trim().slice(0, CONTENT_MAX)
    const title =
      typeof e.title === 'string' && e.title.trim()
        ? e.title.trim().slice(0, TITLE_MAX)
        : firstLine(content)
    out.push({ title, content })
  }
  return out
}

function validateUnclear(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((l): l is string => typeof l === 'string')
    .map((l) => l.trim().slice(0, UNCLEAR_MAX))
    .filter(Boolean)
    .slice(0, MAX_UNCLEAR)
}

/**
 * The echoed `window` wins over `fallbackWindow`: a page can sit parsed
 * overnight before it is reviewed, and re-deriving the window at review time
 * would offer dates the model was never shown. (The Tend lesson: two
 * derivations of the same window WILL disagree.)
 */
export function validatePageResult(
  raw: unknown,
  memberIds: Set<string>,
  fallbackWindow: string[],
  fallbackAltitude: PageAltitude = 'week',
): PageResult {
  const r = (raw ?? {}) as {
    window?: unknown
    altitude?: unknown
    notes?: unknown
    unclear?: unknown
    storagePath?: unknown
  }
  const echoed = Array.isArray(r.window)
    ? r.window.filter((d): d is string => typeof d === 'string')
    : []
  // A year page legitimately echoes an EMPTY window, so the echo wins whenever
  // the response carried one at all.
  const altitude = isPageAltitude(r.altitude) ? r.altitude : fallbackAltitude
  const windowDates = Array.isArray(r.window) && (echoed.length || altitude === 'year') ? echoed : fallbackWindow
  return {
    items: validatePlanItems(raw, windowDates, memberIds, altitude),
    notes: validateNotes(r.notes),
    unclear: validateUnclear(r.unclear),
    windowDates,
    altitude,
    storagePath: typeof r.storagePath === 'string' ? r.storagePath : null,
  }
}
