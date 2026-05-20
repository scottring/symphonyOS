import type { Task } from '@/types/task'

export interface DiscussionItem {
  id: string
  title: string
  /** Optional one-line note about what specifically needs to be discussed. */
  note: string | null
}

/**
 * Picks tasks flagged "needs discussion" for the Today rail's
 * FOR DISCUSSION panel. Filters to incomplete tasks (the discussion
 * presumably resolves once the task is closed), sorts by recency, caps
 * at `limit` (default 5).
 */
export function discussionItems(tasks: Task[], limit = 5): DiscussionItem[] {
  return tasks
    .filter((t) => t.needsDiscussion === true && !t.completed)
    .slice()
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      title: t.title,
      note: t.discussionNote?.trim() || null,
    }))
}
