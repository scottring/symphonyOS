// src/hooks/useCommitPage.ts
//
// Commits a reviewed page: one INSERT per confirmed task, one per confirmed
// note, one `routines` row per recurring line, one `goals` row per year-goal
// line, and one attachments row pinning the page image to whatever came off
// it. Shared by the manual upload flow and the inbox's pending-page section
// so the two can never drift.
//
// It reports what ACTUALLY landed. Neither writer throws — `addTask` returns
// undefined and `addNote`/`addGoal`/`addRoutine` return null on failure (each
// toasts on its own way out) — so a caller that assumed "resolved means
// committed" would report success over a page that wrote nothing. The inbox
// uses the returned `failures` count to decide whether the staged capture row
// may be deleted: a page deleted after a failed commit is unrecoverable.

import { useCallback } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { planItemToAddTaskArgs, pageMonthStart, pageSeasonStart, type PlanItem, type PageAltitude } from '@/lib/planParse'
import type { PageNote } from '@/lib/pageParse'
import { weekStartAnchor, readCadenceConfig, localYmd, parseLocalYmd } from '@/lib/cadence/config'
import { readSeasons, seasonLabel } from '@/lib/cadence/seasons'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useNotes } from '@/hooks/useNotes'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useRoutines } from '@/hooks/useRoutines'
import { useGoalsContext } from '@/contexts/GoalsContext'
import { scopeForDomain } from '@/lib/scope'
import { showToast } from '@/hooks/useToast'
import type { TaskContext } from '@/types/task'

export interface CommitPagePayload {
  items: PlanItem[]
  notes: PageNote[]
  /** The page's domain — every task/note/goal/routine it writes is stamped
   *  with this life area (Task 5: a committed page is no longer "Universal"). */
  domain: TaskContext
  /** The month a MONTH page's rows are for (the review sheet's chip). Absent
   *  = the page's own default for today (pageMonthStart). */
  monthStart?: Date
  /** The season a SEASON page's rows are for. Absent = pageSeasonStart. */
  seasonStart?: Date
  /** Where the page lives in the `attachments` bucket, if we know. */
  storagePath: string | null
  /** Which page was photographed — sizes the placement window and decides
   *  where the caller lands after commit. */
  altitude: PageAltitude
}

export interface CommitPageResult {
  tasksCreated: number
  goalsCreated: number
  notesCreated: number
  routinesCreated: number
  /** Tasks + goals + notes + routines that did not make it. Non-zero means: do not delete the page. */
  failures: number
  /** Where the caller should land after commit — the page's own period. */
  route: string
  /** Human label for that period, for the success toast ("this week", "September", "Fall 2026", "2026"). */
  periodLabel: string
  /** Ids of every task actually inserted, in commit order. Lets a caller that
   *  knows these rows are throwaway (the first-week sample page) track and
   *  later delete exactly what it created — there's no `capture_meta` column
   *  to stamp a marker into instead. */
  createdTaskIds: string[]
  /** Ids of every note actually inserted (day-facts plus the page's own notes). */
  createdNoteIds: string[]
}

/**
 * MIME type for a page object from its storage path. Mirrors `mimeTypeFor` in
 * `supabase/functions/dropbox-poll` — the poller stores `.png` exports with a
 * real `image/png`, and the attachment row must describe the object that is
 * actually in the bucket, not a guess.
 */
function pageMimeType(storagePath: string): string {
  const ext = storagePath.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  return ext ? `image/${ext}` : 'image/jpeg'
}

