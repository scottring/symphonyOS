import { createContext, useContext, type ReactNode } from 'react'
import { useNotes } from '@/hooks/useNotes'
import { useNoteTopics } from '@/hooks/useNoteTopics'
import type {
  Note,
  DisplayNote,
  NoteType,
  NoteEntityType,
  NoteEntityLink,
  NoteTopic,
  CreateNoteInput,
  UpdateNoteInput,
  CreateNoteTopicInput,
  CreateEntityLinkInput,
} from '@/types/note'

export interface NotesContextValue {
  // Notes data
  notes: DisplayNote[]
  notesMap: Map<string, Note | DisplayNote>
  notesByDate: { date: string; label: string; notes: DisplayNote[] }[]
  loading: boolean
  error: string | null
  // CRUD
  addNote: (input: CreateNoteInput) => Promise<Note | null>
  updateNote: (id: string, updates: UpdateNoteInput) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  // Entity links
  addEntityLink: (noteId: string, input: CreateEntityLinkInput) => Promise<NoteEntityLink | null>
  removeEntityLink: (linkId: string) => Promise<void>
  getEntityLinks: (noteId: string) => Promise<NoteEntityLink[]>
  getNotesForEntity: (entityType: NoteEntityType, entityId: string) => Promise<Note[]>
  // Queries
  getNoteById: (id: string) => Note | undefined
  searchNotes: (query: string) => Note[]
  getNotesByTopic: (topicId: string | null) => Note[]
  getNotesByType: (type: NoteType) => Note[]
  getVaultNoteContent: (noteId: string) => Promise<string | null>
  // Topics
  topics: NoteTopic[]
  topicsMap: Map<string, NoteTopic>
  activeTopics: NoteTopic[]
  addTopic: (input: CreateNoteTopicInput) => Promise<NoteTopic | null>
}

const NotesContext = createContext<NotesContextValue | null>(null)

export function NotesProvider({ children }: { children: ReactNode }) {
  const {
    notes,
    notesMap,
    notesByDate,
    loading,
    error,
    addNote,
    updateNote,
    deleteNote,
    addEntityLink,
    removeEntityLink,
    getEntityLinks,
    getNotesForEntity,
    getNoteById,
    searchNotes,
    getNotesByTopic,
    getNotesByType,
    getVaultNoteContent,
  } = useNotes()

  const {
    topicsMap,
    activeTopics,
    topics,
    addTopic,
  } = useNoteTopics()

  return (
    <NotesContext.Provider
      value={{
        notes,
        notesMap,
        notesByDate,
        loading,
        error,
        addNote,
        updateNote,
        deleteNote,
        addEntityLink,
        removeEntityLink,
        getEntityLinks,
        getNotesForEntity,
        getNoteById,
        searchNotes,
        getNotesByTopic,
        getNotesByType,
        getVaultNoteContent,
        topics,
        topicsMap,
        activeTopics,
        addTopic,
      }}
    >
      {children}
    </NotesContext.Provider>
  )
}

export function useNotesContext(): NotesContextValue {
  const ctx = useContext(NotesContext)
  if (!ctx) throw new Error('useNotesContext must be used within NotesProvider')
  return ctx
}
