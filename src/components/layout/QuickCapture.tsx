import { useState, useRef, useEffect, useMemo } from 'react'
import { parseQuickInput, hasParsedFields, type ParsedQuickInput } from '@/lib/quickInputParser'

interface QuickCaptureProps {
  onAdd: (title: string) => void
  // Rich add with parsed fields
  onAddRich?: (data: {
    title: string
    projectId?: string
    contactId?: string
    scheduledFor?: Date
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

  // Overrides for when user clicks × on a parsed field
  const [overrides, setOverrides] = useState<{
    projectId?: string | null
    contactId?: string | null
    dueDate?: Date | null
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

  // Format date for display
  const formatDate = (date: Date) => {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const isToday = date.toDateString() === today.toDateString()
    const isTomorrow = date.toDateString() === tomorrow.toDateString()

    if (isToday) return 'Today'
    if (isTomorrow) return 'Tomorrow'

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    doSubmit(false)
  }

  const doSubmit = (useRaw: boolean) => {
    const trimmed = title.trim()
    if (!trimmed) return

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
            {/* Header with keyboard hint */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-neutral-800">
                Quick Add
              </h2>
              <kbd className="px-2 py-1 text-xs font-mono bg-neutral-100 text-neutral-500 rounded">
                ⌘K
              </kbd>
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
                             text-neutral-800 placeholder:text-neutral-400 text-2xl font-display
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

                  {/* Date chip */}
                  {effectiveParsed.dueDate && (
                    <div className="flex items-center gap-2">
                      <span className="text-base">📅</span>
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
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                {/* Only show "Add to Inbox" if there ARE parsed fields */}
                {showPreview && (
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
                  {showPreview ? 'Save with Above' : 'Add to Inbox'}
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
