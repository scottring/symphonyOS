import { useState, useRef, useEffect } from 'react'
import { Square, Calendar, Repeat, X } from 'lucide-react'

export type CreateType = 'task' | 'event' | 'routine'

interface SlotQuickCreatePopoverProps {
  /** Anchor position in viewport coords (top, left of the slot). */
  anchorRect: { top: number; left: number; width: number; height: number }
  startTime: Date
  endTime: Date
  onCreate: (params: { type: CreateType; title: string; startTime: Date; endTime: Date }) => void
  onCancel: () => void
}

export function SlotQuickCreatePopover({
  anchorRect,
  startTime,
  endTime,
  onCreate,
  onCancel,
}: SlotQuickCreatePopoverProps) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<CreateType>('task')
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Click-outside to cancel
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onCancel()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onCancel])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    onCreate({ type, title: trimmed, startTime, endTime })
  }

  // Position: right of the slot if room, else left. Default below the slot.
  const popoverStyle: React.CSSProperties = {
    position: 'fixed',
    top: anchorRect.top,
    left: Math.min(anchorRect.left + anchorRect.width + 8, window.innerWidth - 320),
    width: 300,
    zIndex: 60,
  }

  const timeLabel = formatTimeRange(startTime, endTime)

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Create new item"
      style={popoverStyle}
      className="bg-white rounded-xl border border-neutral-200 shadow-xl p-3"
    >
      <form onSubmit={handleSubmit}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">{timeLabel}</p>
          <button
            type="button"
            onClick={onCancel}
            className="text-neutral-400 hover:text-neutral-600 p-0.5"
            aria-label="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onCancel()
            }
          }}
          placeholder="Title"
          className="w-full px-2 py-1.5 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-300 mb-2"
        />
        <div className="flex items-center gap-1 mb-2">
          <TypeButton
            active={type === 'task'}
            onClick={() => setType('task')}
            icon={<Square className="w-3.5 h-3.5" />}
            label="Task"
          />
          <TypeButton
            active={type === 'event'}
            onClick={() => setType('event')}
            icon={<Calendar className="w-3.5 h-3.5" />}
            label="Event"
          />
          <TypeButton
            active={type === 'routine'}
            onClick={() => setType('routine')}
            icon={<Repeat className="w-3.5 h-3.5" />}
            label="Routine"
          />
        </div>
        {type === 'routine' && (
          <p className="text-[11px] text-neutral-500 mb-2">
            Routines need a recurrence pattern. Clicking Create will open the Routines page so
            you can finish.
            {/* Phase 4b.X: wire RoutineForm modal with time pre-fill */}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-[12px] px-3 py-1 text-neutral-500 hover:text-neutral-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim()}
            className="text-[12px] px-3 py-1 bg-primary-500 text-white rounded-md disabled:opacity-40 hover:bg-primary-600 transition-colors"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  )
}

function TypeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[12px] transition-colors ${
        active ? 'bg-primary-50 text-primary-700' : 'text-neutral-500 hover:bg-neutral-100'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function formatTimeRange(start: Date, end: Date): string {
  const startStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const endStr = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const dayStr = start.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  return `${dayStr} · ${startStr}–${endStr}`
}
