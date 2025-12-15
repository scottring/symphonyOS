import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type {
  NoteTopic,
  DbNoteTopic,
  CreateNoteTopicInput,
  UpdateNoteTopicInput,
} from '@/types/note'

// ============================================================================
// Converter
// ============================================================================
function dbTopicToTopic(dbTopic: DbNoteTopic): NoteTopic {
  return {
    id: dbTopic.id,
    name: dbTopic.name,
    description: dbTopic.description ?? undefined,
    color: dbTopic.color ?? undefined,
    archivedAt: dbTopic.archived_at ? new Date(dbTopic.archived_at) : undefined,
    createdAt: new Date(dbTopic.created_at),
    updatedAt: new Date(dbTopic.updated_at),
  }
}

// ============================================================================
// Hook
// ============================================================================
export function useNoteTopics() {
  const { user } = useAuth()
  const [topics, setTopics] = useState<NoteTopic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch topics on mount and when user changes
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing state on auth change
      setTopics([])
      setLoading(false)
      return
    }

    async function fetchTopics() {
      if (!user) return

      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('note_topics')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true })

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      setTopics((data as DbNoteTopic[]).map(dbTopicToTopic))
      setLoading(false)
    }

    fetchTopics()
  }, [user])

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  const addTopic = useCallback(
    async (input: CreateNoteTopicInput): Promise<NoteTopic | null> => {
      if (!user) return null

      // Optimistic update
      const tempId = crypto.randomUUID()
      const optimisticTopic: NoteTopic = {
        id: tempId,
        name: input.name,
        description: input.description,
        color: input.color,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      setTopics((prev) => [...prev, optimisticTopic].sort((a, b) => a.name.localeCompare(b.name)))

      const { data, error: insertError } = await supabase
        .from('note_topics')
        .insert({
          user_id: user.id,
          name: input.name,
          description: input.description ?? null,
          color: input.color ?? null,
        })
        .select()
        .single()

      if (insertError) {
        // Rollback on error
        setTopics((prev) => prev.filter((t) => t.id !== tempId))
        setError(insertError.message)
        return null
      }

      // Replace optimistic topic with real one
      const realTopic = dbTopicToTopic(data as DbNoteTopic)
      setTopics((prev) =>
        prev.map((t) => (t.id === tempId ? realTopic : t)).sort((a, b) => a.name.localeCompare(b.name))
      )

      return realTopic
    },
    [user]
  )

  const updateTopic = useCallback(
    async (id: string, updates: UpdateNoteTopicInput): Promise<void> => {
      const topic = topics.find((t) => t.id === id)
      if (!topic) return

      // Optimistic update
      setTopics((prev) =>
        prev
          .map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...updates,
                  archivedAt: updates.archivedAt === null ? undefined : (updates.archivedAt ?? t.archivedAt),
                  updatedAt: new Date(),
                }
              : t
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      )

      // Convert to DB format
      const dbUpdates: Record<string, unknown> = {}
      if (updates.name !== undefined) dbUpdates.name = updates.name
      if (updates.description !== undefined) dbUpdates.description = updates.description ?? null
      if (updates.color !== undefined) dbUpdates.color = updates.color ?? null
      if (updates.archivedAt !== undefined) {
        dbUpdates.archived_at = updates.archivedAt ? updates.archivedAt.toISOString() : null
      }

      const { error: updateError } = await supabase.from('note_topics').update(dbUpdates).eq('id', id)

      if (updateError) {
        // Rollback on error
        setTopics((prev) => prev.map((t) => (t.id === id ? topic : t)))
        setError(updateError.message)
      }
    },
    [topics]
  )

  const deleteTopic = useCallback(
    async (id: string): Promise<void> => {
      // Save for rollback
      const topicToDelete = topics.find((t) => t.id === id)
      if (!topicToDelete) return

      // Optimistic update
      setTopics((prev) => prev.filter((t) => t.id !== id))

      const { error: deleteError } = await supabase.from('note_topics').delete().eq('id', id)

      if (deleteError) {
        // Rollback on error
        setTopics((prev) => [...prev, topicToDelete].sort((a, b) => a.name.localeCompare(b.name)))
        setError(deleteError.message)
      }
    },
    [topics]
  )

  const archiveTopic = useCallback(
    async (id: string): Promise<void> => {
      await updateTopic(id, { archivedAt: new Date() })
    },
    [updateTopic]
  )

  const unarchiveTopic = useCallback(
    async (id: string): Promise<void> => {
      await updateTopic(id, { archivedAt: null })
    },
    [updateTopic]
  )

  // ============================================================================
  // Query helpers
  // ============================================================================

  const getTopicById = useCallback(
    (id: string): NoteTopic | undefined => {
      return topics.find((t) => t.id === id)
    },
    [topics]
  )

  const searchTopics = useCallback(
    (query: string): NoteTopic[] => {
      if (!query.trim()) return topics.filter((t) => !t.archivedAt)
      const lowerQuery = query.toLowerCase()
      return topics.filter(
        (t) => !t.archivedAt && t.name.toLowerCase().includes(lowerQuery)
      )
    },
    [topics]
  )

  // Active (non-archived) topics
  const activeTopics = useMemo(() => {
    return topics.filter((t) => !t.archivedAt)
  }, [topics])

  // Archived topics
  const archivedTopics = useMemo(() => {
    return topics.filter((t) => t.archivedAt)
  }, [topics])

  // Create a topics map for efficient lookup
  const topicsMap = useMemo(() => {
    const map = new Map<string, NoteTopic>()
    for (const topic of topics) {
      map.set(topic.id, topic)
    }
    return map
  }, [topics])

  return {
    topics,
    topicsMap,
    activeTopics,
    archivedTopics,
    loading,
    error,
    // CRUD
    addTopic,
    updateTopic,
    deleteTopic,
    archiveTopic,
    unarchiveTopic,
    // Queries
    getTopicById,
    searchTopics,
  }
}
