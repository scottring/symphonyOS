// src/lib/firstWeek.ts
//
// "Your first week" — a fresh household lands on an empty Today with no
// guidance. Four real steps, each a link into the flow that actually does
// the thing, each collapsing to a one-line result once done. The card hides
// itself the moment fewer than two steps remain, and stays hidden for a week
// after "Hide for now" — never a permanent dismiss, never a badge/count.

import { supabase } from '@/lib/supabase'

export type FirstWeekStepId = 'people' | 'page' | 'partner' | 'routine'

export interface FirstWeekSignals {
  /** family_members rows visible to this account. */
  memberCount: number
  /** A page has been committed at least once — an `attachments` row whose
   *  `storage_path` matches the page-capture path (`<uid>/page/<uuid>.ext`),
   *  written by `useCommitPage` for every committed page, sample or real. */
  pageCommitted: boolean
  /** A second active `household_members` row, or an unexpired invitation. */
  partnerInvited: boolean
  /** `routines` rows visible to this account. */
  routineCount: number
}

export interface FirstWeekStep {
  id: FirstWeekStepId
  title: string
  done: boolean
  doneLine: string | null
  to: string
}

export function firstWeekSteps(s: FirstWeekSignals): FirstWeekStep[] {
  return [
    {
      id: 'people',
      title: 'Name your people',
      done: s.memberCount > 1,
      doneLine: s.memberCount > 1 ? `${s.memberCount} people` : null,
      to: '/settings#household',
    },
    {
      id: 'page',
      title: "Snap this week's page",
      done: s.pageCommitted,
      doneLine: s.pageCommitted ? 'see This Week' : null,
      to: '/today?plan=paper',
    },
    {
      id: 'partner',
      title: 'Invite your partner',
      done: s.partnerInvited,
      doneLine: s.partnerInvited ? 'invited' : null,
      to: '/settings#invite',
    },
    {
      id: 'routine',
      title: 'Add one routine',
      done: s.routineCount > 0,
      doneLine: s.routineCount > 0 ? 'see Routines' : null,
      to: '/routines',
    },
  ]
}

const HIDE_DURATION_MS = 7 * 86_400_000

/**
 * The card shows only while genuine onboarding work remains (≥2 undone
 * steps — an account with real data never sees it) and outside a 7-day
 * "Hide for now" window.
 */
export function shouldShowFirstWeek(steps: FirstWeekStep[], hiddenAt: string | null, now: Date): boolean {
  const remaining = steps.filter((s) => !s.done).length
  if (remaining < 2) return false
  if (hiddenAt) {
    const t = Date.parse(hiddenAt)
    if (Number.isFinite(t) && now.getTime() - t < HIDE_DURATION_MS) return false
  }
  return true
}

export const FIRST_WEEK_HIDE_KEY = (uid: string) => `symphony.firstWeek.hidden.${uid}`

// ---------------------------------------------------------------------------
// Sample page — "no paper handy?" commits the bundled sample image through
// the exact same paper flow as a real page. The rows it creates are real
// rows (so the step genuinely completes), but they're fake data, so a
// household that later snaps a real page should be able to clear them out.
// The row ids are tracked here, client-side, rather than as a DB column —
// `useCommitPage` has no `capture_meta` column to write a marker into.

export const FIRST_WEEK_SAMPLE_KEY = (uid: string) => `symphony.firstWeek.sampleIds.${uid}`

export interface SampleIds {
  taskIds: string[]
  noteIds: string[]
}

const EMPTY_SAMPLE_IDS: SampleIds = { taskIds: [], noteIds: [] }

export function readSampleIds(uid: string): SampleIds {
  try {
    const raw = localStorage.getItem(FIRST_WEEK_SAMPLE_KEY(uid))
    if (!raw) return EMPTY_SAMPLE_IDS
    const parsed = JSON.parse(raw) as Partial<SampleIds>
    return {
      taskIds: Array.isArray(parsed.taskIds) ? parsed.taskIds : [],
      noteIds: Array.isArray(parsed.noteIds) ? parsed.noteIds : [],
    }
  } catch {
    return EMPTY_SAMPLE_IDS
  }
}

export function writeSampleIds(uid: string, ids: SampleIds): void {
  try {
    localStorage.setItem(FIRST_WEEK_SAMPLE_KEY(uid), JSON.stringify(ids))
  } catch {
    // ignore — sample tracking is a nice-to-have, not load-bearing
  }
}

export function clearSampleIdsRecord(uid: string): void {
  try {
    localStorage.removeItem(FIRST_WEEK_SAMPLE_KEY(uid))
  } catch {
    // ignore
  }
}

export function hasSampleIds(uid: string): boolean {
  const ids = readSampleIds(uid)
  return ids.taskIds.length > 0 || ids.noteIds.length > 0
}

/**
 * Delete the rows the bundled sample page created, by id. Owner deletes are
 * what RLS already allows, so this goes straight at the tables rather than
 * through the task/note hooks — those resolve on the optimistic update and
 * say nothing about whether the write landed.
 *
 * Returns true only when BOTH deletes came back clean. The localStorage id
 * record is the ONLY thing pointing at these rows: clearing it after a
 * partial delete strands fake data in a real household with nothing left to
 * find it by, so the caller must keep the record on false.
 */
export async function deleteSampleRows({ taskIds, noteIds }: SampleIds): Promise<boolean> {
  const [tasks, notes] = await Promise.all([
    taskIds.length
      ? supabase.from('tasks').delete().in('id', taskIds)
      : Promise.resolve({ error: null }),
    noteIds.length
      ? supabase.from('notes').delete().in('id', noteIds)
      : Promise.resolve({ error: null }),
  ])
  return !tasks.error && !notes.error
}
