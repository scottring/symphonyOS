import { useState, useEffect, useRef, useCallback } from 'react'
import { X } from 'lucide-react'
import { getTimeOfDay, type TimeOfDay } from '@/lib/timeUtils'
import type { Note, CreateNoteInput, UpdateNoteInput } from '@/types/note'

interface FocusModeProps {
  isOpen: boolean
  onClose: () => void
  // Note CRUD functions to sync with database
  onAddNote: (input: CreateNoteInput) => Promise<Note | null>
  onUpdateNote: (id: string, updates: UpdateNoteInput) => Promise<void>
  // Existing notes to find today's scratchpad
  notes: Note[]
}

const SCRATCH_PAD_KEY = 'symphony-focus-scratch-pad'
const SCRATCH_PAD_DATE_KEY = 'symphony-focus-scratch-pad-date'
const SCRATCH_PAD_NOTE_TITLE = 'Scratch Pad'

function getStoredScratchPad(): string {
  const stored = localStorage.getItem(SCRATCH_PAD_KEY)
  const storedDate = localStorage.getItem(SCRATCH_PAD_DATE_KEY)
  const today = new Date().toDateString()

  if (storedDate !== today) {
    localStorage.removeItem(SCRATCH_PAD_KEY)
    localStorage.setItem(SCRATCH_PAD_DATE_KEY, today)
    return ''
  }

  return stored || ''
}

// Helper to find today's scratchpad note
function findTodaysScratchpad(notes: Note[]): Note | undefined {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return notes.find(note => {
    if (note.title !== SCRATCH_PAD_NOTE_TITLE || note.type !== 'quick_capture') return false

    const noteDate = new Date(note.createdAt)
    noteDate.setHours(0, 0, 0, 0)

    return noteDate.getTime() === today.getTime()
  })
}

const TIME_LABELS: Record<TimeOfDay, string> = {
  morning: 'This Morning',
  afternoon: 'This Afternoon',
  evening: 'This Evening',
}

export const FOCUS_PANEL_WIDTH = 420

export function FocusMode({ isOpen, onClose, onAddNote, onUpdateNote, notes }: FocusModeProps) {
  const [scratchPad, setScratchPad] = useState(getStoredScratchPad)
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const timeOfDay = getTimeOfDay(new Date())

  // Load today's scratchpad from database when opened
  useEffect(() => {
    if (!isOpen) return

    const todaysScratchpad = findTodaysScratchpad(notes)
    if (todaysScratchpad) {
      setScratchPad(todaysScratchpad.content)
      setCurrentNoteId(todaysScratchpad.id)
      localStorage.setItem(SCRATCH_PAD_KEY, todaysScratchpad.content)
      localStorage.setItem(SCRATCH_PAD_DATE_KEY, new Date().toDateString())
    } else {
      // Use localStorage fallback if no database note yet
      setScratchPad(getStoredScratchPad())
      setCurrentNoteId(null)
    }
  }, [isOpen, notes])

  // Debounced save to database
  const saveToDB = useCallback(
    async (content: string, noteId: string | null) => {
      // If there's an existing note, update it even if empty (for clearing)
      if (noteId) {
        await onUpdateNote(noteId, { content })
        return
      }

      // Only create new note if content is not empty
      if (!content.trim()) return

      const newNote = await onAddNote({
        title: SCRATCH_PAD_NOTE_TITLE,
        content,
        type: 'quick_capture',
        source: 'manual',
      })
      if (newNote) {
        setCurrentNoteId(newNote.id)
      }
    },
    [onAddNote, onUpdateNote]
  )

  // Persist scratch pad to localStorage and database
  useEffect(() => {
    localStorage.setItem(SCRATCH_PAD_KEY, scratchPad)
    localStorage.setItem(SCRATCH_PAD_DATE_KEY, new Date().toDateString())

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Debounce database save (1 second after typing stops)
    saveTimeoutRef.current = setTimeout(() => {
      saveToDB(scratchPad, currentNoteId)
    }, 1000)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [scratchPad, currentNoteId, saveToDB])

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 150)
    }
  }, [isOpen])

  // Escape to close
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed top-0 right-0 h-full z-50 flex flex-col overflow-hidden bg-bg-elevated border-l border-neutral-200/80 shadow-xl"
      style={{ width: `${FOCUS_PANEL_WIDTH}px` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200/60">
        <div>
          <h2 className="font-medium text-neutral-800">Scratch Pad</h2>
          <p className="text-sm text-neutral-500">{TIME_LABELS[timeOfDay]}</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 -mr-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scratch pad area */}
      <div className="flex-1 p-6 min-h-0 flex flex-col">
        <div className="flex-1 rounded-xl overflow-hidden bg-white/50 border border-neutral-200/60">
          <textarea
            ref={textareaRef}
            value={scratchPad}
            onChange={(e) => setScratchPad(e.target.value)}
            placeholder="Write your thoughts here..."
            className="
              w-full h-full p-5 resize-none
              bg-transparent
              text-base text-neutral-700
              placeholder:text-neutral-400
              focus:outline-none
              leading-relaxed
            "
          />
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-neutral-400">
            {scratchPad ? `${scratchPad.length} characters` : ''}
          </span>
          {scratchPad && (
            <button
              onClick={() => setScratchPad('')}
              className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
