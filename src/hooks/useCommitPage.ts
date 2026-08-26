// src/hooks/useCommitPage.ts
//
// Commits a reviewed page: one INSERT per confirmed task, one per confirmed
// note, and one attachments row pinning the page image to whatever came off it.
// Shared by the manual upload flow and the inbox's pending-page section so the
// two can never drift.

import { useCallback } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { planItemToAddTaskArgs, type PlanItem } from '@/lib/planParse'
import type { PageNote } from '@/lib/pageParse'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useNotes } from '@/hooks/useNotes'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useDomain } from '@/hooks/useDomain'
import { showToast } from '@/hooks/useToast'

export interface CommitPagePayload {
  items: PlanItem[]
  notes: PageNote[]
  /** Where the page lives in the `attachments` bucket, if we know. */
  storagePath: string | null
}

export function useCommitPage() {
  const { addTask } = useSupabaseTasks()
  const { addNote } = useNotes()
  const { getCurrentUserMember } = useFamilyMembers()
  const { currentDomain } = useDomain()

  const commitPage = useCallback(async ({ items, notes, storagePath }: CommitPagePayload) => {
    const context = currentDomain === 'universal' ? null : currentDomain
    const commitCtx = {
      currentWeekStart: weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn),
      context,
    }
    const defaultAssigneeId = getCurrentUserMember()?.id

    // Everything rides the INSERT — a follow-up update can be dropped before
    // the temp→real id swap lands (the addTask-then-setBucket race).
    let firstTaskId: string | undefined
    for (const item of items) {
      const args = planItemToAddTaskArgs(item, commitCtx)
      const id = await addTask(args.title, undefined, undefined, args.scheduledFor, {
        ...args.options,
        defaultAssigneeId,
      })
      firstTaskId ??= id
    }

    // type 'general', not 'quick_capture': useNotes dual-writes quick captures
    // to the Obsidian vault, and a page already captured into Symphony should
    // not also land there as a second copy.
    let firstNoteId: string | undefined
    for (const note of notes) {
      const created = await addNote({
        title: note.title,
        content: note.content,
        type: 'general',
        source: 'import',
        context: context ?? undefined,
      })
      firstNoteId ??= created?.id
    }

    // The page image is already in the bucket — this only files the row, so it
    // does NOT go through useAttachments (which uploads a File).
    const entityId = firstNoteId ?? firstTaskId
    if (storagePath && entityId) {
      const { data: { user } } = await getAuthUser()
      if (user) {
        await supabase.from('attachments').insert({
          user_id: user.id,
          entity_type: firstNoteId ? 'note' : 'task',
          entity_id: entityId,
          file_name: storagePath.split('/').pop() ?? 'page',
          file_type: storagePath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
          file_size: 0,
          storage_path: storagePath,
        })
      }
    }

    const parts = [
      items.length ? `${items.length} task${items.length === 1 ? '' : 's'}` : '',
      notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : '',
    ].filter(Boolean)
    showToast(`Added ${parts.join(' and ')} from your page`, 'success', 4000)
  }, [addTask, addNote, currentDomain, getCurrentUserMember])

  return { commitPage }
}
