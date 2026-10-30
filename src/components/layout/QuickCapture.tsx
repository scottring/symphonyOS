import { useState, useRef, useEffect, useMemo, type ReactNode } from 'react'
import { Sparkles, Camera, NotebookPen, StickyNote, Mic, FileText, Scan } from 'lucide-react'
import { usePhotoCapture, type CaptureKind, type CaptureEvent, type PhotoCaptureResult } from '@/hooks/usePhotoCapture'
import { formatEventWhen, matchMembers } from '@/lib/capture/captureEvents'
import type { DomainId } from '@/lib/domains'
import { DOMAINS } from '@/lib/domains'
import { CameraCaptureModal } from '@/components/capture/CameraCaptureModal'
import { hasParsedFields, allDayFromParse } from '@/lib/quickInputParser'
import type { TaskCategory, TaskContext } from '@/types/task'
import { DomainChooser } from '@/components/domain/DomainChooser'
import { domainForHotkey } from '@/lib/domainHotkey'
import { useQuickParse } from '@/hooks/useQuickParse'
import { destinationLine, captureConfirmation } from '@/lib/capture/destination'
import { showToast } from '@/hooks/useToast'
import { useNavigate } from 'react-router-dom'
import { ParsedFieldChips } from '@/components/capture/ParsedFieldChips'
import { ConceptIcon } from '@/lib/conceptIcons'
import { DictationMicButton } from '@/components/common/DictationMicButton'
import { MOBILE_TAB_BAR_HEIGHT } from '@/shell/mobileChrome'
import { TaskKindBadge } from '@/components/task/TaskKindBadge'
import { isDesktopShell, requestDesktopScreenshot } from '@/lib/desktop'
import type { RecurrencePattern } from '@/types/actionable'

