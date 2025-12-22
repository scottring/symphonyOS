import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type {
  Note,
  DisplayNote,
  DbNote,
  NoteType,
  NoteSource,
  NoteEntityLink,
  DbNoteEntityLink,
  NoteEntityType,
  NoteLinkType,
  CreateNoteInput,
  UpdateNoteInput,
  CreateEntityLinkInput,
} from '@/types/note'
import type { Task } from '@/types/task'

// ============================================================================
// Converters
// ============================================================================
function dbNoteToNote(dbNote: DbNote): Note {
  return {
    id: dbNote.id,
    title: dbNote.title ?? undefined,
    content: dbNote.content,
    type: dbNote.type as NoteType,
    source: dbNote.source as NoteSource,
    topicId: dbNote.topic_id ?? undefined,
    audioUrl: dbNote.audio_url ?? undefined,
    externalId: dbNote.external_id ?? undefined,
    externalUrl: dbNote.external_url ?? undefined,
    createdAt: new Date(dbNote.created_at),
    updatedAt: new Date(dbNote.updated_at),
  }
}

function dbEntityLinkToEntityLink(dbLink: DbNoteEntityLink): NoteEntityLink {
  return {
    id: dbLink.id,
    noteId: dbLink.note_id,
    entityType: dbLink.entity_type as NoteEntityType,
    entityId: dbLink.entity_id,
    linkType: dbLink.link_type as NoteLinkType,
    createdAt: new Date(dbLink.created_at),
  }
}

function taskToDisplayNote(task: Task): DisplayNote {
  return {
    id: `task-${task.id}`,
    content: task.notes || '',
    type: 'task_note' as NoteType,
    source: 'task' as NoteSource,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    sourceTaskId: task.id,
    sourceTaskTitle: task.title,
  }
}

