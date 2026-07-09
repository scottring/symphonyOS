import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { detectRecipeUrl } from '@/lib/recipeDetection'
import { logger } from '@/lib/logger'
import type { TaskContext, TaskLink } from '@/types/task'

export interface EventNote {
  id: string
  googleEventId: string
  notes: string | null
  links?: TaskLink[] // User-attached links (reservations, docs, agendas)
  assignedTo?: string | null // Legacy single assignment (for backwards compat)
  assignedToAll?: string[] // Multi-member assignment
  recipeUrl?: string | null
  projectId?: string | null // Linked project
  eventTitle?: string | null // Stored event title for display
  eventStartTime?: Date | null // Stored event start time for display
  context?: TaskContext | null // Domain context override (work/family/personal)
  sharedWithFamily?: boolean // Surfaced on the shared family timeline
  shareNudgeDismissed?: boolean // "Share to family" nudge dismissed for this event
  createdAt: Date
  updatedAt: Date
}

interface DbEventNote {
  id: string
  user_id: string
  google_event_id: string
  notes: string | null
  links: TaskLink[] | null
  assigned_to: string | null
  assigned_to_all: string[] | null
  recipe_url: string | null
  project_id: string | null
  event_title: string | null
  event_start_time: string | null
  context: string | null
  shared_with_family: boolean
  share_nudge_dismissed: boolean
  created_at: string
  updated_at: string
}

function dbNoteToEventNote(dbNote: DbEventNote): EventNote {
  return {
    id: dbNote.id,
    googleEventId: dbNote.google_event_id,
    notes: dbNote.notes,
    links: dbNote.links ?? [],
    assignedTo: dbNote.assigned_to,
    assignedToAll: dbNote.assigned_to_all || [],
    recipeUrl: dbNote.recipe_url,
    projectId: dbNote.project_id,
    eventTitle: dbNote.event_title,
    eventStartTime: dbNote.event_start_time ? new Date(dbNote.event_start_time) : null,
    context: dbNote.context as TaskContext | null,
    sharedWithFamily: dbNote.shared_with_family ?? false,
    shareNudgeDismissed: dbNote.share_nudge_dismissed ?? false,
    createdAt: new Date(dbNote.created_at),
    updatedAt: new Date(dbNote.updated_at),
  }
}

// Unique per-mount channel names: two list views can overlap during route
// transitions, and same-topic channels conflict in supabase-js.
let eventNotesChannelSeq = 0

/**
 * Event-note state (context override, assignees, shared-with-family, notes…).
 *
 * Pass `eventIds` (the google event ids currently on screen) to opt in to
 * auto-loading: notes for those events are bulk-fetched on mount / when the
 * set grows, and a realtime subscription keeps them live across windows.
 * Without it the hook is a write-through cache that only knows about edits
 * made through this instance — list views MUST pass it or overrides persist
 * to the DB but render stale everywhere else.
 */
