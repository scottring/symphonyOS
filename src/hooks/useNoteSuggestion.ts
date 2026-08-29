import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Note } from '@/types/note'
import type { Task } from '@/types/task'
import type { DomainId } from '@/lib/domains'

export interface NoteSuggestion {
  best_match: { id: string; confidence: number } | null
  suggested_new_title: string
}

interface UseNoteSuggestionArgs {
  task: Pick<Task, 'id' | 'title' | 'notes'>
  candidateNotes: Note[]
  domain: DomainId | 'universal'
  /** Gates the fetch — typically `true` only when the picker is open. */
  enabled: boolean
}

// Session-scoped cache: taskId → suggestion. Persists for the lifetime of
// the page so re-opening the picker on the same row doesn't re-bill.
const cache = new Map<string, NoteSuggestion>()

// In-flight deduplication: taskId → shared promise. Multiple hook instances
// for the same taskId share one network call; the promise resolves for all.
const pending = new Map<string, Promise<NoteSuggestion>>()

export function useNoteSuggestion({
  task,
  candidateNotes,
  domain,
  enabled,
}: UseNoteSuggestionArgs) {
  const [suggestion, setSuggestion] = useState<NoteSuggestion | null>(() => cache.get(task.id) ?? null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return
    // Already resolved and cached?
    const cached = cache.get(task.id)
    if (cached) {
      setSuggestion(cached)
      return
    }

    let cancelled = false
    setLoading(true)

    // Reuse an in-flight fetch for the same task so we don't double-bill.
    let fetchPromise = pending.get(task.id)
    if (!fetchPromise) {
      const candidate_notes = candidateNotes
        .slice(0, 30)
        .map((n) => ({
          id: n.id,
          title: n.title ?? '(untitled)',
          first_200_chars: (n.content ?? '').slice(0, 200),
        }))

      fetchPromise = supabase.functions
        .invoke('note-match', {
          body: {
            inbox_item: { title: task.title, notes: task.notes },
            candidate_notes,
            domain,
          },
        })
        .then(({ data, error }) => {
          pending.delete(task.id)
          if (error || !data) {
            const fallback: NoteSuggestion = { best_match: null, suggested_new_title: task.title }
            cache.set(task.id, fallback)
            return fallback
          }
          const result = data as NoteSuggestion
          cache.set(task.id, result)
          return result
        })

      pending.set(task.id, fetchPromise)
    }

    fetchPromise.then((result) => {
      if (cancelled) return
      setSuggestion(result)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [enabled, task.id, task.title, task.notes, candidateNotes, domain])

  return { suggestion, loading }
}
