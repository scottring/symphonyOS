import { useState, useRef, useEffect, useMemo, type ReactNode } from 'react'
import { Sparkles, Camera } from 'lucide-react'
import { usePhotoCapture } from '@/hooks/usePhotoCapture'
import { CameraCaptureModal } from '@/components/capture/CameraCaptureModal'
import { hasParsedFields } from '@/lib/quickInputParser'
import type { TaskCategory, TaskContext } from '@/types/task'
import { DomainChooser } from '@/components/domain/DomainChooser'
import { domainForHotkey } from '@/lib/domainHotkey'
import { useQuickParse } from '@/hooks/useQuickParse'
import { ParsedFieldChips } from '@/components/capture/ParsedFieldChips'
import { ConceptIcon } from '@/lib/conceptIcons'
import { DictationMicButton } from '@/components/common/DictationMicButton'
import { MOBILE_TAB_BAR_HEIGHT } from '@/shell/mobileChrome'
import { TaskKindBadge } from '@/components/task/TaskKindBadge'

interface QuickCaptureProps {
  onAdd: (title: string) => void
  // Rich add with parsed fields
  onAddRich?: (data: {
    title: string
    projectId?: string
    contactId?: string
    scheduledFor?: Date
    durationMinutes?: number
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
  /** Unibox: render inline search results for the current text (mounted only
   *  while open, so data subscriptions stay lazy). `close` dismisses the modal. */
  resultsSlot?: (query: string, close: () => void) => ReactNode
  /** Unibox: escalate the raw text to the Symphony assistant (⌘↵ or the row). */
  onAskSymphony?: (text: string) => void
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
  resultsSlot,
  onAskSymphony,
}: QuickCaptureProps) {
  // Support both controlled and uncontrolled modes
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const isOpen = controlledIsOpen ?? internalIsOpen

  const [title, setTitle] = useState('')
  const [isClosing, setIsClosing] = useState(false)
  // `isEntering` is true for one frame after the sheet mounts so the mobile
  // bottom sheet can transition from translate-y-full → translate-y-0 (a
  // visible slide-up). Without this, the sheet appears already in its open
  // position and the slide is invisible. Desktop ignores it (no transform).
  const [isEntering, setIsEntering] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Photo-first capture: live camera → AI-enriched inbox task. On macOS,
  // Continuity Camera lists the iPhone as a camera device, making the phone
  // the desktop's camera. The file picker remains as the fallback.
  const photo = usePhotoCapture()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [showCamera, setShowCamera] = useState(false)
  const cameraSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  const handlePhotoPicked = async (file: Blob | undefined) => {
    if (!file) return
    const named = file instanceof File ? file : new File([file], 'camera.jpg', { type: 'image/jpeg' })
    const ok = await photo.captureFromFile(named, null)
    if (ok) {
      // Fire-and-forget: the enriched item lands in the inbox via realtime.
      setTimeout(() => { photo.reset(); handleClose() }, 1600)
    }
  }

  // Parser context — memoized so useQuickParse's parse memo stays stable
  const parserCtx = useMemo(
    () => ({ projects, contacts, familyMembers }),
    [projects, contacts, familyMembers],
  )

  // Parsing + override state lives in useQuickParse
  const qp = useQuickParse(title, parserCtx)
  const {
    effectiveParsed,
    contactName,
    resetOverrides,
    clearContact,
    clearDate,
    clearDuration,
    clearCategory,
    clearContext,
    clearAssignment,
    applyContext,
  } = qp

  const handleOpen = () => {
    setIsClosing(false)
    if (onOpen) {
      onOpen()
    } else {
      setInternalIsOpen(true)
    }
  }

  const handleClose = () => {
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

  // Focus input when modal opens, and run the one-tick entrance animation.
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting on modal open is valid
      setTitle('')
      resetOverrides()
      // Mount in the offscreen state, then flip to the on-screen state on
      // the next animation frame so the CSS transition has a starting point
      // to interpolate from. Without this, mobile mounts already at
      // translate-y-0 and the slide-up is invisible.
      setIsEntering(true)
      requestAnimationFrame(() => setIsEntering(false))
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // No idle auto-close: a modal that silently dismisses itself leaks the
  // user's next keystrokes to whatever global hotkey surface is underneath
  // (Inbox Focus mode binds d=delete, c=complete, 1-4=triage). Closing is
  // always explicit: Escape, ✕, click-outside, or a navigating submit.

  // An empty box shows no preview even when a domain is still applied (the
  // sticky domain survives a rapid-entry submit) — otherwise the card renders
  // around an empty title. The chip reappears the moment there is text again,
  // which is well before anything can be submitted.
  const showPreview = title.trim().length > 0 && qp.hasFields

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

    const hasRichFields = hasParsedFields(effectiveParsed)

    if (useRaw && effectiveParsed.context && onAddRich) {
      // "Add to My Inbox" discards what the PARSER inferred (dates, contacts,
      // projects) — but a context is never inferred: the user either tapped a
      // domain chip or typed the reserved token. Dropping it here would throw
      // away the one field they set by hand. Keep the raw text as the title,
      // minus the token itself if that is where the context came from.
      onAddRich({
        title: effectiveParsed.contextMatch
          ? trimmed.replace(effectiveParsed.contextMatch, '').replace(/\s+/g, ' ').trim()
          : trimmed,
        context: effectiveParsed.context,
      })
    } else if (useRaw || (!hasRichFields)) {
      // Plain inbox add (current behavior)
      onAdd(trimmed)
    } else if (onAddRich) {
      // Rich add with parsed fields. context is undefined unless the user
      // explicitly applied one (the "Add to X?" chip, or clearContext/applyContext) —
      // captures never inherit the domain lens.
      onAddRich({
        title: effectiveParsed.title,
        projectId: effectiveParsed.projectId,
        contactId: effectiveParsed.contactId,
        scheduledFor: effectiveParsed.dueDate,
        durationMinutes: effectiveParsed.durationMinutes,
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

    // Reset and refocus for rapid entry — but the domain STAYS. Entering a run
    // of captures ("permission slip", "soccer cleats", "call the dentist") is
    // one train of thought in one domain; re-picking it per item was the whole
    // complaint. It is the user's own pick from seconds ago, not a guess, and
    // the chip stays on screen with its ×. Closing the box clears it
    // (handleClose and the open effect both resetOverrides), so a capture run
    // can never leak its domain into tomorrow's.
    const stickyContext = effectiveParsed.context
    setTitle('')
    resetOverrides()
    if (stickyContext) applyContext(stickyContext)
    inputRef.current?.focus()
  }

  const handleAskSymphony = () => {
    const trimmed = title.trim()
    if (!trimmed || !onAskSymphony) return
    onAskSymphony(trimmed)
    handleClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // ⌥1/⌥2/⌥3 file the capture without reaching for the mouse. Live even once
    // a domain is applied, so ⌥2 re-files a Work capture as Family.
    const hotkeyDomain = domainForHotkey(e)
    if (hotkeyDomain) {
      e.preventDefault()
      applyContext(hotkeyDomain)
      return
    }
    if (e.key === 'Escape') {
      handleClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if ((e.metaKey || e.ctrlKey) && onAskSymphony) {
        // ⌘Enter = hand the raw text to the Symphony assistant
        handleAskSymphony()
      } else if (e.shiftKey) {
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
          style={{ bottom: `calc(${MOBILE_TAB_BAR_HEIGHT} + env(safe-area-inset-bottom, 0px))` }}
          aria-label="Quick add task"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2v-6z" />
          </svg>
        </button>
      )}

      {/* Modal Overlay — bottom sheet on mobile, centered modal on desktop. */}
      {isOpen && (
        <div
          className={`fixed inset-0 z-50 bg-black/40 flex items-end justify-center md:items-center transition-opacity duration-200 ${
            isClosing ? 'opacity-0' : 'opacity-100'
          }`}
          onClick={handleClose}
        >
          {/* Sheet / Modal Content */}
          <div
            data-testid="quick-capture-sheet"
            className={`
              bg-bg-elevated shadow-xl
              w-full md:w-1/2 md:max-w-lg
              rounded-t-3xl md:rounded-2xl
              p-6
              transform transition-transform duration-200 md:transition-all
              motion-reduce:transition-none
              ${isClosing || isEntering
                ? 'translate-y-full md:translate-y-0 md:opacity-0 md:scale-95'
                : 'translate-y-0 md:opacity-100 md:scale-100'}
            `}
            // p-6 sets uniform 1.5rem padding; this inline paddingBottom
            // wins on notch devices (safe-area-inset-bottom > 1.5rem) and
            // is a no-op everywhere else. Intentional asymmetry on iOS so
            // the form clears the home indicator without a separate
            // safe-bottom utility.
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle — mobile only, decorative (no swipe-to-dismiss yet) */}
            <div
              data-testid="drag-handle"
              aria-hidden
              className="md:hidden mx-auto w-10 h-1.5 rounded-full bg-neutral-200 mb-3"
            />
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
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder='Try "call the vet tomorrow 2pm"'
                  className="w-full pl-4 pr-14 py-3 rounded-xl border border-neutral-200 bg-neutral-50
                             text-neutral-800 placeholder:text-neutral-400 text-lg md:text-2xl font-display
                             focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <DictationMicButton
                  onTranscript={(text) => setTitle((prev) => (prev ? prev.trimEnd() + ' ' : '') + text)}
                  title="Dictate into this field"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9"
                />
              </div>

              {/* Syntax teaching hint — shown until the parser has something to preview */}
              {!showPreview && !title.trim() && (
                <p className="text-xs text-neutral-400 px-1">
                  Dates, times, and types are understood as you type — try
                  {' '}<span className="text-neutral-500">"pay camp deposit friday"</span>,
                  {' '}<span className="text-neutral-500">"event: dentist thu 2pm 45m"</span>, or
                  {' '}<span className="text-neutral-500">"#porch buy lumber"</span>
                </p>
              )}

              {/* Photo capture — live camera (Continuity Camera lists the
                  iPhone as a device on macOS); file picker as fallback. */}
              {!title.trim() && (
                <div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      void handlePhotoPicked(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => (cameraSupported ? setShowCamera(true) : photoInputRef.current?.click())}
                    disabled={photo.status === 'working'}
                    className="w-full flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-60 transition-colors"
                  >
                    <Camera className="w-4 h-4 shrink-0 text-primary-600" />
                    <span className="flex-1 text-left">
                      {photo.status === 'working'
                        ? 'Uploading photo…'
                        : photo.status === 'started'
                        ? 'On it — the analyzed item will appear in your inbox'
                        : photo.status === 'error'
                        ? `Photo capture failed: ${photo.error}`
                        : 'Snap a photo of a thing — AI identifies it and files it'}
                    </span>
                  </button>
                </div>
              )}

              {showCamera && (
                <CameraCaptureModal
                  onCapture={(blob) => { setShowCamera(false); void handlePhotoPicked(blob) }}
                  onPickFile={() => { setShowCamera(false); photoInputRef.current?.click() }}
                  onClose={() => setShowCamera(false)}
                />
              )}

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
                        <TaskKindBadge title={effectiveParsed.title} category={effectiveParsed.category} label />
                        <span className="font-medium">"{effectiveParsed.title}"</span>
                      </div>
                    </>
                  )}

                  {/* Parsed-field chips: date/time, contact, category, applied context; assignment/priority/suggested-context chips follow inline after this group */}
                  <ParsedFieldChips
                    parsed={effectiveParsed}
                    contactName={contactName}
                    onClearDate={clearDate}
                    onClearContact={clearContact}
                    onClearCategory={clearCategory}
                    onClearContext={clearContext}
                    onClearDuration={clearDuration}
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

                </div>
              )}

              {/* Domain picker — the same chips as the Inbox's "Where does this
                  belong?" gate, so filing a capture and filing an inbox item
                  look like one gesture. It sits OUTSIDE the parsed-preview card
                  on purpose: the preview only appears once something parsed, and
                  the plainest capture ("buy milk") is exactly the one that most
                  needs a domain. The predecessor — a single "Add to X?" chip —
                  appeared only when exactly one layer was checked, so with
                  Everyone on there was no way to tag at all. Typing the reserved
                  token (#work) sets context too, which swaps this row for the
                  applied chip in the preview above.

                  The wrapper's preventDefault keeps the caret in the input: a
                  bare mousedown on a chip would blur it and break the type →
                  tag → Enter run. */}
              {title.trim().length > 0 && !effectiveParsed.isNote && !effectiveParsed.context && (
                <div
                  className="flex items-center gap-2 flex-wrap px-1 pt-3"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <span className="text-base"><ConceptIcon name="context" size={18} decorative /></span>
                  <span className="text-xs text-neutral-400">Add to</span>
                  <DomainChooser
                    size="sm"
                    shortcuts
                    onChoose={(d) => { applyContext(d); inputRef.current?.focus() }}
                  />
                </div>
              )}

              {/* Unibox: inline search results for the current text */}
              {resultsSlot && title.trim().length >= 2 && resultsSlot(title.trim(), handleClose)}

              {/* Unibox: escalate to the Symphony assistant */}
              {onAskSymphony && title.trim() && (
                <button
                  type="button"
                  onClick={handleAskSymphony}
                  className="w-full flex items-center gap-2 rounded-xl border border-primary-100 bg-primary-50/60 px-4 py-3 text-sm text-primary-700 hover:bg-primary-50 transition-colors"
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left truncate">Ask Symphony to set this up: “{title.trim()}”</span>
                  <kbd className="hidden md:inline px-1.5 py-0.5 bg-white/70 text-primary-500 rounded text-xs font-mono">⌘↵</kbd>
                </button>
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
                  {effectiveParsed.isNote
                    ? 'Save Note'
                    : !showPreview
                    ? 'Add to My Inbox'
                    : effectiveParsed.category === 'event' && effectiveParsed.dueDate
                    ? 'Create Event'
                    : effectiveParsed.dueDate
                    ? 'Schedule Task'
                    : 'Save Task'}
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
