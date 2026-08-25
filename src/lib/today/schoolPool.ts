import type { Task } from '@/types/task'

/** The School pool: candidates the feed connectors extracted, waiting for a
 * fate. Not a horizon — these sit in the inbox bucket, so selectHorizonPool
 * cannot serve them. Oldest first, matching the backlog's ordering: the
 * stalest school item is the one most likely to be about to expire.
 *
 * Unfiltered by assignee on purpose, like the week/month pools — a pool is a
 * census, not a view. */
export function selectSchoolPool(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => !t.completed && t.bucket === 'inbox' && !!t.captureId)
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
}

/** Read the provenance lines extract-capture writes into tasks.notes.
 *
 * Both ends of this format live in this repo — supabase/functions/
 * extract-capture/index.ts writes it, this reads it — and the test above
 * pins it. If the edge function's note body changes, that test fails and
 * names the reason, which is the point of parsing it here rather than
 * adding two more columns. */
export function parseCaptureMeta(notes: string | undefined): { source?: string; forWho?: string } {
  if (!notes) return {}
  const out: { source?: string; forWho?: string } = {}
  // "Source: <label> (confidence 0.90)" — the label is everything before the
  // trailing parenthetical.
  const source = /^Source:\s*(.+?)(?:\s*\(confidence[^)]*\))?$/m.exec(notes)
  if (source?.[1]) out.source = source[1].trim()
  const forWho = /^For:\s*(.+)$/m.exec(notes)
  if (forWho?.[1]) out.forWho = forWho[1].trim()
  return out
}

export function formatCaptureMeta(meta: { source?: string; forWho?: string }): string | undefined {
  const parts = [meta.source, meta.forWho].filter((p): p is string => !!p)
  return parts.length > 0 ? parts.join(' · ') : undefined
}
