import { useEffect, useRef, useState } from 'react'

interface Props {
  entryCount: number
  weekLabel: string
  onConfirm: () => Promise<void>
}

export function ClearWeekButton({ entryCount, weekLabel, onConfirm }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const clearButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!confirming) return

    // Auto-focus the Clear button when dialog opens
    clearButtonRef.current?.focus()

    // Escape-key listener to close dialog
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConfirming(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [confirming])

  if (entryCount === 0) return null

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className="text-[12px] uppercase tracking-[0.18em] text-neutral-400 hover:text-accent-500 transition-colors"
      >
        Clear week
      </button>
      {confirming && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-week-dialog-title"
        >
          <div className="bg-bg-elevated rounded-2xl shadow-elevated max-w-sm w-full p-6">
            <h2 id="clear-week-dialog-title" className="font-display text-2xl text-neutral-800 mb-2">Clear the week?</h2>
            <p className="text-[14px] text-neutral-600 mb-5">
              This will remove all {entryCount} meal entries for the week of {weekLabel}. You'll have 30 minutes to undo.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirming(false)}
                className="px-4 py-2 text-[13px] text-neutral-500 hover:text-neutral-800"
              >
                Cancel
              </button>
              <button
                ref={clearButtonRef}
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try { await onConfirm() } finally { setBusy(false); setConfirming(false) }
                }}
                className="px-4 py-2 text-[13px] rounded-lg bg-accent-500 text-white hover:bg-accent-600 disabled:opacity-50"
              >
                {busy ? 'Clearing…' : 'Clear week'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
