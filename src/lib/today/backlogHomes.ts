// src/lib/today/backlogHomes.ts
//
// Where the review's backlog lives when it isn't in the review.
//
// The morning/evening review lists carried-over work plus everything
// `selectNeedsAttention` flags — and only some of that is past a date. The
// rest has NO date: a task left on a week that has passed, one sitting in the
// month bucket for 45+ days, a capture in the Inbox for 14+ days. The Inbox's
// Expired section (selectExpired) lists only past-DATED work. So "+5 older
// waiting … the whole list lives in the Inbox, under Expired" sent people to a
// section that said "Expired · 1" (friends-and-family walk, 2026-10-08).
//
// This names each part of the backlog and where its full list really is,
// instead of claiming one home for all of it. Counts here are of the review's
// own backlog — the same rows it draws — never of a second population.
import type { Task } from '@/types/task'
import type { AttentionReason } from './attention'

/** Why a row is in the review: carried over (dated, within grace), or an attention reason. */
export type BacklogReason = 'carried' | AttentionReason

export interface BacklogHomes {
  /** Past its date and not a wait: the Inbox lists every one under Expired. */
  dated: number
  /** A wait past its check-back day: the Inbox lists it under Waiting on. */
  waiting: number
  /** No date — placed on a week that has passed. */
  pastWeek: number
  /** No date — in the month bucket a long while. */
  monthList: number
  /** No date — an Inbox capture a long while. */
  inbox: number
}

export function backlogHomes(rows: ReadonlyArray<{ task: Pick<Task, 'isWaiting'>; reason: BacklogReason }>): BacklogHomes {
  const out: BacklogHomes = { dated: 0, waiting: 0, pastWeek: 0, monthList: 0, inbox: 0 }
  for (const { task, reason } of rows) {
    if (reason === 'carried' || reason === 'slipped') {
      if (task.isWaiting) out.waiting += 1
      else out.dated += 1
    } else if (reason === 'stranded-week') out.pastWeek += 1
    else if (reason === 'aging-month') out.monthList += 1
    else out.inbox += 1
  }
  return out
}

/**
 * "Of the 10 here: 1 past its date — in the Inbox under Expired; 9 with no
 * date that sat a while (4 on a week that has passed, 3 on a month list for
 * 45+ days, 2 in the Inbox for 2+ weeks)." Every number is a count of the
 * review's own rows, so they add up to the total it names.
 */
export function backlogWhereabouts(h: BacklogHomes): string {
  const total = h.dated + h.waiting + h.pastWeek + h.monthList + h.inbox
  const undated = h.pastWeek + h.monthList + h.inbox
  const parts: string[] = []
  if (h.dated) parts.push(`${h.dated} past ${h.dated === 1 ? 'its' : 'their'} date — ${h.dated === 1 ? '' : 'all '}in the Inbox under Expired`)
  if (h.waiting) parts.push(`${h.waiting} you’re waiting on — in the Inbox under Waiting on`)
  if (undated) {
    const where = [
      h.pastWeek ? `${h.pastWeek} on a week that has passed` : '',
      h.monthList ? `${h.monthList} on a month list for 45+ days` : '',
      h.inbox ? `${h.inbox} in the Inbox for 2+ weeks` : '',
    ].filter(Boolean)
    parts.push(`${undated} with no date that sat a while (${where.join(', ')})`)
  }
  return parts.length ? `Of the ${total} here: ${parts.join('; ')}.` : ''
}