export function useCommitPage() {
  const { addTask } = useSupabaseTasks()
  const { addNote } = useNotes()
  const { getCurrentUserMember } = useFamilyMembers()
  const { addRoutine } = useRoutines()
  // GoalsProvider wraps the whole tasks app, so this is the already-loaded
  // goals state, not a second fetch.
  const { areas, addGoal } = useGoalsContext()

  const commitPage = useCallback(async ({ items, notes, storagePath, monthStart, seasonStart, domain, altitude }: CommitPagePayload): Promise<CommitPageResult> => {
    // A committed page writes the page's own domain everywhere it lands.
    const context = domain
    const now = new Date()
    const commitCtx = {
      currentWeekStart: weekStartAnchor(now, readCadenceConfig().weekStartsOn),
      monthStart: monthStart ?? pageMonthStart(now),
      seasonStart: seasonStart ?? pageSeasonStart(now, readSeasons()),
      context,
    }
    const defaultAssigneeId = getCurrentUserMember()?.id

    // Everything rides the INSERT — a follow-up update can be dropped before
    // the temp→real id swap lands (the addTask-then-setBucket race).
    let firstTaskId: string | undefined
    let tasksCreated = 0
    let failures = 0
    const createdTaskIds: string[] = []
    const tasks = items.filter((i) => i.placement.kind !== 'goal' && i.kind === 'task')
    for (const item of tasks) {
      const args = planItemToAddTaskArgs(item, commitCtx)
      const id = await addTask(args.title, args.contactId, undefined, args.scheduledFor, {
        ...args.options,
        defaultAssigneeId,
      })
      if (id) {
        tasksCreated += 1
        firstTaskId ??= id
        createdTaskIds.push(id)
      } else {
        failures += 1
      }
    }

    // A recurring line is a routine, not a task: weekly on the named days, at
    // the named time. No days named defaults to Saturday rather than dropping
    // the line — a paper "soccer 9am" without a circled day still means SOME
    // weekly slot, not nothing.
    let routinesCreated = 0
    for (const item of items.filter((i) => i.kind === 'recurring')) {
      const days = item.recurring?.days.length ? item.recurring.days : ['sat' as const]
      const created = await addRoutine({
        name: item.title,
        context,
        recurrence_pattern: { type: 'weekly', days },
        time_of_day: item.time ?? undefined,
        assigned_to: item.assigneeId ?? undefined,
      })
      if (created) routinesCreated += 1
      else failures += 1
    }

    // A day-fact ("no school") is a note pinned to its day by title — never a
    // checkbox someone has to tick.
    const dayfactNotes: PageNote[] = items.filter((i) => i.kind === 'dayfact').map((i) => {
      const day = i.placement.kind === 'date' ? parseLocalYmd(i.placement.date) : i.dateHint ? parseLocalYmd(i.dateHint) : null
      const stamp = day ? `${day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ` : ''
      return { title: `${stamp}${i.title}`, content: i.note ?? i.title }
    })

    // A year page's lines are goals, not tasks: one `goals` row each, for the
    // current year. No invented "General" area — a goal may have none; its
    // note and derived scope ride the row.
    let goalsCreated = 0
    for (const item of items.filter((i) => i.placement.kind === 'goal')) {
      const created = await addGoal(areas[0]?.id ?? null, item.title, context, {
        notes: item.note,
        scope: scopeForDomain(context, [], null),
      })
      if (created) goalsCreated += 1
      else failures += 1
    }

    // type 'general', not 'quick_capture': useNotes dual-writes quick captures
    // to the Obsidian vault, and a page already captured into Symphony should
    // not also land there as a second copy.
    let firstNoteId: string | undefined
    let notesCreated = 0
    const createdNoteIds: string[] = []
    for (const note of [...dayfactNotes, ...notes]) {
      const created = await addNote({
        title: note.title,
        content: note.content,
        type: 'general',
        source: 'import',
        context,
      })
      if (created) {
        notesCreated += 1
        firstNoteId ??= created.id
        createdNoteIds.push(created.id)
      } else {
        failures += 1
      }
    }

    // The page image is already in the bucket — this only files the row, so it
    // does NOT go through useAttachments (which uploads a File).
    const entityId = firstNoteId ?? firstTaskId
    if (storagePath && entityId) {
      const { data: { user } } = await getAuthUser()
      if (user) {
        const { error } = await supabase.from('attachments').insert({
          user_id: user.id,
          entity_type: firstNoteId ? 'note' : 'task',
          entity_id: entityId,
          file_name: storagePath.split('/').pop() ?? 'page',
          file_type: pageMimeType(storagePath),
          // The bytes were uploaded elsewhere (the poller, or the parse-page
          // call) and only the path comes back here, so the size genuinely is
          // not available at insert time. AttachmentList renders "0 Bytes".
          file_size: 0,
          storage_path: storagePath,
        })
        // Not counted as a commit failure: the tasks and notes are in, and
        // re-running the page to retry the image would duplicate them.
        if (error) showToast('Saved, but the page image could not be attached', 'error', 4000)
      }
    }

    // Where the caller lands, and what to call it in the toast — the page's
    // own period, not always "this week".
    const periodLabel = altitude === 'year' ? `${now.getFullYear()}`
      : altitude === 'season' ? seasonLabel(commitCtx.seasonStart, readSeasons())
      : altitude === 'month' ? commitCtx.monthStart.toLocaleDateString('en-US', { month: 'long' })
      : 'this week'
    const route = altitude === 'year' ? '/year'
      : altitude === 'season' ? `/season?start=${localYmd(commitCtx.seasonStart)}`
      : altitude === 'month' ? `/month?start=${localYmd(commitCtx.monthStart)}`
      : '/week'

    const parts = [
      tasksCreated ? `${tasksCreated} task${tasksCreated === 1 ? '' : 's'}` : '',
      goalsCreated ? `${goalsCreated} goal${goalsCreated === 1 ? '' : 's'}` : '',
      routinesCreated ? `${routinesCreated} routine${routinesCreated === 1 ? '' : 's'}` : '',
      notesCreated ? `${notesCreated} note${notesCreated === 1 ? '' : 's'}` : '',
    ].filter(Boolean)

    if (failures > 0) {
      const added = parts.length ? `Added ${parts.join(', ')}, but ` : ''
      showToast(
        `${added}${failures} item${failures === 1 ? '' : 's'} could not be saved. The page is still in your inbox.`,
        'error',
        6000,
      )
    } else if (parts.length) {
      showToast(`Added ${parts.join(', ')} to ${periodLabel}`, 'success', 4000)
    }

    return { tasksCreated, goalsCreated, notesCreated, routinesCreated, failures, route, periodLabel, createdTaskIds, createdNoteIds }
  }, [addTask, addNote, addRoutine, getCurrentUserMember, areas, addGoal])

  return { commitPage }
}
