import { useState, useRef, useEffect, useMemo } from 'react'
import { hasParsedFields } from '@/lib/quickInputParser'
import type { TaskCategory, TaskContext } from '@/types/task'
import { useDomain } from '@/hooks/useDomain'
import { useQuickParse } from '@/hooks/useQuickParse'
import { ParsedFieldChips } from '@/components/capture/ParsedFieldChips'
import { ConceptIcon } from '@/lib/conceptIcons'

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
    assignedMemberIds?: string[]
  }) => void
  // Note creation
  onAddNote?: (data: {
    content: string
    topicName?: string
  }) => void
  // Context for parser
  projects?: Array<{ id: string; name: string }>
  contacts?: Array<{ id: string; name: string }>
  familyMembers?: Array<{ id: string; name: string }>
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
  familyMembers = [],
  isOpen: controlledIsOpen,
  onOpen,
  onClose,
  showFab = true,
}: QuickCaptureProps) {
  // Support both controlled and uncontrolled modes
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const isOpen = controlledIsOpen ?? internalIsOpen

  const [title, setTitle] = useState('')
  const [isClosing, setIsClosing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Get current domain for smart context defaulting
  const { currentDomain } = useDomain()

  // Parser context — memoized so useQuickParse's parse memo stays stable
  const parserCtx = useMemo(
    () => ({ projects, contacts, familyMembers }),
    [projects, contacts, familyMembers],
  )

  // Parsing + override state lives in useQuickParse
  const qp = useQuickParse(title, parserCtx, currentDomain)
  const {
    effectiveParsed,
    projectName,
    contactName,
    resetOverrides,
    clearProject,
    clearContact,
    clearDate,
    clearCategory,
    clearContext,
    clearAssignment,
    applyContext,
  } = qp

  const clearAutoCloseTimer = () => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current)
      autoCloseTimerRef.current = null
    }
  }

  const handleOpen = () => {
    setIsClosing(false)
    clearAutoCloseTimer()
    if (onOpen) {
      onOpen()
    } else {
      setInternalIsOpen(true)
    }
  }

  const handleClose = () => {
    clearAutoCloseTimer()
    setIsClosing(true)
    // Wait for fade-out animation to complete before actually closing
    setTimeout(() => {
      setTitle('')
      resetOverrides()
      setIsClosing(false)
      if (onClose) {
        onClose()
      } else {
        setInternalIsOpen(false)
      }
    }, 200) // Match the animation duration
  }

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting on modal open is valid
      setTitle('')
      resetOverrides()
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Auto-close timer: start when input is cleared after entry, reset when typing resumes
  useEffect(() => {
    if (!isOpen) return

    // Clear any existing timer
    clearAutoCloseTimer()

    // If input is empty, start the auto-close timer (25 seconds)
    if (title.trim() === '') {
      autoCloseTimerRef.current = setTimeout(() => {
        handleClose()
      }, 25000) // 25 seconds
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      clearAutoCloseTimer()
    }
  }, [isOpen, title]) // eslint-disable-line react-hooks/exhaustive-deps
  // Note: handleClose is intentionally not in deps to avoid recreating timer unnecessarily

  const showPreview = qp.hasFields

  const assignedNames = useMemo(() => {
    if (!effectiveParsed.assignedMemberIds?.length) return []
    return effectiveParsed.assignedMemberIds
      .map(id => familyMembers.find(m => m.id === id)?.name)
      .filter((n): n is string => !!n)
  }, [effectiveParsed.assignedMemberIds, familyMembers])

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
      resetOverrides()
      inputRef.current?.focus()
      return
    }

    // Determine if this is going to inbox (for animation)
    const isInboxAdd = useRaw || !hasParsedFields(effectiveParsed) || !effectiveParsed.dueDate

    // Get input position for animation before any state changes
    const inputRect = inputRef.current?.getBoundingClientRect()

    const hasRichFields = hasParsedFields(effectiveParsed) || !!effectiveParsed.context

    if (useRaw || (!hasRichFields)) {
      // Plain inbox add (current behavior)
      onAdd(trimmed)
    } else if (onAddRich) {
      // Rich add with parsed fields + auto-applied domain context
      onAddRich({
        title: effectiveParsed.title,
        projectId: effectiveParsed.projectId,
        contactId: effectiveParsed.contactId,
        scheduledFor: effectiveParsed.dueDate,
        category: effectiveParsed.category,
        context: effectiveParsed.context,
        assignedMemberIds: effectiveParsed.assignedMemberIds,
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
    resetOverrides()
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
          style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom, 0px))' }}
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
          className={`fixed inset-0 z-50 bg-black/40 flex items-center justify-center transition-opacity duration-200 ${
            isClosing ? 'opacity-0' : 'opacity-100'
          }`}
          onClick={handleClose}
        >
          {/* Modal Content */}
          <div
            className={`bg-white p-6 w-[90%] md:w-1/2 max-w-lg rounded-2xl shadow-xl transition-all duration-200 ${
              isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            }`}
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
                        <span className="text-base"><ConceptIcon name="note" size={18} decorative /></span>
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
                        <span className="text-base"><ConceptIcon name="list" size={18} decorative /></span>
                        <span className="font-medium">"{effectiveParsed.title}"</span>
                      </div>
                    </>
                  )}

                  {/* Parsed-field chips: project, date/time, contact, category, applied context; assignment/priority/suggested-context chips follow inline after this group */}
                  <ParsedFieldChips
                    parsed={effectiveParsed}
                    projectName={projectName}
                    contactName={contactName}
                    onClearDate={clearDate}
                    onClearProject={clearProject}
                    onClearContact={clearContact}
                    onClearCategory={clearCategory}
                    onClearContext={clearContext}
                  />

                  {/* Assignment chip(s) */}
                  {!effectiveParsed.isNote && assignedNames.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-base"><ConceptIcon name="person" size={18} decorative /></span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-100">
                        {assignedNames.join(', ')}
                        <button
                          type="button"
                          onClick={clearAssignment}
                          className="ml-1 text-green-400 hover:text-green-600"
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  )}

                  {/* Priority chip */}
                  {!effectiveParsed.isNote && effectiveParsed.priority && (
                    <div className="flex items-center gap-2">
                      <span className="text-base"><ConceptIcon name="streak" size={18} decorative /></span>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                        effectiveParsed.priority === 'high'
                          ? 'bg-red-50 text-red-700 border-red-100'
                          : 'bg-yellow-50 text-yellow-700 border-yellow-100'
                      }`}>
                        {effectiveParsed.priority === 'high' ? 'High Priority' : 'Medium Priority'}
                      </span>
                    </div>
                  )}

                  {/* Suggested context chip - show when in a domain and context not yet applied */}
                  {!effectiveParsed.isNote && currentDomain !== 'universal' && !effectiveParsed.context && (
                    <div className="flex items-center gap-2">
                      <span className="text-base"><ConceptIcon name="context" size={18} decorative /></span>
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
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                {/* Only show "Add to My Inbox" if there ARE parsed fields AND it's not a note */}
                {showPreview && !effectiveParsed.isNote && (
                  <button
                    type="button"
                    onClick={() => doSubmit(true)}
                    className="flex-1 touch-target py-3 rounded-xl border border-neutral-200 text-neutral-600 font-medium
                               hover:bg-neutral-50 transition-colors"
                  >
                    Add to My Inbox
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
                  {effectiveParsed.isNote ? 'Save Note' : (showPreview ? 'Save with Above' : 'Add to My Inbox')}
                </button>
              </div>

              {/* Privacy hint */}
              {!effectiveParsed.isNote && (
                <p className="text-center text-xs text-neutral-400 mt-3 flex items-center justify-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  Private until you share it
                </p>
              )}

              {/* Keyboard hint - only if parsed fields exist */}
              {showPreview && (
                <p className="text-center text-xs text-neutral-400 mt-1">
                  <kbd className="px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded text-xs font-mono">Shift</kbd>+<kbd className="px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded text-xs font-mono">Enter</kbd> to add raw text to inbox
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  )
}
