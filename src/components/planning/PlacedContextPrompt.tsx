import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { TaskContext } from '@/types/task'
import { ContextMenuPanel } from '@/components/triage/ContextMenuPanel'

/** After a context-less task lands on a grid: the same Work/Family/Personal
 *  menu used everywhere else, anchored at the drop. Dismiss = stays placed,
 *  stays untagged — exactly like skipping triage. The write path is the
 *  caller's ordinary context update, so scope derivation (work/personal =
 *  owner-only) rides along untouched. */
export function PlacedContextPrompt({ position, onPick, onDismiss }: {
  position: { left: number; top: number }
  onPick: (ctx: TaskContext) => void
  onDismiss: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onDismiss])

  // Clamp so a drop near the right/bottom edge doesn't push the menu offscreen.
  const left = Math.max(8, Math.min(position.left, window.innerWidth - 180))
  const top = Math.max(8, Math.min(position.top, window.innerHeight - 220))

  return createPortal(
    <div
      ref={ref}
      style={{ left, top }}
      className="fixed z-[9999] bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[150px] animate-fade-in-up"
    >
      <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
        Which area is this?
      </p>
      <ContextMenuPanel
        value={null}
        onSelect={(ctx) => { if (ctx) onPick(ctx) }}
        allowClear={false}
      />
    </div>,
    document.body,
  )
}
