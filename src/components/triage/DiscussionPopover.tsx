import { useEffect, useRef } from 'react'

interface DiscussionPopoverProps {
  flagged: boolean
  note: string
  onChange: (next: { flagged: boolean; note: string }) => void
  onClose: () => void
}

/**
 * The "needs discussion" panel body, with no trigger of its own.
 *
 * Split out of DiscussionPicker so the row's '...' menu can open it as a menu
 * item — the same shape WaitingForPopover already has. DiscussionPicker still
 * wraps it with the icon trigger for the inbox cards.
 */
export function DiscussionPopover({ flagged, note, onChange, onClose }: DiscussionPopoverProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
          onChange={(e) => onChange({ flagged: e.target.checked, note })}
          className="rounded"
        />
        <span>Needs discussion</span>
      </label>
      <textarea
        ref={textareaRef}
        value={note}
        onChange={(e) => {
          // If user starts typing in an unflagged state, auto-flag.
          const nextFlagged = flagged || e.target.value.length > 0
          onChange({ flagged: nextFlagged, note: e.target.value })
        }}
        placeholder="What's the question?"
        rows={3}
        className={`w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-200
                   focus:outline-none focus:ring-2 focus:ring-primary-500 ${flagged ? '' : 'opacity-60'}`}
      />
      {flagged && (
        <>
          <div className="border-t border-neutral-100 my-2" />
          <button
            onClick={() => {
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
