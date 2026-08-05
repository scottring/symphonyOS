//
// The client re-validates everything the edge fn returns: the model's JSON is
// untrusted input. Unknown ids, bad dates, and stray kinds are dropped, not
// errors — a partially-valid sweep is still useful.

import type { TendProposal } from './types'

const MAX_PROPOSALS = 12
const MAX_WHY = 200
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function why(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, MAX_WHY) : ''
}

export interface ParseTendOptions {
  dateWindow?: { minYmd: string; maxYmd: string }
  /** False when the period being planned has already passed — nothing can be placed on it. */
  allowPlace?: boolean
  allowedRegrades?: ReadonlySet<'week' | 'month' | 'season' | 'someday'>
}

export function parseTendProposals(
  data: unknown,
  validIds: Set<string>,
  opts: ParseTendOptions = {},
): TendProposal[] {
  const { dateWindow, allowPlace = true, allowedRegrades } = opts
  const raw = (data as { proposals?: unknown })?.proposals
  if (!Array.isArray(raw)) return []
  const out: TendProposal[] = []
  for (const entry of raw) {
    if (out.length >= MAX_PROPOSALS) break
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as Record<string, unknown>
    const id = `ai-${out.length}`
    switch (e.kind) {
      case 'merge': {
        const keepId = str(e.keepId)
        const dropIds = Array.isArray(e.dropIds) ? e.dropIds.filter((d): d is string => typeof d === 'string') : []
        if (!keepId || !validIds.has(keepId)) continue
        if (dropIds.length === 0 || !dropIds.every((d) => validIds.has(d))) continue
        out.push({ kind: 'merge', id, keepId, dropIds, why: why(e.why) })
        break
      }
      case 'put_aside': {
        const taskId = str(e.taskId)
        if (!taskId || !validIds.has(taskId)) continue
        out.push({ kind: 'put_aside', id, taskId, why: why(e.why) })
        break
      }
      case 'regrade': {
        const taskId = str(e.taskId)
        if (!taskId || !validIds.has(taskId)) continue
        if (e.to !== 'week' && e.to !== 'month' && e.to !== 'season' && e.to !== 'someday') continue
        if (allowedRegrades && !allowedRegrades.has(e.to)) continue
        out.push({ kind: 'regrade', id, taskId, to: e.to, why: why(e.why) })
        break
      }
      case 'place': {
        if (!allowPlace) continue
        const taskIds = Array.isArray(e.taskIds) ? e.taskIds.filter((t): t is string => typeof t === 'string') : []
        const date = str(e.date)
        if (taskIds.length === 0 || !taskIds.every((t) => validIds.has(t))) continue
        if (!date || !DATE_RE.test(date)) continue
        const time = str(e.time)
        if (time && !TIME_RE.test(time)) continue
        // YYYY-MM-DD compares correctly lexicographically — no Date parsing needed.
        if (dateWindow && (date < dateWindow.minYmd || date > dateWindow.maxYmd)) continue
        out.push({ kind: 'place', id, taskIds, date, ...(time ? { time } : {}), why: why(e.why) })
        break
      }
      default:
        continue
    }
  }
  return out
}
