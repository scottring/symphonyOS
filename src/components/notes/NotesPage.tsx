import { useState, useCallback, useEffect, useMemo } from 'react'
import type { Note, DisplayNote, NoteTopic, NoteEntityLink, NoteEntityType } from '@/types/note'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import { NotesList } from './NotesList'
import { NotesQuickCapture } from './NotesQuickCapture'
import { NoteDetail } from './NoteDetail'
import { TopicFilter } from './TopicFilter'

interface NotesPageProps {
  notes: DisplayNote[]
  notesByDate: { date: string; label: string; notes: DisplayNote[] }[]
  topics: NoteTopic[]
  topicsMap: Map<string, NoteTopic>
  loading: boolean
  // Entity data for linking UI
  tasks?: Task[]
  projects?: Project[]
  contacts?: Contact[]
  // CRUD
  onAddNote: (content: string, topicId?: string) => Promise<Note | null>
  onUpdateNote: (id: string, updates: { content?: string; topicId?: string | null }) => Promise<void>
  onDeleteNote: (id: string) => Promise<void>
  onAddTopic: (name: string) => Promise<NoteTopic | null>
  // Entity links
  getEntityLinks?: (noteId: string) => Promise<NoteEntityLink[]>
  onAddEntityLink?: (noteId: string, entityType: NoteEntityType, entityId: string) => Promise<void>
  onRemoveEntityLink?: (linkId: string) => Promise<void>
  // Vault
  getVaultNoteContent?: (noteId: string) => Promise<string | null>
  // Navigation
  onNavigateToTask?: (taskId: string) => void
}

