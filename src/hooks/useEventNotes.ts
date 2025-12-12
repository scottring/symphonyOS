import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { detectRecipeUrl } from '@/lib/recipeDetection'

export interface EventNote {
  id: string
  googleEventId: string
  notes: string | null
  assignedTo?: string | null // Legacy single assignment (for backwards compat)
  assignedToAll?: string[] // Multi-member assignment
  recipeUrl?: string | null
  projectId?: string | null // Linked project
  createdAt: Date
  updatedAt: Date
}

interface DbEventNote {
  id: string
  user_id: string
  google_event_id: string
  notes: string | null
  assigned_to: string | null
  assigned_to_all: string[] | null
  recipe_url: string | null
  project_id: string | null
  created_at: string
  updated_at: string
}

function dbNoteToEventNote(dbNote: DbEventNote): EventNote {
  return {
    id: dbNote.id,
    googleEventId: dbNote.google_event_id,
    notes: dbNote.notes,
    assignedTo: dbNote.assigned_to,
    assignedToAll: dbNote.assigned_to_all || [],
    recipeUrl: dbNote.recipe_url,
    projectId: dbNote.project_id,
    createdAt: new Date(dbNote.created_at),
    updatedAt: new Date(dbNote.updated_at),
  }
}

export function useEventNotes() {
  const { user } = useAuth()
  const [notes, setNotes] = useState<Map<string, EventNote>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch note for a specific event
  const fetchNote = useCallback(async (googleEventId: string): Promise<EventNote | null> => {
    if (!user) return null

    // Check cache first
    const cached = notes.get(googleEventId)
    if (cached !== undefined) return cached

    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('event_notes')
      .select('*')
      .eq('user_id', user.id)
      .eq('google_event_id', googleEventId)
      .maybeSingle()

    setLoading(false)

    if (fetchError) {
      setError(fetchError.message)
      return null
    }

    if (data) {
      const eventNote = dbNoteToEventNote(data as DbEventNote)
      setNotes((prev) => new Map(prev).set(googleEventId, eventNote))
      return eventNote
    }

    return null
  }, [user, notes])

  // Update or create note for an event (upsert)
  const updateNote = useCallback(async (googleEventId: string, noteText: string | null) => {
    if (!user) return

    // Get existing note for rollback
    const existingNote = notes.get(googleEventId)

    // Optimistic update
    const optimisticNote: EventNote = existingNote
      ? { ...existingNote, notes: noteText, updatedAt: new Date() }
      : {
          id: crypto.randomUUID(),
          googleEventId,
          notes: noteText,
          createdAt: new Date(),
          updatedAt: new Date(),
        }

    setNotes((prev) => new Map(prev).set(googleEventId, optimisticNote))

    // Upsert to database
    const { data, error: upsertError } = await supabase
      .from('event_notes')
      .upsert(
        {
          user_id: user.id,
          google_event_id: googleEventId,
          notes: noteText,
        },
        {
          onConflict: 'user_id,google_event_id',
        }
      )
      .select()
      .single()

    if (upsertError) {
      // Rollback on error
      if (existingNote) {
        setNotes((prev) => new Map(prev).set(googleEventId, existingNote))
      } else {
        setNotes((prev) => {
          const newMap = new Map(prev)
          newMap.delete(googleEventId)
          return newMap
        })
      }
      setError(upsertError.message)
      return
    }

    // Update with real data from DB
    if (data) {
      const realNote = dbNoteToEventNote(data as DbEventNote)
      setNotes((prev) => new Map(prev).set(googleEventId, realNote))
    }
  }, [user, notes])

  // Delete note for an event
  const deleteNote = useCallback(async (googleEventId: string) => {
    if (!user) return

    const existingNote = notes.get(googleEventId)
    if (!existingNote) return

    // Optimistic update
    setNotes((prev) => {
      const newMap = new Map(prev)
      newMap.delete(googleEventId)
      return newMap
    })

    const { error: deleteError } = await supabase
      .from('event_notes')
      .delete()
      .eq('user_id', user.id)
      .eq('google_event_id', googleEventId)

    if (deleteError) {
      // Rollback on error
      setNotes((prev) => new Map(prev).set(googleEventId, existingNote))
      setError(deleteError.message)
    }
  }, [user, notes])

  // Get note from cache (for immediate access)
  const getNote = useCallback((googleEventId: string): EventNote | undefined => {
    return notes.get(googleEventId)
  }, [notes])

  // Batch fetch notes for multiple events (for list view info icons)
  const fetchNotesForEvents = useCallback(async (googleEventIds: string[]) => {
    if (!user || googleEventIds.length === 0) return

    // Filter out already cached IDs
    const uncachedIds = googleEventIds.filter(id => !notes.has(id))
    if (uncachedIds.length === 0) return

    const { data, error: fetchError } = await supabase
      .from('event_notes')
      .select('*')
      .eq('user_id', user.id)
      .in('google_event_id', uncachedIds)

    if (fetchError) {
      setError(fetchError.message)
      return
    }

    if (data && data.length > 0) {
      setNotes((prev) => {
        const newMap = new Map(prev)
        for (const row of data) {
          const eventNote = dbNoteToEventNote(row as DbEventNote)
          newMap.set(eventNote.googleEventId, eventNote)
        }
        return newMap
      })
    }
  }, [user, notes])

  // Update assignment for an event (upsert)
  const updateEventAssignment = useCallback(async (googleEventId: string, memberId: string | null) => {
    if (!user) return

    const existingNote = notes.get(googleEventId)

    // Optimistic update
    const optimisticNote: EventNote = existingNote
      ? { ...existingNote, assignedTo: memberId, updatedAt: new Date() }
      : {
          id: crypto.randomUUID(),
          googleEventId,
          notes: null,
          assignedTo: memberId,
          createdAt: new Date(),
          updatedAt: new Date(),
        }

    setNotes((prev) => new Map(prev).set(googleEventId, optimisticNote))

    // Upsert to database
    const { data, error: upsertError } = await supabase
      .from('event_notes')
      .upsert(
        {
          user_id: user.id,
          google_event_id: googleEventId,
          assigned_to: memberId,
        },
        {
          onConflict: 'user_id,google_event_id',
        }
      )
      .select()
      .single()

    if (upsertError) {
      // Rollback on error
      if (existingNote) {
        setNotes((prev) => new Map(prev).set(googleEventId, existingNote))
      } else {
        setNotes((prev) => {
          const newMap = new Map(prev)
          newMap.delete(googleEventId)
          return newMap
        })
      }
      setError(upsertError.message)
      return
    }

    // Update with real data from DB
    if (data) {
      const realNote = dbNoteToEventNote(data as DbEventNote)
      setNotes((prev) => new Map(prev).set(googleEventId, realNote))
    }
  }, [user, notes])

  // Update recipe URL for an event (upsert)
  const updateRecipeUrl = useCallback(async (googleEventId: string, recipeUrl: string | null) => {
    if (!user) return

    const existingNote = notes.get(googleEventId)

    // Optimistic update
    const optimisticNote: EventNote = existingNote
      ? { ...existingNote, recipeUrl, updatedAt: new Date() }
      : {
          id: crypto.randomUUID(),
          googleEventId,
          notes: null,
          recipeUrl,
          createdAt: new Date(),
          updatedAt: new Date(),
        }

    setNotes((prev) => new Map(prev).set(googleEventId, optimisticNote))

    // Upsert to database
    const { data, error: upsertError } = await supabase
      .from('event_notes')
      .upsert(
        {
          user_id: user.id,
          google_event_id: googleEventId,
          recipe_url: recipeUrl,
        },
        {
          onConflict: 'user_id,google_event_id',
        }
      )
      .select()
      .single()

    if (upsertError) {
      // Rollback on error
      if (existingNote) {
        setNotes((prev) => new Map(prev).set(googleEventId, existingNote))
      } else {
        setNotes((prev) => {
          const newMap = new Map(prev)
          newMap.delete(googleEventId)
          return newMap
        })
      }
      setError(upsertError.message)
      return
    }

    // Update with real data from DB
    if (data) {
      const realNote = dbNoteToEventNote(data as DbEventNote)
      setNotes((prev) => new Map(prev).set(googleEventId, realNote))
    }
  }, [user, notes])

  // Auto-detect and store recipe URLs for events
  // Call this after fetching calendar events
  const autoDetectRecipes = useCallback(async (
    events: Array<{ id: string; google_event_id?: string; description?: string | null }>
  ) => {
    if (!user) return

    for (const event of events) {
      const eventId = event.google_event_id || event.id
      const existingNote = notes.get(eventId)

      // Skip if we already have a recipe URL for this event
      if (existingNote?.recipeUrl) continue

      // Try to detect a recipe URL from the description
      const detectedUrl = detectRecipeUrl(event.description)
      if (detectedUrl) {
        // Store the detected recipe URL
        await updateRecipeUrl(eventId, detectedUrl)
      }
    }
  }, [user, notes, updateRecipeUrl])

  // Update multi-member assignment for an event (upsert)
  // This assigns multiple family members to a shared event (e.g., family dinner)
  const updateEventAssignmentAll = useCallback(async (googleEventId: string, memberIds: string[]) => {
    if (!user) return

    const existingNote = notes.get(googleEventId)

    // Optimistic update
    const optimisticNote: EventNote = existingNote
      ? { ...existingNote, assignedToAll: memberIds, assignedTo: memberIds[0] || null, updatedAt: new Date() }
      : {
          id: crypto.randomUUID(),
          googleEventId,
          notes: null,
          assignedTo: memberIds[0] || null,
          assignedToAll: memberIds,
          createdAt: new Date(),
          updatedAt: new Date(),
        }

    setNotes((prev) => new Map(prev).set(googleEventId, optimisticNote))

    // Upsert to database - update both assigned_to (first member) and assigned_to_all (all members)
    const { data, error: upsertError } = await supabase
      .from('event_notes')
      .upsert(
        {
          user_id: user.id,
          google_event_id: googleEventId,
          assigned_to: memberIds[0] || null,
          assigned_to_all: memberIds,
        },
        {
          onConflict: 'user_id,google_event_id',
        }
      )
      .select()
      .single()

    if (upsertError) {
      // Rollback on error
      if (existingNote) {
        setNotes((prev) => new Map(prev).set(googleEventId, existingNote))
      } else {
        setNotes((prev) => {
          const newMap = new Map(prev)
          newMap.delete(googleEventId)
          return newMap
        })
      }
      setError(upsertError.message)
      return
    }

    // Update with real data from DB
    if (data) {
      const realNote = dbNoteToEventNote(data as DbEventNote)
      setNotes((prev) => new Map(prev).set(googleEventId, realNote))
    }
  }, [user, notes])

  // Update project link for an event (upsert)
  const updateEventProject = useCallback(async (googleEventId: string, projectId: string | null) => {
    if (!user) return

    const existingNote = notes.get(googleEventId)

    // Optimistic update
    const optimisticNote: EventNote = existingNote
      ? { ...existingNote, projectId, updatedAt: new Date() }
      : {
          id: crypto.randomUUID(),
          googleEventId,
          notes: null,
          projectId,
          createdAt: new Date(),
          updatedAt: new Date(),
        }

    setNotes((prev) => new Map(prev).set(googleEventId, optimisticNote))

    // Upsert to database
    const { data, error: upsertError } = await supabase
      .from('event_notes')
      .upsert(
        {
          user_id: user.id,
          google_event_id: googleEventId,
          project_id: projectId,
        },
        {
          onConflict: 'user_id,google_event_id',
        }
      )
      .select()
      .single()

    if (upsertError) {
      // Rollback on error
      if (existingNote) {
        setNotes((prev) => new Map(prev).set(googleEventId, existingNote))
      } else {
        setNotes((prev) => {
          const newMap = new Map(prev)
          newMap.delete(googleEventId)
          return newMap
        })
      }
      setError(upsertError.message)
      return
    }

    // Update with real data from DB
    if (data) {
      const realNote = dbNoteToEventNote(data as DbEventNote)
      setNotes((prev) => new Map(prev).set(googleEventId, realNote))
    }
  }, [user, notes])

  return {
    notes,
    loading,
    error,
    fetchNote,
    fetchNotesForEvents,
    updateNote,
    updateEventAssignment,
    updateEventAssignmentAll,
    updateRecipeUrl,
    updateEventProject,
    autoDetectRecipes,
    deleteNote,
    getNote,
  }
}
