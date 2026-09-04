// "To buy" conversion — task → list item, with undo.
//
// One implementation for every surface that renders the ToBuyNudge (Today's
// agenda, the Inbox). It used to live inline in HomeViewContainer, which meant
// the /inbox route — a separate container with its own ScheduleActionsProvider
// — never had a sender, and the nudge InboxView renders was dead code there.
//
// The task is DELETED (an item lives in exactly one place — same semantics as
// inbox send-to-calendar), so the undo path is what makes this acceptable: it
// removes the created list item and re-inserts the task through addTask, which
// keeps optimistic state + the local write bus honest. The list is created
// lazily, native and family-shared — never the Apple bridge.
import { useCallback } from 'react'
import type { Task } from '@/types/task'
import type { useListsContext } from '@/contexts/ListsContext'
import type { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { supabase, getAuthUser } from '@/lib/supabase'
import { TO_BUY_LIST_TITLE, findToBuyList, buyItemText, announceToBuyChanged } from '@/lib/lists/toBuy'

type ListsApi = ReturnType<typeof useListsContext>
type TasksApi = ReturnType<typeof useSupabaseTasks>

interface Args {
  tasks: Task[]
  lists: ListsApi['lists']
  addList: ListsApi['addList']
  deleteTask: TasksApi['deleteTask']
  addTask: TasksApi['addTask']
}

export type SendTaskToBuy = (taskId: string) => Promise<{ itemText: string; undo: () => Promise<void> } | null>

export function useSendTaskToBuy({ tasks, lists, addList, deleteTask, addTask }: Args): SendTaskToBuy {
  return useCallback(async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return null
    const list = findToBuyList(lists)
      ?? (await addList({ title: TO_BUY_LIST_TITLE, category: 'shopping', visibility: 'family' }))
      ?? undefined
    if (!list) return null
    const { data: { user } } = await getAuthUser()
    if (!user) return null
    const { data: maxRows } = await supabase
      .from('list_items').select('sort_order')
      .eq('list_id', list.id).order('sort_order', { ascending: false }).limit(1)
    const nextSort = ((maxRows?.[0]?.sort_order as number | undefined) ?? 0) + 1
    const { data: item, error } = await supabase
      .from('list_items')
      .insert({
        user_id: user.id, list_id: list.id, text: buyItemText(task.title),
        note: task.notes ?? null, sort_order: nextSort,
      })
      .select('id, text').single()
    if (error || !item) return null
    await deleteTask(taskId)
    announceToBuyChanged()
    const snapshot = task
    return {
      itemText: (item as { text: string }).text,
      undo: async () => {
        await supabase.from('list_items').delete().eq('id', (item as { id: string }).id)
        await addTask(snapshot.title, snapshot.contactId, snapshot.projectId, snapshot.scheduledFor ?? undefined, {
          context: snapshot.context ?? null,
          assignedTo: snapshot.assignedTo ?? null,
          assignedToAll: snapshot.assignedToAll,
          bucket: snapshot.bucket,
          weekStart: snapshot.weekStart,
          isAllDay: snapshot.isAllDay,
          phoneNumber: snapshot.phoneNumber,
          email: snapshot.email,
        })
        announceToBuyChanged()
      },
    }
  }, [tasks, lists, addList, deleteTask, addTask])
}