export function NotesPage({
  notes,
  notesByDate,
  topics,
  topicsMap,
  loading,
  tasks = [],
  projects = [],
  contacts = [],
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onAddTopic,
  getEntityLinks,
  onAddEntityLink,
  onRemoveEntityLink,
  getVaultNoteContent,
}: NotesPageProps) {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    () => sessionStorage.getItem('symphony:selectedNoteId')
  )
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)
  const [entityLinks, setEntityLinks] = useState<NoteEntityLink[]>([])

  // Persist selected note across reloads
  useEffect(() => {
    if (selectedNoteId) {
      sessionStorage.setItem('symphony:selectedNoteId', selectedNoteId)
    } else {
      sessionStorage.removeItem('symphony:selectedNoteId')
    }
  }, [selectedNoteId])

  // Restore vault note content on mount if we have a persisted selection
  useEffect(() => {
    if (selectedNoteId && !loading) {
      const note = notes.find((n) => n.id === selectedNoteId)
      if (note?.source === 'vault' && !note.content && getVaultNoteContent) {
        getVaultNoteContent(selectedNoteId)
      }
      if (getEntityLinks) {
        getEntityLinks(selectedNoteId).then(setEntityLinks)
      }
    }
  }, [selectedNoteId, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Hide noisy vault folders (work artifacts, plan/spec docs) from the
  // Notes list. They're still in the DB and searchable elsewhere; this
  // is a display-side filter so the Notes surface reads as personal notes.
  const HIDDEN_VAULT_PREFIXES = ['outputs/', 'docs/', 'projects/', 'tasks/']
  const isHiddenVaultNote = (vaultPath?: string) =>
    !!vaultPath && HIDDEN_VAULT_PREFIXES.some((p) => vaultPath.startsWith(p))

  // Hide task-attached notes whose source task is a meal/dinner task —
  // these surface in the Meals app, not Notes.
  const MEAL_TASK_KEYWORDS = /\b(breakfast|lunch|dinner|brunch|meal prep|meal plan|snack)s?\b/i
  const isMealTaskNote = (sourceTaskTitle?: string) =>
    !!sourceTaskTitle && MEAL_TASK_KEYWORDS.test(sourceTaskTitle)

  // Filter notes by selected topic + hide work-artifact and meal notes
  const filteredNotesByDate = useMemo(() => {
    return notesByDate
      .map((group) => ({
        ...group,
        notes: group.notes.filter((note) => {
          if (selectedTopicId && note.topicId !== selectedTopicId) return false
          if (isHiddenVaultNote(note.vaultPath)) return false
          if (isMealTaskNote(note.sourceTaskTitle)) return false
          return true
        }),
      }))
      .filter((group) => group.notes.length > 0)
  }, [notesByDate, selectedTopicId])

  const selectedNote = useMemo(() => {
    if (!selectedNoteId) return null
    return notes.find((n) => n.id === selectedNoteId) ?? null
  }, [notes, selectedNoteId])

  // Show the note in the center viewer. Task-attached notes still show
  // their content here; the "From task: …" chip in the row is the route
  // to jump to the parent task if the user wants.
  const handleSelectNote = useCallback(
    async (noteId: string) => {
      const note = notes.find((n) => n.id === noteId)
      setSelectedNoteId(noteId)

      // Fetch vault note content if needed
      if (note?.source === 'vault' && !note.content && getVaultNoteContent) {
        getVaultNoteContent(noteId)
      }

      if (getEntityLinks) {
        const links = await getEntityLinks(noteId)
        setEntityLinks(links)
      }
    },
    [notes, getEntityLinks, getVaultNoteContent]
  )

  const handleQuickCapture = useCallback(
    async (content: string, topicId?: string) => {
      const newNote = await onAddNote(content, topicId)
      if (newNote) {
        setSelectedNoteId(newNote.id)
      }
    },
    [onAddNote]
  )

  const handleNewNote = useCallback(async () => {
    const newNote = await onAddNote('', selectedTopicId || undefined)
    if (newNote) {
      setSelectedNoteId(newNote.id)
    }
  }, [onAddNote, selectedTopicId])

  const handleAddTopic = useCallback(
    async (name: string) => {
      return onAddTopic(name)
    },
    [onAddTopic]
  )

  const handleAddEntityLink = useCallback(
    async (noteId: string, entityType: NoteEntityType, entityId: string) => {
      if (!onAddEntityLink) return
      await onAddEntityLink(noteId, entityType, entityId)
      // Refetch entity links to update the display
      if (getEntityLinks && noteId === selectedNoteId) {
        const links = await getEntityLinks(noteId)
        setEntityLinks(links)
      }
    },
    [onAddEntityLink, getEntityLinks, selectedNoteId]
  )

  const handleRemoveEntityLink = useCallback(
    async (linkId: string) => {
      if (!onRemoveEntityLink) return
      await onRemoveEntityLink(linkId)
      // Update local state immediately
      setEntityLinks((prev) => prev.filter((l) => l.id !== linkId))
    },
    [onRemoveEntityLink]
  )

  const totalNotesCount = notes.length
  const topicsWithCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const note of notes) {
      if (note.topicId) {
        counts.set(note.topicId, (counts.get(note.topicId) || 0) + 1)
      }
    }
    return topics.map((topic) => ({
      ...topic,
      noteCount: counts.get(topic.id) || 0,
    }))
  }, [notes, topics])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-neutral-500">Loading notes...</p>
      </div>
    )
  }

  return (
    <div className="h-full flex">
      {/* Notes List - 400px fixed width */}
      <div className="w-[400px] border-r border-neutral-200/80 bg-bg-elevated flex flex-col overflow-hidden">
        {/* Header with New Note button */}
        <div className="sticky top-0 z-10 bg-bg-elevated border-b border-neutral-100">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h2 className="text-lg font-display text-neutral-800">Notes</h2>
            <button
              onClick={handleNewNote}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
              aria-label="New note"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              New Note
            </button>
          </div>

          {/* Quick Capture */}
          <div className="px-4 pb-4">
            <NotesQuickCapture
              onSave={handleQuickCapture}
              topics={topics}
            />
          </div>
        </div>

        {/* Topic Filter */}
        <TopicFilter
          topics={topicsWithCounts}
          selectedTopicId={selectedTopicId}
          totalNotesCount={totalNotesCount}
          onSelectTopic={setSelectedTopicId}
        />

        {/* Notes list - grouped by date */}
        <div className="flex-1 overflow-y-auto">
          <NotesList
            notesByDate={filteredNotesByDate}
            topicsMap={topicsMap}
            selectedNoteId={selectedNoteId}
            onSelectNote={handleSelectNote}
          />
        </div>
      </div>

      {/* Preview/Detail Pane - flexible width */}
      <div className="flex-1 overflow-hidden bg-white relative">
        <NoteDetail
          note={selectedNote}
          topics={topics}
          entityLinks={entityLinks}
          tasks={tasks}
          projects={projects}
          contacts={contacts}
          onUpdate={onUpdateNote}
          onDelete={onDeleteNote}
          onAddTopic={handleAddTopic}
          onAddEntityLink={onAddEntityLink ? handleAddEntityLink : undefined}
          onRemoveEntityLink={onRemoveEntityLink ? handleRemoveEntityLink : undefined}
          onClose={() => setSelectedNoteId(null)}
        />
      </div>
    </div>
  )
}
