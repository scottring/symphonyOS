import { useState, useCallback, useMemo } from 'react'
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
  onNavigateToTask,
}: NotesPageProps) {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)
  const [entityLinks, setEntityLinks] = useState<NoteEntityLink[]>([])

  // Filter notes by selected topic
  const filteredNotesByDate = useMemo(() => {
    if (!selectedTopicId) return notesByDate

    return notesByDate
      .map((group) => ({
        ...group,
        notes: group.notes.filter((note) => note.topicId === selectedTopicId),
      }))
      .filter((group) => group.notes.length > 0)
  }, [notesByDate, selectedTopicId])

  const selectedNote = useMemo(() => {
    if (!selectedNoteId) return null
    return notes.find((n) => n.id === selectedNoteId) ?? null
  }, [notes, selectedNoteId])

  // Fetch entity links when note is selected
  const handleSelectNote = useCallback(
    async (noteId: string) => {
      const note = notes.find((n) => n.id === noteId)

      // If this is a task note, navigate to the task instead
      if (note?.sourceTaskId && onNavigateToTask) {
        onNavigateToTask(note.sourceTaskId)
        return
      }

      setSelectedNoteId(noteId)
      if (getEntityLinks) {
        const links = await getEntityLinks(noteId)
        setEntityLinks(links)
      }
    },
    [notes, getEntityLinks, onNavigateToTask]
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
        {/* Quick Capture at top - always visible */}
        <div className="sticky top-0 z-10 p-4 bg-bg-elevated border-b border-neutral-100">
          <NotesQuickCapture
            onSave={handleQuickCapture}
            topics={topics}
          />
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