export function useEventNotes(eventIds?: string[]) {
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
    logger.debug('[updateNote] Called with:', { googleEventId, noteText: noteText?.substring(0, 50) })
    if (!user) {
      logger.debug('[updateNote] No user, returning early')
      return
    }

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
    logger.debug('[updateNote] Upserting:', { user_id: user.id, google_event_id: googleEventId, notes: noteText?.substring(0, 50) })
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

    logger.debug('[updateNote] Upsert result:', { data, error: upsertError?.message })

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

  // Append a link to an event (upsert). Reads the cached row for the current
  // list — callers fetch the note before rendering the panel, so the cache is
  // warm by the time a link can be added.
  const addEventLink = useCallback(async (googleEventId: string, url: string) => {
    if (!user) return

    const existingNote = notes.get(googleEventId)
    const currentLinks = existingNote?.links ?? []
    if (currentLinks.some((l) => l.url === url)) return
    const nextLinks: TaskLink[] = [...currentLinks, { url }]

    // Optimistic update
    const optimisticNote: EventNote = existingNote
      ? { ...existingNote, links: nextLinks, updatedAt: new Date() }
      : {
          id: crypto.randomUUID(),
          googleEventId,
          notes: null,
          links: nextLinks,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
    setNotes((prev) => new Map(prev).set(googleEventId, optimisticNote))

    const { data, error: upsertError } = await supabase
      .from('event_notes')
      .upsert(
        {
          user_id: user.id,
          google_event_id: googleEventId,
          links: nextLinks,
        },
        { onConflict: 'user_id,google_event_id' }
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

  // ── Auto-load for list views (opt-in via the eventIds param) ──
  // Note rows are sparse (most events have none), so "is it in the cache?"
  // can't gate refetches — track which ids this instance has already asked
  // for. Keyed on the joined ids so a same-content array doesn't refire.
  const requestedIdsRef = useRef<Set<string>>(new Set())
  const fetchNotesForEventsRef = useRef(fetchNotesForEvents)
  fetchNotesForEventsRef.current = fetchNotesForEvents
  const idsKey = eventIds === undefined ? undefined : eventIds.join('\n')

  useEffect(() => {
    if (!user || idsKey === undefined) return
    const ids = idsKey === '' ? [] : idsKey.split('\n')
    const fresh = ids.filter((id) => !requestedIdsRef.current.has(id))
    if (fresh.length === 0) return
    for (const id of fresh) requestedIdsRef.current.add(id)
    void fetchNotesForEventsRef.current(fresh)
  }, [user, idsKey])

  // ── Realtime: keep notes live across windows/devices ──
  // Only for opted-in (list view) instances; panel instances piggyback on
  // their own fetch-per-open. Without this, a context/share/assign change in
  // one window never reaches another until its next full reload.
  const wantsRealtime = eventIds !== undefined
  useEffect(() => {
    if (!user || !wantsRealtime) return
    const channel = supabase
      .channel(`event-notes-changes-${++eventNotesChannelSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_notes', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const row = payload.new as DbEventNote
            if (row.user_id !== user.id) return
            const note = dbNoteToEventNote(row)
            setNotes((prev) => new Map(prev).set(note.googleEventId, note))
          } else if (payload.eventType === 'DELETE') {
            // DELETE payloads only carry the primary key
            const oldId = (payload.old as { id?: string } | null)?.id
            if (!oldId) return
            setNotes((prev) => {
              for (const [key, n] of prev) {
                if (n.id === oldId) {
                  const next = new Map(prev)
                  next.delete(key)
                  return next
                }
              }
              return prev
            })
          }
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, wantsRealtime])

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
  // Pass eventTitle and eventStartTime to store event metadata for display on project page
  const updateEventProject = useCallback(async (
    googleEventId: string,
    projectId: string | null,
    eventTitle?: string | null,
    eventStartTime?: Date | null
  ) => {
    if (!user) return

    const existingNote = notes.get(googleEventId)

    // Optimistic update
    const optimisticNote: EventNote = existingNote
      ? { ...existingNote, projectId, eventTitle: eventTitle ?? existingNote.eventTitle, eventStartTime: eventStartTime ?? existingNote.eventStartTime, updatedAt: new Date() }
      : {
          id: crypto.randomUUID(),
          googleEventId,
          notes: null,
          projectId,
          eventTitle,
          eventStartTime,
          createdAt: new Date(),
          updatedAt: new Date(),
        }

    setNotes((prev) => new Map(prev).set(googleEventId, optimisticNote))

    // Upsert to database - include event metadata if provided
    const upsertData: Record<string, unknown> = {
      user_id: user.id,
      google_event_id: googleEventId,
      project_id: projectId,
    }
    if (eventTitle !== undefined) {
      upsertData.event_title = eventTitle
    }
    if (eventStartTime !== undefined) {
      upsertData.event_start_time = eventStartTime?.toISOString() ?? null
    }

    const { data, error: upsertError } = await supabase
      .from('event_notes')
      .upsert(upsertData, {
        onConflict: 'user_id,google_event_id',
      })
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

  // Update context override for an event
  const updateEventContext = useCallback(async (googleEventId: string, context: TaskContext | null) => {
    if (!user) return

    // Optimistic update
    const existingNote = notes.get(googleEventId)
    const optimistic: EventNote = existingNote
      ? { ...existingNote, context }
      : {
          id: '',
          googleEventId,
          notes: null,
          assignedToAll: [],
          context,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
    setNotes((prev) => new Map(prev).set(googleEventId, optimistic))

    const { data, error: upsertError } = await supabase
      .from('event_notes')
      .upsert(
        {
          user_id: user.id,
          google_event_id: googleEventId,
          context,
        },
        { onConflict: 'user_id,google_event_id' }
      )
      .select()
      .single()

    if (upsertError) {
      // Revert on error
      if (existingNote) {
        setNotes((prev) => new Map(prev).set(googleEventId, existingNote))
      }
      setError(upsertError.message)
      return
    }

    if (data) {
      const realNote = dbNoteToEventNote(data as DbEventNote)
      setNotes((prev) => new Map(prev).set(googleEventId, realNote))
    }
  }, [user, notes])

  // Set/clear whether an event is shared on the family timeline
  const updateEventSharedWithFamily = useCallback(async (googleEventId: string, shared: boolean) => {
    if (!user) return
    const existingNote = notes.get(googleEventId)
    const optimistic: EventNote = existingNote
      ? { ...existingNote, sharedWithFamily: shared, updatedAt: new Date() }
      : {
          id: '', googleEventId, notes: null, assignedToAll: [],
          sharedWithFamily: shared, createdAt: new Date(), updatedAt: new Date(),
        }
    setNotes((prev) => new Map(prev).set(googleEventId, optimistic))

    const { data, error: upsertError } = await supabase
      .from('event_notes')
      .upsert(
        { user_id: user.id, google_event_id: googleEventId, shared_with_family: shared },
        { onConflict: 'user_id,google_event_id' },
      )
      .select()
      .single()

    if (upsertError) {
      if (existingNote) setNotes((prev) => new Map(prev).set(googleEventId, existingNote))
      setError(upsertError.message)
      return
    }
    if (data) {
      const realNote = dbNoteToEventNote(data as DbEventNote)
      setNotes((prev) => new Map(prev).set(googleEventId, realNote))
    }
  }, [user, notes])

  // Mark the "share to family" nudge dismissed for an event (so it won't re-nag)
  const dismissShareNudge = useCallback(async (googleEventId: string) => {
    if (!user) return
    const existingNote = notes.get(googleEventId)
    const optimistic: EventNote = existingNote
      ? { ...existingNote, shareNudgeDismissed: true, updatedAt: new Date() }
      : {
          id: '', googleEventId, notes: null, assignedToAll: [],
          shareNudgeDismissed: true, createdAt: new Date(), updatedAt: new Date(),
        }
    setNotes((prev) => new Map(prev).set(googleEventId, optimistic))

    const { data, error: upsertError } = await supabase
      .from('event_notes')
      .upsert(
        { user_id: user.id, google_event_id: googleEventId, share_nudge_dismissed: true },
        { onConflict: 'user_id,google_event_id' },
      )
      .select()
      .single()

    if (upsertError) {
      if (existingNote) setNotes((prev) => new Map(prev).set(googleEventId, existingNote))
      setError(upsertError.message)
      return
    }
    if (data) {
      const realNote = dbNoteToEventNote(data as DbEventNote)
      setNotes((prev) => new Map(prev).set(googleEventId, realNote))
    }
  }, [user, notes])

  // Get event notes linked to a specific project
  const getEventNotesForProject = useCallback(async (projectId: string): Promise<EventNote[]> => {
    if (!user) return []

    const { data, error: fetchError } = await supabase
      .from('event_notes')
      .select('*')
      .eq('user_id', user.id)
      .eq('project_id', projectId)

    if (fetchError) {
      setError(fetchError.message)
      return []
    }

    if (data && data.length > 0) {
      const eventNotes = (data as DbEventNote[]).map(dbNoteToEventNote)
      // Update cache
      setNotes((prev) => {
        const newMap = new Map(prev)
        for (const note of eventNotes) {
          newMap.set(note.googleEventId, note)
        }
        return newMap
      })
      return eventNotes
    }

    return []
  }, [user])

  return {
    notes,
    loading,
    error,
    fetchNote,
    fetchNotesForEvents,
    updateNote,
    addEventLink,
    updateEventAssignment,
    updateEventAssignmentAll,
    updateRecipeUrl,
    updateEventProject,
    autoDetectRecipes,
    deleteNote,
    getNote,
    getEventNotesForProject,
    updateEventContext,
    updateEventSharedWithFamily,
    dismissShareNudge,
  }
}
