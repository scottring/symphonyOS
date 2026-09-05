// src/hooks/useCommitPage.ts
//
// Commits a reviewed page: one INSERT per confirmed task, one per confirmed
// note, and one attachments row pinning the page image to whatever came off it.
// Shared by the manual upload flow and the inbox's pending-page section so the
// two can never drift.
//
// It reports what ACTUALLY landed. Neither writer throws — `addTask` returns
// undefined and `addNote` returns null on failure (each toasts on its own way
// out) — so a caller that assumed "resolved means committed" would report
// success over a page that wrote nothing. The inbox uses the returned
// `failures` count to decide whether the staged capture row may be deleted:
// a page deleted after a failed commit is unrecoverable.

import { useCallback } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { planItemToAddTaskArgs, type PlanItem } from '@/lib/planParse'
import type { PageNote } from '@/lib/pageParse'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useNotes } from '@/hooks/useNotes'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useGoalsContext } from '@/contexts/GoalsContext'
import { showToast } from '@/hooks/useToast'

export interface CommitPagePayload {
  items: PlanItem[]
  notes: PageNote[]
  /** Where the page lives in the `attachments` bucket, if we know. */
  storagePath: string | null
}

export interface CommitPageResult {
  tasksCreated: number
  goalsCreated: number
  notesCreated: number
  /** Tasks + notes that did not make it. Non-zero means: do not delete the page. */
  failures: number
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
  // GoalsProvider wraps the whole tasks app, so this is the already-loaded
  // goals state, not a second fetch.
  const { areas, addArea, addGoal } = useGoalsContext()

  const commitPage = useCallback(async ({ items, notes, storagePath }: CommitPagePayload): Promise<CommitPageResult> => {
    // A committed page is a capture, not a deliberate create — it never
    // stamps the lens onto what it writes.
    const context = null
    const commitCtx = {
      currentWeekStart: weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn),
      context,
    }
    const defaultAssigneeId = getCurrentUserMember()?.id

    // Everything rides the INSERT — a follow-up update can be dropped before
    // the temp→real id swap lands (the addTask-then-setBucket race).
    let firstTaskId: string | undefined
    let tasksCreated = 0
    let failures = 0
    for (const item of items.filter((i) => i.placement.kind !== 'goal')) {
      const args = planItemToAddTaskArgs(item, commitCtx)
      const id = await addTask(args.title, undefined, undefined, args.scheduledFor, {
        ...args.options,
        defaultAssigneeId,
      })
      if (id) {
        tasksCreated += 1
        firstTaskId ??= id
      } else {
        failures += 1
      }
    }

    // A year page's lines are goals, not tasks: one `goals` row each, for the
    // current year. Goals live in an area; the first existing one is used, or
    // a "General" area is created so a first-ever year page still lands.
    let goalsCreated = 0
    const goalItems = items.filter((i) => i.placement.kind === 'goal')
    if (goalItems.length) {
      const area = areas[0] ?? (await addArea('General'))
      for (const item of goalItems) {
        const created = area ? await addGoal(area.id, item.title, context ?? undefined) : null
        if (created) goalsCreated += 1
        else failures += 1
      }
    }

    // type 'general', not 'quick_capture': useNotes dual-writes quick captures
    // to the Obsidian vault, and a page already captured into Symphony should
    // not also land there as a second copy.
    let firstNoteId: string | undefined
    let notesCreated = 0
    for (const note of notes) {
      const created = await addNote({
        title: note.title,
        content: note.content,
        type: 'general',
        source: 'import',
        context: context ?? undefined,
      })
      if (created) {
        notesCreated += 1
        firstNoteId ??= created.id
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

    const parts = [
      tasksCreated ? `${tasksCreated} task${tasksCreated === 1 ? '' : 's'}` : '',
      goalsCreated ? `${goalsCreated} goal${goalsCreated === 1 ? '' : 's'}` : '',
      notesCreated ? `${notesCreated} note${notesCreated === 1 ? '' : 's'}` : '',
    ].filter(Boolean)

    if (failures > 0) {
      const added = parts.length ? `Added ${parts.join(' and ')}, but ` : ''
      showToast(
        `${added}${failures} item${failures === 1 ? '' : 's'} could not be saved. The page is still in your inbox.`,
        'error',
        6000,
      )
    } else if (parts.length) {
      showToast(`Added ${parts.join(' and ')} from your page`, 'success', 4000)
    }

    return { tasksCreated, goalsCreated, notesCreated, failures }
  }, [addTask, addNote, getCurrentUserMember, areas, addArea, addGoal])

  return { commitPage }
}
