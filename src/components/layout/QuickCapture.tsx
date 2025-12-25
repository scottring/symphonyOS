import { useState, useRef, useEffect, useMemo } from 'react'
import { parseQuickInput, hasParsedFields, type ParsedQuickInput } from '@/lib/quickInputParser'
import type { TaskCategory, TaskContext } from '@/types/task'
import { useDomain } from '@/hooks/useDomain'

interface QuickCaptureProps {
  onAdd: (title: string) => void
  // Rich add with parsed fields
  onAddRich?: (data: {
    title: string
    projectId?: string
    contactId?: string
    scheduledFor?: Date
    category?: TaskCategory
    context?: TaskContext
  }) => void
  // Note creation
  onAddNote?: (data: {
    content: string
    topicName?: string
  }) => void
  // Context for parser
  projects?: Array<{ id: string; name: string }>
  contacts?: Array<{ id: string; name: string }>
  // Existing props
  isOpen?: boolean
  onOpen?: () => void
  onClose?: () => void
  showFab?: boolean
}

export function QuickCapture({
  onAdd,
  onAddRich,
  onAddNote,
  projects = [],
  contacts = [],
  isOpen: controlledIsOpen,
  onOpen,
  onClose,
  showFab = true,
}: QuickCaptureProps) {
  // Support both controlled and uncontrolled modes
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const isOpen = controlledIsOpen ?? internalIsOpen

  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Get current domain for smart context defaulting
  const { currentDomain } = useDomain()

  // Overrides for when user clicks × on a parsed field or applies suggestions
  const [overrides, setOverrides] = useState<{
    projectId?: string | null
    contactId?: string | null
    dueDate?: Date | null
    category?: TaskCategory | null
    context?: TaskContext | null
  }>({})

  const handleOpen = () => {
    if (onOpen) {
      onOpen()
    } else {
      setInternalIsOpen(true)
    }
  }

  const handleClose = () => {
    setTitle('')
    setOverrides({})
    if (onClose) {
      onClose()
    } else {
      setInternalIsOpen(false)
    }
  }

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting on modal open is valid
      setTitle('')
      setOverrides({})
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Parse input live
  const parsed = useMemo<ParsedQuickInput>(() => {
    return parseQuickInput(title, { projects, contacts })
  }, [title, projects, contacts])

  // Apply overrides to determine final parsed result
  const effectiveParsed = useMemo(() => {
    return {
      ...parsed,
      projectId: overrides.projectId === null ? undefined : (overrides.projectId ?? parsed.projectId),
      contactId: overrides.contactId === null ? undefined : (overrides.contactId ?? parsed.contactId),
      dueDate: overrides.dueDate === null ? undefined : (overrides.dueDate ?? parsed.dueDate),
      category: overrides.category === null ? undefined : (overrides.category ?? parsed.category),
      context: overrides.context === null ? undefined : (overrides.context ?? undefined),
    }
  }, [parsed, overrides])

  const showPreview = hasParsedFields(effectiveParsed)

  // Get display names for parsed fields
  const projectName = useMemo(() => {
    if (!effectiveParsed.projectId) return null
    return projects.find(p => p.id === effectiveParsed.projectId)?.name ?? null
  }, [effectiveParsed.projectId, projects])

  const contactName = useMemo(() => {
    if (!effectiveParsed.contactId) return null
    return contacts.find(c => c.id === effectiveParsed.contactId)?.name ?? null
  }, [effectiveParsed.contactId, contacts])

  // Format date and time for display
  const formatDate = (date: Date) => {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const isToday = date.toDateString() === today.toDateString()
    const isTomorrow = date.toDateString() === tomorrow.toDateString()

    // Check if time is set (not midnight exactly)
    const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0
    const timeStr = hasTime
      ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : ''

    let dateStr: string
    if (isToday) {
      dateStr = 'Today'
    } else if (isTomorrow) {
      dateStr = 'Tomorrow'
    } else {
      dateStr = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    }

    return hasTime ? `${dateStr} at ${timeStr}` : dateStr
  }

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    doSubmit(false)
  }

  const doSubmit = (useRaw: boolean) => {
    const trimmed = title.trim()
    if (!trimmed) return

    // Handle note creation
    if (effectiveParsed.isNote && onAddNote) {
      onAddNote({
        content: effectiveParsed.noteContent || trimmed,
        topicName: effectiveParsed.topicName,
      })
      // Reset and refocus for rapid entry
      setTitle('')
      setOverrides({})
      inputRef.current?.focus()
      return
    }

    // Determine if this is going to inbox (for animation)
    const isInboxAdd = useRaw || !hasParsedFields(effectiveParsed) || !effectiveParsed.dueDate

    // Get input position for animation before any state changes
    const inputRect = inputRef.current?.getBoundingClientRect()

    if (useRaw || !hasParsedFields(effectiveParsed)) {
      // Plain inbox add (current behavior)
      onAdd(trimmed)
    } else if (onAddRich) {
      // Rich add with parsed fields (context only applied if user explicitly added it)
      onAddRich({
        title: effectiveParsed.title,
        projectId: effectiveParsed.projectId,
        contactId: effectiveParsed.contactId,
        scheduledFor: effectiveParsed.dueDate,
        category: effectiveParsed.category,
        context: effectiveParsed.context,
      })
    } else {
      // Fallback if onAddRich not provided
      onAdd(trimmed)
    }

    // Dispatch animation event for inbox items
    if (isInboxAdd && inputRect) {
      const taskTitle = useRaw ? trimmed : effectiveParsed.title
      window.dispatchEvent(new CustomEvent('symphony:inbox-add', {
        detail: {
          title: taskTitle,
          sourceRect: {
            top: inputRect.top,
            left: inputRect.left,
            width: inputRect.width,
            height: inputRect.height,
          },
        },
      }))
    }

    // Reset and refocus for rapid entry
    setTitle('')
    setOverrides({})
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      handleClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        // Shift+Enter = always add raw text to inbox
        doSubmit(true)
      } else {
        // Enter = use parsed result (or raw if nothing parsed)
        doSubmit(false)
      }
    }
  }

  const clearProject = () => setOverrides(prev => ({ ...prev, projectId: null }))
  const clearContact = () => setOverrides(prev => ({ ...prev, contactId: null }))
  const clearDate = () => setOverrides(prev => ({ ...prev, dueDate: null }))
  const clearCategory = () => setOverrides(prev => ({ ...prev, category: null }))
  const clearContext = () => setOverrides(prev => ({ ...prev, context: null }))
  const applyContext = (context: TaskContext) => setOverrides(prev => ({ ...prev, context }))

  return (
    <>
      {/* Floating Action Button - only on mobile, positioned above bottom nav */}
      {showFab && (
        <button
          onClick={handleOpen}
          className="fixed right-5 w-14 h-14 bg-primary-500 text-white rounded-full shadow-lg shadow-primary-500/30
                     flex items-center justify-center
                     hover:bg-primary-600 active:bg-primary-700 active:scale-95
                     transition-all z-50"
          style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
          aria-label="Quick add task"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2v-6z" />
          </svg>
        </button>
      )}

      {/* Modal Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
          onClick={handleClose}
        >
          {/* Modal Content */}
          <div
            className="bg-white p-6 w-[90%] md:w-1/2 max-w-lg rounded-2xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with keyboard hint and close button */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-800">
                Quick Add
              </h2>
              <div className="flex items-center gap-2">
                {/* Keyboard hint - hidden on mobile */}
                <kbd className="hidden md:inline-block px-2 py-1 text-xs font-mono bg-neutral-100 text-neutral-500 rounded">
                  ⌘K
                </kbd>
                <button
                  type="button"
                  onClick={handleClose}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  ref={inputRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="What's on your mind?"
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50
                             text-neutral-800 placeholder:text-neutral-400 text-lg md:text-2xl font-display
                             focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* Preview card - only show if fields were parsed */}
              {showPreview && (
                <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100 space-y-2">
                  {/* Note preview (different from task) */}
                  {effectiveParsed.isNote ? (
                    <>
                      <div className="flex items-center gap-2 text-neutral-800">
                        <span className="text-base">📝</span>
                        <span className="font-medium">Note</span>
                      </div>
                      <div className="text-sm text-neutral-600 pl-6">
                        {effectiveParsed.noteContent}
                      </div>
                      {effectiveParsed.topicName && (
                        <div className="flex items-center gap-2 pl-6">
                          <span className="inline-flex items-center px-2.5 py-1 bg-primary-50 text-primary-700 rounded-full text-xs font-medium border border-primary-100">
                            {effectiveParsed.topicName}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Title row */}
                      <div className="flex items-center gap-2 text-neutral-800">
                        <span className="text-base">📋</span>
                        <span className="font-medium">"{effectiveParsed.title}"</span>
                      </div>
                    </>
                  )}

                  {/* Only show task-related fields if NOT a note */}
                  {!effectiveParsed.isNote && effectiveParsed.projectId && projectName && (
                    <div className="flex items-center gap-2">
                      <span className="text-base">📁</span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100">
                        {projectName}
                        <button
                          type="button"
                          onClick={clearProject}
                          className="ml-1 text-blue-400 hover:text-blue-600"
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  )}

                  {/* Date/time chip */}
                  {!effectiveParsed.isNote && effectiveParsed.dueDate && (
                    <div className="flex items-center gap-2">
                      <span className="text-base">
                        {effectiveParsed.dueDate.getHours() !== 0 || effectiveParsed.dueDate.getMinutes() !== 0 ? '🕐' : '📅'}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 text-primary-700 rounded-full text-xs font-medium border border-primary-100">
                        {formatDate(effectiveParsed.dueDate)}
                        <button
                          type="button"
                          onClick={clearDate}
                          className="ml-1 text-primary-400 hover:text-primary-600"
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  )}

                  {/* Contact chip */}
                  {!effectiveParsed.isNote && effectiveParsed.contactId && contactName && (
                    <div className="flex items-center gap-2">
                      <span className="text-base">👤</span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium border border-amber-100">
                        {contactName}
                        <button
                          type="button"
                          onClick={clearContact}
                          className="ml-1 text-amber-400 hover:text-amber-600"
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  )}

                  {/* Priority chip */}
                  {!effectiveParsed.isNote && effectiveParsed.priority && (
                    <div className="flex items-center gap-2">
                      <span className="text-base">🔥</span>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                        effectiveParsed.priority === 'high'
                          ? 'bg-red-50 text-red-700 border-red-100'
                          : 'bg-yellow-50 text-yellow-700 border-yellow-100'
                      }`}>
                        {effectiveParsed.priority === 'high' ? 'High Priority' : 'Medium Priority'}
                      </span>
                    </div>
                  )}

                  {/* Category chip - only show for non-task categories */}
                  {!effectiveParsed.isNote && effectiveParsed.category && effectiveParsed.category !== 'task' && (
                    <div className="flex items-center gap-2">
                      <span className="text-base">
                        {effectiveParsed.category === 'event' && '📅'}
                        {effectiveParsed.category === 'activity' && '⚽'}
                        {effectiveParsed.category === 'chore' && '🧹'}
                        {effectiveParsed.category === 'errand' && '🚗'}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-medium border border-purple-100">
                        {effectiveParsed.category.charAt(0).toUpperCase() + effectiveParsed.category.slice(1)}
                        <button
                          type="button"
                          onClick={clearCategory}
                          className="ml-1 text-purple-400 hover:text-purple-600"
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  )}

                  {/* Suggested context chip - show when in a domain and context not yet applied */}
                  {!effectiveParsed.isNote && currentDomain !== 'universal' && !effectiveParsed.context && (
                    <div className="flex items-center gap-2">
                      <span className="text-base">🏷️</span>
                      <button
                        type="button"
                        onClick={() => applyContext(currentDomain as TaskContext)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          currentDomain === 'work'
                            ? 'bg-blue-50/50 text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300'
                            : currentDomain === 'family'
                            ? 'bg-amber-50/50 text-amber-600 border-amber-200 hover:bg-amber-50 hover:border-amber-300'
                            : 'bg-purple-50/50 text-purple-600 border-purple-200 hover:bg-purple-50 hover:border-purple-300'
                        }`}
                      >
                        + Add to {currentDomain.charAt(0).toUpperCase() + currentDomain.slice(1)}?
                      </button>
                    </div>
                  )}

                  {/* Applied context chip - show when context has been applied */}
                  {!effectiveParsed.isNote && effectiveParsed.context && (
                    <div className="flex items-center gap-2">
                      <span className="text-base">🏷️</span>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                        effectiveParsed.context === 'work'
                          ? 'bg-blue-50 text-blue-700 border-blue-100'
                          : effectiveParsed.context === 'family'
                          ? 'bg-amber-50 text-amber-700 border-amber-100'
                          : 'bg-purple-50 text-purple-700 border-purple-100'
                      }`}>
                        {effectiveParsed.context.charAt(0).toUpperCase() + effectiveParsed.context.slice(1)}
                        <button
                          type="button"
                          onClick={clearContext}
                          className={`ml-1 ${
                            effectiveParsed.context === 'work'
                              ? 'text-blue-400 hover:text-blue-600'
                              : effectiveParsed.context === 'family'
                              ? 'text-amber-400 hover:text-amber-600'
                              : 'text-purple-400 hover:text-purple-600'
                          }`}
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                {/* Only show "Add to Inbox" if there ARE parsed fields AND it's not a note */}
                {showPreview && !effectiveParsed.isNote && (
                  <button
                    type="button"
                    onClick={() => doSubmit(true)}
                    className="flex-1 touch-target py-3 rounded-xl border border-neutral-200 text-neutral-600 font-medium
                               hover:bg-neutral-50 transition-colors"
                  >
                    Add to Inbox
                  </button>
                )}

                <button
                  type="submit"
                  disabled={!title.trim()}
                  className="flex-1 touch-target py-3 rounded-xl bg-primary-500 text-white font-medium
                             hover:bg-primary-600 active:bg-primary-700
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-colors"
                >
                  {effectiveParsed.isNote ? 'Save Note' : (showPreview ? 'Save with Above' : 'Add to Inbox')}
                </button>
              </div>

              {/* Keyboard hint - only if parsed fields exist */}
              {showPreview && (
                <p className="text-center text-xs text-neutral-400 mt-3">
                  💡 <kbd className="px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded text-xs font-mono">Shift</kbd>+<kbd className="px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded text-xs font-mono">Enter</kbd> to add raw text to inbox
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  )
}
