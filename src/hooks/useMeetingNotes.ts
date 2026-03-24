import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { logger } from '@/lib/logger'
import type { Note } from '@/types/note'
import type { Contact } from '@/types/contact'
import type { Task } from '@/types/task'

// ============================================================================
// Types
// ============================================================================

export interface MeetingAttendee {
  email: string
  displayName?: string
  responseStatus?: string
  self?: boolean
}

export interface AttendeeContext {
  attendee: MeetingAttendee
  contact: Contact | null // Matched Symphony contact
  recentNotes: Note[] // Notes linked to this contact
  recentTasks: Task[] // Tasks related to this contact
}

export interface MeetingState {
  eventId: string
  title: string
  startTime?: Date
  endTime?: Date
  attendees: MeetingAttendee[]
  attendeeContexts: AttendeeContext[]
  noteId: string | null // ID of the meeting note in the DB
  noteContent: string
  saving: boolean
  loading: boolean
}

// ============================================================================
// Hook
// ============================================================================

export function useMeetingNotes(contacts: Contact[], tasks: Task[]) {
  const { user } = useAuth()
  const [meeting, setMeeting] = useState<MeetingState | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedContentRef = useRef<string>('')

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  // Match an attendee to a Symphony contact by email or name
  const matchAttendeeToContact = useCallback(
    (attendee: MeetingAttendee): Contact | null => {
      if (!attendee.email && !attendee.displayName) return null

      // Try email match first (most reliable)
      if (attendee.email) {
        const emailMatch = contacts.find(
          (c) => c.email?.toLowerCase() === attendee.email.toLowerCase()
        )
        if (emailMatch) return emailMatch
      }

      // Try name match (fuzzy)
      if (attendee.displayName) {
        const nameLower = attendee.displayName.toLowerCase()
        const nameMatch = contacts.find(
          (c) => c.name.toLowerCase() === nameLower
        )
        if (nameMatch) return nameMatch

        // Partial name match (first name or last name)
        const partialMatch = contacts.find((c) => {
          const contactParts = c.name.toLowerCase().split(' ')
          const attendeeParts = nameLower.split(' ')
          return contactParts.some((cp) => attendeeParts.includes(cp))
        })
        if (partialMatch) return partialMatch
      }

      return null
    },
    [contacts]
  )

  // Fetch notes linked to a contact
  const fetchContactNotes = useCallback(
    async (contactId: string): Promise<Note[]> => {
      const { data: links, error: linksError } = await supabase
        .from('note_entity_links')
        .select('note_id')
        .eq('entity_type', 'contact')
        .eq('entity_id', contactId)

      if (linksError || !links || links.length === 0) return []

      const noteIds = links.map((l: { note_id: string }) => l.note_id)
      const { data: notesData, error: notesError } = await supabase
        .from('notes')
        .select('*')
        .in('id', noteIds)
        .order('created_at', { ascending: false })
        .limit(5)

      if (notesError || !notesData) return []

      return notesData.map((n: Record<string, unknown>) => ({
        id: n.id as string,
        title: (n.title as string) ?? undefined,
        content: n.content as string,
        type: n.type as Note['type'],
        source: n.source as Note['source'],
        createdAt: new Date(n.created_at as string),
        updatedAt: new Date(n.updated_at as string),
      }))
    },
    []
  )

  // Fetch tasks related to a contact
  const fetchContactTasks = useCallback(
    (contactId: string): Task[] => {
      return tasks
        .filter((t) => t.contactId === contactId && !t.completed)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, 3)
    },
    [tasks]
  )

  // Start a meeting
  const startMeeting = useCallback(
    async (
      eventId: string,
      title: string,
      attendees: MeetingAttendee[],
      startTime?: Date,
      endTime?: Date
    ) => {
      if (!user) return

      logger.debug('[useMeetingNotes] Starting meeting:', title, 'with', attendees.length, 'attendees')

      // Set initial state with loading
      setMeeting({
        eventId,
        title,
        startTime,
        endTime,
        attendees,
        attendeeContexts: [],
        noteId: null,
        noteContent: '',
        saving: false,
        loading: true,
      })

      // Build attendee contexts (match to contacts, fetch related data)
      const contexts: AttendeeContext[] = await Promise.all(
        attendees
          .filter((a) => !a.self) // Exclude self from attendee list
          .map(async (attendee) => {
            const contact = matchAttendeeToContact(attendee)
            let recentNotes: Note[] = []
            let recentTasks: Task[] = []

            if (contact) {
              ;[recentNotes, recentTasks] = await Promise.all([
                fetchContactNotes(contact.id),
                Promise.resolve(fetchContactTasks(contact.id)),
              ])
            }

            return { attendee, contact, recentNotes, recentTasks }
          })
      )

      // Check if there's an existing meeting note for this event
      const { data: existingNote } = await supabase
        .from('notes')
        .select('id, content')
        .eq('user_id', user.id)
        .eq('type', 'meeting_note')
        .eq('external_id', eventId)
        .single()

      let noteId: string | null = null
      let noteContent = ''

      if (existingNote) {
        noteId = existingNote.id
        noteContent = existingNote.content || ''
      } else {
        // Create a new meeting note
        const { data: newNote, error: createError } = await supabase
          .from('notes')
          .insert({
            user_id: user.id,
            title: `Meeting: ${title}`,
            content: '',
            type: 'meeting_note',
            source: 'manual',
            external_id: eventId,
          })
          .select('id')
          .single()

        if (createError) {
          console.error('[useMeetingNotes] Error creating meeting note:', createError)
        } else if (newNote) {
          noteId = newNote.id

          // Link note to the event
          await supabase.from('note_entity_links').insert({
            note_id: newNote.id,
            entity_type: 'event',
            entity_id: eventId,
            link_type: 'primary',
          })

          // Link note to matched contacts
          for (const ctx of contexts) {
            if (ctx.contact) {
              await supabase.from('note_entity_links').insert({
                note_id: newNote.id,
                entity_type: 'contact',
                entity_id: ctx.contact.id,
                link_type: 'related',
              })
            }
          }
        }
      }

      lastSavedContentRef.current = noteContent

      setMeeting({
        eventId,
        title,
        startTime,
        endTime,
        attendees,
        attendeeContexts: contexts,
        noteId,
        noteContent,
        saving: false,
        loading: false,
      })
    },
    [user, matchAttendeeToContact, fetchContactNotes, fetchContactTasks]
  )

  // Save meeting note content (debounced)
  const saveMeetingNote = useCallback(
    (content: string) => {
      setMeeting((prev) => (prev ? { ...prev, noteContent: content } : null))

      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      debounceRef.current = setTimeout(async () => {
        const currentMeeting = meeting
        if (!currentMeeting?.noteId || !user) return
        if (content === lastSavedContentRef.current) return

        setMeeting((prev) => (prev ? { ...prev, saving: true } : null))

        const { error } = await supabase
          .from('notes')
          .update({ content, updated_at: new Date().toISOString() })
          .eq('id', currentMeeting.noteId)

        if (error) {
          console.error('[useMeetingNotes] Error saving note:', error)
        } else {
          lastSavedContentRef.current = content
        }

        setMeeting((prev) => (prev ? { ...prev, saving: false } : null))
      }, 1000)
    },
    [meeting, user]
  )

  // End meeting - final save
  const endMeeting = useCallback(async () => {
    if (!meeting?.noteId || !user) {
      setMeeting(null)
      return
    }

    // Clear any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    // Final save
    if (meeting.noteContent !== lastSavedContentRef.current) {
      await supabase
        .from('notes')
        .update({
          content: meeting.noteContent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', meeting.noteId)
    }

    logger.debug('[useMeetingNotes] Meeting ended:', meeting.title)
    setMeeting(null)
  }, [meeting, user])

  return {
    meeting,
    startMeeting,
    saveMeetingNote,
    endMeeting,
    isInMeeting: meeting !== null,
  }
}