interface QuickCaptureProps {
  onAdd: (title: string) => void
  // Rich add with parsed fields
  onAddRich?: (data: {
    title: string
    projectId?: string
    contactId?: string
    scheduledFor?: Date
    /** A date with no time (chrono was uncertain of the hour) lands all-day. */
    isAllDay?: boolean
    durationMinutes?: number
    category?: TaskCategory
    context?: TaskContext
    assignedMemberIds?: string[]
    /** "every tuesday and thurs" — a calendar series for an event, a routine otherwise. */
    recurrence?: RecurrencePattern
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
  /** Keep the floating + beside an open side panel, clear of its controls. */
  rightInset?: number
  /** Talk to Symphony (live voice): the box's mic starts a conversation,
   *  which continues in the conversation bar. Without it, the mic dictates. */
  onTalk?: () => void
  /** Unibox: render inline search results for the current text (mounted only
   *  while open, so data subscriptions stay lazy). `close` dismisses the modal. */
  resultsSlot?: (query: string, close: () => void) => ReactNode
  /** Unibox: escalate the raw text to the Symphony assistant (⌘↵ or the row). */
  onAskSymphony?: (text: string) => void
  /** The calendar an EVENT would be written to for a life area (null = the
   *  primary calendar). Lets the destination line name it before Enter. */
  eventCalendarName?: (context: TaskContext | null) => string | null
  /** Photograph a written plan and place its items. Lives in Add so the phone
   *  Today header stays light (Scott, 2026-09-22). */
  onPlanFromPaper?: () => void
  /** Photograph a school paper onto the kitchen wall (spec 2026-10-20). */
  onSchoolPaper?: () => void
  /**
   * The host confirms each capture itself, AFTER its write settles. Then this
   * component's own toast — shown before the write, so a failed save read
   * "Added" beside "Failed to add task" — is a second notification for one
   * capture (S3-12), and it stays quiet.
   */
  confirmsAfterWrite?: boolean
  /** Post the text to the kitchen wall's scratchpad instead — a note or a
   *  thing to talk about. Resolves true once it is saved. */
  onAddToScratchpad?: (text: string, kind: 'note' | 'talk') => Promise<boolean>
  /** Put the events read off a picture on the calendar and retire its Inbox
   *  row. Each event carries the household members it names. Resolves true
   *  once they are saved; on false the picture stays in the Inbox. */
  onAddCaptureEvents?: (
    capture: PhotoCaptureResult,
    events: Array<CaptureEvent & { assignedMemberIds: string[] }>,
    context: DomainId | null,
  ) => Promise<boolean>
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
  rightInset = 0,
  onTalk,
  resultsSlot,
  onAskSymphony,
  eventCalendarName,
  onPlanFromPaper,
  onSchoolPaper,
  confirmsAfterWrite = false,
  onAddToScratchpad,
  onAddCaptureEvents,
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
  const navigate = useNavigate()

  // Photo-first capture: live camera → AI-enriched inbox task. On macOS,
  // Continuity Camera lists the iPhone as a camera device, making the phone
  // the desktop's camera. The file picker remains as the fallback.
  const photo = usePhotoCapture()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [showCamera, setShowCamera] = useState(false)
  const cameraSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  // The picture being sent, shown small while it goes (photo, screenshot,
  // paste or drop — one path for all of them).
  const [shotPreview, setShotPreview] = useState<string | null>(null)
  useEffect(() => () => { if (shotPreview) URL.revokeObjectURL(shotPreview) }, [shotPreview])
  // Events read off the picture, offered before anything is put on a calendar.
  const [found, setFound] = useState<{ result: PhotoCaptureResult; kind: CaptureKind; skipped: Set<number>; area: DomainId | null } | null>(null)
  const [addingEvents, setAddingEvents] = useState(false)
  const [shotHint, setShotHint] = useState(false)
  const handlePhotoPicked = async (file: Blob | undefined, kind: CaptureKind = 'photo') => {
    if (!file) return
    setShotHint(false)
    const named = file instanceof File ? file : new File([file], 'camera.jpg', { type: 'image/jpeg' })
    setShotPreview(URL.createObjectURL(named))
    const result = await photo.captureFromFile(named, null, kind)
    if (result?.events.length && onAddCaptureEvents) {
      // Scheduled things wait here as a card to approve (Scott, 2026-10-30).
      // A named household member files them under Family until changed.
      const namesSomeone = result.events.some((e) => matchMembers(e.who, familyMembers).length > 0)
      // Already on a calendar (Gmail adds flights itself) starts unticked.
      const skipped = new Set(result.events.flatMap((e, i) => (e.existing ? [i] : [])))
      setFound({ result, kind, skipped, area: namesSomeone ? 'family' : null })
    } else if (result) {
      // Nothing scheduled: the enriched item lands in the inbox via realtime.
      setTimeout(() => { photo.reset(); setShotPreview(null); handleClose() }, 1600)
    }
  }

  const chosenEvents = found ? found.result.events.filter((_, i) => !found.skipped.has(i)) : []
  const handleAddEvents = async () => {
    if (!found || !onAddCaptureEvents || !chosenEvents.length) return
    setAddingEvents(true)
    const ok = await onAddCaptureEvents(
      found.result,
      chosenEvents.map((e) => ({ ...e, assignedMemberIds: matchMembers(e.who, familyMembers) })),
      found.area,
    )
    setAddingEvents(false)
    if (ok) { photo.reset(); setShotPreview(null); handleClose() }
  }
  const handleKeepInInbox = () => {
    showToast('In your Inbox', 'success')
    photo.reset(); setShotPreview(null); handleClose()
  }

  // Screenshot: the Mac app hides, macOS's crosshair picks a region, and the
  // picture comes back here. A browser (or an older Mac app) can't do that, so
  // the tile says how to paste one instead.
  const showScreenshot = isDesktopShell()
    || (typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches)
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
  const handleScreenshot = async () => {
    setShotHint(false)
    const shot = await requestDesktopScreenshot()
    if (shot.status === 'ok') void handlePhotoPicked(shot.file, 'screenshot')
    else if (shot.status === 'unsupported') setShotHint(true)
    else if (shot.status === 'error') showToast(`Couldn’t take the screenshot: ${shot.message}`, 'error')
    inputRef.current?.focus()
  }

  // Paste or drop an image anywhere in the box. A clipboard that also carries
  // text (a copied spreadsheet cell, a web page) is a text paste.
  const imageFrom = (data: DataTransfer | null) =>
    Array.from(data?.files ?? []).find((f) => f.type.startsWith('image/'))
  const [dragOver, setDragOver] = useState(false)

  // Parser context — memoized so useQuickParse's parse memo stays stable
  // ⌘K can act on a recurrence (series / routine), so it opts in.
  const parserCtx = useMemo(
    () => ({ projects, contacts, familyMembers, recurrence: true }),
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
    clearRecurrence,
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
      setShotHint(false)
      setFound(null)
      setIsClosing(false)
      if (onClose) {
        onClose()
      } else {
        setInternalIsOpen(false)
      }
    }, 200) // Match the animation duration
  }

