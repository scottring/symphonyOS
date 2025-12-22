import { useState, useRef, useEffect } from 'react'
import type { EntityType, DeferOption, ActionableInstance } from '@/types/actionable'
import { getCalendarEventDeferOptions, getDeferOptions, type RecurrencePattern } from '@/types/actionable'

interface ActionableActionsProps {
  entityType: EntityType
  entityId: string
  date: Date
  instance: ActionableInstance | null
  recurrence?: RecurrencePattern // For routines
  onMarkDone: () => Promise<boolean>
  onUndoDone: () => Promise<boolean>
  onSkip: () => Promise<boolean>
  onDefer: (toDateTime: Date) => Promise<boolean>
  onRequestCoverage: () => Promise<boolean>
  onAddNote: (note: string) => Promise<boolean>
  // Loading/disabled state
  isLoading?: boolean
}

export function ActionableActions({
  entityType,
  instance,
  recurrence,
  onMarkDone,
  onUndoDone,
  onSkip,
  onDefer,
  onRequestCoverage,
  onAddNote,
  isLoading = false,
}: ActionableActionsProps) {
  const [showDeferMenu, setShowDeferMenu] = useState(false)
  const [showCustomDefer, setShowCustomDefer] = useState(false)
  const [customDate, setCustomDate] = useState('')
  const [customTime, setCustomTime] = useState('09:00')
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const deferMenuRef = useRef<HTMLDivElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const noteInputRef = useRef<HTMLTextAreaElement>(null)

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (deferMenuRef.current && !deferMenuRef.current.contains(event.target as Node)) {
        setShowDeferMenu(false)
        setShowCustomDefer(false)
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus note input when shown
  useEffect(() => {
    if (showNoteInput && noteInputRef.current) {
      noteInputRef.current.focus()
    }
  }, [showNoteInput])

  // Get defer options based on entity type
  const deferOptions: DeferOption[] = entityType === 'calendar_event'
    ? getCalendarEventDeferOptions()
    : getDeferOptions(recurrence)

  const isCompleted = instance?.status === 'completed'
  const isSkipped = instance?.status === 'skipped'
  const isDeferred = instance?.status === 'deferred'

  // Disable all actions if loading
  const disabled = isLoading || !!actionLoading

  // Handle action with loading state
  const handleAction = async (actionName: string, action: () => Promise<boolean>): Promise<boolean> => {
    setActionLoading(actionName)
    try {
      return await action()
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeferSelect = async (option: DeferOption) => {
    if (option.value === 'custom') {
      setShowCustomDefer(true)
      // Initialize with tomorrow's date
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      setCustomDate(tomorrow.toISOString().split('T')[0])
      return
    }

    if (option.targetDate) {
      await handleAction('defer', () => onDefer(option.targetDate!))
      setShowDeferMenu(false)
    }
  }

  const handleCustomDefer = async () => {
    if (!customDate) return
    const [year, month, day] = customDate.split('-').map(Number)
    const [hours, minutes] = customTime.split(':').map(Number)
    const targetDate = new Date(year, month - 1, day, hours, minutes)
    await handleAction('defer', () => onDefer(targetDate))
    setShowDeferMenu(false)
    setShowCustomDefer(false)
  }

  const handleAddNote = async () => {
    if (!noteText.trim()) return
    const success = await handleAction('note', () => onAddNote(noteText.trim()))
    if (success) {
      setNoteText('')
      setShowNoteInput(false)
    }
  }

  // If completed, show undo button prominently
  if (isCompleted) {
    return (
      <div className="flex items-center gap-2 p-4 bg-green-50 border-b border-green-100">
        <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        <span className="flex-1 text-sm font-medium text-green-700">Done</span>
        <button
          onClick={() => handleAction('undo', onUndoDone)}
          disabled={disabled}
          className="text-sm text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
        >
          Undo
        </button>
      </div>
    )
  }

  // If skipped, show subtle indicator
  if (isSkipped) {
    return (
      <div className="flex items-center gap-2 p-4 bg-neutral-50 border-b border-neutral-100">
        <svg className="w-5 h-5 text-neutral-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
        <span className="flex-1 text-sm text-neutral-500">Skipped</span>
      </div>
    )
  }

  // If deferred, show where it was deferred to
  if (isDeferred && instance?.deferred_to) {
    const deferredDate = new Date(instance.deferred_to)
    const formattedDate = deferredDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
    const formattedTime = deferredDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })

    return (
      <div className="flex items-center gap-2 p-4 bg-amber-50 border-b border-amber-100">
        <svg className="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
        <span className="flex-1 text-sm text-amber-700">
          Deferred to {formattedDate} at {formattedTime}
        </span>
      </div>
    )
  }

  return (
    <div className="border-b border-neutral-100">
      {/* Primary actions row */}
      <div className="flex items-center gap-2 p-4">
        {/* Done button */}
        <button
          onClick={() => handleAction('done', onMarkDone)}
          disabled={disabled}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors"
        >
          {actionLoading === 'done' ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
          Done
        </button>

        {/* Skip button */}
        <button
          onClick={() => handleAction('skip', onSkip)}
          disabled={disabled}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 text-neutral-700 text-sm font-medium rounded-lg hover:bg-neutral-200 disabled:opacity-50 transition-colors"
        >
          Skip
        </button>

        {/* Defer dropdown */}
        <div className="relative" ref={deferMenuRef}>
          <button
            onClick={() => setShowDeferMenu(!showDeferMenu)}
            disabled={disabled}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 text-neutral-700 text-sm font-medium rounded-lg hover:bg-neutral-200 disabled:opacity-50 transition-colors"
          >
            Defer
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showDeferMenu && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50">
              {showCustomDefer ? (
                <div className="p-3 space-y-3">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Date</label>
                    <input
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Time</label>
                    <input
                      type="time"
                      step="300"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowCustomDefer(false)}
                      className="flex-1 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCustomDefer}
                      disabled={!customDate}
                      className="flex-1 px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
                    >
                      Defer
                    </button>
                  </div>
                </div>
              ) : (
                deferOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleDeferSelect(option)}
                    className="w-full px-4 py-2 text-sm text-left text-neutral-700 hover:bg-neutral-50"
                  >
                    {option.label}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* More menu (coverage, note) */}
        <div className="relative" ref={moreMenuRef}>
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            disabled={disabled}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg disabled:opacity-50 transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>

          {showMoreMenu && (
            <div className="absolute top-full right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50">
              <button
                onClick={() => {
                  setShowMoreMenu(false)
                  setShowNoteInput(true)
                }}
                className="w-full px-4 py-2 text-sm text-left text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Add note
              </button>
              <button
                onClick={() => {
                  setShowMoreMenu(false)
                  handleAction('coverage', onRequestCoverage)
                }}
                className="w-full px-4 py-2 text-sm text-left text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Request coverage
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Quick note input (inline) */}
      {showNoteInput && (
        <div className="px-4 pb-4 space-y-2">
          <textarea
            ref={noteInputRef}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a quick note..."
            rows={2}
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleAddNote()
              }
              if (e.key === 'Escape') {
                setShowNoteInput(false)
                setNoteText('')
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowNoteInput(false)
                setNoteText('')
              }}
              className="px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleAddNote}
              disabled={!noteText.trim() || actionLoading === 'note'}
              className="px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
            >
              {actionLoading === 'note' ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
