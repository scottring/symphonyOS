// src/lib/pageParse.ts
//
// Page-from-paper: validates the `parse-page` edge function's response into
// the three registers a scratchpad page actually holds — actions, prose, and
// lines the model could not read. Pure, so the rules that decide what gets
// written are testable without a DOM.

import { validatePlanItems, isPageAltitude, type PlanItem, type PageAltitude } from '@/lib/planParse'
import { decideAssignment, type PlanMember } from '@/lib/planAssign'
import { periodFromTitle, type TitlePeriod } from '@/lib/planTitle'
import { readSeasons } from '@/lib/cadence/seasons'

export type { PlanMember } from '@/lib/planAssign'

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
  /** The page's handwritten heading, echoed by the response ("Fall 2026"). */
  pageTitle: string | null
  /** What period `pageTitle` names — decides which period the review sheet opens on. */
  titlePeriod: TitlePeriod
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
  members: PlanMember[],
  fallbackWindow: string[],
  fallbackAltitude: PageAltitude = 'week',
): PageResult {
  const r = (raw ?? {}) as {
    window?: unknown
    altitude?: unknown
    notes?: unknown
    unclear?: unknown
    storagePath?: unknown
    page_title?: unknown
  }
  const memberIds = new Set(members.map((m) => m.id))
  const echoed = Array.isArray(r.window)
    ? r.window.filter((d): d is string => typeof d === 'string')
    : []
  // A year page legitimately echoes an EMPTY window, so the echo wins whenever
  // the response carried one at all.
  const altitude = isPageAltitude(r.altitude) ? r.altitude : fallbackAltitude
  const windowDates = Array.isArray(r.window) && (echoed.length || altitude === 'year') ? echoed : fallbackWindow
  const pageTitle = typeof r.page_title === 'string' && r.page_title.trim() ? r.page_title.trim() : null
  // Assignment is a deterministic rule, not the model's per-line guess (the
  // model is inconsistent line to line — see planAssign.ts). Applied AFTER
  // validation so it sees the same title/goal shape the sheet will show.
  const items = validatePlanItems(raw, windowDates, memberIds, altitude).map((item) => {
    const decision = decideAssignment(item.title, item.assigneeId, members, item.placement.kind === 'goal' || !!item.goal)
    return { ...item, title: decision.title, assigneeId: decision.assigneeId, contactMemberId: decision.contactMemberId }
  })
  return {
    items,
    notes: validateNotes(r.notes),
    unclear: validateUnclear(r.unclear),
    windowDates,
    altitude,
    storagePath: typeof r.storagePath === 'string' ? r.storagePath : null,
    pageTitle,
    titlePeriod: periodFromTitle(pageTitle, new Date(), readSeasons()),
  }
}
