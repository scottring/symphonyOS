import { useEffect, useRef, useState } from 'react'

interface DiscussionPopoverProps {
  flagged: boolean
  note: string
  onChange: (next: { flagged: boolean; note: string }) => void
  onClose: () => void
}

/** How long typing pauses before the note is saved. */
const SAVE_AFTER_MS = 600

/**
 * The "needs discussion" panel body, with no trigger of its own.
 *
 * Split out of DiscussionPicker so the row's '...' menu can open it as a menu
 * item — the same shape WaitingForPopover already has. DiscussionPicker still
 * wraps it with the icon trigger for the inbox cards.
 *
 * The note is a local draft (Scott, 2026-09-22: "the cursor lags the input
 * and causes overwriting previous characters"). Every keystroke used to be
 * written straight to the row and the textarea re-rendered from the row's
 * value as each write came back, so a fast typist raced the database. Now
 * the draft is what you see; it is saved after a pause in typing, on blur,
 * and when the popover closes. The saved value only replaces the draft while
 * the textarea is not being edited.
 */
export function DiscussionPopover({ flagged, note, onChange, onClose }: DiscussionPopoverProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState(note)
  const editing = useRef(false)
  // Typed since the last save — the only thing an unmount or blur saves.
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The latest values, for the unmount save (effects close over stale props).
  const latest = useRef({ draft, flagged, onChange })
  latest.current = { draft, flagged, onChange }

  // A save that arrived from elsewhere (another tab, the panel) replaces the
  // draft only while nobody is typing here.
  useEffect(() => { if (!editing.current && !dirty.current) setDraft(note) }, [note])

  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  const save = () => {
    clearTimer()
    if (!dirty.current) return
    dirty.current = false
    const { draft: d, flagged: f, onChange: emit } = latest.current
    // Typing into an unflagged item flags it.
    emit({ flagged: f || d.length > 0, note: d })
  }

  // Save whatever is pending when the popover goes away.
  useEffect(() => () => save(), []) // eslint-disable-line react-hooks/exhaustive-deps -- unmount only; `save` reads refs

  // Focus straight into the note when the item is already flagged — the only
  // reason to reopen a flagged item is to edit what the question was.
  useEffect(() => {
    if (flagged && textareaRef.current) textareaRef.current.focus()
  }, [flagged])

  return (
    <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg p-3 min-w-[260px]">
      <label className="flex items-center gap-2 text-sm text-neutral-700 mb-2">
        <input
          type="checkbox"
          checked={flagged}
          onChange={(e) => {
            clearTimer()
            dirty.current = false
            onChange({ flagged: e.target.checked, note: draft })
          }}
          className="rounded"
        />
        <span>Needs discussion</span>
      </label>
      <textarea
        ref={textareaRef}
        value={draft}
        onFocus={() => { editing.current = true }}
        onBlur={() => { editing.current = false; save() }}
        onChange={(e) => {
          setDraft(e.target.value)
          dirty.current = true
          clearTimer()
          timer.current = setTimeout(save, SAVE_AFTER_MS)
        }}
        placeholder="What's the question?"
        rows={3}
        className={`w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-200
                   focus:outline-none focus:ring-2 focus:ring-primary-500 ${flagged || draft.length > 0 ? '' : 'opacity-60'}`}
      />
      {flagged && (
        <>
          <div className="border-t border-neutral-100 my-2" />
          <button
            onClick={() => {
              clearTimer()
              dirty.current = false
              setDraft('')
              onChange({ flagged: false, note: '' })
              onClose()
            }}
            className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-red-50 text-red-600"
          >
            Clear
          </button>
        </>
      )}
    </div>
  )
}
