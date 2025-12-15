import { useState, useRef, useEffect, useMemo } from 'react'
import { parseQuickInput, hasParsedFields, type ParsedQuickInput } from '@/lib/quickInputParser'
import { detectAction } from '@/lib/actionDetector'
import type { TaskCategory } from '@/types/task'
import type { ParsedAction } from '@/types/action'
import type { Contact } from '@/types/contact'

interface QuickCaptureProps {
  onAdd: (title: string) => void
  // Rich add with parsed fields
  onAddRich?: (data: {
    title: string
    projectId?: string
    contactId?: string
    scheduledFor?: Date
    category?: TaskCategory
  }) => void
  // Action detection callback - called when input looks like an action (text/email)
  onActionDetected?: (input: string, contacts: Contact[]) => Promise<ParsedAction | null>
  // Called when an action is confirmed
  onShowActionPreview?: (action: ParsedAction) => void
  // Context for parser
  projects?: Array<{ id: string; name: string }>
  contacts?: Array<{ id: string; name: string; phone?: string; email?: string }>
  // Existing props
  isOpen?: boolean
  onOpen?: () => void
  onClose?: () => void
  showFab?: boolean
}

export function QuickCapture({
  onAdd,
  onAddRich,
  onActionDetected,
  onShowActionPreview,
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
  const [isParsingAction, setIsParsingAction] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Overrides for when user clicks × on a parsed field
  const [overrides, setOverrides] = useState<{
    projectId?: string | null
    contactId?: string | null
    dueDate?: Date | null
    category?: TaskCategory | null
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

  const doSubmit = async (useRaw: boolean) => {
    const trimmed = title.trim()
    if (!trimmed) return

    // Check for action first (only if not using raw and action detection is enabled)
    if (!useRaw && onActionDetected && onShowActionPreview) {
      const detection = detectAction(trimmed)
      if (detection.isLikelyAction) {
        setIsParsingAction(true)
        try {
          const action = await onActionDetected(trimmed, contacts as Contact[])
          setIsParsingAction(false)

          if (action?.isAction && action.confidence > 0.5) {
            // Show action preview instead of creating task
            onShowActionPreview(action)
            handleClose()
            return
          }
        } catch (err) {
          console.error('Action detection error:', err)
          setIsParsingAction(false)
          // Fall through to create task on error
        }
      }
    }

    if (useRaw || !hasParsedFields(effectiveParsed)) {
      // Plain inbox add (current behavior)
      onAdd(trimmed)
    } else if (onAddRich) {
      // Rich add with parsed fields
      onAddRich({
        title: effectiveParsed.title,
        projectId: effectiveParsed.projectId,
        contactId: effectiveParsed.contactId,
        scheduledFor: effectiveParsed.dueDate,
        category: effectiveParsed.category,
      })
    } else {
      // Fallback if onAddRich not provided
      onAdd(trimmed)
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
                  {/* Title row */}
                  <div className="flex items-center gap-2 text-neutral-800">
                    <span className="text-base">📋</span>
                    <span className="font-medium">"{effectiveParsed.title}"</span>
                  </div>

                  {/* Project chip */}
                  {effectiveParsed.projectId && projectName && (
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
                  {effectiveParsed.dueDate && (
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
                  {effectiveParsed.contactId && contactName && (
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
                  {effectiveParsed.priority && (
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
                  {effectiveParsed.category && effectiveParsed.category !== 'task' && (
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
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                {/* Only show "Add to Inbox" if there ARE parsed fields */}
                {showPreview && (
                  <button
                    type="button"
                    onClick={() => doSubmit(true)}
                    disabled={isParsingAction}
                    className="flex-1 touch-target py-3 rounded-xl border border-neutral-200 text-neutral-600 font-medium
                               hover:bg-neutral-50 transition-colors disabled:opacity-50"
                  >
                    Add to Inbox
                  </button>
                )}

                <button
                  type="submit"
                  disabled={!title.trim() || isParsingAction}
                  className="flex-1 touch-target py-3 rounded-xl bg-primary-500 text-white font-medium
                             hover:bg-primary-600 active:bg-primary-700
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-colors flex items-center justify-center gap-2"
                >
                  {isParsingAction ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Processing...
                    </>
                  ) : (
                    showPreview ? 'Save with Above' : 'Add to Inbox'
                  )}
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