  // Return focus to whatever opened the modal (the Add button, a row) when it
  // closes — unless the close handed focus somewhere on purpose (a result
  // opening its detail panel).
  const openerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!isOpen) return
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      const opener = openerRef.current
      const active = document.activeElement
      const focusLost = !active || active === document.body || !active.isConnected
      if (focusLost && opener?.isConnected && opener !== document.body) opener.focus({ preventScroll: true })
    }
  }, [isOpen])

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
        isAllDay: allDayFromParse(effectiveParsed),
        durationMinutes: effectiveParsed.durationMinutes,
        category: effectiveParsed.category,
        context: effectiveParsed.context,
        assignedMemberIds: effectiveParsed.assignedMemberIds,
        recurrence: effectiveParsed.recurrence,
      })
    } else {
      // Fallback if onAddRich not provided
      onAdd(trimmed)
    }

    // Say where it went, with one link there. The fly-away animation below has
    // no destination unless you happen to be on Today, so before this a capture
    // made from anywhere else confirmed nothing at all (walk finding S1-07).
    if (!confirmsAfterWrite) {
      const when = useRaw ? null : effectiveParsed.dueDate ?? null
      const today = new Date()
      const confirmation = captureConfirmation({
        kind: isInboxAdd ? 'inbox' : 'dated',
        context: effectiveParsed.context,
        when,
        isToday: !!when && when.toDateString() === today.toDateString(),
      })
      showToast(confirmation.message, 'success', 5000, {
        label: confirmation.linkLabel,
        onClick: () => { navigate(confirmation.route) },
      })
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

  const handleScratchpad = async (kind: 'note' | 'talk') => {
    const trimmed = title.trim()
    if (!trimmed || !onAddToScratchpad) return
    const ok = await onAddToScratchpad(trimmed, kind)
    if (ok) {
      showToast(kind === 'talk' ? 'On the wall to talk about' : 'On the wall’s scratchpad', 'success')
      handleClose()
    } else {
      showToast('Couldn’t reach the wall’s scratchpad — try again', 'error')
    }
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
      e.preventDefault()
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
      {/* Floating Action Button — desktop capture, kept clear of the side panel */}
      {showFab && (
        <button
          onClick={handleOpen}
          className="fixed right-5 w-14 h-14 bg-primary-500 text-white rounded-full shadow-lg shadow-primary-500/30
                     flex items-center justify-center
                     hover:bg-primary-600 active:bg-primary-700 active:scale-95
                     transition-all z-50"
          style={{ right: `calc(1.25rem + ${rightInset}px)`, bottom: `calc(${MOBILE_TAB_BAR_HEIGHT} + env(safe-area-inset-bottom, 0px))` }}
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-capture-title"
            // Escape closes from anywhere in the modal (the photo button, a
            // chip, Close) — not only from the text field.
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); handleClose() }
            }}
            onPaste={(e) => {
              if (e.clipboardData.types.includes('text/plain')) return
              const image = imageFrom(e.clipboardData)
              if (image) { e.preventDefault(); void handlePhotoPicked(image, 'image') }
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('Files')) return
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false) }}
            onDrop={(e) => {
              setDragOver(false)
              const image = imageFrom(e.dataTransfer)
              if (image) { e.preventDefault(); void handlePhotoPicked(image, 'image') }
            }}
            className={`
              bg-bg-elevated shadow-xl
              ${dragOver ? 'ring-2 ring-primary-500 ring-offset-2' : ''}
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
              <h2 id="quick-capture-title" aria-label="Quick Add" className="font-display text-[24px] text-neutral-900 md:font-sans md:text-lg md:font-semibold md:text-neutral-800">
                {/* The phone's dock + opens this as "Add", as the native sheet. */}
                <span className="md:hidden">Add</span><span className="hidden md:inline">Quick Add</span>
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

            {found && (
              <div className="space-y-4">
                <div role="group" aria-label="Events from this picture" className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    {shotPreview && (
                      <img src={shotPreview} alt="" className="w-[72px] h-12 shrink-0 rounded-md border border-neutral-200 object-cover" />
                    )}
                    <p className="text-sm font-medium text-neutral-800">
                      From this {found.kind === 'image' ? 'picture' : found.kind} — {found.result.events.length} {found.result.events.length === 1 ? 'event' : 'events'}
                    </p>
                  </div>
                  <ul className="divide-y divide-neutral-200">
                    {found.result.events.map((e, i) => {
                      const who = matchMembers(e.who, familyMembers)
                        .map((id) => familyMembers.find((m) => m.id === id)?.name)
                        .filter(Boolean)
                        .join(', ')
                      return (
                        <li key={i}>
                          <label className="flex items-start gap-3 py-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!found.skipped.has(i)}
                              onChange={() => setFound((f) => {
                                if (!f) return f
                                const skipped = new Set(f.skipped)
                                if (skipped.has(i)) skipped.delete(i); else skipped.add(i)
                                return { ...f, skipped }
                              })}
                              className="mt-0.5 h-4 w-4 rounded border-neutral-300 accent-primary-600 focus:ring-primary-500"
                            />
                            <span className="min-w-0">
                              <span className="block text-sm text-neutral-800">{e.title}</span>
                              <span className="block text-xs text-neutral-500">
                                {formatEventWhen(e)}{who ? ` · ${who}` : ''}
                              </span>
                              {e.existing && (
                                <span className="block text-xs text-amber-700">
                                  Already on {e.existing.calendarName ?? 'your calendar'} as “{e.existing.title}”
                                </span>
                              )}
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                  <div role="group" aria-label="Calendar" className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-xs text-neutral-400 mr-1">Calendar</span>
                    {DOMAINS.map(({ id, label, icon: Icon, color }) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={found.area === id}
                        onClick={() => setFound((f) => (f ? { ...f, area: f.area === id ? null : id } : f))}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                          found.area === id ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color }} />{label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-neutral-500">
                    The printed details, links and the {found.kind === 'image' ? 'picture' : found.kind} go on each event.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleKeepInInbox}
                    className="flex-1 touch-target py-3 rounded-xl border border-neutral-200 text-neutral-600 font-medium hover:bg-neutral-50 transition-colors"
                  >
                    Just put it in my Inbox
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAddEvents()}
                    disabled={!chosenEvents.length || addingEvents}
                    className="flex-1 touch-target py-3 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-600 active:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {addingEvents ? 'Adding…' : `Add ${chosenEvents.length} ${chosenEvents.length === 1 ? 'event' : 'events'}`}
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" hidden={!!found}>
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  aria-label="Add a task, note or event"
                  placeholder='Try "call the vet tomorrow 2pm"'
                  className={`w-full pl-4 ${onTalk ? 'pr-24' : 'pr-14'} py-3 rounded-xl border border-neutral-200 bg-neutral-50
                             text-neutral-800 placeholder:text-neutral-400 text-lg md:text-2xl font-display
                             focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
                />
                {onTalk ? (
                  // One front door (Scott, 2026-10-14): ⌘K adds, searches, asks — or
                  // talks. The conversation carries on in the bar at the page's foot.
                  <button
                    type="button"
                    onClick={onTalk}
                    title="Talk to Symphony (⌘⇧K)"
                    aria-label="Talk to Symphony"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-9 px-3 rounded-full inline-flex items-center gap-1.5
                               text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 active:bg-primary-200
                               focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <Mic className="w-4 h-4" aria-hidden="true" />Talk
                  </button>
                ) : (
                  <DictationMicButton
                    onTranscript={(text) => setTitle((prev) => (prev ? prev.trimEnd() + ' ' : '') + text)}
                    title="Dictate into this field"
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9"
                  />
                )}
              </div>

              {/* Syntax teaching hint — shown until the parser has something to preview */}
              {!showPreview && !title.trim() && (
                <p
                  className="text-xs text-neutral-400 px-1 -mt-1.5"
                  title={'Try "pay camp deposit friday", "event: dentist thu 2pm 45m", or "#porch buy lumber"'}
                >
                  Dates, times and types are understood as you type.
                </p>
              )}

              {/* The picture on its way — a photo, screenshot, paste or drop. */}
              {photo.status !== 'idle' && (
                <div
                  role="status"
                  className={`flex items-center gap-3 rounded-xl border p-2.5 ${
                    photo.status === 'error' ? 'border-red-100 bg-red-50' : 'border-primary-100 bg-primary-50'
                  }`}
                >
                  {shotPreview && (
                    <img src={shotPreview} alt="" className="w-[72px] h-12 shrink-0 rounded-md border border-neutral-200 object-cover" />
                  )}
                  <p className={`text-sm leading-snug ${photo.status === 'error' ? 'text-red-700' : 'text-primary-700'}`}>
                    {photo.status === 'error'
                      ? `Couldn’t read that picture: ${photo.error}`
                      : photo.status === 'working' ? 'Sending it…' : 'Reading it now'}
                    {photo.status !== 'error' && (
                      <span className="block text-xs text-neutral-500">It lands in your Inbox with a name and notes.</span>
                    )}
                  </p>
                </div>
              )}

              {/* Capture from a picture: one row of tiles (Scott, 2026-10-30).
                  The longer descriptions live in each tile's tooltip. */}
              {!title.trim() && photo.status !== 'working' && photo.status !== 'started' && (
                <div className="space-y-2">
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
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Capture from</p>
                  <div className="flex gap-2">
                    <CaptureTile
                      icon={Camera}
                      label="Photo"
                      title="Snap a photo of a thing — AI identifies it and files it"
                      onClick={() => (cameraSupported ? setShowCamera(true) : photoInputRef.current?.click())}
                    />
                    {showScreenshot && (
                      <CaptureTile
                        icon={Scan}
                        label="Screenshot"
                        title="Drag over part of your screen — AI reads it and files it"
                        onClick={() => void handleScreenshot()}
                      />
                    )}
                    {onPlanFromPaper && (
                      <CaptureTile
                        icon={NotebookPen}
                        label="Plan from paper"
                        title="Photograph your written plan"
                        onClick={() => { handleClose(); onPlanFromPaper() }}
                      />
                    )}
                    {onSchoolPaper && (
                      <CaptureTile
                        icon={FileText}
                        label="School paper"
                        title="A slip or form for the kitchen wall"
                        onClick={() => { handleClose(); onSchoolPaper() }}
                      />
                    )}
                  </div>
                  <p className="text-center text-xs text-neutral-400">
                    {shotHint
                      ? <>Take one with <kbd className="px-1 py-0.5 bg-neutral-100 text-neutral-500 rounded font-mono">{isMac ? '⌃⇧⌘4' : 'Win+Shift+S'}</kbd>, then press <kbd className="px-1 py-0.5 bg-neutral-100 text-neutral-500 rounded font-mono">{isMac ? '⌘V' : 'Ctrl+V'}</kbd> here</>
                      : 'or paste or drop an image'}
                  </p>
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
                    onClearRecurrence={clearRecurrence}
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

              {/* The kitchen wall's scratchpad: a note, or something to talk
                  about together (Scott, 2026-10-07). */}
              {onAddToScratchpad && title.trim() && (
                <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-600">
                  <StickyNote className="w-4 h-4 shrink-0 text-primary-600" />
                  <span className="flex-1 min-w-0">Put on the wall’s scratchpad</span>
                  <button type="button" onClick={() => void handleScratchpad('note')}
                    className="touch-target rounded-lg border border-neutral-200 bg-white px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-100">
                    Note
                  </button>
                  <button type="button" onClick={() => void handleScratchpad('talk')}
                    className="touch-target rounded-lg border border-neutral-200 bg-white px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-100">
                    Talk about
                  </button>
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
                  {effectiveParsed.isNote
                    ? 'Save Note'
                    : !showPreview
                    ? 'Add to My Inbox'
                    : effectiveParsed.category === 'event' && effectiveParsed.recurrence
                    ? 'Create Recurring Event'
                    : effectiveParsed.category === 'event' && effectiveParsed.dueDate
                    ? 'Create Event'
                    : effectiveParsed.recurrence
                    ? 'Create Routine'
                    : effectiveParsed.dueDate
                    ? 'Schedule Task'
                    : 'Save Task'}
                </button>
              </div>

              {/* Where this is about to go, and who will see it. Said BEFORE
                  Enter: a chip-less task lands Unsorted and a chip-less event
                  lands on the primary calendar, and neither used to say so
                  (Scott, 2026-09-20). Replaces the old "Private until you
                  share it", which was only true for two of the three areas. */}
              {title.trim() && (
                <p data-testid="capture-destination" className="text-center text-xs text-neutral-500 mt-3">
                  {destinationLine({
                    kind: effectiveParsed.isNote ? 'note'
                      : effectiveParsed.category === 'event' && effectiveParsed.dueDate ? 'event'
                      : effectiveParsed.recurrence ? 'routine'
                      : effectiveParsed.dueDate ? 'dated'
                      : 'inbox',
                    context: effectiveParsed.context ?? null,
                    when: effectiveParsed.dueDate,
                    calendarName: eventCalendarName?.(effectiveParsed.context ?? null) ?? null,
                  })}
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

function CaptureTile({ icon: Icon, label, title, onClick }: {
  icon: typeof Camera
  label: string
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex-1 min-w-0 flex flex-col items-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50
                 px-1.5 pt-3 pb-2.5 text-center text-[12.5px] leading-tight text-neutral-600
                 hover:bg-neutral-100 active:bg-neutral-200 transition-colors
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      <Icon className="w-5 h-5 shrink-0 text-primary-600" aria-hidden="true" />
      {label}
    </button>
  )
}