// ============================================================================
// Hook
// ============================================================================
export function useNotes() {
  const { user } = useAuth()
  const [notes, setNotes] = useState<Note[]>([])
  const [taskNotes, setTaskNotes] = useState<DisplayNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch notes and task notes on mount and when user changes
  useEffect(() => {
    if (!user) {
      console.log('[useNotes] No user, setting empty notes and loading=false')
      setNotes([])
      setTaskNotes([])
      setLoading(false)
      return
    }

    async function fetchNotesAndTasks() {
      if (!user) return

      console.log('[useNotes] Fetching notes and task notes for user:', user.id)
      setLoading(true)
      setError(null)

      // Fetch Second Brain notes
      const { data: notesData, error: notesError } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (notesError) {
        console.error('[useNotes] Error fetching notes:', notesError)
        setError(notesError.message)
        setLoading(false)
        return
      }

      // Fetch tasks that have notes
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .not('notes', 'is', null)
        .neq('notes', '')
        .order('updated_at', { ascending: false })

      if (tasksError) {
        console.error('[useNotes] Error fetching task notes:', tasksError)
        // Don't fail completely, just log the error
      }

      const secondBrainNotes = (notesData as DbNote[]).map(dbNoteToNote)
      const taskNotesConverted = (tasksData || []).map((task: any) =>
        taskToDisplayNote({
          id: task.id,
          title: task.title,
          notes: task.notes,
          createdAt: new Date(task.created_at),
          updatedAt: new Date(task.updated_at),
        } as Task)
      )

      console.log('[useNotes] Successfully fetched', secondBrainNotes.length, 'notes and', taskNotesConverted.length, 'task notes')
      setNotes(secondBrainNotes)
      setTaskNotes(taskNotesConverted)
      setLoading(false)
    }

    fetchNotesAndTasks()
  }, [user])

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  const addNote = useCallback(
    async (input: CreateNoteInput): Promise<Note | null> => {
      if (!user) return null

      // Optimistic update
      const tempId = crypto.randomUUID()
      const optimisticNote: Note = {
        id: tempId,
        title: input.title,
        content: input.content,
        type: input.type ?? 'quick_capture',
        source: input.source ?? 'manual',
        topicId: input.topicId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      setNotes((prev) => [optimisticNote, ...prev])

      const { data, error: insertError } = await supabase
        .from('notes')
        .insert({
          user_id: user.id,
          title: input.title ?? null,
          content: input.content,
          type: input.type ?? 'quick_capture',
          source: input.source ?? 'manual',
          topic_id: input.topicId ?? null,
        })
        .select()
        .single()

      if (insertError) {
        // Rollback on error
        setNotes((prev) => prev.filter((n) => n.id !== tempId))
        setError(insertError.message)
        return null
      }

      // Replace optimistic note with real one
      const realNote = dbNoteToNote(data as DbNote)
      setNotes((prev) => prev.map((n) => (n.id === tempId ? realNote : n)))

      return realNote
    },
    [user]
  )

  const updateNote = useCallback(
    async (id: string, updates: UpdateNoteInput): Promise<void> => {
      const note = notes.find((n) => n.id === id)
      if (!note) return

      // Optimistic update
      setNotes((prev) =>
        prev.map((n) =>
          n.id === id
            ? {
                ...n,
                ...updates,
                topicId: updates.topicId === null ? undefined : (updates.topicId ?? n.topicId),
                updatedAt: new Date(),
              }
            : n
        )
      )

      // Convert to DB format
      const dbUpdates: Record<string, unknown> = {}
      if (updates.title !== undefined) dbUpdates.title = updates.title ?? null
      if (updates.content !== undefined) dbUpdates.content = updates.content
      if (updates.type !== undefined) dbUpdates.type = updates.type
      if (updates.topicId !== undefined) dbUpdates.topic_id = updates.topicId ?? null

      const { error: updateError } = await supabase.from('notes').update(dbUpdates).eq('id', id)

      if (updateError) {
        // Rollback on error
        setNotes((prev) => prev.map((n) => (n.id === id ? note : n)))
        setError(updateError.message)
      }
    },
    [notes]
  )

  const deleteNote = useCallback(
    async (id: string): Promise<void> => {
      // Save for rollback
      const noteToDelete = notes.find((n) => n.id === id)
      if (!noteToDelete) return

      // Optimistic update
      setNotes((prev) => prev.filter((n) => n.id !== id))

      const { error: deleteError } = await supabase.from('notes').delete().eq('id', id)

      if (deleteError) {
        // Rollback on error
        setNotes((prev) => {
          const index = prev.findIndex((n) => n.createdAt < noteToDelete.createdAt)
          if (index === -1) return [...prev, noteToDelete]
          return [...prev.slice(0, index), noteToDelete, ...prev.slice(index)]
        })
        setError(deleteError.message)
      }
    },
    [notes]
  )

  // ============================================================================
  // Entity Links
  // ============================================================================

  const addEntityLink = useCallback(
    async (noteId: string, input: CreateEntityLinkInput): Promise<NoteEntityLink | null> => {
      const { data, error: insertError } = await supabase
        .from('note_entity_links')
        .insert({
          note_id: noteId,
          entity_type: input.entityType,
          entity_id: input.entityId,
          link_type: input.linkType ?? 'related',
        })
        .select()
        .single()

      if (insertError) {
        setError(insertError.message)
        return null
      }

      return dbEntityLinkToEntityLink(data as DbNoteEntityLink)
    },
    []
  )

  const removeEntityLink = useCallback(async (linkId: string): Promise<void> => {
    const { error: deleteError } = await supabase.from('note_entity_links').delete().eq('id', linkId)

    if (deleteError) {
      setError(deleteError.message)
    }
  }, [])

  const getEntityLinks = useCallback(async (noteId: string): Promise<NoteEntityLink[]> => {
    const { data, error: fetchError } = await supabase
      .from('note_entity_links')
      .select('*')
      .eq('note_id', noteId)

    if (fetchError) {
      setError(fetchError.message)
      return []
    }

    return (data as DbNoteEntityLink[]).map(dbEntityLinkToEntityLink)
  }, [])

  const getNotesForEntity = useCallback(
    async (entityType: NoteEntityType, entityId: string): Promise<Note[]> => {
      const { data: links, error: linksError } = await supabase
        .from('note_entity_links')
        .select('note_id')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)

      if (linksError) {
        setError(linksError.message)
        return []
      }

      if (!links || links.length === 0) return []

      const noteIds = links.map((l) => l.note_id)
      const { data: notesData, error: notesError } = await supabase
        .from('notes')
        .select('*')
        .in('id', noteIds)
        .order('created_at', { ascending: false })

      if (notesError) {
        setError(notesError.message)
        return []
      }

      return (notesData as DbNote[]).map(dbNoteToNote)
    },
    []
  )

  // ============================================================================
  // Query helpers
  // ============================================================================

  const getNoteById = useCallback(
    (id: string): Note | undefined => {
      return notes.find((n) => n.id === id)
    },
    [notes]
  )

  const searchNotes = useCallback(
    (query: string): Note[] => {
      if (!query.trim()) return notes
      const lowerQuery = query.toLowerCase()
      return notes.filter(
        (n) =>
          n.content.toLowerCase().includes(lowerQuery) ||
          (n.title && n.title.toLowerCase().includes(lowerQuery))
      )
    },
    [notes]
  )

  const getNotesByTopic = useCallback(
    (topicId: string | null): Note[] => {
      if (topicId === null) {
        return notes.filter((n) => !n.topicId)
      }
      return notes.filter((n) => n.topicId === topicId)
    },
    [notes]
  )

  const getNotesByType = useCallback(
    (type: NoteType): Note[] => {
      return notes.filter((n) => n.type === type)
    },
    [notes]
  )

  // Merge notes and task notes for display
  const allNotes = useMemo<DisplayNote[]>(() => {
    const combined = [...notes, ...taskNotes]
    return combined.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  }, [notes, taskNotes])

  // Create a notes map for efficient lookup
  const notesMap = useMemo(() => {
    const map = new Map<string, Note | DisplayNote>()
    for (const note of allNotes) {
      map.set(note.id, note)
    }
    return map
  }, [allNotes])

  // Group notes by date for list view
  const notesByDate = useMemo(() => {
    const groups: { date: string; label: string; notes: DisplayNote[] }[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)

    const todayNotes: DisplayNote[] = []
    const yesterdayNotes: DisplayNote[] = []
    const thisWeekNotes: DisplayNote[] = []
    const olderNotes: DisplayNote[] = []

    for (const note of allNotes) {
      const noteDate = new Date(note.updatedAt)
      noteDate.setHours(0, 0, 0, 0)

      if (noteDate.getTime() === today.getTime()) {
        todayNotes.push(note)
      } else if (noteDate.getTime() === yesterday.getTime()) {
        yesterdayNotes.push(note)
      } else if (noteDate >= weekAgo) {
        thisWeekNotes.push(note)
      } else {
        olderNotes.push(note)
      }
    }

    if (todayNotes.length > 0) {
      groups.push({ date: 'today', label: 'Today', notes: todayNotes })
    }
    if (yesterdayNotes.length > 0) {
      groups.push({ date: 'yesterday', label: 'Yesterday', notes: yesterdayNotes })
    }
    if (thisWeekNotes.length > 0) {
      groups.push({ date: 'this-week', label: 'This Week', notes: thisWeekNotes })
    }
    if (olderNotes.length > 0) {
      groups.push({ date: 'older', label: 'Older', notes: olderNotes })
    }

    return groups
  }, [allNotes])

  return {
    notes: allNotes, // Return merged notes
    notesMap,
    notesByDate,
    loading,
    error,
    // CRUD
    addNote,
    updateNote,
    deleteNote,
    // Entity links
    addEntityLink,
    removeEntityLink,
    getEntityLinks,
    getNotesForEntity,
    // Queries
    getNoteById,
    searchNotes,
    getNotesByTopic,
    getNotesByType,
  }
}
